import type { BrowserWindow } from "electron";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppPreferences, PreferencesStore } from "../preferences-store";
import { registerWindowControlsIpc } from "./window-controls";
import { registerClipboardIpc } from "./clipboard";
import { registerAuthSyncIpc } from "./auth-sync";
import { registerThemeIpc } from "./theme";
import { registerPreferencesIpc } from "./preferences";
import { registerTrayHandlersIpc } from "./tray-handlers";
import { registerMiscHandlersIpc } from "./misc-handlers";

/**
 * Context object containing all dependencies for IPC handlers
 */
export interface IpcContext {
  getMainWindow: () => BrowserWindow | null;
  showMainWindow: () => boolean;
  sendToMainWindow: (channel: string, ...args: unknown[]) => boolean;
  getAppPreferences: () => AppPreferences;
  setAppPreferences: (prefs: AppPreferences) => void;
  preferencesStore: PreferencesStore;
  supabase: SupabaseClient;
  applyTrayPreference: (enabled: boolean) => void;
  applyQuickPromptPreference: (enabled: boolean) => void;
  updateApplicationMenu: () => void;
  getTrayPopover: () => BrowserWindow | null;
  getRecentItems: () => Promise<
    Array<{
      id: string;
      type: "spreadsheet" | "document" | "chat";
      name: string;
      updatedAt: string;
      chatId?: string;
    }>
  >;
  getTraySpreadsheets: () => Promise<
    Array<{ id: string; name: string; updatedAt: string; chatId?: string }>
  >;
  getTraySpreadsheetData: (
    id: string
  ) => Promise<{ id: string; name: string; univerData: any } | null>;
  getTrayCitations: () => Promise<
    Array<{
      id: string;
      kind: "url" | "file";
      label: string;
      url?: string;
      filename?: string;
      chatId: string;
      messageId: string;
      createdAt: string;
      startIndex?: number;
      endIndex?: number;
      fileId?: string;
    }>
  >;
  waitForAIServerReady: () => Promise<number | null>;
}

/**
 * Register all IPC handlers with the provided context
 */
export function registerAllIpcHandlers(context: IpcContext): void {
  registerWindowControlsIpc(context);
  registerClipboardIpc(context);
  registerAuthSyncIpc(context);
  registerThemeIpc(context);
  registerPreferencesIpc(context);
  registerTrayHandlersIpc(context);
  registerMiscHandlersIpc(context);
}
