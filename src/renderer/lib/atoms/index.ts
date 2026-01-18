import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Chat, Artifact } from '@shared/types'
import { AI_MODELS, DEFAULT_MODELS, getModelsByProvider } from '@shared/ai-types'
import type { AIProvider, ModelDefinition } from '@shared/ai-types'

// === SIDEBAR STATE ===
export const sidebarOpenAtom = atomWithStorage('sidebar-open', true)
export const sidebarWidthAtom = atomWithStorage('sidebar-width', 280)

// === CHAT STATE ===
export const selectedChatIdAtom = atomWithStorage<string | null>('selected-chat-id', null)
export const selectedChatAtom = atom<Chat | null>(null)

// === ARTIFACT STATE ===
export const selectedArtifactIdAtom = atom<string | null>(null)
export const selectedArtifactAtom = atom<Artifact | null>(null)
export const artifactPanelOpenAtom = atomWithStorage('artifact-panel-open', true)
export const artifactPanelWidthAtom = atomWithStorage('artifact-panel-width', 500)

// === AI STATE ===
export const isStreamingAtom = atom(false)
export const currentProviderAtom = atomWithStorage<AIProvider>('ai-provider', 'openai')
export const selectedModelAtom = atomWithStorage<string>('ai-selected-model', DEFAULT_MODELS.openai)
export const tavilyApiKeyAtom = atomWithStorage<string | null>('tavily-api-key', null)

// Computed atom for models based on provider
export const availableModelsAtom = atom((get) => {
    const provider = get(currentProviderAtom)
    return getModelsByProvider(provider)
})

// Atom to get all models grouped by provider
export const allModelsGroupedAtom = atom(() => {
    return {
        openai: getModelsByProvider('openai')
    }
})

// Get current model definition
export const currentModelAtom = atom((get): ModelDefinition | undefined => {
    const modelId = get(selectedModelAtom)
    return AI_MODELS[modelId]
})

// === API KEY STATUS (actual keys stored securely in main process) ===
// These atoms track whether keys are configured, not the keys themselves
export const hasOpenaiKeyAtom = atom(false)
export const hasAnthropicKeyAtom = atom(false)

// Legacy atoms for backward compatibility with chat-view
export const openaiApiKeyAtom = atom<string | null>(null) // Dummy - real keys in safeStorage
export const anthropicApiKeyAtom = atom<string | null>(null) // Dummy - real keys in safeStorage

// === CONNECTION STATUS ===
export const aiConnectionStatusAtom = atom<'connected' | 'disconnected' | 'error'>('disconnected')

// === THEME STATE ===
export const themeAtom = atomWithStorage<'system' | 'light' | 'dark'>('theme', 'system')

// === FULL VS CODE THEME ATOMS ===
/**
 * Full VS Code theme data type
 * Contains colors for UI and terminal
 */
export type VSCodeFullTheme = {
    id: string
    name: string
    type: 'light' | 'dark'
    colors: Record<string, string>
    source: 'builtin' | 'imported'
}

/**
 * Selected full theme ID
 * When null, uses system light/dark mode with the themes specified in systemLightThemeIdAtom/systemDarkThemeIdAtom
 */
export const selectedFullThemeIdAtom = atomWithStorage<string | null>(
    'preferences:selected-full-theme-id',
    null
)

/**
 * Theme to use when system is in light mode (only used when selectedFullThemeIdAtom is null)
 */
export const systemLightThemeIdAtom = atomWithStorage<string>(
    'preferences:system-light-theme-id',
    'sagi-light'
)

/**
 * Theme to use when system is in dark mode (only used when selectedFullThemeIdAtom is null)
 */
export const systemDarkThemeIdAtom = atomWithStorage<string>(
    'preferences:system-dark-theme-id',
    'sagi-dark'
)

/**
 * Cached full theme data for the selected theme
 */
export const fullThemeDataAtom = atom<VSCodeFullTheme | null>(null)

// === TAB SYSTEM ===
export type AppTab = 'chat' | 'excel' | 'doc'
export const activeTabAtom = atomWithStorage<AppTab>('active-tab', 'chat')

// === INPUT STATE ===
export const chatInputAtom = atom('')
export const chatModeAtom = atomWithStorage<'plan' | 'agent'>('chat-mode', 'agent')

// === PLAN MODE STATE ===
export const isPlanModeAtom = atomWithStorage<boolean>('agents:isPlanMode', false)

// Track sub-chats with pending plan approval (plan ready but not yet implemented)
// Set<subChatId>
export const pendingPlanApprovalsAtom = atom<Set<string>>(new Set<string>())

// === TODO STATE ===
export interface TodoItem {
    id: string
    content: string
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
    priority: 'high' | 'medium' | 'low'
}

interface TodoState {
    todos: TodoItem[]
    creationToolCallId: string | null
}

// Storage atom for all todos by subChatId
const allTodosStorageAtom = atom<Record<string, TodoState>>({})

// atomFamily-like pattern: get/set todos per subChatId
export const getTodosAtom = (subChatId: string) => atom(
    (get) => get(allTodosStorageAtom)[subChatId] ?? { todos: [], creationToolCallId: null },
    (get, set, newState: TodoState) => {
        const current = get(allTodosStorageAtom)
        set(allTodosStorageAtom, { ...current, [subChatId]: newState })
    }
)

// Note: File attachments are now managed via useFileUpload hook (local state, not global atom)

// === STREAMING STATE ===
// Note: Streaming text is now managed via useSmoothStream hook (local state, not global atom)
export const streamingToolCallsAtom = atom<Array<{
    id: string
    name: string
    args: string
    status: 'streaming' | 'done' | 'executing' | 'complete' | 'error'
    result?: unknown
}>>([])
export const streamingErrorAtom = atom<string | null>(null)

// === REASONING STATE (for GPT-5 with reasoning enabled) ===
export const streamingReasoningAtom = atom('')
export const isReasoningAtom = atom(false)
// Stores the last completed reasoning to display after streaming ends
export const lastReasoningAtom = atom('')
// Matches OpenAI SDK ReasoningEffort: 'low' | 'medium' | 'high'
export type ReasoningEffort = 'low' | 'medium' | 'high'
export const reasoningEffortAtom = atomWithStorage<ReasoningEffort>('reasoning-effort', 'low')

// === WEB SEARCH STATE (for native OpenAI web search) ===
export interface WebSearchInfo {
    searchId: string
    query?: string
    status: 'searching' | 'done'
    action?: 'search' | 'open_page' | 'find_in_page'
    domains?: string[]
    url?: string
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

// Active web searches during streaming
export const streamingWebSearchesAtom = atom<WebSearchInfo[]>([])
// URL citations from the response (collected at the end)
export const streamingAnnotationsAtom = atom<Annotation[]>([])

// === SETTINGS MODAL ===
export const settingsModalOpenAtom = atom(false)
export type SettingsTab = 'account' | 'appearance' | 'api-keys' | 'debug'
export const settingsActiveTabAtom = atom<SettingsTab>('account')

// === HELP & SHORTCUTS ===
export const shortcutsDialogOpenAtom = atom(false)

// === AUTH STATE ===
export const authDialogOpenAtom = atom(false)
export const authDialogModeAtom = atom<'signin' | 'signup'>('signin')

// Legacy atoms for backward compatibility
export const isLoadingAtom = isStreamingAtom
export const claudeCodeConnectedAtom = atom((get) => {
    const hasKey = get(hasOpenaiKeyAtom)
    return hasKey
})
