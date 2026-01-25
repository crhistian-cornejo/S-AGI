import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Create a mock client for when env vars are missing (shouldn't happen in production)
function createSupabaseClient(): SupabaseClient {
    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY - check your .env file')
        // Return a dummy client that won't crash but won't work either
        // This allows the app to load and show auth screen even if misconfigured
        return createClient('https://placeholder.supabase.co', 'placeholder-key', {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })
    }

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
