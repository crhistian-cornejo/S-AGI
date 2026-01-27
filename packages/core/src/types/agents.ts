/**
 * @s-agi/core - Agent Types
 *
 * Runtime types for AI agents. Configuration types are in config/agent-config.ts.
 * These types are used in both main process and renderer.
 */

// === Agent Types ===
export type AgentType =
  | 'orchestrator'
  | 'excel'
  | 'pdf'
  | 'docs'
  | 'chart'
  | 'research'

// === Agent Status ===
export type AgentStatus =
  | 'idle'
  | 'routing'
  | 'executing'
  | 'completing'

// === Agent Context (Runtime) ===
export interface AgentContext {
  userId: string
  chatId: string
  /** API key for the AI provider */
  apiKey?: string
  /** Current artifact being worked on */
  artifactId?: string
  /** PDF-specific context */
  pdfPath?: string
  pdfContent?: string
  pdfBytes?: Uint8Array
  /** Generic metadata */
  metadata?: Record<string, unknown>
  /** Allow additional properties */
  [key: string]: unknown
}

// === Specialized Agent Contexts ===
export interface ExcelContext extends AgentContext {
  workbookId?: string
  sheetId?: string
  selectedRange?: string
  /** Current cell values in selection */
  selectionData?: unknown[][]
}

export interface DocsContext extends AgentContext {
  documentId?: string
  documentTitle?: string
  selectedText?: string
}

export interface PDFContext extends AgentContext {
  pdfPath: string
  /** Extracted page content */
  pages: PageContent[]
  pdfBytes?: Uint8Array
  currentPage?: number
  selectedText?: string
  /** Vector store ID for RAG */
  vectorStoreId?: string
}

// === Page Content (for PDF extraction) ===
export interface PageContent {
  pageNumber: number
  text: string
  /** Word count */
  wordCount?: number
}

// === Agent Status Info (for UI) ===
export interface AgentStatusInfo {
  status: AgentStatus
  agent: AgentType
  message?: string
  toolCall?: {
    name: string
    stage: 'starting' | 'running' | 'completed' | 'failed'
  }
}

// === Handoff Instruction ===
export interface HandoffInstruction {
  targetAgent: AgentType
  context?: string
  reason?: string
  data?: Record<string, unknown>
}

// === Agent Panel Message (for UI) ===
export interface AgentPanelMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  images?: Array<{
    data: string
    mediaType: string
    filename?: string
  }>
  toolCalls?: Array<{
    toolName: string
    toolCallId: string
    status: 'executing' | 'done' | 'error'
    result?: unknown
    args?: Record<string, unknown>
  }>
}

// === Agent Panel Config ===
export interface AgentPanelConfig {
  provider: string
  modelId: string
}

// === Agent Selection Result ===
export interface AgentSelection {
  agent: AgentType
  confidence: number
  reason?: string
}
