import { shell, BrowserWindow } from 'electron'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { randomBytes, createHash } from 'crypto'
import { getChatGPTAuthStore, ChatGPTCredentials } from './chatgpt-store'
import { sendToRenderer } from '../window-manager'
import log from 'electron-log'

/**
 * ChatGPT Plus/Pro OAuth Configuration
 * Uses the Codex CLI flow from OpenCode for ChatGPT subscription access
 */
const CHATGPT_CONFIG = {
    // OpenAI OAuth endpoints (Codex/ChatGPT infrastructure)
    authUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    
    // Client ID from OpenCode's Codex plugin
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    
    // Redirect to local server for token capture
    redirectUri: 'http://localhost:1455/auth/callback',
    callbackPort: 1455,
    
    // OAuth scopes for ChatGPT access
    scopes: 'openid profile email offline_access',
    
    // Inference endpoint for ChatGPT Plus/Pro
    inferenceEndpoint: 'https://chatgpt.com/backend-api/codex/responses',
    
    // Token refresh interval (50 minutes, tokens last ~1 hour)
    refreshIntervalMs: 50 * 60 * 1000
}

// Available ChatGPT Codex models
export const CHATGPT_CODEX_MODELS = {
    'gpt-5.1-codex-max': {
        id: 'gpt-5.1-codex-max',
        name: 'GPT-5.1 Codex Max',
        description: 'Maximum capability Codex model'
    },
    'gpt-5.1-codex-mini': {
        id: 'gpt-5.1-codex-mini',
        name: 'GPT-5.1 Codex Mini',
        description: 'Efficient Codex model'
    },
    'gpt-5.2': {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        description: 'Latest GPT model'
    },
    'gpt-5.2-codex': {
        id: 'gpt-5.2-codex',
        name: 'GPT-5.2 Codex',
        description: 'GPT-5.2 with Codex capabilities'
    }
}

/**
 * PKCE (Proof Key for Code Exchange) utilities
 * Required for public OAuth clients (no client secret)
 */
interface PKCEPair {
    verifier: string
    challenge: string
}

function generatePKCE(): PKCEPair {
    // Generate a random verifier (43-128 characters)
    const verifier = randomBytes(32)
        .toString('base64url')
        .slice(0, 43)
    
    // Create SHA-256 challenge
    const challenge = createHash('sha256')
        .update(verifier)
        .digest('base64url')
    
    return { verifier, challenge }
}

function generateState(): string {
    return randomBytes(16).toString('base64url')
}

/**
 * Manages OAuth flow for ChatGPT Plus/Pro subscription
 * Implements the Codex CLI flow with PKCE
 */
export class ChatGPTAuthManager {
    private store = getChatGPTAuthStore()
    private refreshTimer?: NodeJS.Timeout
    private pendingAuth?: {
        verifier: string
        state: string
        server: ReturnType<typeof createServer>
    }

    constructor() {
        // Schedule refresh if already authenticated
        if (this.store.isConnected()) {
            this.scheduleRefresh()
        } else if (this.store.hasRefreshToken()) {
            // Token expired but we can refresh
            this.refresh()
        }
    }

