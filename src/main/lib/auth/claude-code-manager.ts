import { shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { getClaudeCodeAuthStore, ClaudeCodeCredentials } from './claude-code-store'
import log from 'electron-log'

// Claude Code OAuth endpoints
const CLAUDE_AUTH_URL = 'https://console.anthropic.com/oauth/authorize'
const CLAUDE_TOKEN_URL = 'https://console.anthropic.com/oauth/token'
const CLAUDE_CLIENT_ID = process.env.VITE_ANTHROPIC_CLIENT_ID || ''

/**
 * Manages OAuth flow for Claude Code Pro subscription
 */
export class ClaudeCodeAuthManager {
    private store = getClaudeCodeAuthStore()
    private refreshTimer?: NodeJS.Timeout

    constructor() {
        // Schedule refresh if already authenticated
        if (this.store.isConnected()) {
            this.scheduleRefresh()
        }
    }

    /**
     * Start OAuth flow - opens browser for authorization
     */
    startAuthFlow(_mainWindow: BrowserWindow | null): void {
        const redirectUri = 's-agi://auth/callback'
        const scope = 'claude-code:read claude-code:write'
        const state = randomUUID()

        const authUrl = new URL(CLAUDE_AUTH_URL)
        authUrl.searchParams.set('client_id', CLAUDE_CLIENT_ID)
        authUrl.searchParams.set('redirect_uri', redirectUri)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('scope', scope)
        authUrl.searchParams.set('state', state)

        log.info('[ClaudeCodeAuth] Starting OAuth flow')
        shell.openExternal(authUrl.toString())
    }

    /**
     * Exchange authorization code for tokens
     */
    async exchangeCode(code: string): Promise<ClaudeCodeCredentials> {
        try {
            const response = await fetch(CLAUDE_TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    client_id: CLAUDE_CLIENT_ID,
                    redirect_uri: 's-agi://auth/callback'
                })
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Unknown error' }))
                throw new Error(error.error || `Exchange failed: ${response.status}`)
            }

            const data = await response.json()

            const credentials: ClaudeCodeCredentials = {
                oauthToken: data.access_token,
                connectedAt: new Date().toISOString(),
                userId: data.user_id
            }

            this.store.save(credentials)
            this.scheduleRefresh()

            log.info('[ClaudeCodeAuth] Successfully connected to Claude Code')
            return credentials
        } catch (error) {
            log.error('[ClaudeCodeAuth] Failed to exchange code:', error)
            throw error
        }
    }

    /**
     * Schedule token refresh
     */
    private scheduleRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
        }

        // Refresh every 50 minutes (tokens typically last 1 hour)
        this.refreshTimer = setTimeout(() => {
            this.refresh()
        }, 50 * 60 * 1000)
    }

    /**
     * Refresh the OAuth token
     */
    async refresh(): Promise<boolean> {
        // Note: Implement refresh token flow when available
        log.info('[ClaudeCodeAuth] Token refresh not yet implemented')
        return true
    }

    /**
     * Check if connected to Claude Code
     */
    isConnected(): boolean {
        return this.store.isConnected()
    }

    /**
     * Get the current OAuth token
     */
    getToken(): string | null {
        return this.store.getToken()
    }

    /**
     * Disconnect from Claude Code
     */
    disconnect(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
        }
        this.store.clear()
        log.info('[ClaudeCodeAuth] Disconnected from Claude Code')
    }
}

// Singleton instance
let authManagerInstance: ClaudeCodeAuthManager | null = null

export function getClaudeCodeAuthManager(): ClaudeCodeAuthManager {
    if (!authManagerInstance) {
        authManagerInstance = new ClaudeCodeAuthManager()
    }
    return authManagerInstance
}
