import { createClient, SupabaseClient as SupabaseClientType, AuthChangeEvent, Session } from "@supabase/supabase-js";
import log from "electron-log";
import { getSupabaseAuthStore } from "./auth-store";
import { initStorageModeHelpers } from "../storage";

const supabaseUrl =
  import.meta.env.MAIN_VITE_SUPABASE_URL ||
  process.env.MAIN_VITE_SUPABASE_URL ||
  "";
const supabaseAnonKey =
  import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY ||
  process.env.MAIN_VITE_SUPABASE_ANON_KEY ||
  "";

// Track if session has been initialized
let sessionInitialized = false;
let authStateListenerSetup = false;

// Use custom encrypted storage for Electron (persists session between app restarts)
const authStorage = getSupabaseAuthStore();

// Initialize storage mode helpers for cross-module access
initStorageModeHelpers(authStorage, isSupabaseConfigured);

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

/**
 * Initialize the auth system and restore session from encrypted storage.
 * Should be called once during app startup after app.whenReady().
 *
 * This function:
 * 1. Waits for authStorage to be fully initialized
 * 2. Restores the Supabase session from encrypted storage
 * 3. Sets up an onAuthStateChange listener to sync account data
 */
export async function initializeAuth(): Promise<void> {
  log.info('[Auth] initializeAuth() called');

  if (sessionInitialized) {
    log.debug('[Auth] Session already initialized, skipping');
    return;
  }

  if (!isSupabaseConfigured()) {
    log.info('[Auth] Supabase not configured, skipping auth initialization');
    sessionInitialized = true;
    return;
  }

  log.info('[Auth] Waiting for authStorage to initialize...');

  try {
    // Wait for authStorage to be fully initialized
    await authStorage.waitForInit();
    log.info('[Auth] Auth storage initialized');

    // Check if there's an active account
    const activeAccount = authStorage.getActiveAccount();
    if (activeAccount) {
      log.info(`[Auth] Found active account: ${activeAccount.email} (${activeAccount.isLocal ? 'local' : 'cloud'})`);
    }

    // Try to restore session from encrypted storage
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      log.warn('[Auth] Failed to restore session:', error.message);
    } else if (session) {
      log.info('[Auth] Session restored from encrypted storage, user:', session.user?.id);

      // Sync account data if needed
      if (session.user && !authStorage.hasAccount(session.user.id)) {
        const userMeta = session.user.user_metadata as Record<string, unknown> || {};
        const provider = session.user.app_metadata?.provider as string || 'email';
        authStorage.addAccount({
          userId: session.user.id,
          email: session.user.email || 'unknown',
          displayName: (userMeta.full_name as string) || (userMeta.name as string) || session.user.email || 'User',
          avatarUrl: (userMeta.avatar_url as string) || (userMeta.picture as string) || undefined,
          isLocal: false,
          provider
        });
        log.info('[Auth] Added restored user to accounts store');
      }
    } else {
      log.info('[Auth] No stored session found');
    }

    // Setup auth state change listener
    setupAuthStateListener();

    sessionInitialized = true;
    log.info('[Auth] Auth initialization complete');
  } catch (error) {
    log.error('[Auth] Failed to initialize auth:', error);
    sessionInitialized = true; // Mark as initialized to prevent repeated attempts
  }
}

/**
 * Set up a listener to sync auth state changes to the accounts store
 */
function setupAuthStateListener(): void {
  if (authStateListenerSetup) return;

  supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    log.info(`[Auth] Auth state changed: ${event}`);

    if (event === 'SIGNED_IN' && session?.user) {
      // User signed in - ensure they're in the accounts store
      const user = session.user;
      const userMeta = user.user_metadata as Record<string, unknown> || {};
      const provider = user.app_metadata?.provider as string || 'email';

      if (!authStorage.hasAccount(user.id)) {
        authStorage.addAccount({
          userId: user.id,
          email: user.email || 'unknown',
          displayName: (userMeta.full_name as string) || (userMeta.name as string) || user.email || 'User',
          avatarUrl: (userMeta.avatar_url as string) || (userMeta.picture as string) || undefined,
          isLocal: false,
          provider
        });
        log.info('[Auth] Added signed-in user to accounts store');
      }
    } else if (event === 'SIGNED_OUT') {
      log.info('[Auth] User signed out');
      // Note: Don't clear accounts here - the auth router handles this
    } else if (event === 'TOKEN_REFRESHED' && session) {
      log.debug('[Auth] Token refreshed successfully');
    } else if (event === 'USER_UPDATED' && session?.user) {
      // Update account info when user data changes
      const user = session.user;
      const userMeta = user.user_metadata as Record<string, unknown> || {};
      const provider = user.app_metadata?.provider as string || 'email';

      authStorage.addAccount({
        userId: user.id,
        email: user.email || 'unknown',
        displayName: (userMeta.full_name as string) || (userMeta.name as string) || user.email || 'User',
        avatarUrl: (userMeta.avatar_url as string) || (userMeta.picture as string) || undefined,
        isLocal: false,
        provider
      });
      log.info('[Auth] Updated user info in accounts store');
    }
  });

  authStateListenerSetup = true;
  log.info('[Auth] Auth state listener setup complete');
}
