import { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage, type RenderPageProps } from '@embedpdf/plugin-scroll/react'
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { ZoomPluginPackage, useZoomCapability } from '@embedpdf/plugin-zoom/react'
import {
    InteractionManagerPluginPackage,
    PagePointerProvider,
    GlobalPointerProvider
} from '@embedpdf/plugin-interaction-manager/react'
import { SelectionPluginPackage, SelectionLayer, CopyToClipboard } from '@embedpdf/plugin-selection/react'
import { HistoryPluginPackage, useHistoryCapability } from '@embedpdf/plugin-history/react'
import {
    AnnotationPluginPackage,
    useAnnotationCapability,
    AnnotationLayer,
    type AnnotationState
} from '@embedpdf/plugin-annotation/react'
import { PdfAnnotationSubtype } from '@embedpdf/models'
import type { ZoomChangeEvent, ZoomState } from '@embedpdf/plugin-zoom'
import {
    IconZoomIn,
    IconZoomOut,
    IconZoomReset,
    IconHighlight,
    IconPencil,
    IconSquare,
    IconCircle,
    IconArrowBackUp,
    IconArrowForwardUp,
    IconTrash,
    IconPointer,
    IconLoader2,
    IconAlertTriangle,
    IconFileTypePdf,
    IconUnderline,
    IconStrikethrough,
    IconLine,
    IconTextCaption,
    IconSignature,
    IconDownload,
    IconBrush,
    IconCopy,
    IconSearch,
    IconLayoutSidebarRight
} from '@tabler/icons-react'
import type { TrackedAnnotation } from '@embedpdf/plugin-annotation'
import { useSelectionCapability } from '@embedpdf/plugin-selection/react'
import { cn, isElectron } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from '@/components/ui/popover'
import {
    pdfCurrentPageAtom,
    pdfZoomLevelAtom,
    localPdfBlobCacheAtom,
    setLocalPdfBlobAtom,
    pdfSearchPanelOpenAtom,
    type PdfSource
} from '@/lib/atoms'
import { PdfSearchPanel } from './components/pdf-search-panel'
import { PdfThumbnailsPanel } from './components/pdf-thumbnails-panel'

interface PdfViewerEnhancedProps {
    source: PdfSource | null
    className?: string
}

/**
 * Enhanced PDF Viewer using EmbedPDF v1.5.0
 * Full annotation support including:
 * - Text markup: highlight, underline, strikeout, squiggly
 * - Shapes: square, circle, line, polyline, polygon
 * - Drawing: ink (pen), inkHighlighter
 * - Text: freeText
 * - Stamps/Signatures: stamp
 */
export const PdfViewerEnhanced = memo(function PdfViewerEnhanced({
    source,
    className
}: PdfViewerEnhancedProps) {
    const [, setCurrentPage] = useAtom(pdfCurrentPageAtom)
    const [, setZoomLevel] = useAtom(pdfZoomLevelAtom)
    const [blobCache] = useAtom(localPdfBlobCacheAtom)
    const setLocalPdfBlob = useSetAtom(setLocalPdfBlobAtom)
    const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null)
    const [loadingLocal, setLoadingLocal] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)

    // Extract values for dependency array
    const sourceType = source?.type
    const localPath = source?.metadata?.localPath

    // Load local PDF file via IPC (with caching)
    useEffect(() => {
        // Reset state when source changes
        setLocalPdfUrl(null)
        setLocalError(null)

        // For local files in Electron, check cache first, then read via IPC
        if (sourceType === 'local' && localPath && isElectron()) {
            // Check if we have a cached blob URL
            const cachedUrl = blobCache[localPath]
            if (cachedUrl) {
                console.log('[PDF Local] Using cached blob URL for:', localPath)
                setLocalPdfUrl(cachedUrl)
                return
            }

            console.log('[PDF Local] Starting to load:', localPath)
            setLoadingLocal(true)

            const loadLocalPdf = async () => {
                const startTime = performance.now()
                try {
                    const api = window.desktopApi

                    if (!api?.pdf?.readLocal) {
                        throw new Error('PDF API not available')
                    }

                    console.log('[PDF Local] Calling IPC readLocal...')
                    const result = await api.pdf.readLocal(localPath)
                    const ipcTime = performance.now() - startTime
                    const sizeStr = result?.size ? `${(result.size / 1024 / 1024).toFixed(2)}MB` : 'unknown'
                    console.log(`[PDF Local] IPC completed in ${ipcTime.toFixed(0)}ms, size: ${sizeStr}`)

                    if (result?.success && result.data) {
                        // Convert base64 to blob URL using more efficient method
                        const convertStart = performance.now()

                        // Use fetch to decode base64 more efficiently
                        const dataUrl = `data:application/pdf;base64,${result.data}`
                        const response = await fetch(dataUrl)
                        const blob = await response.blob()

                        const convertTime = performance.now() - convertStart
                        console.log(`[PDF Local] Base64 conversion took ${convertTime.toFixed(0)}ms`)

                        const url = URL.createObjectURL(blob)

                        // Cache the blob URL for future use
                        setLocalPdfBlob({ localPath, blobUrl: url })
                        setLocalPdfUrl(url)

                        const totalTime = performance.now() - startTime
                        console.log(`[PDF Local] Total load time: ${totalTime.toFixed(0)}ms`)
                    } else {
                        console.error('[PDF Local] Failed:', result?.error)
                        setLocalError(result?.error || 'Failed to load PDF. The file may have been moved or deleted.')
                    }
                } catch (err) {
                    console.error('[PDF Local] Error:', err)
                    setLocalError(err instanceof Error ? err.message : 'Failed to load PDF')
                } finally {
                    setLoadingLocal(false)
                }
            }

            loadLocalPdf()
        }
    }, [sourceType, localPath, blobCache, setLocalPdfBlob])

    // Get PDF URL from source
    const pdfUrl = useMemo(() => {
        if (!source) return null

        // For local files, use the loaded blob URL
        if (source.type === 'local') {
            return localPdfUrl
        }

        // For cloud files, use the URL directly
        return source.url || null
    }, [source, localPdfUrl])

    if (!source) {
        return <EmptyState />
    }

    // Show loading state for local files
    if (source.type === 'local' && loadingLocal) {
        return (
            <div className={cn('flex flex-col h-full bg-muted/30', className)}>
                <div className="flex flex-col items-center justify-center h-full gap-3">
                    <IconLoader2 size={32} className="animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading PDF...</p>
                </div>
            </div>
        )
    }

    // Show error state for local files
    if (source.type === 'local' && localError) {
        return (
            <div className={cn('flex flex-col h-full bg-muted/30', className)}>
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                    <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
                        <IconAlertTriangle size={32} className="text-destructive" />
                    </div>
                    <h3 className="text-lg font-semibold">Failed to load PDF</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md">
                        {localError}
                    </p>
                </div>
            </div>
        )
    }

    if (!pdfUrl) {
        return <EmptyState />
    }

    return (
        <div className={cn('flex flex-col h-full overflow-hidden bg-muted/30', className)}>
            <PdfViewerCore
                pdfUrl={pdfUrl}
                pdfId={source.id}
                onPageChange={setCurrentPage}
                onZoomChange={setZoomLevel}
            />
        </div>
    )
})

