/**
 * Shared configuration constants
 */

// Supported file extensions for uploads
export const SUPPORTED_EXTENSIONS = [
    '.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.json',
    '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.py', '.java',
    '.c', '.cpp', '.cs', '.go', '.rb', '.php', '.sh', '.tex', '.pptx'
] as const

// Max file size: 512MB (OpenAI limit)
export const MAX_FILE_SIZE = 512 * 1024 * 1024

// Concurrency limit for uploads
export const MAX_CONCURRENT_UPLOADS = 2

/**
 * Check if a file extension is supported
 */
export function isExtensionSupported(extension: string): boolean {
    return SUPPORTED_EXTENSIONS.includes(extension.toLowerCase() as any)
}
