import { createProviderRegistry, customProvider } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createCerebras } from '@ai-sdk/cerebras'
import { createGroq } from '@ai-sdk/groq'
import log from 'electron-log'
import { getTokenManager, sanitizeToken } from '../auth/token-manager'
import { getChatGPTAuthManager } from '../auth/chatgpt-manager'
import { getClaudeCodeAuthManager } from '../auth/claude-code-manager'
import { getZaiAuthManager } from '../auth/zai-manager'
import { getSecureApiKeyStore } from '../auth/api-key-store'
import { getCerebrasAuthManager } from '../auth/cerebras-manager'
import { getGroqAuthManager } from '../auth/groq-manager'
import { resolveModelIdForApi } from '@s-agi/core/types/ai'
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
 * Ollama local AI configuration (OpenAI-compatible)
 * @see https://ollama.com/blog/openai-compatibility
 */
const OLLAMA_CONFIG = {
    baseURL: 'http://127.0.0.1:11434/v1'
}

// ============================================================================
// Singleton provider instances (created once, reused across requests)
// ============================================================================
let _openai: ReturnType<typeof createOpenAI> | null = null
let _chatgptPlus: ReturnType<typeof customProvider> | null = null
let _zai: ReturnType<typeof createOpenAICompatible> | null = null
let _claude: ReturnType<typeof createAnthropic> | null = null
let _cerebras: ReturnType<typeof createCerebras> | null = null
let _groq: ReturnType<typeof createGroq> | null = null
let _ollama: ReturnType<typeof createOpenAI> | null = null

/**
 * Create an OpenAI provider instance with standard API key
 */
function getStandardOpenAI() {
    if (!_openai) {
        const apiKeyStore = getSecureApiKeyStore()
        _openai = createOpenAI({
            apiKey: apiKeyStore.getOpenAIKey() || '',
            fetch: async (url, init) => {
                const currentKey = apiKeyStore.getOpenAIKey()
                if (!currentKey) {
                    throw new Error('OpenAI API key not configured')
                }
                const headers = new Headers(init?.headers)
                headers.set('Authorization', `Bearer ${currentKey}`)
                log.debug(`[AI] OpenAI request to ${url}, key: ${sanitizeToken(currentKey)}`)
                return fetch(url, { ...init, headers })
            }
        })
    }
    return _openai
}

/**
 * Create a ChatGPT Plus/Pro provider with OAuth authentication
 */
function getChatGPTPlusProvider() {
    if (!_chatgptPlus) {
        const chatGPTManager = getChatGPTAuthManager()
        const chatGPTFetch = createChatGPTFetch(chatGPTManager)
        _chatgptPlus = customProvider({
            languageModels: {
                'gpt-5.1-codex-max': createOpenAI({
                    baseURL: CHATGPT_CONFIG.inferenceEndpoint,
                    apiKey: 'dummy',
                    fetch: chatGPTFetch
                })('gpt-5.1-codex-max'),
                'gpt-5.1-codex-mini': createOpenAI({
                    baseURL: CHATGPT_CONFIG.inferenceEndpoint,
                    apiKey: 'dummy',
                    fetch: chatGPTFetch
                })('gpt-5.1-codex-mini'),
                'gpt-5.2': createOpenAI({
                    baseURL: CHATGPT_CONFIG.inferenceEndpoint,
                    apiKey: 'dummy',
                    fetch: chatGPTFetch
                })('gpt-5.2'),
                'gpt-5.2-codex': createOpenAI({
                    baseURL: CHATGPT_CONFIG.inferenceEndpoint,
                    apiKey: 'dummy',
                    fetch: chatGPTFetch
                })('gpt-5.2-codex')
            }
        })
    }
    return _chatgptPlus
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
        const accountId = manager.getAccountId()
        if (accountId) {
            headers.set('X-ChatGPT-Account-ID', accountId)
        }
        log.debug(`[AI] ChatGPT Plus request to ${url}, account: ${accountId}`)
        return fetch(url, { ...init, headers })
    }
}

/**
 * Create Z.AI provider with OpenAI-compatible endpoint.
 * Uses createOpenAICompatible (not createOpenAI) so that custom providerOptions
 * like `thinking` are passed through to the Z.AI API body.
 * @ai-sdk/openai has strict Zod validation that drops unknown keys.
 */
function getZaiProvider() {
    if (!_zai) {
        const zaiManager = getZaiAuthManager()
        const zaiFetch = createZaiFetch(zaiManager)
        _zai = createOpenAICompatible({
            name: 'zai',
            baseURL: ZAI_CONFIG.baseURL,
            apiKey: 'dummy',
            fetch: zaiFetch,
        })
    }
    return _zai
}

/**
 * Create a Claude provider for the Anthropic API.
 * Supports OAuth token (Claude Code subscription) with API key fallback.
 */
function getClaudeProvider() {
    if (!_claude) {
        const apiKeyStore = getSecureApiKeyStore()
        const claudeCodeAuth = getClaudeCodeAuthManager()
        _claude = createAnthropic({
            apiKey: apiKeyStore.getAnthropicKey() || 'placeholder',
            fetch: async (url, init) => {
                const headers = new Headers(init?.headers)
                headers.delete('authorization')
                headers.delete('x-api-key')

                // Try OAuth token first (Claude Code subscription)
                try {
                    const oauthToken = await claudeCodeAuth.getValidToken()
                    if (oauthToken) {
                        headers.set('Authorization', `Bearer ${oauthToken}`)
                        log.debug(`[AI] Claude OAuth request to ${url}`)
                        return fetch(url, { ...init, headers })
                    }
                } catch (e) {
                    log.debug('[AI] Claude OAuth token not available, trying API key')
                }

                // Fallback to API key
                const apiKey = apiKeyStore.getAnthropicKey()
                if (!apiKey) {
                    throw new Error('Anthropic not configured. Connect Claude Code or add your API key in Settings.')
                }
                headers.set('x-api-key', apiKey)
                log.debug(`[AI] Claude API key request to ${url}, key: ${sanitizeToken(apiKey)}`)
                return fetch(url, { ...init, headers })
            }
        })
    }
    return _claude
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
        return fetch(url, { ...init, headers })
    }
}

