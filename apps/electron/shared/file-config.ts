/**
 * Centralized File Configuration
 *
 * Single source of truth for all file-related settings:
 * - Size limits
 * - Upload limits
 * - Compression settings
 * - Accepted file types
 *
 * Based on craft-agents-oss architecture patterns.
 */

import { z } from 'zod'

/**
 * File size limits (in bytes)
 */
export const FILE_SIZE_LIMITS = {
    /** Maximum upload size (512MB) */
    MAX_UPLOAD_SIZE: 512 * 1024 * 1024,
    /** Maximum image size (20MB) */
    MAX_IMAGE_SIZE: 20 * 1024 * 1024,
    /** Maximum HEIC image size (50MB) - larger due to compression */
    MAX_HEIC_SIZE: 50 * 1024 * 1024,
    /** Maximum document size (100MB) */
    MAX_DOCUMENT_SIZE: 100 * 1024 * 1024,
    /** Maximum spreadsheet size (50MB) */
    MAX_SPREADSHEET_SIZE: 50 * 1024 * 1024,
} as const

/**
 * Upload limits
 */
export const UPLOAD_LIMITS = {
    /** Maximum files per upload */
    MAX_FILES_PER_UPLOAD: 5,
    /** Maximum concurrent uploads */
    MAX_CONCURRENT_UPLOADS: 3,
} as const

/**
 * Compression settings
 */
export const COMPRESSION_CONFIG = {
    IMAGES: {
        /** Maximum width after compression */
        MAX_WIDTH: 1920,
        /** Maximum height after compression */
        MAX_HEIGHT: 1920,
        /** JPEG/WebP quality (0-1) */
        QUALITY: 0.75,
        /** Output format */
        FORMAT: 'image/webp' as const,
    },
    DOCUMENTS: {
        /** Whether to enable document compression */
        ENABLED: true,
        /** Maximum compression ratio (0.7 = 30% reduction) */
        MAX_REDUCTION: 0.7,
    },
} as const

/**
 * Accepted file types by category
 */
export const ACCEPTED_FILE_TYPES = {
    IMAGES: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'image/gif',
        'image/svg+xml',
        'image/bmp',
        'image/tiff',
    ] as const,
    DOCUMENTS: [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/rtf',
    ] as const,
    SPREADSHEETS: [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ] as const,
    CODE: [
        'text/javascript',
        'application/javascript',
        'text/typescript',
        'application/json',
        'text/html',
        'text/css',
        'text/xml',
        'application/xml',
    ] as const,
} as const

/**
 * Combined accepted types
 */
export const ALL_ACCEPTED_TYPES = [
    ...ACCEPTED_FILE_TYPES.IMAGES,
    ...ACCEPTED_FILE_TYPES.DOCUMENTS,
    ...ACCEPTED_FILE_TYPES.SPREADSHEETS,
    ...ACCEPTED_FILE_TYPES.CODE,
] as const

/**
 * File type category
 */
export type FileCategory = keyof typeof ACCEPTED_FILE_TYPES

/**
 * Check if MIME type is an image
 */
export function isImageType(mimeType: string): boolean {
    return (ACCEPTED_FILE_TYPES.IMAGES as readonly string[]).includes(mimeType)
}

/**
 * Check if MIME type is a document
 */
export function isDocumentType(mimeType: string): boolean {
    return (ACCEPTED_FILE_TYPES.DOCUMENTS as readonly string[]).includes(mimeType)
}

/**
 * Check if MIME type is a spreadsheet
 */
export function isSpreadsheetType(mimeType: string): boolean {
    return (ACCEPTED_FILE_TYPES.SPREADSHEETS as readonly string[]).includes(mimeType)
}

/**
 * Check if MIME type is code
 */
export function isCodeType(mimeType: string): boolean {
    return (ACCEPTED_FILE_TYPES.CODE as readonly string[]).includes(mimeType)
}

/**
 * Check if MIME type is accepted
 */
export function isAcceptedType(mimeType: string): boolean {
    return (ALL_ACCEPTED_TYPES as readonly string[]).includes(mimeType)
}

/**
 * Get the category for a MIME type
 */
export function getFileCategory(mimeType: string): FileCategory | null {
    if (isImageType(mimeType)) return 'IMAGES'
    if (isDocumentType(mimeType)) return 'DOCUMENTS'
    if (isSpreadsheetType(mimeType)) return 'SPREADSHEETS'
    if (isCodeType(mimeType)) return 'CODE'
    return null
}

/**
 * Get maximum file size for a MIME type
 */
export function getMaxSizeForType(mimeType: string): number {
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
        return FILE_SIZE_LIMITS.MAX_HEIC_SIZE
    }
    if (isImageType(mimeType)) return FILE_SIZE_LIMITS.MAX_IMAGE_SIZE
    if (isDocumentType(mimeType)) return FILE_SIZE_LIMITS.MAX_DOCUMENT_SIZE
    if (isSpreadsheetType(mimeType)) return FILE_SIZE_LIMITS.MAX_SPREADSHEET_SIZE
    return FILE_SIZE_LIMITS.MAX_UPLOAD_SIZE
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * Zod schemas for file validation
 */
export const fileUploadSchema = z.object({
    name: z.string().min(1),
    type: z.string(),
    size: z.number().max(FILE_SIZE_LIMITS.MAX_UPLOAD_SIZE),
})

export const imageFileSchema = z.object({
    name: z.string().min(1),
    type: z.enum(ACCEPTED_FILE_TYPES.IMAGES as unknown as [string, ...string[]]),
    size: z.number().max(FILE_SIZE_LIMITS.MAX_IMAGE_SIZE),
})

export const documentFileSchema = z.object({
    name: z.string().min(1),
    type: z.enum(ACCEPTED_FILE_TYPES.DOCUMENTS as unknown as [string, ...string[]]),
    size: z.number().max(FILE_SIZE_LIMITS.MAX_DOCUMENT_SIZE),
})

export const spreadsheetFileSchema = z.object({
    name: z.string().min(1),
    type: z.enum(ACCEPTED_FILE_TYPES.SPREADSHEETS as unknown as [string, ...string[]]),
    size: z.number().max(FILE_SIZE_LIMITS.MAX_SPREADSHEET_SIZE),
})

/**
 * Validate file against size limits
 */
export function validateFileSize(file: { type: string; size: number }): { valid: boolean; error?: string } {
    const maxSize = getMaxSizeForType(file.type)
    if (file.size > maxSize) {
        return {
            valid: false,
            error: `File size (${formatBytes(file.size)}) exceeds maximum (${formatBytes(maxSize)})`
        }
    }
    return { valid: true }
}

/**
 * Validate file type
 */
export function validateFileType(mimeType: string): { valid: boolean; error?: string } {
    if (!isAcceptedType(mimeType)) {
        return {
            valid: false,
            error: `File type '${mimeType}' is not accepted`
        }
    }
    return { valid: true }
}

/**
 * Combined file config export
 */
export const FILE_CONFIG = {
    SIZE_LIMITS: FILE_SIZE_LIMITS,
    UPLOAD_LIMITS,
    COMPRESSION: COMPRESSION_CONFIG,
    ACCEPTED_TYPES: ACCEPTED_FILE_TYPES,
    ALL_ACCEPTED_TYPES,
} as const

export type FileConfig = typeof FILE_CONFIG
