import { createProviderRegistry, customProvider } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import log from 'electron-log'
import { getTokenManager, sanitizeToken } from '../auth/token-manager'
import { getChatGPTAuthManager } from '../auth/chatgpt-manager'
import { getZaiAuthManager } from '../auth/zai-manager'
import { getSecureApiKeyStore } from '../auth/api-key-store'
import type { AIProvider } from '@s-agi/core/types/ai'

/**
 * Z.AI API configuration (OpenAI-compatible)
 * @see https://docs.z.ai/api-reference
 */
const ZAI_CONFIG = {
    baseURL: 'https://api.z.ai/api/paas/v4/',
    sourceHeader: 'S-AGI-Agent'
}

/**
 * ChatGPT Plus/Pro Codex configuration
 */
const CHATGPT_CONFIG = {
    inferenceEndpoint: 'https://chatgpt.com/backend-api/codex/responses'
}

/**
 * Create an OpenAI provider instance with standard API key
 */
function createStandardOpenAI() {
    const apiKeyStore = getSecureApiKeyStore()

    return createOpenAI({
        apiKey: apiKeyStore.getOpenAIKey() || '',
        // Allow dynamic API key fetching
        fetch: async (url, init) => {
            // Get fresh API key for each request
            const currentKey = apiKeyStore.getOpenAIKey()
            if (!currentKey) {
                throw new Error('OpenAI API key not configured')
            }

            const headers = new Headers(init?.headers)
            headers.set('Authorization', `Bearer ${currentKey}`)

            log.debug(`[AI] OpenAI request to ${url}, key: ${sanitizeToken(currentKey)}`)

            return fetch(url, {
                ...init,
                headers
            })
        }
    })
}

/**
 * Create a ChatGPT Plus/Pro provider with OAuth authentication
 * Uses the Codex CLI flow for subscription-based access
 */
function createChatGPTPlusProvider() {
    const chatGPTManager = getChatGPTAuthManager()

    return customProvider({
        languageModels: {
            'gpt-5.1-codex-max': createOpenAI({
                baseURL: CHATGPT_CONFIG.inferenceEndpoint,
                apiKey: 'dummy', // Will be overridden by fetch
                fetch: createChatGPTFetch(chatGPTManager)
            })('gpt-5.1-codex-max'),

            'gpt-5.1-codex-mini': createOpenAI({
                baseURL: CHATGPT_CONFIG.inferenceEndpoint,
                apiKey: 'dummy',
                fetch: createChatGPTFetch(chatGPTManager)
            })('gpt-5.1-codex-mini'),

            'gpt-5.2': createOpenAI({
                baseURL: CHATGPT_CONFIG.inferenceEndpoint,
                apiKey: 'dummy',
                fetch: createChatGPTFetch(chatGPTManager)
            })('gpt-5.2'),

            'gpt-5.2-codex': createOpenAI({
                baseURL: CHATGPT_CONFIG.inferenceEndpoint,
                apiKey: 'dummy',
                fetch: createChatGPTFetch(chatGPTManager)
            })('gpt-5.2-codex')
        }
    })
}

/**
 * Create custom fetch function for ChatGPT Plus OAuth
 */
