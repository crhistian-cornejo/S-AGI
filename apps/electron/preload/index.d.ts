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
  version: string;
  releaseDate?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface DesktopUser {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  username: string | null;
}

export interface DesktopApi {
  platform: NodeJS.Platform;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
  getVersion: () => Promise<string>;
  setSession: (
    session: { access_token: string; refresh_token: string } | null,
  ) => Promise<{ success: boolean; error?: string }>;
  getTheme: () => Promise<"system" | "light" | "dark">;
  setTheme: (theme: "system" | "light" | "dark") => Promise<boolean>;
  getAIServerPort: () => Promise<number>;
  haptic: (
    type:
      | "light"
      | "medium"
      | "heavy"
      | "selection"
      | "success"
      | "warning"
      | "error",
  ) => Promise<void>;
  onAuthCallback: (callback: (data: { code: string }) => void) => () => void;
  onOAuthTokens: (
    callback: (data: { access_token: string; refresh_token: string }) => void,
  ) => () => void;
  onAIStreamEvent: (callback: (event: unknown) => void) => () => void;
  onAgentPanelStream: (callback: (event: unknown) => void) => () => void;
  onIdeasStream: (callback: (event: unknown) => void) => () => void;
  onChatGPTConnected: (
    callback: (data: { isConnected: boolean; accountId?: string }) => void,
  ) => () => void;
  onGeminiConnected: (
    callback: (data: { isConnected: boolean }) => void,
  ) => () => void;
  tray: {
    getRecentItems: () => Promise<unknown>;
    action: (data: {
      action: string;
      [key: string]: unknown;
    }) => Promise<unknown>;
    onRefresh: (callback: () => void) => () => void;
    onAction: (
      action: string,
      callback: (data?: unknown) => void,
    ) => () => void;
  };
  pdf: {
    pickLocal: () => Promise<{
      files: Array<{ path: string; name: string; size: number }>;
    }>;
    onOpenLocalPdfs: (
      callback: (data: {
        files: Array<{ path: string; name: string; size: number }>;
      }) => void,
    ) => () => void;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
    readText: () => Promise<string>;
  };
  quickPrompt: {
    sendMessage: (message: string) => Promise<{ success: boolean }>;
    onCreateChat: (callback: (message: string) => void) => () => void;
  };
  onArtifactUpdate: (
    callback: (data: {
      artifactId: string;
      univerData: any;
      type: "spreadsheet" | "document";
    }) => void,
  ) => () => void;
  // UI Navigation (agent-controlled)
  onNavigateTab: (
    callback: (data: { tab: "chat" | "excel" | "doc" | "gallery" }) => void,
  ) => () => void;
  onSelectArtifact: (
    callback: (data: {
      artifactId: string;
      openInFullTab: boolean;
      targetTab?: string;
    }) => void,
  ) => () => void;
  // Notification listener (for agent-triggered notifications)
  onNotification: (
    callback: (data: {
      message: string;
      type: "info" | "success" | "warning" | "error";
      duration?: number;
    }) => void,
  ) => () => void;
  // Auth refresh state listener
  onAuthRefreshing: (
    callback: (data: { provider: string; refreshing: boolean }) => void,
  ) => () => void;
  // Auth error listener
  onAuthError: (
    callback: (data: { provider: string; error: string | null }) => void,
  ) => () => void;
  app: {
    onOpenSettings: (callback: (data?: { tab?: string }) => void) => () => void;
  };
  preferences: {
    get: () => Promise<{ trayEnabled: boolean; quickPromptEnabled: boolean }>;
    set: (data: {
      trayEnabled?: boolean;
      quickPromptEnabled?: boolean;
    }) => Promise<{ trayEnabled: boolean; quickPromptEnabled: boolean }>;
  };
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
