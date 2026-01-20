import * as React from 'react'
import { trpc } from '@/lib/trpc'
import { initSheetsUniver, createWorkbook, disposeSheetsUniver, getSheetsInstanceVersion } from './univer-sheets-core'

interface UniverSpreadsheetProps {
    artifactId?: string
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

    // Debug: log isLoading state changes
    React.useEffect(() => {
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:40',message:'isLoading state changed',data:{isLoading,hasContainer:!!containerRef.current,hasWorkbook:!!workbookRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
    }, [isLoading])

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
        save: handleSave
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

                // #region agent log
                fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:90',message:'Initialization started',data:{hasContainer:!!containerRef.current,effectiveDataId,isLoading:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,E'})}).catch(()=>{});
                // #endregion

                console.log('[UniverSpreadsheet] Initializing sheets instance')

                // Get the sheets Univer instance
                const instance = await initSheetsUniver(containerRef.current)
                
                // Store version for cleanup
                versionRef.current = instance.version

                // #region agent log
                fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:98',message:'Instance created',data:{version:instance.version,hasUniver:!!instance.univer,hasApi:!!instance.api,mounted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion

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

                // #region agent log
                fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:111',message:'Workbook created',data:{hasWorkbook:!!workbook,workbookId:workbook?.getId?.()||'null',effectiveDataId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion

                console.log('[UniverSpreadsheet] Workbook created:', effectiveDataId)
                setIsLoading(false)

                // #region agent log
                fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:133',message:'isLoading set to false',data:{isLoading:false,hasContainer:!!containerRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion

                // Focus the container to enable keyboard input for cell editing
                // Use requestAnimationFrame to ensure DOM is ready, then focus after Univer renders
                // isLoading is false at this point since we just set it above
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        // #region agent log
                        const containerEl = containerRef.current;
                        const hasContainer = !!containerEl;
                        const activeElement = document.activeElement;
                        const univerCanvas = containerEl?.querySelector('.univer-render-canvas, [class*="univer-canvas"]');
                        const univerElements = containerEl?.querySelectorAll('[class*="univer"]');
                        fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:143',message:'Attempting focus (requestAnimationFrame + 300ms)',data:{hasContainer,containerTabIndex:containerEl?.tabIndex,activeElementBeforeFocus:activeElement?.tagName,hasUniverCanvas:!!univerCanvas,univerElementsCount:univerElements?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,D,E'})}).catch(()=>{});
                        // #endregion

                        if (!containerEl) {
                            // #region agent log
                            fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:151',message:'Skipping focus - container missing',data:{hasContainer:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                            // #endregion
                            return
                        }

                        // Try to focus the Univer canvas directly if it exists, otherwise focus container
                        const canvasEl = univerCanvas as HTMLElement
                        if (canvasEl && typeof canvasEl.focus === 'function') {
                            try {
                                canvasEl.focus()
                            } catch (e) {
                                containerEl.focus()
                            }
                        } else {
                            containerEl.focus()
                        }

                        // #region agent log
                        const newActiveElement = document.activeElement;
                        fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:173',message:'Focus applied',data:{activeElementAfterFocus:newActiveElement?.tagName,isCanvasFocused:newActiveElement===canvasEl,isContainerFocused:newActiveElement===containerEl,hasCanvas:!!canvasEl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,D'})}).catch(()=>{});
                        // #endregion

                        // Retry focus after additional delay to ensure Univer is fully rendered
                        setTimeout(() => {
                            // #region agent log
                            const retryContainerEl = containerRef.current;
                            const retryUniverCanvas = retryContainerEl?.querySelector('.univer-render-canvas, [class*="univer-canvas"]') as HTMLElement;
                            const retryActiveElement = document.activeElement;
                            fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:175',message:'Retry focus check (800ms total)',data:{hasContainer:!!retryContainerEl,hasUniverCanvas:!!retryUniverCanvas,activeElement:retryActiveElement?.tagName,isContainerFocused:retryActiveElement===retryContainerEl,isCanvasFocused:retryActiveElement===retryUniverCanvas},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D,E'})}).catch(()=>{});
                            // #endregion
                            
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
                        // #region agent log
                        fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:215',message:'Loading overlay clicked (blocking)',data:{isLoading,activeElement:document.activeElement?.tagName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
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
                onKeyDown={(e) => {
                    // #region agent log
                    const target = e.target as HTMLElement | null;
                    fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:266',message:'KeyDown event on container',data:{key:e.key,code:e.code,isLoading,targetTag:target?.tagName,activeElement:document.activeElement?.tagName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,D'})}).catch(()=>{});
                    // #endregion
                }}
                onFocus={(e) => {
                    // #region agent log
                    const target = e.target as HTMLElement | null;
                    fetch('http://127.0.0.1:7246/ingest/6abe35a7-678e-4166-97f4-5e79730b09e3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'univer-spreadsheet.tsx:270',message:'Container focused',data:{isLoading,targetTag:target?.tagName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                }}
            />
        </div>
    )
})

UniverSpreadsheet.displayName = 'UniverSpreadsheet'
