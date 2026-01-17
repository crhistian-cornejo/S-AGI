import { safeStorage } from 'electron'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

interface ApiKeyStore {
    openai?: string
    anthropic?: string
    tavily?: string
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
            log.info('[SecureApiKeyStore] OpenAI key updated (length:', key.length, ')')
        } else {
            delete this.cache.openai
            log.info('[SecureApiKeyStore] OpenAI key cleared')
        }
        this.save()
    }

    getOpenAIKey(): string | null {
        // Always reload from disk to ensure we have the latest
        this.load()
        return this.cache.openai || null
    }

    setAnthropicKey(key: string | null): void {
        if (key) {
            this.cache.anthropic = key
            log.info('[SecureApiKeyStore] Anthropic key updated (length:', key.length, ')')
        } else {
            delete this.cache.anthropic
            log.info('[SecureApiKeyStore] Anthropic key cleared')
        }
        this.save()
    }

    getAnthropicKey(): string | null {
        // Always reload from disk to ensure we have the latest
        this.load()
        return this.cache.anthropic || null
    }

    hasOpenAIKey(): boolean {
        return !!this.cache.openai
    }

    hasAnthropicKey(): boolean {
        return !!this.cache.anthropic
    }

    setTavilyKey(key: string | null): void {
        if (key) {
            this.cache.tavily = key
            log.info('[SecureApiKeyStore] Tavily key updated (length:', key.length, ')')
        } else {
            delete this.cache.tavily
            log.info('[SecureApiKeyStore] Tavily key cleared')
        }
        this.save()
    }

    getTavilyKey(): string | null {
        // Always reload from disk to ensure we have the latest
        this.load()
        return this.cache.tavily || null
    }

    hasTavilyKey(): boolean {
        return !!this.cache.tavily
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
