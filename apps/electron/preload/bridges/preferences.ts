import { ipcRenderer } from "electron";

export const preferencesBridge = {
  get: () => ipcRenderer.invoke("preferences:get"),
  set: (data: {
    trayEnabled?: boolean;
    quickPromptEnabled?: boolean;
    autoSaveDelay?: number;
  }) => ipcRenderer.invoke("preferences:set", data),
  onPreferencesUpdated: (
    callback: (data: {
      trayEnabled: boolean;
      quickPromptEnabled: boolean;
      autoSaveDelay: number;
    }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("preferences:updated", handler);
    return () => {
      ipcRenderer.removeListener("preferences:updated", handler);
    };
  },
};
