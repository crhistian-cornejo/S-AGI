/**
 * Image Processing Service
 *
 * Optimizes images for storage and AI processing:
 * - Converts to WebP for smaller file sizes (typically 25-35% smaller)
 * - Resizes large images to reasonable dimensions
 * - Maintains quality while reducing bandwidth
 * - HEIC to JPEG conversion for Apple formats
 * - Memory-safe processing with limits (adapted from Midday)
 */

import log from 'electron-log'
import { existsSync } from 'fs'
import { join } from 'path'

// ============================================================================
// Memory Safety Configuration (from Midday)
// ============================================================================

let sharpPromise: Promise<typeof import('sharp')> | null = null
let sharpConfigured = false

function ensureSharpLibvipsPath() {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') return

    const candidatePaths = [
        join(process.cwd(), 'node_modules', '@img', 'sharp-libvips-darwin-arm64', 'lib'),
        join(
            process.resourcesPath || '',
            'app.asar.unpacked',
            'node_modules',
            '@img',
            'sharp-libvips-darwin-arm64',
            'lib'
        )
    ].filter(Boolean)

    const existing = candidatePaths.filter((path) => existsSync(path))
    if (existing.length === 0) return

    const current = process.env.DYLD_LIBRARY_PATH || ''
    const merged = Array.from(
        new Set([current, ...existing].filter((p) => p && p.length > 0))
    ).join(':')
    process.env.DYLD_LIBRARY_PATH = merged
}

export async function getSharp() {
    ensureSharpLibvipsPath()
    if (!sharpPromise) {
        sharpPromise = import('sharp')
    }
    const mod = await sharpPromise
    const sharp = mod.default ?? mod
    if (!sharpConfigured) {
        // Configure Sharp memory limits to prevent OOM
        sharp.cache({ memory: 256, files: 20, items: 100 }) // 256MB cache limit
        sharp.concurrency(2) // Limit parallel operations
        sharpConfigured = true
    }
    return sharp
}

// Maximum file sizes
const MAX_HEIC_SIZE = 15 * 1024 * 1024 // 15MB - HEIC files larger than this skip processing
const MAX_IMAGE_SIZE = 50 * 1024 * 1024 // 50MB - Reject images larger than this

export interface ImageProcessingOptions {
    /** Target format (default: 'webp') */
    format?: 'webp' | 'jpeg' | 'png' | 'avif'
    /** Quality 1-100 (default: 80) */
    quality?: number
    /** Max width in pixels (default: 2048) */
    maxWidth?: number
    /** Max height in pixels (default: 2048) */
    maxHeight?: number
    /** Whether to strip metadata (default: true) */
    stripMetadata?: boolean
    /** Skip processing for files larger than this (in bytes) */
    maxInputSize?: number
}

export interface ProcessedImage {
    buffer: Buffer
    format: string
    mimeType: string
    originalSize: number
    processedSize: number
    width: number
    height: number
    compressionRatio: number
}

const DEFAULT_OPTIONS: Required<ImageProcessingOptions> = {
    format: 'webp',
    quality: 80,
    maxWidth: 2048,
    maxHeight: 2048,
    stripMetadata: true,
    maxInputSize: MAX_IMAGE_SIZE
}

// HEIC/HEIF MIME types
const HEIC_MIME_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/**
 * Check if MIME type is HEIC/HEIF format
 */
export function isHeicFormat(mimeType: string): boolean {
    return HEIC_MIME_TYPES.includes(mimeType.toLowerCase())
}

/**
 * Process an image buffer for optimized storage
 * Handles HEIC conversion, resizing, and format optimization
 */