interface PdfViewerCoreProps {
    pdfUrl: string
    pdfId: string
    onPageChange?: (page: number) => void
    onZoomChange?: (zoom: number) => void
}

/**
 * Core viewer component with EmbedPDF integration
 */
const PdfViewerCore = memo(function PdfViewerCore({
    pdfUrl,
    pdfId,
}: PdfViewerCoreProps) {
    // Use local WASM file and disable Web Worker to avoid CSP issues in Electron
    const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine({
        worker: false,
        wasmUrl: '/pdfium.wasm'
    })

    // Build plugins configuration with full annotation support
    const plugins = useMemo(() => [
        createPluginRegistration(LoaderPluginPackage, {
            loadingOptions: {
                type: 'url',
                pdfFile: {
                    id: pdfId,
                    url: pdfUrl,
                },
            },
        }),
        createPluginRegistration(ViewportPluginPackage),
        createPluginRegistration(ScrollPluginPackage, {
            pageGap: 16,
        }),
        createPluginRegistration(RenderPluginPackage, {
            withForms: true,
            withAnnotations: true,
        }),
        createPluginRegistration(ZoomPluginPackage, {
            defaultZoomLevel: 1,
            minZoom: 0.25,
            maxZoom: 4,
            zoomStep: 0.25,
        }),
        // Annotation dependencies
        createPluginRegistration(InteractionManagerPluginPackage),
        createPluginRegistration(SelectionPluginPackage),
        createPluginRegistration(HistoryPluginPackage),
        // Annotation plugin with all tools
        createPluginRegistration(AnnotationPluginPackage, {
            annotationAuthor: 'User',
            autoCommit: true,
            selectAfterCreate: true,
            deactivateToolAfterCreate: false,
            colorPresets: [
                '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#F44336',
                '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3',
                '#03A9F4', '#00BCD4', '#009688', '#4CAF50', '#8BC34A',
                '#CDDC39', '#795548', '#9E9E9E', '#607D8B', '#000000'
            ],
        }),
    ], [pdfId, pdfUrl])

    if (engineError) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
                    <IconAlertTriangle size={32} className="text-destructive" />
                </div>
                <h3 className="text-lg font-semibold">Failed to load PDF Engine</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                    {engineError.message}
                </p>
            </div>
        )
    }

    if (engineLoading || !engine) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3">
                <IconLoader2 size={32} className="animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading PDF engine...</p>
            </div>
        )
    }

    return (
        <EmbedPDF engine={engine} plugins={plugins}>
            <CopyToClipboard />
            <PdfViewerContent />
        </EmbedPDF>
    )
})

/**
 * Inner content - must be inside EmbedPDF provider to access hooks
 * Handles keyboard shortcuts for the PDF viewer
 */
