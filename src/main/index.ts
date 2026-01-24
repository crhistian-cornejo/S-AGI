import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  Tray,
  Menu,
  nativeImage,
  session,
  shell,
  dialog,
} from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { createIPCHandler } from "trpc-electron/main";
import { appRouter } from "./lib/trpc";
import { createContext } from "./lib/trpc/trpc";
import { supabase } from "./lib/supabase/client";
import { setMainWindow } from "./lib/window-manager";
import { getHotkeyManager, getHotkeyStore } from "./lib/hotkeys";
import { registerFileManagerIpc } from "./lib/file-manager/ipc";
import { registerSecurityIpc } from "./lib/security/ipc";
import { getFileManager } from "./lib/file-manager/file-manager";
import { lockSensitiveNow } from "./lib/security/sensitive-lock";
import { getPreferencesStore } from "./lib/preferences-store";
import { startAIServer, stopAIServer, waitForAIServerReady } from "./lib/ai-server";
import log from "electron-log";

// Basic menu to enable standard shortcuts like Copy/Paste
function updateApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" } as const,
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
    {
      label: "Edit",
      submenu: [
        { role: "undo" } as const,
        { role: "redo" } as const,
        { type: "separator" } as const,
        { role: "cut" } as const,
        { role: "copy" } as const,
        { role: "paste" } as const,
        { role: "selectAll" } as const,
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" } as const,
        { role: "forceReload" } as const,
        { role: "toggleDevTools" } as const,
        { type: "separator" } as const,
        { role: "resetZoom" } as const,
        { role: "zoomIn" } as const,
        { role: "zoomOut" } as const,
        { type: "separator" } as const,
        { role: "togglefullscreen" } as const,
        { type: "separator" } as const,
        {
          label: "Show Tray Icon",
          type: "checkbox",
          checked: appPreferences.trayEnabled,
          click: () => {
            const newValue = !appPreferences.trayEnabled;
            const next = preferencesStore.set({ trayEnabled: newValue });
            appPreferences = next;
            applyTrayPreference(newValue);
            updateApplicationMenu();
            // Notify renderer if needed
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("preferences:updated", next);
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
            appPreferences = next;
            applyQuickPromptPreference(newValue);
            updateApplicationMenu();
            // Notify renderer if needed
             if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("preferences:updated", next);
            }
          },
        },
      ],
    },
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
          : [{ role: "close" } as const]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Suppress Chromium autofill console errors (cosmetic, not actual errors)
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayPopover: BrowserWindow | null = null;
let quickPromptWindow: BrowserWindow | null = null;
let quickPromptShownAt = 0;
const preferencesStore = getPreferencesStore();
let appPreferences = preferencesStore.getAll();

function getAppPreferences() {
  return appPreferences;
}

function applyTrayPreference(enabled: boolean): void {
  if (enabled) {
    if (!tray || tray.isDestroyed()) {
      createTray();
    }
    return;
  }

  if (trayPopover && !trayPopover.isDestroyed()) {
    trayPopover.destroy();
    trayPopover = null;
  }

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

function applyQuickPromptPreference(enabled: boolean): void {
  const hotkeyManager = getHotkeyManager();
  const hotkeyStore = getHotkeyStore();

  if (!enabled) {
    hotkeyManager.unregister("quick-prompt");
    if (quickPromptWindow && !quickPromptWindow.isDestroyed()) {
      quickPromptWindow.destroy();
      quickPromptWindow = null;
    }
    return;
  }

  const config = hotkeyStore.get("quick-prompt");
  if (config?.enabled) {
    hotkeyManager.reregister("quick-prompt");
  }
}

// Get recent items from database (artifacts and chats)
async function getRecentItems(): Promise<
  Array<{
    id: string;
    type: "spreadsheet" | "document" | "chat";
    name: string;
    updatedAt: string;
    chatId?: string;
  }>
> {
  if (!getAppPreferences().trayEnabled) {
    return [];
  }
  try {
    // Get current user session
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return [];
    }

    const recentItems: Array<{
      id: string;
      type: "spreadsheet" | "document" | "chat";
      name: string;
      updatedAt: string;
      chatId?: string;
    }> = [];

    // Get recent artifacts (spreadsheets and documents)
    const { data: artifacts } = await supabase
      .from("artifacts")
      .select("id, type, name, updated_at, chat_id, chats!inner(user_id)")
      .eq("chats.user_id", session.user.id)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (artifacts) {
      for (const artifact of artifacts) {
        recentItems.push({
          id: artifact.id,
          type: artifact.type as "spreadsheet" | "document",
          name: artifact.name,
          updatedAt: artifact.updated_at,
          chatId: artifact.chat_id,
        });
      }
    }

    // Get recent chats
    const { data: chats } = await supabase
      .from("chats")
      .select("id, title, updated_at")
      .eq("user_id", session.user.id)
      .eq("archived", false)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (chats) {
      for (const chat of chats) {
        recentItems.push({
          id: chat.id,
          type: "chat",
          name: chat.title || "Untitled Chat",
          updatedAt: chat.updated_at,
        });
      }
    }

    // Sort all items by updated_at and return top 10
    recentItems.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return recentItems.slice(0, 10);
  } catch (error) {
    log.error("[Tray] Failed to get recent items:", error);
    return [];
  }
}

