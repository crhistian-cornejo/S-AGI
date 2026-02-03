import { createClient, SupabaseClient as SupabaseClientType } from "@supabase/supabase-js";
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

/**
 * Check if Supabase is properly configured
 * Returns true if both URL and anon key are set
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Get Supabase configuration status for debugging
 */
export function getSupabaseConfigStatus(): {
  hasUrl: boolean;
  hasKey: boolean;
  isConfigured: boolean;
} {
  return {
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabaseAnonKey),
    isConfigured: isSupabaseConfigured(),
  };
}

function createSupabaseClient(): SupabaseClientType {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Log as info instead of error - this is expected in local-first mode
    log.info(
      "[Supabase] Running in local-only mode (no Supabase credentials configured)"
    );
    // Create a placeholder client that won't crash but won't work for cloud operations
    // This allows the app to start and use local storage instead
    return createClient("https://placeholder.supabase.co", "placeholder-key", {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  log.info("[Supabase] Initializing with cloud configuration");
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