const PdfViewerContent = memo(function PdfViewerContent() {
    const viewportContainerRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const { provides: selectionApi } = useSelectionCapability()
    const { provides: annotationApi } = useAnnotationCapability()

    // Panel states
    const [searchPanelOpen, setSearchPanelOpen] = useAtom(pdfSearchPanelOpenAtom)
    const [thumbnailsPanelOpen, setThumbnailsPanelOpen] = useState(false)

    // Keyboard event handler for Escape and other shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape key - clear selection, deselect annotation, deactivate tool
            if (e.key === 'Escape') {
                e.preventDefault()

                // 1. Clear text selection if any
                if (selectionApi) {
                    selectionApi.clear()
                }

                // 2. Deselect any selected annotation
                if (annotationApi) {
                    const selected = annotationApi.getSelectedAnnotation()
                    if (selected) {
                        annotationApi.deselectAnnotation()
                        return
                    }

                    // 3. If no annotation selected, deactivate active tool
                    const activeTool = annotationApi.getActiveTool()
                    if (activeTool) {
                        annotationApi.setActiveTool(null)
                    }
                }
            }

            // Delete key - delete selected annotation
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (annotationApi) {
                    const selected = annotationApi.getSelectedAnnotation()
                    if (selected) {
                        e.preventDefault()
                        annotationApi.deleteAnnotation(
                            selected.object.pageIndex,
                            selected.object.id
                        )
                    }
                }
            }

            // Ctrl/Cmd + C - Copy (text selection is handled by CopyToClipboard component)
            // Ctrl/Cmd + Z - Undo (handled by history plugin)
            // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y - Redo (handled by history plugin)

            // Ctrl/Cmd + F - Open search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault()
                setSearchPanelOpen(true)
            }
        }

        // Add listener to the container so it captures keyboard events when focused
        const container = containerRef.current
        if (container) {
            container.addEventListener('keydown', handleKeyDown)
            // Make container focusable
            container.tabIndex = 0
        }

        // Also add global listener for when focus is elsewhere
        document.addEventListener('keydown', handleKeyDown)

        return () => {
            if (container) {
                container.removeEventListener('keydown', handleKeyDown)
            }
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [selectionApi, annotationApi, setSearchPanelOpen])

    // Focus the container when mounted to capture keyboard events
    useEffect(() => {
        containerRef.current?.focus()
    }, [])

    return (
        <div
            ref={containerRef}
            role="application"
            aria-label="PDF Viewer"
            className="flex flex-col h-full overflow-hidden outline-none"
        >
            {/* Toolbar */}
            <AnnotationToolbar
                onToggleSearch={() => setSearchPanelOpen(!searchPanelOpen)}
                onToggleThumbnails={() => setThumbnailsPanelOpen(!thumbnailsPanelOpen)}
                isSearchOpen={searchPanelOpen}
                isThumbnailsOpen={thumbnailsPanelOpen}
            />

            {/* Search Panel - collapsible at top */}
            {searchPanelOpen && (
                <div className="border-b border-border bg-background shrink-0">
                    <PdfSearchPanel
                        className="max-w-2xl mx-auto"
                        onClose={() => setSearchPanelOpen(false)}
                    />
                </div>
            )}

            {/* Main content area with optional thumbnails sidebar */}
            <div className="flex flex-1 overflow-hidden">
                {/* Text selection floating toolbar - needs viewport ref for coordinate conversion */}
                <TextSelectionToolbar viewportRef={viewportContainerRef} />

                {/* GlobalPointerProvider captures all pointer events for the interaction manager */}
                <div
                    ref={viewportContainerRef}
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        position: 'relative',
                    }}
                >
                    <GlobalPointerProvider>
                        {/* PDF Viewport */}
                        <Viewport
                            style={{
                                flex: 1,
                                backgroundColor: 'hsl(var(--muted) / 0.3)',
                                overflow: 'auto',
                            }}
                        >
                            <Scroller
                                renderPage={(props: RenderPageProps) => (
                                    <PageRenderer {...props} />
                                )}
                            />
                        </Viewport>
                    </GlobalPointerProvider>
                </div>

                {/* Thumbnails Panel - right sidebar */}
                {thumbnailsPanelOpen && (
                    <div className="w-[160px] border-l border-border bg-background shrink-0 overflow-hidden">
                        <PdfThumbnailsPanel className="h-full" />
                    </div>
                )}
            </div>
        </div>
    )
})

/**
 * Page renderer component with RenderLayer, SelectionLayer, and AnnotationLayer
 * PagePointerProvider wraps the interactive layers and captures pointer events
 */
const PageRenderer = memo(function PageRenderer({
    width,
    height,
    pageIndex,
    scale,
    rotation,
}: RenderPageProps) {
    // Calculate original page dimensions (before scaling)
    // These are needed for coordinate transformation in the interaction manager
    const pageWidth = width / scale
    const pageHeight = height / scale

    return (
        <div
            data-page-index={pageIndex}
            style={{
                width,
                height,
                margin: '8px auto',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                borderRadius: '4px',
                overflow: 'visible',
                backgroundColor: 'white',
                position: 'relative',
            }}
        >
            {/* Base PDF render layer - renders the actual PDF page image */}
            <RenderLayer
                pageIndex={pageIndex}
                scale={scale}
            />

            {/* PagePointerProvider - captures all pointer events for interaction
                The provider uses getBoundingClientRect() for actual dimensions
                and scale parameter for coordinate transformation */}
            <PagePointerProvider
                pageIndex={pageIndex}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                rotation={rotation}
                scale={scale}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width,
                    height,
                    cursor: 'text',  // Show text cursor to indicate text is selectable
                }}
            >
                {/* Text selection layer - displays selection highlight rectangles */}
                <SelectionLayer
                    pageIndex={pageIndex}
                    scale={scale}
                />

                {/* Annotation layer - for drawing, shapes, and text annotations */}
                <AnnotationLayer
                    pageIndex={pageIndex}
                    scale={scale}
                    pageWidth={pageWidth}
                    pageHeight={pageHeight}
                    rotation={rotation}
                    selectionOutlineColor="hsl(var(--primary))"
                    selectionMenu={(props) => <AnnotationSelectionMenu {...props} />}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                    }}
                />
            </PagePointerProvider>
        </div>
    )
})