async function getTraySpreadsheets(): Promise<
  Array<{ id: string; name: string; updatedAt: string; chatId?: string }>
> {
  if (!getAppPreferences().trayEnabled) {
    return [];
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return [];
    }

    const { data, error } = await supabase
      .from("artifacts")
      .select("id, name, updated_at, chat_id, user_id, type")
      .eq("type", "spreadsheet")
      .or(
        `user_id.eq.${session.user.id},chat_id.in.(select id from chats where user_id = '${session.user.id}')`,
      )
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
      chatId: row.chat_id ?? undefined,
    }));
  } catch (error) {
    log.error("[Tray] Failed to get spreadsheets:", error);
    return [];
  }
}

async function getTraySpreadsheetData(
  artifactId: string,
): Promise<{ id: string; name: string; univerData: any } | null> {
  if (!getAppPreferences().trayEnabled) {
    return null;
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return null;
    }

    const { data: artifact, error } = await supabase
      .from("artifacts")
      .select("id, name, univer_data, chat_id, user_id, chats(user_id)")
      .eq("id", artifactId)
      .single();

    if (error) throw new Error(error.message);

    const hasDirectOwnership = artifact.user_id === session.user.id;
    const chatData = Array.isArray(artifact.chats)
      ? artifact.chats[0]
      : artifact.chats;
    const hasChatOwnership = chatData?.user_id === session.user.id;

    if (!hasDirectOwnership && !hasChatOwnership) {
      return null;
    }

    return {
      id: artifact.id,
      name: artifact.name,
      univerData: artifact.univer_data,
    };
  } catch (error) {
    log.error("[Tray] Failed to get spreadsheet data:", error);
    return null;
  }
}

async function getTrayCitations(): Promise<
  Array<{
    id: string;
    kind: "url" | "file";
    label: string;
    url?: string;
    filename?: string;
    chatId: string;
    messageId: string;
    createdAt: string;
    startIndex?: number;
    endIndex?: number;
    fileId?: string;
  }>
> {
  if (!getAppPreferences().trayEnabled) {
    return [];
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return [];
    }

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, chat_id, metadata, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    const items: Array<{
      id: string;
      kind: "url" | "file";
      label: string;
      url?: string;
      filename?: string;
      chatId: string;
      messageId: string;
      createdAt: string;
      startIndex?: number;
      endIndex?: number;
      fileId?: string;
    }> = [];

    for (const row of data || []) {
      const annotations = (row as any)?.metadata?.annotations || [];
      if (!Array.isArray(annotations)) continue;
      annotations.forEach((a: any, idx: number) => {
        if (a?.type === "url_citation" && a.url) {
          items.push({
            id: `${row.id}-url-${idx}`,
            kind: "url",
            label: a.title || a.url,
            url: a.url,
            chatId: row.chat_id,
            messageId: row.id,
            createdAt: row.created_at,
            startIndex: a.startIndex,
            endIndex: a.endIndex,
          });
        }
        if (a?.type === "file_citation" && a.fileId) {
          items.push({
            id: `${row.id}-file-${idx}`,
            kind: "file",
            label: a.filename || "Archivo",
            filename: a.filename || "Archivo",
            fileId: a.fileId,
            chatId: row.chat_id,
            messageId: row.id,
            createdAt: row.created_at,
          });
        }
      });
    }

    return items;
  } catch (error) {
    log.error("[Tray] Failed to get citations:", error);
    return [];
  }
}

