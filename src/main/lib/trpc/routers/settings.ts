import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { getSecureApiKeyStore } from '../../auth/api-key-store'

/**
 * Settings router for secure API key management
 */
export const settingsRouter = router({
    // Get API key status (not the actual keys for security)
    getApiKeyStatus: publicProcedure.query(() => {
        const store = getSecureApiKeyStore()
        return {
            hasOpenAI: store.hasOpenAIKey(),
            hasAnthropic: store.hasAnthropicKey(),
            hasTavily: store.hasTavilyKey()
        }
    }),

    // Set OpenAI API key
    setOpenAIKey: publicProcedure
        .input(z.object({ key: z.string().nullable() }))
        .mutation(({ input }) => {
            const store = getSecureApiKeyStore()
            store.setOpenAIKey(input.key)
            return { success: true }
        }),

    // Set Anthropic API key
    setAnthropicKey: publicProcedure
        .input(z.object({ key: z.string().nullable() }))
        .mutation(({ input }) => {
            const store = getSecureApiKeyStore()
            store.setAnthropicKey(input.key)
            return { success: true }
        }),

    // Get OpenAI key (for AI requests in main process)
    getOpenAIKey: publicProcedure.query(() => {
        const store = getSecureApiKeyStore()
        return { key: store.getOpenAIKey() }
    }),

    // Get Anthropic key (for AI requests in main process)
    getAnthropicKey: publicProcedure.query(() => {
        const store = getSecureApiKeyStore()
        return { key: store.getAnthropicKey() }
    }),

    // Set Tavily API key (for web search)
    setTavilyKey: publicProcedure
        .input(z.object({ key: z.string().nullable() }))
        .mutation(({ input }) => {
            const store = getSecureApiKeyStore()
            store.setTavilyKey(input.key)
            return { success: true }
        }),

    // Get Tavily key (for web search in main process)
    getTavilyKey: publicProcedure.query(() => {
        const store = getSecureApiKeyStore()
        return { key: store.getTavilyKey() }
    }),

    // Clear all API keys
    clearAllKeys: publicProcedure.mutation(() => {
        const store = getSecureApiKeyStore()
        store.clear()
        return { success: true }
    })
})
