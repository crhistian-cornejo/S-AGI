import { ipcRenderer } from "electron";

export const trayBridge = {
  getRecentItems: () => ipcRenderer.invoke("tray:get-recent-items"),
  getUser: () => ipcRenderer.invoke("tray:get-user"),
  getSpreadsheets: () => ipcRenderer.invoke("tray:get-spreadsheets"),
  getSpreadsheetData: (data: { id: string }) =>
    ipcRenderer.invoke("tray:get-spreadsheet-data", data),
  getCitations: () => ipcRenderer.invoke("tray:get-citations"),
  action: (data: { action: string; [key: string]: unknown }) =>
    ipcRenderer.invoke("tray:action", data),
  onRefresh: (callback: () => void) => {
    ipcRenderer.on("tray:refresh", callback);
    return () => {
      ipcRenderer.removeListener("tray:refresh", callback);
    };
  },
  // Callbacks for tray actions aimed at the main window
  onAction: (action: string, callback: (data?: any) => void) => {
    const channel = `tray:${action}`;
    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
};