// Create the tray popover window
function createTrayPopover(): BrowserWindow {
  const popover = new BrowserWindow({
    width: 380, // Increased to allow for shadows
    height: 700, // Increased to allow for shadows
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    hasShadow: true,
    vibrancy: process.platform === "darwin" ? "popover" : undefined,
    visualEffectState: "active",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachNavigationGuards(popover, getRendererOrigins());

  // Load the tray popover page
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    popover.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/tray-popover.html`,
    );
  } else {
    popover.loadFile(join(__dirname, "../renderer/tray-popover.html"));
  }

  // Hide on blur
  popover.on("blur", () => {
    popover.hide();
  });

  popover.on("show", () => {
    popover.webContents.send("tray:refresh");
  });

  log.info("[Tray] Popover window created");
  return popover;
}

// ═══ QUICK PROMPT WINDOW (Spotlight-style floating input) ═══
function createQuickPromptWindow(): BrowserWindow {
  const { screen } = require("electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  const windowWidth = 600;
  const windowHeight = 120; // Increased to avoid clipping animations

  // Calculate center position
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.round((screenHeight - windowHeight) / 2) - 100; // Slightly above center

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    focusable: true,
    type: process.platform === "darwin" ? "panel" : undefined,
    backgroundColor: "#00000000",
    thickFrame: false, // Prevents Windows default resize/shadow behavior
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachNavigationGuards(win, getRendererOrigins());

  // Windows 11 Fix: Disable rounded corners and system materials that cause border artifacts
  if (process.platform === "win32") {
    win.setMenuBarVisibility(false);
    // @ts-ignore - Electron 28+ / Windows 11 specific
    if (win.setBackgroundMaterial) win.setBackgroundMaterial("none");
  }

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/quick-prompt.html`);
  } else {
    win.loadFile(join(__dirname, "../renderer/quick-prompt.html"));
  }

  win.on("blur", () => {
    // Evitar ocultar por un blur espurio al abrir (p. ej. Windows)
    if (Date.now() - quickPromptShownAt < 500) return;
    win.hide();
  });

  log.info("[QuickPrompt] Window created");
  return win;
}

function showQuickPromptWindow(): void {
  if (!quickPromptWindow || quickPromptWindow.isDestroyed()) {
    quickPromptWindow = createQuickPromptWindow();
  }

  const { screen } = require("electron");
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);

  const windowWidth = 600;
  const windowHeight = 60;

  // Center horizontally and vertically on the current display (slightly above center)
  const x = Math.round(
    display.bounds.x + (display.bounds.width - windowWidth) / 2,
  );
  const y =
    Math.round(display.bounds.y + (display.bounds.height - windowHeight) / 2) -
    100;

  quickPromptWindow.setBounds({
    x,
    y,
    width: windowWidth,
    height: windowHeight,
  });
  quickPromptShownAt = Date.now();

  // Ensure always on top
  quickPromptWindow.setAlwaysOnTop(true, "floating");
  quickPromptWindow.show();
  quickPromptWindow.focus();

  log.info("[QuickPrompt] Window centered at", { x, y });
}

// Position and show popover near tray icon
function showTrayPopover(): void {
  if (!tray || !trayPopover) return;

  const trayBounds = tray.getBounds();
  const popoverBounds = trayPopover.getBounds();

  // Calculate position (center below tray icon on macOS)
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - 350 / 2); // Use 350 as logical width
  let y: number;

  if (process.platform === "darwin") {
    // macOS: Below the menu bar
    y = Math.round(trayBounds.y + trayBounds.height + 4);
  } else {
    // Windows/Linux: Above the taskbar (tray is at bottom)
    y = Math.round(trayBounds.y - 650 - 4); // Use 650 as logical height
  }

  // Ensure popover stays on screen
  const { screen } = require("electron");
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });
  const displayBounds = display.workArea;

  // Horizontal bounds check
  if (x < displayBounds.x) {
    x = displayBounds.x + 8;
  } else if (x + popoverBounds.width > displayBounds.x + displayBounds.width) {
    x = displayBounds.x + displayBounds.width - popoverBounds.width - 8;
  }

  trayPopover.setPosition(x, y);
  trayPopover.show();
  trayPopover.focus();
}

function getRendererOrigins(): string[] {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return [new URL(process.env.ELECTRON_RENDERER_URL).origin];
  }
  return [];
}

