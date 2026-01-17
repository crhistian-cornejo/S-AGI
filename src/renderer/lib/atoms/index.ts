import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Chat, Artifact } from '@shared/types'

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
export const currentProviderAtom = atomWithStorage<'anthropic' | 'openai'>('ai-provider', 'anthropic')
export const selectedModelAtom = atomWithStorage<string>('ai-selected-model', 'claude-3-5-sonnet-20240620')

// Computed atom for models
export const availableModelsAtom = atom((get) => {
    const provider = get(currentProviderAtom)
    if (provider === 'openai') {
        return [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'o1-preview', name: 'o1 Preview' }
        ]
    }
    return [
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' }
    ]
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

// === INPUT STATE ===
export const chatInputAtom = atom('')
export const chatModeAtom = atomWithStorage<'plan' | 'agent'>('chat-mode', 'agent')
export const appViewModeAtom = atomWithStorage<'chat' | 'native'>('app-view-mode', 'chat')

// === STREAMING STATE ===
export const streamingTextAtom = atom('')
export const streamingToolCallsAtom = atom<Array<{
    id: string
    name: string
    args: string
    status: 'streaming' | 'done' | 'executing' | 'complete'
    result?: unknown
}>>([])
export const streamingErrorAtom = atom<string | null>(null)

// === SETTINGS MODAL ===
export const settingsModalOpenAtom = atom(false)
export type SettingsTab = 'account' | 'appearance' | 'debug'
export const settingsActiveTabAtom = atom<SettingsTab>('account')

// === HELP & SHORTCUTS ===
export const shortcutsDialogOpenAtom = atom(false)

// === AUTH STATE ===
export const authDialogOpenAtom = atom(false)
export const authDialogModeAtom = atom<'signin' | 'signup'>('signin')

// Legacy atoms for backward compatibility
export const isLoadingAtom = isStreamingAtom
export const claudeCodeConnectedAtom = atom((get) => {
    const provider = get(currentProviderAtom)
    const hasKey = get(hasAnthropicKeyAtom)
    return provider === 'anthropic' && hasKey
})
