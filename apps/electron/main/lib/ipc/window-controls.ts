import { app } from "electron";
import type { IpcContext } from "./register-all";
import { secureHandle } from "./secure-handle";

export function registerWindowControlsIpc(context: IpcContext): void {
  const { getMainWindow } = context;

  secureHandle("window:minimize", () => {
    getMainWindow()?.minimize();
  });

  secureHandle("window:maximize", () => {
    const mainWindow = getMainWindow();
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  secureHandle("window:isMaximized", () => {
    return getMainWindow()?.isMaximized() ?? false;
  }, false);

  secureHandle("window:close", () => {
    getMainWindow()?.close();
  });

  secureHandle("window:getBounds", () => {
    return getMainWindow()?.getBounds() ?? null;
  }, null);

  secureHandle("window:getMinimumSize", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const [width, height] = mainWindow.getMinimumSize();
    return { width, height };
  }, null);

  secureHandle("window:getMaximumSize", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;
    const [width, height] = mainWindow.getMaximumSize();
    return { width, height };
  }, null);

  secureHandle(
    "window:setBounds",
    (
      _event,
      bounds: { x?: number; y?: number; width?: number; height?: number }
    ) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;
      mainWindow.setBounds(bounds);
    }
  );

  secureHandle(
    "window:setMinimumSize",
    (_event, size: { width: number; height: number }) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const width = Number(size?.width);
      const height = Number(size?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;

      mainWindow.setMinimumSize(
        Math.max(0, Math.round(width)),
        Math.max(0, Math.round(height))
      );
    }
  );

  secureHandle(
    "window:setMaximumSize",
    (_event, size: { width: number; height: number }) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const width = Number(size?.width);
      const height = Number(size?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;

      mainWindow.setMaximumSize(
        Math.max(0, Math.round(width)),
        Math.max(0, Math.round(height))
      );
    }
  );

  secureHandle("window:setWindowButtonVisibility", (_event, visible: boolean) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;
    if (process.platform !== "darwin") return;
    if (typeof mainWindow.setWindowButtonVisibility !== "function") return;
    mainWindow.setWindowButtonVisibility(Boolean(visible));
  });

  secureHandle("window:setZenModeVibrancy", (_event, enabled: boolean) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return false;
    if (process.platform !== "darwin") return false;
    if (typeof mainWindow.setVibrancy !== "function") return false;

    try {
      // `under-window` is more reliable with frameless + custom title bars.
      mainWindow.setVibrancy(enabled ? "under-window" : null);
      return true;
    } catch (error) {
      console.warn("[Window] Failed to toggle Zen vibrancy:", error);
      return false;
    }
  }, false);

  secureHandle("app:getVersion", () => {
    return app.getVersion();
  }, null);
}
