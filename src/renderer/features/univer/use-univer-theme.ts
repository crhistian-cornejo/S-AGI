/**
 * Hook to synchronize application theme with Univer instances.
 * 
 * This hook listens to the application's dark/light mode and
 * automatically applies the same theme to all Univer instances.
 */

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { setSheetsTheme } from './univer-sheets-core'
import { setDocsTheme } from './univer-docs-core'

/**
 * Sync Univer theme with the application theme
 */
export function useUniverTheme(): void {
    const { resolvedTheme } = useTheme()

    useEffect(() => {
        const isDark = resolvedTheme === 'dark'
        
        // Apply theme to both Sheets and Docs instances
        setSheetsTheme(isDark)
        setDocsTheme(isDark)
        
        console.log('[UniverTheme] Theme synchronized:', resolvedTheme)
    }, [resolvedTheme])
}

/**
 * Get the current dark mode status
 */
export function useIsDarkMode(): boolean {
    const { resolvedTheme } = useTheme()
    return resolvedTheme === 'dark'
}
