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
