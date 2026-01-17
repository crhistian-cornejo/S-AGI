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
export const currentProviderAtom = atomWithStorage<'anthropic' | 'openai'>('ai-provider', 'openai')

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

// === INPUT STATE ===
export const chatInputAtom = atom('')
export const chatModeAtom = atomWithStorage<'plan' | 'agent'>('chat-mode', 'agent')

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
