/**
 * AI Atoms
 *
 * State management for AI functionality:
 * - Provider selection
 * - Model selection
 * - Streaming state
 * - Reasoning state
 * - API key status
 * - Web search / file search
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  DEFAULT_MODELS,
  getModelById,
  getModelsByProvider,
} from '@s-agi/core/types/ai'
import type {
  AIProvider,
  ModelDefinition,
  ResponseMode,
} from '@s-agi/core/types/ai'

export type { ResponseMode }

// === PROVIDER & MODEL SELECTION ===

/** Current AI provider */
export const currentProviderAtom = atomWithStorage<AIProvider>(
  'ai-provider',
  'openai'
)

/** Selected model ID */
export const selectedModelAtom = atomWithStorage<string>(
  'ai-selected-model',
  DEFAULT_MODELS.openai
)

// === COMPUTED MODEL ATOMS ===

/** Available models for current provider */
export const availableModelsAtom = atom((get) => {
  const provider = get(currentProviderAtom)
  return getModelsByProvider(provider)
})

/** All models grouped by provider */
export const allModelsGroupedAtom = atom(() => {
  return {
    openai: getModelsByProvider('openai'),
    'chatgpt-plus': getModelsByProvider('chatgpt-plus'),
    zai: getModelsByProvider('zai'),
    claude: getModelsByProvider('claude'),
    cerebras: getModelsByProvider('cerebras'),
  }
})

/** Current model definition */
export const currentModelAtom = atom((get): ModelDefinition | undefined => {
  const modelId = get(selectedModelAtom)
  return getModelById(modelId)
})

/** Whether current model supports reasoning */
export const supportsReasoningAtom = atom((get) => {
  const model = get(currentModelAtom)
  return model?.supportsReasoning ?? false
})

/** ChatGPT Plus connection info */
export interface ChatGPTPlusStatus {
  isConnected: boolean
  email?: string
  accountId?: string
  connectedAt?: string
}
export const chatGPTPlusStatusAtom = atom<ChatGPTPlusStatus>({
  isConnected: false,
})
/** Derived: Whether ChatGPT Plus is connected */
export const hasChatGPTPlusAtom = atom((get) => get(chatGPTPlusStatusAtom).isConnected)

/** Gemini Advanced connection info - DISABLED */
export interface GeminiAdvancedStatus {
  isConnected: boolean
  email?: string
  connectedAt?: string
}
export const geminiAdvancedStatusAtom = atom<GeminiAdvancedStatus>({
  isConnected: false,
})
/** Derived: Whether Gemini Advanced is connected */
export const hasGeminiAdvancedAtom = atom((get) => get(geminiAdvancedStatusAtom).isConnected)

// === CEREBRAS FREE TIER USAGE TRACKING ===

/** Cerebras daily usage tracker (resets each day, client-side) */
export interface CerebrasUsageState {
  tokensUsed: number
  date: string // YYYY-MM-DD
}
export const cerebrasUsageAtom = atom<CerebrasUsageState>({
  tokensUsed: 0,
  date: new Date().toISOString().split('T')[0],
})
export const CEREBRAS_DAILY_LIMIT = 1_000_000

// === STREAMING STATE ===

/** Whether AI is currently streaming */
export const isStreamingAtom = atom(false)

/** Current streaming tool calls */
export const streamingToolCallsAtom = atom<
  Array<{
    id: string
    name: string
    args: string
    status: 'streaming' | 'done' | 'executing' | 'complete' | 'error'
    result?: unknown
  }>
>([])

/** Current streaming error */
export const streamingErrorAtom = atom<string | null>(null)

// === REASONING STATE (for GPT-5 with reasoning enabled) ===

export const streamingReasoningAtom = atom('')
export const isReasoningAtom = atom(false)
export const lastReasoningAtom = atom('')

/** Reasoning effort level: 'low' | 'medium' | 'high' */
export type ReasoningEffort = 'low' | 'medium' | 'high'
export const reasoningEffortAtom = atomWithStorage<ReasoningEffort>(
  'reasoning-effort',
  'low'
)

/** Response mode: Instant / Thinking / Auto (solo GPT-5.2) */
export const responseModeAtom = atomWithStorage<ResponseMode>(
  'response-mode',
  'auto'
)

// === WEB SEARCH STATE (for native OpenAI web search) ===

export interface WebSearchInfo {
  searchId: string
  query?: string
  status: 'searching' | 'done'
  action?: 'search' | 'open_page' | 'find_in_page'
  domains?: string[]
  url?: string
  sources?: Array<{ url: string; title?: string }>
}

export interface UrlCitation {
  type: 'url_citation'
  url: string
  title?: string
  startIndex: number
  endIndex: number
}

export interface FileCitation {
  type: 'file_citation'
  fileId: string
  filename: string
  index: number
}

export type Annotation = UrlCitation | FileCitation

/** Active web searches during streaming */
export const streamingWebSearchesAtom = atom<WebSearchInfo[]>([])

/** URL citations from the response */
export const streamingAnnotationsAtom = atom<Annotation[]>([])

// === FILE SEARCH STATE (for OpenAI file_search tool) ===

export interface FileSearchInfo {
  searchId: string
  status: 'searching' | 'done'
  filename?: string
}

export const streamingFileSearchesAtom = atom<FileSearchInfo[]>([])

// === CODE INTERPRETER STATE (for OpenAI code_interpreter) ===

export interface CodeInterpreterExec {
  executionId: string
  status: 'running' | 'interpreting' | 'done'
  code: string
  output: string
  images?: Array<{ mimeType: string; data: string }>
}

export const streamingCodeInterpreterExecsAtom = atom<CodeInterpreterExec[]>([])

// === DOCUMENT CITATIONS STATE (for local RAG) ===

export interface DocumentCitation {
  id: number
  filename: string
  pageNumber: number | null
  text: string
  marker?: string
}

export const streamingDocumentCitationsAtom = atom<DocumentCitation[]>([])
export const streamingSuggestionsAtom = atom<string[]>([])

// === AUTH REFRESH STATE ===

/** Track which providers are currently refreshing their tokens */
export const authRefreshingAtom = atom<Set<AIProvider>>(new Set<AIProvider>())

export interface AuthError {
  message: string
  code?: string
  timestamp: number
}

export const authErrorsAtom = atom<Partial<Record<AIProvider, AuthError>>>({})

/** Check if any provider is refreshing */
export const isAnyAuthRefreshingAtom = atom((get) => {
  const refreshing = get(authRefreshingAtom)
  return refreshing.size > 0
})

/** Set refreshing state for a provider */
export const setAuthRefreshingAtom = atom(
  null,
  (
    get,
    set,
    { provider, refreshing }: { provider: AIProvider; refreshing: boolean }
  ) => {
    const current = get(authRefreshingAtom)
    const updated = new Set(current)
    if (refreshing) {
      updated.add(provider)
    } else {
      updated.delete(provider)
    }
    set(authRefreshingAtom, updated)
  }
)

/** Set auth error for a provider */
export const setAuthErrorAtom = atom(
  null,
  (
    get,
    set,
    { provider, error }: { provider: AIProvider; error: string | null }
  ) => {
    const current = get(authErrorsAtom)
    if (error) {
      set(authErrorsAtom, {
        ...current,
        [provider]: {
          message: error,
          timestamp: Date.now(),
        },
      })
    } else {
      const { [provider]: _, ...rest } = current
      set(authErrorsAtom, rest)
    }
  }
)
