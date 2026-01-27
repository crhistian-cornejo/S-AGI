/**
 * @s-agi/core - Tool Types
 *
 * Shared tool-related types used across main process and renderer.
 * These types support the AI SDK tool calling pattern.
 */

import { z } from 'zod'

// === Tool Call Status ===
export type ToolCallStatus = 'streaming' | 'done' | 'executing' | 'complete' | 'error'

// === Tool Call (Renderer/UI) ===
// Used in renderer for displaying tool calls in UI
export interface ToolCall {
  id: string
  name: string
  /** Stringified arguments (for display) */
  args?: string
  /** Parsed arguments (when available) */
  arguments?: Record<string, unknown>
  result?: unknown
  status?: ToolCallStatus
}

// === Tool Result ===
export interface ToolResult {
  id: string
  result: unknown
  error?: string
}

// === Tool Definition (for configuration) ===
export interface ToolDefinition {
  name: string
  category: 'excel' | 'docs' | 'pdf' | 'chart' | 'file' | 'search' | 'general'
  description: string
  inputSchema: z.ZodType
  /** Whether tool requires user approval before execution */
  requiresApproval: boolean
  /** Icon name from @tabler/icons-react */
  icon: string
  /** Component name for custom UI rendering */
  uiComponent?: string
  /** Tags for filtering/grouping */
  tags?: string[]
}

// === Streaming Tool Call (for real-time updates) ===
export interface StreamingToolCall {
  id: string
  name: string
  args: string
  status: ToolCallStatus
  result?: unknown
  /** Progress percentage (0-100) */
  progress?: number
  /** Stage message for multi-step tools */
  stageMessage?: string
}

// === Tool Execution Context ===
export interface ToolExecutionContext {
  userId: string
  chatId: string
  artifactId?: string
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Callback for progress updates */
  onProgress?: (progress: number, message?: string) => void
  /** Callback for stage updates */
  onStageUpdate?: (stage: string, message?: string) => void
}

// === Zod Schemas for validation ===
export const ToolCallStatusSchema = z.enum(['streaming', 'done', 'executing', 'complete', 'error'])

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.string().optional(),
  arguments: z.record(z.unknown()).optional(),
  result: z.unknown().optional(),
  status: ToolCallStatusSchema.optional(),
})

export const ToolResultSchema = z.object({
  id: z.string(),
  result: z.unknown(),
  error: z.string().optional(),
})