function isAllowedNavigation(url: string, allowedOrigins: string[]): boolean {
  if (url.startsWith("file://")) return true;
  return allowedOrigins.some((origin) => url.startsWith(origin));
}

function attachNavigationGuards(
  window: BrowserWindow,
  allowedOrigins: string[],
): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url, allowedOrigins)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, allowedOrigins)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function registerContentSecurityPolicy(): void {
  const rendererOrigins = getRendererOrigins();
  const devOrigins = rendererOrigins.join(" ");

  // Script src needs blob: for Web Workers (used by PDFium engine)
  const scriptSrc = is.dev
    ? `'self' 'unsafe-eval' 'unsafe-inline' blob: ${devOrigins}`
    : `'self' blob:`;

  const csp = [
    `default-src 'self' ${devOrigins}`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' ${devOrigins}`,
    `img-src 'self' data: blob: https: file:`,
    `font-src 'self' data:`,
    `connect-src 'self' https: wss: http://127.0.0.1:* blob: data: ${devOrigins}`,
    `media-src 'self' blob: data:`,
    `worker-src 'self' blob:`, // Required for PDFium Web Workers
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    responseHeaders["Content-Security-Policy"] = [csp];
    callback({ responseHeaders });
  });
}

function createTray(): void {
  // macOS: Template images should be PNG for best compatibility
  // Electron auto-selects @2x on Retina if both exist
  // Simplified: always use __dirname since we copy icons to out/main
  const basePath = __dirname;
  log.info("[Tray] Creating tray with base path:", basePath);

  const pngPath = join(basePath, "trayTemplate.png");
  const png2xPath = join(basePath, "trayTemplate@2x.png");
  const svgPath = join(basePath, "trayTemplate.svg");

  log.info("[Tray] Checking paths:", { pngPath, png2xPath, svgPath });

  let icon: Electron.NativeImage | null = null;

  // Best: Load both 1x and 2x PNGs for proper Retina support
  if (existsSync(pngPath) && existsSync(png2xPath)) {
    log.info("[Tray] Loading PNG with @2x variant");
    icon = nativeImage.createFromPath(pngPath);
    // Electron automatically picks up @2x when main file exists
  } else if (existsSync(pngPath)) {
    log.info("[Tray] Loading PNG (no @2x)");
    icon = nativeImage.createFromPath(pngPath);
  } else if (existsSync(svgPath)) {
    log.info("[Tray] Falling back to SVG");
    icon = nativeImage.createFromPath(svgPath);
    // SVG needs resize
    icon = icon.resize({ width: 18, height: 18 });
  }

  if (!icon || icon.isEmpty()) {
    log.error("[Tray] No tray icon found at:", basePath);
    log.error("[Tray] Checked paths:", { pngPath, png2xPath, svgPath });
    icon = nativeImage.createEmpty();
    log.warn("[Tray] Using empty fallback icon");
  } else {
    log.info("[Tray] Icon loaded successfully, size:", icon.getSize());
  }

  // macOS: Mark as template so it adapts to dark/light menu bar
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);

  log.info("[Tray] Tray instance created");

  // Create popover window
  trayPopover = createTrayPopover();

  // Build context menu (right-click)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open S-AGI",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: "Import Files…",
      accelerator: process.platform === "darwin" ? "Cmd+U" : "Ctrl+U",
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
            trayPopover?.webContents.send("tray:refresh");
          }
        } catch (err) {
          log.warn("[Tray] Import failed:", err);
        }
      },
    },
    {
      label: "Lock Sensitive Files",
      click: () => {
        lockSensitiveNow();
        trayPopover?.webContents.send("tray:refresh");
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip("S-AGI Agent");

  // On macOS, left-click shows popover, right-click shows context menu
  if (process.platform === "darwin") {
    // Don't set context menu for left click
    tray.on("click", () => {
      if (trayPopover?.isVisible()) {
        trayPopover.hide();
      } else {
        showTrayPopover();
      }
    });
    tray.on("right-click", () => {
      tray?.popUpContextMenu(contextMenu);
    });
  } else {
    // Windows/Linux: Use context menu for all clicks
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      if (trayPopover?.isVisible()) {
        trayPopover.hide();
      } else {
        showTrayPopover();
      }
    });
  }
}

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 860,
    height: 730,
    minWidth: 835,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hiddenInset",
    icon:
      process.platform === "darwin"
        ? join(__dirname, "icon.icns")
        : process.platform === "win32"
          ? join(__dirname, "icon.ico")
          : join(__dirname, "../../public/logo.svg"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Register main window for IPC events (streaming, etc.)
  setMainWindow(mainWindow);

  attachNavigationGuards(mainWindow, getRendererOrigins());

  // Load the renderer
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Show window when ready
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  // Notify renderer when maximized/unmaximized (for title-bar icon)
  mainWindow.on("maximize", () =>
    mainWindow?.webContents.send("window:maximize-changed", true),
  );
  mainWindow.on("unmaximize", () =>
    mainWindow?.webContents.send("window:maximize-changed", false),
  );

  // DevTools: use View > Toggle DevTools (Ctrl+Shift+I). No auto-open to avoid
  // Chromium console noise (language-mismatch, Autofill.enable, etc.).
}

