/**
 * Custom Univer theme that integrates with S-AGI's design system.
 * 
 * This theme uses CSS custom properties to dynamically adapt to
 * the application's light/dark mode.
 */

import { defaultTheme } from '@univerjs/design'

/**
 * Helper to convert HSL CSS variable to hex color.
 * Reads from computed styles at runtime.
 */
function hslToHex(h: number, s: number, l: number): string {
    l /= 100
    const a = s * Math.min(l, 1 - l) / 100
    const f = (n: number) => {
        const k = (n + h / 30) % 12
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
        return Math.round(255 * color).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Parse HSL string (e.g., "217 91% 60%") to hex
 */
function parseHslToHex(hslString: string): string {
    const parts = hslString.trim().split(/\s+/)
    if (parts.length !== 3) return '#3B82F6' // fallback blue
    
    const h = parseFloat(parts[0])
    const s = parseFloat(parts[1].replace('%', ''))
    const l = parseFloat(parts[2].replace('%', ''))
    
    return hslToHex(h, s, l)
}

/**
 * Get a CSS variable value from the document
 */
function getCssVar(name: string): string {
    if (typeof document === 'undefined') return ''
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * Color palette type matching Univer's theme structure
 */
interface ColorPalette {
    50: string
    100: string
    200: string
    300: string
    400: string
    500: string
    600: string
    700: string
    800: string
    900: string
}

/**
 * Generate color palette from a base hex color
 * Creates 50-900 shades like Tailwind
 */
function generatePalette(baseHex: string): ColorPalette {
    // Parse the base color
    const r = parseInt(baseHex.slice(1, 3), 16)
    const g = parseInt(baseHex.slice(3, 5), 16)
    const b = parseInt(baseHex.slice(5, 7), 16)
    
    // Generate lighter and darker variants
    const lighten = (color: number, amount: number) => Math.min(255, Math.round(color + (255 - color) * amount))
    const darken = (color: number, amount: number) => Math.max(0, Math.round(color * (1 - amount)))
    
    const toHex = (r: number, g: number, b: number) => 
        `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    
    return {
        50: toHex(lighten(r, 0.95), lighten(g, 0.95), lighten(b, 0.95)),
        100: toHex(lighten(r, 0.9), lighten(g, 0.9), lighten(b, 0.9)),
        200: toHex(lighten(r, 0.75), lighten(g, 0.75), lighten(b, 0.75)),
        300: toHex(lighten(r, 0.6), lighten(g, 0.6), lighten(b, 0.6)),
        400: toHex(lighten(r, 0.3), lighten(g, 0.3), lighten(b, 0.3)),
        500: baseHex,
        600: toHex(darken(r, 0.1), darken(g, 0.1), darken(b, 0.1)),
        700: toHex(darken(r, 0.25), darken(g, 0.25), darken(b, 0.25)),
        800: toHex(darken(r, 0.4), darken(g, 0.4), darken(b, 0.4)),
        900: toHex(darken(r, 0.55), darken(g, 0.55), darken(b, 0.55)),
    }
}

/**
 * Create a custom theme based on the current CSS variables.
 * This should be called when initializing Univer to get the current theme colors.
 */
export function createCustomTheme(): typeof defaultTheme {
    // Get colors from CSS variables
    const primaryHsl = getCssVar('--primary')
    const backgroundHsl = getCssVar('--background')
    const foregroundHsl = getCssVar('--foreground')
    
    const primaryHex = primaryHsl ? parseHslToHex(primaryHsl) : '#3B82F6'
    const backgroundHex = backgroundHsl ? parseHslToHex(backgroundHsl) : '#FFFFFF'
    const foregroundHex = foregroundHsl ? parseHslToHex(foregroundHsl) : '#0A0A0A'
    
    // Generate primary palette
    const primaryPalette = generatePalette(primaryHex)
    
    // Generate gray palette from background color
    const grayPalette = generatePalette('#6B7280') // Neutral gray base
    
    // Create theme by extending defaultTheme with our colors
    // 'white' and 'black' control the canvas background and text colors
    return {
        ...defaultTheme,
        white: backgroundHex,  // Canvas/cell background color
        black: foregroundHex,  // Text color
        primary: primaryPalette,
        gray: grayPalette,
    }
}

/**
 * Create a dark theme based on the current CSS variables.
 */
export function createDarkTheme(): typeof defaultTheme {
    // Get colors from CSS variables (dark mode values)
    const primaryHsl = getCssVar('--primary')
    const backgroundHsl = getCssVar('--background')
    const foregroundHsl = getCssVar('--foreground')
    
    const primaryHex = primaryHsl ? parseHslToHex(primaryHsl) : '#3B82F6'
    const backgroundHex = backgroundHsl ? parseHslToHex(backgroundHsl) : '#0A0A0A'
    const foregroundHex = foregroundHsl ? parseHslToHex(foregroundHsl) : '#FAFAFA'
    
    // Generate primary palette
    const primaryPalette = generatePalette(primaryHex)
    
    // Generate gray palette
    const grayPalette = generatePalette('#6B7280')
    
    return {
        ...defaultTheme,
        white: backgroundHex,  // Dark canvas background
        black: foregroundHex,  // Light text for dark mode
        primary: primaryPalette,
        gray: grayPalette,
    }
}

/**
 * Check if dark mode is currently active
 */
export function isDarkModeActive(): boolean {
    if (typeof document === 'undefined') return false
    return document.documentElement.classList.contains('dark')
}
