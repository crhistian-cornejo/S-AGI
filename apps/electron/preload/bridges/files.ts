import { ipcRenderer } from "electron";

export const filesBridge = {
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
};

export const excelBridge = {
  saveLocal: (data: { base64: string; suggestedName?: string }) =>
    ipcRenderer.invoke("excel:save-local", data) as Promise<{
      success: boolean;
      path?: string;
      error?: string;
      canceled?: boolean;
    }>,
};

export const imagesBridge = {
  readLocal: (filePath: string) =>
    ipcRenderer.invoke("images:read-local", { filePath }) as Promise<{
      success: boolean;
      data?: string; // base64 encoded image data
      mediaType?: string;
      size?: number;
      error?: string;
    }>,
};

export const pdfBridge = {
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
};

export const securityBridge = {
  getSensitiveStatus: () => ipcRenderer.invoke("security:sensitive-status"),
  unlockSensitive: (data: { ttlMs?: number; reason?: string }) =>
    ipcRenderer.invoke("security:unlock-sensitive", data),
  unlockWithPin: (data: { pin: string; ttlMs?: number }) =>
    ipcRenderer.invoke("security:unlock-with-pin", data),
  setPin: (data: { pin: string }) =>
    ipcRenderer.invoke("security:set-pin", data),
  clearPin: () => ipcRenderer.invoke("security:clear-pin"),
  lockSensitive: () => ipcRenderer.invoke("security:lock-sensitive"),
};
