import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { validateIPCSender } from "../security/ipc-validation";

/**
 * Secure IPC handler wrapper that validates sender before executing handler
 * @param channel - IPC channel name
 * @param handler - Handler function to execute after validation
 * @param fallback - Optional fallback value to return if validation fails
 */
export function secureHandle<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => T | Promise<T>,
  fallback?: T
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!validateIPCSender(event.sender)) {
      return fallback ?? null;
    }
    return handler(event, ...args);
  });
}
