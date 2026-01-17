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
  // Platform info
  platform: NodeJS.Platform
  arch: string
  getVersion: () => Promise<string>

  // Auto-update
  checkForUpdates: () => Promise<UpdateInfo | null>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => void
  onUpdateChecking: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateNotAvailable: (callback: () => void) => () => void
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void
  onUpdateManualCheck: (callback: () => void) => () => void

  // Window controls
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  windowToggleFullscreen: () => Promise<void>
  windowIsFullscreen: () => Promise<boolean>
  setTrafficLightVisibility: (visible: boolean) => Promise<void>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  onFocusChange: (callback: (isFocused: boolean) => void) => () => void

  // Zoom
  zoomIn: () => Promise<void>
  zoomOut: () => Promise<void>
  zoomReset: () => Promise<void>
  getZoom: () => Promise<number>

  // DevTools
  toggleDevTools: () => Promise<void>

  // Analytics
  setAnalyticsOptOut: (optedOut: boolean) => Promise<void>

  // Native features
  setBadge: (count: number | null) => Promise<void>
  showNotification: (options: { title: string; body: string }) => Promise<void>
  openExternal: (url: string) => Promise<void>
  getApiBaseUrl: () => Promise<string>

  // Clipboard
  clipboardWrite: (text: string) => Promise<void>
  clipboardRead: () => Promise<string>

  // Auth
  getUser: () => Promise<DesktopUser | null>
  isAuthenticated: () => Promise<boolean>
  logout: () => Promise<void>
  startAuthFlow: () => Promise<void>
  submitAuthCode: (code: string) => Promise<void>
  updateUser: (updates: { name?: string }) => Promise<DesktopUser | null>
  onAuthSuccess: (callback: (user: any) => void) => () => void
  onAuthError: (callback: (error: string) => void) => () => void

  // Session synchronization (Supabase)
  setSession: (session: { access_token: string; refresh_token: string } | null) => Promise<{ success: boolean; error?: string }>

  // Auth callback listeners
  onAuthCallback: (callback: (data: { type: string; code?: string; access_token?: string; refresh_token?: string }) => void) => () => void
  onOAuthTokens: (callback: (data: { access_token: string; refresh_token: string }) => void) => () => void

  // Theme
  getTheme: () => Promise<'system' | 'light' | 'dark'>
  setTheme: (theme: 'system' | 'light' | 'dark') => Promise<boolean>

  // Shortcuts
  onShortcutNewAgent: (callback: () => void) => () => void
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
