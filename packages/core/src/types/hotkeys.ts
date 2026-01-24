/**
 * Configurable Hotkeys Types
 *
 * Defines the types and defaults for global keyboard shortcuts
 */

// Available hotkey IDs - expandable for future shortcuts
export type HotkeyId = 'quick-prompt'

// Platform shortcuts - maps platform to Electron accelerator string
export interface PlatformShortcuts {
    darwin: string      // macOS
    win32: string       // Windows
    linux: string       // Linux
    fallback: string    // Universal fallback
}

// Individual hotkey configuration
export interface HotkeyConfig {
    id: HotkeyId
    shortcut: string    // Current Electron accelerator format (e.g., "Command+Option+Space")
    enabled: boolean
}

// Registration status for a hotkey
export interface HotkeyStatus {
    id: HotkeyId
    isRegistered: boolean
    error?: string
    shortcut: string
    enabled: boolean
}

// Default hotkey definitions with metadata
export interface HotkeyDefinition {
    id: HotkeyId
    name: string
    description: string
    defaults: PlatformShortcuts
}

// All default hotkey definitions
export const HOTKEY_DEFINITIONS: Record<HotkeyId, HotkeyDefinition> = {
    'quick-prompt': {
        id: 'quick-prompt',
        name: 'Quick Prompt',
        description: 'Open the floating prompt bar from anywhere',
        defaults: {
            darwin: 'Command+Option+Space',
            win32: 'Super+Alt+Space',
            linux: 'Super+Alt+Space',
            fallback: 'Control+Shift+Space'
        }
    }
}

// Get default shortcut for the current platform
export function getDefaultShortcut(id: HotkeyId, platform: NodeJS.Platform): string {
    const def = HOTKEY_DEFINITIONS[id]
    if (!def) return ''

    switch (platform) {
        case 'darwin':
            return def.defaults.darwin
        case 'win32':
            return def.defaults.win32
        case 'linux':
            return def.defaults.linux
        default:
            return def.defaults.fallback
    }
}

// Get all hotkey IDs
export function getAllHotkeyIds(): HotkeyId[] {
    return Object.keys(HOTKEY_DEFINITIONS) as HotkeyId[]
}

// Reserved system shortcuts that should be blocked
export const RESERVED_SHORTCUTS: Record<NodeJS.Platform, string[]> = {
    darwin: [
        'Command+Q',           // Quit app
        'Command+W',           // Close window
        'Command+H',           // Hide app
        'Command+M',           // Minimize
        'Command+Tab',         // App switcher
        'Command+Space',       // Spotlight
        'Command+Control+Q',   // Lock screen
    ],
    win32: [
        'Alt+F4',              // Close window
        'Super+L',             // Lock screen
        'Super+D',             // Show desktop
        'Super+Tab',           // Task view
        'Control+Alt+Delete',  // Security options
    ],
    linux: [
        'Alt+F4',              // Close window
        'Super+L',             // Lock screen
        'Super+D',             // Show desktop
    ],
    aix: [],
    android: [],
    freebsd: [],
    haiku: [],
    openbsd: [],
    sunos: [],
    cygwin: [],
    netbsd: []
}

// Check if a shortcut is reserved by the system
export function isReservedShortcut(shortcut: string, platform: NodeJS.Platform): boolean {
    const reserved = RESERVED_SHORTCUTS[platform] || []
    return reserved.some(r => r.toLowerCase() === shortcut.toLowerCase())
}

// Validate shortcut format (must have at least one modifier)
export function isValidShortcut(shortcut: string): { valid: boolean; error?: string } {
    if (!shortcut || shortcut.trim() === '') {
        return { valid: false, error: 'Shortcut cannot be empty' }
    }

    const parts = shortcut.split('+').map(p => p.trim())

    if (parts.length < 2) {
        return { valid: false, error: 'Shortcut must include at least one modifier key' }
    }

    const modifiers = ['Command', 'Cmd', 'Control', 'Ctrl', 'Alt', 'Option', 'Shift', 'Super', 'Meta']
    const hasModifier = parts.slice(0, -1).some(p =>
        modifiers.some(m => m.toLowerCase() === p.toLowerCase())
    )

    if (!hasModifier) {
        return { valid: false, error: 'Shortcut must include at least one modifier (Cmd, Ctrl, Alt, Shift)' }
    }

    return { valid: true }
}
