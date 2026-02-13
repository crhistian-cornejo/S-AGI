import { ipcRenderer } from "electron";

export const authBridge = {
  // Auth synchronization
  setSession: (session: any) => ipcRenderer.invoke("auth:set-session", session),
  // Auth callback listener (for deep link code flow)
  onAuthCallback: (callback: (data: { code: string }) => void) => {
    ipcRenderer.on("auth:callback", (_, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners("auth:callback");
    };
  },
  // OAuth tokens listener (for Electron window OAuth flow)
  onOAuthTokens: (
    callback: (data: { access_token: string; refresh_token: string }) => void,
  ) => {
    ipcRenderer.on("auth:oauth-tokens", (_, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners("auth:oauth-tokens");
    };
  },
  // Auth refresh state listener
  onAuthRefreshing: (
    callback: (data: { provider: string; refreshing: boolean }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("auth:refreshing", handler);
    return () => {
      ipcRenderer.removeListener("auth:refreshing", handler);
    };
  },
  // Auth error listener
  onAuthError: (
    callback: (data: { provider: string; error: string | null }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("auth:error", handler);
    return () => {
      ipcRenderer.removeListener("auth:error", handler);
    };
  },
};
