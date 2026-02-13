import { ipcRenderer } from "electron";

export const streamsBridge = {
  // AI Stream listener
  onAIStreamEvent: (callback: (event: any) => void) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on("ai:stream", handler);
    return () => {
      ipcRenderer.removeListener("ai:stream", handler);
    };
  },
  // Agent Panel Stream listener (for document-contextual AI agents)
  onAgentPanelStream: (callback: (event: any) => void) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on("agent-panel:stream", handler);
    return () => {
      ipcRenderer.removeListener("agent-panel:stream", handler);
    };
  },
  // Ideas Tab Stream listener
  onIdeasStream: (callback: (event: any) => void) => {
    const handler = (_: any, event: any) => callback(event);
    ipcRenderer.on("ideas:stream", handler);
    return () => {
      ipcRenderer.removeListener("ideas:stream", handler);
    };
  },
  // ChatGPT Plus connected listener (OAuth callback)
  onChatGPTConnected: (
    callback: (data: { isConnected: boolean; accountId?: string }) => void,
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("chatgpt:connected", handler);
    return () => {
      ipcRenderer.removeListener("chatgpt:connected", handler);
    };
  },
  // Gemini Advanced connected listener (OAuth callback)
  onGeminiConnected: (callback: (data: { isConnected: boolean }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on("gemini:connected", handler);
    return () => {
      ipcRenderer.removeListener("gemini:connected", handler);
    };
  },
};
