import { useTheme } from 'next-themes'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { motion, AnimatePresence } from 'motion/react'
import { IconVolume, IconVolumeOff, IconPalette } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import {
    selectedFullThemeIdAtom,
    fullThemeDataAtom,
    systemLightThemeIdAtom,
    systemDarkThemeIdAtom,
    chatSoundsEnabledAtom,
    type VSCodeFullTheme,
    // Typography
    uiFontFamilyAtom,
    primaryFontSizeAtom,
    secondaryFontSizeAtom,
    FONT_FAMILY_OPTIONS,
    FONT_SIZE_OPTIONS,
    type FontFamily,
    type FontSize,
} from '@/lib/atoms'
import {
    BUILTIN_THEMES,
    getBuiltinThemeById,
} from '@/lib/themes/builtin-themes'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Theme preview box with dot and "Aa" text
function ThemePreviewBox({ theme, size = 'md', className }: { theme: VSCodeFullTheme | null; size?: 'sm' | 'md'; className?: string }) {
    const bgColor = theme?.colors?.['editor.background'] || '#1a1a1a'
    const accentColor = theme?.colors?.['focusBorder'] || theme?.colors?.['button.background'] || theme?.colors?.['textLink.foreground'] || '#0034FF'
    const isDark = theme ? theme.type === 'dark' : true

    const sizeClasses = size === 'sm'
        ? 'w-7 h-5 text-[9px] gap-0.5 rounded-sm'
        : 'w-8 h-6 text-[10px] gap-1 rounded-sm'

    const dotSize = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5'

    return (
        <div
            className={cn(
                'flex-shrink-0 flex items-center justify-center font-semibold',
                sizeClasses,
                className,
            )}
            style={{
                backgroundColor: bgColor,
                boxShadow: 'inset 0 0 0 0.5px rgba(128, 128, 128, 0.3)',
            }}
        >
            {/* Accent dot to the left of text */}
            <div
                className={cn('rounded-full flex-shrink-0', dotSize)}
                style={{ backgroundColor: accentColor }}
            />
            <span style={{ color: isDark ? '#fff' : '#000', opacity: 0.9 }}>Aa</span>
        </div>
    )
}

