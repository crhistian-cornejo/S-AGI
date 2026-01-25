import log from 'electron-log'
import { getChatGPTAuthManager } from './chatgpt-manager'
import { getSecureApiKeyStore } from './api-key-store'
import { getZaiAuthManager } from './zai-manager'
import type { AIProvider } from '@s-agi/core/types/ai'

/**
 * Token expiry buffer - refresh tokens 5 minutes before expiry
 */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

/**
 * Jitter range for refresh timing (±5%)
 */
const JITTER_PERCENT = 0.05

/**
 * Maximum retry attempts for token refresh
 */
const MAX_REFRESH_RETRIES = 3

/**
 * Base delay for exponential backoff (in ms)
 */
const BASE_BACKOFF_MS = 1000

/**
 * Token information returned by the manager
 */
export interface TokenInfo {
    token: string
    expiresAt?: number
    provider: AIProvider
    baseURL?: string
    headers?: Record<string, string>
}

/**
 * Refresh state for a provider
 */
interface RefreshState {
    lastRefreshAttempt: number
    consecutiveFailures: number
    isRefreshing: boolean
}

/**
 * Centralized Token Manager
 *
 * Handles token retrieval and refresh for all AI providers with:
 * - Race condition prevention via refresh locks
 * - Proactive token refresh before expiry
 * - Exponential backoff on failures
 * - Jitter to prevent thundering herd
 */
export class TokenManager {
    private static instance: TokenManager | null = null

    // Locks to prevent concurrent refresh operations
    private refreshLocks = new Map<AIProvider, Promise<TokenInfo | null>>()

    // Track refresh state per provider
    private refreshStates = new Map<AIProvider, RefreshState>()

    private constructor() {
        // Initialize refresh states
        const providers: AIProvider[] = ['openai', 'chatgpt-plus', 'zai']
        providers.forEach(provider => {
            this.refreshStates.set(provider, {
                lastRefreshAttempt: 0,
                consecutiveFailures: 0,
                isRefreshing: false
            })
        })
    }

