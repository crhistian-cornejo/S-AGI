import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

export interface ClaudeCodeCredentials {
    oauthToken: string
    connectedAt: string
    userId?: string
}

/**
 * Manages Claude Code OAuth credentials for Pro subscription
 * Uses Electron's safeStorage for secure credential storage
 */
export class ClaudeCodeAuthStore {
    private credentialsPath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        const dataDir = join(userDataPath, 'data')

        // Ensure data directory exists
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true })
        }

        this.credentialsPath = join(dataDir, 'claude-code-credentials.enc')
    }

    /**
     * Save Claude Code OAuth token securely
     */
    save(credentials: ClaudeCodeCredentials): void {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                log.warn('[ClaudeCodeAuth] Encryption not available, storing plaintext')
                writeFileSync(this.credentialsPath, JSON.stringify(credentials))
                return
            }

            const encrypted = safeStorage.encryptString(JSON.stringify(credentials))
            writeFileSync(this.credentialsPath, encrypted)
            log.info('[ClaudeCodeAuth] Credentials saved securely')
        } catch (error) {
            log.error('[ClaudeCodeAuth] Failed to save credentials:', error)
            throw error
        }
    }

    /**
     * Load Claude Code OAuth token
     */
    load(): ClaudeCodeCredentials | null {
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
            log.error('[ClaudeCodeAuth] Failed to load credentials:', error)
            return null
        }
    }

    /**
     * Check if Claude Code is connected
     */
    isConnected(): boolean {
        const credentials = this.load()
        return credentials !== null && !!credentials.oauthToken
    }

    /**
     * Get OAuth token if available
     */
    getToken(): string | null {
        const credentials = this.load()
        return credentials?.oauthToken || null
    }

    /**
     * Clear stored credentials (disconnect)
     */
    clear(): void {
        try {
            if (existsSync(this.credentialsPath)) {
                writeFileSync(this.credentialsPath, '')
                log.info('[ClaudeCodeAuth] Credentials cleared')
            }
        } catch (error) {
            log.error('[ClaudeCodeAuth] Failed to clear credentials:', error)
        }
    }
}

// Singleton instance
let authStoreInstance: ClaudeCodeAuthStore | null = null

export function getClaudeCodeAuthStore(): ClaudeCodeAuthStore {
    if (!authStoreInstance) {
        authStoreInstance = new ClaudeCodeAuthStore()
    }
    return authStoreInstance
}