export function AppearanceTab() {
    const { resolvedTheme, setTheme: setNextTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    // Theme atoms
    const [selectedThemeId, setSelectedThemeId] = useAtom(selectedFullThemeIdAtom)
    const [systemLightThemeId, setSystemLightThemeId] = useAtom(systemLightThemeIdAtom)
    const [systemDarkThemeId, setSystemDarkThemeId] = useAtom(systemDarkThemeIdAtom)
    const setFullThemeData = useSetAtom(fullThemeDataAtom)

    // Sound effects toggle
    const [soundsEnabled, setSoundsEnabled] = useAtom(chatSoundsEnabledAtom)

    // Typography atoms
    const [uiFontFamily, setUiFontFamily] = useAtom(uiFontFamilyAtom)
    const [primaryFontSize, setPrimaryFontSize] = useAtom(primaryFontSizeAtom)
    const [secondaryFontSize, setSecondaryFontSize] = useAtom(secondaryFontSizeAtom)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Group themes by type
    const darkThemes = useMemo(() => BUILTIN_THEMES.filter(t => t.type === 'dark'), [])
    const lightThemes = useMemo(() => BUILTIN_THEMES.filter(t => t.type === 'light'), [])

    // Is system mode selected
    const isSystemMode = selectedThemeId === null

    // Get the current theme for display
    const currentTheme = useMemo(() => {
        if (selectedThemeId === null) {
            return null // System mode
        }
        return BUILTIN_THEMES.find(t => t.id === selectedThemeId) || null
    }, [selectedThemeId])

    // Get theme objects for system mode selectors
    const systemLightTheme = useMemo(() => getBuiltinThemeById(systemLightThemeId), [systemLightThemeId])
    const systemDarkTheme = useMemo(() => getBuiltinThemeById(systemDarkThemeId), [systemDarkThemeId])

    // Apply theme based on current settings
    const applyTheme = useCallback((themeId: string | null) => {
        if (themeId === null) {
            // System mode - apply theme based on system preference
            setFullThemeData(null)
            setNextTheme('system')
            return
        }

        const theme = BUILTIN_THEMES.find(t => t.id === themeId)
        if (theme) {
            setFullThemeData(theme)
            setNextTheme(theme.type)
        }
    }, [setFullThemeData, setNextTheme])

    // Handle main theme selection
    const handleThemeChange = useCallback((value: string) => {
        if (value === 'system') {
            setSelectedThemeId(null)
            applyTheme(null)
        } else {
            setSelectedThemeId(value)
            applyTheme(value)
        }
    }, [setSelectedThemeId, applyTheme])

    // Handle system light theme change
    const handleSystemLightThemeChange = useCallback((themeId: string) => {
        setSystemLightThemeId(themeId)
    }, [setSystemLightThemeId])

    // Handle system dark theme change
    const handleSystemDarkThemeChange = useCallback((themeId: string) => {
        setSystemDarkThemeId(themeId)
    }, [setSystemDarkThemeId])

    if (!mounted) {
        return (
            <div className="p-6 space-y-8">
                <div className="flex flex-col space-y-1.5">
                    <div className="flex items-center gap-2">
                        <IconPalette size={18} className="text-purple-500" />
                        <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
                    </div>
                </div>
                <div className="h-48 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex flex-col space-y-1.5">
                <div className="flex items-center gap-2">
                    <IconPalette size={18} className="text-purple-500" />
                    <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                    Customize the look and feel of the interface
                </p>
            </div>

            {/* Interface Theme Section */}
            <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Theme
                </h4>

                <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
                    {/* Main theme selector */}
                    <SettingsRow
                        title="Interface theme"
                        description="Select or customize your interface color scheme"
                        action={
                            <Select
                                value={selectedThemeId ?? 'system'}
                                onValueChange={handleThemeChange}
                            >
                                <SelectTrigger className="w-auto px-2">
                                    <div className="flex items-center gap-2 min-w-0 -ml-1">
                                        {isSystemMode ? (
                                            <>
                                                <ThemePreviewBox theme={resolvedTheme === 'dark' ? (systemDarkTheme ?? null) : (systemLightTheme ?? null)} />
                                                <span className="text-xs truncate">System preference</span>
                                            </>
                                        ) : (
                                            <>
                                                <ThemePreviewBox theme={currentTheme} />
                                                <span className="text-xs truncate">{currentTheme?.name || 'Select'}</span>
                                            </>
                                        )}
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    {/* System preference option */}
                                    <SelectItem value="system">
                                        <div className="flex items-center gap-2">
                                            <ThemePreviewBox theme={resolvedTheme === 'dark' ? (systemDarkTheme ?? null) : (systemLightTheme ?? null)} size="sm" />
                                            <span className="truncate">System preference</span>
                                        </div>
                                    </SelectItem>

                                    {/* Light themes */}
                                    {lightThemes.map((theme) => (
                                        <SelectItem key={theme.id} value={theme.id}>
                                            <div className="flex items-center gap-2">
                                                <ThemePreviewBox theme={theme} size="sm" />
                                                <span className="truncate">{theme.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}

                                    {/* Dark themes */}
                                    {darkThemes.map((theme) => (
                                        <SelectItem key={theme.id} value={theme.id}>
                                            <div className="flex items-center gap-2">
                                                <ThemePreviewBox theme={theme} size="sm" />
                                                <span className="truncate">{theme.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        }
                    />

                    {/* Animated Light/Dark theme selectors for system mode */}
                    <AnimatePresence initial={false}>
                        {isSystemMode && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                    height: { type: 'spring', stiffness: 300, damping: 30 },
                                    opacity: { duration: 0.2 },
                                }}
                                className="overflow-hidden"
                            >
                                {/* Light theme selector */}
                                <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border/50">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground">Light</p>
                                        <p className="text-xs text-muted-foreground">Theme to use for light system appearance</p>
                                    </div>

                                    <Select
                                        value={systemLightThemeId}
                                        onValueChange={handleSystemLightThemeChange}
                                    >
                                        <SelectTrigger className="w-auto px-2">
                                            <div className="flex items-center gap-2 min-w-0 -ml-1">
                                                <ThemePreviewBox theme={systemLightTheme || null} />
                                                <span className="text-xs truncate">{systemLightTheme?.name || 'Select'}</span>
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {lightThemes.map((theme) => (
                                                <SelectItem key={theme.id} value={theme.id}>
                                                    <div className="flex items-center gap-2">
                                                        <ThemePreviewBox theme={theme} size="sm" />
                                                        <span className="truncate">{theme.name}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Dark theme selector */}
                                <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border/50">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground">Dark</p>
                                        <p className="text-xs text-muted-foreground">Theme to use for dark system appearance</p>
                                    </div>

                                    <Select
                                        value={systemDarkThemeId}
                                        onValueChange={handleSystemDarkThemeChange}
                                    >
                                        <SelectTrigger className="w-auto px-2">
                                            <div className="flex items-center gap-2 min-w-0 -ml-1">
                                                <ThemePreviewBox theme={systemDarkTheme || null} />
                                                <span className="text-xs truncate">{systemDarkTheme?.name || 'Select'}</span>
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {darkThemes.map((theme) => (
                                                <SelectItem key={theme.id} value={theme.id}>
                                                    <div className="flex items-center gap-2">
                                                        <ThemePreviewBox theme={theme} size="sm" />
                                                        <span className="truncate">{theme.name}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Sound Effects Toggle */}
                    <SettingsRow
                        title="Sound effects"
                        description="Play sounds for chat events (thinking, tools, artifacts, etc.)"
                        action={
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setSoundsEnabled(!soundsEnabled)}
                                        className="h-9 w-9 rounded-md"
                                    >
                                        {soundsEnabled ? (
                                            <IconVolume size={18} />
                                        ) : (
                                            <IconVolumeOff size={18} className="text-muted-foreground" />
                                        )}
                                        <span className="sr-only">
                                            {soundsEnabled ? 'Disable sounds' : 'Enable sounds'}
                                        </span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                    {soundsEnabled ? 'Disable sounds' : 'Enable sounds'}
                                </TooltipContent>
                            </Tooltip>
                        }
                    />
                </div>
            </div>

            {/* Typography Section */}
            <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Typography
                </h4>

                <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
                    {/* Font Family */}
                    <SettingsRow
                        title="Font family"
                        description="Change the app's typeface"
                        action={
                            <Select
                                value={uiFontFamily}
                                onValueChange={(value) => setUiFontFamily(value as FontFamily)}
                            >
                                <SelectTrigger className="w-[140px]">
                                    <span className="text-xs truncate">
                                        {FONT_FAMILY_OPTIONS.find(f => f.value === uiFontFamily)?.label || 'Select'}
                                    </span>
                                </SelectTrigger>
                                <SelectContent>
                                    {FONT_FAMILY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            <span style={{ fontFamily: option.fontFamily }}>{option.label}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        }
                    />

                    {/* Primary Font Size */}
                    <SettingsRow
                        title="Primary text size"
                        description="Main content and body text"
                        action={
                            <Select
                                value={primaryFontSize}
                                onValueChange={(value) => setPrimaryFontSize(value as FontSize)}
                            >
                                <SelectTrigger className="w-[140px]">
                                    <span className="text-xs truncate">
                                        {FONT_SIZE_OPTIONS.find(f => f.value === primaryFontSize)?.label || 'Select'}
                                    </span>
                                </SelectTrigger>
                                <SelectContent>
                                    {FONT_SIZE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            <span>{option.label}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        }
                    />

                    {/* Secondary Font Size */}
                    <SettingsRow
                        title="Secondary text size"
                        description="Labels, hints, and captions"
                        action={
                            <Select
                                value={secondaryFontSize}
                                onValueChange={(value) => setSecondaryFontSize(value as FontSize)}
                            >
                                <SelectTrigger className="w-[140px]">
                                    <span className="text-xs truncate">
                                        {FONT_SIZE_OPTIONS.find(f => f.value === secondaryFontSize)?.label || 'Select'}
                                    </span>
                                </SelectTrigger>
                                <SelectContent>
                                    {FONT_SIZE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            <span>{option.label}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        }
                    />
                </div>
            </div>
        </div>
    )
}

/** Reusable row component for settings */
function SettingsRow({
    title,
    description,
    action,
}: {
    title: string
    description: string
    action: React.ReactNode
}) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {action}
        </div>
    )
}
