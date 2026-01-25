/**
 * Encryption Utilities
 *
 * Adapted from Midday's encryption module for secure file access
 * - AES-256-GCM encryption for sensitive data
 * - JWT file keys for temporary file access
 * - Hash utilities for deduplication
 */

import crypto from 'node:crypto'
import * as jose from 'jose'
import log from 'electron-log'

// ============================================================================
// Configuration
// ============================================================================

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

// Generate a random key on first use if not set (for Electron apps)
let encryptionKey: Buffer | null = null

function getOrCreateKey(): Buffer {
    if (encryptionKey) return encryptionKey

    // Try to get from environment
    const envKey = process.env.ENCRYPTION_KEY
    if (envKey && Buffer.from(envKey, 'hex').length === 32) {
        encryptionKey = Buffer.from(envKey, 'hex')
        return encryptionKey
    }

    // Generate a random key for this session
    // In production, this should be persisted securely
    encryptionKey = crypto.randomBytes(32)
    log.info('[Encryption] Generated new encryption key for session')
    return encryptionKey
}

let fileKeySecret: string | null = null

function getOrCreateFileKeySecret(): string {
    if (fileKeySecret) return fileKeySecret

    // Try environment variable first
    const envSecret = process.env.FILE_KEY_SECRET
    if (envSecret) {
        fileKeySecret = envSecret
        return fileKeySecret
    }

    // Generate random secret for session
    fileKeySecret = crypto.randomBytes(32).toString('hex')
    log.info('[Encryption] Generated new file key secret for session')
    return fileKeySecret
}

// ============================================================================
// URL-Safe Base64 Utilities
// ============================================================================

/**
 * Converts standard base64 to URL-safe base64
 */
export function toUrlSafeBase64(base64: string): string {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Converts URL-safe base64 back to standard base64
 */
export function fromUrlSafeBase64(urlSafeBase64: string): string {
    let base64 = urlSafeBase64.replace(/-/g, '+').replace(/_/g, '/')
    const padding = base64.length % 4
    if (padding) {
        base64 += '='.repeat(4 - padding)
    }
    return base64
}

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Encrypts a plaintext string using AES-256-GCM
 */
export function encrypt(text: string): string {
    const key = getOrCreateKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    // Concatenate IV, auth tag, and encrypted data
    const encryptedPayload = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encrypted, 'hex')
    ]).toString('base64')

    return encryptedPayload
}

/**
 * Decrypts an AES-256-GCM encrypted string
 */
export function decrypt(encryptedPayload: string): string {
    const key = getOrCreateKey()

    if (!encryptedPayload || typeof encryptedPayload !== 'string') {
        throw new Error('Invalid encrypted payload: must be a non-empty string')
    }

    const dataBuffer = Buffer.from(encryptedPayload, 'base64')
    const minLength = IV_LENGTH + AUTH_TAG_LENGTH

    if (dataBuffer.length < minLength) {
        throw new Error(
            `Invalid encrypted payload: too short. Expected at least ${minLength} bytes, got ${dataBuffer.length}`
        )
    }

    // Extract IV, auth tag, and encrypted data
    const iv = dataBuffer.subarray(0, IV_LENGTH)
    const authTag = dataBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encryptedText = dataBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedText.toString('hex'), 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}

/**
 * Encrypts a payload for URL-safe usage (e.g., OAuth state)
 */
export function encryptForUrl<T>(payload: T): string {
    const encrypted = encrypt(JSON.stringify(payload))
    return toUrlSafeBase64(encrypted)
}

/**
 * Decrypts a URL-safe encrypted payload
 */
export function decryptFromUrl<T>(encryptedState: string): T | null {
    try {
        const standardBase64 = fromUrlSafeBase64(encryptedState)
        const decrypted = decrypt(standardBase64)
        return JSON.parse(decrypted) as T
    } catch {
        return null
    }
}

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Creates a SHA-256 hash of a string
 */
export function hash(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex')
}

/**
 * Creates a SHA-256 hash of a buffer (for file deduplication)
 */
export function hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Creates a quick hash for deduplication (first 8KB + size)
 * Faster than full file hash for large files
 */
export function quickHash(buffer: Buffer): string {
    const sampleSize = Math.min(8192, buffer.length)
    const sample = buffer.subarray(0, sampleSize)
    const sizeStr = buffer.length.toString()
    return crypto.createHash('sha256')
        .update(sample)
        .update(sizeStr)
        .digest('hex')
}

// ============================================================================
// File Key JWT Utilities
// ============================================================================

/**
 * Generates a JWT file key for temporary file access
 * @param userId - The user ID to generate the key for
 * @param expiresIn - Expiration time (default: 7 days)
 */
export async function generateFileKey(
    userId: string,
    expiresIn: string = '7d'
): Promise<string> {
    const secret = getOrCreateFileKeySecret()
    const secretKey = new TextEncoder().encode(secret)

    const token = await new jose.SignJWT({ userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(expiresIn)
        .setIssuedAt()
        .sign(secretKey)

    return token
}

/**
 * Verifies a file key JWT and extracts the userId
 */
export async function verifyFileKey(token: string): Promise<string | null> {
    try {
        const secret = getOrCreateFileKeySecret()
        const secretKey = new TextEncoder().encode(secret)
        const { payload } = await jose.jwtVerify(token, secretKey)
        return (payload.userId as string) || null
    } catch (error) {
        log.warn('[Encryption] File key verification failed:', error)
        return null
    }
}

/**
 * Generates a short-lived token for single file download
 */
export async function generateDownloadToken(
    userId: string,
    filePath: string,
    expiresIn: string = '5m'
): Promise<string> {
    const secret = getOrCreateFileKeySecret()
    const secretKey = new TextEncoder().encode(secret)

    const token = await new jose.SignJWT({ userId, filePath })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(expiresIn)
        .setIssuedAt()
        .sign(secretKey)

    return token
}

/**
 * Verifies a download token and returns the payload
 */
export async function verifyDownloadToken(
    token: string
): Promise<{ userId: string; filePath: string } | null> {
    try {
        const secret = getOrCreateFileKeySecret()
        const secretKey = new TextEncoder().encode(secret)
        const { payload } = await jose.jwtVerify(token, secretKey)

        if (payload.userId && payload.filePath) {
            return {
                userId: payload.userId as string,
                filePath: payload.filePath as string
            }
        }
        return null
    } catch {
        return null
    }
}
