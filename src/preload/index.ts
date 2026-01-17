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
    }
}

// Expose to renderer process
contextBridge.exposeInMainWorld('desktopApi', desktopApi)

// Type declaration for renderer
export type DesktopApi = typeof desktopApi