// Initialize tRPC IPC handler
function setupTRPC(): void {
  createIPCHandler({ router: appRouter, createContext });
}

// Handle deep links - parse OAuth tokens from URL
function handleDeepLink(url: string) {
  log.info("[DeepLink] Received:", url);

  if (!url.startsWith("s-agi://auth/callback")) return;

  try {
    // Parse the URL - handle both hash fragments (#) and query params (?)
    const urlObj = new URL(url);

    // Check for authorization code flow (code in query params)
    const code = urlObj.searchParams.get("code");
    if (code) {
      log.info("[DeepLink] Got authorization code");
      mainWindow?.webContents.send("auth:callback", { type: "code", code });
      mainWindow?.focus();
      return;
    }

    // Check for implicit flow (tokens in hash fragment)
    // Hash is everything after #, parse it like query params
    const hashParams = new URLSearchParams(url.split("#")[1] || "");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (accessToken) {
      log.info("[DeepLink] Got access token from implicit flow");
      mainWindow?.webContents.send("auth:callback", {
        type: "tokens",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: hashParams.get("expires_at"),
        provider_token: hashParams.get("provider_token"),
      });
      mainWindow?.focus();
      return;
    }

    log.warn("[DeepLink] No auth data found in URL");
  } catch (error) {
    log.error("[DeepLink] Error parsing URL:", error);
  }
}

