import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import log from "electron-log";
import { getSecureApiKeyStore } from "../../auth/api-key-store";
import { getChatGPTAuthManager } from "../../auth";
import { sendToRenderer } from "../../window-manager";
import type { AIProvider } from "@shared/ai-types";

async function getOpenAIClient(
  provider: AIProvider,
): Promise<ReturnType<typeof createOpenAI> | null> {
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

export const ideasRouter = router({
  /**
   * Generates text for the Ideas tab using streaming.
   * Chunks are emitted via IPC channel 'ideas:stream'.
   */
  generate: protectedProcedure
    .input(
      z.object({
        requestId: z.string(), // Unique ID to track this stream on frontend
        prompt: z.string(),
        context: z.string().optional(),
        provider: z.enum(["openai", "chatgpt-plus", "zai"]).default("openai"),
        modelId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { requestId, prompt, context, provider, modelId } = input;

      try {
        const openai = await getOpenAIClient(provider);
        if (!openai) {
           throw new Error(`No API key configured for ${provider}. Please add one in Settings.`);
        }

        let selectedModelId = modelId;
        if (!selectedModelId) {
            selectedModelId = provider === "zai" ? "GLM-4.7-Flash" : "gpt-5-mini";
        }
        
        const model = openai(selectedModelId);

        const systemPrompt = `You are a helpful AI writing assistant embedded in a block-based note editor. 
Your goal is to help the user write, edit, summarize, or expand on text.
Output DIRECT markdown content without conversational filler.
Use strictly markdown format supported by BlockNote.`;

        const messages: any[] = [
            { role: "system", content: systemPrompt },
        ];

        if (context) {
            messages.push({ role: "user", content: `Context from previous block:\n${context}\n\nCurrent block/Instruction: ${prompt}` });
        } else {
            messages.push({ role: "user", content: prompt });
        }

        const result = streamText({
          model: model as any,
          messages,
        });

        let fullText = "";
        for await (const delta of result.textStream) {
            fullText += delta;
            sendToRenderer("ideas:stream", { requestId, delta, isDone: false });
        }

        sendToRenderer("ideas:stream", { requestId, delta: "", isDone: true, fullText });
        return { success: true, text: fullText };

      } catch (error) {
        log.error("[IdeasRouter] Error generating text:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        sendToRenderer("ideas:stream", { requestId, error: errorMessage, isDone: true });
        throw error;
      }
    }),
});
