import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

interface CerebrasKeyPayload {
    apiKey?: string
}

const STORE_FILE = 'cerebras-key.encrypted'
const CACHE_TTL_MS = 5000

let cachedData: { data: CerebrasKeyPayload; timestamp: number } | null = null

export class CerebrasApiKeyStore {
    private storePath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')

        if (!existsSync(secureDir)) {
            mkdirSync(secureDir, { recursive: true })
        }

        this.storePath = join(secureDir, STORE_FILE)
    }

    private loadFromDisk(): CerebrasKeyPayload {
        try {
            if (existsSync(this.storePath)) {
                const encryptedData = readFileSync(this.storePath)
                if (safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(encryptedData)
                    const parsed = JSON.parse(decrypted)
                    log.info('[CerebrasApiKeyStore] Loaded encrypted key from disk')
                    return parsed
                }
            }
        } catch (error) {
            log.error('[CerebrasApiKeyStore] Failed to load from disk:', error)
        }
        return {}
    }

    private saveToDisk(data: CerebrasKeyPayload): void {
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(JSON.stringify(data))
                writeFileSync(this.storePath, encrypted)
                log.info('[CerebrasApiKeyStore] Saved encrypted key to disk')
            }
        } catch (error) {
            log.error('[CerebrasApiKeyStore] Failed to save to disk:', error)
        }
    }

    private getCached(): CerebrasKeyPayload | null {
        if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
            return cachedData.data
        }
        cachedData = null
        return null
    }

    private setCache(data: CerebrasKeyPayload): void {
        cachedData = { data, timestamp: Date.now() }
    }

    setKey(key: string | null): void {
        const current = this.getCached() || this.loadFromDisk()
        if (key) {
            current.apiKey = key
            log.info('[CerebrasApiKeyStore] API key updated (length:', key.length, ')')
        } else {
            delete current.apiKey
            log.info('[CerebrasApiKeyStore] API key cleared')
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

let storeInstance: CerebrasApiKeyStore | null = null

export function getCerebrasKeyStore(): CerebrasApiKeyStore {
    if (!storeInstance) {
        storeInstance = new CerebrasApiKeyStore()
    }
    return storeInstance
}
