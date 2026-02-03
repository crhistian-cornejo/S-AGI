/**
 * Auto-updater module for S-AGI
 *
 * Uses electron-updater to check for and download updates from GitHub Releases.
 * The update manifest files (latest-mac.yml, latest.yml) are generated during
 * the CI/CD build process and uploaded to GitHub Releases.
 */

import { autoUpdater, UpdateInfo } from "electron-updater";
import { BrowserWindow, ipcMain, dialog } from "electron";
import log from "electron-log";

// Configure electron-updater logging
autoUpdater.logger = log;
(autoUpdater.logger as typeof log).transports.file.level = "info";

// Disable auto-download - we want to prompt the user first
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Store reference to main window for IPC communication
let mainWindow: BrowserWindow | null = null;

/**
 * Initialize the auto-updater
 * @param window - The main BrowserWindow to send update events to
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  // Check for updates on startup (with a delay to not block app launch)
  setTimeout(() => {
    checkForUpdates();
  }, 5000);

  // Check for updates every 4 hours
  setInterval(
    () => {
      checkForUpdates();
    },
    4 * 60 * 60 * 1000
  );

  setupAutoUpdaterEvents();
  setupIpcHandlers();
}

/**
 * Check for available updates
 */
export async function checkForUpdates(): Promise<void> {
  try {
    log.info("[AutoUpdater] Checking for updates...");
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error("[AutoUpdater] Error checking for updates:", error);
  }
}

/**
 * Download the available update
 */
export async function downloadUpdate(): Promise<void> {
  try {
    log.info("[AutoUpdater] Starting download...");
    await autoUpdater.downloadUpdate();
  } catch (error) {
    log.error("[AutoUpdater] Error downloading update:", error);
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
    log.info("[AutoUpdater] Update available:", info.version);
    sendToRenderer("update:available", {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
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
    sendToRenderer("update:error", { message: error.message });
  });
}

/**
 * Set up IPC handlers for renderer process communication
 */
function setupIpcHandlers(): void {
  ipcMain.handle("update:check", async () => {
    await checkForUpdates();
    return { success: true };
  });

  ipcMain.handle("update:download", async () => {
    await downloadUpdate();
    return { success: true };
  });

  ipcMain.handle("update:install", () => {
    installUpdate();
    return { success: true };
  });

  ipcMain.handle("update:get-version", () => {
    const { app } = require("electron");
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
