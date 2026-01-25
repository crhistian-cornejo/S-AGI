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
 * Sync Univer theme with the application's full VSCode theme.
 * Uses resolvedTheme (not fullThemeData) so we always have the correct
 * registered theme colors in dark mode – fullThemeData can be null on first render.
 */
export function useUniverTheme(): void {
    const { resolvedTheme } = useTheme()
    const { resolvedTheme: themeForUniver, isDark: isDarkFromContext } = useVSCodeTheme()
    const lastThemeRef = useRef<string | null>(null)
    const isDark = themeForUniver ? themeForUniver.type === 'dark' : isDarkFromContext

    useEffect(() => {
        const themeKey = `${themeForUniver?.id || 'default'}-${isDark}`
        if (themeKey === lastThemeRef.current) return
        lastThemeRef.current = themeKey

        const themeColors: VSCodeThemeColors | null = themeForUniver?.colors ?? null

        setCurrentVSCodeThemeColors(themeColors, isDark)

        if (isDark) {
            document.documentElement.classList.add('univer-dark')
        } else {
            document.documentElement.classList.remove('univer-dark')
        }

        setSheetsTheme(isDark, themeColors)
        setDocsTheme(isDark, themeColors)

        console.log('[UniverTheme] Theme synchronized:', {
            themeId: themeForUniver?.id,
            themeName: themeForUniver?.name,
            isDark,
            hasColors: !!themeColors,
            colorKeys: themeColors ? Object.keys(themeColors).length : 0,
        })
    }, [resolvedTheme, themeForUniver, isDark])
}

/**
 * Get the current dark mode status
 */
export function useIsDarkMode(): boolean {
    const { resolvedTheme } = useTheme()
    return resolvedTheme === 'dark'
}
