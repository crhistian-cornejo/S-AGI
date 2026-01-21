import path from 'path'

export function getExt(filename: string): string {
    const ext = path.extname(filename || '').toLowerCase()
    return ext.startsWith('.') ? ext.slice(1) : ext
}

export function isImageExt(ext: string): boolean {
    return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'heic', 'heif'].includes(ext)
}

export function inferMime(ext: string): string {
    switch (ext) {
        case 'png': return 'image/png'
        case 'jpg':
        case 'jpeg': return 'image/jpeg'
        case 'webp': return 'image/webp'
        case 'gif': return 'image/gif'
        case 'bmp': return 'image/bmp'
        case 'tif':
        case 'tiff': return 'image/tiff'
        case 'avif': return 'image/avif'
        case 'pdf': return 'application/pdf'
        case 'txt': return 'text/plain'
        case 'csv': return 'text/csv'
        case 'json': return 'application/json'
        case 'zip': return 'application/zip'
        default: return 'application/octet-stream'
    }
}

export function safeFilename(filename: string): string {
    const cleaned = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
    return cleaned.length ? cleaned : 'file'
}

export function fileUrlFromPath(p: string): string {
    const normalized = p.replace(/\\/g, '/')
    return `file:///${encodeURI(normalized)}`
}

