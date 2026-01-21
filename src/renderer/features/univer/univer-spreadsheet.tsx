import * as React from 'react'
import { useAtom } from 'jotai'
import { trpc } from '@/lib/trpc'
import { initSheetsUniver, createWorkbook, disposeSheetsUniver, getSheetsInstanceVersion, getSheetsInstance } from './univer-sheets-core'
import { UniverInstanceType } from '@univerjs/core'
import { artifactSnapshotCacheAtom, type ArtifactSnapshot } from '@/lib/atoms'

interface UniverSpreadsheetProps {
    artifactId?: string
    data?: any
}

export interface UniverSpreadsheetRef {
    save: () => Promise<void>
    getSnapshot: () => any | null
    markDirty: () => void
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
    const isDirtyRef = React.useRef(false)

    // Snapshot cache for persistence across tab switches
    const [snapshotCache, setSnapshotCache] = useAtom(artifactSnapshotCacheAtom)

    // Use artifact ID for data purposes; fallback to a stable per-mount ID
    const instanceIdRef = React.useRef<string>(`spreadsheet-${Date.now()}`)
    const effectiveDataId = artifactId ?? instanceIdRef.current

    // Check if we have a cached snapshot that's newer than the DB data
    const getCachedOrDbData = React.useCallback(() => {
        if (!artifactId) return data
        const cached = snapshotCache[artifactId]
        if (cached && cached.isDirty) {
            console.log('[UniverSpreadsheet] Using cached snapshot (dirty)', artifactId)
            return cached.univerData
        }
        return data
    }, [artifactId, data, snapshotCache])

    // Debug: log received data
    React.useEffect(() => {
        console.log('[UniverSpreadsheet] Mounted with data:', {
            artifactId,
            hasData: !!data,
            hasCachedData: artifactId ? !!snapshotCache[artifactId] : false,
            dataKeys: data ? Object.keys(data) : [],
            sheetsKeys: data?.sheets ? Object.keys(data.sheets) : [],
        })
    }, [artifactId, data, snapshotCache])


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

    // Mark as dirty when user makes changes
    const markDirty = React.useCallback(() => {
        isDirtyRef.current = true
    }, [])

    React.useImperativeHandle(ref, () => ({
        save: handleSave,
        getSnapshot: () => workbookRef.current?.save?.() ?? null,
        markDirty
    }))

    // Store data in a ref to avoid re-initialization on every render
    // Only the initial data matters - subsequent changes should use Univer's API
    // Use cached data if available and dirty
    const effectiveData = getCachedOrDbData()
    const initialDataRef = React.useRef(effectiveData)
    const isInitializedRef = React.useRef(false)

    // Initialize Univer on mount, dispose on unmount
    // Only depends on effectiveDataId to avoid unnecessary re-initialization
    React.useEffect(() => {
        let mounted = true

        const initUniver = async () => {
            if (!containerRef.current) {
                return
            }

            if (isInitializedRef.current) return

            try {
                setIsLoading(true)
                setError(null)

                // Wait for next frame to ensure container is fully in DOM
                // This prevents race conditions with React's render cycle
                await new Promise(resolve => requestAnimationFrame(resolve))
                
                // Check if still mounted after waiting
                if (!mounted || !containerRef.current) {
                    console.log('[UniverSpreadsheet] Aborted init - component unmounted during wait')
                    return
                }

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

        // Cleanup on unmount - save to cache and defer dispose
        return () => {
            mounted = false

            // AUTOGUARDADO: Save current state to cache before unmounting
            if (workbookRef.current && artifactId) {
                try {
                    const snapshot = workbookRef.current.save()
                    if (snapshot) {
                        // Always cache the current state - even if not "dirty" to preserve user position
                        const cacheEntry: ArtifactSnapshot = {
                            univerData: snapshot,
                            timestamp: Date.now(),
                            isDirty: isDirtyRef.current
                        }
                        setSnapshotCache(prev => ({
                            ...prev,
                            [artifactId]: cacheEntry
                        }))
                        console.log('[UniverSpreadsheet] Cached snapshot on unmount:', artifactId, 'isDirty:', isDirtyRef.current)

                        // If dirty, also trigger async save to DB
                        if (isDirtyRef.current) {
                            saveSnapshot.mutate({ id: artifactId, univerData: snapshot })
                            console.log('[UniverSpreadsheet] Triggered async save to DB')
                        }
                    }
                } catch (err) {
                    console.error('[UniverSpreadsheet] Failed to cache snapshot:', err)
                }
            }

            workbookRef.current = null
            isInitializedRef.current = false
            isDirtyRef.current = false

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
    }, [effectiveDataId, artifactId, setSnapshotCache, saveSnapshot])

    // Track user edits to mark as dirty (for autoguardado)
    React.useEffect(() => {
        if (!artifactId) return

        // Mark dirty on any keyboard input in the container
        const container = containerRef.current
        if (!container) return

        const handleInput = () => {
            isDirtyRef.current = true
        }

        // Listen for various edit events
        container.addEventListener('input', handleInput)
        container.addEventListener('keydown', handleInput)
        container.addEventListener('paste', handleInput)

        return () => {
            container.removeEventListener('input', handleInput)
            container.removeEventListener('keydown', handleInput)
            container.removeEventListener('paste', handleInput)
        }
    }, [artifactId])

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
                className="w-full h-full outline-none"
            />
        </div>
    )
})

UniverSpreadsheet.displayName = 'UniverSpreadsheet'
