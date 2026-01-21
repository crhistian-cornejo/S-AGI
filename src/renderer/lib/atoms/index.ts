import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Chat, Artifact } from '@shared/types'
import { AI_MODELS, DEFAULT_MODELS, getModelsByProvider } from '@shared/ai-types'
import type { AIProvider, ModelDefinition, ResponseMode } from '@shared/ai-types'

export type { ResponseMode }

/**
 * ⚠️ BUNDLE SIZE OPTIMIZATION NOTE:
 * 
 * This file is a barrel export that collects all atoms. When importing from this file,
 * the bundler may need to parse and tree-shake all exports, which can impact build times.
 * 
 * ✅ Use barrel imports when importing MULTIPLE atoms:
 *   import { selectedChatIdAtom, chatInputAtom } from '@/lib/atoms'
 * 
 * ✅ Use direct imports when importing ONLY ONE atom:
 *   import { selectedChatIdAtom } from '@/lib/atoms/chat'
 * 
 * Future optimization: Consider splitting into separate files (chat.ts, ui.ts, artifacts.ts, etc.)
 * if the bundle size becomes an issue.
 */

// === SIDEBAR STATE ===
export const sidebarOpenAtom = atomWithStorage('sidebar-open', true)
export const sidebarWidthAtom = atomWithStorage('sidebar-width', 280)

// === CHAT STATE ===
export const selectedChatIdAtom = atomWithStorage<string | null>('selected-chat-id', null)
export const selectedChatAtom = atom<Chat | null>(null)

// Pending message from Quick Prompt - ChatView will auto-send this
export const pendingQuickPromptMessageAtom = atom<string | null>(null)

// === ARTIFACT STATE ===
export const selectedArtifactIdAtom = atom<string | null>(null)
export const selectedArtifactAtom = atom<Artifact | null>(null)
export const artifactPanelOpenAtom = atomWithStorage('artifact-panel-open', true)
export const artifactPanelWidthAtom = atomWithStorage('artifact-panel-width', 500)

// === ARTIFACT SNAPSHOT CACHE ===
// Cache for unsaved artifact changes - prevents data loss on tab switch
export interface ArtifactSnapshot {
    univerData: unknown
    timestamp: number
    isDirty: boolean
}
export const artifactSnapshotCacheAtom = atom<Record<string, ArtifactSnapshot>>({})

// Helper atom to get/set individual artifact snapshots
export const getArtifactSnapshotAtom = (artifactId: string) => atom(
    (get) => get(artifactSnapshotCacheAtom)[artifactId] ?? null,
    (get, set, snapshot: ArtifactSnapshot | null) => {
        const cache = get(artifactSnapshotCacheAtom)
        if (snapshot) {
            set(artifactSnapshotCacheAtom, { ...cache, [artifactId]: snapshot })
        } else {
            const { [artifactId]: _, ...rest } = cache
            set(artifactSnapshotCacheAtom, rest)
        }
    }
)

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
        openai: getModelsByProvider('openai'),
        'chatgpt-plus': getModelsByProvider('chatgpt-plus'),
        zai: getModelsByProvider('zai')
    }
})

// Get current model definition
export const currentModelAtom = atom((get): ModelDefinition | undefined => {
    const modelId = get(selectedModelAtom)
    return AI_MODELS[modelId]
})

export const supportsReasoningAtom = atom((get) => {
    const model = get(currentModelAtom)
    return model?.supportsReasoning ?? false
})

// === API KEY STATUS (actual keys stored securely in main process) ===
// These atoms track whether keys are configured, not the keys themselves
export const hasOpenaiKeyAtom = atom(false)
export const hasAnthropicKeyAtom = atom(false)
export const hasZaiKeyAtom = atom(false)
// ChatGPT Plus connection info
export interface ChatGPTPlusStatus {
    isConnected: boolean
    email?: string
    accountId?: string
    connectedAt?: string
}
export const hasChatGPTPlusAtom = atom(false)
export const chatGPTPlusStatusAtom = atom<ChatGPTPlusStatus>({ isConnected: false })

// Gemini Advanced connection info - DISABLED
// OAuth token incompatible with generativelanguage.googleapis.com
export interface GeminiAdvancedStatus {
    isConnected: boolean
    email?: string
    connectedAt?: string
}
export const hasGeminiAdvancedAtom = atom(false) // Always false - disabled
export const geminiAdvancedStatusAtom = atom<GeminiAdvancedStatus>({ isConnected: false })

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
export type AppTab = 'chat' | 'excel' | 'doc' | 'gallery'
export const activeTabAtom = atomWithStorage<AppTab>('active-tab', 'chat')

// === INPUT STATE ===
export const chatInputAtom = atom('')
export const chatModeAtom = atomWithStorage<'plan' | 'agent'>('chat-mode', 'agent')

// === PLAN MODE STATE ===
export const isPlanModeAtom = atomWithStorage<boolean>('agents:isPlanMode', false)

