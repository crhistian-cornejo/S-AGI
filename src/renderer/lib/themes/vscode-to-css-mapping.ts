/**
 * VS Code theme colors to CSS variables mapping
 * 
 * This module handles the conversion of VS Code theme colors to the app's CSS variables.
 */

/**
 * Mapping from CSS variable names to VS Code theme color keys (priority order)
 */
export const VSCODE_TO_CSS_MAP: Record<string, string[]> = {
    // Background colors
    '--background': ['editor.background'],
    '--foreground': ['editor.foreground', 'foreground'],

    // Primary colors (buttons, links, accents)
    '--primary': ['button.background', 'focusBorder', 'textLink.foreground'],
    '--primary-foreground': ['button.foreground'],

    // Card/Panel colors
    '--card': ['sideBar.background', 'panel.background', 'editor.background'],
    '--card-foreground': ['sideBar.foreground', 'foreground'],

    // Popover/Dropdown colors
    '--popover': ['dropdown.background', 'editor.background'],
    '--popover-foreground': ['dropdown.foreground', 'foreground'],

    // Secondary colors
    '--secondary': ['button.secondaryBackground', 'tab.inactiveBackground', 'sideBar.background'],
    '--secondary-foreground': ['button.secondaryForeground', 'sideBar.foreground', 'foreground'],

    // Muted colors
    '--muted': ['tab.inactiveBackground', 'editorGroupHeader.tabsBackground', 'sideBar.background'],
    '--muted-foreground': ['tab.inactiveForeground', 'descriptionForeground', 'editorLineNumber.foreground'],

    // Accent colors
    '--accent': ['list.hoverBackground', 'list.activeSelectionBackground'],
    '--accent-foreground': ['foreground'],

    // Border colors
    '--border': ['panel.border', 'sideBar.border', 'input.border'],

    // Input colors
    '--input': ['input.border', 'panel.border', 'sideBar.border'],
    '--input-background': ['input.background', 'dropdown.background'],

    // Ring/Focus colors
    '--ring': ['focusBorder', 'button.background'],

    // Destructive colors
    '--destructive': ['errorForeground'],
    '--destructive-foreground': ['button.foreground'],

    // Sidebar background
    '--sidebar': ['sideBar.background', 'panel.background'],
    '--sidebar-foreground': ['sideBar.foreground', 'foreground'],
    '--sidebar-border': ['sideBar.border', 'panel.border'],
}

/**
 * Convert HEX color to HSL values string (without hsl() wrapper)
 * Returns format: "H S% L%" for use in CSS variables
 */
export function hexToHSL(hex: string, backgroundHex?: string): string {
    hex = hex.replace(/^#/, '')

    // Handle shorthand hex
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('')
    }

    let r: number, g: number, b: number

    // Handle 8-char hex with alpha
    if (hex.length === 8) {
        const alpha = parseInt(hex.slice(6, 8), 16) / 255
        const fgR = parseInt(hex.slice(0, 2), 16)
        const fgG = parseInt(hex.slice(2, 4), 16)
        const fgB = parseInt(hex.slice(4, 6), 16)

        if (backgroundHex && alpha < 1) {
            const bg = backgroundHex.replace(/^#/, '')
            const bgR = parseInt(bg.slice(0, 2), 16)
            const bgG = parseInt(bg.slice(2, 4), 16)
            const bgB = parseInt(bg.slice(4, 6), 16)

            r = (fgR * alpha + bgR * (1 - alpha)) / 255
            g = (fgG * alpha + bgG * (1 - alpha)) / 255
            b = (fgB * alpha + bgB * (1 - alpha)) / 255
        } else {
            r = fgR / 255
            g = fgG / 255
            b = fgB / 255
        }
    } else {
        r = parseInt(hex.slice(0, 2), 16) / 255
        g = parseInt(hex.slice(2, 4), 16) / 255
        b = parseInt(hex.slice(4, 6), 16) / 255
    }

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2

    let h = 0
    let s = 0

    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6
                break
            case g:
                h = ((b - r) / d + 2) / 6
                break
            case b:
                h = ((r - g) / d + 4) / 6
                break
        }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/**
 * Determine if a color is "light" or "dark"
 */
export function isLightColor(hex: string): boolean {
    hex = hex.replace(/^#/, '')
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('')
    }
    if (hex.length === 8) {
        hex = hex.slice(0, 6)
    }

    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)

    const brightness = (r * 0.2126 + g * 0.7152 + b * 0.0722)
    return brightness > 128
}

/**
 * Extract a color from theme colors using priority keys
 */
function getColorFromTheme(
    colors: Record<string, string>,
    priorityKeys: string[],
): string | null {
    for (const key of priorityKeys) {
        if (colors[key]) {
            return colors[key]
        }
    }
    return null
}

/**
 * Generate CSS variable values from VS Code theme colors
 */
export function generateCSSVariables(
    themeColors: Record<string, string>,
): Record<string, string> {
    const cssVariables: Record<string, string> = {}
    const backgroundColor = themeColors['editor.background'] || '#000000'

    for (const [cssVar, priorityKeys] of Object.entries(VSCODE_TO_CSS_MAP)) {
        const color = getColorFromTheme(themeColors, priorityKeys)
        if (color) {
            cssVariables[cssVar] = hexToHSL(color, backgroundColor)
        }
    }

    return cssVariables
}

/**
 * Apply CSS variables to the document root
 */
export function applyCSSVariables(
    variables: Record<string, string>,
    element: HTMLElement = document.documentElement,
): void {
    for (const [name, value] of Object.entries(variables)) {
        element.style.setProperty(name, value)
    }
}

/**
 * Remove custom CSS variables from the document root
 */
export function removeCSSVariables(
    element: HTMLElement = document.documentElement,
): void {
    for (const cssVar of Object.keys(VSCODE_TO_CSS_MAP)) {
        element.style.removeProperty(cssVar)
    }
}

/**
 * Get the theme type from VS Code theme colors
 */
export function getThemeTypeFromColors(colors: Record<string, string>): 'light' | 'dark' {
    const bgColor = colors['editor.background'] || '#000000'
    return isLightColor(bgColor) ? 'light' : 'dark'
}
