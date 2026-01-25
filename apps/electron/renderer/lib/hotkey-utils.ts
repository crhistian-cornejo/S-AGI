/**
 * Hotkey Utilities for Renderer Process
 *
 * Provides functions for formatting and building keyboard shortcuts
 */

// Platform-specific key display symbols
const KEY_DISPLAY_MAP: Record<string, Record<string, string>> = {
    darwin: {
        Command: '⌘',
        Cmd: '⌘',
        Control: '⌃',
        Ctrl: '⌃',
        Option: '⌥',
        Alt: '⌥',
        Shift: '⇧',
        Meta: '⌘',
        Super: '⌘',
        Space: 'Space',
        Enter: '↩',
        Escape: '⎋',
        Backspace: '⌫',
        Delete: '⌦',
        Tab: '⇥',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→'
    },
    win32: {
        Command: 'Ctrl',
        Cmd: 'Ctrl',
        Control: 'Ctrl',
        Ctrl: 'Ctrl',
        Option: 'Alt',
        Alt: 'Alt',
        Shift: 'Shift',
        Meta: 'Win',
        Super: 'Win',
        Space: 'Space',
        Enter: 'Enter',
        Escape: 'Esc',
        Backspace: 'Backspace',
        Delete: 'Delete',
        Tab: 'Tab',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→'
    },
    linux: {
        Command: 'Ctrl',
        Cmd: 'Ctrl',
        Control: 'Ctrl',
        Ctrl: 'Ctrl',
        Option: 'Alt',
        Alt: 'Alt',
        Shift: 'Shift',
        Meta: 'Super',
        Super: 'Super',
        Space: 'Space',
        Enter: 'Enter',
        Escape: 'Esc',
        Backspace: 'Backspace',
        Delete: 'Delete',
        Tab: 'Tab',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→'
    }
}

/**
 * Detect the current platform
 */
function getPlatform(): 'darwin' | 'win32' | 'linux' {
    const userAgent = navigator.userAgent.toLowerCase()
    if (userAgent.includes('mac')) return 'darwin'
    if (userAgent.includes('win')) return 'win32'
    return 'linux'
}

/**
 * Format an Electron accelerator string for display
 * e.g., "Command+Option+Space" → ["⌘", "⌥", "Space"] on macOS
 */
export function formatShortcutForDisplay(accelerator: string): string[] {
    if (!accelerator) return []

    const platform = getPlatform()
    const displayMap = KEY_DISPLAY_MAP[platform] || KEY_DISPLAY_MAP.win32

    const parts = accelerator.split('+').map(p => p.trim())

    return parts.map(part => {
        // Check if we have a display mapping
        const mapped = displayMap[part]
        if (mapped) return mapped

        // For single characters, uppercase them
        if (part.length === 1) {
            return part.toUpperCase()
        }

        // Return as-is for other keys
        return part
    })
}

/**
 * Get the display string for a shortcut (joined)
 */
export function getShortcutDisplayString(accelerator: string): string {
    const parts = formatShortcutForDisplay(accelerator)
    const platform = getPlatform()

    // On macOS, join without separator; on Windows/Linux, use +
    if (platform === 'darwin') {
        return parts.join('')
    }
    return parts.join('+')
}

/**
 * Build an Electron accelerator string from a KeyboardEvent
 */
export function buildAccelerator(event: KeyboardEvent): string | null {
    const parts: string[] = []

    // Add modifiers in standard order
    if (event.metaKey) {
        parts.push(getPlatform() === 'darwin' ? 'Command' : 'Super')
    }
    if (event.ctrlKey) {
        parts.push('Control')
    }
    if (event.altKey) {
        parts.push(getPlatform() === 'darwin' ? 'Option' : 'Alt')
    }
    if (event.shiftKey) {
        parts.push('Shift')
    }

    // Get the key
    const key = normalizeKey(event.key, event.code)

    // Don't include modifier-only presses
    if (['Control', 'Alt', 'Shift', 'Meta', 'Command', 'Option'].includes(key)) {
        return null
    }

    parts.push(key)

    // Must have at least one modifier
    if (parts.length < 2) {
        return null
    }

    return parts.join('+')
}

/**
 * Normalize a keyboard event key to Electron accelerator format
 */
function normalizeKey(key: string, code: string): string {
    // Handle special keys
    const keyMap: Record<string, string> = {
        ' ': 'Space',
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
        'Escape': 'Escape',
        'Enter': 'Enter',
        'Backspace': 'Backspace',
        'Delete': 'Delete',
        'Tab': 'Tab',
        'Home': 'Home',
        'End': 'End',
        'PageUp': 'PageUp',
        'PageDown': 'PageDown',
        'Insert': 'Insert'
    }

    if (keyMap[key]) {
        return keyMap[key]
    }

    // Handle function keys
    if (key.startsWith('F') && /^F\d+$/.test(key)) {
        return key
    }

    // Handle letter keys (use uppercase)
    if (key.length === 1 && /[a-zA-Z]/.test(key)) {
        return key.toUpperCase()
    }

    // Handle number keys
    if (key.length === 1 && /[0-9]/.test(key)) {
        return key
    }

    // Handle numpad
    if (code.startsWith('Numpad')) {
        const num = code.replace('Numpad', '')
        return `num${num}`
    }

    // For other keys, use the key value
    return key
}

/**
 * Check if the current platform is macOS
 */
export function isMacOS(): boolean {
    return getPlatform() === 'darwin'
}

/**
 * Get platform name for display
 */
export function getPlatformName(): string {
    const platform = getPlatform()
    switch (platform) {
        case 'darwin':
            return 'macOS'
        case 'win32':
            return 'Windows'
        default:
            return 'Linux'
    }
}
