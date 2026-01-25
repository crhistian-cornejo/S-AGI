import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { supabase } from '../supabase/client'
import log from 'electron-log'

// Context type for tRPC
export interface Context {
    userId: string | null
}

// Create context for each request
export async function createContext(): Promise<Context> {
    // Get current session from Supabase
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
        log.error('[tRPC Context] Error getting session:', error.message)
    }
    
    const userId = session?.user?.id ?? null
    log.debug('[tRPC Context] userId:', userId ? userId.substring(0, 8) + '...' : 'null')
    
    return { userId }
}

// Create tRPC instance with context
const t = initTRPC.context<Context>().create({
    transformer: superjson
})

// Export reusable router and procedure helpers
export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware

// Middleware to require authentication
const requireAuth = middleware(async ({ ctx, next }) => {
    log.debug('[tRPC Auth Middleware] Checking auth, userId:', ctx.userId ? ctx.userId.substring(0, 8) + '...' : 'NULL')
    
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
        
        log.warn('[tRPC Auth Middleware] Not authenticated - no session found')
        throw new Error('Not authenticated. Please sign in first.')
    }
    return next({
        ctx: {
            ...ctx,
            userId: ctx.userId
        }
    })
})

// Protected procedure (requires authentication)
export const protectedProcedure = publicProcedure.use(requireAuth)
