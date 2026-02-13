import type { IpcContext } from "./register-all";
import { secureHandle } from "./secure-handle";
import log from "electron-log";

export function registerAuthSyncIpc(context: IpcContext): void {
  const { supabase } = context;

  secureHandle(
    "auth:set-session",
    async (
      _event,
      session: { access_token?: string; refresh_token?: string } | null
    ) => {
      log.info(
        "[Auth] Synchronizing session from renderer, has tokens:",
        !!session?.access_token
      );
      try {
        if (session?.access_token && session?.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
          if (error) throw error;
          log.info(
            "[Auth] Session synchronized successfully, user:",
            data.user?.id?.substring(0, 8) + "..."
          );

          // Verify it persisted
          const {
            data: { session: verifySession },
          } = await supabase.auth.getSession();
          log.info(
            "[Auth] Verification - session exists:",
            !!verifySession,
            "user:",
            verifySession?.user?.id?.substring(0, 8) + "..."
          );
        } else {
          await supabase.auth.signOut();
          log.info("[Auth] Session cleared (sign out)");
        }
        return { success: true };
      } catch (error) {
        log.error("[Auth] Failed to synchronize session:", error);
        return { success: false, error: (error as Error).message };
      }
    },
    { success: false, error: "Unauthorized" }
  );
}
