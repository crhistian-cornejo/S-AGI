/**
 * Supabase Storage Service
 *
 * Adapted from Midday's storage utilities for centralized file operations
 * - Upload/Download/Delete operations
 * - Signed URL generation
 * - Cache control
 */

import { supabase } from './client'
import log from 'electron-log'

// ============================================================================
// Configuration
// ============================================================================

// Default cache control (1 hour)
const DEFAULT_CACHE_CONTROL = '3600'

// Long cache for immutable content (1 year)
const IMMUTABLE_CACHE_CONTROL = '31536000'

// Signed URL expiration defaults
const SIGNED_URL_EXPIRATION = {
    short: 60, // 1 minute
    medium: 3600, // 1 hour
    long: 86400, // 24 hours
    week: 604800 // 7 days
}

// Buckets
export const BUCKETS = {
    attachments: 'attachments',
    images: 'images'
} as const

export type BucketName = keyof typeof BUCKETS

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Normalize storage path (strip bucket prefix if present)
 */
export function normalizePath(path: string, bucket: BucketName): string {
    const prefix = `${BUCKETS[bucket]}/`
    if (path.startsWith(prefix)) {
        return path.slice(prefix.length)
    }
    return path
}

/**
 * Sanitize filename for storage path
 */
export function sanitizeForPath(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[°º]/g, '') // Remove degree symbols
        .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars
        .replace(/_+/g, '_') // Collapse underscores
        .replace(/^_|_$/g, '') // Trim underscores
}

/**
 * Generate unique storage path
 */
export function generateStoragePath(
    userId: string,
    folder: string,
    filename: string
): string {
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 15)
    const sanitized = sanitizeForPath(filename)
    return `${userId}/${folder}/${timestamp}-${randomId}-${sanitized}`
}

// ============================================================================
// Upload Operations
// ============================================================================

export interface UploadOptions {
    contentType?: string
    cacheControl?: string
    upsert?: boolean
}

export interface UploadResult {
    success: boolean
    path?: string
    error?: string
}

/**
 * Upload a file to storage
 */
export async function uploadFile(
    bucket: BucketName,
    path: string,
    data: Buffer | Blob | ArrayBuffer,
    options?: UploadOptions
): Promise<UploadResult> {
    try {
        const normalizedPath = normalizePath(path, bucket)

        const { error } = await supabase.storage
            .from(BUCKETS[bucket])
            .upload(normalizedPath, data, {
                contentType: options?.contentType,
                cacheControl: options?.cacheControl || DEFAULT_CACHE_CONTROL,
                upsert: options?.upsert ?? false
            })

        if (error) {
            log.error(`[Storage] Upload failed to ${bucket}/${normalizedPath}:`, error)
            return { success: false, error: error.message }
        }

        log.info(`[Storage] Uploaded: ${bucket}/${normalizedPath}`)
        return { success: true, path: normalizedPath }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('[Storage] Upload exception:', error)
        return { success: false, error: message }
    }
}

/**
 * Upload with upsert (overwrite if exists)
 */
export async function uploadOrReplace(
    bucket: BucketName,
    path: string,
    data: Buffer | Blob | ArrayBuffer,
    options?: Omit<UploadOptions, 'upsert'>
): Promise<UploadResult> {
    return uploadFile(bucket, path, data, { ...options, upsert: true })
}

// ============================================================================
// Download Operations
// ============================================================================

export interface DownloadResult {
    success: boolean
    data?: Blob
    error?: string
}

/**
 * Download a file from storage
 */
export async function downloadFile(
    bucket: BucketName,
    path: string
): Promise<DownloadResult> {
    try {
        const normalizedPath = normalizePath(path, bucket)

        const { data, error } = await supabase.storage
            .from(BUCKETS[bucket])
            .download(normalizedPath)

        if (error) {
            log.error(`[Storage] Download failed from ${bucket}/${normalizedPath}:`, error)
            return { success: false, error: error.message }
        }

        return { success: true, data: data }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('[Storage] Download exception:', error)
        return { success: false, error: message }
    }
}

/**
 * Download file as Buffer
 */
export async function downloadAsBuffer(
    bucket: BucketName,
    path: string
): Promise<Buffer | null> {
    const result = await downloadFile(bucket, path)
    if (!result.success || !result.data) return null

    const arrayBuffer = await result.data.arrayBuffer()
    return Buffer.from(arrayBuffer)
}

// ============================================================================
// Delete Operations
// ============================================================================

export interface DeleteResult {
    success: boolean
    error?: string
}

/**
 * Delete a file from storage
 */