// Color presets for the color picker
const COLOR_PRESETS = [
    '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#F44336',
    '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3',
    '#03A9F4', '#00BCD4', '#009688', '#4CAF50', '#8BC34A',
    '#CDDC39', '#795548', '#9E9E9E', '#607D8B', '#000000'
]

/**
 * Selection menu that appears when an annotation is selected
 * Fixed size, positioned at top-center of selection
 */
interface AnnotationMenuProps {
    annotation: TrackedAnnotation
    selected: boolean
    rect: { origin: { x: number; y: number }; size: { width: number; height: number } }
    menuWrapperProps: { style: React.CSSProperties }
}

const AnnotationSelectionMenu = memo(function AnnotationSelectionMenu({
    annotation,
    selected,
    rect,
}: AnnotationMenuProps) {
    const { provides: annotationApi } = useAnnotationCapability()
    const [showColorPicker, setShowColorPicker] = useState(false)

    if (!selected) return null

    // Get current annotation color for the indicator
    const currentColor = (annotation.object as { color?: string }).color || '#FFEB3B'

    const handleDelete = () => {
        if (annotationApi) {
            annotationApi.deleteAnnotation(
                annotation.object.pageIndex,
                annotation.object.id
            )
        }
    }

    const handleDuplicate = () => {
        // TODO: Implement duplicate functionality
        console.log('Duplicate annotation:', annotation.object.id)
    }

    const handleColorChange = (color: string) => {
        if (annotationApi) {
            annotationApi.updateAnnotation(
                annotation.object.pageIndex,
                annotation.object.id,
                { color }
            )
        }
        setShowColorPicker(false)
    }

    // Calculate position: center-top of the annotation
    const menuLeft = rect.origin.x + rect.size.width / 2
    const menuTop = rect.origin.y

    return (
        <div
            role="toolbar"
            aria-label="Annotation actions"
            className="absolute z-[100] pointer-events-auto"
            style={{
                left: menuLeft,
                top: menuTop,
                transform: 'translate(-50%, -100%) translateY(-8px)',
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-1 bg-zinc-800 rounded-full shadow-2xl px-2 py-1.5 border border-zinc-700">
                {/* Color picker with current color indicator */}
                <Popover open={showColorPicker} onOpenChange={setShowColorPicker}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-700 transition-colors"
                        >
                            <div
                                className="w-4 h-4 rounded-full border-2 border-white/30"
                                style={{ backgroundColor: currentColor }}
                            />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-auto p-3 bg-zinc-800 border-zinc-700"
                        align="center"
                        side="top"
                        sideOffset={8}
                    >
                        <div className="grid grid-cols-5 gap-2">
                            {COLOR_PRESETS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    className={cn(
                                        "w-6 h-6 rounded-full transition-all hover:scale-110",
                                        currentColor === color && "ring-2 ring-white ring-offset-2 ring-offset-zinc-800"
                                    )}
                                    style={{ backgroundColor: color }}
                                    onClick={() => handleColorChange(color)}
                                />
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Duplicate */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-700 transition-colors text-zinc-300 hover:text-white"
                            onClick={handleDuplicate}
                        >
                            <IconCopy size={15} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-900 text-white border-zinc-700">
                        Duplicate
                    </TooltipContent>
                </Tooltip>

                {/* Separator */}
                <div className="w-px h-5 bg-zinc-600 mx-0.5" />

                {/* Delete */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors text-zinc-300 hover:text-red-400"
                            onClick={handleDelete}
                        >
                            <IconTrash size={15} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-900 text-white border-zinc-700">
                        Delete
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    )
})

/**
 * Floating toolbar for text selection actions
 * Appears when text is selected, allows highlight, underline, strikeout, copy
 */
interface TextSelectionToolbarProps {
    viewportRef: React.RefObject<HTMLDivElement | null>
}

// Store selection data to prevent loss when interacting with toolbar
// We store the result of getFormattedSelection() directly
interface CachedSelection {
    // The formatted selection from the SDK (opaque to avoid type issues)
    // biome-ignore lint/suspicious/noExplicitAny: SDK type compatibility
    formatted: any[]
}

const TextSelectionToolbar = memo(function TextSelectionToolbar({
    viewportRef
}: TextSelectionToolbarProps) {
    const { provides: selectionApi } = useSelectionCapability()
    const { provides: annotationApi } = useAnnotationCapability()
    const { provides: zoomApi } = useZoomCapability()
    const [showToolbar, setShowToolbar] = useState(false)
    const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 })
    const [isProcessing, setIsProcessing] = useState(false)
    // Cache selection data so it's not lost when clicking toolbar buttons
    const cachedSelectionRef = useRef<CachedSelection | null>(null)
    // Track if we have an active selection (for position updates during zoom)
    const hasSelectionRef = useRef(false)

    // Function to find and update toolbar position based on selection highlights
    const updateToolbarPosition = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) return false

        const allDivs = viewport.querySelectorAll('div')
        let bestRect: DOMRect | null = null

        // Helper to update best rect
        const checkRect = (domRect: DOMRect) => {
            if (domRect.width > 2 && domRect.height > 2) {
                if (!bestRect || domRect.top < bestRect.top) {
                    bestRect = domRect
                }
            }
        }

        // First pass: check inline styles
        allDivs.forEach(div => {
            const style = div.style
            // Check if this is a selection highlight div (has the blue background)
            if (style.background?.includes('33,150,243')) {
                checkRect(div.getBoundingClientRect())
            }
            // Also check for mixBlendMode container (the bounding box of all selections)
            if (style.mixBlendMode === 'multiply' && style.isolation === 'isolate') {
                checkRect(div.getBoundingClientRect())
            }
        })

        if (bestRect) {
            const rect = bestRect as DOMRect
            setToolbarPosition({
                x: rect.left + rect.width / 2,
                y: rect.top
            })
            return true
        }

        // Last fallback: use computed style to find any highlighted elements
        allDivs.forEach(div => {
            const computed = window.getComputedStyle(div)
            const bg = computed.backgroundColor
            // Check for blue-ish background (33, 150, 243 is the default selection color)
            // Also check for rgba format
            if (bg && (bg.includes('33, 150, 243') || bg.includes('33,150,243') || bg.includes('rgb(33, 150, 243)'))) {
                checkRect(div.getBoundingClientRect())
            }
        })

        if (bestRect) {
            const rect = bestRect as DOMRect
            setToolbarPosition({
                x: rect.left + rect.width / 2,
                y: rect.top
            })
            return true
        }

        return false
    }, [viewportRef])

    useEffect(() => {
        if (!selectionApi) return

        const unsubscribe = selectionApi.onSelectionChange((selection) => {
            if (selection) {
                // Cache the selection data immediately
                try {
                    const formatted = selectionApi.getFormattedSelection()
                    if (formatted.length > 0) {
                        // Store formatted selection directly
                        cachedSelectionRef.current = { formatted }
                        console.log('[PDF Toolbar] Selection cached:', formatted.length, 'items')
                    }
                } catch (error) {
                    // Selection might not be ready yet
                    console.log('[PDF Toolbar] Could not cache selection:', error)
                }

                // Wait for the DOM to update with selection highlights
                // Use triple RAF to ensure the SelectionLayer has rendered
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            if (updateToolbarPosition()) {
                                console.log('[PDF Toolbar] Showing toolbar at position:', toolbarPosition)
                                setShowToolbar(true)
                                hasSelectionRef.current = true
                            } else {
                                console.log('[PDF Toolbar] Could not find selection highlights')
                                setShowToolbar(false)
                                hasSelectionRef.current = false
                            }
                        })
                    })
                })
            } else {
                console.log('[PDF Toolbar] Selection cleared')
                setShowToolbar(false)
                hasSelectionRef.current = false
                // Don't clear cache immediately - allow toolbar actions to use it
            }
        })

        return unsubscribe
    }, [selectionApi, updateToolbarPosition, toolbarPosition])

    // Update toolbar position when zoom changes
    useEffect(() => {
        if (!zoomApi) return

        const unsubscribe = zoomApi.onZoomChange(() => {
            // Only update position if we have an active selection
            if (hasSelectionRef.current && showToolbar) {
                // Wait for the DOM to update after zoom
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        updateToolbarPosition()
                    })
                })
            }
        })

        return unsubscribe
    }, [zoomApi, showToolbar, updateToolbarPosition])

    // Also update on scroll
    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const handleScroll = () => {
            if (hasSelectionRef.current && showToolbar) {
                requestAnimationFrame(() => {
                    updateToolbarPosition()
                })
            }
        }

        // Listen to scroll on the viewport container
        viewport.addEventListener('scroll', handleScroll, { capture: true, passive: true })

        return () => {
            viewport.removeEventListener('scroll', handleScroll, { capture: true })
        }
    }, [viewportRef, showToolbar, updateToolbarPosition])

    const handleCopy = useCallback(() => {
        if (selectionApi) {
            selectionApi.copyToClipboard()
        }
        setShowToolbar(false)
        cachedSelectionRef.current = null
    }, [selectionApi])

        // Create text markup annotation from current or cached selection
    const createTextMarkup = useCallback(async (toolId: 'highlight' | 'underline' | 'strikeout') => {
        if (!annotationApi) {
            console.log('[PDF] No annotation API available')
            return
        }

        console.log('[PDF] Creating text markup:', toolId)

        // Try to get current selection, fall back to cached
        // biome-ignore lint/suspicious/noExplicitAny: SDK type compatibility
        let selections: any[] | null = null

        if (selectionApi) {
            try {
                const currentSelection = selectionApi.getFormattedSelection()
                console.log('[PDF] Current selection:', currentSelection?.length, 'items')
                if (currentSelection && currentSelection.length > 0) {
                    selections = currentSelection
                }
            } catch (error) {
                console.log('[PDF] Error getting current selection:', error)
                // Selection might have been cleared
            }
        }

        // Fall back to cached selection if no current selection
        if (!selections && cachedSelectionRef.current) {
            console.log('[PDF] Using cached selection')
            selections = cachedSelectionRef.current.formatted
        }

        if (!selections || selections.length === 0) {
            console.log('[PDF] No selection available for text markup')
            return
        }

        console.log('[PDF] Processing', selections.length, 'selections')

        // Map toolId to PdfAnnotationSubtype and default colors
        const typeMap: Record<string, PdfAnnotationSubtype> = {
            highlight: PdfAnnotationSubtype.HIGHLIGHT,
            underline: PdfAnnotationSubtype.UNDERLINE,
            strikeout: PdfAnnotationSubtype.STRIKEOUT
        }
        const colorMap: Record<string, string> = {
            highlight: '#FFFF00',
            underline: '#0000FF',
            strikeout: '#FF0000'
        }

        const annotationType = typeMap[toolId]
        const defaultColor = colorMap[toolId]

        // Get text content for annotation
        let textContent = ''
        if (selectionApi) {
            try {
                const textTask = selectionApi.getSelectedText()
                const textResult = await textTask.toPromise()
                console.log('[PDF] Selected text:', textResult)
                if (textResult && textResult.length > 0) {
                    textContent = textResult.join(' ')
                }
            } catch (error) {
                console.log('[PDF] Could not get text content:', error)
            }
        }

        // Create annotations for each selection
        for (const selection of selections) {
            try {
                console.log('[PDF] Creating annotation on page', selection.pageIndex, 'with rects:', selection.segmentRects)

                // biome-ignore lint/suspicious/noExplicitAny: SDK type compatibility
                const annotation: any = {
                    type: annotationType,
                    color: defaultColor,
                    opacity: 0.5,
                    segmentRects: selection.segmentRects,
                    rect: selection.rect
                }

                // Add text content if available
                if (textContent) {
                    annotation.contents = textContent
                }

                annotationApi.createAnnotation(selection.pageIndex, annotation)
                console.log('[PDF] Successfully created annotation')
            } catch (error) {
                console.error('[PDF] Error creating annotation:', error)
            }
        }

        // Clear text selection
        if (selectionApi) {
            selectionApi.clear()
            console.log('[PDF] Text selection cleared')
        }

        // Reset selection tracking state
        hasSelectionRef.current = false

        // Clear cache
        cachedSelectionRef.current = null

        // Hide toolbar
        setShowToolbar(false)

        console.log('[PDF] Toolbar hidden. Ready for new selection.')
    }, [annotationApi, selectionApi])

    const handleHighlight = useCallback(async () => {
        setIsProcessing(true)
        try {
            await createTextMarkup('highlight')
        } finally {
            setIsProcessing(false)
        }
    }, [createTextMarkup])

    const handleUnderline = useCallback(async () => {
        setIsProcessing(true)
        try {
            await createTextMarkup('underline')
        } finally {
            setIsProcessing(false)
        }
    }, [createTextMarkup])

    const handleStrikeout = useCallback(async () => {
        setIsProcessing(true)
        try {
            await createTextMarkup('strikeout')
        } finally {
            setIsProcessing(false)
        }
    }, [createTextMarkup])

    // Handle Escape key to clear selection and hide toolbar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showToolbar && !isProcessing) {
                e.preventDefault()
                e.stopPropagation()

                // Clear text selection
                selectionApi?.clear()

                // Reset tracking state
                hasSelectionRef.current = false

                // Clear cache and hide toolbar
                cachedSelectionRef.current = null
                setShowToolbar(false)
            }
        }

        // Add global listener for Escape key
        document.addEventListener('keydown', handleKeyDown, { capture: true })

        return () => {
            document.removeEventListener('keydown', handleKeyDown, { capture: true })
        }
    }, [showToolbar, isProcessing, selectionApi])

    if (!showToolbar) return null

    return (
        <div
            role="toolbar"
            aria-label="Text selection actions"
            className="fixed z-[100] pointer-events-auto"
            style={{
                left: toolbarPosition.x,
                top: toolbarPosition.y,
                transform: 'translate(-50%, -100%) translateY(-12px)',
            }}
            onPointerDown={(e) => {
                // Only prevent on the toolbar container itself, not on buttons
                if (e.currentTarget === e.target) {
                    e.preventDefault()
                }
            }}
        >
            <div className="flex items-center gap-1 bg-zinc-800 rounded-full shadow-2xl px-2 py-1.5 border border-zinc-700">
                {/* Copy */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-700 transition-colors text-zinc-300 hover:text-white"
                            onPointerDown={(e) => {
                                e.preventDefault()
                                // Allow click to pass through
                            }}
                            onClick={handleCopy}
                        >
                            <IconCopy size={15} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-900 text-white border-zinc-700">
                        Copy
                    </TooltipContent>
                </Tooltip>

                {/* Separator */}
                <div className="w-px h-5 bg-zinc-600 mx-0.5" />

                {/* Highlight */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            disabled={isProcessing}
                            className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                                "hover:bg-yellow-500/20",
                                isProcessing && "opacity-50 cursor-not-allowed"
                            )}
                            onPointerDown={(e) => {
                                e.preventDefault()
                            }}
                            onClick={handleHighlight}
                        >
                            {isProcessing ? <IconLoader2 size={15} className="animate-spin text-yellow-400" /> : <IconHighlight size={15} className="text-yellow-400" />}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-900 text-white border-zinc-700">
                        Highlight
                    </TooltipContent>
                </Tooltip>

                {/* Underline */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            disabled={isProcessing}
                            className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                                "hover:bg-zinc-700 text-zinc-300 hover:text-white",
                                isProcessing && "opacity-50 cursor-not-allowed"
                            )}
                            onPointerDown={(e) => {
                                e.preventDefault()
                            }}
                            onClick={handleUnderline}
                        >
                            {isProcessing ? <IconLoader2 size={15} className="animate-spin" /> : <IconUnderline size={15} />}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-900 text-white border-zinc-700">
                        Underline
                    </TooltipContent>
                </Tooltip>

                {/* Strikeout */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            disabled={isProcessing}
                            className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                                "hover:bg-zinc-700 text-zinc-300 hover:text-white",
                                isProcessing && "opacity-50 cursor-not-allowed"
                            )}
                            onPointerDown={(e) => {
                                e.preventDefault()
                            }}
                            onClick={handleStrikeout}
                        >
                            {isProcessing ? <IconLoader2 size={15} className="animate-spin" /> : <IconStrikethrough size={15} />}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-900 text-white border-zinc-700">
                        Strikeout
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    )
})

