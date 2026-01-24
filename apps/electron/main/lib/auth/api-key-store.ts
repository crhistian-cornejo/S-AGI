import { safeStorage } from 'electron'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

interface ApiKeyStore {
    openai?: string
    anthropic?: string
    tavily?: string
    zai?: string
}

const STORE_FILE = 'api-keys.encrypted'

const CACHE_TTL_MS = 5000
let cachedData: { data: ApiKeyStore; timestamp: number } | null = null

export class SecureApiKeyStore {
    private storePath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')

        if (!existsSync(secureDir)) {
            mkdirSync(secureDir, { recursive: true })
        }

        this.storePath = join(secureDir, STORE_FILE)
    }

    private loadFromDisk(): ApiKeyStore {
        try {
            if (existsSync(this.storePath)) {
                const encryptedData = readFileSync(this.storePath)
                if (safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(encryptedData)
                    const parsed = JSON.parse(decrypted)
                    log.info('[SecureApiKeyStore] Loaded encrypted keys from disk')
                    return parsed
                }
            }
        } catch (error) {
            log.error('[SecureApiKeyStore] Failed to load from disk:', error)
        }
        return {}
    }

    private saveToDisk(data: ApiKeyStore): void {
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(JSON.stringify(data))
                writeFileSync(this.storePath, encrypted)
                log.info('[SecureApiKeyStore] Saved encrypted keys to disk')
            }
        } catch (error) {
            log.error('[SecureApiKeyStore] Failed to save to disk:', error)
        }
    }

    private getCached(): ApiKeyStore | null {
        if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
            return cachedData.data
        }
        cachedData = null
        return null
    }

    private setCache(data: ApiKeyStore): void {
        cachedData = { data, timestamp: Date.now() }
    }

    setOpenAIKey(key: string | null): void {
        const current = this.getCached() || this.loadFromDisk()
        if (key) {
            current.openai = key
            log.info('[SecureApiKeyStore] OpenAI key updated (length:', key.length, ')')
        } else {
            delete current.openai
            log.info('[SecureApiKeyStore] OpenAI key cleared')
        }
        this.setCache(current)
        this.saveToDisk(current)
    }

    getOpenAIKey(): string | null {
        const cached = this.getCached()
        if (cached) return cached.openai || null

        const data = this.loadFromDisk()
        this.setCache(data)
        return data.openai || null
    }

    setAnthropicKey(key: string | null): void {
        const current = this.getCached() || this.loadFromDisk()
        if (key) {
            current.anthropic = key
            log.info('[SecureApiKeyStore] Anthropic key updated (length:', key.length, ')')
        } else {
            delete current.anthropic
            log.info('[SecureApiKeyStore] Anthropic key cleared')
        }
        this.setCache(current)
        this.saveToDisk(current)
    }

    getAnthropicKey(): string | null {
        const cached = this.getCached()
        if (cached) return cached.anthropic || null

        const data = this.loadFromDisk()
        this.setCache(data)
        return data.anthropic || null
    }

    hasOpenAIKey(): boolean {
        const cached = this.getCached()
        const data = cached || this.loadFromDisk()
        if (!cached) this.setCache(data)
        return !!data.openai
    }

    hasAnthropicKey(): boolean {
        const cached = this.getCached()
        const data = cached || this.loadFromDisk()
        if (!cached) this.setCache(data)
        return !!data.anthropic
    }

    setTavilyKey(key: string | null): void {
        const current = this.getCached() || this.loadFromDisk()
        if (key) {
            current.tavily = key
            log.info('[SecureApiKeyStore] Tavily key updated (length:', key.length, ')')
        } else {
            delete current.tavily
            log.info('[SecureApiKeyStore] Tavily key cleared')
        }
        this.setCache(current)
        this.saveToDisk(current)
    }

    getTavilyKey(): string | null {
        const cached = this.getCached()
        if (cached) return cached.tavily || null

        const data = this.loadFromDisk()
        this.setCache(data)
        return data.tavily || null
    }

    hasTavilyKey(): boolean {
        const cached = this.getCached()
        const data = cached || this.loadFromDisk()
        if (!cached) this.setCache(data)
        return !!data.tavily
    }

    setZaiKey(key: string | null): void {
        const current = this.getCached() || this.loadFromDisk()
        if (key) {
            current.zai = key
            log.info('[SecureApiKeyStore] Z.AI key updated (length:', key.length, ')')
        } else {
            delete current.zai
            log.info('[SecureApiKeyStore] Z.AI key cleared')
        }
        this.setCache(current)
        this.saveToDisk(current)
    }

    getZaiKey(): string | null {
        const cached = this.getCached()
        if (cached) return cached.zai || null

        const data = this.loadFromDisk()
        this.setCache(data)
        return data.zai || null
    }

    hasZaiKey(): boolean {
        const cached = this.getCached()
        const data = cached || this.loadFromDisk()
        if (!cached) this.setCache(data)
        return !!data.zai
    }

    clear(): void {
        cachedData = null
        this.saveToDisk({})
    }
}

let storeInstance: SecureApiKeyStore | null = null

export function getSecureApiKeyStore(): SecureApiKeyStore {
    if (!storeInstance) {
        storeInstance = new SecureApiKeyStore()
    }
    return storeInstance
}
