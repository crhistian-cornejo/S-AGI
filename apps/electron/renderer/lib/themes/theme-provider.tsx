/**
 * VS Code Theme Provider
 *
 * Provides full VS Code theme support for the application:
 * - Applies CSS variables for UI theming
 * - Integrates with next-themes for system preference
 */

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useCallback,
    type ReactNode,
} from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { useTheme } from 'next-themes'

import {
    selectedFullThemeIdAtom,
    fullThemeDataAtom,
    systemLightThemeIdAtom,
    systemDarkThemeIdAtom,
    type VSCodeFullTheme,
    // Typography
    uiFontFamilyAtom,
    primaryFontSizeAtom,
    secondaryFontSizeAtom,
    FONT_FAMILY_OPTIONS,
    FONT_SIZE_OPTIONS,
} from '../atoms'
import {
    generateCSSVariables,
    applyCSSVariables,
    removeCSSVariables,
    getThemeTypeFromColors,
} from './vscode-to-css-mapping'
import {
    BUILTIN_THEMES,
    getBuiltinThemeById,
} from './builtin-themes'

/**
 * Theme context value
 */
interface ThemeContextValue {
    /** Cached theme (updated in effect); may be stale on first render */
    currentTheme: VSCodeFullTheme | null
    /** Resolved theme from useMemo – always in sync with selection/system; use this for Univer */
    resolvedTheme: VSCodeFullTheme | null
    currentThemeId: string | null
    isDark: boolean
    allThemes: VSCodeFullTheme[]
    setThemeById: (id: string | null) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Hook to access theme context
 */
export function useVSCodeTheme(): ThemeContextValue {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error('useVSCodeTheme must be used within a VSCodeThemeProvider')
    }
    return context
}

interface VSCodeThemeProviderProps {
    children: ReactNode
}

/**
 * VS Code Theme Provider Component
 */
export function VSCodeThemeProvider({ children }: VSCodeThemeProviderProps) {
    const { resolvedTheme, setTheme: setNextTheme } = useTheme()

    // Atoms
    const [selectedThemeId, setSelectedThemeId] = useAtom(selectedFullThemeIdAtom)
    const [fullThemeData, setFullThemeData] = useAtom(fullThemeDataAtom)
    const systemLightThemeId = useAtomValue(systemLightThemeIdAtom)
    const systemDarkThemeId = useAtomValue(systemDarkThemeIdAtom)

    // Typography atoms
    const uiFontFamily = useAtomValue(uiFontFamilyAtom)
    const primaryFontSize = useAtomValue(primaryFontSizeAtom)
    const secondaryFontSize = useAtomValue(secondaryFontSizeAtom)

    // Use builtin themes only
    const allThemes = BUILTIN_THEMES

    // Determine if we're in dark mode
    const isDark = useMemo(() => {
        if (fullThemeData) {
            return fullThemeData.type === 'dark'
        }
        return resolvedTheme === 'dark'
    }, [fullThemeData, resolvedTheme])

    // Find current theme by ID (considering system mode)
    const currentTheme = useMemo(() => {
        if (selectedThemeId === null) {
            // System mode - use appropriate theme based on system preference
            const systemThemeId = resolvedTheme === 'dark' ? systemDarkThemeId : systemLightThemeId
            return getBuiltinThemeById(systemThemeId) || null
        }
        return allThemes.find((t) => t.id === selectedThemeId) || null
    }, [selectedThemeId, allThemes, resolvedTheme, systemLightThemeId, systemDarkThemeId])

    // Update fullThemeData when theme changes
    useEffect(() => {
        if (currentTheme) {
            setFullThemeData(currentTheme)
        } else {
            setFullThemeData(null)
        }
    }, [currentTheme, setFullThemeData])

    // Apply CSS variables when theme changes
    useEffect(() => {
        if (fullThemeData?.colors) {
            // Generate and apply CSS variables
            const cssVars = generateCSSVariables(fullThemeData.colors)
            applyCSSVariables(cssVars)

            // For system mode, let next-themes handle class
            if (selectedThemeId === null) {
                setNextTheme('system')
            } else {
                // Sync next-themes with theme type
                const themeType = getThemeTypeFromColors(fullThemeData.colors)
                if (themeType === 'dark') {
                    document.documentElement.classList.add('dark')
                    document.documentElement.classList.remove('light')
                } else {
                    document.documentElement.classList.remove('dark')
                    document.documentElement.classList.add('light')
                }
                setNextTheme(themeType)
            }
        } else {
            // Remove custom CSS variables when no theme is selected
            removeCSSVariables()
        }

        return () => {
            // Cleanup on unmount
            removeCSSVariables()
        }
    }, [fullThemeData, selectedThemeId, setNextTheme])

    // Apply typography settings
    useEffect(() => {
        const root = document.documentElement

        // Apply font family
        const fontOption = FONT_FAMILY_OPTIONS.find(f => f.value === uiFontFamily)
        if (fontOption) {
            root.style.setProperty('--font-family', fontOption.fontFamily)
            document.body.style.fontFamily = fontOption.fontFamily
        }

        // Apply primary font size - set on html (for rem-based Tailwind) and body
        const primarySizeOption = FONT_SIZE_OPTIONS.find(f => f.value === primaryFontSize)
        if (primarySizeOption) {
            root.style.setProperty('--font-size-primary', primarySizeOption.size)
            root.style.fontSize = primarySizeOption.size
            document.body.style.fontSize = primarySizeOption.size
        }

        // Apply secondary font size
        const secondarySizeOption = FONT_SIZE_OPTIONS.find(f => f.value === secondaryFontSize)
        if (secondarySizeOption) {
            root.style.setProperty('--font-size-secondary', secondarySizeOption.size)
        }

        return () => {
            root.style.removeProperty('--font-family')
            root.style.removeProperty('--font-size-primary')
            root.style.removeProperty('--font-size-secondary')
            root.style.fontSize = ''
            document.body.style.fontFamily = ''
            document.body.style.fontSize = ''
        }
    }, [uiFontFamily, primaryFontSize, secondaryFontSize])

    // Theme actions
    const setThemeById = useCallback((id: string | null) => {
        setSelectedThemeId(id)
    }, [setSelectedThemeId])

    const contextValue = useMemo((): ThemeContextValue => ({
        currentTheme: fullThemeData,
        resolvedTheme: currentTheme,
        currentThemeId: selectedThemeId,
        isDark,
        allThemes,
        setThemeById,
    }), [
        fullThemeData,
        currentTheme,
        selectedThemeId,
        isDark,
        allThemes,
        setThemeById,
    ])

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    )
}
