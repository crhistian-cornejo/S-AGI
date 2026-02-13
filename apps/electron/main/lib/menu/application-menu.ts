/**
 * Application Menu
 *
 * Native macOS/Windows menu bar implementation.
 * Extracted from main/index.ts for modularity.
 */
import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  shell,
} from "electron";
import { is } from "@electron-toolkit/utils";
import { getFileManager } from "../file-manager/file-manager";
import { checkForUpdates } from "../auto-updater";
import type { AppPreferences, PreferencesStore } from "../preferences-store";
import log from "electron-log";

export interface MenuContext {
  getMainWindow: () => BrowserWindow | null;
  getAppPreferences: () => AppPreferences;
  preferencesStore: PreferencesStore;
  applyTrayPreference: (enabled: boolean) => void;
  applyQuickPromptPreference: (enabled: boolean) => void;
  setAppPreferences: (prefs: AppPreferences) => void;
}

let menuContext: MenuContext | null = null;

export function initApplicationMenu(context: MenuContext): void {
  menuContext = context;
}

export function updateApplicationMenu(): void {
  if (!menuContext) {
    log.warn("[Menu] Menu context not initialized, skipping menu update");
    return;
  }

  const { getMainWindow, getAppPreferences, preferencesStore, applyTrayPreference, applyQuickPromptPreference, setAppPreferences } = menuContext;
  const appPreferences = getAppPreferences();

  const openSettings = (tab?: string) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
    win.webContents.send("app:open-settings", { tab });
  };

  const sendMenuAction = (action: string, data?: unknown) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(`menu:${action}`, data);
    }
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS: First menu is always the app name menu
    ...(process.platform === "darwin"
      ? [
          {
            label: app.getName(),
            submenu: [
              {
                label: "About S-AGI",
                click: () => sendMenuAction("show-about"),
              },
              { type: "separator" } as const,
              {
                label: "Settings...",
                accelerator: "Command+,",
                click: () => openSettings("account"),
              },
              {
                label: "API Keys...",
                click: () => openSettings("api-keys"),
              },
              { type: "separator" } as const,
              { role: "services" } as const,
              { type: "separator" } as const,
              { role: "hide" } as const,
              { role: "hideOthers" } as const,
              { role: "unhide" } as const,
              { type: "separator" } as const,
              { role: "quit" } as const,
            ],
          },
        ]
      : []),
    // File menu
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: process.platform === "darwin" ? "Command+N" : "Ctrl+N",
          click: () => sendMenuAction("new-chat"),
        },
        {
          label: "New Spreadsheet",
          accelerator:
            process.platform === "darwin" ? "Command+Shift+N" : "Ctrl+Shift+N",
          click: () => sendMenuAction("new-spreadsheet"),
        },
        {
          label: "New Document",
          accelerator:
            process.platform === "darwin" ? "Command+Option+N" : "Ctrl+Alt+N",
          click: () => sendMenuAction("new-document"),
        },
        { type: "separator" } as const,
        {
          label: "Import Files...",
          accelerator: process.platform === "darwin" ? "Command+U" : "Ctrl+U",
          click: async () => {
            try {
              const result = await dialog.showOpenDialog({
                title: "Select files",
                properties: ["openFile", "multiSelections"],
              });
              if (!result.canceled && result.filePaths.length > 0) {
                const fm = getFileManager();
                await fm.init();
                await fm.importFromPaths(result.filePaths, "inbox");
                sendMenuAction("files-imported");
              }
            } catch (err) {
              log.warn("[Menu] Import failed:", err);
            }
          },
        },
        {
          label: "Open PDF...",
          accelerator: process.platform === "darwin" ? "Command+O" : "Ctrl+O",
          click: async () => {
            try {
              const result = await dialog.showOpenDialog({
                title: "Select PDF files",
                filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
                properties: ["openFile", "multiSelections"],
              });
              if (!result.canceled && result.filePaths.length > 0) {
                const fs = await import("node:fs");
                const path = await import("node:path");
                const files = result.filePaths.map((filePath) => {
                  const stats = fs.statSync(filePath);
                  return {
                    path: filePath,
                    name: path.basename(filePath),
                    size: stats.size,
                  };
                });
                sendMenuAction("open-pdf", { files });
              }
            } catch (err) {
              log.warn("[Menu] Open PDF failed:", err);
            }
          },
        },
        ...(process.platform !== "darwin"
          ? [
              { type: "separator" } as const,
              {
                label: "Settings...",
                accelerator: "Ctrl+,",
                click: () => openSettings("account"),
              },
              { type: "separator" } as const,
              { role: "quit" } as const,
            ]
          : []),
      ],
    },
    // Edit menu
    {
      label: "Edit",
      submenu: [
        { role: "undo" } as const,
        { role: "redo" } as const,
        { type: "separator" } as const,
        { role: "cut" } as const,
        { role: "copy" } as const,
        { role: "paste" } as const,
        { role: "pasteAndMatchStyle" } as const,
        { role: "delete" } as const,
        { type: "separator" } as const,
        { role: "selectAll" } as const,
        ...(process.platform === "darwin"
          ? [
              { type: "separator" } as const,
              {
                label: "Speech",
                submenu: [
                  { role: "startSpeaking" } as const,
                  { role: "stopSpeaking" } as const,
                ],
              },
            ]
          : []),
      ],
    },
    // View menu
    {
      label: "View",
      submenu: [
        ...(is.dev
          ? [
              { role: "reload" } as const,
              { role: "forceReload" } as const,
              { role: "toggleDevTools" } as const,
              { type: "separator" } as const,
            ]
          : []),
        { role: "resetZoom" } as const,
        { role: "zoomIn" } as const,
        { role: "zoomOut" } as const,
        { type: "separator" } as const,
        { role: "togglefullscreen" } as const,
        { type: "separator" } as const,
        {
          label: "Toggle Sidebar",
          accelerator: process.platform === "darwin" ? "Command+B" : "Ctrl+B",
          click: () => sendMenuAction("toggle-sidebar"),
        },
        {
          label: "Show Keyboard Shortcuts",
          accelerator:
            process.platform === "darwin" ? "Command+Shift+/" : "Ctrl+Shift+/",
          click: () => sendMenuAction("show-shortcuts"),
        },
        { type: "separator" } as const,
        {
          label: "Show Tray Icon",
          type: "checkbox",
          checked: appPreferences.trayEnabled,
          click: () => {
            const newValue = !appPreferences.trayEnabled;
            const next = preferencesStore.set({ trayEnabled: newValue });
            setAppPreferences(next);
            applyTrayPreference(newValue);
            updateApplicationMenu();
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("preferences:updated", next);
            }
          },
        },
        {
          label: "Enable Quick Prompt",
          type: "checkbox",
          checked: appPreferences.quickPromptEnabled,
          click: () => {
            const newValue = !appPreferences.quickPromptEnabled;
            const next = preferencesStore.set({ quickPromptEnabled: newValue });
            setAppPreferences(next);
            applyQuickPromptPreference(newValue);
            updateApplicationMenu();
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("preferences:updated", next);
            }
          },
        },
      ],
    },
    // Chat menu
    {
      label: "Chat",
      submenu: [
        {
          label: "Stop Generation",
          accelerator: "Escape",
          click: () => sendMenuAction("stop-generation"),
        },
        {
          label: "Cycle Reasoning Effort",
          accelerator: "Ctrl+Tab",
          click: () => sendMenuAction("cycle-reasoning"),
        },
        { type: "separator" } as const,
        {
          label: "Clear Chat",
          click: () => sendMenuAction("clear-chat"),
        },
        {
          label: "Archive Chat",
          click: () => sendMenuAction("archive-chat"),
        },
        {
          label: "Delete Chat",
          accelerator:
            process.platform === "darwin" ? "Command+Backspace" : "Ctrl+Delete",
          click: () => sendMenuAction("delete-chat"),
        },
      ],
    },
    // Artifact menu
    {
      label: "Artifact",
      submenu: [
        {
          label: "Save Artifact",
          accelerator: process.platform === "darwin" ? "Command+S" : "Ctrl+S",
          click: () => sendMenuAction("save-artifact"),
        },
        {
          label: "Export as Excel...",
          click: () => sendMenuAction("export-excel"),
        },
        {
          label: "Export Chart as PNG...",
          click: () => sendMenuAction("export-chart-png"),
        },
        {
          label: "Export Chart as PDF...",
          click: () => sendMenuAction("export-chart-pdf"),
        },
        {
          label: "Copy Chart to Clipboard",
          click: () => sendMenuAction("copy-chart"),
        },
        {
          label: "Download PDF",
          click: () => sendMenuAction("download-pdf"),
        },
        {
          label: "Open PDF in Browser",
          click: () => sendMenuAction("open-pdf-browser"),
        },
        { type: "separator" } as const,
        {
          label: "Close Artifact Panel",
          accelerator: "Escape",
          click: () => sendMenuAction("close-artifact"),
        },
      ],
    },
    // PDF menu
    {
      label: "PDF",
      submenu: [
        {
          label: "Save PDF with Annotations",
          accelerator: process.platform === "darwin" ? "Command+S" : "Ctrl+S",
          click: () => sendMenuAction("save-pdf-annotations"),
        },
        {
          label: "Navigate to Page...",
          accelerator: process.platform === "darwin" ? "Command+G" : "Ctrl+G",
          click: () => sendMenuAction("pdf-navigate"),
        },
        {
          label: "Highlight Selected Text",
          accelerator: process.platform === "darwin" ? "Command+H" : "Ctrl+H",
          click: () => sendMenuAction("pdf-highlight"),
        },
        { type: "separator" } as const,
        {
          label: "Zoom In",
          accelerator: process.platform === "darwin" ? "Command+=" : "Ctrl+=",
          click: () => sendMenuAction("pdf-zoom-in"),
        },
        {
          label: "Zoom Out",
          accelerator: process.platform === "darwin" ? "Command+-" : "Ctrl+-",
          click: () => sendMenuAction("pdf-zoom-out"),
        },
        {
          label: "Reset Zoom",
          accelerator: process.platform === "darwin" ? "Command+0" : "Ctrl+0",
          click: () => sendMenuAction("pdf-zoom-reset"),
        },
      ],
    },
    // Agent menu
    {
      label: "Agent",
      submenu: [
        {
          label: "Toggle Agent Panel",
          accelerator:
            process.platform === "darwin" ? "Command+Shift+A" : "Ctrl+Shift+A",
          click: () => sendMenuAction("toggle-agent-panel"),
        },
        {
          label: "Clear Agent History",
          click: () => sendMenuAction("clear-agent-history"),
        },
      ],
    },
    // Go menu
    {
      label: "Go",
      submenu: [
        {
          label: "Go to Chat",
          accelerator: process.platform === "darwin" ? "Command+1" : "Ctrl+1",
          click: () => sendMenuAction("go-to-tab", { tab: "chat" }),
        },
        {
          label: "Go to Spreadsheet",
          accelerator: process.platform === "darwin" ? "Command+2" : "Ctrl+2",
          click: () => sendMenuAction("go-to-tab", { tab: "excel" }),
        },
        {
          label: "Go to Document",
          accelerator: process.platform === "darwin" ? "Command+3" : "Ctrl+3",
          click: () => sendMenuAction("go-to-tab", { tab: "doc" }),
        },
        {
          label: "Go to PDF",
          accelerator: process.platform === "darwin" ? "Command+4" : "Ctrl+4",
          click: () => sendMenuAction("go-to-tab", { tab: "pdf" }),
        },
        {
          label: "Go to Ideas",
          accelerator: process.platform === "darwin" ? "Command+5" : "Ctrl+5",
          click: () => sendMenuAction("go-to-tab", { tab: "ideas" }),
        },
        {
          label: "Go to Gallery",
          accelerator: process.platform === "darwin" ? "Command+6" : "Ctrl+6",
          click: () => sendMenuAction("go-to-tab", { tab: "gallery" }),
        },
        { type: "separator" } as const,
        {
          label: "Search / Command K",
          accelerator: process.platform === "darwin" ? "Command+K" : "Ctrl+K",
          click: () => sendMenuAction("command-k"),
        },
      ],
    },
    // Settings menu
    {
      label: "Settings",
      submenu: [
        {
          label: "Account",
          click: () => openSettings("account"),
        },
        {
          label: "Appearance",
          click: () => openSettings("appearance"),
        },
        {
          label: "API Keys",
          click: () => openSettings("api-keys"),
        },
        {
          label: "Advanced",
          click: () => openSettings("advanced"),
        },
        {
          label: "Shortcuts",
          click: () => openSettings("shortcuts"),
        },
        {
          label: "Usage",
          click: () => openSettings("usage"),
        },
        ...(process.env.NODE_ENV === "development"
          ? [
              { type: "separator" } as const,
              {
                label: "Debug",
                click: () => openSettings("debug"),
              },
            ]
          : []),
      ],
    },
    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" } as const,
        { role: "zoom" } as const,
        ...(process.platform === "darwin"
          ? [
              { type: "separator" } as const,
              { role: "front" } as const,
              { type: "separator" } as const,
              { role: "window" } as const,
            ]
          : [{ type: "separator" } as const, { role: "close" } as const]),
      ],
    },
    // Help menu
    {
      label: "Help",
      submenu: [
        {
          label: "About S-AGI",
          click: () => sendMenuAction("show-about"),
        },
        { type: "separator" } as const,
        {
          label: "Check for Updates...",
          click: () => void checkForUpdates(),
        },
        { type: "separator" } as const,
        {
          label: "Keyboard Shortcuts",
          accelerator:
            process.platform === "darwin" ? "Command+Shift+/" : "Ctrl+Shift+/",
          click: () => sendMenuAction("show-shortcuts"),
        },
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal("https://github.com/your-repo/s-agi");
          },
        },
      ],
    },
  ];

  try {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    const menuItems = menu.items.map((item) => item.label).filter(Boolean);
    log.info(
      "[Menu] Application menu updated with",
      menuItems.length,
      "items:",
      menuItems
    );
  } catch (error) {
    log.error("[Menu] Failed to build menu:", error);
  }
}
