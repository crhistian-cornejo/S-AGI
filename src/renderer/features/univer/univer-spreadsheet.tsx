import * as React from 'react'
import { trpc } from '@/lib/trpc'
import { initSheetsUniver, createWorkbook, disposeSheetsUniver, getSheetsInstanceVersion, getSheetsInstance } from './univer-sheets-core'
import { UniverInstanceType } from '@univerjs/core'

interface UniverSpreadsheetProps {
    artifactId?: string
    data?: any
}

export interface UniverSpreadsheetRef {
    save: () => Promise<void>
    getSnapshot: () => any | null
}

export const UniverSpreadsheet = React.forwardRef<UniverSpreadsheetRef, UniverSpreadsheetProps>(({
    artifactId,
    data
}, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [isSaving, setIsSaving] = React.useState(false)
    const workbookRef = React.useRef<any>(null)
    const versionRef = React.useRef<number>(-1)

    // Generate a stable instance ID
    const instanceIdRef = React.useRef<string>(`spreadsheet-${Date.now()}`)
    const instanceId = instanceIdRef.current

    // Use artifact ID for data purposes
    const effectiveDataId = artifactId ?? instanceId

    // Debug: log received data
    React.useEffect(() => {
        console.log('[UniverSpreadsheet] Mounted with data:', {
            artifactId,
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : [],
            sheetsKeys: data?.sheets ? Object.keys(data.sheets) : [],
        })
    }, [artifactId, data])


    // Save mutation
    const saveSnapshot = trpc.artifacts.saveUniverSnapshot.useMutation()

    const handleSave = React.useCallback(async () => {
        if (!workbookRef.current || isSaving) return

        try {
            setIsSaving(true)
            const snapshot = workbookRef.current.save()

            if (snapshot && artifactId) {
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
    }, [artifactId, isSaving, saveSnapshot])

    React.useImperativeHandle(ref, () => ({
        save: handleSave,
        getSnapshot: () => workbookRef.current?.save?.() ?? null
    }))

    // Store data in a ref to avoid re-initialization on every render
    // Only the initial data matters - subsequent changes should use Univer's API
    const initialDataRef = React.useRef(data)
    const isInitializedRef = React.useRef(false)

    // Initialize Univer on mount, dispose on unmount
    // Only depends on effectiveDataId to avoid unnecessary re-initialization
    React.useEffect(() => {
        let mounted = true

        const initUniver = async () => {
            if (!containerRef.current) {
                return
            }

            // Skip if already initialized with same ID
            if (isInitializedRef.current) {
                return
            }

            try {
                setIsLoading(true)
                setError(null)

                console.log('[UniverSpreadsheet] Initializing sheets instance')

                // Get the sheets Univer instance
                const instance = await initSheetsUniver(containerRef.current)
                
                // Store version for cleanup
                versionRef.current = instance.version

                if (!mounted) {
                    // Component unmounted during init - defer dispose with version check
                    const version = versionRef.current
                    setTimeout(() => disposeSheetsUniver(version), 0)
                    return
                }

                // Create workbook with data - use the ref to get stable initial data
                const workbook = createWorkbook(instance.univer, instance.api, initialDataRef.current, effectiveDataId)
                workbookRef.current = workbook
                isInitializedRef.current = true

                console.log('[UniverSpreadsheet] Workbook created:', effectiveDataId)
                setIsLoading(false)

                // Focus the container to enable keyboard input for cell editing
                // Use requestAnimationFrame to ensure DOM is ready, then focus after Univer renders
                // isLoading is false at this point since we just set it above
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const containerEl = containerRef.current
                        const univerCanvas = containerEl?.querySelector('.univer-render-canvas, [class*="univer-canvas"]')

                        if (!containerEl) return

                        // Try to focus the Univer canvas directly if it exists, otherwise focus container
                        const canvasEl = univerCanvas as HTMLElement
                        if (canvasEl && typeof canvasEl.focus === 'function') {
                            try {
                                canvasEl.focus()
                            } catch {
                                containerEl.focus()
                            }
                        } else {
                            containerEl.focus()
                        }

                        // Retry focus after additional delay to ensure Univer is fully rendered
                        setTimeout(() => {
                            const retryContainerEl = containerRef.current
                            const retryUniverCanvas = retryContainerEl?.querySelector('.univer-render-canvas, [class*="univer-canvas"]') as HTMLElement | null
                            const retryActiveElement = document.activeElement

                            // If canvas exists now and isn't focused, focus it
                            if (retryUniverCanvas && retryActiveElement !== retryUniverCanvas) {
                                retryUniverCanvas.focus()
                            } else if (retryContainerEl && retryActiveElement !== retryContainerEl) {
                                retryContainerEl.focus()
                            }
                        }, 500)
                    }, 300)
                })

            } catch (err) {
                console.error('Failed to initialize Univer Sheets:', err)
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Failed to load spreadsheet')
                    setIsLoading(false)
                }
            }
        }

        initUniver()

        // Cleanup on unmount - defer dispose with version check
        return () => {
            mounted = false
            workbookRef.current = null
            isInitializedRef.current = false
            
            // Capture version at cleanup time
            const version = versionRef.current
            
            // Defer the dispose to next tick to avoid "synchronously unmount during render" error
            // Version check ensures we don't dispose a newer instance
            setTimeout(() => {
                // Only dispose if current instance matches our version
                if (getSheetsInstanceVersion() === version) {
                    console.log('[UniverSpreadsheet] Deferred dispose executing for version:', version)
                    disposeSheetsUniver(version)
                } else {
                    console.log('[UniverSpreadsheet] Skipping dispose - instance was replaced')
                }
            }, 0)
        }
    }, [effectiveDataId])

    // Listen for live artifact updates from AI tools
    React.useEffect(() => {
        if (!artifactId) return

        const unsubscribe = window.desktopApi?.onArtifactUpdate?.((updateData) => {
            // Only process updates for this artifact
            if (updateData.artifactId !== artifactId) return
            if (updateData.type !== 'spreadsheet') return

            console.log('[UniverSpreadsheet] Received live update for artifact:', artifactId)

            const instance = getSheetsInstance()
            if (!instance) {
                console.warn('[UniverSpreadsheet] No Univer instance available for live update')
                return
            }

            try {
                // Strategy: Dispose current workbook and create new one with updated data
                // This is the safest approach to ensure data consistency
                const currentWorkbook = instance.api.getActiveWorkbook()
                if (currentWorkbook) {
                    // Get the unit ID and dispose it via the facade API
                    const unitId = currentWorkbook.getId()
                    if (unitId) {
                        instance.api.disposeUnit(unitId)
                    }
                }

                // Create new workbook with updated data
                instance.univer.createUnit(UniverInstanceType.UNIVER_SHEET, updateData.univerData)
                workbookRef.current = instance.api.getActiveWorkbook()

                console.log('[UniverSpreadsheet] Live update applied successfully')
            } catch (err) {
                console.error('[UniverSpreadsheet] Failed to apply live update:', err)
            }
        })

        return () => {
            unsubscribe?.()
        }
    }, [artifactId])

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
                <div 
                    className="absolute inset-0 flex items-center justify-center bg-background/80 z-10"
                    style={{ pointerEvents: 'auto' }}
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                    }}
                >
                    <div className="flex items-center gap-2 pointer-events-none">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading spreadsheet...</span>
                    </div>
                </div>
            )}
            {/* tabIndex=0 is required for the canvas to receive keyboard events */}
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Required for Univer canvas keyboard input */}
            <div 
                ref={containerRef} 
                tabIndex={0} 
                className="w-full h-full outline-none"
            />
        </div>
    )
})

UniverSpreadsheet.displayName = 'UniverSpreadsheet'
