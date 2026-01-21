/**
 * Custom Univer theme that integrates with S-AGI's design system.
 *
 * This theme uses the full VSCode theme colors to create a comprehensive
 * Univer theme that matches the application's visual style.
 */

import { defaultTheme } from '@univerjs/design'

export type UniverTheme = typeof defaultTheme

/**
 * VSCode theme colors interface (subset of what we use)
 */
export interface VSCodeThemeColors {
    'editor.background'?: string
    'editor.foreground'?: string
    'foreground'?: string
    'sideBar.background'?: string
    'sideBar.foreground'?: string
    'sideBar.border'?: string
    'panel.background'?: string
    'panel.border'?: string
    'input.background'?: string
    'input.border'?: string
    'input.foreground'?: string
    'button.background'?: string
    'button.foreground'?: string
    'button.secondaryBackground'?: string
    'button.secondaryForeground'?: string
    'focusBorder'?: string
    'textLink.foreground'?: string
    'textLink.activeForeground'?: string
    'list.activeSelectionBackground'?: string
    'list.hoverBackground'?: string
    'editor.selectionBackground'?: string
    'editorLineNumber.foreground'?: string
    'descriptionForeground'?: string
    'errorForeground'?: string
    'dropdown.background'?: string
    'dropdown.foreground'?: string
    'tab.activeBackground'?: string
    'tab.inactiveBackground'?: string
    'tab.inactiveForeground'?: string
    'terminal.ansiRed'?: string
    'terminal.ansiGreen'?: string
    'terminal.ansiYellow'?: string
    'terminal.ansiBlue'?: string
    'terminal.ansiMagenta'?: string
    'terminal.ansiCyan'?: string
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
 * Normalize hex color (handle 8-char alpha hex and shorthand)
 */
function normalizeHex(hex: string): string {
    hex = hex.replace(/^#/, '')

    // Handle shorthand (3 chars)
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('')
    }

    // Handle 8-char with alpha - just take the RGB part
    if (hex.length === 8) {
        hex = hex.slice(0, 6)
    }

    return `#${hex}`
}

/**
 * Parse RGB values from hex
 */
function parseHexToRgb(hex: string): { r: number; g: number; b: number } {
    hex = normalizeHex(hex).replace('#', '')
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    }
}

/**
 * Generate color palette from a base hex color
 * Creates 50-900 shades like Tailwind
 */
function generatePalette(baseHex: string): ColorPalette {
    const { r, g, b } = parseHexToRgb(baseHex)

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
        500: normalizeHex(baseHex),
        600: toHex(darken(r, 0.1), darken(g, 0.1), darken(b, 0.1)),
        700: toHex(darken(r, 0.25), darken(g, 0.25), darken(b, 0.25)),
        800: toHex(darken(r, 0.4), darken(g, 0.4), darken(b, 0.4)),
        900: toHex(darken(r, 0.55), darken(g, 0.55), darken(b, 0.55)),
    }
}

/**
 * Generate a gray palette based on the theme's background brightness
 * 
 * IMPORTANT: For dark mode, the palette is INVERTED so that:
 * - gray-50 is dark (used for backgrounds)
 * - gray-900 is light (used for text)
 */
function generateGrayPalette(_backgroundColor: string, isDark: boolean): ColorPalette {
    if (isDark) {
        // For dark themes: INVERTED - low numbers are dark, high numbers are light
        return {
            50: '#171717',   // darkest - backgrounds
            100: '#1f1f1f',
            200: '#262626',
            300: '#333333',
            400: '#525252',
            500: '#737373',  // mid gray
            600: '#a3a3a3',
            700: '#d4d4d4',
            800: '#e5e5e5',
            900: '#fafafa',  // lightest - text
        }
    } else {
        // For light themes: normal - low numbers are light, high numbers are dark
        return {
            50: '#fafafa',   // lightest - backgrounds
            100: '#f4f4f5',
            200: '#e4e4e7',
            300: '#d4d4d8',
            400: '#a1a1aa',
            500: '#71717a',  // mid gray
            600: '#52525b',
            700: '#3f3f46',
            800: '#27272a',
            900: '#18181b',  // darkest - text
        }
    }
}

/**
 * Create a complete Univer theme from VSCode theme colors
 */
