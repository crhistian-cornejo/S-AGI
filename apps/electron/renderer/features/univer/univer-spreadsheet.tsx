import * as React from 'react'
import { useAtom } from 'jotai'
import { trpc } from '@/lib/trpc'
import { initSheetsUniver, createWorkbook, disposeSheetsUniver, getSheetsInstanceVersion, getSheetsInstance } from './univer-sheets-core'
import { UniverInstanceType } from '@univerjs/core'
import { artifactSnapshotCacheAtom, type ArtifactSnapshot } from '@/lib/atoms'
import {
    fileSnapshotCacheAtom,
    type FileSnapshot,
    currentExcelFileIdAtom,
    currentExcelFileAtom,
    fileSavingAtom,
} from '@/lib/atoms/user-files'

interface UniverSpreadsheetProps {
    // Legacy: artifact-based props (for backward compatibility)
    artifactId?: string
    data?: any
    // New: file-based props
    fileId?: string
    fileData?: any
    // Optional: callback when version is created
    onVersionCreated?: (versionNumber: number) => void
}

export interface UniverSpreadsheetRef {
    save: () => Promise<void>
    getSnapshot: () => any | null
    markDirty: () => void
    // New: save with AI metadata for Agent Panel
    saveWithAIMetadata: (options: {
        aiModel: string
        aiPrompt: string
        toolName: string
    }) => Promise<void>
}

