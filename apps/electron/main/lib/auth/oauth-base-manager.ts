import { shell, BrowserWindow } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { randomBytes, createHash } from 'crypto'
import log from 'electron-log'

/**
 * PKCE (Proof Key for Code Exchange) pair for secure OAuth
 */
export interface PKCEPair {
    verifier: string
    challenge: string
}

/**
 * OAuth configuration for a provider
 */
export interface OAuthConfig {
    /** Provider name for logging */
    name: string
    /** Authorization URL */
    authUrl: string
    /** Token exchange URL */
    tokenUrl: string
    /** OAuth client ID */
    clientId: string
    /** OAuth client secret (optional, for confidential clients) */
    clientSecret?: string
    /** Redirect URI for callback */
    redirectUri: string
    /** Local server port for callback */
    callbackPort: number
    /** Callback path (e.g., '/auth/callback' or '/oauth2callback') */
    callbackPath: string
    /** OAuth scopes */
    scopes: string
    /** Token refresh interval in ms (default: 50 minutes) */
    refreshIntervalMs?: number
    /** Additional auth URL parameters */
    extraAuthParams?: Record<string, string>
}

/**
 * Base credentials interface - extend for provider-specific fields
 */
export interface BaseOAuthCredentials {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
    connectedAt: string
}

/**
 * Pending auth state during OAuth flow
 */
interface PendingAuthState {
    verifier: string
    state: string
    server: Server
}

/**
 * Generate PKCE code verifier and challenge
 */
export function generatePKCE(): PKCEPair {
    const verifier = randomBytes(32).toString('base64url').slice(0, 43)
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    return { verifier, challenge }
}

/**
 * Generate a random state string for OAuth
 */
export function generateState(): string {
    return randomBytes(16).toString('base64url')
}

/**
 * Abstract base class for OAuth authentication managers
 * Provides common functionality for PKCE-based OAuth flows with local callback servers
 *
 * @template TCredentials - The credential type for this provider
 * @template TStore - The store type for persisting credentials
 */
export abstract class OAuthBaseManager<
    TCredentials extends BaseOAuthCredentials,
    TStore extends {
        isConnected(): boolean
        getRefreshToken?(): string | null
        hasRefreshToken?(): boolean
        clear(): void
    }