// === IMAGE GENERATION MODE ===
// When true, the AI will generate an image based on the user's prompt
export const isImageGenerationModeAtom = atom(false)

// Aspect ratio options for image generation (maps to gpt-image-1.5 sizes)
export type ImageAspectRatio = 'square' | 'landscape' | 'portrait'
export const imageAspectRatioAtom = atomWithStorage<ImageAspectRatio>('image-aspect-ratio', 'square')

// Maps aspect ratio to OpenAI image sizes
export const ASPECT_RATIO_TO_SIZE: Record<ImageAspectRatio, string> = {
    'square': '1024x1024',
    'landscape': '1536x1024',  // 3:2 ratio
    'portrait': '1024x1536'    // 2:3 ratio
}

export const ASPECT_RATIO_LABELS: Record<ImageAspectRatio, string> = {
    'square': '1:1',
    'landscape': '3:2',
    'portrait': '2:3'
}

// === IMAGE EDIT DIALOG STATE ===
export interface ImageEditDialogState {
    isOpen: boolean
    imageUrl: string
    originalPrompt: string
}

export const imageEditDialogAtom = atom<ImageEditDialogState>({
    isOpen: false,
    imageUrl: '',
    originalPrompt: ''
})

// Track sub-chats with pending plan approval (plan ready but not yet implemented)
// Set<subChatId>
export const pendingPlanApprovalsAtom = atom<Set<string>>(new Set<string>())

// === UNDO STATE ===
export type UndoItem = {
    action: 'archive' | 'delete'
    chatId: string
    timeoutId: ReturnType<typeof setTimeout>
}

export const undoStackAtom = atom<UndoItem[]>([])

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

// ResponseMode: Instant / Thinking / Auto (solo GPT-5.2)
export const responseModeAtom = atomWithStorage<ResponseMode>('response-mode', 'auto')

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

// === FILE SEARCH STATE (for OpenAI file_search tool) ===
export interface FileSearchInfo {
    searchId: string
    status: 'searching' | 'done'
    /** Optional: file being searched (if known) */
    filename?: string
}

// Active file searches during streaming
export const streamingFileSearchesAtom = atom<FileSearchInfo[]>([])

// === DOCUMENT CITATIONS STATE (for local RAG with non-OpenAI providers) ===
export interface DocumentCitation {
    id: number
    filename: string
    pageNumber: number | null
    text: string
    marker?: string
}

// Document citations for the current streaming response
export const streamingDocumentCitationsAtom = atom<DocumentCitation[]>([])

// === SOUND EFFECTS ===
// Enable/disable chat sound effects
export const chatSoundsEnabledAtom = atomWithStorage('chat-sounds-enabled', true)

// === SETTINGS MODAL ===
export const settingsModalOpenAtom = atom(false)
export type SettingsTab = 'account' | 'appearance' | 'api-keys' | 'advanced' | 'shortcuts' | 'debug'
export const settingsActiveTabAtom = atom<SettingsTab>('account')

// === HELP & SHORTCUTS ===
export const shortcutsDialogOpenAtom = atom(false)

// === COMMAND K / QUICK SEARCH ===
export const commandKOpenAtom = atom(false)

// === AUTH STATE ===
export const authDialogOpenAtom = atom(false)
export const authDialogModeAtom = atom<'signin' | 'signup'>('signin')
// --- REFRESH ---
export const onboardingCompletedAtom = atomWithStorage('onboarding-completed', false)

// === AUTH REFRESH STATE ===
// Track which providers are currently refreshing their tokens
export const authRefreshingAtom = atom<Set<AIProvider>>(new Set<AIProvider>())

// Track auth errors per provider
export interface AuthError {
    message: string
    code?: string
    timestamp: number
}
export const authErrorsAtom = atom<Partial<Record<AIProvider, AuthError>>>({})

// Helper atom to check if any provider is refreshing
export const isAnyAuthRefreshingAtom = atom((get) => {
    const refreshing = get(authRefreshingAtom)
    return refreshing.size > 0
})

// Helper atom to set refreshing state for a provider
export const setAuthRefreshingAtom = atom(
    null,
    (get, set, { provider, refreshing }: { provider: AIProvider; refreshing: boolean }) => {
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

// Helper atom to set auth error for a provider
export const setAuthErrorAtom = atom(
    null,
    (get, set, { provider, error }: { provider: AIProvider; error: string | null }) => {
        const current = get(authErrorsAtom)
        if (error) {
            set(authErrorsAtom, {
                ...current,
                [provider]: {
                    message: error,
                    timestamp: Date.now()
                }
            })
        } else {
            const { [provider]: _, ...rest } = current
            set(authErrorsAtom, rest)
        }
    }
)

// Legacy atoms for backward compatibility
export const isLoadingAtom = isStreamingAtom
export const claudeCodeConnectedAtom = atom((get) => {
    const hasKey = get(hasOpenaiKeyAtom)
    return hasKey
})
