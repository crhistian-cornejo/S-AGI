import { safeStorage, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import log from 'electron-log'

const STORE_FILE = 'supabase-auth.encrypted'

/**
 * Custom storage adapter for Supabase Auth
 * Implements SupportedStorage interface
 * Persists session to encrypted file using Electron's safeStorage
 * 
 * This ensures the user stays logged in between app restarts
 */
export class SupabaseAuthStore {
    private storePath: string
    private cache: Record<string, string> = {}

    constructor() {
        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')
        
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
                    log.info('[SupabaseAuthStore] Loaded encrypted session')
                } else {
                    log.warn('[SupabaseAuthStore] Encryption not available, session not loaded')
                }
            }
        } catch (error) {
            log.error('[SupabaseAuthStore] Failed to load:', error)
            this.cache = {}
        }
    }

    private save(): void {
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const data = JSON.stringify(this.cache)
                const encrypted = safeStorage.encryptString(data)
                writeFileSync(this.storePath, encrypted)
                log.debug('[SupabaseAuthStore] Saved encrypted session')
            } else {
                log.warn('[SupabaseAuthStore] Cannot save - encryption not available')
            }
        } catch (error) {
            log.error('[SupabaseAuthStore] Failed to save:', error)
        }
    }

    // SupportedStorage interface methods required by Supabase
    getItem(key: string): string | null {
        return this.cache[key] || null
    }

    setItem(key: string, value: string): void {
        this.cache[key] = value
        this.save()
    }

    removeItem(key: string): void {
        delete this.cache[key]
        this.save()
    }

    /**
     * Clear all stored auth data completely
     * Called on logout to ensure no session data remains
     */
    clear(): void {
        this.cache = {}
        try {
            if (existsSync(this.storePath)) {
                unlinkSync(this.storePath)
                log.info('[SupabaseAuthStore] Cleared session file')
            }
        } catch (error) {
            log.error('[SupabaseAuthStore] Failed to clear:', error)
        }
    }

    /**
     * Check if there's a stored session
     */
    hasSession(): boolean {
        return Object.keys(this.cache).length > 0
    }
}

// Singleton instance
let storeInstance: SupabaseAuthStore | null = null

export function getSupabaseAuthStore(): SupabaseAuthStore {
    if (!storeInstance) {
        storeInstance = new SupabaseAuthStore()
    }
    return storeInstance
}