export async function deleteFile(
    bucket: BucketName,
    path: string
): Promise<DeleteResult> {
    try {
        const normalizedPath = normalizePath(path, bucket)

        const { error } = await supabase.storage
            .from(BUCKETS[bucket])
            .remove([normalizedPath])

        if (error) {
            log.error(`[Storage] Delete failed for ${bucket}/${normalizedPath}:`, error)
            return { success: false, error: error.message }
        }

        log.info(`[Storage] Deleted: ${bucket}/${normalizedPath}`)
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('[Storage] Delete exception:', error)
        return { success: false, error: message }
    }
}

/**
 * Delete multiple files
 */
export async function deleteFiles(
    bucket: BucketName,
    paths: string[]
): Promise<DeleteResult> {
    try {
        const normalizedPaths = paths.map(p => normalizePath(p, bucket))

        const { error } = await supabase.storage
            .from(BUCKETS[bucket])
            .remove(normalizedPaths)

        if (error) {
            log.error(`[Storage] Bulk delete failed:`, error)
            return { success: false, error: error.message }
        }

        log.info(`[Storage] Deleted ${paths.length} files from ${bucket}`)
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('[Storage] Bulk delete exception:', error)
        return { success: false, error: message }
    }
}

// ============================================================================
// Signed URL Operations
// ============================================================================

export interface SignedUrlOptions {
    download?: boolean
    transform?: {
        width?: number
        height?: number
        quality?: number
    }
}

export interface SignedUrlResult {
    success: boolean
    signedUrl?: string
    error?: string
}

/**
 * Create a signed URL for temporary access
 */
export async function createSignedUrl(
    bucket: BucketName,
    path: string,
    expiresIn: number = SIGNED_URL_EXPIRATION.medium,
    options?: SignedUrlOptions
): Promise<SignedUrlResult> {
    try {
        const normalizedPath = normalizePath(path, bucket)

        const { data, error } = await supabase.storage
            .from(BUCKETS[bucket])
            .createSignedUrl(normalizedPath, expiresIn, {
                download: options?.download,
                transform: options?.transform
            })

        if (error) {
            log.error(`[Storage] Signed URL failed for ${bucket}/${normalizedPath}:`, error)
            return { success: false, error: error.message }
        }

        return { success: true, signedUrl: data.signedUrl }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('[Storage] Signed URL exception:', error)
        return { success: false, error: message }
    }
}

/**
 * Create multiple signed URLs
 */
export async function createSignedUrls(
    bucket: BucketName,
    paths: string[],
    expiresIn: number = SIGNED_URL_EXPIRATION.medium
): Promise<Map<string, string>> {
    const results = new Map<string, string>()

    const normalizedPaths = paths.map(p => normalizePath(p, bucket))

    const { data, error } = await supabase.storage
        .from(BUCKETS[bucket])
        .createSignedUrls(normalizedPaths, expiresIn)

    if (error) {
        log.error('[Storage] Bulk signed URLs failed:', error)
        return results
    }

    if (data) {
        for (const item of data) {
            if (item.signedUrl) {
                results.set(item.path || '', item.signedUrl)
            }
        }
    }

    return results
}

/**
 * Get public URL (for public buckets only)
 */
export function getPublicUrl(bucket: BucketName, path: string): string {
    const normalizedPath = normalizePath(path, bucket)
    const { data } = supabase.storage.from(BUCKETS[bucket]).getPublicUrl(normalizedPath)
    return data.publicUrl
}

// ============================================================================
// List Operations
// ============================================================================

export interface ListOptions {
    limit?: number
    offset?: number
    sortBy?: {
        column: 'name' | 'created_at' | 'updated_at'
        order: 'asc' | 'desc'
    }
}

export interface FileObject {
    name: string
    id?: string
    created_at?: string
    updated_at?: string
    metadata?: Record<string, unknown>
}

/**
 * List files in a folder
 */
export async function listFiles(
    bucket: BucketName,
    folder: string,
    options?: ListOptions
): Promise<FileObject[]> {
    try {
        const { data, error } = await supabase.storage
            .from(BUCKETS[bucket])
            .list(folder, {
                limit: options?.limit || 100,
                offset: options?.offset || 0,
                sortBy: options?.sortBy || { column: 'created_at', order: 'desc' }
            })

        if (error) {
            log.error(`[Storage] List failed for ${bucket}/${folder}:`, error)
            return []
        }

        return data || []
    } catch (error) {
        log.error('[Storage] List exception:', error)
        return []
    }
}

// ============================================================================
// Export constants
// ============================================================================

export { SIGNED_URL_EXPIRATION, DEFAULT_CACHE_CONTROL, IMMUTABLE_CACHE_CONTROL }