export const UniverSpreadsheet = React.forwardRef<UniverSpreadsheetRef, UniverSpreadsheetProps>(({
    artifactId,
    data,
    fileId,
    fileData,
    onVersionCreated
}, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [isSaving, setIsSaving] = React.useState(false)
    const workbookRef = React.useRef<any>(null)
    const versionRef = React.useRef<number>(-1)
    const isDirtyRef = React.useRef(false)

    // Determine if using new file system or legacy artifact system
    const useFileSystem = !!fileId
    const effectiveId = fileId || artifactId
    const effectiveData = fileData || data

    // === LEGACY: Artifact snapshot cache ===
    const [artifactSnapshotCache, setArtifactSnapshotCache] = useAtom(artifactSnapshotCacheAtom)

    // === NEW: File snapshot cache ===
    const [fileSnapshotCache, setFileSnapshotCache] = useAtom(fileSnapshotCacheAtom)
    const [, setSavingState] = useAtom(fileSavingAtom)

    // Get the appropriate snapshot cache based on mode
    const getSnapshotCache = React.useCallback(() => {
        if (useFileSystem && fileId) {
            return fileSnapshotCache[fileId]
        } else if (artifactId) {
            return artifactSnapshotCache[artifactId]
        }
        return null
    }, [useFileSystem, fileId, artifactId, fileSnapshotCache, artifactSnapshotCache])

    // Set snapshot in appropriate cache
    const setSnapshotInCache = React.useCallback((id: string, snapshot: any, isDirty: boolean) => {
        if (useFileSystem) {
            const entry: FileSnapshot = {
                univerData: snapshot,
                timestamp: Date.now(),
                isDirty
            }
            setFileSnapshotCache(prev => ({
                ...prev,
                [id]: entry
            }))
        } else {
            const entry: ArtifactSnapshot = {
                univerData: snapshot,
                timestamp: Date.now(),
                isDirty
            }
            setArtifactSnapshotCache(prev => ({
                ...prev,
                [id]: entry
            }))
        }
    }, [useFileSystem, setFileSnapshotCache, setArtifactSnapshotCache])

    // Use effective ID for data purposes; fallback to a stable per-mount ID
    const instanceIdRef = React.useRef<string>(`spreadsheet-${Date.now()}`)
    const effectiveDataId = effectiveId ?? instanceIdRef.current

    // Check if we have a cached snapshot that's newer than the DB data
    const getCachedOrDbData = React.useCallback(() => {
        if (!effectiveId) return effectiveData
        const cached = getSnapshotCache()
        if (cached && cached.isDirty) {
            console.log('[UniverSpreadsheet] Using cached snapshot (dirty)', effectiveId)
            return cached.univerData
        }
        return effectiveData
    }, [effectiveId, effectiveData, getSnapshotCache])

    // Debug: log received data
    React.useEffect(() => {
        console.log('[UniverSpreadsheet] Mounted with:', {
            mode: useFileSystem ? 'file' : 'artifact',
            effectiveId,
            hasData: !!effectiveData,
            hasCachedData: !!getSnapshotCache(),
            dataKeys: effectiveData ? Object.keys(effectiveData) : [],
        })
    }, [useFileSystem, effectiveId, effectiveData, getSnapshotCache])

    // === MUTATIONS ===
    // Legacy: Artifact save mutation
    const saveArtifactSnapshot = trpc.artifacts.saveUniverSnapshot.useMutation()

    // New: File update mutation
    const updateFileMutation = trpc.userFiles.update.useMutation({
        onSuccess: (result) => {
            if (fileId) {
                setSavingState(prev => ({ ...prev, [fileId]: false }))
                // Clear dirty flag in cache
                setFileSnapshotCache(prev => {
                    const existing = prev[fileId]
                    if (existing) {
                        return {
                            ...prev,
                            [fileId]: { ...existing, isDirty: false }
                        }
                    }
                    return prev
                })
            }
            if (onVersionCreated && result?.version_count) {
                onVersionCreated(result.version_count)
            }
        },
        onError: () => {
            if (fileId) {
                setSavingState(prev => ({ ...prev, [fileId]: false }))
            }
        }
    })

    // Handle save (unified for both modes)
    const handleSave = React.useCallback(async () => {
        if (!workbookRef.current || isSaving || !effectiveId) return

        try {
            setIsSaving(true)
            const snapshot = workbookRef.current.save()

            if (snapshot) {
                if (useFileSystem && fileId) {
                    // New file system
                    setSavingState(prev => ({ ...prev, [fileId]: true }))
                    await updateFileMutation.mutateAsync({
                        id: fileId,
                        univerData: snapshot,
                        changeType: 'manual_save',
                        changeDescription: 'Guardado manual'
                    })
                    isDirtyRef.current = false
                } else if (artifactId) {
                    // Legacy artifact system
                    await saveArtifactSnapshot.mutateAsync({
                        id: artifactId,
                        univerData: snapshot
                    })
                    isDirtyRef.current = false
                }
            }
        } catch (err) {
            console.error('Failed to save spreadsheet:', err)
        } finally {
            setIsSaving(false)
        }
    }, [effectiveId, useFileSystem, fileId, artifactId, isSaving, updateFileMutation, saveArtifactSnapshot, setSavingState])

    // Save with AI metadata (for Agent Panel)
    const handleSaveWithAIMetadata = React.useCallback(async (options: {
        aiModel: string
        aiPrompt: string
        toolName: string
    }) => {
        if (!workbookRef.current || !fileId) {
            console.warn('[UniverSpreadsheet] Cannot save with AI metadata - no fileId or workbook')
            return
        }

        try {
            setIsSaving(true)
            setSavingState(prev => ({ ...prev, [fileId]: true }))

            const snapshot = workbookRef.current.save()

            if (snapshot) {
                await updateFileMutation.mutateAsync({
                    id: fileId,
                    univerData: snapshot,
                    changeType: 'ai_edit',
                    changeDescription: `Editado por ${options.toolName}`,
                    aiModel: options.aiModel,
                    aiPrompt: options.aiPrompt,
                    toolName: options.toolName
                })
                isDirtyRef.current = false
                console.log('[UniverSpreadsheet] Saved with AI metadata:', options.toolName)
            }
        } catch (err) {
            console.error('[UniverSpreadsheet] Failed to save with AI metadata:', err)
        } finally {
            setIsSaving(false)
        }
    }, [fileId, updateFileMutation, setSavingState])

    // Mark as dirty when user makes changes
    const markDirty = React.useCallback(() => {
        isDirtyRef.current = true
    }, [])

    React.useImperativeHandle(ref, () => ({
        save: handleSave,
        getSnapshot: () => workbookRef.current?.save?.() ?? null,
        markDirty,
        saveWithAIMetadata: handleSaveWithAIMetadata
    }))

    // Store data in a ref to avoid re-initialization on every render
    const cachedData = getCachedOrDbData()
    const initialDataRef = React.useRef(cachedData)
    const isInitializedRef = React.useRef(false)
    // Track current ID to detect switches
    const currentIdRef = React.useRef<string | undefined>(effectiveId)

    // Initialize Univer ONCE on mount, dispose ONLY on unmount
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

                await new Promise(resolve => requestAnimationFrame(resolve))

                if (!mounted || !containerRef.current) {
                    console.log('[UniverSpreadsheet] Aborted init - component unmounted during wait')
                    return
                }

                console.log('[UniverSpreadsheet] Initializing sheets instance (one-time)')

                const instance = await initSheetsUniver(containerRef.current)
                versionRef.current = instance.version

                if (!mounted) {
                    const version = versionRef.current
                    setTimeout(() => disposeSheetsUniver(version), 0)
                    return
                }

                const workbook = createWorkbook(instance.univer, instance.api, initialDataRef.current, effectiveDataId)
                workbookRef.current = workbook
                isInitializedRef.current = true
                currentIdRef.current = effectiveId

                console.log('[UniverSpreadsheet] Workbook created:', effectiveDataId)
                setIsLoading(false)

                // Focus the container
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const containerEl = containerRef.current
                        const univerCanvas = containerEl?.querySelector('.univer-render-canvas, [class*="univer-canvas"]')

                        if (!containerEl) return

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

        // Cleanup ONLY on unmount
        return () => {
            mounted = false

            const currentId = currentIdRef.current
            if (workbookRef.current && currentId) {
                try {
                    const snapshot = workbookRef.current.save()
                    if (snapshot) {
                        setSnapshotInCache(currentId, snapshot, isDirtyRef.current)
                        console.log('[UniverSpreadsheet] Cached snapshot on unmount:', currentId, 'isDirty:', isDirtyRef.current)

                        // Trigger async save if dirty
                        if (isDirtyRef.current) {
                            if (useFileSystem) {
                                updateFileMutation.mutate({
                                    id: currentId,
                                    univerData: snapshot,
                                    changeType: 'auto_save',
                                    changeDescription: 'Auto-guardado'
                                })
                            } else {
                                saveArtifactSnapshot.mutate({ id: currentId, univerData: snapshot })
                            }
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

            const version = versionRef.current

            setTimeout(() => {
                if (getSheetsInstanceVersion() === version) {
                    console.log('[UniverSpreadsheet] Deferred dispose executing for version:', version)
                    disposeSheetsUniver(version)
                } else {
                    console.log('[UniverSpreadsheet] Skipping dispose - instance was replaced')
                }
            }, 0)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Only run on mount/unmount

    // Handle ID switches WITHOUT remounting Univer
    React.useEffect(() => {
        if (!isInitializedRef.current) return
        if (currentIdRef.current === effectiveId) return

        console.log('[UniverSpreadsheet] ID switch detected:', currentIdRef.current, '->', effectiveId)

        const instance = getSheetsInstance()
        if (!instance) {
            console.warn('[UniverSpreadsheet] No instance for ID switch')
            return
        }

        // Save current workbook to cache before switching
        const oldId = currentIdRef.current
        if (workbookRef.current && oldId) {
            try {
                const snapshot = workbookRef.current.save()
                if (snapshot) {
                    setSnapshotInCache(oldId, snapshot, isDirtyRef.current)
                    console.log('[UniverSpreadsheet] Cached snapshot before switch:', oldId)
                }
            } catch (err) {
                console.error('[UniverSpreadsheet] Failed to cache before switch:', err)
            }
        }

        currentIdRef.current = effectiveId
        isDirtyRef.current = false

        // Dispose current workbook and create new one
        const currentWorkbook = instance.api.getActiveWorkbook()
        if (currentWorkbook) {
            const unitId = currentWorkbook.getId()
            if (unitId) {
                instance.api.disposeUnit(unitId)
            }
        }

        // Get data for new file/artifact
        const newData = getCachedOrDbData()

        instance.univer.createUnit(UniverInstanceType.UNIVER_SHEET, newData || {
            id: effectiveDataId,
            name: 'Workbook',
            sheetOrder: ['sheet1'],
            sheets: {
                sheet1: {
                    id: 'sheet1',
                    name: 'Sheet1',
                    rowCount: 100,
                    columnCount: 26,
                    cellData: {},
                    defaultColumnWidth: 100,
                    defaultRowHeight: 24,
                }
            }
        })
        workbookRef.current = instance.api.getActiveWorkbook()

        console.log('[UniverSpreadsheet] ID switch completed:', effectiveId)
    }, [effectiveId, effectiveDataId, getCachedOrDbData, setSnapshotInCache])

    // Auto-save with debounce (3 seconds after last edit)
    const autoSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    const triggerAutoSave = React.useCallback(() => {
        if (!effectiveId || !workbookRef.current || isSaving) return

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current)
        }

        autoSaveTimeoutRef.current = setTimeout(async () => {
            try {
                const snapshot = workbookRef.current?.save()
                if (snapshot && effectiveId && isDirtyRef.current) {
                    console.log('[UniverSpreadsheet] Auto-saving...')

                    if (useFileSystem && fileId) {
                        setSavingState(prev => ({ ...prev, [fileId]: true }))
                        await updateFileMutation.mutateAsync({
                            id: fileId,
                            univerData: snapshot,
                            changeType: 'auto_save',
                            changeDescription: 'Auto-guardado'
                        })
                    } else if (artifactId) {
                        await saveArtifactSnapshot.mutateAsync({
                            id: artifactId,
                            univerData: snapshot
                        })
                    }

                    isDirtyRef.current = false
                    console.log('[UniverSpreadsheet] Auto-save completed')
                }
            } catch (err) {
                console.error('[UniverSpreadsheet] Auto-save failed:', err)
            }
        }, 3000)
    }, [effectiveId, useFileSystem, fileId, artifactId, isSaving, updateFileMutation, saveArtifactSnapshot, setSavingState])

    // Track user edits
    React.useEffect(() => {
        if (!effectiveId) return

        const container = containerRef.current
        if (!container) return

        const handleInput = () => {
            isDirtyRef.current = true
            triggerAutoSave()
        }

        container.addEventListener('input', handleInput)
        container.addEventListener('keydown', handleInput)
        container.addEventListener('paste', handleInput)

        return () => {
            container.removeEventListener('input', handleInput)
            container.removeEventListener('keydown', handleInput)
            container.removeEventListener('paste', handleInput)
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current)
            }
        }
    }, [effectiveId, triggerAutoSave])

    // Listen for live updates from AI tools
    React.useEffect(() => {
        if (!effectiveId) return

        const unsubscribe = window.desktopApi?.onArtifactUpdate?.((updateData) => {
            // Handle both artifact and file updates
            const matchesArtifact = updateData.artifactId === artifactId
            const matchesFile = updateData.fileId === fileId
            if (!matchesArtifact && !matchesFile) return
            if (updateData.type !== 'spreadsheet') return

            console.log('[UniverSpreadsheet] Received live update for:', effectiveId)

            const instance = getSheetsInstance()
            if (!instance) {
                console.warn('[UniverSpreadsheet] No Univer instance for live update')
                return
            }

            try {
                const currentWorkbook = instance.api.getActiveWorkbook()
                if (!currentWorkbook) {
                    console.log('[UniverSpreadsheet] No active workbook, creating new one')
                    instance.univer.createUnit(UniverInstanceType.UNIVER_SHEET, updateData.univerData)
                    workbookRef.current = instance.api.getActiveWorkbook()
                    return
                }

                // INCREMENTAL UPDATE
                const univerData = updateData.univerData
                const sheetId = Object.keys(univerData.sheets || {})[0]
                if (!sheetId || !univerData.sheets?.[sheetId]) {
                    console.warn('[UniverSpreadsheet] Invalid univerData structure')
                    return
                }

                const sheetData = univerData.sheets[sheetId]
                const cellData = sheetData.cellData || {}
                const activeSheet = currentWorkbook.getActiveSheet()

                if (!activeSheet) {
                    console.warn('[UniverSpreadsheet] No active sheet for incremental update')
                    return
                }

                const updates: Array<{ row: number; col: number; value: unknown; style?: unknown }> = []

                for (const [rowKey, rowData] of Object.entries(cellData)) {
                    const row = parseInt(rowKey, 10)
                    if (Number.isNaN(row) || !rowData || typeof rowData !== 'object') continue

                    for (const [colKey, cellValue] of Object.entries(rowData as Record<string, unknown>)) {
                        const col = parseInt(colKey, 10)
                        if (Number.isNaN(col)) continue

                        const cell = cellValue as { v?: unknown; s?: unknown } | null
                        if (cell) {
                            updates.push({
                                row,
                                col,
                                value: cell.v,
                                style: cell.s
                            })
                        }
                    }
                }

                if (updates.length > 0) {
                    console.log(`[UniverSpreadsheet] Applying ${updates.length} cell updates incrementally`)

                    const maxRow = Math.max(...updates.map(u => u.row)) + 1
                    const maxCol = Math.max(...updates.map(u => u.col)) + 1

                    const valueMatrix: Record<number, Record<number, unknown>> = {}
                    for (const update of updates) {
                        if (!valueMatrix[update.row]) valueMatrix[update.row] = {}
                        valueMatrix[update.row][update.col] = update.value
                    }

                    try {
                        const range = activeSheet.getRange(0, 0, maxRow, maxCol)
                        if (range && typeof range.setValues === 'function') {
                            range.setValues(valueMatrix)
                        }
                    } catch (rangeErr) {
                        console.warn('[UniverSpreadsheet] setValues failed, falling back:', rangeErr)
                        const unitId = currentWorkbook.getId()
                        if (unitId) {
                            instance.api.disposeUnit(unitId)
                        }
                        instance.univer.createUnit(UniverInstanceType.UNIVER_SHEET, updateData.univerData)
                        workbookRef.current = instance.api.getActiveWorkbook()
                    }
                }

                console.log('[UniverSpreadsheet] Incremental update applied')
            } catch (err) {
                console.error('[UniverSpreadsheet] Failed to apply live update:', err)
            }
        })

        return () => {
            unsubscribe?.()
        }
    }, [effectiveId, artifactId, fileId])

    // Listen for AI tool completion events to save with metadata
    React.useEffect(() => {
        if (!fileId) return

        // @ts-expect-error - desktopApi type extended in preload
        const unsubscribe = window.desktopApi?.onFileSaveWithAIMetadata?.((data: {
            fileId: string;
            tabType: "excel" | "doc";
            aiModel: string;
            aiPrompt: string;
            toolName: string;
        }) => {
            if (data.fileId !== fileId || data.tabType !== 'excel') return

            console.log('[UniverSpreadsheet] Received AI save request:', data.toolName)

            // Get current snapshot and save with AI metadata
            if (workbookRef.current) {
                try {
                    const snapshot = workbookRef.current.save()
                    if (snapshot) {
                        setSavingState(prev => ({ ...prev, [fileId]: true }))
                        updateFileMutation.mutate({
                            id: fileId,
                            univerData: snapshot,
                            changeType: 'ai_edit',
                            changeDescription: `Editado por ${data.toolName}`,
                            aiModel: data.aiModel,
                            aiPrompt: data.aiPrompt,
                            toolName: data.toolName
                        })
                        isDirtyRef.current = false
                        console.log('[UniverSpreadsheet] Saved with AI metadata:', data.toolName)
                    }
                } catch (err) {
                    console.error('[UniverSpreadsheet] Failed to save with AI metadata:', err)
                    setSavingState(prev => ({ ...prev, [fileId]: false }))
                }
            }
        })

        return () => {
            unsubscribe?.()
        }
    }, [fileId, updateFileMutation, setSavingState])

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
            <div
                ref={containerRef}
                className="w-full h-full outline-none"
            />
        </div>
    )
})

UniverSpreadsheet.displayName = 'UniverSpreadsheet'
