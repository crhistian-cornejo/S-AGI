import { safeStorage } from 'electron'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

interface ApiKeyStore {
    openai?: string
    anthropic?: string
}

const STORE_FILE = 'api-keys.encrypted'

/**
 * Secure API Key Store using Electron's safeStorage
 * Keys are encrypted at rest using OS-level encryption
 */
export class SecureApiKeyStore {
    private storePath: string
    private cache: ApiKeyStore = {}

    constructor() {
        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')

        // Create secure directory if it doesn't exist
        if (!existsSync(secureDir)) {
            mkdirSync(secureDir, { recursive: true })
        }

        this.storePath = join(secureDir, STORE_FILE)
        this.load()
    }

    private load(): void {
        try {
            if (existsSync(this.storePath)) {
                const encryptedData = readFileSync(this.storePath)
                if (safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(encryptedData)
                    this.cache = JSON.parse(decrypted)
                    log.info('[SecureApiKeyStore] Loaded encrypted keys')
                } else {
                    log.warn('[SecureApiKeyStore] Encryption not available, keys not loaded')
                }
            }
        } catch (error) {
            log.error('[SecureApiKeyStore] Failed to load:', error)
            this.cache = {}
        }
    }

    private save(): void {
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const data = JSON.stringify(this.cache)
                const encrypted = safeStorage.encryptString(data)
                writeFileSync(this.storePath, encrypted)
                log.info('[SecureApiKeyStore] Saved encrypted keys')
            } else {
                log.warn('[SecureApiKeyStore] Encryption not available, keys not saved')
            }
        } catch (error) {
            log.error('[SecureApiKeyStore] Failed to save:', error)
        }
    }

    setOpenAIKey(key: string | null): void {
        if (key) {
            this.cache.openai = key
        } else {
            delete this.cache.openai
        }
        this.save()
    }

    getOpenAIKey(): string | null {
        return this.cache.openai || null
    }

    setAnthropicKey(key: string | null): void {
        if (key) {
            this.cache.anthropic = key
        } else {
            delete this.cache.anthropic
        }
        this.save()
    }

    getAnthropicKey(): string | null {
        return this.cache.anthropic || null
    }

    hasOpenAIKey(): boolean {
        return !!this.cache.openai
    }

    hasAnthropicKey(): boolean {
        return !!this.cache.anthropic
    }

    clear(): void {
        this.cache = {}
        this.save()
    }
}

// Singleton instance
let storeInstance: SecureApiKeyStore | null = null

export function getSecureApiKeyStore(): SecureApiKeyStore {
    if (!storeInstance) {
        storeInstance = new SecureApiKeyStore()
    }
    return storeInstance
}