/**
 * Create Cerebras provider using official @ai-sdk/cerebras package
 * @see https://inference-docs.cerebras.ai
 */
function getCerebrasProvider() {
    if (!_cerebras) {
        const cerebrasManager = getCerebrasAuthManager()
        _cerebras = createCerebras({
            apiKey: 'dummy',
            fetch: async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
                const apiKey = cerebrasManager.getApiKey()
                if (!apiKey) {
                    throw new Error('Cerebras API key not configured. Please add your API key in Settings.')
                }
                const headers = new Headers(init?.headers)
                headers.set('Authorization', `Bearer ${apiKey}`)
                log.debug(`[AI] Cerebras request to ${url}, key: ${sanitizeToken(apiKey)}`)
                return fetch(url, { ...init, headers })
            }
        })
    }
    return _cerebras
}

/**
 * Create Groq provider using official @ai-sdk/groq package
 * @see https://console.groq.com/docs
 */
function getGroqProvider() {
    if (!_groq) {
        const groqManager = getGroqAuthManager()
        _groq = createGroq({
            apiKey: 'dummy',
            fetch: async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
                const apiKey = groqManager.getApiKey()
                if (!apiKey) {
                    throw new Error('Groq API key not configured. Please add your API key in Settings.')
                }
                const headers = new Headers(init?.headers)
                headers.set('Authorization', `Bearer ${apiKey}`)
                log.debug(`[AI] Groq request to ${url}, key: ${sanitizeToken(apiKey)}`)
                return fetch(url, { ...init, headers })
            }
        })
    }
    return _groq
}

/**
 * Create Ollama provider using OpenAI-compatible endpoint
 * @see https://ollama.com/blog/openai-compatibility
 */
function getOllamaProvider() {
    if (!_ollama) {
        _ollama = createOpenAI({
            baseURL: OLLAMA_CONFIG.baseURL,
            apiKey: 'ollama',
            fetch: async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
                const headers = new Headers(init?.headers)
                headers.delete('authorization')
                log.debug(`[AI] Ollama request to ${url}`)
                return fetch(url, { ...init, headers })
            }
        })
    }
    return _ollama
}

/**
 * S-AGI Provider Registry
 */
let registryInstance: ReturnType<typeof createProviderRegistry> | null = null

export function getSagiProviderRegistry() {
    if (!registryInstance) {
        registryInstance = createProviderRegistry({
            openai: getStandardOpenAI(),
            'chatgpt-plus': getChatGPTPlusProvider(),
            zai: getZaiProvider(),
            claude: getClaudeProvider(),
            cerebras: getCerebrasProvider(),
            groq: getGroqProvider(),
            ollama: getOllamaProvider()
        })
    }
    return registryInstance
}

/**
 * Get a language model by provider and model ID.
 * Uses singleton provider instances to avoid recreating providers per request.
 */
export function getLanguageModel(provider: AIProvider, modelId: string) {
    const apiModelId = resolveModelIdForApi(modelId)

    switch (provider) {
        case 'openai':
            return getStandardOpenAI()(apiModelId)
        case 'chatgpt-plus':
            return getChatGPTPlusProvider().languageModel(apiModelId)
        case 'zai':
            return getZaiProvider().chatModel(apiModelId)
        case 'claude':
            return getClaudeProvider()(apiModelId)
        case 'cerebras':
            return getCerebrasProvider()(apiModelId)
        case 'groq':
            return getGroqProvider()(apiModelId)
        case 'ollama':
            return getOllamaProvider().chat(apiModelId)
        default: {
            const registry = getSagiProviderRegistry()
            return registry.languageModel(`${provider}:${apiModelId}`)
        }
    }
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
        case 'claude':
            return getClaudeCodeAuthManager().isConnected() || getSecureApiKeyStore().hasAnthropicKey()
        case 'cerebras':
            return !!getCerebrasAuthManager().getApiKey()
        case 'groq':
            return !!getGroqAuthManager().getApiKey()
        case 'ollama':
            return true
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
        case 'claude': {
            const available = isProviderAvailable('claude')
            return {
                available,
                message: available ? undefined : 'Connect Claude Code or add Anthropic API key in Settings'
            }
        }
        case 'cerebras': {
            const available = isProviderAvailable('cerebras')
            return {
                available,
                message: available ? undefined : 'Add your Cerebras API key in Settings'
            }
        }
        case 'groq': {
            const available = isProviderAvailable('groq')
            return {
                available,
                message: available ? undefined : 'Add your Groq API key in Settings'
            }
        }
        case 'ollama': {
            return {
                available: true,
                message: 'Local AI via Ollama (ensure ollama serve is running)'
            }
        }
        default:
            return { available: false, message: 'Unknown provider' }
    }
}

/**
 * Invalidate the registry and all cached provider instances.
 * Call this when credentials change.
 */
/**
 * Get the raw Anthropic provider instance (for native tools like webSearch).
 */
export { getClaudeProvider }

/**
 * Get the raw Groq provider instance (for native tools like browserSearch).
 */
export { getGroqProvider }

export function invalidateProviderRegistry(): void {
    registryInstance = null
    _openai = null
    _chatgptPlus = null
    _zai = null
    _claude = null
    _cerebras = null
    _groq = null
    _ollama = null
    log.info('[AI] Provider registry and all provider instances invalidated')
}
