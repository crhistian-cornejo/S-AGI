// Environment variable declaration for TypeScript
/** biome-ignore-all lint/correctness/noUnusedVariables: <explanation> */
/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Main process (MAIN_VITE_ prefix)
    readonly MAIN_VITE_SUPABASE_URL: string
    readonly MAIN_VITE_SUPABASE_ANON_KEY: string

    // Renderer process (VITE_ prefix)
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_ANTHROPIC_CLIENT_ID: string
    readonly VITE_OPENAI_API_KEY: string
    readonly VITE_OAUTH_REDIRECT_URI: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

// Desktop API exposed by preload
interface DesktopApi {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    getVersion: () => Promise<string>
    getTheme: () => Promise<'system' | 'light' | 'dark'>
    setTheme: (theme: 'system' | 'light' | 'dark') => Promise<boolean>
    platform: 'darwin' | 'win32' | 'linux'
    onAuthCallback: (callback: (data: { type?: string; code?: string; access_token?: string; refresh_token?: string }) => void) => () => void
    onOAuthTokens: (callback: (data: { access_token: string; refresh_token: string }) => void) => () => void
    setSession: (session: { access_token: string; refresh_token: string } | null) => Promise<{ success: boolean; error?: string }>
    haptic: (type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error') => Promise<boolean>
    onAIStreamEvent: (callback: (event: AIStreamEvent) => void) => () => void
    tray: {
        getRecentItems: () => Promise<TrayRecentItem[]>
        action: (data: { action: string; [key: string]: unknown }) => Promise<void>
        onRefresh: (callback: () => void) => () => void
        onAction: (action: string, callback: (data?: any) => void) => () => void
    }
    clipboard: {
        writeText: (text: string) => Promise<boolean>
        readText: () => Promise<string>
    }
    quickPrompt: {
        sendMessage: (message: string) => Promise<{ success: boolean }>
    }
    onArtifactUpdate: (callback: (data: ArtifactUpdateEvent) => void) => () => void
}

// Artifact live update event from main process
interface ArtifactUpdateEvent {
    artifactId: string
    univerData: any
    type: 'spreadsheet' | 'document'
}

// Types for tray popover
interface TrayRecentItem {
    id: string
    type: 'spreadsheet' | 'document' | 'chat'
    name: string
    updatedAt: string
    chatId?: string
}

// AI Stream event type
interface AIStreamEvent {
    type: string
    [key: string]: unknown
}

declare global {
    interface Window {
        desktopApi?: DesktopApi
    }
}

export { }
