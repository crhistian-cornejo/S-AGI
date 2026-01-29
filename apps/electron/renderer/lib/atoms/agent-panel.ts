/**
 * Agent Panel Atoms
 *
 * State management for the agent panel:
 * - Panel open/width state
 * - Messages per session
 * - Provider/model config
 * - Streaming state
 * - Image attachments
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { AIProvider } from '@s-agi/core/types/ai'

// === AGENT PANEL MESSAGE ===

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
  /** Version number of checkpoint created before this message (for restore) */
  checkpointVersion?: number
}

// === AGENT PANEL CONFIG ===

export interface AgentPanelConfig {
  provider: AIProvider
  modelId: string
}

// === PANEL STATE ===

export const agentPanelOpenAtom = atomWithStorage('agent-panel-open', false)
export const agentPanelWidthAtom = atomWithStorage('agent-panel-width', 380)

// === MESSAGES (stored per session/tab type) ===

export const agentPanelMessagesAtom = atom<Record<string, AgentPanelMessage[]>>(
  {}
)

/** Get/set messages for a specific tab */
export const getAgentMessagesAtom = (tabType: string) =>
  atom(
    (get) => get(agentPanelMessagesAtom)[tabType] ?? [],
    (get, set, messages: AgentPanelMessage[]) => {
      const current = get(agentPanelMessagesAtom)
      set(agentPanelMessagesAtom, { ...current, [tabType]: messages })
    }
  )

// === PROVIDER/MODEL CONFIG (persisted) ===

export const agentPanelConfigAtom = atomWithStorage<AgentPanelConfig>(
  'agent-panel-config',
  {
    provider: 'openai',
    modelId: 'gpt-5-mini',
  }
)

// === STREAMING STATE ===

export const agentPanelStreamingAtom = atom(false)
export const agentPanelStreamingTextAtom = atom('')

// === AGENT STATUS (for animated loader) ===

export type AgentStatusPhase =
  | 'idle'
  | 'thinking'       // Initial thinking before any tool calls
  | 'executing'      // Executing a tool
  | 'processing'     // Processing results
  | 'writing'        // Writing response
  | 'syncing'        // Syncing data to spreadsheet/doc

export interface AgentStatus {
  phase: AgentStatusPhase
  /** Current tool being executed (if any) */
  currentTool?: string
  /** Human-readable status message */
  message?: string
}

export const agentPanelStatusAtom = atom<AgentStatus>({ phase: 'idle' })

// === IMAGE ATTACHMENTS ===

export interface AgentPanelImageAttachment {
  id: string
  data: string
  mediaType: string
  filename: string
  url?: string
  isLoading?: boolean
}

export const agentPanelImagesAtom = atom<AgentPanelImageAttachment[]>([])

// === CELL CONTEXT ATTACHMENTS (for "Add Context" feature) ===

export interface CellContextAttachment {
  id: string
  /** Range reference like "Sheet1!A1:B5" */
  range: string
  /** Sheet name */
  sheetName: string
  /** Cell data as 2D array */
  data: Array<Array<string | number | null>>
  /** File ID if from user file */
  fileId?: string
  /** Artifact ID if from artifact */
  artifactId?: string
  /** Workbook name for display */
  workbookName?: string
}

export const agentPanelCellContextAtom = atom<CellContextAttachment[]>([])

// === WORKBOOK CHECKPOINTS (Cursor-style restore) ===

export interface WorkbookCheckpoint {
  id: string
  messageId: string // The user message this checkpoint belongs to
  fileId: string
  versionNumber: number
  prompt: string // Preview of the user prompt
  createdAt: number
  /** Whether this checkpoint can be restored (has subsequent AI changes) */
  canRestore: boolean
}

/** Checkpoints per session (fileId -> checkpoints[]) */
export const agentPanelCheckpointsAtom = atom<Record<string, WorkbookCheckpoint[]>>({})

/** Get checkpoints for a specific file */
export const getFileCheckpointsAtom = (fileId: string) =>
  atom(
    (get) => get(agentPanelCheckpointsAtom)[fileId] ?? [],
    (get, set, checkpoints: WorkbookCheckpoint[]) => {
      const current = get(agentPanelCheckpointsAtom)
      set(agentPanelCheckpointsAtom, { ...current, [fileId]: checkpoints })
    }
  )

/** Add a new checkpoint */
export const addCheckpointAtom = atom(
  null,
  (get, set, checkpoint: WorkbookCheckpoint) => {
    const current = get(agentPanelCheckpointsAtom)
    const fileCheckpoints = current[checkpoint.fileId] ?? []
    set(agentPanelCheckpointsAtom, {
      ...current,
      [checkpoint.fileId]: [...fileCheckpoints, checkpoint],
    })
  }
)