    /**
     * Start OAuth flow - opens browser for authorization
     * Uses PKCE for secure public client authentication
     */
    async startAuthFlow(mainWindow: BrowserWindow | null): Promise<void> {
        // Clean up any existing pending auth
        if (this.pendingAuth?.server) {
            this.pendingAuth.server.close()
        }

        // Generate PKCE pair and state
        const pkce = generatePKCE()
        const state = generateState()

        log.info('[ChatGPTAuth] Starting OAuth flow with PKCE')

        // Create local server to capture callback
        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
            this.handleCallback(req, res, mainWindow)
        })

        // Store pending auth data
        this.pendingAuth = {
            verifier: pkce.verifier,
            state,
            server
        }

        // Start listening
        await new Promise<void>((resolve, reject) => {
            server.listen(CHATGPT_CONFIG.callbackPort, '127.0.0.1', () => {
                log.info(`[ChatGPTAuth] Callback server listening on port ${CHATGPT_CONFIG.callbackPort}`)
                resolve()
            })
            server.on('error', (err) => {
                log.error('[ChatGPTAuth] Failed to start callback server:', err)
                reject(err)
            })
        })

        // Build authorization URL
        const authUrl = new URL(CHATGPT_CONFIG.authUrl)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('client_id', CHATGPT_CONFIG.clientId)
        authUrl.searchParams.set('redirect_uri', CHATGPT_CONFIG.redirectUri)
        authUrl.searchParams.set('scope', CHATGPT_CONFIG.scopes)
        authUrl.searchParams.set('code_challenge', pkce.challenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
        authUrl.searchParams.set('state', state)
        // Special flags for Codex flow
        authUrl.searchParams.set('id_token_add_organizations', 'true')
        authUrl.searchParams.set('codex_cli_simplified_flow', 'true')
        authUrl.searchParams.set('originator', 's-agi')

        log.info('[ChatGPTAuth] Opening authorization URL in browser')
        shell.openExternal(authUrl.toString())
    }

    /**
     * Handle OAuth callback from local server
     */
    private async handleCallback(
        req: IncomingMessage, 
        res: ServerResponse,
        _mainWindow: BrowserWindow | null
    ): Promise<void> {
        const url = new URL(req.url || '', `http://localhost:${CHATGPT_CONFIG.callbackPort}`)
        
        // Only handle callback path
        if (url.pathname !== '/auth/callback') {
            res.writeHead(404)
            res.end('Not found')
            return
        }

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')

        // Send response to browser
        if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(`
                <html>
                <head><title>Authentication Failed</title></head>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                    <h1>Authentication Failed</h1>
                    <p>${errorDescription || error}</p>
                    <p>You can close this window.</p>
                </body>
                </html>
            `)
            log.error('[ChatGPTAuth] OAuth error:', error, errorDescription)
            this.cleanup()
            return
        }

        // Validate state
        if (state !== this.pendingAuth?.state) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end(`
                <html>
                <head><title>Invalid State</title></head>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                    <h1>Invalid State</h1>
                    <p>The authentication state doesn't match. Please try again.</p>
                </body>
                </html>
            `)
            log.error('[ChatGPTAuth] State mismatch')
            this.cleanup()
            return
        }

        if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end(`
                <html>
                <head><title>Missing Code</title></head>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                    <h1>Missing Authorization Code</h1>
                    <p>Please try again.</p>
                </body>
                </html>
            `)
            log.error('[ChatGPTAuth] No authorization code received')
            this.cleanup()
            return
        }

        // Exchange code for tokens
        try {
            await this.exchangeCode(code)
            
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Authentication Successful</title>
                </head>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                    <h1>&#10003; Connected to ChatGPT Plus</h1>
                    <p>You can close this window and return to S-AGI.</p>
                    <script>setTimeout(() => window.close(), 2000)</script>
                </body>
                </html>
            `)
            
            log.info('[ChatGPTAuth] Successfully authenticated')
            
            // Notify renderer to refresh status
            sendToRenderer('chatgpt:connected', {
                isConnected: true,
                accountId: this.getAccountId()
            })
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Authentication Error</title>
                </head>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                    <h1>Authentication Error</h1>
                    <p>${err instanceof Error ? err.message : 'Unknown error'}</p>
                </body>
                </html>
            `)
            log.error('[ChatGPTAuth] Token exchange failed:', err)
        } finally {
            this.cleanup()
        }
    }

    /**
     * Exchange authorization code for tokens
     */
    async exchangeCode(code: string): Promise<ChatGPTCredentials> {
        if (!this.pendingAuth?.verifier) {
            throw new Error('No pending authentication - verifier missing')
        }

        log.info('[ChatGPTAuth] Exchanging code for tokens...')

        const response = await fetch(CHATGPT_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: CHATGPT_CONFIG.clientId,
                redirect_uri: CHATGPT_CONFIG.redirectUri,
                code_verifier: this.pendingAuth.verifier
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(errorData.error_description || errorData.error || `Token exchange failed: ${response.status}`)
        }

        const data = await response.json()

        // Extract account ID from id_token if present
        let accountId: string | undefined
        let email: string | undefined
        
        if (data.id_token) {
            try {
                const payload = JSON.parse(
                    Buffer.from(data.id_token.split('.')[1], 'base64url').toString()
                )
                accountId = payload.chatgpt_account_id || 
                           payload['https://api.openai.com/auth']?.chatgpt_account_id
                email = payload.email
            } catch (e) {
                log.warn('[ChatGPTAuth] Failed to parse id_token:', e)
            }
        }

        const credentials: ChatGPTCredentials = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            idToken: data.id_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            connectedAt: new Date().toISOString(),
            accountId,
            email
        }

        this.store.save(credentials)
        this.scheduleRefresh()

        log.info('[ChatGPTAuth] Successfully connected to ChatGPT Plus')
        if (accountId) {
            log.info('[ChatGPTAuth] Account ID:', accountId)
        }

        return credentials
    }

    /**
     * Refresh the access token using refresh_token
     */
    async refresh(): Promise<boolean> {
        const refreshToken = this.store.getRefreshToken()
        if (!refreshToken) {
            log.warn('[ChatGPTAuth] No refresh token available')
            return false
        }

        log.info('[ChatGPTAuth] Refreshing access token...')

        try {
            const response = await fetch(CHATGPT_CONFIG.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: CHATGPT_CONFIG.clientId
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
                log.error('[ChatGPTAuth] Token refresh failed:', errorData)
                
                // If refresh token is invalid, clear credentials
                if (response.status === 400 || response.status === 401) {
                    this.store.clear()
                }
                return false
            }

            const data = await response.json()

            // Update stored credentials
            this.store.updateAccessToken(
                data.access_token,
                data.expires_in || 3600,
                data.id_token
            )

            // If we got a new refresh token, update it
            if (data.refresh_token) {
                const credentials = this.store.getCredentials()
                if (credentials) {
                    this.store.save({
                        ...credentials,
                        refreshToken: data.refresh_token
                    })
                }
            }

            this.scheduleRefresh()
            log.info('[ChatGPTAuth] Access token refreshed successfully')
            return true

        } catch (error) {
            log.error('[ChatGPTAuth] Token refresh error:', error)
            return false
        }
    }

    /**
     * Schedule automatic token refresh
     */
    private scheduleRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
        }

        this.refreshTimer = setTimeout(() => {
            this.refresh()
        }, CHATGPT_CONFIG.refreshIntervalMs)

        log.info(`[ChatGPTAuth] Token refresh scheduled in ${CHATGPT_CONFIG.refreshIntervalMs / 60000} minutes`)
    }

    /**
     * Cleanup pending auth state
     */
    private cleanup(): void {
        if (this.pendingAuth?.server) {
            this.pendingAuth.server.close()
        }
        this.pendingAuth = undefined
    }

    /**
     * Check if connected to ChatGPT Plus
     */
    isConnected(): boolean {
        return this.store.isConnected()
    }

    /**
     * Get the current access token
     */
    getAccessToken(): string | null {
        return this.store.getAccessToken()
    }

    /**
     * Get the ChatGPT account ID (for multi-workspace support)
     */
    getAccountId(): string | null {
        return this.store.getAccountId()
    }

    /**
     * Get full credentials
     */
    getCredentials(): ChatGPTCredentials | null {
        return this.store.getCredentials()
    }

    /**
     * Get the inference endpoint for ChatGPT Plus
     */
    getInferenceEndpoint(): string {
        return CHATGPT_CONFIG.inferenceEndpoint
    }

    /**
     * Disconnect from ChatGPT Plus
     */
    disconnect(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
        }
        this.cleanup()
        this.store.clear()
        log.info('[ChatGPTAuth] Disconnected from ChatGPT Plus')
    }
}

// Singleton instance
let authManagerInstance: ChatGPTAuthManager | null = null

export function getChatGPTAuthManager(): ChatGPTAuthManager {
    if (!authManagerInstance) {
        authManagerInstance = new ChatGPTAuthManager()
    }
    return authManagerInstance
}
