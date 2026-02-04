import { safeStorage, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import log from 'electron-log'
import { randomUUID } from 'crypto'

const STORE_FILE = 'supabase-auth.encrypted'
const MULTI_ACCOUNT_STORE_FILE = 'accounts.encrypted'
const MULTI_ACCOUNT_STORE_FALLBACK_FILE = 'accounts.json'

/**
 * Stored account information for multi-account support
 */
export interface StoredAccount {
    id: string                  // Unique session ID (UUID)
    userId: string              // Supabase user ID or 'local-user'
    email: string
    displayName: string
    avatarUrl?: string
    profile?: {
        fullName?: string | null
        username?: string | null
        pronouns?: string | null
        bio?: string | null
        website?: string | null
        location?: string | null
        timezone?: string | null
        avatarProviderUrl?: string | null
        avatarPath?: string | null
    }
    isLocal: boolean            // true for local/offline account
    provider?: string           // 'google', 'github', 'email', 'local'
    connectedAt: number         // Unix timestamp
}

/**
 * Multi-account store data structure
 */
export interface AuthStoreData {
    accounts: StoredAccount[]
    activeAccountId: string | null
}

/**
 * Custom storage adapter for Supabase Auth with multi-account support
 *
 * Features:
 * - Stores multiple accounts (local + cloud)
 * - Tracks active account
 * - Uses OS-level encryption via Electron's safeStorage
 * - Implements SupportedStorage interface for Supabase compatibility
 * - LAZY INITIALIZATION: Waits for app.isReady() before accessing safeStorage
 */
export class SupabaseAuthStore {
    private storePath: string = ''
    private multiAccountStorePath: string = ''
    private multiAccountStoreFallbackPath: string = ''
    private cache: Record<string, string> = {}      // Supabase session cache (for active account)
    private accountsData: AuthStoreData = {         // Multi-account data
        accounts: [],
        activeAccountId: null
    }
    private initialized: boolean = false
    private initPromise: Promise<void> | null = null

    constructor() {
        // Defer initialization until app is ready
        this.initPromise = this.ensureInitialized()
    }

    /**
     * Ensure the store is initialized (app ready + paths set + data loaded)
     * Safe to call multiple times - will only initialize once
     */
    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return

        // Wait for app to be ready before accessing userData path and safeStorage
        if (!app.isReady()) {
            log.debug('[SupabaseAuthStore] Waiting for app.whenReady()...')
            await app.whenReady()
        }

        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')

        if (!existsSync(secureDir)) {
            mkdirSync(secureDir, { recursive: true })
        }

        this.storePath = join(secureDir, STORE_FILE)
        this.multiAccountStorePath = join(secureDir, MULTI_ACCOUNT_STORE_FILE)
        this.multiAccountStoreFallbackPath = join(secureDir, MULTI_ACCOUNT_STORE_FALLBACK_FILE)
        
        log.info('[SupabaseAuthStore] Initializing after app ready')
        log.debug(`[SupabaseAuthStore] safeStorage.isEncryptionAvailable() = ${safeStorage.isEncryptionAvailable()}`)
        
        this.load()
        this.loadAccounts()
        this.initialized = true
        
        log.info(`[SupabaseAuthStore] Initialized with ${this.accountsData.accounts.length} accounts`)
    }

    /**
     * Synchronously ensure initialized (for methods that can't be async)
     * Returns true if ready, false if still initializing
     */
    private ensureInitializedSync(): boolean {
        if (this.initialized) return true
        
        if (!app.isReady()) {
            log.warn('[SupabaseAuthStore] App not ready yet, data may not be loaded')
            return false
        }

        // App is ready but we haven't initialized yet - do it now synchronously
        const userDataPath = app.getPath('userData')
        const secureDir = join(userDataPath, 'secure')

        if (!existsSync(secureDir)) {
            mkdirSync(secureDir, { recursive: true })
        }

        this.storePath = join(secureDir, STORE_FILE)
        this.multiAccountStorePath = join(secureDir, MULTI_ACCOUNT_STORE_FILE)
        this.multiAccountStoreFallbackPath = join(secureDir, MULTI_ACCOUNT_STORE_FALLBACK_FILE)
        
        log.info('[SupabaseAuthStore] Sync initialization after app ready')
        log.debug(`[SupabaseAuthStore] safeStorage.isEncryptionAvailable() = ${safeStorage.isEncryptionAvailable()}`)
        
        this.load()
        this.loadAccounts()
        this.initialized = true
        
        log.info(`[SupabaseAuthStore] Initialized with ${this.accountsData.accounts.length} accounts`)
        return true
    }

    // ============================================
    // Multi-Account Management Methods
    // ============================================

    /**
     * Wait for initialization to complete (for async contexts)
     */
    async waitForInit(): Promise<void> {
        if (this.initPromise) {
            await this.initPromise
        }
    }

    /**
     * Get all stored accounts
     */
    getAccounts(): StoredAccount[] {
        this.ensureInitializedSync()
        return [...this.accountsData.accounts]
    }

    /**
     * Get the currently active account
     */
    getActiveAccount(): StoredAccount | null {
        this.ensureInitializedSync()
        if (!this.accountsData.activeAccountId) return null
        return this.accountsData.accounts.find(
            a => a.id === this.accountsData.activeAccountId
        ) || null
    }

    /**
     * Get active account ID
     */
    getActiveAccountId(): string | null {
        this.ensureInitializedSync()
        return this.accountsData.activeAccountId
    }

    /**
     * Add a new account to the store
     * If account with same userId exists, updates it instead
     * Returns the account ID
     */
    addAccount(account: Omit<StoredAccount, 'id' | 'connectedAt'>): string {
        this.ensureInitializedSync()
        // Check if account with same userId already exists
        const existingIndex = this.accountsData.accounts.findIndex(
            a => a.userId === account.userId
        )

        let accountId: string

        if (existingIndex >= 0) {
            // Update existing account
            accountId = this.accountsData.accounts[existingIndex].id
            this.accountsData.accounts[existingIndex] = {
                ...this.accountsData.accounts[existingIndex],
                ...account,
                id: accountId,
                connectedAt: this.accountsData.accounts[existingIndex].connectedAt
            }
            log.info(`[SupabaseAuthStore] Updated existing account: ${account.email}`)
        } else {
            // Add new account
            accountId = randomUUID()
            const newAccount: StoredAccount = {
                ...account,
                id: accountId,
                connectedAt: Date.now()
            }
            this.accountsData.accounts.push(newAccount)
            log.info(`[SupabaseAuthStore] Added new account: ${account.email}`)
        }

        // If no active account, set this as active
        if (!this.accountsData.activeAccountId) {
            this.accountsData.activeAccountId = accountId
        }

        this.saveAccounts()
        return accountId
    }

    /**
     * Remove an account from the store
     * If removing the active account, clears active and Supabase session
     */
    removeAccount(accountId: string): boolean {
        this.ensureInitializedSync()
        const index = this.accountsData.accounts.findIndex(a => a.id === accountId)
        if (index === -1) {
            log.warn(`[SupabaseAuthStore] Account not found: ${accountId}`)
            return false
        }

        const removedAccount = this.accountsData.accounts[index]
        this.accountsData.accounts.splice(index, 1)

        // If we removed the active account, clear it
        if (this.accountsData.activeAccountId === accountId) {
            this.accountsData.activeAccountId = null
            // Clear Supabase session cache
            this.cache = {}
            this.save()
        }

        this.saveAccounts()
        log.info(`[SupabaseAuthStore] Removed account: ${removedAccount.email}`)
        return true
    }

    /**
     * Set the active account
     * Note: This doesn't automatically load the Supabase session.
     * The auth router should call setSession after switching.
     */
    setActiveAccount(accountId: string): boolean {
        this.ensureInitializedSync()
        const account = this.accountsData.accounts.find(a => a.id === accountId)
        if (!account) {
            log.warn(`[SupabaseAuthStore] Cannot set active - account not found: ${accountId}`)
            return false
        }

        this.accountsData.activeAccountId = accountId
        this.saveAccounts()
        log.info(`[SupabaseAuthStore] Set active account: ${account.email}`)
        return true
    }

    /**
     * Find account by userId
     */
    findAccountByUserId(userId: string): StoredAccount | null {
        this.ensureInitializedSync()
        return this.accountsData.accounts.find(a => a.userId === userId) || null
    }

    /**
     * Check if an account exists
     */
    hasAccount(userId: string): boolean {
        this.ensureInitializedSync()
        return this.accountsData.accounts.some(a => a.userId === userId)
    }

    /**
     * Remove all accounts and clear everything
     */
    clearAllAccounts(): void {
        this.accountsData = {
            accounts: [],
            activeAccountId: null
        }
        this.cache = {}
        this.save()
        this.saveAccounts()
        log.info('[SupabaseAuthStore] Cleared all accounts')
    }

    // ============================================
    // Multi-Account Persistence
    // ============================================

    private loadAccounts(): void {
        try {
            const encryptedExists = existsSync(this.multiAccountStorePath)
            const fallbackExists = existsSync(this.multiAccountStoreFallbackPath)
            const encryptionAvailable = safeStorage.isEncryptionAvailable()

            if (encryptedExists && encryptionAvailable) {
                const encryptedData = readFileSync(this.multiAccountStorePath)
                const decrypted = safeStorage.decryptString(encryptedData)
                this.accountsData = JSON.parse(decrypted)
                log.info(`[SupabaseAuthStore] Loaded ${this.accountsData.accounts.length} accounts`)
                return
            }

            if (fallbackExists) {
                const raw = readFileSync(this.multiAccountStoreFallbackPath, 'utf-8')
                this.accountsData = JSON.parse(raw)
                log.warn('[SupabaseAuthStore] Loaded accounts from fallback storage')

                if (encryptionAvailable) {
                    this.saveAccounts()
                }
                return
            }

            if (encryptedExists && !encryptionAvailable) {
                log.warn('[SupabaseAuthStore] Encryption not available for accounts; using fallback if present')
            }
        } catch (error) {
            log.error('[SupabaseAuthStore] Failed to load accounts:', error)
            this.accountsData = { accounts: [], activeAccountId: null }
        }
    }

    private saveAccounts(): void {
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const data = JSON.stringify(this.accountsData)
                const encrypted = safeStorage.encryptString(data)
                writeFileSync(this.multiAccountStorePath, encrypted)
                log.debug('[SupabaseAuthStore] Saved accounts data')
                if (existsSync(this.multiAccountStoreFallbackPath)) {
                    unlinkSync(this.multiAccountStoreFallbackPath)
                }
            } else {
                const data = JSON.stringify(this.accountsData)
                writeFileSync(this.multiAccountStoreFallbackPath, data)
                log.warn('[SupabaseAuthStore] Saved accounts in fallback storage (unencrypted)')
            }
        } catch (error) {
            log.error('[SupabaseAuthStore] Failed to save accounts:', error)
        }
    }

    // ============================================
    // SupportedStorage interface methods (for Supabase)
    // These work with the ACTIVE account's session
    // ============================================

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

    getItem(key: string): string | null {
        this.ensureInitializedSync()
        return this.cache[key] || null
    }

    setItem(key: string, value: string): void {
        this.ensureInitializedSync()
        this.cache[key] = value
        this.save()
    }

    removeItem(key: string): void {
        this.ensureInitializedSync()
        delete this.cache[key]
        this.save()
    }

    /**
     * Clear the active Supabase session (not accounts list)
     */
    clearSession(): void {
        this.ensureInitializedSync()
        this.cache = {}
        try {
            if (this.storePath && existsSync(this.storePath)) {
                unlinkSync(this.storePath)
                log.info('[SupabaseAuthStore] Cleared session file')
            }
        } catch (error) {
            log.error('[SupabaseAuthStore] Failed to clear session:', error)
        }
    }

    /**
     * Clear all stored auth data completely (sessions + accounts)
     * Called on full logout to ensure no data remains
     */
    clear(): void {
        this.ensureInitializedSync()
        this.clearSession()
        this.clearAllAccounts()
        try {
            if (this.multiAccountStorePath && existsSync(this.multiAccountStorePath)) {
                unlinkSync(this.multiAccountStorePath)
            }
        } catch (error) {
            log.error('[SupabaseAuthStore] Failed to clear accounts file:', error)
        }
    }

    /**
     * Check if there's a stored session for current active account
     */
    hasSession(): boolean {
        this.ensureInitializedSync()
        return Object.keys(this.cache).length > 0
    }

    /**
     * Check if there are any accounts stored
     */
    hasAnyAccounts(): boolean {
        this.ensureInitializedSync()
        return this.accountsData.accounts.length > 0
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
