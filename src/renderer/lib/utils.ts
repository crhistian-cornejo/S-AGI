import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Check if running in Electron
 */
export function isElectron(): boolean {
    return typeof window !== 'undefined' && window.desktopApi !== undefined
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
    if (isElectron()) {
        return window.desktopApi?.platform === 'darwin'
    }
    return typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
}

// Alias for compatibility
export const isMac = isMacOS

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
    if (isElectron()) {
        return window.desktopApi?.platform === 'win32'
    }
    return typeof navigator !== 'undefined' && /Win/.test(navigator.userAgent)
}

/**
 * Get keyboard shortcut modifier key
 */
export function getModifierKey(): string {
    return isMacOS() ? '⌘' : 'Ctrl'
}

/**
 * Detect user's preferred language
 */
export function detectLanguage(): string {
    if (typeof navigator !== 'undefined') {
        return navigator.language || 'en-US'
    }
    return 'en-US'
}

/**
 * Format date according to locale
 */
export function formatDate(date: Date | string, locale?: string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString(locale || detectLanguage(), {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string, locale?: string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diff = now.getTime() - d.getTime()

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    const rtf = new Intl.RelativeTimeFormat(locale || detectLanguage(), { numeric: 'auto' })

    if (minutes < 1) return rtf.format(0, 'minute')
    if (minutes < 60) return rtf.format(-minutes, 'minute')
    if (hours < 24) return rtf.format(-hours, 'hour')
    if (days < 7) return rtf.format(-days, 'day')

    const dateLocale = locale || detectLanguage()
    return new Intl.DateTimeFormat(dateLocale, { month: 'short', day: 'numeric' }).format(d)
}
