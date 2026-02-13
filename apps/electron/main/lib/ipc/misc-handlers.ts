import { ipcMain } from "electron";
import type { IpcContext } from "./register-all";
import { validateIPCSender } from "../security/ipc-validation";
import { secureHandle } from "./secure-handle";

export function registerMiscHandlersIpc(context: IpcContext): void {
  const { sendToMainWindow, waitForAIServerReady } = context;

  // IPC handler to get AI server port (waits for server to be ready)
  secureHandle("ai:get-port", () => {
    return waitForAIServerReady();
  }, null);

  // Forward cell highlight requests from agent panel to Univer spreadsheet
  ipcMain.on(
    "univer:highlight-cells",
    (event, params: { range: string; sheetName?: string }) => {
      if (!validateIPCSender(event.sender)) return;
      // Forward to main window (same window, but this ensures proper routing)
      sendToMainWindow("univer:highlight-cells", params);
    }
  );
}
