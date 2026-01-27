import { contextBridge, ipcRenderer } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";

// Expose tRPC
exposeElectronTRPC();

// Desktop API exposed to renderer
const desktopApi = {
  // Window controls
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () =>
    ipcRenderer.invoke("window:isMaximized") as Promise<boolean>,
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_: unknown, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximize-changed", handler);
    return () => ipcRenderer.removeListener("window:maximize-changed", handler);
  },

  // App info
  getVersion: () => ipcRenderer.invoke("app:getVersion"),

  // Auth synchronization
  setSession: (session: any) => ipcRenderer.invoke("auth:set-session", session),

  // Theme
  getTheme: () => ipcRenderer.invoke("theme:get"),
  setTheme: (theme: "system" | "light" | "dark") =>
    ipcRenderer.invoke("theme:set", theme),

  // AI Server
  getAIServerPort: () => ipcRenderer.invoke("ai:get-port") as Promise<number>,

  // Platform detection
  platform: process.platform,

  // Haptic feedback (macOS only)
  haptic: (
    type:
      | "light"
      | "medium"
      | "heavy"
      | "selection"
      | "success"
      | "warning"
      | "error",
  ) => ipcRenderer.invoke("haptic:perform", type),

  // Auth callback listener (for deep link code flow)
  onAuthCallback: (callback: (data: { code: string }) => void) => {
    ipcRenderer.on("auth:callback", (_, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners("auth:callback");
    };
  },

  // OAuth tokens listener (for Electron window OAuth flow)
  onOAuthTokens: (
    callback: (data: { access_token: string; refresh_token: string }) => void,
  ) => {
    ipcRenderer.on("auth:oauth-tokens", (_, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners("auth:oauth-tokens");
    };
  },

  // AI Stream listener
  onAIStreamEvent: (callback: (event: any) => void) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on("ai:stream", handler);
    return () => {
      ipcRenderer.removeListener("ai:stream", handler);
    };
  },

  // Agent Panel Stream listener (for document-contextual AI agents)
  onAgentPanelStream: (callback: (event: any) => void) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on("agent-panel:stream", handler);
    return () => {
      ipcRenderer.removeListener("agent-panel:stream", handler);
    };
  },

  // Ideas Tab Stream listener
  onIdeasStream: (callback: (event: any) => void) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on("ideas:stream", handler);
    return () => {
      ipcRenderer.removeListener("ideas:stream", handler);
    };
  },

  // ChatGPT Plus connected listener (OAuth callback)
  onChatGPTConnected: (
    callback: (data: { isConnected: boolean; accountId?: string }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("chatgpt:connected", handler);
    return () => {
      ipcRenderer.removeListener("chatgpt:connected", handler);
    };
  },

  // Gemini Advanced connected listener (OAuth callback)
  onGeminiConnected: (callback: (data: { isConnected: boolean }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("gemini:connected", handler);
    return () => {
      ipcRenderer.removeListener("gemini:connected", handler);
    };
  },

  // Tray Popover API
  tray: {
    getRecentItems: () => ipcRenderer.invoke("tray:get-recent-items"),
    getUser: () => ipcRenderer.invoke("tray:get-user"),
    getSpreadsheets: () => ipcRenderer.invoke("tray:get-spreadsheets"),
    getSpreadsheetData: (data: { id: string }) =>
      ipcRenderer.invoke("tray:get-spreadsheet-data", data),
    getCitations: () => ipcRenderer.invoke("tray:get-citations"),
    action: (data: { action: string; [key: string]: unknown }) =>
      ipcRenderer.invoke("tray:action", data),
    onRefresh: (callback: () => void) => {
      ipcRenderer.on("tray:refresh", callback);
      return () => {
        ipcRenderer.removeListener("tray:refresh", callback);
      };
    },
    // Callbacks for tray actions aimed at the main window
    onAction: (action: string, callback: (data?: any) => void) => {
      const channel = `tray:${action}`;
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
  },
  app: {
    onOpenSettings: (callback: (data?: { tab?: string }) => void) => {
      const handler = (_: unknown, data: { tab?: string }) => callback(data);
      ipcRenderer.on("app:open-settings", handler);
      return () => {
        ipcRenderer.removeListener("app:open-settings", handler);
      };
    },
  },
  // Menu API (for native macOS menu bar actions)
  menu: {
    onNewChat: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:new-chat", handler);
      return () => {
        ipcRenderer.removeListener("menu:new-chat", handler);
      };
    },
    onNewSpreadsheet: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:new-spreadsheet", handler);
      return () => {
        ipcRenderer.removeListener("menu:new-spreadsheet", handler);
      };
    },
    onNewDocument: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:new-document", handler);
      return () => {
        ipcRenderer.removeListener("menu:new-document", handler);
      };
    },
    onFilesImported: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:files-imported", handler);
      return () => {
        ipcRenderer.removeListener("menu:files-imported", handler);
      };
    },
    onOpenPdf: (
      callback: (data: {
        files: Array<{ path: string; name: string; size: number }>;
      }) => void,
    ) => {
      const handler = (
        _: unknown,
        data: { files: Array<{ path: string; name: string; size: number }> },
      ) => callback(data);
      ipcRenderer.on("menu:open-pdf", handler);
      return () => {
        ipcRenderer.removeListener("menu:open-pdf", handler);
      };
    },
    onToggleSidebar: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:toggle-sidebar", handler);
      return () => {
        ipcRenderer.removeListener("menu:toggle-sidebar", handler);
      };
    },
    onShowShortcuts: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:show-shortcuts", handler);
      return () => {
        ipcRenderer.removeListener("menu:show-shortcuts", handler);
      };
    },
    onGoToTab: (callback: (data: { tab: string }) => void) => {
      const handler = (_: unknown, data: { tab: string }) => callback(data);
      ipcRenderer.on("menu:go-to-tab", handler);
      return () => {
        ipcRenderer.removeListener("menu:go-to-tab", handler);
      };
    },
    onCommandK: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:command-k", handler);
      return () => {
        ipcRenderer.removeListener("menu:command-k", handler);
      };
    },
    // Chat menu actions
    onStopGeneration: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:stop-generation", handler);
      return () => {
        ipcRenderer.removeListener("menu:stop-generation", handler);
      };
    },
    onCycleReasoning: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:cycle-reasoning", handler);
      return () => {
        ipcRenderer.removeListener("menu:cycle-reasoning", handler);
      };
    },
    onClearChat: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:clear-chat", handler);
      return () => {
        ipcRenderer.removeListener("menu:clear-chat", handler);
      };
    },
    onArchiveChat: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:archive-chat", handler);
      return () => {
        ipcRenderer.removeListener("menu:archive-chat", handler);
      };
    },
    onDeleteChat: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:delete-chat", handler);
      return () => {
        ipcRenderer.removeListener("menu:delete-chat", handler);
      };
    },
    // Artifact menu actions
    onSaveArtifact: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:save-artifact", handler);
      return () => {
        ipcRenderer.removeListener("menu:save-artifact", handler);
      };
    },
    onExportExcel: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:export-excel", handler);
      return () => {
        ipcRenderer.removeListener("menu:export-excel", handler);
      };
    },
    onExportChartPng: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:export-chart-png", handler);
      return () => {
        ipcRenderer.removeListener("menu:export-chart-png", handler);
      };
    },
    onExportChartPdf: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:export-chart-pdf", handler);
      return () => {
        ipcRenderer.removeListener("menu:export-chart-pdf", handler);
      };
    },
    onCopyChart: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:copy-chart", handler);
      return () => {
        ipcRenderer.removeListener("menu:copy-chart", handler);
      };
    },
    onDownloadPdf: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:download-pdf", handler);
      return () => {
        ipcRenderer.removeListener("menu:download-pdf", handler);
      };
    },
    onOpenPdfBrowser: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:open-pdf-browser", handler);
      return () => {
        ipcRenderer.removeListener("menu:open-pdf-browser", handler);
      };
    },
    onCloseArtifact: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:close-artifact", handler);
      return () => {
        ipcRenderer.removeListener("menu:close-artifact", handler);
      };
    },
    // PDF menu actions
    onSavePdfAnnotations: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:save-pdf-annotations", handler);
      return () => {
        ipcRenderer.removeListener("menu:save-pdf-annotations", handler);
      };
    },
    onPdfNavigate: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:pdf-navigate", handler);
      return () => {
        ipcRenderer.removeListener("menu:pdf-navigate", handler);
      };
    },
    onPdfHighlight: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:pdf-highlight", handler);
      return () => {
        ipcRenderer.removeListener("menu:pdf-highlight", handler);
      };
    },
    onPdfZoomIn: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:pdf-zoom-in", handler);
      return () => {
        ipcRenderer.removeListener("menu:pdf-zoom-in", handler);
      };
    },
    onPdfZoomOut: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:pdf-zoom-out", handler);
      return () => {
        ipcRenderer.removeListener("menu:pdf-zoom-out", handler);
      };
    },
    onPdfZoomReset: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:pdf-zoom-reset", handler);
      return () => {
        ipcRenderer.removeListener("menu:pdf-zoom-reset", handler);
      };
    },
    // Agent menu actions
    onToggleAgentPanel: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:toggle-agent-panel", handler);
      return () => {
        ipcRenderer.removeListener("menu:toggle-agent-panel", handler);
      };
    },
    onClearAgentHistory: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("menu:clear-agent-history", handler);
      return () => {
        ipcRenderer.removeListener("menu:clear-agent-history", handler);
      };
    },
  },

  files: {
    listFolders: () => ipcRenderer.invoke("files:list-folders"),
    createFolder: (data: { name: string; isSensitive?: boolean }) =>
      ipcRenderer.invoke("files:create-folder", data),
    renameFolder: (data: { folderId: string; name: string }) =>
      ipcRenderer.invoke("files:rename-folder", data),
    deleteFolder: (data: { folderId: string }) =>
      ipcRenderer.invoke("files:delete-folder", data),
    listFiles: (data: { folderId: string }) =>
      ipcRenderer.invoke("files:list-files", data),
    listAllFiles: () => ipcRenderer.invoke("files:list-all"),
    getQuickAccess: () => ipcRenderer.invoke("files:get-quick-access"),
    importPaths: (data: { folderId: string; paths: string[] }) =>
      ipcRenderer.invoke("files:import-paths", data),
    pickAndImport: (data: { folderId: string }) =>
      ipcRenderer.invoke("files:pick-and-import", data),
    deleteFile: (data: { fileId: string }) =>
      ipcRenderer.invoke("files:delete-file", data),
    openFile: (data: { fileId: string }) =>
      ipcRenderer.invoke("files:open-file", data),
    showInFolder: (data: { fileId: string }) =>
      ipcRenderer.invoke("files:show-in-folder", data),
    exportFiles: (data: { fileIds: string[] }) =>
      ipcRenderer.invoke("files:export", data),
  },

  excel: {
    saveLocal: (data: { base64: string; suggestedName?: string }) =>
      ipcRenderer.invoke("excel:save-local", data) as Promise<{
        success: boolean;
        path?: string;
        error?: string;
        canceled?: boolean;
      }>,
  },

  // PDF local file picker (view only, no import)
  pdf: {
    pickLocal: () =>
      ipcRenderer.invoke("pdf:pick-local") as Promise<{
        files: Array<{ path: string; name: string; size: number }>;
      }>,
    // Read a local PDF file as base64 for viewing
    readLocal: (filePath: string) =>
      ipcRenderer.invoke("pdf:read-local", { filePath }) as Promise<{
        success: boolean;
        data?: string; // base64 encoded PDF data
        size?: number;
        error?: string;
      }>,
    // Listener for tray-opened local PDFs
    onOpenLocalPdfs: (
      callback: (data: {
        files: Array<{ path: string; name: string; size: number }>;
      }) => void,
    ) => {
      const handler = (
        _: unknown,
        data: { files: Array<{ path: string; name: string; size: number }> },
      ) => callback(data);
      ipcRenderer.on("tray:open-local-pdfs", handler);
      return () => {
        ipcRenderer.removeListener("tray:open-local-pdfs", handler);
      };
    },
    // Agent commands for PDF viewer
    onNavigate: (
      callback: (data: { artifactId: string; page: number }) => void,
    ) => {
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on("pdf:navigate", handler);
      return () => {
        ipcRenderer.removeListener("pdf:navigate", handler);
      };
    },
    onHighlight: (
      callback: (data: {
        artifactId: string;
        pageNumber: number;
        text: string;
        boundingBox?: { x: number; y: number; width: number; height: number };
      }) => void,
    ) => {
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on("pdf:highlight", handler);
      return () => {
        ipcRenderer.removeListener("pdf:highlight", handler);
      };
    },
    onModified: (
      callback: (data: { artifactId: string; pdfBytes: number[] }) => void,
    ) => {
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on("pdf:modified", handler);
      return () => {
        ipcRenderer.removeListener("pdf:modified", handler);
      };
    },
    onCreated: (
      callback: (data: {
        name: string;
        pdfBytes: number[];
        description?: string;
      }) => void,
    ) => {
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on("pdf:created", handler);
      return () => {
        ipcRenderer.removeListener("pdf:created", handler);
      };
    },
    onAddAnnotation: (
      callback: (data: {
        artifactId: string;
        type:
          | "highlight"
          | "underline"
          | "strikethrough"
          | "text"
          | "rectangle";
        pageNumber: number;
        boundingBox: { x: number; y: number; width: number; height: number };
        text?: string;
        color?: string;
      }) => void,
    ) => {
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on("pdf:add-annotation", handler);
      return () => {
        ipcRenderer.removeListener("pdf:add-annotation", handler);
      };
    },
    onZoom: (
      callback: (data: {
        artifactId: string;
        zoom: number | "fit-width" | "fit-page";
      }) => void,
    ) => {
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on("pdf:zoom", handler);
      return () => {
        ipcRenderer.removeListener("pdf:zoom", handler);
      };
    },
    onRotate: (
      callback: (data: {
        artifactId: string;
        pageNumber?: number;
        degrees: 90 | 180 | 270;
      }) => void,
    ) => {
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on("pdf:rotate", handler);
      return () => {
        ipcRenderer.removeListener("pdf:rotate", handler);
      };
    },
  },

  security: {
    getSensitiveStatus: () => ipcRenderer.invoke("security:sensitive-status"),
    unlockSensitive: (data: { ttlMs?: number; reason?: string }) =>
      ipcRenderer.invoke("security:unlock-sensitive", data),
    unlockWithPin: (data: { pin: string; ttlMs?: number }) =>
      ipcRenderer.invoke("security:unlock-with-pin", data),
    setPin: (data: { pin: string }) =>
      ipcRenderer.invoke("security:set-pin", data),
    clearPin: () => ipcRenderer.invoke("security:clear-pin"),
    lockSensitive: () => ipcRenderer.invoke("security:lock-sensitive"),
  },

  // Clipboard
  clipboard: {
    writeText: (text: string) =>
      ipcRenderer.invoke("clipboard:write-text", text),
    readText: () => ipcRenderer.invoke("clipboard:read-text"),
  },

  // Quick Prompt
  quickPrompt: {
    sendMessage: (message: string) =>
      ipcRenderer.invoke("quick-prompt:send", message),
    onCreateChat: (callback: (message: string) => void) => {
      const handler = (_: any, message: string) => callback(message);
      ipcRenderer.on("quick-prompt:create-chat", handler);
      return () => {
        ipcRenderer.removeListener("quick-prompt:create-chat", handler);
      };
    },
  },

  // Artifact live updates listener (for real-time sync when AI modifies artifacts)
  onArtifactUpdate: (
    callback: (data: {
      artifactId: string;
      fileId?: string;
      univerData: any;
      type: "spreadsheet" | "document";
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("artifact:update", handler);
    return () => {
      ipcRenderer.removeListener("artifact:update", handler);
    };
  },

  // File save with AI metadata listener (for version tracking after agent tool operations)
  onFileSaveWithAIMetadata: (
    callback: (data: {
      fileId: string;
      tabType: "excel" | "doc";
      aiModel: string;
      aiPrompt: string;
      toolName: string;
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("file:save-with-ai-metadata", handler);
    return () => {
      ipcRenderer.removeListener("file:save-with-ai-metadata", handler);
    };
  },

  // Artifact created listener (for auto-selecting newly created artifacts like charts)
  onArtifactCreated: (
    callback: (data: {
      artifactId: string;
      type: string;
      name: string;
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("artifact:created", handler);
    return () => {
      ipcRenderer.removeListener("artifact:created", handler);
    };
  },

  // UI Navigation listeners (for agent-controlled UI changes)
  onNavigateTab: (
    callback: (data: { tab: "chat" | "excel" | "doc" | "gallery" }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("ui:navigate-tab", handler);
    return () => {
      ipcRenderer.removeListener("ui:navigate-tab", handler);
    };
  },

  onSelectArtifact: (
    callback: (data: {
      artifactId: string;
      openInFullTab: boolean;
      targetTab?: string;
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("ui:select-artifact", handler);
    return () => {
      ipcRenderer.removeListener("ui:select-artifact", handler);
    };
  },

  // Notification listener (for agent-triggered notifications)
  onNotification: (
    callback: (data: {
      message: string;
      type: "info" | "success" | "warning" | "error";
      duration?: number;
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("ui:notification", handler);
    return () => {
      ipcRenderer.removeListener("ui:notification", handler);
    };
  },

  // Auth refresh state listener
  onAuthRefreshing: (
    callback: (data: { provider: string; refreshing: boolean }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("auth:refreshing", handler);
    return () => {
      ipcRenderer.removeListener("auth:refreshing", handler);
    };
  },

  // Auth error listener
  onAuthError: (
    callback: (data: { provider: string; error: string | null }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("auth:error", handler);
    return () => {
      ipcRenderer.removeListener("auth:error", handler);
    };
  },

  preferences: {
    get: () => ipcRenderer.invoke("preferences:get"),
    set: (data: {
      trayEnabled?: boolean;
      quickPromptEnabled?: boolean;
      autoSaveDelay?: number;
    }) => ipcRenderer.invoke("preferences:set", data),
    onPreferencesUpdated: (
      callback: (data: {
        trayEnabled: boolean;
        quickPromptEnabled: boolean;
        autoSaveDelay: number;
      }) => void,
    ) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on("preferences:updated", handler);
      return () => {
        ipcRenderer.removeListener("preferences:updated", handler);
      };
    },
  },
};

// Expose to renderer process
contextBridge.exposeInMainWorld("desktopApi", desktopApi);

// Type declaration for renderer
export type DesktopApi = typeof desktopApi;
