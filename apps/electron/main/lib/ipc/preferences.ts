import type { IpcContext } from "./register-all";
import { secureHandle } from "./secure-handle";

export function registerPreferencesIpc(context: IpcContext): void {
  const {
    getAppPreferences,
    setAppPreferences,
    preferencesStore,
    applyTrayPreference,
    applyQuickPromptPreference,
    updateApplicationMenu,
    getMainWindow,
  } = context;

  secureHandle("preferences:get", () => {
    return getAppPreferences();
  }, null);

  secureHandle(
    "preferences:set",
    (
      _event,
      patch: {
        trayEnabled?: boolean;
        quickPromptEnabled?: boolean;
        autoSaveDelay?: number;
      }
    ) => {
      const safePatch = patch && typeof patch === "object" ? patch : {};
      const next = preferencesStore.set({
        trayEnabled:
          typeof safePatch.trayEnabled === "boolean"
            ? safePatch.trayEnabled
            : undefined,
        quickPromptEnabled:
          typeof safePatch.quickPromptEnabled === "boolean"
            ? safePatch.quickPromptEnabled
            : undefined,
        autoSaveDelay:
          typeof safePatch.autoSaveDelay === "number" &&
          safePatch.autoSaveDelay >= 1000 &&
          safePatch.autoSaveDelay <= 60000
            ? safePatch.autoSaveDelay
            : undefined,
      });
      setAppPreferences(next);
      applyTrayPreference(next.trayEnabled);
      applyQuickPromptPreference(next.quickPromptEnabled);
      updateApplicationMenu();
      // Emit preferences updated event
      getMainWindow()?.webContents.send("preferences:updated", next);
      return next;
    },
    getAppPreferences()
  );
}
