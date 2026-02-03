import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Check if Supabase is properly configured
 * Returns true if both URL and anon key are set
 */
export function isSupabaseConfigured(): boolean {
    return Boolean(supabaseUrl && supabaseAnonKey)
}

/**
 * Check if we're running in local-only mode
 */
export function isLocalMode(): boolean {
    return !isSupabaseConfigured()
}

// Create a mock client for when env vars are missing (local-first mode)
function createSupabaseClient(): SupabaseClient {
    if (!supabaseUrl || !supabaseAnonKey) {
        // Log as info - this is expected in local-first mode
        console.info('[Supabase] Running in local-only mode (no cloud credentials)')
        // Return a dummy client that won't crash but won't work for cloud operations
        // This allows the app to load and use local storage
        return createClient('https://placeholder.supabase.co', 'placeholder-key', {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })
    }

    console.info('[Supabase] Cloud mode enabled')
    // IMPORTANT: Auth is handled by the main process (encrypted storage).
    // The renderer should NOT manage auth sessions to avoid refresh token conflicts.
    // Disable autoRefreshToken and persistSession - use tRPC auth.getSession instead.
    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    })
}

// Renderer Supabase client
export const supabase = createSupabaseClient()
