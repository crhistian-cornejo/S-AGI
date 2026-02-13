import { clipboard } from "electron";
import type { IpcContext } from "./register-all";
import { secureHandle } from "./secure-handle";

export function registerClipboardIpc(_context: IpcContext): void {
  secureHandle("clipboard:write-text", (_event, text: string) => {
    clipboard.writeText(text);
    return true;
  }, false);

  secureHandle("clipboard:read-text", () => {
    return clipboard.readText();
  }, "");

  secureHandle("clipboard:write-html", (_event, html: string, text?: string) => {
    if (text) {
      clipboard.write({ html, text });
    } else {
      clipboard.writeHTML(html);
    }
    return true;
  }, false);

  secureHandle("clipboard:read-html", () => {
    return clipboard.readHTML();
  }, "");

  secureHandle("clipboard:read-formats", () => {
    return clipboard.availableFormats();
  }, []);

  secureHandle(
    "clipboard:write",
    (_event, data: { text?: string; html?: string; rtf?: string }) => {
      clipboard.write(data);
      return true;
    },
    false
  );

  secureHandle("clipboard:read", () => {
    return {
      text: clipboard.readText(),
      html: clipboard.readHTML(),
      rtf: clipboard.readRTF(),
      formats: clipboard.availableFormats(),
    };
  }, { text: "", html: "", rtf: "", formats: [] });
}
