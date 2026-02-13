import { app, dialog } from "electron";
import type { IpcContext } from "./register-all";
import { secureHandle } from "./secure-handle";
import log from "electron-log";

export function registerTrayHandlersIpc(context: IpcContext): void {
  const {
    getTrayPopover,
    showMainWindow,
    sendToMainWindow,
    getRecentItems,
    getTraySpreadsheets,
    getTraySpreadsheetData,
    getTrayCitations,
    supabase,
  } = context;

  // Tray Popover IPC handlers
  secureHandle("tray:get-recent-items", async () => {
    return await getRecentItems();
  }, []);

  secureHandle("tray:get-user", async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const email = user.email || "";
      const avatarUrl = (user.user_metadata as any)?.avatar_url || null;
      const fullName = (user.user_metadata as any)?.full_name || null;
      return { email, avatarUrl, fullName };
    } catch (err) {
      log.warn("[Tray] Failed to get user:", err);
      return null;
    }
  }, null);

  secureHandle("tray:get-spreadsheets", async () => {
    return await getTraySpreadsheets();
  }, []);

  secureHandle(
    "tray:get-spreadsheet-data",
    async (_event, input: { id: string }) => {
      if (!input?.id) return null;
      return await getTraySpreadsheetData(input.id);
    },
    null
  );

  secureHandle("tray:get-citations", async () => {
    return await getTrayCitations();
  }, []);

  // Quick Prompt IPC handler
  secureHandle(
    "quick-prompt:send",
    async (_event, message: string) => {
      log.info("[QuickPrompt] Received message:", message.substring(0, 50) + "...");

      if (showMainWindow()) {
        sendToMainWindow("quick-prompt:create-chat", message);
      }

      return { success: true };
    },
    { success: false }
  );

  // Tray action handler
  secureHandle(
    "tray:action",
    async (_event, data: { action: string; [key: string]: unknown }) => {
      const { action } = data;
      log.info("[Tray] Action received:", action);

      const trayPopover = getTrayPopover();

      switch (action) {
        case "open-main":
          // Hide popover and show main window
          trayPopover?.hide();
          showMainWindow();
          break;

        case "new-chat":
          // Hide popover, show main window, and trigger new chat via IPC
          trayPopover?.hide();
          if (showMainWindow()) {
            sendToMainWindow("tray:new-chat");
          }
          break;

        case "new-spreadsheet":
          // Hide popover, show main window, and trigger new spreadsheet
          trayPopover?.hide();
          if (showMainWindow()) {
            sendToMainWindow("tray:new-spreadsheet");
          }
          break;

        case "new-document":
          // Hide popover, show main window, and trigger new document
          trayPopover?.hide();
          if (showMainWindow()) {
            sendToMainWindow("tray:new-document");
          }
          break;

        case "open-item":
          // Open a specific item (artifact or chat)
          trayPopover?.hide();
          if (showMainWindow()) {
            sendToMainWindow("tray:open-item", {
              itemId: data.itemId,
              type: data.type,
              chatId: data.chatId,
            });
          }
          break;

        case "settings":
          // Open settings
          trayPopover?.hide();
          if (showMainWindow()) {
            sendToMainWindow("tray:open-settings");
          }
          break;

        case "open-local-pdf": {
          // Open file picker for local PDFs, then send to main window
          trayPopover?.hide();
          const fs = await import("node:fs");
          const path = await import("node:path");
          const result = await dialog.showOpenDialog({
            title: "Select PDF files to view",
            filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
            properties: ["openFile", "multiSelections"],
          });
          if (!result.canceled && result.filePaths.length > 0) {
            const files = result.filePaths.map((filePath) => {
              const stats = fs.statSync(filePath);
              return {
                path: filePath,
                name: path.basename(filePath),
                size: stats.size,
              };
            });
            if (showMainWindow()) {
              sendToMainWindow("tray:open-local-pdfs", { files });
            }
          }
          break;
        }

        case "quit":
          app.quit();
          break;

        default:
          log.warn("[Tray] Unknown action:", action);
      }
    }
  );

  // Haptic feedback handler (macOS only)
  secureHandle("haptic:perform", (_event, type: string) => {
    if (process.platform !== "darwin") {
      return false;
    }

    try {
      // Log the haptic request for debugging
      log.debug(`[Haptic] Requested feedback type: ${type}`);

      // Haptic feedback would require a native module like:
      // const { performHapticFeedback } = require('electron-osx-haptic')
      // performHapticFeedback(type)

      return true;
    } catch (error) {
      log.error("[Haptic] Failed to perform feedback:", error);
      return false;
    }
  }, false);
}
