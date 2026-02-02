import { createClient } from "@supabase/supabase-js";
import log from "electron-log";
import { getSupabaseAuthStore } from "./auth-store";

const supabaseUrl =
  import.meta.env.MAIN_VITE_SUPABASE_URL ||
  process.env.MAIN_VITE_SUPABASE_URL ||
  "";
const supabaseAnonKey =
  import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY ||
  process.env.MAIN_VITE_SUPABASE_ANON_KEY ||
  "";

// Use custom encrypted storage for Electron (persists session between app restarts)
const authStorage = getSupabaseAuthStore();

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    log.error(
      "[Supabase] Missing MAIN_VITE_SUPABASE_URL or MAIN_VITE_SUPABASE_ANON_KEY",
    );
    return createClient("https://placeholder.supabase.co", "placeholder-key", {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: authStorage,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = createSupabaseClient();

export type SupabaseClient = typeof supabase;

// Export storage for explicit clear on logout
export { authStorage };
