import { createClient } from '@supabase/supabase-js'
import { getSupabaseAuthStore } from './auth-store'

const supabaseUrl = import.meta.env.MAIN_VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY || ''

// Use custom encrypted storage for Electron (persists session between app restarts)
const authStorage = getSupabaseAuthStore()

// Main process Supabase client with persistent encrypted session
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        storage: authStorage,
        // Disable URL detection since we're in Electron main process
        detectSessionInUrl: false
    }
})

export type SupabaseClient = typeof supabase

// Export storage for explicit clear on logout
export { authStorage }