interface AnnotationToolbarProps {
    onToggleSearch: () => void
    onToggleThumbnails: () => void
    isSearchOpen: boolean
    isThumbnailsOpen: boolean
}

/**
 * Full Annotation Toolbar with all tools
 */
const AnnotationToolbar = memo(function AnnotationToolbar({
    onToggleSearch,
    onToggleThumbnails,
    isSearchOpen,
    isThumbnailsOpen
}: AnnotationToolbarProps) {
    const { provides: annotationApi } = useAnnotationCapability()
    const { provides: zoomApi } = useZoomCapability()
    const { provides: historyApi } = useHistoryCapability()

    const [activeTool, setActiveTool] = useState<string | null>(null)
    const [hasSelection, setHasSelection] = useState(false)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)
    const [currentZoom, setCurrentZoom] = useState(1)
    const [selectedColor, setSelectedColor] = useState('#FFEB3B')

    // Log available tools on mount (for debugging)
    useEffect(() => {
        if (!annotationApi) return
        const tools = annotationApi.getTools()
        console.log('[PDF] Available annotation tools:', tools.map(t => t.id))
    }, [annotationApi])

    // Listen to annotation state changes
    useEffect(() => {
        if (!annotationApi) return
        const unsubscribe = annotationApi.onStateChange((state: AnnotationState) => {
            setHasSelection(state.selectedUid !== null)
            setActiveTool(state.activeToolId)
        })
        return unsubscribe
    }, [annotationApi])

    // Listen to history for undo/redo
    useEffect(() => {
        if (!historyApi) return
        const updateHistoryState = () => {
            setCanUndo(historyApi.canUndo())
            setCanRedo(historyApi.canRedo())
        }
        updateHistoryState()
        const unsubscribe = historyApi.onHistoryChange(updateHistoryState)
        return unsubscribe
    }, [historyApi])

    // Listen to zoom changes
    useEffect(() => {
        if (!zoomApi) return
        const unsubscribe = zoomApi.onZoomChange((event: ZoomChangeEvent) => {
            setCurrentZoom(event.newZoom)
        })
        const initialState: ZoomState = zoomApi.getState()
        setCurrentZoom(initialState.currentZoomLevel)
        return unsubscribe
    }, [zoomApi])

    const handleToolSelect = useCallback((toolId: string | null) => {
        if (!annotationApi) return
        annotationApi.setActiveTool(toolId)
        setActiveTool(toolId)
    }, [annotationApi])

    const handleColorChange = useCallback((color: string) => {
        setSelectedColor(color)
        if (activeTool && annotationApi) {
            // Update the tool defaults with new color
            annotationApi.setToolDefaults(activeTool, { color })
        }
    }, [activeTool, annotationApi])

    const handleDelete = useCallback(() => {
        if (!annotationApi) return
        const selection = annotationApi.getSelectedAnnotation()
        if (selection) {
            annotationApi.deleteAnnotation(selection.object.pageIndex, selection.object.id)
        }
    }, [annotationApi])

    const handleZoomIn = useCallback(() => zoomApi?.zoomIn(), [zoomApi])
    const handleZoomOut = useCallback(() => zoomApi?.zoomOut(), [zoomApi])
    const handleZoomReset = useCallback(() => zoomApi?.requestZoom(1), [zoomApi])
    const handleUndo = useCallback(() => historyApi?.undo(), [historyApi])
    const handleRedo = useCallback(() => historyApi?.redo(), [historyApi])

    const handleCommit = useCallback(async () => {
        if (!annotationApi) return
        try {
            await annotationApi.commit()
            console.log('[PDF] Annotations committed successfully')
        } catch (err) {
            console.error('[PDF] Failed to commit annotations:', err)
        }
    }, [annotationApi])

    return (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-background shrink-0 overflow-x-auto">
            {/* Selection Tool */}
            <ToolButton
                icon={IconPointer}
                tooltip="Select (Esc)"
                isActive={!activeTool}
                onClick={() => handleToolSelect(null)}
            />

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Text Markup Tools */}
            <ToolButton
                icon={IconHighlight}
                tooltip="Highlight Text"
                isActive={activeTool === 'highlight'}
                onClick={() => handleToolSelect('highlight')}
            />
            <ToolButton
                icon={IconUnderline}
                tooltip="Underline Text"
                isActive={activeTool === 'underline'}
                onClick={() => handleToolSelect('underline')}
            />
            <ToolButton
                icon={IconStrikethrough}
                tooltip="Strikethrough Text"
                isActive={activeTool === 'strikeout'}
                onClick={() => handleToolSelect('strikeout')}
            />

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Drawing Tools */}
            <ToolButton
                icon={IconPencil}
                tooltip="Pen / Ink"
                isActive={activeTool === 'ink'}
                onClick={() => handleToolSelect('ink')}
            />
            <ToolButton
                icon={IconBrush}
                tooltip="Highlighter Brush"
                isActive={activeTool === 'inkHighlighter'}
                onClick={() => handleToolSelect('inkHighlighter')}
            />

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Shape Tools */}
            <ToolButton
                icon={IconSquare}
                tooltip="Rectangle"
                isActive={activeTool === 'square'}
                onClick={() => handleToolSelect('square')}
            />
            <ToolButton
                icon={IconCircle}
                tooltip="Circle / Ellipse"
                isActive={activeTool === 'circle'}
                onClick={() => handleToolSelect('circle')}
            />
            <ToolButton
                icon={IconLine}
                tooltip="Line"
                isActive={activeTool === 'line'}
                onClick={() => handleToolSelect('line')}
            />

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Text & Stamp */}
            <ToolButton
                icon={IconTextCaption}
                tooltip="Add Text"
                isActive={activeTool === 'freeText'}
                onClick={() => handleToolSelect('freeText')}
            />
            <ToolButton
                icon={IconSignature}
                tooltip="Stamp / Signature"
                isActive={activeTool === 'stamp'}
                onClick={() => handleToolSelect('stamp')}
            />

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Color Picker */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <div
                            className="w-5 h-5 rounded border border-border"
                            style={{ backgroundColor: selectedColor }}
                        />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                    <div className="grid grid-cols-5 gap-1">
                        {COLOR_PRESETS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                className={cn(
                                    "w-6 h-6 rounded border-2 transition-all",
                                    selectedColor === color
                                        ? "border-primary scale-110"
                                        : "border-transparent hover:scale-105"
                                )}
                                style={{ backgroundColor: color }}
                                onClick={() => handleColorChange(color)}
                            />
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* History */}
            <ToolButton
                icon={IconArrowBackUp}
                tooltip="Undo (Ctrl+Z)"
                onClick={handleUndo}
                disabled={!canUndo}
            />
            <ToolButton
                icon={IconArrowForwardUp}
                tooltip="Redo (Ctrl+Y)"
                onClick={handleRedo}
                disabled={!canRedo}
            />

            {/* Delete */}
            <ToolButton
                icon={IconTrash}
                tooltip="Delete Selected"
                onClick={handleDelete}
                disabled={!hasSelection}
                variant="destructive"
            />

            {/* Save */}
            <ToolButton
                icon={IconDownload}
                tooltip="Save Annotations"
                onClick={handleCommit}
            />

            <div className="flex-1" />

            {/* Search */}
            <ToolButton
                icon={IconSearch}
                tooltip="Search (Ctrl+F)"
                isActive={isSearchOpen}
                onClick={onToggleSearch}
            />

            {/* Thumbnails */}
            <ToolButton
                icon={IconLayoutSidebarRight}
                tooltip="Thumbnails"
                isActive={isThumbnailsOpen}
                onClick={onToggleThumbnails}
            />

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Zoom Controls */}
            <ToolButton
                icon={IconZoomOut}
                tooltip="Zoom Out"
                onClick={handleZoomOut}
            />
            <span className="text-xs text-muted-foreground min-w-[3rem] text-center tabular-nums">
                {Math.round(currentZoom * 100)}%
            </span>
            <ToolButton
                icon={IconZoomIn}
                tooltip="Zoom In"
                onClick={handleZoomIn}
            />
            <ToolButton
                icon={IconZoomReset}
                tooltip="Reset Zoom (100%)"
                onClick={handleZoomReset}
            />
        </div>
    )
})

