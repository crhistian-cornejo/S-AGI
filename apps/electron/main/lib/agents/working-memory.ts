import { tool } from "ai";
import { z } from "zod";
import {
  DEFAULT_TEMPLATE as DEFAULT_WORKING_MEMORY_TEMPLATE,
  formatWorkingMemory,
  getWorkingMemoryInstructions,
  type MemoryScope,
} from "@ai-sdk-tools/memory";
import {
  DEFAULT_WORKING_MEMORY_SCOPE,
  getWorkingMemoryProvider,
} from "../shared/working-memory";

const UPDATE_WORKING_MEMORY_SCHEMA = z.object({
  content: z
    .string()
    .min(1)
    .max(12000)
    .describe(
      "Updated working memory in markdown. Include stable user facts and preferences worth remembering.",
    ),
});

export const UPDATE_WORKING_MEMORY_TOOL_NAME = "updateWorkingMemory";

export function createAgentWorkingMemoryTool(context: {
  chatId?: string;
  userId?: string;
  scope?: MemoryScope;
}) {
  const workingMemoryProvider = getWorkingMemoryProvider();
  const scope = context.scope ?? DEFAULT_WORKING_MEMORY_SCOPE;

  return tool({
    description:
      "Save user preferences and durable facts to persistent working memory for future conversations.",
    inputSchema: UPDATE_WORKING_MEMORY_SCHEMA,
    execute: async ({ content }) => {
      if (!context.userId) {
        return {
          success: false,
          error: "Missing userId for memory update",
        };
      }

      try {
        await workingMemoryProvider.updateWorkingMemory({
          chatId: context.chatId,
          userId: context.userId,
          scope,
          content,
        });

        return {
          success: true,
          scope,
          storedCharacters: content.length,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update working memory";
        return {
          success: false,
          error: message,
        };
      }
    },
  });
}

export async function buildWorkingMemoryPromptAddition(context: {
  chatId?: string;
  userId?: string;
  scope?: MemoryScope;
}): Promise<string> {
  if (!context.userId) return "";

  const workingMemoryProvider = getWorkingMemoryProvider();
  const scope = context.scope ?? DEFAULT_WORKING_MEMORY_SCOPE;
  const instructions = getWorkingMemoryInstructions(
    DEFAULT_WORKING_MEMORY_TEMPLATE,
  );

  try {
    const workingMemory = await workingMemoryProvider.getWorkingMemory({
      chatId: context.chatId,
      userId: context.userId,
      scope,
    });

    if (!workingMemory) {
      return instructions;
    }

    return `${formatWorkingMemory(workingMemory)}\n\n${instructions}`;
  } catch {
    return instructions;
  }
}
