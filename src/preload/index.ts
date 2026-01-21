import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronTRPC } from 'trpc-electron/main'

// Expose tRPC
exposeElectronTRPC()

// Desktop API exposed to renderer
const desktopApi = {
    // Window controls
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    onMaximizeChange: (callback: (maximized: boolean) => void) => {
        const handler = (_: unknown, maximized: boolean) => callback(maximized)
        ipcRenderer.on('window:maximize-changed', handler)
        return () => ipcRenderer.removeListener('window:maximize-changed', handler)
    },

    // App info
    getVersion: () => ipcRenderer.invoke('app:getVersion'),

    // Auth synchronization
    setSession: (session: any) => ipcRenderer.invoke('auth:set-session', session),

    // Theme
    getTheme: () => ipcRenderer.invoke('theme:get'),
    setTheme: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme:set', theme),

    // Platform detection
    platform: process.platform,

    // Haptic feedback (macOS only)
    haptic: (type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error') => 
        ipcRenderer.invoke('haptic:perform', type),

    // Auth callback listener (for deep link code flow)
    onAuthCallback: (callback: (data: { code: string }) => void) => {
        ipcRenderer.on('auth:callback', (_, data) => callback(data))
        return () => {
            ipcRenderer.removeAllListeners('auth:callback')
        }
    },

    // OAuth tokens listener (for Electron window OAuth flow)
    onOAuthTokens: (callback: (data: { access_token: string; refresh_token: string }) => void) => {
        ipcRenderer.on('auth:oauth-tokens', (_, data) => callback(data))
        return () => {
            ipcRenderer.removeAllListeners('auth:oauth-tokens')
        }
    },

    // AI Stream listener
    onAIStreamEvent: (callback: (event: any) => void) => {
        const handler = (_: any, event: any) => callback(event)
        ipcRenderer.on('ai:stream', handler)
        return () => {
            ipcRenderer.removeListener('ai:stream', handler)
        }
    },

    // ChatGPT Plus connected listener (OAuth callback)
    onChatGPTConnected: (callback: (data: { isConnected: boolean; accountId?: string }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('chatgpt:connected', handler)
        return () => {
            ipcRenderer.removeListener('chatgpt:connected', handler)
        }
    },

    // Gemini Advanced connected listener (OAuth callback)
    onGeminiConnected: (callback: (data: { isConnected: boolean }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('gemini:connected', handler)
        return () => {
            ipcRenderer.removeListener('gemini:connected', handler)
        }
    },

    // Tray Popover API
    tray: {
        getRecentItems: () => ipcRenderer.invoke('tray:get-recent-items'),
        getUser: () => ipcRenderer.invoke('tray:get-user'),
        action: (data: { action: string; [key: string]: unknown }) => 
            ipcRenderer.invoke('tray:action', data),
        onRefresh: (callback: () => void) => {
            ipcRenderer.on('tray:refresh', callback)
            return () => {
                ipcRenderer.removeListener('tray:refresh', callback)
            }
        },
        // Callbacks for tray actions aimed at the main window
        onAction: (action: string, callback: (data?: any) => void) => {
            const channel = `tray:${action}`
            const listener = (_: any, data: any) => callback(data)
            ipcRenderer.on(channel, listener)
            return () => {
                ipcRenderer.removeListener(channel, listener)
            }
        }
    },

    files: {
        listFolders: () => ipcRenderer.invoke('files:list-folders'),
        createFolder: (data: { name: string; isSensitive?: boolean }) => ipcRenderer.invoke('files:create-folder', data),
        renameFolder: (data: { folderId: string; name: string }) => ipcRenderer.invoke('files:rename-folder', data),
        deleteFolder: (data: { folderId: string }) => ipcRenderer.invoke('files:delete-folder', data),
        listFiles: (data: { folderId: string }) => ipcRenderer.invoke('files:list-files', data),
        getQuickAccess: () => ipcRenderer.invoke('files:get-quick-access'),
        importPaths: (data: { folderId: string; paths: string[] }) => ipcRenderer.invoke('files:import-paths', data),
        pickAndImport: (data: { folderId: string }) => ipcRenderer.invoke('files:pick-and-import', data),
        deleteFile: (data: { fileId: string }) => ipcRenderer.invoke('files:delete-file', data),
        openFile: (data: { fileId: string }) => ipcRenderer.invoke('files:open-file', data),
        showInFolder: (data: { fileId: string }) => ipcRenderer.invoke('files:show-in-folder', data),
        exportFiles: (data: { fileIds: string[] }) => ipcRenderer.invoke('files:export', data)
    },

    security: {
        getSensitiveStatus: () => ipcRenderer.invoke('security:sensitive-status'),
        unlockSensitive: (data: { ttlMs?: number; reason?: string }) => ipcRenderer.invoke('security:unlock-sensitive', data),
        unlockWithPin: (data: { pin: string; ttlMs?: number }) => ipcRenderer.invoke('security:unlock-with-pin', data),
        setPin: (data: { pin: string }) => ipcRenderer.invoke('security:set-pin', data),
        clearPin: () => ipcRenderer.invoke('security:clear-pin'),
        lockSensitive: () => ipcRenderer.invoke('security:lock-sensitive')
    },
    
    // Clipboard
    clipboard: {
        writeText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
        readText: () => ipcRenderer.invoke('clipboard:read-text')
    },

    // Quick Prompt
    quickPrompt: {
        sendMessage: (message: string) => ipcRenderer.invoke('quick-prompt:send', message),
        onCreateChat: (callback: (message: string) => void) => {
            const handler = (_: any, message: string) => callback(message)
            ipcRenderer.on('quick-prompt:create-chat', handler)
            return () => {
                ipcRenderer.removeListener('quick-prompt:create-chat', handler)
            }
        }
    },

    // Artifact live updates listener (for real-time sync when AI modifies artifacts)
    onArtifactUpdate: (callback: (data: { artifactId: string; univerData: any; type: 'spreadsheet' | 'document' }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('artifact:update', handler)
        return () => {
            ipcRenderer.removeListener('artifact:update', handler)
        }
    },

    // Artifact created listener (for auto-selecting newly created artifacts like charts)
    onArtifactCreated: (callback: (data: { artifactId: string; type: string; name: string }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('artifact:created', handler)
        return () => {
            ipcRenderer.removeListener('artifact:created', handler)
        }
    },

    // UI Navigation listeners (for agent-controlled UI changes)
    onNavigateTab: (callback: (data: { tab: 'chat' | 'excel' | 'doc' | 'gallery' }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('ui:navigate-tab', handler)
        return () => {
            ipcRenderer.removeListener('ui:navigate-tab', handler)
        }
    },

    onSelectArtifact: (callback: (data: { artifactId: string; openInFullTab: boolean; targetTab?: string }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('ui:select-artifact', handler)
        return () => {
            ipcRenderer.removeListener('ui:select-artifact', handler)
        }
    },

    // Notification listener (for agent-triggered notifications)
    onNotification: (callback: (data: { message: string; type: 'info' | 'success' | 'warning' | 'error'; duration?: number }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('ui:notification', handler)
        return () => {
            ipcRenderer.removeListener('ui:notification', handler)
        }
    },

    // Auth refresh state listener
    onAuthRefreshing: (callback: (data: { provider: string; refreshing: boolean }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('auth:refreshing', handler)
        return () => {
            ipcRenderer.removeListener('auth:refreshing', handler)
        }
    },

    // Auth error listener
    onAuthError: (callback: (data: { provider: string; error: string | null }) => void) => {
        const handler = (_: any, data: any) => callback(data)
        ipcRenderer.on('auth:error', handler)
        return () => {
            ipcRenderer.removeListener('auth:error', handler)
        }
    }
}

// Expose to renderer process
contextBridge.exposeInMainWorld('desktopApi', desktopApi)

// Type declaration for renderer
export type DesktopApi = typeof desktopApi
