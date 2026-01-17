// Environment variable declaration for TypeScript
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
}

declare global {
    interface Window {
        desktopApi?: DesktopApi
    }
}

export { }
