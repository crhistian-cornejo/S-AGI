import * as React from 'react'
import { trpc } from '@/lib/trpc'
import { initDocsUniver, createDocument, disposeDocsUniver, getDocsInstanceVersion } from './univer-docs-core'

interface UniverDocumentProps {
    artifactId?: string
    data?: any
}

export interface UniverDocumentRef {
    save: () => Promise<void>
    getContent: () => any
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

    // Generate a stable instance ID
    const instanceIdRef = React.useRef<string>(`document-${Date.now()}`)
    const instanceId = instanceIdRef.current

    // Use artifact ID for data purposes
    const effectiveDataId = artifactId ?? instanceId

    // Debug: log received data
    React.useEffect(() => {
        console.log('[UniverDocument] Mounted with data:', {
            artifactId,
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : [],
            bodyLength: data?.body?.dataStream?.length
        })
    }, [artifactId, data])

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

    React.useImperativeHandle(ref, () => ({
        save: handleSave,
        getContent
    }))

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

                // Create document with data
                const doc = createDocument(instance.api, data, effectiveDataId)
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

        // Cleanup on unmount - defer dispose with version check
        return () => {
            mounted = false
            documentRef.current = null
            
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
    }, [effectiveDataId, data])

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
