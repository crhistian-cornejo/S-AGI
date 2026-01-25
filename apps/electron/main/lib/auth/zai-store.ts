import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

interface ZaiKeyPayload {
    apiKey?: string
}

const STORE_FILE = 'zai-key.encrypted'
const CACHE_TTL_MS = 5000

let cachedData: { data: ZaiKeyPayload; timestamp: number } | null = null

export class ZaiApiKeyStore {
    private storePath: string

    constructor() {
        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')

        if (!existsSync(secureDir)) {
            mkdirSync(secureDir, { recursive: true })
        }

        this.storePath = join(secureDir, STORE_FILE)
    }

    private loadFromDisk(): ZaiKeyPayload {
        try {
            if (existsSync(this.storePath)) {
                const encryptedData = readFileSync(this.storePath)
                if (safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(encryptedData)
                    const parsed = JSON.parse(decrypted)
                    log.info('[ZaiApiKeyStore] Loaded encrypted key from disk')
                    return parsed
                }
            }
        } catch (error) {
            log.error('[ZaiApiKeyStore] Failed to load from disk:', error)
        }
        return {}
    }

    private saveToDisk(data: ZaiKeyPayload): void {
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(JSON.stringify(data))
                writeFileSync(this.storePath, encrypted)
                log.info('[ZaiApiKeyStore] Saved encrypted key to disk')
            }
        } catch (error) {
            log.error('[ZaiApiKeyStore] Failed to save to disk:', error)
        }
    }

    private getCached(): ZaiKeyPayload | null {
        if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
            return cachedData.data
        }
        cachedData = null
        return null
    }

    private setCache(data: ZaiKeyPayload): void {
        cachedData = { data, timestamp: Date.now() }
    }

    setKey(key: string | null): void {
        const current = this.getCached() || this.loadFromDisk()
        if (key) {
            current.apiKey = key
            log.info('[ZaiApiKeyStore] API key updated (length:', key.length, ')')
        } else {
            delete current.apiKey
            log.info('[ZaiApiKeyStore] API key cleared')
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

let storeInstance: ZaiApiKeyStore | null = null

export function getZaiKeyStore(): ZaiApiKeyStore {
    if (!storeInstance) {
        storeInstance = new ZaiApiKeyStore()
    }
    return storeInstance
}