> {
    protected abstract readonly config: OAuthConfig
    protected abstract readonly store: TStore

    protected refreshTimer?: NodeJS.Timeout
    protected pendingAuth?: PendingAuthState
    protected refreshLock = false

    /**
     * Initialize the manager - call in subclass constructor after setting config/store
     */
    protected initialize(): void {
        if (this.store.isConnected()) {
            this.scheduleRefresh()
        } else if (this.store.hasRefreshToken?.()) {
            // Token expired but we can refresh
            this.refresh()
        }
    }

    /**
     * Start the OAuth flow - opens browser for authorization
     * Override in subclasses that need custom auth flow (e.g., no local server)
     */
    async startAuthFlow(mainWindow: BrowserWindow | null): Promise<void> {
        // Clean up any existing pending auth
        if (this.pendingAuth?.server) {
            this.pendingAuth.server.close()
        }

        const pkce = generatePKCE()
        const state = generateState()

        log.info(`[${this.config.name}] Starting OAuth flow with PKCE`)

        // Create local server to capture callback
        const server = createServer((req: IncomingMessage, res: ServerResponse) => {
            this.handleCallback(req, res, mainWindow)
        })

        this.pendingAuth = {
            verifier: pkce.verifier,
            state,
            server
        }

        // Start listening
        await new Promise<void>((resolve, reject) => {
            server.listen(this.config.callbackPort, '127.0.0.1', () => {
                log.info(`[${this.config.name}] Callback server listening on port ${this.config.callbackPort}`)
                resolve()
            })
            server.on('error', (err) => {
                log.error(`[${this.config.name}] Failed to start callback server:`, err)
                reject(err)
            })
        })

        // Build authorization URL
        const authUrl = this.buildAuthUrl(pkce, state)

        log.info(`[${this.config.name}] Opening authorization URL in browser`)
        shell.openExternal(authUrl)
    }

    /**
     * Build the authorization URL with PKCE and state
     * Override for custom URL building
     */
    protected buildAuthUrl(pkce: PKCEPair, state: string): string {
        const authUrl = new URL(this.config.authUrl)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('client_id', this.config.clientId)
        authUrl.searchParams.set('redirect_uri', this.config.redirectUri)
        authUrl.searchParams.set('scope', this.config.scopes)
        authUrl.searchParams.set('code_challenge', pkce.challenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
        authUrl.searchParams.set('state', state)

        // Add any extra provider-specific params
        if (this.config.extraAuthParams) {
            for (const [key, value] of Object.entries(this.config.extraAuthParams)) {
                authUrl.searchParams.set(key, value)
            }
        }

        return authUrl.toString()
    }

    /**
     * Handle OAuth callback from local server
     */
    protected async handleCallback(
        req: IncomingMessage,
        res: ServerResponse,
        mainWindow: BrowserWindow | null
    ): Promise<void> {
        const url = new URL(req.url || '', `http://localhost:${this.config.callbackPort}`)

        // Only handle callback path
        if (url.pathname !== this.config.callbackPath) {
            res.writeHead(404)
            res.end('Not found')
            return
        }

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')

        // Handle error response
        if (error) {
            this.sendErrorResponse(res, errorDescription || error)
            log.error(`[${this.config.name}] OAuth error:`, error, errorDescription)
            this.cleanup()
            return
        }

        // Validate state
        if (state !== this.pendingAuth?.state) {
            this.sendErrorResponse(res, 'Invalid state. Please try again.')
            log.error(`[${this.config.name}] State mismatch`)
            this.cleanup()
            return
        }

        if (!code) {
            this.sendErrorResponse(res, 'Missing authorization code. Please try again.')
            log.error(`[${this.config.name}] No authorization code received`)
            this.cleanup()
            return
        }

        // Exchange code for tokens
        try {
            await this.exchangeCode(code)
            this.sendSuccessResponse(res)
            log.info(`[${this.config.name}] Successfully authenticated`)
            this.onAuthSuccess(mainWindow)
        } catch (err) {
            this.sendErrorResponse(res, err instanceof Error ? err.message : 'Unknown error')
            log.error(`[${this.config.name}] Token exchange failed:`, err)
        } finally {
            this.cleanup()
        }
    }

    /**
     * Exchange authorization code for tokens
     * Must be implemented by subclasses to handle provider-specific token response
     */
    protected abstract exchangeCode(code: string): Promise<TCredentials>

    /**
     * Save credentials to the store
     * Must be implemented by subclasses
     */
    protected abstract saveCredentials(credentials: TCredentials): void

    /**
     * Callback after successful authentication
     * Override to notify renderer or perform other actions
     */
    protected onAuthSuccess(_mainWindow: BrowserWindow | null): void {
        // Default: do nothing. Override in subclasses to notify UI
    }

    /**
     * Build token exchange request body
     * Override for custom body format (e.g., JSON vs form-urlencoded)
     */
    protected buildTokenExchangeBody(code: string): URLSearchParams | string {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            code_verifier: this.pendingAuth!.verifier
        })

        if (this.config.clientSecret) {
            params.set('client_secret', this.config.clientSecret)
        }

        return params
    }

    /**
     * Get headers for token exchange request
     * Override for custom headers
     */
    protected getTokenExchangeHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }

    /**
     * Perform the token exchange HTTP request
     * Can be overridden for custom request handling
     */
    protected async performTokenExchange(code: string): Promise<Response> {
        const body = this.buildTokenExchangeBody(code)
        const isJson = typeof body === 'string'

        return fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: isJson
                ? { ...this.getTokenExchangeHeaders(), 'Content-Type': 'application/json' }
                : this.getTokenExchangeHeaders(),
            body: isJson ? body : body.toString()
        })
    }

    /**
     * Refresh the access token using refresh_token
     * Override for provider-specific refresh logic
     */
    async refresh(): Promise<boolean> {
        if (this.refreshLock) {
            log.debug(`[${this.config.name}] Refresh already in progress`)
            return false
        }

        const refreshToken = this.store.getRefreshToken?.()
        if (!refreshToken) {
            log.warn(`[${this.config.name}] No refresh token available`)
            return false
        }

        this.refreshLock = true
        log.info(`[${this.config.name}] Refreshing access token...`)

        try {
            const response = await this.performTokenRefresh(refreshToken)

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
                log.error(`[${this.config.name}] Token refresh failed:`, errorData)

                // If refresh token is invalid, clear credentials
                if (response.status === 400 || response.status === 401) {
                    this.store.clear()
                }
                return false
            }

            await this.handleRefreshResponse(response)
            this.scheduleRefresh()
            log.info(`[${this.config.name}] Access token refreshed successfully`)
            return true
        } catch (error) {
            log.error(`[${this.config.name}] Token refresh error:`, error)
            return false
        } finally {
            this.refreshLock = false
        }
    }

    /**
     * Perform the token refresh HTTP request
     * Override for custom refresh request
     */
    protected async performTokenRefresh(refreshToken: string): Promise<Response> {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.config.clientId
        })

        if (this.config.clientSecret) {
            params.set('client_secret', this.config.clientSecret)
        }

        return fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: this.getTokenExchangeHeaders(),
            body: params
        })
    }

    /**
     * Handle refresh response - update stored credentials
     * Must be implemented by subclasses
     */
    protected abstract handleRefreshResponse(response: Response): Promise<void>

    /**
     * Schedule automatic token refresh
     */
    protected scheduleRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
        }

        const intervalMs = this.config.refreshIntervalMs ?? 50 * 60 * 1000

        this.refreshTimer = setTimeout(() => {
            this.refresh()
        }, intervalMs)

        log.info(`[${this.config.name}] Token refresh scheduled in ${intervalMs / 60000} minutes`)
    }

    /**
     * Cancel scheduled refresh
     */
    protected cancelRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
            this.refreshTimer = undefined
        }
    }

    /**
     * Cleanup pending auth state
     */
    protected cleanup(): void {
        if (this.pendingAuth?.server) {
            this.pendingAuth.server.close()
        }
        this.pendingAuth = undefined
    }

    /**
     * Check if connected (has valid credentials)
     */
    isConnected(): boolean {
        return this.store.isConnected()
    }

    /**
     * Disconnect and clear credentials
     */
    disconnect(): void {
        this.cancelRefresh()
        this.cleanup()
        this.store.clear()
        log.info(`[${this.config.name}] Disconnected`)
    }

    /**
     * Send success HTML response to browser
     */
    protected sendSuccessResponse(res: ServerResponse): void {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`
            <html>
            <head>
                <meta charset="utf-8">
                <title>Authentication Successful</title>
            </head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>&#10003; Connected to ${this.config.name}</h1>
                <p>You can close this window and return to S-AGI.</p>
                <script>setTimeout(() => window.close(), 2000)</script>
            </body>
            </html>
        `)
    }

    /**
     * Send error HTML response to browser
     */
    protected sendErrorResponse(res: ServerResponse, message: string): void {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`
            <html>
            <head>
                <meta charset="utf-8">
                <title>Authentication Failed</title>
            </head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>Authentication Failed</h1>
                <p>${message}</p>
                <p>You can close this window.</p>
            </body>
            </html>
        `)
    }
}
