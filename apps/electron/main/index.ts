import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  dialog,
  powerMonitor,
} from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { createIPCHandler } from "trpc-electron/main";
import { appRouter } from "./lib/trpc";
import { createContext } from "./lib/trpc/trpc";
import { supabase, initializeAuth } from "./lib/supabase/client";
import { setMainWindow } from "./lib/window-manager";
import { initializeStorage, closeStorage } from "./lib/storage";
import { getHotkeyManager, getHotkeyStore } from "./lib/hotkeys";
import { registerFileManagerIpc } from "./lib/file-manager/ipc";
import { registerSecurityIpc } from "./lib/security/ipc";
import { getRendererOrigins, isTrustedRendererUrl } from "./lib/security/ipc-validation";
import { getFileManager } from "./lib/file-manager/file-manager";
import { lockSensitiveNow } from "./lib/security/sensitive-lock";
import { getPreferencesStore } from "./lib/preferences-store";
import { startAIServer, stopAIServer, waitForAIServerReady } from "./lib/ai/blocknote-server";
import { initAutoUpdater } from "./lib/auto-updater";
import { initApplicationMenu, updateApplicationMenu } from "./lib/menu/application-menu";
import { registerAllIpcHandlers } from "./lib/ipc/register-all";
import log from "electron-log";

const appDisplayName = "S-AGI";
app.setName(appDisplayName);

// Helper to safely show and focus main window
function showMainWindow(): boolean {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return true;
  }
  return false;
}

// Helper to safely send IPC to main window
function sendToMainWindow(channel: string, ...args: unknown[]): boolean {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
    return true;
  }
  return false;
}

// Security recommendation #19: Electron fuses
// NOTE: Fuses must be configured at BUILD TIME, not runtime.
// They are configured in the electron-builder process or via @electron/fuses CLI.
// See: https://www.electronjs.org/docs/latest/tutorial/fuses
// For this app, fuses should be configured in the build process.

// Suppress Chromium autofill console errors (cosmetic, not actual errors)
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

// GPU performance optimizations
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization");

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
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
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
        `user_id.eq.${session.user.id},chat_id.in.(select id from chats where user_id = '${session.user.id}')`
      )
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    return (data || []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      updatedAt: row.updated_at as string,
      chatId: (row.chat_id as string | null) ?? undefined,
    }));
  } catch (error) {
    log.error("[Tray] Failed to get spreadsheets:", error);
    return [];
  }
}

