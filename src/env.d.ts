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
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
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
        getUser: () => Promise<{ email: string; avatarUrl: string | null; fullName: string | null } | null>
        action: (data: { action: string; [key: string]: unknown }) => Promise<void>
        onRefresh: (callback: () => void) => () => void
        onAction: (action: string, callback: (data?: any) => void) => () => void
    }
    files: {
        listFolders: () => Promise<FileManagerFolder[]>
        createFolder: (data: { name: string; isSensitive?: boolean }) => Promise<FileManagerFolder>
        renameFolder: (data: { folderId: string; name: string }) => Promise<FileManagerFolder>
        deleteFolder: (data: { folderId: string }) => Promise<{ success: boolean }>
        listFiles: (data: { folderId: string }) => Promise<FileManagerFileWithUrls[]>
        getQuickAccess: () => Promise<FileManagerQuickAccess>
        importPaths: (data: { folderId: string; paths: string[] }) => Promise<FileManagerFile[]>
        pickAndImport: (data: { folderId: string }) => Promise<FileManagerFile[]>
        deleteFile: (data: { fileId: string }) => Promise<{ success: boolean }>
        openFile: (data: { fileId: string }) => Promise<{ success: boolean }>
        showInFolder: (data: { fileId: string }) => Promise<{ success: boolean }>
        exportFiles: (data: { fileIds: string[] }) => Promise<{ exported: number }>
    }
    security: {
        getSensitiveStatus: () => Promise<{ unlockedUntil: number; canBiometric: boolean; pinEnabled: boolean }>
        unlockSensitive: (data: { ttlMs?: number; reason?: string }) => Promise<{ success: boolean; unlockedUntil: number; error?: string }>
        unlockWithPin: (data: { pin: string; ttlMs?: number }) => Promise<{ success: boolean; unlockedUntil: number; error?: string }>
        setPin: (data: { pin: string }) => Promise<{ success: boolean }>
        clearPin: () => Promise<{ success: boolean }>
        lockSensitive: () => Promise<{ success: boolean }>
    }
    clipboard: {
        writeText: (text: string) => Promise<boolean>
        readText: () => Promise<string>
    }
    quickPrompt: {
        sendMessage: (message: string) => Promise<{ success: boolean }>
        onCreateChat: (callback: (message: string) => void) => () => void
    }
    onArtifactUpdate: (callback: (data: ArtifactUpdateEvent) => void) => () => void
    // ChatGPT Plus connected listener
    onChatGPTConnected: (callback: (data: { isConnected: boolean; accountId?: string }) => void) => () => void
    // Gemini Advanced connected listener
    onGeminiConnected: (callback: (data: { isConnected: boolean }) => void) => () => void
    // UI Navigation (agent-controlled)
    onNavigateTab: (callback: (data: { tab: 'chat' | 'excel' | 'doc' | 'gallery' }) => void) => () => void
    onSelectArtifact: (callback: (data: { artifactId: string; openInFullTab: boolean; targetTab?: string }) => void) => () => void
    // Notification listener (for agent-triggered notifications)
    onNotification: (callback: (data: { message: string; type: 'info' | 'success' | 'warning' | 'error'; duration?: number }) => void) => () => void
    // Auth refresh state listener
    onAuthRefreshing: (callback: (data: { provider: string; refreshing: boolean }) => void) => () => void
    // Auth error listener
    onAuthError: (callback: (data: { provider: string; error: string | null }) => void) => () => void
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

interface FileManagerFolder {
    id: string
    name: string
    createdAt: string
    updatedAt: string
    isSensitive: boolean
}

interface FileManagerFile {
    id: string
    folderId: string
    originalName: string
    storedPath: string
    ext: string
    size: number
    mime: string
    createdAt: string
    updatedAt: string
    lastOpenedAt: string | null
    openCount: number
    isImage: boolean
    thumbnailPath: string | null
}

interface FileManagerFileWithUrls extends FileManagerFile {
    url: string
    thumbnailUrl: string | null
}

interface FileManagerQuickAccess {
    recent: FileManagerFile[]
    frequent: FileManagerFile[]
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
