import { ipcRenderer } from "electron";

export const quickPromptBridge = {
  sendMessage: (message: string) =>
    ipcRenderer.invoke("quick-prompt:send", message),
  onCreateChat: (callback: (message: string) => void) => {
    const handler = (_: any, message: string) => callback(message);
    ipcRenderer.on("quick-prompt:create-chat", handler);
    return () => {
      ipcRenderer.removeListener("quick-prompt:create-chat", handler);
    };
  },
};

export const powerBridge = {
  onBatteryStatus: (callback: (data: { onBattery: boolean }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("power:battery-status", handler);
    return () => {
      ipcRenderer.removeListener("power:battery-status", handler);
    };
  },
  onSuspend: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("power:suspend", handler);
    return () => {
      ipcRenderer.removeListener("power:suspend", handler);
    };
  },
  onResume: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("power:resume", handler);
    return () => {
      ipcRenderer.removeListener("power:resume", handler);
    };
  },
  onLockScreen: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("power:lock-screen", handler);
    return () => {
      ipcRenderer.removeListener("power:lock-screen", handler);
    };
  },
  onUnlockScreen: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("power:unlock-screen", handler);
    return () => {
      ipcRenderer.removeListener("power:unlock-screen", handler);
    };
  },
};

export const updateBridge = {
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  getVersion: () => ipcRenderer.invoke("update:get-version") as Promise<string>,
  onChecking: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("update:checking", handler);
    return () => {
      ipcRenderer.removeListener("update:checking", handler);
    };
  },
  onAvailable: (
    callback: (data: {
      version: string;
      releaseDate?: string;
      releaseNotes?: string | { version: string; note: string }[];
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("update:available", handler);
    return () => {
      ipcRenderer.removeListener("update:available", handler);
    };
  },
  onNotAvailable: (callback: (data: { version: string }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("update:not-available", handler);
    return () => {
      ipcRenderer.removeListener("update:not-available", handler);
    };
  },
  onDownloadProgress: (
    callback: (data: {
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("update:download-progress", handler);
    return () => {
      ipcRenderer.removeListener("update:download-progress", handler);
    };
  },
  onDownloaded: (
    callback: (data: {
      version: string;
      releaseDate?: string;
      releaseNotes?: string | { version: string; note: string }[];
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("update:downloaded", handler);
    return () => {
      ipcRenderer.removeListener("update:downloaded", handler);
    };
  },
  onError: (callback: (data: { message: string }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("update:error", handler);
    return () => {
      ipcRenderer.removeListener("update:error", handler);
    };
  },
};

export const hapticBridge = {
  perform: (
    type:
      | "light"
      | "medium"
      | "heavy"
      | "selection"
      | "success"
      | "warning"
      | "error",
  ) => ipcRenderer.invoke("haptic:perform", type),
};

export const artifactBridge = {
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
};

export const uiBridge = {
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
};

export const univerBridge = {
  // Cell highlighting (for clickable tool call badges)
  highlightCells: (params: { range: string; sheetName?: string }) => {
    ipcRenderer.send("univer:highlight-cells", params);
  },
  onHighlightCells: (
    callback: (params: { range: string; sheetName?: string }) => void,
  ) => {
    const handler = (_: any, params: any) => callback(params);
    ipcRenderer.on("univer:highlight-cells", handler);
    return () => {
      ipcRenderer.removeListener("univer:highlight-cells", handler);
    };
  },
};