// Windows/Linux: Handle deep links via second-instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // Find the deep link URL in command line args
    const url = commandLine.find((arg) => arg.startsWith("s-agi://"));
    if (url) {
      handleDeepLink(url);
    }

    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS: Handle deep links when app is already running
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Register protocol for deep links
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("s-agi", process.execPath, [
      process.argv[1],
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("s-agi");
}

// App lifecycle
app.whenReady().then(() => {
  // Set app name to avoid "Electron" in dock/menu bar
  app.setName("S-AGI");

  // Set app icon for macOS dock in development
  if (process.platform === "darwin") {
    const iconPath = join(__dirname, "icon.icns");
    log.info("[App] Setting dock icon from:", iconPath);
    if (existsSync(iconPath)) {
      const image = nativeImage.createFromPath(iconPath);
      if (!image.isEmpty()) {
        app.dock.setIcon(image);
        log.info("[App] Dock icon set successfully");
      } else {
        log.error("[App] Dock icon image is empty");
      }
    } else {
      log.error("[App] Dock icon file not found at:", iconPath);
    }
  }

  // Set app user model id for Windows
  electronApp.setAppUserModelId("com.sagi");

  // Watch shortcuts in development
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerContentSecurityPolicy();

  // Start local AI server for BlockNote AI
  startAIServer().then((port) => {
    log.info(`[App] AI Server started on port ${port}`);
  }).catch((error) => {
    log.error("[App] Failed to start AI server:", error);
  });

  // IPC handler to get AI server port (waits for server to be ready)
  ipcMain.handle("ai:get-port", () => waitForAIServerReady());

  // Setup tRPC
  setupTRPC();

  // Initialize menu
  updateApplicationMenu();

  // Create window
  createWindow();

  applyTrayPreference(appPreferences.trayEnabled);

  registerSecurityIpc();
  registerFileManagerIpc(() => trayPopover);

  // ═══ CONFIGURABLE HOTKEYS ═══
  // Set up hotkey handlers and register all configured shortcuts
  const hotkeyManager = getHotkeyManager();

  // Register handler for Quick Prompt
  hotkeyManager.setHandler("quick-prompt", () => {
    showQuickPromptWindow();
  });

  // Register all configured hotkeys
  hotkeyManager.registerAll();
  applyQuickPromptPreference(appPreferences.quickPromptEnabled);

  // Log registration results
  const statuses = hotkeyManager.getAllStatus();
  for (const status of statuses) {
    if (status.isRegistered) {
      log.info(`[App] Hotkey registered: ${status.id} → ${status.shortcut}`);
    } else if (status.enabled) {
      log.warn(
        `[App] Hotkey failed to register: ${status.id} → ${status.shortcut} (${status.error})`,
      );
    }
  }

  app.on("activate", () => {
    // macOS: Re-create or restore window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      // Restore minimized window and bring to focus
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Graceful shutdown - Clean up resources before quitting
app.on("before-quit", () => {
  log.info("[App] Before quit - cleaning up resources...");

  // Stop AI server
  stopAIServer();

  // Unregister all hotkeys
  getHotkeyManager().unregisterAll();

  // Destroy quick prompt window
  if (quickPromptWindow && !quickPromptWindow.isDestroyed()) {
    quickPromptWindow.destroy();
    quickPromptWindow = null;
  }

  // Destroy tray popover (check if not already destroyed)
  if (trayPopover && !trayPopover.isDestroyed()) {
    trayPopover.destroy();
    trayPopover = null;
  }

  // Destroy tray
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }

  log.info("[App] Cleanup completed");
});

// Handle dev server shutdown signals (SIGINT = Ctrl+C, SIGTERM = kill, SIGHUP = terminal close)
// This ensures the Electron app quits cleanly when the dev server is killed
const gracefulShutdown = (signal: string) => {
  log.info(`[App] Received ${signal}, initiating graceful shutdown...`);

  // Close main window first (check if not already destroyed)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
    mainWindow = null;
  }

  // Destroy tray popover (check if not already destroyed)
  if (trayPopover && !trayPopover.isDestroyed()) {
    trayPopover.destroy();
    trayPopover = null;
  }

  // Destroy tray (check if not already destroyed)
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }

  // Quit the app
  app.quit();
};

// Register signal handlers for graceful shutdown
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

// IPC handlers for window controls
ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow?.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("app:getVersion", () => {
  return app.getVersion();
});

ipcMain.handle(
  "auth:set-session",
  async (
    _,
    session: { access_token?: string; refresh_token?: string } | null,
  ) => {
    log.info(
      "[Auth] Synchronizing session from renderer, has tokens:",
      !!session?.access_token,
    );
    try {
      if (session?.access_token && session?.refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (error) throw error;
        log.info(
          "[Auth] Session synchronized successfully, user:",
          data.user?.id?.substring(0, 8) + "...",
        );

        // Verify it persisted
        const {
          data: { session: verifySession },
        } = await supabase.auth.getSession();
        log.info(
          "[Auth] Verification - session exists:",
          !!verifySession,
          "user:",
          verifySession?.user?.id?.substring(0, 8) + "...",
        );
      } else {
        await supabase.auth.signOut();
        log.info("[Auth] Session cleared (sign out)");
      }
      return { success: true };
    } catch (error) {
      log.error("[Auth] Failed to synchronize session:", error);
      return { success: false, error: (error as Error).message };
    }
  },
);

ipcMain.handle("theme:get", () => {
  return nativeTheme.themeSource;
});

ipcMain.handle("theme:set", (_, theme: "system" | "light" | "dark") => {
  nativeTheme.themeSource = theme;
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle("preferences:get", () => {
  return getAppPreferences();
});

ipcMain.handle(
  "preferences:set",
  (_event, patch: { trayEnabled?: boolean; quickPromptEnabled?: boolean }) => {
    const safePatch = patch && typeof patch === "object" ? patch : {};
    const next = preferencesStore.set({
      trayEnabled:
        typeof safePatch.trayEnabled === "boolean"
          ? safePatch.trayEnabled
          : undefined,
      quickPromptEnabled:
        typeof safePatch.quickPromptEnabled === "boolean"
          ? safePatch.quickPromptEnabled
          : undefined,
    });
    appPreferences = next;
    applyTrayPreference(next.trayEnabled);
    applyQuickPromptPreference(next.quickPromptEnabled);
    updateApplicationMenu();
    return next;
  },
);

// Clipboard handlers
ipcMain.handle("clipboard:write-text", (_, text: string) => {
  const { clipboard } = require("electron");
  clipboard.writeText(text);
  return true;
});

ipcMain.handle("clipboard:read-text", () => {
  const { clipboard } = require("electron");
  return clipboard.readText();
});

// Haptic feedback handler (macOS only)
// Uses Electron's built-in haptic feedback support on macOS
ipcMain.handle("haptic:perform", (_, type: string) => {
  if (process.platform !== "darwin") {
    return false;
  }

  // Map our types to Electron's NSHapticFeedbackPattern names
  // Electron doesn't expose NSHapticFeedbackManager directly,
  // but we can use BrowserWindow.setVibrancy or native modules
  // For now, we'll use a no-op that can be enhanced with native module
  // like 'electron-osx-haptic' if needed

  try {
    // Log the haptic request for debugging
    log.debug(`[Haptic] Requested feedback type: ${type}`);

    // Haptic feedback would require a native module like:
    // const { performHapticFeedback } = require('electron-osx-haptic')
    // performHapticFeedback(type)

    return true;
  } catch (error) {
    log.error("[Haptic] Failed to perform feedback:", error);
    return false;
  }
});

// Tray Popover IPC handlers
ipcMain.handle("tray:get-recent-items", async () => {
  return await getRecentItems();
});

ipcMain.handle("tray:get-user", async () => {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const email = user.email || "";
    const avatarUrl = (user.user_metadata as any)?.avatar_url || null;
    const fullName = (user.user_metadata as any)?.full_name || null;
    return { email, avatarUrl, fullName };
  } catch (err) {
    log.warn("[Tray] Failed to get user:", err);
    return null;
  }
});

ipcMain.handle("tray:get-spreadsheets", async () => {
  return await getTraySpreadsheets();
});

ipcMain.handle(
  "tray:get-spreadsheet-data",
  async (_event, input: { id: string }) => {
    if (!input?.id) return null;
    return await getTraySpreadsheetData(input.id);
  },
);

ipcMain.handle("tray:get-citations", async () => {
  return await getTrayCitations();
});

// ═══ QUICK PROMPT IPC HANDLER ═══
ipcMain.handle("quick-prompt:send", async (_, message: string) => {
  log.info("[QuickPrompt] Received message:", message.substring(0, 50) + "...");

  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("quick-prompt:create-chat", message);
  }

  return { success: true };
});

ipcMain.handle(
  "tray:action",
  async (_, data: { action: string; [key: string]: unknown }) => {
    const { action } = data;
    log.info("[Tray] Action received:", action);

    switch (action) {
      case "open-main":
        // Hide popover and show main window
        trayPopover?.hide();
        mainWindow?.show();
        mainWindow?.focus();
        break;

      case "new-chat":
        // Hide popover, show main window, and trigger new chat via IPC
        trayPopover?.hide();
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send("tray:new-chat");
        break;

      case "new-spreadsheet":
        // Hide popover, show main window, and trigger new spreadsheet
        trayPopover?.hide();
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send("tray:new-spreadsheet");
        break;

      case "new-document":
        // Hide popover, show main window, and trigger new document
        trayPopover?.hide();
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send("tray:new-document");
        break;

      case "open-item":
        // Open a specific item (artifact or chat)
        trayPopover?.hide();
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send("tray:open-item", {
          itemId: data.itemId,
          type: data.type,
          chatId: data.chatId,
        });
        break;

      case "settings":
        // Open settings
        trayPopover?.hide();
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send("tray:open-settings");
        break;

      case "open-local-pdf": {
        // Open file picker for local PDFs, then send to main window
        trayPopover?.hide();
        const fs = await import("node:fs");
        const path = await import("node:path");
        const result = await dialog.showOpenDialog({
          title: "Select PDF files to view",
          filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
          properties: ["openFile", "multiSelections"],
        });
        if (!result.canceled && result.filePaths.length > 0) {
          const files = result.filePaths.map((filePath) => {
            const stats = fs.statSync(filePath);
            return {
              path: filePath,
              name: path.basename(filePath),
              size: stats.size,
            };
          });
          mainWindow?.show();
          mainWindow?.focus();
          mainWindow?.webContents.send("tray:open-local-pdfs", { files });
        }
        break;
      }

      case "quit":
        app.quit();
        break;

      default:
        log.warn("[Tray] Unknown action:", action);
    }
  },
);
