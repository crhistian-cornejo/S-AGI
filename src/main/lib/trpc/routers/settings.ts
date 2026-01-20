import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { getSecureApiKeyStore } from '../../auth/api-key-store'
import { getChatGPTAuthManager, getClaudeCodeAuthManager, getZaiAuthManager } from '../../auth'
import { supabase } from '../../supabase/client'
import os from 'os'
import { app } from 'electron'

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

    // Get system and app info for debug
    getSystemInfo: publicProcedure.query(() => {
        return {
            platform: os.platform(),
            arch: os.arch(),
            release: os.release(),
            totalMem: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
            freeMem: Math.round(os.freemem() / (1024 * 1024 * 1024)),
            cpus: os.cpus().length,
            version: app.getVersion(),
            chrome: process.versions.chrome,
            electron: process.versions.electron,
            node: process.versions.node,
            v8: process.versions.v8,
        }
    }),

    // Check connectivity health
    checkHealth: publicProcedure.query(async () => {
        const results = {
            supabase: false,
            openai: false,
            internet: false,
        }

        try {
            // Check internet/google
            const response = await fetch('https://www.google.com', { method: 'HEAD', timeout: 5000 } as any)
            results.internet = response.ok
        } catch (e) {
            results.internet = false
        }

        try {
            // Check Supabase
            const { error } = await supabase.from('chats').select('id', { count: 'exact', head: true })
            results.supabase = !error
        } catch (e) {
            results.supabase = false
        }

        return results
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
