import * as React from 'react'
import { useAtom } from 'jotai'
import { trpc } from '@/lib/trpc'
import { initDocsUniver, createDocument, disposeDocsUniver, getDocsInstanceVersion, getDocsInstance } from './univer-docs-core'
import { artifactSnapshotCacheAtom, type ArtifactSnapshot } from '@/lib/atoms'
import {
    fileSnapshotCacheAtom,
    type FileSnapshot,
    fileSavingAtom,
} from '@/lib/atoms/user-files'
import { UniverInstanceType } from '@univerjs/core'

interface UniverDocumentProps {
    // Legacy: artifact-based props (for backward compatibility)
    artifactId?: string
    data?: any
    // New: file-based props
    fileId?: string
    fileData?: any
    // Optional: callback when version is created
    onVersionCreated?: (versionNumber: number) => void
}

export interface UniverDocumentRef {
    save: () => Promise<void>
    getContent: () => any
    markDirty: () => void
    // New: save with AI metadata for Agent Panel
    saveWithAIMetadata: (options: {
        aiModel: string
        aiPrompt: string
        toolName: string
    }) => Promise<void>
}

export const UniverDocument = React.forwardRef<UniverDocumentRef, UniverDocumentProps>(({
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
    const documentRef = React.useRef<any>(null)
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

    // Generate a stable instance ID
    const instanceIdRef = React.useRef<string>(`document-${Date.now()}`)
    const effectiveDataId = effectiveId ?? instanceIdRef.current

    // Track current ID to detect switches
    const currentIdRef = React.useRef<string | undefined>(effectiveId)
    const isInitializedRef = React.useRef(false)

    // Track when we received DB data from props (for cache comparison)
    const dbDataTimestampRef = React.useRef<number>(Date.now())
    React.useEffect(() => {
        // Update timestamp whenever effectiveData changes from props
        dbDataTimestampRef.current = Date.now()
    }, [effectiveData])

    // Check if we have a cached snapshot that's newer than the DB data
    // FIXED: Always prefer cache if it exists and is recent, not just when dirty
    const getCachedOrDbData = React.useCallback(() => {
        if (!effectiveId) return effectiveData
        const cached = getSnapshotCache()

        if (cached) {
            // Use cache if:
            // 1. It's marked as dirty (has unsaved changes), OR
            // 2. It's newer than when we received DB data (race condition protection)
            const isCacheNewer = cached.timestamp > dbDataTimestampRef.current - 1000 // 1s tolerance
            const shouldUseCache = cached.isDirty || isCacheNewer

            if (shouldUseCache) {
                console.log('[UniverDocument] Using cached snapshot:', effectiveId, {
                    isDirty: cached.isDirty,
                    isCacheNewer,
                    cacheTime: new Date(cached.timestamp).toISOString(),
                })
                return cached.univerData
            }
        }

        return effectiveData
    }, [effectiveId, effectiveData, getSnapshotCache])

    // Debug: log received data
    React.useEffect(() => {
        console.log('[UniverDocument] Mounted with:', {
            mode: useFileSystem ? 'file' : 'artifact',
            effectiveId,
            hasData: !!effectiveData,
            hasCachedData: !!getSnapshotCache(),
            dataKeys: effectiveData ? Object.keys(effectiveData) : [],
            bodyLength: effectiveData?.body?.dataStream?.length
        })
    }, [useFileSystem, effectiveId, effectiveData, getSnapshotCache])

    // === MUTATIONS ===
    // Legacy: Artifact save mutation (with proper error handling)
    const saveArtifactSnapshot = trpc.artifacts.saveUniverSnapshot.useMutation({
        onSuccess: (_result, variables) => {
            const savedId = variables.id
            if (savedId) {
                console.log('[UniverDocument] Artifact save confirmed:', savedId)
                // Clear dirty flag in artifact cache
                setArtifactSnapshotCache(prev => {
                    const existing = prev[savedId]
                    if (existing) {
                        return {
                            ...prev,
                            [savedId]: { ...existing, isDirty: false }
                        }
                    }
                    return prev
                })
            }
        },
        onError: (error, variables) => {
            const failedId = variables.id
            console.error('[UniverDocument] Artifact save failed, keeping dirty flag:', failedId, error)
            // Keep dirty flag TRUE on error
            if (failedId) {
                setArtifactSnapshotCache(prev => {
                    const existing = prev[failedId]
                    if (existing && !existing.isDirty) {
                        return {
                            ...prev,
                            [failedId]: { ...existing, isDirty: true }
                        }
                    }
                    return prev
                })
            }
        }
    })

    // New: File update mutation
    const updateFileMutation = trpc.userFiles.update.useMutation({
        onSuccess: (result, variables) => {
            // Use the ID from the mutation variables, not from current fileId
            // This handles race conditions where fileId changed during save
            const savedId = variables.id
            if (savedId) {
                setSavingState(prev => ({ ...prev, [savedId]: false }))
                // Clear dirty flag in cache - save confirmed
                setFileSnapshotCache(prev => {
                    const existing = prev[savedId]
                    if (existing) {
                        console.log('[UniverDocument] DB save confirmed, clearing dirty flag:', savedId)
                        return {
                            ...prev,
                            [savedId]: { ...existing, isDirty: false }
                        }
                    }
                    return prev
                })
            }
            if (onVersionCreated && result?.version_count) {
                onVersionCreated(result.version_count)
            }
        },
        onError: (error, variables) => {
            const failedId = variables.id
            console.error('[UniverDocument] DB save failed, keeping dirty flag:', failedId, error)
            if (failedId) {
                setSavingState(prev => ({ ...prev, [failedId]: false }))
                // IMPORTANT: Keep dirty flag TRUE on error so data isn't lost
                setFileSnapshotCache(prev => {
                    const existing = prev[failedId]
                    if (existing && !existing.isDirty) {
                        return {
                            ...prev,
                            [failedId]: { ...existing, isDirty: true }
                        }
                    }
                    return prev
                })
            }
        }
    })

    // Handle save (unified for both modes)
    const handleSave = React.useCallback(async () => {
        if (!documentRef.current || isSaving || !effectiveId) return

        try {
            setIsSaving(true)
            const snapshot = documentRef.current.save()

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
            console.error('Failed to save document:', err)
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
        if (!documentRef.current || !fileId) {
            console.warn('[UniverDocument] Cannot save with AI metadata - no fileId or document')
            return
        }

        try {
            setIsSaving(true)
            setSavingState(prev => ({ ...prev, [fileId]: true }))

            const snapshot = documentRef.current.save()

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
                console.log('[UniverDocument] Saved with AI metadata:', options.toolName)
            }
        } catch (err) {
            console.error('[UniverDocument] Failed to save with AI metadata:', err)
        } finally {
            setIsSaving(false)
        }
    }, [fileId, updateFileMutation, setSavingState])

    const getContent = React.useCallback(() => {
        if (documentRef.current) {
            return documentRef.current.save()
        }
        return null
    }, [])

    // Mark as dirty when user makes changes
    const markDirty = React.useCallback(() => {
        isDirtyRef.current = true
    }, [])

    React.useImperativeHandle(ref, () => ({
        save: handleSave,
        getContent,
        markDirty,
        saveWithAIMetadata: handleSaveWithAIMetadata
    }))

    // Store data in a ref to avoid re-initialization on every render
    const cachedData = getCachedOrDbData()
    const initialDataRef = React.useRef(cachedData)

    // Initialize Univer ONCE on mount, dispose ONLY on unmount
    React.useEffect(() => {
        let mounted = true

        const initUniverDocs = async () => {
            if (!containerRef.current) {
                return
            }

            if (isInitializedRef.current) return

            try {
                setIsLoading(true)
                setError(null)

                await new Promise(resolve => requestAnimationFrame(resolve))

                if (!mounted || !containerRef.current) {
                    console.log('[UniverDocument] Aborted init - component unmounted during wait')
                    return
                }

                console.log('[UniverDocument] Initializing docs instance (one-time)')

                // Get the docs Univer instance
                const instance = await initDocsUniver(containerRef.current)

                // Store version for cleanup
                versionRef.current = instance.version

                if (!mounted) {
                    // Component unmounted during init - defer dispose with version check
                    const version = versionRef.current
                    setTimeout(() => disposeDocsUniver(version), 0)
                    return
                }

                // Create document with data (use cached if available)
                const doc = createDocument(instance.api, initialDataRef.current, effectiveDataId)
                documentRef.current = doc
                isInitializedRef.current = true
                currentIdRef.current = effectiveId

                console.log('[UniverDocument] Document created:', effectiveDataId)
                setIsLoading(false)

            } catch (err) {
                console.error('Failed to initialize Univer Docs:', err)
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Failed to load document')
                    setIsLoading(false)
                }
            }
        }

        initUniverDocs()

        // Cleanup ONLY on unmount
        return () => {
            mounted = false

            const currentId = currentIdRef.current
            const wasDirty = isDirtyRef.current

            if (documentRef.current && currentId) {
                try {
                    const snapshot = documentRef.current.save()
                    if (snapshot) {
                        // CRITICAL FIX: Always save to cache with isDirty: true when unmounting
                        // The cache will be cleared by mutation onSuccess if/when DB save succeeds
                        // This prevents data loss if tab switch happens before DB save completes
                        setSnapshotInCache(currentId, snapshot, true)
                        console.log('[UniverDocument] Cached snapshot on unmount:', currentId, 'wasDirty:', wasDirty)

                        // Trigger async save to DB (fire and forget)
                        // The mutation's onSuccess will clear the dirty flag in cache
                        if (wasDirty) {
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
                            console.log('[UniverDocument] Triggered async save to DB')
                        } else {
                            // Even if not dirty, still mark cache as clean after a delay
                            setTimeout(() => {
                                setSnapshotInCache(currentId, snapshot, false)
                            }, 2000)
                        }
                    }
                } catch (err) {
                    console.error('[UniverDocument] Failed to cache snapshot:', err)
                }
            }

            documentRef.current = null
            isInitializedRef.current = false
            // NOTE: Don't reset isDirtyRef here - it's no longer relevant after unmount

            // Capture version at cleanup time
            const version = versionRef.current

            // Defer the dispose to next tick to avoid "synchronously unmount during render" error
            // Version check ensures we don't dispose a newer instance
            setTimeout(() => {
                // Only dispose if current instance matches our version
                if (getDocsInstanceVersion() === version) {
                    console.log('[UniverDocument] Deferred dispose executing for version:', version)
                    disposeDocsUniver(version)
                } else {
                    console.log('[UniverDocument] Skipping dispose - instance was replaced')
                }
            }, 0)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Only run on mount/unmount

    // Handle ID switches WITHOUT remounting Univer
    React.useEffect(() => {
        if (!isInitializedRef.current) return
        if (currentIdRef.current === effectiveId) return

        console.log('[UniverDocument] ID switch detected:', currentIdRef.current, '->', effectiveId)

        const instance = getDocsInstance()
        if (!instance) {
            console.warn('[UniverDocument] No instance for ID switch')
            return
        }

        // Save current document to cache AND DB before switching
        const oldId = currentIdRef.current
        const wasDirty = isDirtyRef.current
        if (documentRef.current && oldId) {
            try {
                const snapshot = documentRef.current.save()
                if (snapshot) {
                    // Always mark as dirty in cache until DB confirms save
                    setSnapshotInCache(oldId, snapshot, true)
                    console.log('[UniverDocument] Cached snapshot before switch:', oldId, 'wasDirty:', wasDirty)

                    // Trigger async DB save if there were changes
                    if (wasDirty) {
                        if (useFileSystem) {
                            updateFileMutation.mutate({
                                id: oldId,
                                univerData: snapshot,
                                changeType: 'auto_save',
                                changeDescription: 'Auto-guardado antes de cambio'
                            })
                        } else {
                            saveArtifactSnapshot.mutate({ id: oldId, univerData: snapshot })
                        }
                        console.log('[UniverDocument] Triggered DB save before switch:', oldId)
                    }
                }
            } catch (err) {
                console.error('[UniverDocument] Failed to cache before switch:', err)
            }
        }

        currentIdRef.current = effectiveId
        isDirtyRef.current = false // Reset for new file

        // Dispose current document and create new one
        const currentDoc = instance.api.getActiveDocument?.()
        if (currentDoc) {
            const unitId = currentDoc.getId?.()
            if (unitId) {
                instance.api.disposeUnit?.(unitId)
            }
        }

        // Get data for new file/artifact
        const newData = getCachedOrDbData()

        instance.univer.createUnit(UniverInstanceType.UNIVER_DOC, newData || {
            id: effectiveDataId,
            body: {
                dataStream: '\r\n',
                paragraphs: [{ startIndex: 0 }]
            },
            documentStyle: {}
        })
        documentRef.current = instance.api.getActiveDocument?.()

        console.log('[UniverDocument] ID switch completed:', effectiveId)
    }, [effectiveId, effectiveDataId, getCachedOrDbData, setSnapshotInCache])

    // Auto-save with debounce (3 seconds after last edit)
    const autoSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    const triggerAutoSave = React.useCallback(() => {
        if (!effectiveId || !documentRef.current || isSaving) return

        // Clear existing timeout
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current)
        }

        // Set new timeout for auto-save
        autoSaveTimeoutRef.current = setTimeout(async () => {
            try {
                const snapshot = documentRef.current?.save()
                if (snapshot && effectiveId && isDirtyRef.current) {
                    console.log('[UniverDocument] Auto-saving...')

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
                    console.log('[UniverDocument] Auto-save completed')
                }
            } catch (err) {
                console.error('[UniverDocument] Auto-save failed:', err)
            }
        }, 3000) // 3 seconds debounce
    }, [effectiveId, useFileSystem, fileId, artifactId, isSaving, updateFileMutation, saveArtifactSnapshot, setSavingState])

    // Track user edits to mark as dirty and trigger auto-save
    React.useEffect(() => {
        if (!effectiveId) return

        // Mark dirty on any keyboard input in the container
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
            // Clear timeout on cleanup
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current)
            }
        }
    }, [effectiveId, triggerAutoSave])

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
            if (data.fileId !== fileId || data.tabType !== 'doc') return

            console.log('[UniverDocument] Received AI save request:', data.toolName)

            // Get current snapshot and save with AI metadata
            if (documentRef.current) {
                try {
                    const snapshot = documentRef.current.save()
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
                        console.log('[UniverDocument] Saved with AI metadata:', data.toolName)
                    }
                } catch (err) {
                    console.error('[UniverDocument] Failed to save with AI metadata:', err)
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
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading document...</span>
                    </div>
                </div>
            )}
            <div ref={containerRef} className="w-full h-full" />
        </div>
    )
})

UniverDocument.displayName = 'UniverDocument'
