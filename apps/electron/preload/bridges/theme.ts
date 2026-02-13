import { ipcRenderer } from "electron";

export const themeBridge = {
  getTheme: () => ipcRenderer.invoke("theme:get"),
  setTheme: (theme: "system" | "light" | "dark") =>
    ipcRenderer.invoke("theme:set", theme),
};
