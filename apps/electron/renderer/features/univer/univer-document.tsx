import * as React from 'react'
import { useAtom } from 'jotai'
import { trpc } from '@/lib/trpc'
import { initDocsUniver, createDocument, disposeDocsUniver, getDocsInstanceVersion } from './univer-docs-core'
import { artifactSnapshotCacheAtom, type ArtifactSnapshot } from '@/lib/atoms'

interface UniverDocumentProps {
    artifactId?: string
    data?: any
}

export interface UniverDocumentRef {
    save: () => Promise<void>
    getContent: () => any
    markDirty: () => void
}

export const UniverDocument = React.forwardRef<UniverDocumentRef, UniverDocumentProps>(({
    artifactId,
    data
}, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [isSaving, setIsSaving] = React.useState(false)
    const documentRef = React.useRef<any>(null)
    const versionRef = React.useRef<number>(-1)
    const isDirtyRef = React.useRef(false)

    // Snapshot cache for persistence across tab switches
    const [snapshotCache, setSnapshotCache] = useAtom(artifactSnapshotCacheAtom)

    // Generate a stable instance ID
    const instanceIdRef = React.useRef<string>(`document-${Date.now()}`)
    const instanceId = instanceIdRef.current

    // Use artifact ID for data purposes
    const effectiveDataId = artifactId ?? instanceId

    // Check if we have a cached snapshot that's newer than the DB data
    const getCachedOrDbData = React.useCallback(() => {
        if (!artifactId) return data
        const cached = snapshotCache[artifactId]
        if (cached && cached.isDirty) {
            console.log('[UniverDocument] Using cached snapshot (dirty)', artifactId)
            return cached.univerData
        }
        return data
    }, [artifactId, data, snapshotCache])

    // Debug: log received data
    React.useEffect(() => {
        console.log('[UniverDocument] Mounted with data:', {
            artifactId,
            hasData: !!data,
            hasCachedData: artifactId ? !!snapshotCache[artifactId] : false,
            dataKeys: data ? Object.keys(data) : [],
            bodyLength: data?.body?.dataStream?.length
        })
    }, [artifactId, data, snapshotCache])

    // Save mutation
    const saveSnapshot = trpc.artifacts.saveUniverSnapshot.useMutation()

    const handleSave = React.useCallback(async () => {
        if (!documentRef.current || isSaving) return

        try {
            setIsSaving(true)
            const snapshot = documentRef.current.save()

            if (snapshot && artifactId) {
                await saveSnapshot.mutateAsync({
                    id: artifactId,
                    univerData: snapshot
                })
            }
        } catch (err) {
            console.error('Failed to save document:', err)
        } finally {
            setIsSaving(false)
        }
    }, [artifactId, isSaving, saveSnapshot])

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
        markDirty
    }))

    // Use cached data if available
    const effectiveData = getCachedOrDbData()

    // Initialize Univer on mount, dispose on unmount
    React.useEffect(() => {
        let mounted = true

        const initUniverDocs = async () => {
            if (!containerRef.current) {
                return
            }

            try {
                setIsLoading(true)
                setError(null)

                console.log('[UniverDocument] Initializing docs instance')

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
                const doc = createDocument(instance.api, effectiveData, effectiveDataId)
                documentRef.current = doc

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

        // Cleanup on unmount - save to cache and defer dispose
        return () => {
            mounted = false

            // AUTOGUARDADO: Save current state to cache before unmounting
            if (documentRef.current && artifactId) {
                try {
                    const snapshot = documentRef.current.save()
                    if (snapshot) {
                        // Cache the current state
                        const cacheEntry: ArtifactSnapshot = {
                            univerData: snapshot,
                            timestamp: Date.now(),
                            isDirty: isDirtyRef.current
                        }
                        setSnapshotCache(prev => ({
                            ...prev,
                            [artifactId]: cacheEntry
                        }))
                        console.log('[UniverDocument] Cached snapshot on unmount:', artifactId, 'isDirty:', isDirtyRef.current)

                        // If dirty, also trigger async save to DB
                        if (isDirtyRef.current) {
                            saveSnapshot.mutate({ id: artifactId, univerData: snapshot })
                            console.log('[UniverDocument] Triggered async save to DB')
                        }
                    }
                } catch (err) {
                    console.error('[UniverDocument] Failed to cache snapshot:', err)
                }
            }

            documentRef.current = null
            isDirtyRef.current = false

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
    }, [effectiveDataId, effectiveData, artifactId, setSnapshotCache, saveSnapshot])

    // Auto-save with debounce (3 seconds after last edit)
    const autoSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    const triggerAutoSave = React.useCallback(() => {
        if (!artifactId || !documentRef.current || isSaving) return

        // Clear existing timeout
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current)
        }

        // Set new timeout for auto-save
        autoSaveTimeoutRef.current = setTimeout(async () => {
            try {
                const snapshot = documentRef.current?.save()
                if (snapshot && artifactId && isDirtyRef.current) {
                    console.log('[UniverDocument] Auto-saving...')
                    await saveSnapshot.mutateAsync({
                        id: artifactId,
                        univerData: snapshot
                    })
                    isDirtyRef.current = false
                    console.log('[UniverDocument] Auto-save completed')
                }
            } catch (err) {
                console.error('[UniverDocument] Auto-save failed:', err)
            }
        }, 3000) // 3 seconds debounce
    }, [artifactId, isSaving, saveSnapshot])

    // Track user edits to mark as dirty and trigger auto-save
    React.useEffect(() => {
        if (!artifactId) return

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
    }, [artifactId, isLoading, triggerAutoSave])

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