export async function processImage(
    inputBuffer: Buffer,
    options?: ImageProcessingOptions
): Promise<ProcessedImage> {
    const sharp = await getSharp()
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const originalSize = inputBuffer.length

    // Check file size limits
    if (originalSize > opts.maxInputSize) {
        throw new Error(`Image too large: ${formatBytes(originalSize)} exceeds limit of ${formatBytes(opts.maxInputSize)}`)
    }

    try {
        let pipeline = sharp(inputBuffer, {
            // Memory safety options
            limitInputPixels: 268402689, // ~16384 x 16384
            sequentialRead: true // Reduce memory usage
        })

        // Get original metadata
        const metadata = await pipeline.metadata()
        log.info(`[ImageProcessor] Original: ${metadata.format}, ${metadata.width}x${metadata.height}, ${formatBytes(originalSize)}`)

        // Resize if needed (maintain aspect ratio)
        if (metadata.width && metadata.height) {
            if (metadata.width > opts.maxWidth || metadata.height > opts.maxHeight) {
                pipeline = pipeline.resize(opts.maxWidth, opts.maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
            }
        }

        // Strip metadata if requested
        if (opts.stripMetadata) {
            pipeline = pipeline.rotate() // Auto-rotate based on EXIF, then strip
        }

        // Convert to target format
        let outputBuffer: Buffer
        let mimeType: string

        switch (opts.format) {
            case 'webp':
                outputBuffer = await pipeline.webp({ quality: opts.quality }).toBuffer()
                mimeType = 'image/webp'
                break
            case 'avif':
                outputBuffer = await pipeline.avif({ quality: opts.quality }).toBuffer()
                mimeType = 'image/avif'
                break
            case 'jpeg':
                outputBuffer = await pipeline.jpeg({ quality: opts.quality }).toBuffer()
                mimeType = 'image/jpeg'
                break
            case 'png':
                outputBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer()
                mimeType = 'image/png'
                break
            default:
                outputBuffer = await pipeline.webp({ quality: opts.quality }).toBuffer()
                mimeType = 'image/webp'
        }

        // Get processed dimensions
        const processedMetadata = await sharp(outputBuffer).metadata()
        const processedSize = outputBuffer.length
        const compressionRatio = originalSize / processedSize

        log.info(`[ImageProcessor] Processed: ${opts.format}, ${processedMetadata.width}x${processedMetadata.height}, ${formatBytes(processedSize)} (${compressionRatio.toFixed(2)}x smaller)`)

        return {
            buffer: outputBuffer,
            format: opts.format,
            mimeType,
            originalSize,
            processedSize,
            width: processedMetadata.width || 0,
            height: processedMetadata.height || 0,
            compressionRatio
        }
    } catch (error) {
        log.error('[ImageProcessor] Failed to process image:', error)
        throw error
    }
}

/**
 * Process a base64 encoded image
 */
export async function processBase64Image(
    base64Data: string,
    options?: ImageProcessingOptions
): Promise<{ base64: string; mimeType: string; stats: Omit<ProcessedImage, 'buffer'> }> {
    const inputBuffer = Buffer.from(base64Data, 'base64')
    const result = await processImage(inputBuffer, options)
    
    return {
        base64: result.buffer.toString('base64'),
        mimeType: result.mimeType,
        stats: {
            format: result.format,
            mimeType: result.mimeType,
            originalSize: result.originalSize,
            processedSize: result.processedSize,
            width: result.width,
            height: result.height,
            compressionRatio: result.compressionRatio
        }
    }
}

/**
 * Check if a MIME type is a processable image
 */
export function isProcessableImage(mimeType: string): boolean {
    const processableTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/avif',
        'image/tiff',
        'image/bmp',
        // HEIC/HEIF support (Sharp handles these natively)
        'image/heic',
        'image/heif',
        'image/heic-sequence',
        'image/heif-sequence'
    ]
    return processableTypes.includes(mimeType.toLowerCase())
}

/**
 * Process HEIC image specifically - converts to JPEG
 * Adapted from Midday's HEIC handling
 */
export async function processHeicImage(
    inputBuffer: Buffer,
    options?: Omit<ImageProcessingOptions, 'format'>
): Promise<ProcessedImage> {
    const originalSize = inputBuffer.length

    // Skip processing for very large HEIC files to prevent OOM
    if (originalSize > MAX_HEIC_SIZE) {
        log.warn(`[ImageProcessor] HEIC file too large (${formatBytes(originalSize)}), skipping conversion`)
        throw new Error(`HEIC file too large for conversion: ${formatBytes(originalSize)}`)
    }

    log.info(`[ImageProcessor] Converting HEIC to JPEG: ${formatBytes(originalSize)}`)

    // Force JPEG output for HEIC
    return processImage(inputBuffer, {
        ...options,
        format: 'jpeg',
        quality: options?.quality || 85 // Slightly higher quality for HEIC conversion
    })
}

/**
 * Smart image processor that detects format and applies appropriate processing
 */
export async function smartProcessImage(
    inputBuffer: Buffer,
    mimeType: string,
    options?: ImageProcessingOptions
): Promise<ProcessedImage> {
    // Handle HEIC specifically
    if (isHeicFormat(mimeType)) {
        return processHeicImage(inputBuffer, options)
    }

    // Standard processing for other formats
    return processImage(inputBuffer, options)
}

/**
 * Get file extension for a format
 */
export function getExtensionForFormat(format: ImageProcessingOptions['format']): string {
    switch (format) {
        case 'webp': return '.webp'
        case 'avif': return '.avif'
        case 'jpeg': return '.jpg'
        case 'png': return '.png'
        default: return '.webp'
    }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
