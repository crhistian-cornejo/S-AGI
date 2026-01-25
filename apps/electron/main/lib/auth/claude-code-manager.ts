import { shell, BrowserWindow } from 'electron'
import { randomUUID, randomBytes, createHash } from 'crypto'
import { getClaudeCodeAuthStore, ClaudeCodeCredentials } from './claude-code-store'
import { getExistingClaudeCredentials, hasClaudeCliCredentials, isTokenExpired } from './claude-cli-import'
import log from 'electron-log'

// Claude Code OAuth endpoints (using craft-agents-oss patterns)
const CLAUDE_AUTH_URL = 'https://claude.ai/oauth/authorize'
const CLAUDE_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const CLAUDE_REFRESH_URL = 'https://api.anthropic.com/v1/oauth/token'
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'

// Client ID from craft-agents-oss (public client, no secret needed)
const CLAUDE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const OAUTH_SCOPES = 'org:create_api_key user:profile user:inference'
const STATE_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

interface OAuthState {
    state: string
    codeVerifier: string
    timestamp: number
    expiresAt: number
}

/**
 * Manages OAuth flow for Claude Code Pro/Max subscription
 * Supports PKCE-based OAuth, token refresh, and CLI credential import
 */
export class ClaudeCodeAuthManager {
    private store = getClaudeCodeAuthStore()
    private refreshTimer?: NodeJS.Timeout
    private currentOAuthState: OAuthState | null = null
    private refreshLock = false

    constructor() {
        // Schedule refresh if already authenticated
        if (this.store.isConnected()) {
            this.scheduleRefresh()
        }
    }

