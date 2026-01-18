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

    // Tray Popover API
    tray: {
        getRecentItems: () => ipcRenderer.invoke('tray:get-recent-items'),
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
    }
}

// Expose to renderer process
contextBridge.exposeInMainWorld('desktopApi', desktopApi)

// Type declaration for renderer
export type DesktopApi = typeof desktopApi
