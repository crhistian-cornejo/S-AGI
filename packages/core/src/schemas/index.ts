import { z } from "zod";

// ==================== Chat Schemas ====================
export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().uuid(),
  content: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export const chatSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  userId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  messageCount: z.number().int().min(0).default(0),
});

// ==================== Artifact Schemas ====================
export const artifactTypeEnum = z.enum([
  "spreadsheet",
  "chart",
  "document",
  "code",
]);
export type ArtifactType = z.infer<typeof artifactTypeEnum>;

export const artifactSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().uuid(),
  type: artifactTypeEnum,
  name: z.string().min(1).max(200),
  content: z.any(), // Complex data structure
  config: z.record(z.any()).optional(), // Additional configuration
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});

export const spreadsheetArtifactSchema = artifactSchema.extend({
  type: z.literal("spreadsheet"),
  content: z.object({
    sheets: z.array(
      z.object({
        name: z.string(),
        rows: z.number(),
        columns: z.number(),
        data: z.array(z.array(z.any())),
      }),
    ),
  }),
});

export const chartArtifactSchema = artifactSchema.extend({
  type: z.literal("chart"),
  content: z.object({
    chartType: z.enum(["bar", "line", "pie", "scatter", "area"]),
    data: z.array(z.record(z.any())),
    config: z.object({
      xAxis: z.string(),
      yAxis: z.string().array(),
      title: z.string().optional(),
    }),
  }),
});

// ==================== AI Tool Schemas ====================
export const generateSpreadsheetToolSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  sheets: z
    .array(
      z.object({
        name: z.string().min(1),
        data: z.array(z.array(z.any())),
      }),
    )
    .min(1),
});

export const generateChartToolSchema = z.object({
  title: z.string().min(1).max(200),
  chartType: z.enum(["bar", "line", "pie", "scatter", "area"]),
  data: z.array(z.record(z.any())),
  xAxis: z.string(),
  yAxis: z.array(z.string()),
});

// ==================== Quick Prompt Schemas ====================
export const quickPromptSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(100),
  prompt: z.string().min(1).max(500),
  icon: z.string().optional(),
  order: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
});

// ==================== Attachment Schemas ====================
export const attachmentSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().min(0),
  url: z.string().url(),
  storagePath: z.string(),
  createdAt: z.string().datetime(),
});

// ==================== Input Validation Schemas ====================
export const createChatInputSchema = z.object({
  title: z.string().min(1).max(200).default("New Chat"),
  userId: z.string().uuid(),
});

export const createMessageInputSchema = z.object({
  chatId: z.string().uuid(),
  content: z.string().min(1),
  role: z.enum(["user", "system"]).default("user"),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        content: z.any(),
      }),
    )
    .optional(),
});

export const updateChatInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
});

export const deleteChatInputSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

// ==================== Export Types ====================
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type Chat = z.infer<typeof chatSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type SpreadsheetArtifact = z.infer<typeof spreadsheetArtifactSchema>;
export type ChartArtifact = z.infer<typeof chartArtifactSchema>;
export type QuickPrompt = z.infer<typeof quickPromptSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type CreateChatInput = z.infer<typeof createChatInputSchema>;
export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;
export type UpdateChatInput = z.infer<typeof updateChatInputSchema>;
export type DeleteChatInput = z.infer<typeof deleteChatInputSchema>;
