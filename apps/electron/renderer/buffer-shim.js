/**
 * Buffer polyfill shim for browser
 * This file is injected by Vite before any other code runs
 */
import { Buffer } from 'buffer'

// Make Buffer available globally
if (typeof window !== 'undefined') {
    window.Buffer = Buffer
    window.global = window
}

// Also set on globalThis for consistency
if (typeof globalThis !== 'undefined') {
    globalThis.Buffer = Buffer
    globalThis.global = globalThis
}

export { Buffer }
