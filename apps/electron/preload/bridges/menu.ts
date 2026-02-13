import { ipcRenderer } from "electron";

export const menuBridge = {
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
  onShowAbout: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("menu:show-about", handler);
    return () => {
      ipcRenderer.removeListener("menu:show-about", handler);
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
  onToggleZenMode: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("menu:toggle-zen-mode", handler);
    return () => {
      ipcRenderer.removeListener("menu:toggle-zen-mode", handler);
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
};