    /**
     * Generate PKCE code verifier and challenge
     */
    private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
        const codeVerifier = randomBytes(32).toString('base64url')
        const codeChallenge = createHash('sha256')
            .update(codeVerifier)
            .digest('base64url')
        return { codeVerifier, codeChallenge }
    }

    /**
     * Start OAuth flow with PKCE - opens browser for authorization
     * Returns the authorization URL that was opened
     */
    startAuthFlow(_mainWindow: BrowserWindow | null): string {
        const state = randomUUID()
        const { codeVerifier, codeChallenge } = this.generatePKCE()

        // Store state for later verification
        const now = Date.now()
        this.currentOAuthState = {
            state,
            codeVerifier,
            timestamp: now,
            expiresAt: now + STATE_EXPIRY_MS,
        }

        const params = new URLSearchParams({
            code: 'true',
            client_id: CLAUDE_CLIENT_ID,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            scope: OAUTH_SCOPES,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state,
        })

        const authUrl = `${CLAUDE_AUTH_URL}?${params.toString()}`

        log.info('[ClaudeCodeAuth] Starting OAuth flow with PKCE')
        shell.openExternal(authUrl)

        return authUrl
    }

    /**
     * Check if there is a valid OAuth state in progress
     */
    hasValidOAuthState(): boolean {
        if (!this.currentOAuthState) return false
        return Date.now() < this.currentOAuthState.expiresAt
    }

    /**
     * Exchange authorization code for tokens (with PKCE)
     */
    async exchangeCode(code: string): Promise<ClaudeCodeCredentials> {
        // Verify we have valid state
        if (!this.currentOAuthState) {
            throw new Error('No OAuth state found. Please start the authentication flow again.')
        }

        if (Date.now() > this.currentOAuthState.expiresAt) {
            this.currentOAuthState = null
            throw new Error('OAuth state expired (older than 10 minutes). Please try again.')
        }

        // Clean up the authorization code
        const cleanedCode = code.split('#')[0]?.split('&')[0] ?? code

        try {
            const response = await fetch(CLAUDE_TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    Accept: 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    Referer: 'https://claude.ai/',
                    Origin: 'https://claude.ai',
                },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    client_id: CLAUDE_CLIENT_ID,
                    code: cleanedCode,
                    redirect_uri: REDIRECT_URI,
                    code_verifier: this.currentOAuthState.codeVerifier,
                    state: this.currentOAuthState.state,
                }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                let errorMessage: string
                try {
                    const errorJson = JSON.parse(errorText)
                    errorMessage = errorJson.error_description || errorJson.error || errorText
                } catch {
                    errorMessage = errorText
                }
                throw new Error(`Token exchange failed: ${response.status} - ${errorMessage}`)
            }

            const data = await response.json() as {
                access_token: string
                refresh_token?: string
                expires_in?: number
                scope?: string
                user_id?: string
            }

            // Clear OAuth state after successful exchange
            this.currentOAuthState = null

            const credentials: ClaudeCodeCredentials = {
                oauthToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
                connectedAt: new Date().toISOString(),
                userId: data.user_id,
                scopes: data.scope ? data.scope.split(' ') : ['user:inference', 'user:profile'],
                source: 'oauth'
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
     * Import credentials from Claude CLI (if installed)
     */
    async importFromCli(): Promise<ClaudeCodeCredentials | null> {
        const cliCredentials = getExistingClaudeCredentials()

        if (!cliCredentials) {
            log.info('[ClaudeCodeAuth] No Claude CLI credentials found')
            return null
        }

        // Check if token is expired and needs refresh
        if (isTokenExpired(cliCredentials.expiresAt) && cliCredentials.refreshToken) {
            log.info('[ClaudeCodeAuth] CLI token expired, attempting refresh')
            try {
                const refreshed = await this.refreshToken(cliCredentials.refreshToken)
                const credentials: ClaudeCodeCredentials = {
                    oauthToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken,
                    expiresAt: refreshed.expiresAt,
                    connectedAt: new Date().toISOString(),
                    scopes: cliCredentials.scopes,
                    source: 'cli_import'
                }
                this.store.save(credentials)
                this.scheduleRefresh()
                log.info('[ClaudeCodeAuth] Imported and refreshed Claude CLI credentials')
                return credentials
            } catch (error) {
                log.warn('[ClaudeCodeAuth] Failed to refresh CLI token:', error)
                // Continue with existing token anyway
            }
        }

        const credentials: ClaudeCodeCredentials = {
            oauthToken: cliCredentials.accessToken,
            refreshToken: cliCredentials.refreshToken,
            expiresAt: cliCredentials.expiresAt,
            connectedAt: new Date().toISOString(),
            scopes: cliCredentials.scopes,
            source: 'cli_import'
        }

        this.store.save(credentials)
        this.scheduleRefresh()
        log.info('[ClaudeCodeAuth] Imported Claude CLI credentials')
        return credentials
    }

    /**
     * Check if Claude CLI credentials are available for import
     */
    hasCliCredentials(): boolean {
        return hasClaudeCliCredentials()
    }

    /**
     * Schedule token refresh based on expiration time
     */
    private scheduleRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
        }

        const expiresAt = this.store.getExpiresAt()
        if (!expiresAt) {
            // No expiry info, refresh every 50 minutes
            this.refreshTimer = setTimeout(() => {
                this.refresh()
            }, 50 * 60 * 1000)
            return
        }

        // Schedule refresh 5 minutes before expiry
        const timeUntilRefresh = expiresAt - Date.now() - 5 * 60 * 1000
        if (timeUntilRefresh <= 0) {
            // Token already expired or about to expire, refresh immediately
            this.refresh()
        } else {
            this.refreshTimer = setTimeout(() => {
                this.refresh()
            }, timeUntilRefresh)
        }
    }

    /**
     * Refresh the OAuth token using refresh token
     */
    async refresh(): Promise<boolean> {
        if (this.refreshLock) {
            log.debug('[ClaudeCodeAuth] Refresh already in progress')
            return false
        }

        const refreshToken = this.store.getRefreshToken()
        if (!refreshToken) {
            log.warn('[ClaudeCodeAuth] No refresh token available')
            return false
        }

        this.refreshLock = true

        try {
            const refreshed = await this.refreshToken(refreshToken)
            this.store.updateToken(refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt)
            this.scheduleRefresh()
            log.info('[ClaudeCodeAuth] Token refreshed successfully')
            return true
        } catch (error) {
            log.error('[ClaudeCodeAuth] Token refresh failed:', error)
            return false
        } finally {
            this.refreshLock = false
        }
    }

    /**
     * Refresh token using Anthropic API
     */
    private async refreshToken(refreshToken: string): Promise<{
        accessToken: string
        refreshToken?: string
        expiresAt?: number
    }> {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: 'claude-desktop',
        })

        const response = await fetch(CLAUDE_REFRESH_URL, {
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
            token_type?: string
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        }
    }

    /**
     * Get a valid token, refreshing if necessary
     */
    async getValidToken(): Promise<string | null> {
        if (!this.store.isConnected()) {
            return null
        }

        if (this.store.isTokenExpired()) {
            const refreshed = await this.refresh()
            if (!refreshed) {
                return null
            }
        }

        return this.store.getToken()
    }

    /**
     * Check if connected to Claude Code
     */
    isConnected(): boolean {
        return this.store.isConnected()
    }

    /**
     * Get the current OAuth token (may be expired)
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
        this.currentOAuthState = null
        this.store.clear()
        log.info('[ClaudeCodeAuth] Disconnected from Claude Code')
    }

    /**
     * Get stored credentials (for status display)
     */
    getCredentials(): ClaudeCodeCredentials | null {
        return this.store.load()
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
