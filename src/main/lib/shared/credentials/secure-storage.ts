/**
 * Secure Storage Backend
 *
 * Stores credentials in an encrypted file at ~/.s-agi/credentials.enc
 * Uses AES-256-GCM for authenticated encryption.
 *
 * Encryption key is derived from OS-native hardware UUID using PBKDF2:
 * - macOS: IOPlatformUUID (tied to logic board, never changes)
 * - Windows: MachineGuid from registry (set at OS install)
 * - Linux: /var/lib/dbus/machine-id (set at OS install)
 *
 * Based on craft-agents-oss patterns for maximum security.
 *
 * File format:
 *   [Header - 64 bytes]
 *   |- Magic: "SAGI001\0" (8 bytes)
 *   |- Flags: uint32 LE (4 bytes) - reserved for future use
 *   |- Salt: 32 bytes (PBKDF2 salt)
 *   |- Reserved: 20 bytes
 *   [Encrypted Payload]
 *   |- IV: 12 bytes (random per write)
 *   |- Auth Tag: 16 bytes (GCM authentication)
 *   |- Ciphertext: variable (encrypted JSON)
 */

import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    pbkdf2Sync,
    createHash,
} from 'crypto'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { hostname, userInfo, homedir } from 'os'
import { join } from 'path'
import log from 'electron-log'

// File location
const CREDENTIALS_DIR = join(homedir(), '.s-agi')
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.enc')

// File format constants
const MAGIC_BYTES = Buffer.from('SAGI001\0')
const HEADER_SIZE = 64
const MAGIC_SIZE = 8
const FLAGS_SIZE = 4
const SALT_SIZE = 32
const IV_SIZE = 12
const AUTH_TAG_SIZE = 16
const KEY_SIZE = 32

// PBKDF2 iterations (balance security vs startup time)
const PBKDF2_ITERATIONS = 100000

/**
 * Credential types that can be stored
 */
export type CredentialType =
    | 'anthropic_api_key'     // Global: Anthropic API key
    | 'claude_oauth'          // Global: Claude OAuth token
    | 'openai_api_key'        // Global: OpenAI API key
    | 'chatgpt_oauth'         // Global: ChatGPT Plus OAuth token
    | 'zai_api_key'           // Global: Z.AI API key
    | 'tavily_api_key'        // Global: Tavily search API key
    | 'gemini_oauth'          // Global: Gemini OAuth token
    | 'workspace_oauth'       // Workspace-scoped: MCP server OAuth
    | 'source_oauth'          // Source-scoped: Individual source tokens
    | 'source_bearer'         // Source-scoped: Bearer tokens
    | 'source_apikey'         // Source-scoped: API keys
    | 'source_basic'          // Source-scoped: Basic auth

export interface CredentialId {
    type: CredentialType
    workspaceId?: string
    name?: string
}

export interface StoredCredential {
    value: string
    metadata?: {
        refreshToken?: string
        expiresAt?: number
        scopes?: string[]
        connectedAt?: string
        userId?: string
        email?: string
        source?: 'oauth' | 'cli_import' | 'manual'
    }
}

/**
 * Get stable machine identifier using OS-native hardware UUID.
 * This is far more stable than hostname which can change with network/DHCP.
 * Falls back to username + homedir if hardware UUID unavailable.
 */
