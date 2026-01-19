import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

export interface ChatGPTCredentials {
    accessToken: string
    refreshToken: string
    idToken?: string
    expiresAt: number // Unix timestamp in ms
    connectedAt: string
    accountId?: string // ChatGPT account ID extracted from JWT
    email?: string
}

/**
 * Manages ChatGPT Plus/Pro OAuth credentials
 * Uses Electron's safeStorage for secure credential storage
 * Implements the Codex CLI flow from OpenCode
 */
export class ChatGPTAuthStore {
    private credentialsPath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        const dataDir = join(userDataPath, 'data')

        // Ensure data directory exists
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true })
        }

        this.credentialsPath = join(dataDir, 'chatgpt-credentials.enc')
    }

    /**
     * Save ChatGPT OAuth tokens securely
     */
    save(credentials: ChatGPTCredentials): void {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                log.warn('[ChatGPTAuth] Encryption not available, storing plaintext')
                writeFileSync(this.credentialsPath, JSON.stringify(credentials))
                return
            }

            const encrypted = safeStorage.encryptString(JSON.stringify(credentials))
            writeFileSync(this.credentialsPath, encrypted)
            log.info('[ChatGPTAuth] Credentials saved securely')
        } catch (error) {
            log.error('[ChatGPTAuth] Failed to save credentials:', error)
            throw error
        }
    }

    /**
     * Load ChatGPT OAuth tokens
     */
    load(): ChatGPTCredentials | null {
        try {
            if (!existsSync(this.credentialsPath)) {
                return null
            }

            const data = readFileSync(this.credentialsPath)

            if (!safeStorage.isEncryptionAvailable()) {
                return JSON.parse(data.toString())
            }

            const decrypted = safeStorage.decryptString(data)
            return JSON.parse(decrypted)
        } catch (error) {
            log.error('[ChatGPTAuth] Failed to load credentials:', error)
            return null
        }
    }

    /**
     * Check if connected and token is still valid
     */
    isConnected(): boolean {
        const credentials = this.load()
        if (!credentials?.accessToken) {
            return false
        }
        
        // Check if token is expired (with 5 minute buffer)
        const now = Date.now()
        const expirationBuffer = 5 * 60 * 1000 // 5 minutes
        
        if (credentials.expiresAt && credentials.expiresAt - expirationBuffer < now) {
            log.info('[ChatGPTAuth] Token expired or expiring soon')
            return false
        }
        
        return true
    }

    /**
     * Check if we have a refresh token (can be refreshed)
     */
    hasRefreshToken(): boolean {
        const credentials = this.load()
        return !!credentials?.refreshToken
    }

    /**
     * Get access token if available
     */
    getAccessToken(): string | null {
        const credentials = this.load()
        return credentials?.accessToken || null
    }

    /**
     * Get refresh token if available
     */
    getRefreshToken(): string | null {
        const credentials = this.load()
        return credentials?.refreshToken || null
    }

    /**
     * Get account ID extracted from JWT
     */
    getAccountId(): string | null {
        const credentials = this.load()
        return credentials?.accountId || null
    }

    /**
     * Get all credentials
     */
    getCredentials(): ChatGPTCredentials | null {
        return this.load()
    }

    /**
     * Update access token (after refresh)
     */
    updateAccessToken(accessToken: string, expiresIn: number, idToken?: string): void {
        const credentials = this.load()
        if (!credentials) {
            log.error('[ChatGPTAuth] Cannot update token - no existing credentials')
            return
        }

        const expiresAt = Date.now() + expiresIn * 1000
        
        // If we have a new id_token, extract account ID
        let accountId = credentials.accountId
        if (idToken) {
            accountId = this.extractAccountIdFromJWT(idToken) || accountId
        }

        this.save({
            ...credentials,
            accessToken,
            expiresAt,
            ...(idToken && { idToken }),
            ...(accountId && { accountId })
        })

        log.info('[ChatGPTAuth] Access token updated, expires at:', new Date(expiresAt).toISOString())
    }

    /**
     * Extract ChatGPT account ID from JWT token
     * Required for multi-workspace support
     */
    extractAccountIdFromJWT(token: string): string | null {
        try {
            // JWT format: header.payload.signature
            const parts = token.split('.')
            if (parts.length !== 3) {
                return null
            }

            // Decode payload (base64url)
            const payload = parts[1]
            const decoded = Buffer.from(payload, 'base64url').toString('utf-8')
            const claims = JSON.parse(decoded)

            // Look for chatgpt_account_id in the claims
            // This is specific to the Codex flow
            return claims.chatgpt_account_id || 
                   claims['https://api.openai.com/auth']['chatgpt_account_id'] ||
                   null
        } catch (error) {
            log.warn('[ChatGPTAuth] Failed to extract account ID from JWT:', error)
            return null
        }
    }

    /**
     * Clear stored credentials (disconnect)
     */
    clear(): void {
        try {
            if (existsSync(this.credentialsPath)) {
                writeFileSync(this.credentialsPath, '')
                log.info('[ChatGPTAuth] Credentials cleared')
            }
        } catch (error) {
            log.error('[ChatGPTAuth] Failed to clear credentials:', error)
        }
    }
}

// Singleton instance
let authStoreInstance: ChatGPTAuthStore | null = null

export function getChatGPTAuthStore(): ChatGPTAuthStore {
    if (!authStoreInstance) {
        authStoreInstance = new ChatGPTAuthStore()
    }
    return authStoreInstance
}