function createChatGPTFetch(manager: ReturnType<typeof getChatGPTAuthManager>) {
    return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const tokenManager = getTokenManager()
        const tokenInfo = await tokenManager.getValidToken('chatgpt-plus')

        if (!tokenInfo) {
            throw new Error('ChatGPT Plus not connected. Please connect your account in Settings.')
        }

        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${tokenInfo.token}`)

        // Add account ID header if available
        const accountId = manager.getAccountId()
        if (accountId) {
            headers.set('X-ChatGPT-Account-ID', accountId)
        }

        log.debug(`[AI] ChatGPT Plus request to ${url}, account: ${accountId}`)

        return fetch(url, {
            ...init,
            headers
        })
    }
}

/**
 * Create Z.AI provider with OpenAI-compatible endpoint
 * @see https://docs.z.ai/api-reference
 *
 * Available models:
 * - GLM-4.7: Main model with thinking mode support
 * - GLM-4.7-Flash: Fast model for quick tasks (free tier fallback)
 */
function createZaiProvider() {
    const zaiManager = getZaiAuthManager()

    return customProvider({
        languageModels: {
            // Main model with thinking mode support
            'GLM-4.7': createOpenAI({
                baseURL: ZAI_CONFIG.baseURL,
                apiKey: 'dummy',
                fetch: createZaiFetch(zaiManager)
            })('GLM-4.7'),

            // Fast model for quick tasks
            'GLM-4.7-Flash': createOpenAI({
                baseURL: ZAI_CONFIG.baseURL,
                apiKey: 'dummy',
                fetch: createZaiFetch(zaiManager)
            })('GLM-4.7-Flash')
        }
    })
}

/**
 * Create custom fetch function for Z.AI
 */
function createZaiFetch(manager: ReturnType<typeof getZaiAuthManager>) {
    return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const apiKey = manager.getApiKey()

        if (!apiKey) {
            throw new Error('Z.AI API key not configured. Please add your API key in Settings.')
        }

        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${apiKey}`)
        headers.set('X-Source', ZAI_CONFIG.sourceHeader)

        log.debug(`[AI] Z.AI request to ${url}, key: ${sanitizeToken(apiKey)}`)

        return fetch(url, {
            ...init,
            headers
        })
    }
}

/**
 * S-AGI Provider Registry
 *
 * Provides access to all supported AI providers:
 * - openai: Standard OpenAI API (requires API key)
 * - chatgpt-plus: ChatGPT Plus/Pro via Codex OAuth (subscription)
 * - zai: Z.AI GLM models (OpenAI-compatible)
 */
let registryInstance: ReturnType<typeof createProviderRegistry> | null = null

export function getSagiProviderRegistry() {
    if (!registryInstance) {
        registryInstance = createProviderRegistry({
            openai: createStandardOpenAI(),
            'chatgpt-plus': createChatGPTPlusProvider(),
            zai: createZaiProvider()
        })
    }
    return registryInstance
}

/**
 * Get a language model by provider and model ID
 */
export function getLanguageModel(provider: AIProvider, modelId: string) {
    const registry = getSagiProviderRegistry()

    // For OpenAI, use the provider directly
    if (provider === 'openai') {
        const openai = createStandardOpenAI()
        return openai(modelId)
    }

    // For other providers, use the registry
    return registry.languageModel(`${provider}:${modelId}`)
}

/**
 * Check if a provider is available (has credentials)
 */
export function isProviderAvailable(provider: AIProvider): boolean {
    const tokenManager = getTokenManager()

    switch (provider) {
        case 'openai':
            return tokenManager.hasValidToken('openai')
        case 'chatgpt-plus':
            return getChatGPTAuthManager().isConnected()
        case 'zai':
            return !!getZaiAuthManager().getApiKey()
        default:
            return false
    }
}

/**
 * Get provider status for UI display
 */
export function getProviderStatus(provider: AIProvider): {
    available: boolean
    message?: string
} {
    switch (provider) {
        case 'openai': {
            const available = isProviderAvailable('openai')
            return {
                available,
                message: available ? undefined : 'Add your OpenAI API key in Settings'
            }
        }
        case 'chatgpt-plus': {
            const manager = getChatGPTAuthManager()
            const connected = manager.isConnected()
            return {
                available: connected,
                message: connected
                    ? `Connected as ${manager.getCredentials()?.email || 'ChatGPT Plus user'}`
                    : 'Connect your ChatGPT Plus account in Settings'
            }
        }
        case 'zai': {
            const available = isProviderAvailable('zai')
            return {
                available,
                message: available ? undefined : 'Add your Z.AI API key in Settings'
            }
        }
        default:
            return { available: false, message: 'Unknown provider' }
    }
}

/**
 * Invalidate the registry (force recreation on next access)
 * Call this when credentials change
 */
export function invalidateProviderRegistry(): void {
    registryInstance = null
    log.info('[AI] Provider registry invalidated')
}