async function getTraySpreadsheetData(
  artifactId: string
): Promise<{ id: string; name: string; univerData: unknown } | null> {
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
      const metadata = row.metadata as Record<string, unknown> | null;
      const annotations = (metadata?.annotations as unknown[]) || [];
      if (!Array.isArray(annotations)) continue;
      annotations.forEach((a: unknown, idx: number) => {
        const annotation = a as Record<string, unknown> | null;
        if (annotation?.type === "url_citation" && annotation.url) {
          items.push({
            id: `${row.id}-url-${idx}`,
            kind: "url",
            label: (annotation.title as string) || (annotation.url as string),
            url: annotation.url as string,
            chatId: row.chat_id,
            messageId: row.id,
            createdAt: row.created_at,
            startIndex: annotation.startIndex as number | undefined,
            endIndex: annotation.endIndex as number | undefined,
          });
        }
        if (annotation?.type === "file_citation" && annotation.fileId) {
          items.push({
            id: `${row.id}-file-${idx}`,
            kind: "file",
            label: (annotation.filename as string) || "Archivo",
            filename: (annotation.filename as string) || "Archivo",
            fileId: annotation.fileId as string,
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
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      v8CacheOptions: "bypassHeatCheck",
    },
  });

  attachNavigationGuards(popover, getRendererOrigins());

  // Load the tray popover page
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    popover.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/tray-popover.html`
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
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      v8CacheOptions: "bypassHeatCheck",
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

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);

  const windowWidth = 600;
  const windowHeight = 60;

  // Center horizontally and vertically on the current display (slightly above center)
  const x = Math.round(
    display.bounds.x + (display.bounds.width - windowWidth) / 2
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
    // Windows/Linux: Detect if taskbar is at top or bottom based on tray Y position
    const nearestDisplay = screen.getDisplayNearestPoint({
      x: trayBounds.x,
      y: trayBounds.y,
    });
    const isTaskbarAtTop = trayBounds.y < nearestDisplay.workArea.y + nearestDisplay.workArea.height / 2;
    if (isTaskbarAtTop) {
      // Taskbar at top: show popover below tray
      y = Math.round(trayBounds.y + trayBounds.height + 4);
    } else {
      // Taskbar at bottom: show popover above tray
      y = Math.round(trayBounds.y - 650 - 4); // Use 650 as logical height
    }
  }

  // Ensure popover stays on screen
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

function isAllowedNavigation(url: string, allowedOrigins: string[]): boolean {
  if (url.startsWith("file://")) return true;
  return isTrustedRendererUrl(url, allowedOrigins);
}

function attachNavigationGuards(
  window: BrowserWindow,
  allowedOrigins: string[]
): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url, allowedOrigins)) {
      return { action: "allow" };
    }
    // Security recommendation #15: Validate URLs before using shell.openExternal
    if (isSafeForExternalOpen(url)) {
      shell.openExternal(url);
    } else {
      log.warn(`[Security] Blocked unsafe external URL: ${url}`);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, allowedOrigins)) {
      event.preventDefault();
      // Security recommendation #15: Validate URLs before using shell.openExternal
      if (isSafeForExternalOpen(url)) {
        shell.openExternal(url);
      } else {
        log.warn(`[Security] Blocked unsafe navigation to: ${url}`);
      }
    }
  });
}

/**
 * Check if an IP address is in a private/reserved range (RFC 1918 + loopback)
 * Covers: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
 */
function isPrivateIP(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||                          // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||          // 192.168.0.0/16
    a === 127                            // 127.0.0.0/8
  );
}

/**
 * Validate if a URL is safe to open externally
 * Security recommendation #15: Do not use shell.openExternal with untrusted content
 */
function isSafeForExternalOpen(url: string): boolean {
  try {
    const { URL } = require("node:url");
    const parsedUrl = new URL(url);

    // Only allow http/https protocols
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      log.warn(
        `[Security] Blocked non-HTTP(S) protocol: ${parsedUrl.protocol}`
      );
      return false;
    }

    // Block localhost/private IP ranges (RFC 1918 + loopback)
    // Allow 127.0.0.1 for dev server, but block all other private addresses
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === "localhost") {
      log.warn(`[Security] Blocked localhost: ${hostname}`);
      return false;
    }

    if (isPrivateIP(hostname) && hostname !== "127.0.0.1") {
      log.warn(`[Security] Blocked private IP range: ${hostname}`);
      return false;
    }

    return true;
  } catch (error) {
    log.error(`[Security] Invalid URL for external open: ${url}`, error);
    return false;
  }
}

function registerContentSecurityPolicy(): void {
  const rendererOrigins = getRendererOrigins();
  const devOrigins = rendererOrigins.join(" ");

  // Script src needs blob: for Web Workers (used by PDFium engine)
  // 'unsafe-eval' is required for WebAssembly (used by PDFium WASM)
  // In production, avoid eval/inline sources where possible
  const scriptSrc = is.dev
    ? `'self' 'unsafe-inline' 'unsafe-eval' blob: ${devOrigins}`
    : `'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:`;

  const csp = [
    `default-src 'self' blob: ${devOrigins}`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' ${devOrigins}`,
    `img-src 'self' data: blob: https: file:`,
    `font-src 'self' data:`,
    `connect-src 'self' https: wss: http://127.0.0.1:* blob: data: ${devOrigins}`,
    `media-src 'self' blob: data:`,
    `worker-src 'self' blob:`, // Required for PDFium Web Workers
    `frame-src 'self' blob: data: ${devOrigins}`, // Required for PDF preview iframe
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

/**
 * Register permission request handler for session
 * Security recommendation #5: Handle session permission requests from remote content
 */
function registerPermissionRequestHandler(): void {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const url = webContents.getURL();

      // Only allow permissions for local content (file://) or trusted dev origins
      const rendererOrigins = getRendererOrigins();
      const isLocal = url.startsWith("file://");
      const isTrustedOrigin = isTrustedRendererUrl(url, rendererOrigins);

      if (!isLocal && !isTrustedOrigin) {
        log.warn(
          `[Security] Permission request denied for untrusted origin: ${url}`
        );
        return callback(false);
      }

      // Allow camera/microphone access for trusted origins
      if (permission === "media" && (isLocal || isTrustedOrigin)) {
        const mediaTypes =
          (details as { mediaTypes?: string[] })?.mediaTypes ?? [];
        const mediaLabel =
          mediaTypes.length > 0 ? mediaTypes.join(", ") : "unknown";
        log.info(
          `[Security] Allowing media permission '${permission}' (${mediaLabel}) for: ${url}`
        );
        return callback(true);
      }

      // Allow notifications for trusted origins
      if (permission === "notifications" && (isLocal || isTrustedOrigin)) {
        log.info(`[Security] Allowing notification permission for: ${url}`);
        return callback(true);
      }

      // Allow clipboard permissions for trusted origins (needed for Univer)
      if (
        (permission === "clipboard-sanitized-write" ||
          permission === "clipboard-read") &&
        (isLocal || isTrustedOrigin)
      ) {
        log.info(
          `[Security] Allowing clipboard permission '${permission}' for: ${url}`
        );
        return callback(true);
      }

      // Deny all other permissions by default
      log.warn(`[Security] Permission '${permission}' denied for: ${url}`);
      callback(false);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, _requestingOrigin, details) => {
      const url = webContents?.getURL() ?? "";
      const rendererOrigins = getRendererOrigins();
      const isLocal = url.startsWith("file://");
      const isTrustedOrigin = isTrustedRendererUrl(url, rendererOrigins);

      if (!isLocal && !isTrustedOrigin) {
        log.warn(
          `[Security] Permission check denied for untrusted origin: ${url}`
        );
        return false;
      }

      if (permission === "media") {
        const mediaType =
          (details as { mediaType?: string })?.mediaType ?? "unknown";
        log.info(
          `[Security] Permission check allowed '${permission}' (${mediaType}) for: ${url}`
        );
        return true;
      }

      if (permission === "notifications") return true;

      if (
        permission === "clipboard-sanitized-write" ||
        permission === "clipboard-read"
      ) {
        return true;
      }

      return false;
    }
  );
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
  // Create the browser window with performance optimizations
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 835,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hiddenInset",
    // macOS: Position traffic lights consistently across macOS versions
    ...(process.platform === "darwin" && {
      trafficLightPosition: { x: 12, y: 12 },
    }),
    // Windows: Enable native visual effects
    ...(process.platform === "win32" && {
      backgroundColor: "#00000000",
      transparent: false,
      backgroundMaterial: "mica", // Windows 11 Mica effect
    }),
    // Linux: Use standard frame with hidden menu bar for better DE integration
    ...(process.platform === "linux" && {
      autoHideMenuBar: true,
    }),
    icon:
      process.platform === "darwin"
        ? join(__dirname, "icon.icns")
        : process.platform === "win32"
        ? join(__dirname, "icon.ico")
        : join(__dirname, "logo.svg"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true, // Throttle renderer when minimized/hidden to save CPU/memory
      v8CacheOptions: "bypassHeatCheck", // Faster V8 compilation caching
      spellcheck: false, // Disable browser spellcheck (app handles it)
      webgl: true, // Enable GPU acceleration for WebGL
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
    // Ensure menu is set after window is ready
    updateApplicationMenu();
    // Initialize auto-updater (only in production)
    if (!is.dev && mainWindow) {
      initAutoUpdater(mainWindow);
    }
  });

  // Notify renderer when maximized/unmaximized (for title-bar icon)
  mainWindow.on("maximize", () =>
    mainWindow?.webContents.send("window:maximize-changed", true)
  );
  mainWindow.on("unmaximize", () =>
    mainWindow?.webContents.send("window:maximize-changed", false)
  );

  // Fix zoom out on non-US keyboard layouts (e.g. Spanish) where Cmd+- may not register
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if ((input.meta || input.control) && !input.shift && !input.alt && input.key === "-") {
      mainWindow?.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5);
      event.preventDefault();
    }
  });

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
    if (mainWindow && !mainWindow.isDestroyed()) {
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
app.whenReady().then(async () => {
  app.setAboutPanelOptions({ applicationName: app.getName() });

  // Initialize local storage (SQLite) - runs before window creation
  try {
    const adapter = await initializeStorage("local");
    if (adapter && adapter.isConnected) {
      log.info(
        "[App] Local storage initialized successfully, isConnected:",
        adapter.isConnected
      );
    } else {
      log.warn(
        "[App] Local storage adapter created but not connected - cloud mode may be required"
      );
    }
  } catch (error) {
    log.error("[App] Failed to initialize local storage:", error);
    // Show error dialog in production
    if (!is.dev) {
      dialog.showErrorBox(
        "Storage Initialization Error",
        `Failed to initialize local storage: ${
          error instanceof Error ? error.message : String(error)
        }\n\nThe app may not function correctly.`
      );
    }
  }

  // Initialize auth and restore session from encrypted storage
  try {
    await initializeAuth();
    log.info("[App] Auth system initialized");
  } catch (error) {
    log.error("[App] Failed to initialize auth:", error);
  }

  // Set app icon for macOS dock in development
  if (process.platform === "darwin") {
    const iconPath = join(__dirname, "icon.icns");
    log.info("[App] Setting dock icon from:", iconPath);
    if (existsSync(iconPath)) {
      try {
        // Set icon directly from path - Electron handles .icns files natively
        app.dock.setIcon(iconPath);
        log.info("[App] Dock icon set successfully");
      } catch (error) {
        log.error("[App] Failed to set dock icon:", error);
        // Fallback: try creating NativeImage first
        try {
          const image = nativeImage.createFromPath(iconPath);
          if (!image.isEmpty()) {
            app.dock.setIcon(image);
            log.info("[App] Dock icon set via NativeImage fallback");
          } else {
            log.warn("[App] Dock icon image is empty, skipping");
          }
        } catch (fallbackError) {
          log.error("[App] Fallback method also failed:", fallbackError);
        }
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
  registerPermissionRequestHandler();

  // Start local AI server for BlockNote AI
  startAIServer()
    .then((port) => {
      log.info(`[App] AI Server started on port ${port}`);
    })
    .catch((error) => {
      log.error("[App] Failed to start AI server:", error);
    });

  // Setup tRPC
  setupTRPC();

  // Initialize menu with dependencies from this module
  initApplicationMenu({
    getMainWindow: () => mainWindow,
    getAppPreferences: () => appPreferences,
    preferencesStore,
    applyTrayPreference,
    applyQuickPromptPreference,
    setAppPreferences: (prefs) => { appPreferences = prefs; },
  });
  updateApplicationMenu();

  // Register all IPC handlers
  registerAllIpcHandlers({
    getMainWindow: () => mainWindow,
    showMainWindow,
    sendToMainWindow,
    getAppPreferences: () => appPreferences,
    setAppPreferences: (prefs) => { appPreferences = prefs; },
    preferencesStore,
    supabase,
    applyTrayPreference,
    applyQuickPromptPreference,
    updateApplicationMenu,
    getTrayPopover: () => trayPopover,
    getRecentItems,
    getTraySpreadsheets,
    getTraySpreadsheetData,
    getTrayCitations,
    waitForAIServerReady,
  });

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

  // Toggle Main Window — show/focus if hidden, hide if focused
  hotkeyManager.setHandler("toggle-main-window", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        showMainWindow();
      }
    }
  });

  // New Chat — bring window to front and create a new chat
  hotkeyManager.setHandler("new-chat", () => {
    showMainWindow();
    sendToMainWindow("menu:new-chat");
  });

  // Toggle Zen Mode
  hotkeyManager.setHandler("toggle-zen-mode", () => {
    showMainWindow();
    sendToMainWindow("menu:toggle-zen-mode");
  });

  // Command Palette (Command K)
  hotkeyManager.setHandler("global-search", () => {
    showMainWindow();
    sendToMainWindow("menu:command-k");
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
        `[App] Hotkey failed to register: ${status.id} → ${status.shortcut} (${status.error})`
      );
    }
  }

  app.on("activate", () => {
    // macOS: Re-create or restore window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      // Restore minimized window and bring to focus
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ═══ POWER MONITOR (Energy Efficiency) ═══
  // Throttle background tasks when on battery or system suspends
  powerMonitor.on("on-battery", () => {
    log.info("[Power] Switched to battery - reducing background activity");
    sendToMainWindow("power:battery-status", { onBattery: true });
  });

  powerMonitor.on("on-ac", () => {
    log.info("[Power] Switched to AC power - normal operation");
    sendToMainWindow("power:battery-status", { onBattery: false });
  });

  powerMonitor.on("suspend", () => {
    log.info("[Power] System suspending - pausing background tasks");
    sendToMainWindow("power:suspend", {});
  });

  powerMonitor.on("resume", () => {
    log.info("[Power] System resumed - refreshing data");
    sendToMainWindow("power:resume", {});
  });

  powerMonitor.on("lock-screen", () => {
    log.info("[Power] Screen locked - pausing animations");
    sendToMainWindow("power:lock-screen", {});
  });

  powerMonitor.on("unlock-screen", () => {
    log.info("[Power] Screen unlocked - resuming animations");
    sendToMainWindow("power:unlock-screen", {});
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Graceful shutdown - Clean up resources before quitting
app.on("before-quit", async () => {
  log.info("[App] Before quit - cleaning up resources...");

  // Remove power monitor listeners to prevent memory leaks
  powerMonitor.removeAllListeners();

  // Close local storage
  try {
    await closeStorage();
    log.info("[App] Local storage closed");
  } catch (error) {
    log.error("[App] Error closing local storage:", error);
  }

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
