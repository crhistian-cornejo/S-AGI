import { memo, useCallback, useEffect, useState, useRef } from 'react'
import { IconLoader2, IconAlertCircle } from '@tabler/icons-react'
import { useRegistry } from '@embedpdf/core/react'
import { useLoaderCapability } from '@embedpdf/plugin-loader/react'
import { useScroll } from '@embedpdf/plugin-scroll/react'
import type { PdfEngine } from '@embedpdf/models'
import { cn } from '@/lib/utils'

interface ThumbnailData {
    pageIndex: number
    blobUrl: string | null
    loading: boolean
    error: boolean
}

interface PdfThumbnailsPanelProps {
    className?: string
}

const THUMBNAIL_WIDTH = 120
const THUMBNAIL_HEIGHT = 160

/**
 * PDF Thumbnails Panel Component
 * Shows miniature previews of all pages for quick navigation
 */
export const PdfThumbnailsPanel = memo(function PdfThumbnailsPanel({
    className
}: PdfThumbnailsPanelProps) {
    const { registry, pluginsReady } = useRegistry()
    const { provides: loaderApi } = useLoaderCapability()
    const { provides: scrollApi, state: scrollState } = useScroll()

    const [thumbnails, setThumbnails] = useState<ThumbnailData[]>([])
    const [pageCount, setPageCount] = useState(0)
    const [isInitializing, setIsInitializing] = useState(true)
    const containerRef = useRef<HTMLDivElement>(null)
    const observerRef = useRef<IntersectionObserver | null>(null)
    const loadingRef = useRef<Set<number>>(new Set())

    // Initialize thumbnails array when document loads
    useEffect(() => {
        if (!loaderApi || !pluginsReady) return

        const doc = loaderApi.getDocument()
        if (!doc) {
            setIsInitializing(true)
            return
        }

        const count = doc.pageCount ?? 0
        setPageCount(count)

        // Initialize all thumbnails as not loaded
        setThumbnails(
            Array.from({ length: count }, (_, i) => ({
                pageIndex: i,
                blobUrl: null,
                loading: false,
                error: false
            }))
        )
        setIsInitializing(false)

        console.log(`[PDF Thumbnails] Initialized ${count} thumbnail slots`)
    }, [loaderApi, pluginsReady])

    // Load a specific thumbnail
    const loadThumbnail = useCallback(async (pageIndex: number) => {
        if (!registry || !loaderApi || !pluginsReady) return
        if (loadingRef.current.has(pageIndex)) return // Already loading

        const doc = loaderApi.getDocument()
        if (!doc) return

        loadingRef.current.add(pageIndex)

        // Mark as loading
        setThumbnails(prev => prev.map((t, i) =>
            i === pageIndex ? { ...t, loading: true } : t
        ))

        try {
            const engine = registry.getEngine() as PdfEngine
            if (!engine) throw new Error('Engine not available')

            // Get the actual page object from the document
            const page = doc.pages?.[pageIndex]
            if (!page) {
                throw new Error(`Page ${pageIndex} not found in document`)
            }

            // Render thumbnail
            const task = engine.renderThumbnail(doc, page, {
                scaleFactor: 2
            })

            const blob = await new Promise<Blob>((resolve, reject) => {
                task.wait(resolve, reject)
            })
            const blobUrl = URL.createObjectURL(blob)

            setThumbnails(prev => prev.map((t, i) =>
                i === pageIndex ? { ...t, blobUrl, loading: false } : t
            ))

            console.log(`[PDF Thumbnails] Loaded thumbnail for page ${pageIndex + 1}`)
        } catch (err) {
            console.error(`[PDF Thumbnails] Error loading page ${pageIndex + 1}:`, err)
            setThumbnails(prev => prev.map((t, i) =>
                i === pageIndex ? { ...t, loading: false, error: true } : t
            ))
        } finally {
            loadingRef.current.delete(pageIndex)
        }
    }, [registry, loaderApi, pluginsReady])

    // Set up IntersectionObserver for lazy loading
    useEffect(() => {
        if (!containerRef.current || thumbnails.length === 0) return

        // Clean up previous observer
        if (observerRef.current) {
            observerRef.current.disconnect()
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const pageIndex = parseInt(
                            entry.target.getAttribute('data-page-index') ?? '-1',
                            10
                        )
                        if (pageIndex >= 0) {
                            const thumb = thumbnails[pageIndex]
                            if (thumb && !thumb.blobUrl && !thumb.loading && !thumb.error) {
                                loadThumbnail(pageIndex)
                            }
                        }
                    }
                }
            },
            {
                root: containerRef.current,
                rootMargin: '100px', // Load thumbnails slightly before they come into view
                threshold: 0
            }
        )

        // Observe all thumbnail containers
        const elements = containerRef.current.querySelectorAll('[data-page-index]')
        elements.forEach(el => observerRef.current?.observe(el))

        return () => {
            observerRef.current?.disconnect()
        }
    }, [thumbnails, loadThumbnail])

    // Scroll to current page thumbnail when page changes
    useEffect(() => {
        if (!containerRef.current || !scrollState.currentPage) return

        const currentPageIndex = scrollState.currentPage - 1
        const targetElement = containerRef.current.querySelector(
            `[data-page-index="${currentPageIndex}"]`
        )
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [scrollState.currentPage])

    // Clean up blob URLs on unmount
    useEffect(() => {
        return () => {
            for (const thumb of thumbnails) {
                if (thumb.blobUrl) {
                    URL.revokeObjectURL(thumb.blobUrl)
                }
            }
        }
    }, []) // Only on unmount

    // Handle thumbnail click - navigate to page
    const handleThumbnailClick = useCallback((pageIndex: number) => {
        if (scrollApi) {
            const pageNumber = pageIndex + 1
            console.log(`[PDF Thumbnails] Navigating to page ${pageNumber}`)
            scrollApi.scrollToPage({
                pageNumber,
                behavior: 'smooth'
            })
        }
    }, [scrollApi])

    if (isInitializing) {
        return (
            <div className={cn("flex items-center justify-center h-full", className)}>
                <IconLoader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (pageCount === 0) {
        return (
            <div className={cn("flex items-center justify-center h-full text-sm text-muted-foreground", className)}>
                No pages
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className={cn(
                "flex flex-col gap-2 p-2 overflow-y-auto",
                className
            )}
        >
            {/* Header */}
            <div className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
                Pages ({pageCount})
            </div>

            {/* Thumbnail grid */}
            <div className="grid grid-cols-1 gap-2">
                {thumbnails.map((thumb) => (
                    <button
                        key={thumb.pageIndex}
                        type="button"
                        data-page-index={thumb.pageIndex}
                        className={cn(
                            "relative flex flex-col items-center p-1 rounded-lg transition-all hover:bg-muted/50 cursor-pointer",
                            scrollState.currentPage === thumb.pageIndex + 1 && "ring-2 ring-primary bg-primary/5"
                        )}
                        onClick={() => handleThumbnailClick(thumb.pageIndex)}
                    >
                        {/* Thumbnail container */}
                        <div
                            className="relative bg-white rounded shadow-sm overflow-hidden"
                            style={{
                                width: THUMBNAIL_WIDTH,
                                height: THUMBNAIL_HEIGHT
                            }}
                        >
                            {thumb.blobUrl ? (
                                <img
                                    src={thumb.blobUrl}
                                    alt={`Page ${thumb.pageIndex + 1}`}
                                    className="w-full h-full object-contain"
                                    loading="lazy"
                                />
                            ) : thumb.loading ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <IconLoader2 size={20} className="animate-spin text-muted-foreground" />
                                </div>
                            ) : thumb.error ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <IconAlertCircle size={20} className="text-muted-foreground/50" />
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-2xl font-light text-muted-foreground/30">
                                        {thumb.pageIndex + 1}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Page number */}
                        <span className={cn(
                            "mt-1 text-xs tabular-nums",
                            scrollState.currentPage === thumb.pageIndex + 1
                                ? "font-medium text-primary"
                                : "text-muted-foreground"
                        )}>
                            {thumb.pageIndex + 1}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    )
})
