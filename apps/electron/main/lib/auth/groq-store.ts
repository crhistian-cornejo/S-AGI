import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

interface GroqKeyPayload {
    apiKey?: string
}

const STORE_FILE = 'groq-key.encrypted'
const CACHE_TTL_MS = 5000

let cachedData: { data: GroqKeyPayload; timestamp: number } | null = null

export class GroqApiKeyStore {
    private storePath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')

        if (!existsSync(secureDir)) {
            mkdirSync(secureDir, { recursive: true })
        }

        this.storePath = join(secureDir, STORE_FILE)
    }

    private loadFromDisk(): GroqKeyPayload {
        try {
            if (existsSync(this.storePath)) {
                const encryptedData = readFileSync(this.storePath)
                if (safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(encryptedData)
                    const parsed = JSON.parse(decrypted)
                    log.info('[GroqApiKeyStore] Loaded encrypted key from disk')
                    return parsed
                }
            }
        } catch (error) {
            log.error('[GroqApiKeyStore] Failed to load from disk:', error)
        }
        return {}
    }

    private saveToDisk(data: GroqKeyPayload): void {
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(JSON.stringify(data))
                writeFileSync(this.storePath, encrypted)
                log.info('[GroqApiKeyStore] Saved encrypted key to disk')
            }
        } catch (error) {
            log.error('[GroqApiKeyStore] Failed to save to disk:', error)
        }
    }

    private getCached(): GroqKeyPayload | null {
        if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
            return cachedData.data
        }
        cachedData = null
        return null
    }

    private setCache(data: GroqKeyPayload): void {
        cachedData = { data, timestamp: Date.now() }
    }

    setKey(key: string | null): void {
        const current = this.getCached() || this.loadFromDisk()
        if (key) {
            current.apiKey = key
            log.info('[GroqApiKeyStore] API key updated (length:', key.length, ')')
        } else {
            delete current.apiKey
            log.info('[GroqApiKeyStore] API key cleared')
        }
        this.setCache(current)
        this.saveToDisk(current)
    }

    getKey(): string | null {
        const cached = this.getCached()
        if (cached) return cached.apiKey || null

        const data = this.loadFromDisk()
        this.setCache(data)
        return data.apiKey || null
    }

    hasKey(): boolean {
        const cached = this.getCached()
        const data = cached || this.loadFromDisk()
        if (!cached) this.setCache(data)
        return !!data.apiKey
    }

    clear(): void {
        cachedData = null
        this.saveToDisk({})
    }
}

let storeInstance: GroqApiKeyStore | null = null

export function getGroqKeyStore(): GroqApiKeyStore {
    if (!storeInstance) {
        storeInstance = new GroqApiKeyStore()
    }
    return storeInstance
}
