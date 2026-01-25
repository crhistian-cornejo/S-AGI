import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { streamText } from "ai";
import log from "electron-log";
import { sendToRenderer } from "../../window-manager";
import {
  getLanguageModel,
  getProviderStatus,
  isProviderAvailable,
} from "../../ai/providers";

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
        provider: z
          .enum(["openai", "chatgpt-plus", "zai", "claude"])
          .default("openai"),
        modelId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { requestId, prompt, context, provider, modelId } = input;

      try {
        if (!isProviderAvailable(provider)) {
          const status = getProviderStatus(provider);
          throw new Error(
            status.message ||
              `No credentials configured for ${provider}. Please update Settings.`,
          );
        }

        let selectedModelId = modelId;
        if (!selectedModelId) {
            selectedModelId =
              provider === "zai"
                ? "GLM-4.7-Flash"
                : provider === "claude"
                  ? "claude-haiku-4-5-20251001"
                  : "gpt-5-mini";
        }

        const model = getLanguageModel(provider, selectedModelId);

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
