/**
 * Shared utility functions
 */

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `msg-${timestamp}-${random}`
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength - 3) + '...'
}

/**
 * Debug logging utility (no-op in production)
 */
export function debug(namespace: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[${namespace}]`, ...args)
    }
}
