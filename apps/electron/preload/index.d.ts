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
    writeText: (text: string) => Promise<boolean>;
    readText: () => Promise<string>;
    writeHtml: (html: string, text?: string) => Promise<boolean>;
    readHtml: () => Promise<string>;
    readFormats: () => Promise<string[]>;
    write: (data: { text?: string; html?: string; rtf?: string }) => Promise<boolean>;
    read: () => Promise<{ text: string; html: string; rtf: string; formats: string[] }>;
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
    get: () => Promise<{
      trayEnabled: boolean;
      quickPromptEnabled: boolean;
      autoSaveDelay: number;
    }>;
    set: (data: {
      trayEnabled?: boolean;
      quickPromptEnabled?: boolean;
      autoSaveDelay?: number;
    }) => Promise<{
      trayEnabled: boolean;
      quickPromptEnabled: boolean;
      autoSaveDelay: number;
    }>;
  };
  // Menu API (for native macOS menu bar actions)
  menu: {
    onNewChat: (callback: () => void) => () => void;
    onNewSpreadsheet: (callback: () => void) => () => void;
    onNewDocument: (callback: () => void) => () => void;
    onFilesImported: (callback: () => void) => () => void;
    onOpenPdf: (
      callback: (data: {
        files: Array<{ path: string; name: string; size: number }>;
      }) => void,
    ) => () => void;
    onToggleSidebar: (callback: () => void) => () => void;
    onShowShortcuts: (callback: () => void) => () => void;
    onGoToTab: (callback: (data: { tab: string }) => void) => () => void;
    onCommandK: (callback: () => void) => () => void;
    // Chat menu actions
    onStopGeneration: (callback: () => void) => () => void;
    onCycleReasoning: (callback: () => void) => () => void;
    onClearChat: (callback: () => void) => () => void;
    onArchiveChat: (callback: () => void) => () => void;
    onDeleteChat: (callback: () => void) => () => void;
    // Artifact menu actions
    onSaveArtifact: (callback: () => void) => () => void;
    onExportExcel: (callback: () => void) => () => void;
    onExportChartPng: (callback: () => void) => () => void;
    onExportChartPdf: (callback: () => void) => () => void;
    onCopyChart: (callback: () => void) => () => void;
    // PDF menu actions
    onDownloadPdf: (callback: () => void) => () => void;
    onOpenPdfBrowser: (callback: () => void) => () => void;
    onCloseArtifact: (callback: () => void) => () => void;
    onSavePdfAnnotations: (callback: () => void) => () => void;
    onPdfNavigate: (callback: () => void) => () => void;
    onPdfHighlight: (callback: () => void) => () => void;
    onPdfZoomIn: (callback: () => void) => () => void;
    onPdfZoomOut: (callback: () => void) => () => void;
    onPdfZoomReset: (callback: () => void) => () => void;
    // Agent panel menu actions
    onToggleAgentPanel: (callback: () => void) => () => void;
    onClearAgentHistory: (callback: () => void) => () => void;
  };
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
