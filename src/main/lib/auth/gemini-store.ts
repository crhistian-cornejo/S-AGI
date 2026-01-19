import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

export interface GeminiCredentials {
    accessToken: string
    refreshToken: string
    expiresAt: number // Unix timestamp in ms
    connectedAt: string
    email?: string
}

/**
 * Manages Gemini Advanced / Google One OAuth credentials
 */
export class GeminiAuthStore {
    private credentialsPath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        const dataDir = join(userDataPath, 'data')

        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true })
        }

        this.credentialsPath = join(dataDir, 'gemini-credentials.enc')
    }

    save(credentials: GeminiCredentials): void {
        try {
            const data = JSON.stringify(credentials)
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(data)
                writeFileSync(this.credentialsPath, encrypted)
            } else {
                writeFileSync(this.credentialsPath, data)
            }
            log.info('[GeminiAuth] Credentials saved')
        } catch (error) {
            log.error('[GeminiAuth] Failed to save credentials:', error)
        }
    }

    load(): GeminiCredentials | null {
        try {
            if (!existsSync(this.credentialsPath)) return null
            const data = readFileSync(this.credentialsPath)
            
            if (safeStorage.isEncryptionAvailable()) {
                const decrypted = safeStorage.decryptString(data)
                return JSON.parse(decrypted)
            }
            return JSON.parse(data.toString())
        } catch (error) {
            log.error('[GeminiAuth] Failed to load credentials:', error)
            return null
        }
    }

    isConnected(): boolean {
        const creds = this.load()
        return !!creds?.accessToken && creds.expiresAt > Date.now()
    }

    clear(): void {
        if (existsSync(this.credentialsPath)) {
            writeFileSync(this.credentialsPath, '')
            log.info('[GeminiAuth] Credentials cleared')
        }
    }
}

let instance: GeminiAuthStore | null = null
export function getGeminiAuthStore(): GeminiAuthStore {
    if (!instance) instance = new GeminiAuthStore()
    return instance
}
