import { nativeTheme } from "electron";
import type { IpcContext } from "./register-all";
import { secureHandle } from "./secure-handle";

export function registerThemeIpc(_context: IpcContext): void {
  secureHandle("theme:get", () => {
    return nativeTheme.themeSource;
  }, "system");

  secureHandle("theme:set", (_event, theme: "system" | "light" | "dark") => {
    nativeTheme.themeSource = theme;
    return nativeTheme.shouldUseDarkColors;
  }, false);
}
