// Supabase configuration
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// OAuth configuration
export const OAUTH_REDIRECT_URI = import.meta.env.VITE_OAUTH_REDIRECT_URI || 'http://localhost:21321/auth/callback'
export const ANTHROPIC_CLIENT_ID = import.meta.env.VITE_ANTHROPIC_CLIENT_ID || ''

// App configuration
export const APP_NAME = 'S-AGI'
export const APP_VERSION = '0.1.0'

// Feature flags
export const ENABLE_ANALYTICS = import.meta.env.PROD
