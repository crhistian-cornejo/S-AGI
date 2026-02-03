import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { supabase, isSupabaseConfigured, authStorage } from '../supabase/client'
import { getStorageMode, LOCAL_USER_ID } from '../storage'
import log from 'electron-log'

// Context type for tRPC
export interface Context {
    userId: string | null
    isLocalMode: boolean
    accountId?: string | null
}

// Create context for each request
export async function createContext(): Promise<Context> {
    // First, check if we have an active account in the multi-account store
    const activeAccount = authStorage.getActiveAccount()

    if (activeAccount) {
        log.debug('[tRPC Context] Using active account:', activeAccount.email, 'isLocal:', activeAccount.isLocal)
        return {
            userId: activeAccount.userId,
            isLocalMode: activeAccount.isLocal,
            accountId: activeAccount.id
        }
    }

    // No active account - fallback to legacy logic
    const supabaseConfigured = isSupabaseConfigured()
    const storageMode = getStorageMode()
    const isLocalMode = !supabaseConfigured || storageMode === 'local'

    log.info('[tRPC Context] No active account, using legacy logic - supabaseConfigured:', supabaseConfigured, 'storageMode:', storageMode, 'isLocalMode:', isLocalMode)

    // In local mode, always use LOCAL_USER_ID
    if (isLocalMode) {
        log.info('[tRPC Context] Local mode - returning userId:', LOCAL_USER_ID)
        return { userId: LOCAL_USER_ID, isLocalMode: true }
    }

    // In cloud mode, get session from Supabase
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
        log.error('[tRPC Context] Error getting session:', error.message)
    }

    const userId = session?.user?.id ?? null
    log.debug('[tRPC Context] Cloud mode - userId:', userId ? userId.substring(0, 8) + '...' : 'null')

    return { userId, isLocalMode: false }
}

// Create tRPC instance with context
const t = initTRPC.context<Context>().create({
    transformer: superjson
})

// Export reusable router and procedure helpers
export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware

// Middleware to require authentication (or local mode)
const requireAuth = middleware(async ({ ctx, next }) => {
    // Local mode: always authenticated with local-user
    if (ctx.isLocalMode) {
        log.debug('[tRPC Auth Middleware] Local mode - authenticated as local-user')
        return next({
            ctx: {
                ...ctx,
                userId: LOCAL_USER_ID
            }
        })
    }

    // Cloud mode: require Supabase auth
    log.debug('[tRPC Auth Middleware] Cloud mode - checking auth, userId:', ctx.userId ? ctx.userId.substring(0, 8) + '...' : 'NULL')

    if (!ctx.userId) {
        // Try to refresh session one more time
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
            log.info('[tRPC Auth Middleware] Found session on retry:', session.user.id.substring(0, 8) + '...')
            return next({
                ctx: {
                    ...ctx,
                    userId: session.user.id
                }
            })
        }

        // Fallback to local mode if cloud auth fails
        log.warn('[tRPC Auth Middleware] Cloud auth failed - falling back to local mode')
        return next({
            ctx: {
                ...ctx,
                userId: LOCAL_USER_ID,
                isLocalMode: true
            }
        })
    }
    return next({
        ctx: {
            ...ctx,
            userId: ctx.userId
        }
    })
})

// Protected procedure (requires authentication or local mode)
export const protectedProcedure = publicProcedure.use(requireAuth)