interface ToolButtonProps {
    icon: React.ComponentType<{ size?: number; className?: string }>
    tooltip: string
    isActive?: boolean
    disabled?: boolean
    variant?: 'default' | 'destructive'
    color?: string
    onClick: () => void
}

const ToolButton = memo(function ToolButton({
    icon: Icon,
    tooltip,
    isActive,
    disabled,
    variant = 'default',
    color,
    onClick
}: ToolButtonProps) {
    // Use span wrapper if color is provided to style the icon
    const iconColor = color && isActive ? color : undefined

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="icon"
                    className={cn(
                        'h-8 w-8',
                        isActive && 'bg-primary/10 text-primary ring-1 ring-primary/20',
                        variant === 'destructive' && !disabled && 'hover:bg-destructive/10 hover:text-destructive'
                    )}
                    onClick={onClick}
                    disabled={disabled}
                    style={iconColor ? { color: iconColor } : undefined}
                >
                    <Icon size={16} />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{tooltip}</TooltipContent>
        </Tooltip>
    )
})

/**
 * Empty state when no PDF is selected
 */
const EmptyState = memo(function EmptyState() {
    return (
        <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="text-center max-w-sm px-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-5">
                    <IconFileTypePdf size={32} className="text-red-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No PDF Selected</h3>
                <p className="text-sm text-muted-foreground">
                    Select a document from the sidebar to start viewing and annotating.
                </p>
            </div>
        </div>
    )
})
