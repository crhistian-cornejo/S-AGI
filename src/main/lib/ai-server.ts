/**
 * Local HTTP Server for BlockNote AI
 * 
 * Creates a local HTTP server in the main process to handle AI requests
 * from BlockNote's AI extension. This allows the renderer to use
 * DefaultChatTransport pointing to localhost.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages } from "ai";
import { 
  aiDocumentFormats, 
  injectDocumentStateMessages,
  toolDefinitionsToToolSet 
} from "@blocknote/xl-ai/server";
import log from "electron-log";
import { getSecureApiKeyStore } from "./auth/api-key-store";
import { getChatGPTAuthManager } from "./auth";
import type { AIProvider } from "@shared/ai-types";

let server: ReturnType<typeof createServer> | null = null;
let serverPort = 0;
let serverReadyPromise: Promise<number> | null = null;

// Get provider from request headers or default
function getProviderFromHeaders(req: IncomingMessage): AIProvider {
  const provider = req.headers["x-ai-provider"] as string;
  if (provider === "zai" || provider === "chatgpt-plus" || provider === "openai") {
    return provider;
  }
  return "openai";
}

// Get model from request headers or default
function getModelFromHeaders(req: IncomingMessage, provider: AIProvider): string {
  const model = req.headers["x-ai-model"] as string;
  if (model) return model;
  return provider === "zai" ? "GLM-4.7-Flash" : "gpt-5-mini";
}

async function getOpenAIClient(provider: AIProvider): Promise<ReturnType<typeof createOpenAI> | null> {
  const keyStore = getSecureApiKeyStore();

  if (provider === "chatgpt-plus") {
    const authManager = getChatGPTAuthManager();
    if (!authManager.isConnected()) {
      return null;
    }
    const token = authManager.getAccessToken();
    if (!token) return null;

    return createOpenAI({
      apiKey: token,
      baseURL: "https://chatgpt.com/backend-api/v1",
    });
  }

  if (provider === "zai") {
    const openaiKey = keyStore.getOpenAIKey();
    if (!openaiKey) return null;

    return createOpenAI({
      apiKey: openaiKey,
      baseURL: "https://api.z.ai/api/paas/v4/",
    });
  }

  const openaiKey = keyStore.getOpenAIKey();
  if (!openaiKey) return null;

  return createOpenAI({ apiKey: openaiKey });
}

async function handleAIRequest(req: IncomingMessage, res: ServerResponse) {
  // Set CORS headers for local requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-AI-Provider, X-AI-Model");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  try {
    // Read body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());

    const { messages, toolDefinitions } = body;

    const provider = getProviderFromHeaders(req);
    const modelId = getModelFromHeaders(req, provider);

    log.info(`[AI Server] Request - provider: ${provider}, model: ${modelId}`);

    const openai = await getOpenAIClient(provider);
    if (!openai) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: `No API key configured for ${provider}` }));
      return;
    }

    const model = openai(modelId);

    // Use BlockNote's document format helpers
    const result = streamText({
      model: model as any,
      system: aiDocumentFormats.html.systemPrompt,
      messages: await convertToModelMessages(
        injectDocumentStateMessages(messages)
      ),
      tools: toolDefinitionsToToolSet(toolDefinitions),
      toolChoice: "required",
    });

    // Stream the response using UI message stream format
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const stream = result.toUIMessageStreamResponse();
    const reader = stream.body?.getReader();
    
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    }

    res.end();

  } catch (error) {
    log.error("[AI Server] Error:", error);
    res.writeHead(500);
    res.end(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Internal server error" 
    }));
  }
}

export function startAIServer(): Promise<number> {
  if (serverReadyPromise) {
    return serverReadyPromise;
  }

  serverReadyPromise = new Promise((resolve, reject) => {
    if (server) {
      resolve(serverPort);
      return;
    }

    server = createServer((req, res) => {
      if (req.url === "/ai/streamText" || req.url === "/ai/regular/streamText") {
        handleAIRequest(req, res);
      } else if (req.url === "/health") {
        res.writeHead(200);
        res.end("OK");
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    // Find an available port
    server.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      if (address && typeof address === "object") {
        serverPort = address.port;
        log.info(`[AI Server] Started on http://127.0.0.1:${serverPort}`);
        resolve(serverPort);
      } else {
        reject(new Error("Failed to get server address"));
      }
    });

    server.on("error", (error) => {
      log.error("[AI Server] Error:", error);
      reject(error);
    });
  });

  return serverReadyPromise;
}

export function stopAIServer(): void {
  if (server) {
    server.close();
    server = null;
    serverPort = 0;
    log.info("[AI Server] Stopped");
  }
}

export function getAIServerPort(): number {
  return serverPort;
}

/**
 * Wait for the AI server to be ready and return the port.
 * This is useful for IPC handlers that need to wait for the server.
 */
export async function waitForAIServerReady(): Promise<number> {
  if (serverPort > 0) {
    return serverPort;
  }
  if (serverReadyPromise) {
    return serverReadyPromise;
  }
  // Server hasn't been started yet, start it now
  return startAIServer();
}
