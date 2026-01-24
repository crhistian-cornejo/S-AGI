/**
 * Unified Authentication State
 *
 * Single source of truth for authentication state across all providers.
 * Based on craft-agents-oss patterns.
 */

import { getCredentialManager } from '../credentials'
import { getExistingClaudeCredentials, isTokenExpired as isClaudeCliTokenExpired } from '../../auth/claude-cli-import'
import log from 'electron-log'

export type AuthType = 'api_key' | 'oauth_token'

export interface AuthState {
    // Claude (Anthropic)
    claude: {
        type: AuthType | null
        hasCredentials: boolean
        isTokenExpired: boolean
        source?: 'api_key' | 'oauth' | 'cli_import'
    }
    // ChatGPT (OpenAI Plus)
    chatgpt: {
        hasCredentials: boolean
        isTokenExpired: boolean
    }
    // OpenAI API
    openai: {
        hasCredentials: boolean
    }
    // Z.AI
    zai: {
        hasCredentials: boolean
    }
    // Tavily
    tavily: {
        hasCredentials: boolean
    }
    // Overall status
    hasAnyAIProvider: boolean
    hasPrimaryProvider: boolean  // Claude or ChatGPT
}

export interface SetupNeeds {
    needsClaudeSetup: boolean
    needsAnySetup: boolean
    canImportClaudeCli: boolean
}

/**
 * Get the current authentication state across all providers
 */
export async function getAuthState(): Promise<AuthState> {
    const manager = getCredentialManager()

    // Check all providers in parallel
    const [
        hasAnthropicKey,
        claudeOAuth,
        isClaudeExpired,
        hasChatGPT,
        isChatGPTExpired,
        hasOpenAI,
        hasZai,
        hasTavily,
    ] = await Promise.all([
        manager.hasAnthropicKey(),
        manager.getClaudeOAuth(),
        manager.isClaudeTokenExpired(),
        manager.hasChatGPTOAuth(),
        manager.isChatGPTTokenExpired(),
        manager.hasOpenAIKey(),
        manager.hasZaiKey(),
        manager.hasTavilyKey(),
    ])

    // Determine Claude auth type and source
    let claudeType: AuthType | null = null
    let claudeSource: 'api_key' | 'oauth' | 'cli_import' | undefined
    let claudeHasCredentials = false

    if (claudeOAuth) {
        claudeType = 'oauth_token'
        claudeSource = claudeOAuth.source || 'oauth'
        claudeHasCredentials = true
    } else if (hasAnthropicKey) {
        claudeType = 'api_key'
        claudeSource = 'api_key'
        claudeHasCredentials = true
    }

    const hasAnyAIProvider = claudeHasCredentials || hasChatGPT || hasOpenAI || hasZai
    const hasPrimaryProvider = claudeHasCredentials || hasChatGPT

    return {
        claude: {
            type: claudeType,
            hasCredentials: claudeHasCredentials,
            isTokenExpired: isClaudeExpired,
            source: claudeSource,
        },
        chatgpt: {
            hasCredentials: hasChatGPT,
            isTokenExpired: isChatGPTExpired,
        },
        openai: {
            hasCredentials: hasOpenAI,
        },
        zai: {
            hasCredentials: hasZai,
        },
        tavily: {
            hasCredentials: hasTavily,
        },
        hasAnyAIProvider,
        hasPrimaryProvider,
    }
}

/**
 * Get what setup is needed for the user
 */
export async function getSetupNeeds(): Promise<SetupNeeds> {
    const state = await getAuthState()

    // Check if Claude CLI has credentials we can import
    const cliCredentials = getExistingClaudeCredentials()
    const canImportClaudeCli = cliCredentials !== null && !isClaudeCliTokenExpired(cliCredentials.expiresAt)

    return {
        needsClaudeSetup: !state.claude.hasCredentials,
        needsAnySetup: !state.hasAnyAIProvider,
        canImportClaudeCli,
    }
}

/**
 * Get a valid Claude OAuth token, refreshing if necessary
 * Returns null if no credentials or refresh fails
 */
export async function getValidClaudeOAuthToken(): Promise<string | null> {
    const manager = getCredentialManager()
    const creds = await manager.getClaudeOAuth()

    if (!creds) {
        return null
    }

    // Check if token is expired
    if (creds.expiresAt && Date.now() + 5 * 60 * 1000 >= creds.expiresAt) {
        // Token expired, try to refresh
        if (creds.refreshToken) {
            try {
                const refreshed = await refreshClaudeToken(creds.refreshToken)
                await manager.setClaudeOAuth({
                    ...creds,
                    accessToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken || creds.refreshToken,
                    expiresAt: refreshed.expiresAt,
                })
                log.info('[AuthState] Claude token refreshed successfully')
                return refreshed.accessToken
            } catch (error) {
                log.error('[AuthState] Failed to refresh Claude token:', error)
                return null
            }
        }
        return null
    }

    return creds.accessToken
}

/**
 * Refresh Claude OAuth token using refresh token
 */
async function refreshClaudeToken(refreshToken: string): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: number
}> {
    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: 'claude-desktop',
    })

    const response = await fetch('https://api.anthropic.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to refresh Claude token: ${error}`)
    }

    const data = await response.json() as {
        access_token: string
        refresh_token?: string
        expires_in?: number
    }

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    }
}

/**
 * Import Claude credentials from CLI if available
 */
export async function importClaudeFromCli(): Promise<boolean> {
    const cliCredentials = getExistingClaudeCredentials()

    if (!cliCredentials) {
        log.info('[AuthState] No Claude CLI credentials found')
        return false
    }

    const manager = getCredentialManager()

    // If token is expired and has refresh token, try to refresh first
    if (isClaudeCliTokenExpired(cliCredentials.expiresAt) && cliCredentials.refreshToken) {
        try {
            const refreshed = await refreshClaudeToken(cliCredentials.refreshToken)
            await manager.setClaudeOAuth({
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                expiresAt: refreshed.expiresAt,
                scopes: cliCredentials.scopes,
                source: 'cli_import',
            })
            log.info('[AuthState] Imported and refreshed Claude CLI credentials')
            return true
        } catch (error) {
            log.warn('[AuthState] Failed to refresh CLI token, using as-is:', error)
        }
    }

    // Save credentials as-is
    await manager.setClaudeOAuth({
        accessToken: cliCredentials.accessToken,
        refreshToken: cliCredentials.refreshToken,
        expiresAt: cliCredentials.expiresAt,
        scopes: cliCredentials.scopes,
        source: 'cli_import',
    })

    log.info('[AuthState] Imported Claude CLI credentials')
    return true
}