    static getInstance(): TokenManager {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager()
        }
        return TokenManager.instance
    }

    /**
     * Get a valid token for the specified provider
     * Will refresh if token is expired or about to expire
     */
    async getValidToken(provider: AIProvider): Promise<TokenInfo | null> {
        // Check if there's already a refresh in progress
        const existingRefresh = this.refreshLocks.get(provider)
        if (existingRefresh) {
            log.info(`[TokenManager] Waiting for existing refresh for ${provider}`)
            return existingRefresh
        }

        // Get current token
        const currentToken = this.getCurrentToken(provider)

        if (!currentToken) {
            log.warn(`[TokenManager] No token available for ${provider}`)
            return null
        }

        // Check if token needs refresh
        if (this.needsRefresh(currentToken)) {
            return this.refreshToken(provider)
        }

        return currentToken
    }

    /**
     * Get current token without refresh
     */
    private getCurrentToken(provider: AIProvider): TokenInfo | null {
        switch (provider) {
            case 'openai': {
                const store = getSecureApiKeyStore()
                const apiKey = store.getOpenAIKey()
                if (!apiKey) return null
                return {
                    token: apiKey,
                    provider: 'openai'
                    // OpenAI API keys don't expire
                }
            }

            case 'chatgpt-plus': {
                const manager = getChatGPTAuthManager()
                const token = manager.getAccessToken()
                if (!token) return null
                const credentials = manager.getCredentials()
                return {
                    token,
                    expiresAt: credentials?.expiresAt,
                    provider: 'chatgpt-plus',
                    baseURL: manager.getInferenceEndpoint(),
                    headers: {
                        'X-ChatGPT-Account-ID': manager.getAccountId() || ''
                    }
                }
            }

            case 'zai': {
                const manager = getZaiAuthManager()
                const apiKey = manager.getApiKey()
                if (!apiKey) return null
                return {
                    token: apiKey,
                    provider: 'zai',
                    baseURL: 'https://api.z.ai/api/paas/v4/',
                    headers: {
                        'X-Source': 'S-AGI-Agent'
                    }
                }
            }

            default:
                return null
        }
    }

    /**
     * Check if token needs refresh (expired or about to expire)
     */
    private needsRefresh(tokenInfo: TokenInfo): boolean {
        // API keys (OpenAI, Z.AI) don't expire
        if (!tokenInfo.expiresAt) {
            return false
        }

        const now = Date.now()
        const expiresInMs = tokenInfo.expiresAt - now

        // Refresh if token expires within buffer period
        return expiresInMs <= TOKEN_EXPIRY_BUFFER_MS
    }

    /**
     * Refresh token with lock to prevent concurrent refreshes
     */
    private async refreshToken(provider: AIProvider): Promise<TokenInfo | null> {
        const state = this.refreshStates.get(provider)!

        // Create refresh promise and store it
        const refreshPromise = this.doRefresh(provider)
        this.refreshLocks.set(provider, refreshPromise)

        try {
            const result = await refreshPromise
            // Reset failure count on success
            state.consecutiveFailures = 0
            return result
        } catch (error) {
            state.consecutiveFailures++
            log.error(`[TokenManager] Refresh failed for ${provider}:`, error)
            return null
        } finally {
            // Clear the lock
            this.refreshLocks.delete(provider)
            state.isRefreshing = false
            state.lastRefreshAttempt = Date.now()
        }
    }

    /**
     * Perform the actual token refresh with retry logic
     */
    private async doRefresh(provider: AIProvider): Promise<TokenInfo | null> {
        const state = this.refreshStates.get(provider)!
        state.isRefreshing = true

        for (let attempt = 0; attempt < MAX_REFRESH_RETRIES; attempt++) {
            try {
                switch (provider) {
                    case 'chatgpt-plus': {
                        const manager = getChatGPTAuthManager()
                        const success = await manager.refresh()
                        if (success) {
                            log.info(`[TokenManager] Successfully refreshed ${provider} token`)
                            return this.getCurrentToken(provider)
                        }
                        throw new Error('Refresh returned false')
                    }

                    case 'openai':
                    case 'zai':
                        // These use static API keys, no refresh needed
                        return this.getCurrentToken(provider)

                    default:
                        return null
                }
            } catch (error) {
                const delay = this.calculateBackoff(attempt, state.consecutiveFailures)
                log.warn(`[TokenManager] Refresh attempt ${attempt + 1} failed for ${provider}, retrying in ${delay}ms`)

                if (attempt < MAX_REFRESH_RETRIES - 1) {
                    await this.sleep(delay)
                }
            }
        }

        log.error(`[TokenManager] All refresh attempts failed for ${provider}`)
        return null
    }

    /**
     * Calculate backoff delay with jitter
     */
    private calculateBackoff(attempt: number, consecutiveFailures: number): number {
        // Exponential backoff: base * 2^attempt
        const baseDelay = BASE_BACKOFF_MS * Math.pow(2, attempt)

        // Apply additional penalty for consecutive failures
        const failurePenalty = Math.min(consecutiveFailures, 5) * 1000

        // Add jitter to prevent thundering herd
        const jitter = baseDelay * JITTER_PERCENT * (Math.random() * 2 - 1)

        return Math.floor(baseDelay + failurePenalty + jitter)
    }

    /**
     * Schedule proactive token refresh for expiring tokens
     */
    scheduleRefresh(provider: AIProvider, expiresAt: number): void {
        const now = Date.now()
        const refreshAt = expiresAt - TOKEN_EXPIRY_BUFFER_MS

        if (refreshAt <= now) {
            // Token already needs refresh
            this.refreshToken(provider)
            return
        }

        // Add jitter to the scheduled time
        const jitter = TOKEN_EXPIRY_BUFFER_MS * JITTER_PERCENT * (Math.random() * 2 - 1)
        const delayMs = refreshAt - now + jitter

        log.info(`[TokenManager] Scheduling proactive refresh for ${provider} in ${Math.round(delayMs / 1000)}s`)

        setTimeout(() => {
            this.refreshToken(provider)
        }, delayMs)
    }

    /**
     * Check if a provider has a valid token
     */
    hasValidToken(provider: AIProvider): boolean {
        const token = this.getCurrentToken(provider)
        if (!token) return false
        if (!token.expiresAt) return true
        return token.expiresAt > Date.now()
    }

    /**
     * Get refresh state for debugging
     */
    getRefreshState(provider: AIProvider): RefreshState | undefined {
        return this.refreshStates.get(provider)
    }

    /**
     * Clear all cached state (for logout)
     */
    clearAll(): void {
        this.refreshLocks.clear()
        this.refreshStates.forEach(state => {
            state.consecutiveFailures = 0
            state.isRefreshing = false
            state.lastRefreshAttempt = 0
        })
        log.info('[TokenManager] Cleared all token state')
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

/**
 * Sanitize a token for logging (show only first/last 4 chars)
 */
export function sanitizeToken(token: string | null | undefined): string {
    if (!token) return '<none>'
    if (token.length <= 12) return '<short-token>'
    return `${token.slice(0, 4)}...${token.slice(-4)}`
}

/**
 * Singleton accessor
 */
export function getTokenManager(): TokenManager {
    return TokenManager.getInstance()
}
