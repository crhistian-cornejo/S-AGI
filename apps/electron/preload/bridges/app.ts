import { ipcRenderer } from "electron";

export const appBridge = {
  // App info
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  showAbout: () => {
    // Send event directly to renderer (same as menu action)
    // The renderer listens for this via menu.onShowAbout
    ipcRenderer.send("menu:show-about");
  },
  // Platform detection
  platform: process.platform,
  // AI Server
  getAIServerPort: () => ipcRenderer.invoke("ai:get-port") as Promise<number>,
};

export const appNestedBridge = {
  onOpenSettings: (callback: (data?: { tab?: string }) => void) => {
    const handler = (_: unknown, data: { tab?: string }) => callback(data);
    ipcRenderer.on("app:open-settings", handler);
    return () => {
      ipcRenderer.removeListener("app:open-settings", handler);
    };
  },
};
