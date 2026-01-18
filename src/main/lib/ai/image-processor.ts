/**
 * Image Processing Service
 * 
 * Optimizes images for storage and AI processing:
 * - Converts to WebP for smaller file sizes (typically 25-35% smaller)
 * - Resizes large images to reasonable dimensions
 * - Maintains quality while reducing bandwidth
 */

import sharp from 'sharp'
import log from 'electron-log'

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
    stripMetadata: true
}

/**
 * Process an image buffer for optimized storage
 */
export async function processImage(
    inputBuffer: Buffer,
    options?: ImageProcessingOptions
): Promise<ProcessedImage> {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const originalSize = inputBuffer.length

    try {
        let pipeline = sharp(inputBuffer)

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
        'image/bmp'
    ]
    return processableTypes.includes(mimeType.toLowerCase())
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
