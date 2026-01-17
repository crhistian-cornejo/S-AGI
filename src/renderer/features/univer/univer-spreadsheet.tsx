import * as React from 'react'
import { trpc } from '@/lib/trpc'
import { useTheme } from 'next-themes'

interface UniverSpreadsheetProps {
    artifactId: string
    data?: any
}

export interface UniverSpreadsheetRef {
    save: () => Promise<void>
}

export const UniverSpreadsheet = React.forwardRef<UniverSpreadsheetRef, UniverSpreadsheetProps>(({
    artifactId,
    data
}, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const univerRef = React.useRef<any>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [isSaving, setIsSaving] = React.useState(false)
    const { resolvedTheme } = useTheme()

    // Refs to preserve state during theme switches
    const savedDataRef = React.useRef<any>(null)
    const lastArtifactIdRef = React.useRef(artifactId)

    // Save mutation
    const saveSnapshot = trpc.artifacts.saveUniverSnapshot.useMutation()

    React.useImperativeHandle(ref, () => ({
        save: async () => {
            await handleSave()
        }
    }))

    React.useEffect(() => {
        const initUniver = async () => {
            try {
                setIsLoading(true)
                setError(null)

                if (!containerRef.current) return

                // Dynamic import of Univer presets
                const { createUniver, defaultTheme, LocaleType } = await import('@univerjs/presets')
                const { UniverSheetsCorePreset } = await import('@univerjs/presets/preset-sheets-core')
                const { default: enUS } = await import('@univerjs/presets/preset-sheets-core/locales/en-US')

                // Import styles
                await import('@univerjs/presets/lib/styles/preset-sheets-core.css')

                // Determine data to load
                let initData = data
                // If we are on the same artifact and have saved data (from a theme switch), use it
                if (artifactId === lastArtifactIdRef.current && savedDataRef.current) {
                    initData = savedDataRef.current
                }

                // Update tracker
                lastArtifactIdRef.current = artifactId

                // Create Univer instance using presets
                const { univer: univerInstance, univerAPI } = createUniver({
                    locale: LocaleType.EN_US,
                    locales: {
                        [LocaleType.EN_US]: enUS
                    },
                    theme: defaultTheme,
                    // Enable dark mode based on current theme
                    // @ts-ignore - darkMode property exists in recent versions but might not be in types yet
                    darkMode: resolvedTheme === 'dark',
                    presets: [
                        UniverSheetsCorePreset({
                            container: containerRef.current
                        })
                    ]
                })

                // Create or load workbook
                if (initData) {
                    univerAPI.createWorkbook(initData)
                } else {
                    // Create blank workbook
                    univerAPI.createWorkbook({
                        id: artifactId,
                        name: 'Workbook',
                        sheets: {
                            sheet1: {
                                id: 'sheet1',
                                name: 'Sheet1',
                                rowCount: 100,
                                columnCount: 26,
                                cellData: {},
                                defaultColumnWidth: 100,
                                defaultRowHeight: 24,
                            },
                        },
                    })
                }

                univerRef.current = { univer: univerInstance, api: univerAPI }
                setIsLoading(false)

            } catch (err) {
                console.error('Failed to initialize Univer:', err)
                setError(err instanceof Error ? err.message : 'Failed to load spreadsheet')
                setIsLoading(false)
            }
        }

        initUniver()

        return () => {
            // Save state before disposal to preserve across theme switches
            if (univerRef.current?.api) {
                const currentWorkbook = univerRef.current.api.getActiveWorkbook()
                if (currentWorkbook) {
                    savedDataRef.current = currentWorkbook.save()
                }
            }

            if (univerRef.current?.univer) {
                univerRef.current.univer.dispose()
            }
        }
    }, [artifactId, data, resolvedTheme])

    // Save current state
    const handleSave = async () => {
        if (!univerRef.current?.api || isSaving) return

        try {
            setIsSaving(true)
            const workbook = univerRef.current.api.getActiveWorkbook()
            const snapshot = workbook?.save()

            if (snapshot) {
                await saveSnapshot.mutateAsync({
                    id: artifactId,
                    univerData: snapshot
                })
            }
        } catch (err) {
            console.error('Failed to save spreadsheet:', err)
        } finally {
            setIsSaving(false)
        }
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full text-destructive">
                <p>{error}</p>
            </div>
        )
    }

    return (
        <div className="relative w-full h-full">
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading spreadsheet...</span>
                    </div>
                </div>
            )}
            <div ref={containerRef} className="w-full h-full" />
        </div>
    )
})

UniverSpreadsheet.displayName = 'UniverSpreadsheet'
