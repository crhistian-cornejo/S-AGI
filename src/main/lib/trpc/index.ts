// Re-export tRPC helpers from separate file to avoid circular imports
export { router, publicProcedure } from './trpc'

// Import routers
import { router } from './trpc'
import { chatsRouter } from './routers/chats'
import { messagesRouter } from './routers/messages'
import { artifactsRouter } from './routers/artifacts'
import { aiRouter } from './routers/ai'
import { authRouter } from './routers/auth'
import { settingsRouter } from './routers/settings'

// Main app router
export const appRouter = router({
    chats: chatsRouter,
    messages: messagesRouter,
    artifacts: artifactsRouter,
    ai: aiRouter,
    auth: authRouter,
    settings: settingsRouter
})

// Export type for client
export type AppRouter = typeof appRouter
