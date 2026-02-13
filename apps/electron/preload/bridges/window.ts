import { ipcRenderer } from "electron";

export const windowBridge = {
  // Window controls
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () =>
    ipcRenderer.invoke("window:isMaximized") as Promise<boolean>,
  getBounds: () =>
    ipcRenderer.invoke("window:getBounds") as Promise<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>,
  getMinimumSize: () =>
    ipcRenderer.invoke("window:getMinimumSize") as Promise<{
      width: number;
      height: number;
    } | null>,
  getMaximumSize: () =>
    ipcRenderer.invoke("window:getMaximumSize") as Promise<{
      width: number;
      height: number;
    } | null>,
  setBounds: (bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => ipcRenderer.invoke("window:setBounds", bounds),
  setMinimumSize: (size: { width: number; height: number }) =>
    ipcRenderer.invoke("window:setMinimumSize", size),
  setMaximumSize: (size: { width: number; height: number }) =>
    ipcRenderer.invoke("window:setMaximumSize", size),
  setWindowButtonVisibility: (visible: boolean) =>
    ipcRenderer.invoke("window:setWindowButtonVisibility", visible),
  setZenModeVibrancy: (enabled: boolean) =>
    ipcRenderer.invoke("window:setZenModeVibrancy", enabled) as Promise<boolean>,
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_: unknown, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximize-changed", handler);
    return () => ipcRenderer.removeListener("window:maximize-changed", handler);
  },
};
