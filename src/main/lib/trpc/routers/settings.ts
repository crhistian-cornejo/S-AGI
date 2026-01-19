import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { getSecureApiKeyStore } from '../../auth/api-key-store'
import { getChatGPTAuthManager, getClaudeCodeAuthManager, getZaiAuthManager } from '../../auth'

/**
 * Settings router for secure API key management and OAuth status
 */
export const settingsRouter = router({
    // Get API key status (not the actual keys for security)
    getApiKeyStatus: publicProcedure.query(() => {
        const store = getSecureApiKeyStore()
        const chatGPTAuth = getChatGPTAuthManager()
        const claudeCodeAuth = getClaudeCodeAuthManager()
        const zaiAuth = getZaiAuthManager()
        
        return {
            hasOpenAI: store.hasOpenAIKey(),
            hasAnthropic: store.hasAnthropicKey(),
            hasTavily: store.hasTavilyKey(),
            hasZai: zaiAuth.hasApiKey(),
            // OAuth provider status
            hasChatGPTPlus: chatGPTAuth.isConnected(),
            hasClaudeCode: claudeCodeAuth.isConnected()
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

    // Set Z.AI API key
    setZaiKey: publicProcedure
        .input(z.object({ key: z.string().nullable() }))
        .mutation(({ input }) => {
            const zaiAuth = getZaiAuthManager()
            zaiAuth.setApiKey(input.key)
            return { success: true }
        }),

    // Get Z.AI key (for AI requests in main process)
    getZaiKey: publicProcedure.query(() => {
        const zaiAuth = getZaiAuthManager()
        return { key: zaiAuth.getApiKey() }
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
        const zaiAuth = getZaiAuthManager()
        store.clear()
        zaiAuth.clear()
        return { success: true }
    })
})
