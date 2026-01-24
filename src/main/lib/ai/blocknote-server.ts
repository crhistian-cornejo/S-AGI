/**
 * Local HTTP Server for BlockNote AI
 *
 * Creates a local HTTP server in the main process to handle AI requests
 * from BlockNote's AI extension. This allows the renderer to use
 * DefaultChatTransport pointing to localhost.
 *
 * Optimizations:
 * - Keep-alive connections for reduced latency
 * - Streaming responses with proper buffering
 * - Efficient message processing
 * - Support for fast models (gpt-4o-mini, GLM-4.7-Flash)
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages } from "ai";
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from "@blocknote/xl-ai/server";
import log from "electron-log";
import { getSecureApiKeyStore } from "../auth/api-key-store";
import { getChatGPTAuthManager } from "../auth";
import type { AIProvider } from "@shared/ai-types";

let server: ReturnType<typeof createServer> | null = null;
let serverPort = 0;
let serverReadyPromise: Promise<number> | null = null;

// Cache OpenAI clients for better performance
const clientCache = new Map<string, ReturnType<typeof createOpenAI>>();

// Get provider from request headers or default
function getProviderFromHeaders(req: IncomingMessage): AIProvider {
  const provider = req.headers["x-ai-provider"] as string;
  if (
    provider === "zai" ||
    provider === "chatgpt-plus" ||
    provider === "openai"
  ) {
    return provider;
  }
  return "openai";
}

// Get model from request headers or default
function getModelFromHeaders(
  req: IncomingMessage,
  provider: AIProvider,
): string {
  const model = req.headers["x-ai-model"] as string;
  if (model) return model;
  // GPT-5-mini is fast and follows tool instructions well
  return provider === "zai" ? "GLM-4-Plus" : "gpt-5-mini";
}

async function getOpenAIClient(
  provider: AIProvider,
): Promise<ReturnType<typeof createOpenAI> | null> {
  const cacheKey = provider;

  // Check cache first
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const keyStore = getSecureApiKeyStore();

  if (provider === "chatgpt-plus") {
    const authManager = getChatGPTAuthManager();
    if (!authManager.isConnected()) {
      return null;
    }
    const token = authManager.getAccessToken();
    if (!token) return null;

    const client = createOpenAI({
      apiKey: token,
      baseURL: "https://chatgpt.com/backend-api/v1",
    });
    // Don't cache chatgpt-plus as token may expire
    return client;
  }

  if (provider === "zai") {
    const openaiKey = keyStore.getOpenAIKey();
    if (!openaiKey) return null;

    const client = createOpenAI({
      apiKey: openaiKey,
      baseURL: "https://api.z.ai/api/paas/v4/",
    });
    clientCache.set(cacheKey, client);
    return client;
  }

  const openaiKey = keyStore.getOpenAIKey();
  if (!openaiKey) return null;

  const client = createOpenAI({ apiKey: openaiKey });
  clientCache.set(cacheKey, client);
  return client;
}

// Clear client cache when API keys change
export function clearClientCache(): void {
  clientCache.clear();
  log.info("[AI Server] Client cache cleared");
}

async function handleAIRequest(req: IncomingMessage, res: ServerResponse) {
  const startTime = Date.now();

  // Set CORS and keep-alive headers for better performance
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-AI-Provider, X-AI-Model",
  );
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Keep-Alive", "timeout=30");

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
    // Read body efficiently
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
      res.end(
        JSON.stringify({ error: `No API key configured for ${provider}` }),
      );
      return;
    }

    const model = openai(modelId);

    // Use BlockNote's document format helpers with optimized settings
    const result = streamText({
      model: model as any,
      system: aiDocumentFormats.html.systemPrompt,
      messages: await convertToModelMessages(
        injectDocumentStateMessages(messages),
      ),
      tools: toolDefinitionsToToolSet(toolDefinitions),
      toolChoice: "required",
      // Performance optimizations
      experimental_telemetry: { isEnabled: false }, // Disable telemetry for speed
    });

    // Pipe the UI message stream directly to the Node.js ServerResponse
    // Include CORS headers for local development
    result.pipeUIMessageStreamToResponse(res, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, X-AI-Provider, X-AI-Model",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no", // Disable nginx buffering if behind proxy
      },
    });

    // Log completion time after stream ends
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      log.info(`[AI Server] Request completed in ${duration}ms`);
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(`[AI Server] Error after ${duration}ms:`, error);

    // Only send error if headers not sent
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Internal server error",
        }),
      );
    }
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
      if (
        req.url === "/ai/streamText" ||
        req.url === "/ai/regular/streamText"
      ) {
        handleAIRequest(req, res);
      } else if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    // Enable keep-alive for better performance
    server.keepAliveTimeout = 30000; // 30 seconds
    server.headersTimeout = 35000; // Slightly longer than keep-alive

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
    serverReadyPromise = null;
    clientCache.clear();
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
