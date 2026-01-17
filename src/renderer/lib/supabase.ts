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

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            storage: localStorage
        }
    })
}

// Renderer Supabase client
export const supabase = createSupabaseClient()
