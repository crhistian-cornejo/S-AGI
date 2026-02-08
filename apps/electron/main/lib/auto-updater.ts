/**
 * Auto-updater module for S-AGI
 *
 * Uses electron-updater to check for and download updates from GitHub Releases.
 * The update manifest files (latest-mac.yml, latest.yml) are generated during
 * the CI/CD build process and uploaded to GitHub Releases.
 */

import { autoUpdater, UpdateInfo } from "electron-updater";
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import log from "electron-log";

const INITIAL_CHECK_DELAY_MS = 5000;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Configure electron-updater logging
autoUpdater.logger = log;
(autoUpdater.logger as typeof log).transports.file.level = "info";

// Download updates automatically once found; ask user before restart.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Store reference to main window for IPC communication
let mainWindow: BrowserWindow | null = null;
let initialized = false;
let ipcHandlersRegistered = false;
let checkInProgress = false;
let updateDownloaded = false;

/**
 * Initialize the auto-updater
 * @param window - The main BrowserWindow to send update events to
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;
  window.once("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (process.mas) {
    log.info("[AutoUpdater] Disabled in Mac App Store builds.");
    return;
  }

  if (initialized) {
    return;
  }
  initialized = true;

  setupAutoUpdaterEvents();
  setupIpcHandlers();
  scheduleUpdateChecks();
}

function scheduleUpdateChecks(): void {
  setTimeout(() => {
    void checkForUpdates();
  }, INITIAL_CHECK_DELAY_MS);

  setInterval(() => {
    void checkForUpdates();
  }, PERIODIC_CHECK_INTERVAL_MS);
}

/**
 * Check for available updates
 */
export async function checkForUpdates(): Promise<void> {
  if (!initialized) {
    log.warn("[AutoUpdater] checkForUpdates called before initialization");
    return;
  }

  if (checkInProgress) {
    log.info("[AutoUpdater] Check already in progress, skipping.");
    return;
  }

  try {
    checkInProgress = true;
    log.info("[AutoUpdater] Checking for updates...");
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error("[AutoUpdater] Error checking for updates:", error);
    throw error;
  } finally {
    checkInProgress = false;
  }
}

/**
 * Download the available update
 */
export async function downloadUpdate(): Promise<void> {
  if (!initialized) {
    log.warn("[AutoUpdater] downloadUpdate called before initialization");
    return;
  }

  if (updateDownloaded) {
    log.info("[AutoUpdater] Update is already downloaded.");
    return;
  }

  try {
    log.info("[AutoUpdater] Starting download...");
    await autoUpdater.downloadUpdate();
  } catch (error) {
    log.error("[AutoUpdater] Error downloading update:", error);
    throw error;
  }
}

/**
 * Install the downloaded update and restart the app
 */
export function installUpdate(): void {
  log.info("[AutoUpdater] Installing update and restarting...");
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Set up auto-updater event listeners
 */
function setupAutoUpdaterEvents(): void {
  autoUpdater.on("checking-for-update", () => {
    log.info("[AutoUpdater] Checking for update...");
    sendToRenderer("update:checking");
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    updateDownloaded = false;
    log.info("[AutoUpdater] Update available:", info.version);
    sendToRenderer("update:available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    updateDownloaded = false;
    log.info("[AutoUpdater] No update available. Current version:", info.version);
    sendToRenderer("update:not-available", { version: info.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    log.info(
      `[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}% (${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`
    );
    sendToRenderer("update:download-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    updateDownloaded = true;
    log.info("[AutoUpdater] Update downloaded:", info.version);
    sendToRenderer("update:downloaded", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });

    // Show dialog to prompt user to restart
    showUpdateReadyDialog(info);
  });

  autoUpdater.on("error", (error) => {
    log.error("[AutoUpdater] Error:", error);
    sendToRenderer("update:error", { message: getErrorMessage(error) });
  });
}

/**
 * Set up IPC handlers for renderer process communication
 */
function setupIpcHandlers(): void {
  if (ipcHandlersRegistered) {
    return;
  }
  ipcHandlersRegistered = true;

  ipcMain.handle("update:check", async () => {
    try {
      await checkForUpdates();
      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle("update:download", async () => {
    try {
      await downloadUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle("update:install", () => {
    try {
      installUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  ipcMain.handle("update:get-version", () => {
    return app.getVersion();
  });
}

/**
 * Show a dialog when update is ready to install
 */
async function showUpdateReadyDialog(info: UpdateInfo): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const result = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Update Ready",
    message: `A new version (${info.version}) has been downloaded.`,
    detail: "Would you like to restart the app now to apply the update?",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    installUpdate();
  }
}

/**
 * Send event to renderer process
 */
function sendToRenderer(channel: string, data?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
