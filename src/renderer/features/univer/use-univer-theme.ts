/**
 * Hook to synchronize application theme with Univer instances.
 *
 * This hook listens to the application's VSCode theme and
 * automatically applies all theme colors to Univer instances.
 */

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useVSCodeTheme } from '@/lib/themes/theme-provider'
import { setSheetsTheme } from './univer-sheets-core'
import { setDocsTheme } from './univer-docs-core'
import { setCurrentVSCodeThemeColors, type VSCodeThemeColors } from './univer-theme'

/**
 * Sync Univer theme with the application's full VSCode theme
 */
export function useUniverTheme(): void {
    const { resolvedTheme } = useTheme()
    const { currentTheme, isDark } = useVSCodeTheme()
    const lastThemeRef = useRef<string | null>(null)

    useEffect(() => {
        // Create a unique key for the current theme state
        const themeKey = `${currentTheme?.id || 'default'}-${isDark}`

        // Skip if theme hasn't changed
        if (themeKey === lastThemeRef.current) return
        lastThemeRef.current = themeKey

        // Get colors from the current VSCode theme
        const themeColors: VSCodeThemeColors | null = currentTheme?.colors || null

        // Update the stored theme colors for initialization
        setCurrentVSCodeThemeColors(themeColors, isDark)

        // IMPORTANT: Add/remove univer-dark class for Univer's dark mode selectors
        // Univer uses .univer-dark for its dark mode styles, not .dark
        if (isDark) {
            document.documentElement.classList.add('univer-dark')
        } else {
            document.documentElement.classList.remove('univer-dark')
        }

        // Apply theme to both Sheets and Docs instances with full colors
        setSheetsTheme(isDark, themeColors)
        setDocsTheme(isDark, themeColors)

        console.log('[UniverTheme] Theme synchronized:', {
            themeId: currentTheme?.id,
            themeName: currentTheme?.name,
            isDark,
            hasColors: !!themeColors,
            colorKeys: themeColors ? Object.keys(themeColors).length : 0,
        })
    }, [resolvedTheme, currentTheme, isDark])
}

/**
 * Get the current dark mode status
 */
export function useIsDarkMode(): boolean {
    const { resolvedTheme } = useTheme()
    return resolvedTheme === 'dark'
}
