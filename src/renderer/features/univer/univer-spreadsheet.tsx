import { useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { IconDeviceFloppy } from '@tabler/icons-react'

interface UniverSpreadsheetProps {
    artifactId: string
    data?: any
}

export function UniverSpreadsheet({
    artifactId,
    data
}: UniverSpreadsheetProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const univerRef = useRef<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Save mutation
    const saveSnapshot = trpc.artifacts.saveUniverSnapshot.useMutation()

    useEffect(() => {
        const initUniver = async () => {
            try {
                setIsLoading(true)
                setError(null)

                if (!containerRef.current) return

                // Dynamic import of Univer presets
                const { createUniver, defaultTheme, LocaleType } = await import('@univerjs/presets')
                const { UniverSheetsCorePreset } = await import('@univerjs/presets/preset-sheets-core')

                // Import styles
                await import('@univerjs/presets/lib/styles/preset-sheets-core.css')

                // Create Univer instance using presets
                const { univer: univerInstance, univerAPI } = createUniver({
                    locale: LocaleType.EN_US,
                    theme: document.documentElement.classList.contains('dark') ? defaultTheme : defaultTheme,
                    presets: [
                        UniverSheetsCorePreset({
                            container: containerRef.current
                        })
                    ]
                })

                // Create or load workbook
                if (data) {
                    univerAPI.createWorkbook(data)
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
            if (univerRef.current?.univer) {
                univerRef.current.univer.dispose()
            }
        }
    }, [artifactId, data])

    // Save current state
    const handleSave = async () => {
        if (!univerRef.current?.api || isSaving) return

        try {
            setIsSaving(true)
            const workbook = univerRef.current.api.getActiveWorkbook()
            const snapshot = workbook?.getSnapshot()

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
            {/* Save button */}
            <div className="absolute top-2 right-2 z-20">
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                    className="shadow-md"
                >
                    <IconDeviceFloppy size={16} className="mr-1" />
                    {isSaving ? 'Saving...' : 'Save'}
                </Button>
            </div>
            
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
}
