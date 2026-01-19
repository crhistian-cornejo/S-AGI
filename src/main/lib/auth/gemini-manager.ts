import { shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { createServer } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { randomBytes, createHash } from 'crypto'
import { getGeminiAuthStore } from './gemini-store'
import type { GeminiCredentials } from './gemini-store'
import { sendToRenderer } from '../window-manager'
import log from 'electron-log'

/**
 * Gemini OAuth Configuration using Gemini CLI Identity
 * Compatible with Google One AI Premium / Gemini Advanced subscription
 * Based on: https://github.com/jenslys/opencode-gemini-auth
 */
const GEMINI_CONFIG = {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json',
    
    // Gemini CLI Official Client ID (from environment variables)
    clientId: import.meta.env.MAIN_VITE_GEMINI_CLIENT_ID || '',
    clientSecret: import.meta.env.MAIN_VITE_GEMINI_CLIENT_SECRET || '',
    
    redirectUri: 'http://localhost:8085/oauth2callback',
    callbackPort: 8085,
    
    scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' '),
    
    // Cloud Code Assist Production Endpoint
    inferenceEndpoint: 'https://cloudcode-pa.googleapis.com/v1internal/responses',
    
    // Refresh 1 minute before expiration for safety
    accessTokenExpiryBufferMs: 60 * 1000,
    refreshIntervalMs: 50 * 60 * 1000
}

interface PKCEPair {
    verifier: string
    challenge: string
}

function generatePKCE(): PKCEPair {
    const verifier = randomBytes(32).toString('base64url').slice(0, 43)
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    return { verifier, challenge }
}

function generateState(): string {
    return randomBytes(16).toString('base64url')
}

export class GeminiAuthManager {
    private store = getGeminiAuthStore()
    private refreshTimer?: NodeJS.Timeout
    private pendingAuth?: {
        verifier: string
        state: string
        server: ReturnType<typeof createServer>
    }

    constructor() {
        if (this.store.isConnected()) {
            this.scheduleRefresh()
        }
    }

    async startAuthFlow(mainWindow: BrowserWindow | null): Promise<void> {
        if (this.pendingAuth) {
            this.pendingAuth.server.close()
        }

        const pkce = generatePKCE()
        const state = generateState()

        const server = createServer((req, res) => {
            this.handleCallback(req, res, mainWindow)
        })

        server.listen(GEMINI_CONFIG.callbackPort)

        this.pendingAuth = { verifier: pkce.verifier, state, server }

        const authUrl = new URL(GEMINI_CONFIG.authUrl)
        authUrl.searchParams.set('client_id', GEMINI_CONFIG.clientId)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('redirect_uri', GEMINI_CONFIG.redirectUri)
        authUrl.searchParams.set('scope', GEMINI_CONFIG.scopes)
        authUrl.searchParams.set('code_challenge', pkce.challenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('access_type', 'offline')
        authUrl.searchParams.set('prompt', 'consent')

        log.info('[GeminiAuth] Opening authorization URL')
        shell.openExternal(authUrl.toString())
    }

    private async handleCallback(
        req: IncomingMessage,
        res: ServerResponse,
        _mainWindow: BrowserWindow | null
    ): Promise<void> {
        const url = new URL(req.url || '', `http://localhost:${GEMINI_CONFIG.callbackPort}`)

        if (url.pathname !== '/oauth2callback') {
            res.writeHead(404)
            res.end('Not Found')
            return
        }

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        if (state !== this.pendingAuth?.state) {
            log.error('[GeminiAuth] State mismatch')
            res.writeHead(400)
            res.end('Authentication failed: State mismatch')
            return
        }

        if (!code) {
            res.writeHead(400)
            res.end('Authentication failed: No code received')
            return
        }

        try {
            await this.exchangeCode(code)
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<h1>Successfully connected!</h1><p>You can close this window now.</p>')
            
            // Notify UI
            sendToRenderer('gemini:connected', { success: true, isConnected: true })
        } catch (error) {
            log.error('[GeminiAuth] Exchange failed:', error)
            res.writeHead(500)
            res.end('Authentication failed: Token exchange error')
        } finally {
            this.pendingAuth?.server.close()
            this.pendingAuth = undefined
        }
    }

    private async exchangeCode(code: string): Promise<void> {
        if (!this.pendingAuth) throw new Error('No pending auth')

        const response = await fetch(GEMINI_CONFIG.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GEMINI_CONFIG.clientId,
                client_secret: GEMINI_CONFIG.clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: GEMINI_CONFIG.redirectUri,
                code_verifier: this.pendingAuth.verifier
            })
        })

        if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.statusText}`)
        }

        const data = await response.json()
        
        // Get user info for email
        const userRes = await fetch(GEMINI_CONFIG.userInfoUrl, {
            headers: { Authorization: `Bearer ${data.access_token}` }
        })
        const userInfo = userRes.ok ? await userRes.json() : {}

        this.store.save({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000,
            connectedAt: new Date().toISOString(),
            email: userInfo.email
        })

        this.scheduleRefresh()
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer)
        this.refreshTimer = setTimeout(() => this.refresh(), GEMINI_CONFIG.refreshIntervalMs)
    }

    async refresh(): Promise<boolean> {
        const creds = this.store.load()
        if (!creds?.refreshToken) return false

        try {
            const res = await fetch(GEMINI_CONFIG.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: GEMINI_CONFIG.clientId,
                    client_secret: GEMINI_CONFIG.clientSecret,
                    refresh_token: creds.refreshToken,
                    grant_type: 'refresh_token'
                })
            })

            if (!res.ok) throw new Error('Refresh failed')
            const data = await res.json()

            this.store.save({
                ...creds,
                accessToken: data.access_token,
                expiresAt: Date.now() + data.expires_in * 1000,
                ...(data.refresh_token && { refreshToken: data.refresh_token })
            })

            this.scheduleRefresh()
            return true
        } catch (error) {
            log.error('[GeminiAuth] Refresh failed:', error)
            return false
        }
    }

    isConnected(): boolean {
        return this.store.isConnected()
    }

    /**
     * Check if the access token is expired or will expire soon
     */
    isTokenExpired(): boolean {
        const creds = this.store.load()
        if (!creds?.accessToken || typeof creds.expiresAt !== 'number') {
            return true
        }
        return creds.expiresAt <= Date.now() + GEMINI_CONFIG.accessTokenExpiryBufferMs
    }

    /**
     * Get a valid access token, refreshing if necessary
     */
    async getValidAccessToken(): Promise<string | null> {
        if (this.isTokenExpired()) {
            log.info('[GeminiAuth] Token expired or expiring soon, refreshing...')
            const refreshed = await this.refresh()
            if (!refreshed) {
                return null
            }
        }
        return this.store.load()?.accessToken || null
    }

    getCredentials(): GeminiCredentials | null {
        return this.store.load()
    }

    /**
     * Get the production inference endpoint
     */
    getInferenceEndpoint(): string {
        return GEMINI_CONFIG.inferenceEndpoint
    }

    disconnect(): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer)
        this.store.clear()
    }
}

let instance: GeminiAuthManager | null = null
export function getGeminiAuthManager(): GeminiAuthManager {
    if (!instance) instance = new GeminiAuthManager()
    return instance
}