export function createThemeFromVSCodeColors(colors: VSCodeThemeColors, isDark: boolean): typeof defaultTheme {
    // Extract key colors with fallbacks
    const backgroundColor = normalizeHex(colors['editor.background'] || (isDark ? '#0a0a0a' : '#ffffff'))
    const foregroundColor = normalizeHex(colors['editor.foreground'] || colors['foreground'] || (isDark ? '#f4f4f5' : '#0a0a0a'))
    const primaryColor = normalizeHex(colors['button.background'] || colors['focusBorder'] || '#3B82F6')
    const linkColor = normalizeHex(colors['textLink.foreground'] || colors['focusBorder'] || primaryColor)
    const errorColor = normalizeHex(colors['errorForeground'] || colors['terminal.ansiRed'] || '#ef4444')
    const greenColor = normalizeHex(colors['terminal.ansiGreen'] || '#22c55e')
    const yellowColor = normalizeHex(colors['terminal.ansiYellow'] || '#eab308')
    const magentaColor = normalizeHex(colors['terminal.ansiMagenta'] || '#a855f7')
    const cyanColor = normalizeHex(colors['terminal.ansiCyan'] || '#06b6d4')

    // Generate all palettes
    const primaryPalette = generatePalette(primaryColor)
    const grayPalette = generateGrayPalette(backgroundColor, isDark)
    const bluePalette = generatePalette(linkColor)
    const greenPalette = generatePalette(greenColor)
    const redPalette = generatePalette(errorColor)
    const yellowPalette = generatePalette(yellowColor)
    const orangePalette = generatePalette('#f97316') // Orange
    const purplePalette = generatePalette(magentaColor)
    const pinkPalette = generatePalette('#ec4899')
    const indigoPalette = generatePalette('#6366f1')
    const jiqingPalette = generatePalette(cyanColor) // Cyan/Teal for jiqing

    // Loop colors for charts/data visualization
    const loopColors = {
        1: primaryColor,
        2: greenColor,
        3: yellowColor,
        4: errorColor,
        5: magentaColor,
        6: cyanColor,
        7: '#f97316', // orange
        8: '#ec4899', // pink
        9: '#6366f1', // indigo
        10: '#84cc16', // lime
        11: '#14b8a6', // teal
        12: '#8b5cf6', // violet
    }

    // Build the complete theme with all required palettes
    return {
        ...defaultTheme,
        // Canvas colors
        white: backgroundColor,
        black: foregroundColor,
        // Primary palette (buttons, accents)
        primary: primaryPalette,
        // Gray palette (backgrounds, borders, muted text)
        gray: grayPalette,
        // Semantic color palettes
        blue: bluePalette,
        green: greenPalette,
        red: redPalette,
        yellow: yellowPalette,
        orange: orangePalette,
        purple: purplePalette,
        pink: pinkPalette,
        indigo: indigoPalette,
        jiqing: jiqingPalette,
        'loop-color': loopColors,
    }
}

// Store the current theme colors for use by initialization functions
let currentThemeColors: VSCodeThemeColors | null = null
let currentIsDark: boolean = false

/**
 * Set the current VSCode theme colors (called by useUniverTheme)
 */
export function setCurrentVSCodeThemeColors(colors: VSCodeThemeColors | null, isDark: boolean): void {
    currentThemeColors = colors
    currentIsDark = isDark
}

/**
 * Get the current VSCode theme colors
 */
export function getCurrentVSCodeThemeColors(): { colors: VSCodeThemeColors | null; isDark: boolean } {
    return { colors: currentThemeColors, isDark: currentIsDark }
}

/**
 * Create a custom theme based on the current stored VSCode theme colors.
 * This should be called when initializing Univer.
 */
export function createCustomTheme(): typeof defaultTheme {
    if (currentThemeColors) {
        return createThemeFromVSCodeColors(currentThemeColors, currentIsDark)
    }

    // Fallback: create a default light theme
    const fallbackColors: VSCodeThemeColors = {
        'editor.background': '#ffffff',
        'editor.foreground': '#0a0a0a',
        'button.background': '#3B82F6',
        'focusBorder': '#3B82F6',
        'errorForeground': '#ef4444',
    }
    return createThemeFromVSCodeColors(fallbackColors, false)
}

/**
 * Create a dark theme based on the current stored VSCode theme colors.
 */
export function createDarkTheme(): typeof defaultTheme {
    if (currentThemeColors) {
        return createThemeFromVSCodeColors(currentThemeColors, true)
    }

    // Fallback: create a default dark theme
    const fallbackColors: VSCodeThemeColors = {
        'editor.background': '#0a0a0a',
        'editor.foreground': '#f4f4f5',
        'button.background': '#3B82F6',
        'focusBorder': '#3B82F6',
        'errorForeground': '#ef4444',
    }
    return createThemeFromVSCodeColors(fallbackColors, true)
}

/**
 * Check if dark mode is currently active
 */
export function isDarkModeActive(): boolean {
    if (typeof document === 'undefined') return currentIsDark
    return document.documentElement.classList.contains('univer-dark') || document.documentElement.classList.contains('dark')
}
