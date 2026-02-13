import { ipcRenderer } from "electron";

export const clipboardBridge = {
  writeText: (text: string) =>
    ipcRenderer.invoke("clipboard:write-text", text),
  readText: () => ipcRenderer.invoke("clipboard:read-text"),
  writeHtml: (html: string, text?: string) =>
    ipcRenderer.invoke("clipboard:write-html", html, text),
  readHtml: () => ipcRenderer.invoke("clipboard:read-html"),
  readFormats: () => ipcRenderer.invoke("clipboard:read-formats"),
  write: (data: { text?: string; html?: string; rtf?: string }) =>
    ipcRenderer.invoke("clipboard:write", data),
  read: () =>
    ipcRenderer.invoke("clipboard:read") as Promise<{
      text: string;
      html: string;
      rtf: string;
      formats: string[];
    }>,
};