function getStableMachineId(): string {
    try {
        if (process.platform === 'darwin') {
            // macOS: IOPlatformUUID - tied to logic board, never changes
            const output = execSync(
                'ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID',
                { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
            )
            const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
            if (match?.[1]) {
                log.debug('[SecureStorage] Using macOS IOPlatformUUID for key derivation')
                return match[1]
            }
        } else if (process.platform === 'win32') {
            // Windows: MachineGuid from registry - set at OS install
            const output = execSync(
                'reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
                { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
            )
            const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/)
            if (match?.[1]) {
                log.debug('[SecureStorage] Using Windows MachineGuid for key derivation')
                return match[1]
            }
        } else {
            // Linux: dbus machine-id - set at OS install
            const machineIdPath = '/var/lib/dbus/machine-id'
            const altPath = '/etc/machine-id'
            if (existsSync(machineIdPath)) {
                log.debug('[SecureStorage] Using Linux machine-id for key derivation')
                return readFileSync(machineIdPath, 'utf-8').trim()
            } else if (existsSync(altPath)) {
                log.debug('[SecureStorage] Using Linux /etc/machine-id for key derivation')
                return readFileSync(altPath, 'utf-8').trim()
            }
        }
    } catch (error) {
        log.warn('[SecureStorage] Could not get hardware UUID, using fallback:', error)
    }

    // Fallback: username + homedir (stable enough for most cases)
    return `${userInfo().username}:${homedir()}`
}

/**
 * Convert credential ID to account string for storage
 */
export function credentialIdToAccount(id: CredentialId): string {
    const parts = [id.type]
    if (id.workspaceId) parts.push(id.workspaceId)
    if (id.name) parts.push(id.name)
    return parts.join('::')
}

/**
 * Parse account string back to credential ID
 */
export function accountToCredentialId(account: string): CredentialId | null {
    const parts = account.split('::')
    if (parts.length === 0) return null

    const type = parts[0] as CredentialType
    const workspaceId = parts.length > 1 ? parts[1] : undefined
    const name = parts.length > 2 ? parts[2] : undefined

    return { type, workspaceId, name }
}

/** Internal credential store structure */
interface CredentialStore {
    version: 1
    credentials: Record<string, StoredCredential>
    metadata: {
        createdAt: number
        updatedAt: number
    }
}

/**
 * Secure credential storage using AES-256-GCM encryption
 * with hardware-tied key derivation
 */
export class SecureStorageBackend {
    readonly name = 'secure-storage'
    readonly priority = 100

    private cachedStore: CredentialStore | null = null
    private encryptionKey: Buffer | null = null
    private salt: Buffer | null = null

    /**
     * Check if this backend is available
     */
    async isAvailable(): Promise<boolean> {
        return true
    }

    /**
     * Get a credential by ID
     */
    async get(id: CredentialId): Promise<StoredCredential | null> {
        const store = await this.loadStore()
        if (!store) return null

        const key = credentialIdToAccount(id)
        return store.credentials[key] || null
    }

    /**
     * Set a credential
     */
    async set(id: CredentialId, credential: StoredCredential): Promise<void> {
        let store = await this.loadStore()

        if (!store) {
            store = {
                version: 1,
                credentials: {},
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            }
        }

        const key = credentialIdToAccount(id)
        store.credentials[key] = credential
        store.metadata.updatedAt = Date.now()

        await this.saveStore(store)
    }

    /**
     * Delete a credential
     */
    async delete(id: CredentialId): Promise<boolean> {
        const store = await this.loadStore()
        if (!store) return false

        const key = credentialIdToAccount(id)
        if (!(key in store.credentials)) return false

        delete store.credentials[key]
        store.metadata.updatedAt = Date.now()

        await this.saveStore(store)
        return true
    }

    /**
     * List all credentials, optionally filtered
     */
    async list(filter?: Partial<CredentialId>): Promise<CredentialId[]> {
        const store = await this.loadStore()
        if (!store) return []

        const ids = Object.keys(store.credentials)
            .map(accountToCredentialId)
            .filter((id): id is CredentialId => id !== null)

        if (!filter) return ids

        return ids.filter((id) => {
            if (filter.type && id.type !== filter.type) return false
            if (filter.workspaceId && id.workspaceId !== filter.workspaceId) return false
            if (filter.name && id.name !== filter.name) return false
            return true
        })
    }

    /**
     * Check if a credential exists
     */
    async has(id: CredentialId): Promise<boolean> {
        const credential = await this.get(id)
        return credential !== null
    }

    // ============================================================
    // Private Methods
    // ============================================================

    private async loadStore(): Promise<CredentialStore | null> {
        if (this.cachedStore) return this.cachedStore

        if (!existsSync(CREDENTIALS_FILE)) return null

        let fileData: Buffer
        try {
            fileData = readFileSync(CREDENTIALS_FILE)
        } catch (error) {
            log.error('[SecureStorage] Failed to read credentials file:', error)
            return null
        }

        // Validate minimum size
        if (fileData.length < HEADER_SIZE + IV_SIZE + AUTH_TAG_SIZE) {
            this.handleCorruptedFile()
            return null
        }

        // Validate magic bytes
        if (!fileData.subarray(0, MAGIC_SIZE).equals(MAGIC_BYTES)) {
            log.warn('[SecureStorage] Invalid magic bytes, file may be corrupted')
            this.handleCorruptedFile()
            return null
        }

        // Parse header
        const salt = fileData.subarray(MAGIC_SIZE + FLAGS_SIZE, MAGIC_SIZE + FLAGS_SIZE + SALT_SIZE)
        this.salt = salt

        // Extract encrypted data
        const encryptedData = fileData.subarray(HEADER_SIZE)

        // Try new stable key first (v2 - hardware UUID based)
        const newKey = this.getEncryptionKey(salt)
        let store = this.tryDecrypt(encryptedData, newKey)

        if (store) {
            this.cachedStore = store
            return store
        }

        // Try legacy key for migration (v1 - included hostname)
        const legacyKey = this.getLegacyEncryptionKey(salt)
        store = this.tryDecrypt(encryptedData, legacyKey)

        if (store) {
            // Migration: re-save with new stable key
            this.cachedStore = store
            await this.saveStore(store)
            log.info('[SecureStorage] Migrated credentials to new key derivation')
            return store
        }

        // Both keys failed - file is corrupted
        this.handleCorruptedFile()
        return null
    }

    private tryDecrypt(encryptedData: Buffer, key: Buffer): CredentialStore | null {
        try {
            const iv = encryptedData.subarray(0, IV_SIZE)
            const authTag = encryptedData.subarray(IV_SIZE, IV_SIZE + AUTH_TAG_SIZE)
            const ciphertext = encryptedData.subarray(IV_SIZE + AUTH_TAG_SIZE)

            const decipher = createDecipheriv('aes-256-gcm', key, iv)
            decipher.setAuthTag(authTag)
            const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
            return JSON.parse(decrypted.toString('utf8'))
        } catch {
            return null
        }
    }

    private async saveStore(store: CredentialStore): Promise<void> {
        // Ensure directory exists with restrictive permissions
        if (!existsSync(CREDENTIALS_DIR)) {
            mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 })
        }

        // Use existing salt or generate new one
        const salt = this.salt || randomBytes(SALT_SIZE)
        this.salt = salt

        // Get encryption key
        const key = this.getEncryptionKey(salt)

        // Serialize payload
        const plaintext = Buffer.from(JSON.stringify(store), 'utf8')

        // Generate new IV for each write (critical for GCM security)
        const iv = randomBytes(IV_SIZE)

        // Encrypt
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
        const authTag = cipher.getAuthTag()

        // Build header
        const header = Buffer.alloc(HEADER_SIZE)
        MAGIC_BYTES.copy(header, 0)
        header.writeUInt32LE(0, MAGIC_SIZE) // Flags (reserved)
        salt.copy(header, MAGIC_SIZE + FLAGS_SIZE)

        // Combine all parts
        const fileData = Buffer.concat([header, iv, authTag, ciphertext])

        // Write with restrictive permissions (owner read/write only)
        writeFileSync(CREDENTIALS_FILE, fileData, { mode: 0o600 })
        this.cachedStore = store
        log.debug('[SecureStorage] Credentials saved successfully')
    }

    private getEncryptionKey(salt: Buffer): Buffer {
        if (this.encryptionKey) return this.encryptionKey

        // Stable machine ID using hardware UUID
        const stableMachineId = createHash('sha256')
            .update(getStableMachineId())
            .update('s-agi-v2')
            .digest()

        // Derive key using PBKDF2
        this.encryptionKey = pbkdf2Sync(stableMachineId, salt, PBKDF2_ITERATIONS, KEY_SIZE, 'sha256')

        return this.encryptionKey
    }

    /**
     * Legacy key derivation for migration from v1 (included hostname).
     */
    private getLegacyEncryptionKey(salt: Buffer): Buffer {
        const legacyMachineId = createHash('sha256')
            .update(hostname())
            .update(userInfo().username)
            .update(homedir())
            .update('s-agi-v1')
            .digest()

        return pbkdf2Sync(legacyMachineId, salt, PBKDF2_ITERATIONS, KEY_SIZE, 'sha256')
    }

    private handleCorruptedFile(): void {
        try {
            if (existsSync(CREDENTIALS_FILE)) {
                unlinkSync(CREDENTIALS_FILE)
                log.warn('[SecureStorage] Deleted corrupted credentials file')
            }
        } catch (error) {
            log.error('[SecureStorage] Failed to delete corrupted file:', error)
        }
        this.cachedStore = null
        this.encryptionKey = null
        this.salt = null
    }

    /** Clear cached data (for testing or forced refresh) */
    clearCache(): void {
        this.cachedStore = null
        this.encryptionKey = null
        this.salt = null
    }
}

// Singleton instance
let storageInstance: SecureStorageBackend | null = null

export function getSecureStorage(): SecureStorageBackend {
    if (!storageInstance) {
        storageInstance = new SecureStorageBackend()
    }
    return storageInstance
}
