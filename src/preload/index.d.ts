/**
 * DesktopApi type declaration for window.desktopApi.
 * Implementation: preload/index.ts
 *
 * Planned / not yet implemented (kept as reference for future): checkForUpdates,
 * downloadUpdate, installUpdate, onUpdate*, window* (minimize/maximize/close
 * variants, fullscreen, traffic lights), zoom*, toggleDevTools, setAnalyticsOptOut,
 * setBadge, showNotification, openExternal, getApiBaseUrl, getUser, isAuthenticated,
 * logout, startAuthFlow, submitAuthCode, updateUser, onAuthSuccess, onAuthError,
 * onShortcutNewAgent, arch. See preload/index.ts for the current surface.
 */

export interface UpdateInfo {
  version: string
  releaseDate?: string
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface DesktopUser {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
  username: string | null
}

export interface DesktopApi {
  platform: NodeJS.Platform
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  getVersion: () => Promise<string>
  setSession: (session: { access_token: string; refresh_token: string } | null) => Promise<{ success: boolean; error?: string }>
  getTheme: () => Promise<'system' | 'light' | 'dark'>
  setTheme: (theme: 'system' | 'light' | 'dark') => Promise<boolean>
  haptic: (type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error') => Promise<void>
  onAuthCallback: (callback: (data: { code: string }) => void) => () => void
  onOAuthTokens: (callback: (data: { access_token: string; refresh_token: string }) => void) => () => void
  onAIStreamEvent: (callback: (event: unknown) => void) => () => void
  onChatGPTConnected: (callback: (data: { isConnected: boolean; accountId?: string }) => void) => () => void
  onGeminiConnected: (callback: (data: { isConnected: boolean }) => void) => () => void
  tray: {
    getRecentItems: () => Promise<unknown>
    action: (data: { action: string; [key: string]: unknown }) => Promise<unknown>
    onRefresh: (callback: () => void) => () => void
    onAction: (action: string, callback: (data?: unknown) => void) => () => void
  }
  clipboard: {
    writeText: (text: string) => Promise<void>
    readText: () => Promise<string>
  }
  quickPrompt: {
    sendMessage: (message: string) => Promise<{ success: boolean }>
  }
  onArtifactUpdate: (callback: (data: { artifactId: string; univerData: any; type: 'spreadsheet' | 'document' }) => void) => () => void
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
