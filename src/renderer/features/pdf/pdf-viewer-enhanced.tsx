import { useState, useCallback, useEffect, useMemo, memo } from 'react'
import { useAtom } from 'jotai'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage, type RenderPageProps } from '@embedpdf/plugin-scroll/react'
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { ZoomPluginPackage, useZoomCapability } from '@embedpdf/plugin-zoom/react'
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react'
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react'
import { HistoryPluginPackage, useHistoryCapability } from '@embedpdf/plugin-history/react'
import { 
    AnnotationPluginPackage, 
    useAnnotationCapability,
    AnnotationLayer,
    type AnnotationState
} from '@embedpdf/plugin-annotation/react'
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
    IconFileTypePdf
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
    pdfCurrentPageAtom,
    pdfZoomLevelAtom,
    type PdfSource
} from '@/lib/atoms'

interface PdfViewerEnhancedProps {
    source: PdfSource | null
    className?: string
}

/**
 * Enhanced PDF Viewer using EmbedPDF v1.5.0
 * Features:
 * - Full annotation support (highlight, ink, shapes)
 * - Zoom controls
 * - Undo/Redo
 * - Theme-aware styling
 * 
 * Layout is preserved - this component only replaces the viewer area,
 * the sidebar with document list remains unchanged.
 */
export const PdfViewerEnhanced = memo(function PdfViewerEnhanced({
    source,
    className
}: PdfViewerEnhancedProps) {
    const [, setCurrentPage] = useAtom(pdfCurrentPageAtom)
    const [, setZoomLevel] = useAtom(pdfZoomLevelAtom)

    // Get PDF URL from source
    const pdfUrl = useMemo(() => {
        if (!source) return null
        
        // For local files, use file:// protocol
        if (source.type === 'local' && source.url) {
            return source.url
        }
        
        // For cloud files, use the URL directly
        return source.url || null
    }, [source])

    if (!source || !pdfUrl) {
        return <EmptyState />
    }

    return (
        <div className={cn('flex flex-col h-full bg-muted/30', className)}>
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
        wasmUrl: '/pdfium.wasm'  // Served from public folder
    })

    // Build plugins configuration
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
        createPluginRegistration(ZoomPluginPackage),
        // Annotation dependencies
        createPluginRegistration(InteractionManagerPluginPackage),
        createPluginRegistration(SelectionPluginPackage),
        createPluginRegistration(HistoryPluginPackage),
        // Annotation plugin
        createPluginRegistration(AnnotationPluginPackage, {
            annotationAuthor: 'User',
            autoCommit: true,
            colorPresets: [
                '#FFEB3B', '#4CAF50', '#2196F3', '#FF5722', '#9C27B0',
                '#F44336', '#00BCD4', '#FF9800', '#795548', '#607D8B'
            ],
            selectAfterCreate: true,
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
            <PdfViewerContent />
        </EmbedPDF>
    )
})

/**
 * Inner content - must be inside EmbedPDF provider to access hooks
 * EmbedPDF v1.5.0 uses single-document mode (no documentId props needed)
 */
const PdfViewerContent = memo(function PdfViewerContent() {
    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <AnnotationToolbar />
            
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
        </div>
    )
})

/**
 * Page renderer component with RenderLayer and AnnotationLayer
 */
const PageRenderer = memo(function PageRenderer({
    width,
    height,
    pageIndex,
    scale,
    rotation,
}: RenderPageProps) {
    return (
        <div
            style={{
                width,
                height,
                margin: '8px auto',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: 'white',
                position: 'relative',
            }}
        >
            <RenderLayer 
                pageIndex={pageIndex} 
                scale={scale}
            />
            <AnnotationLayer 
                pageIndex={pageIndex}
                scale={scale}
                pageWidth={width}
                pageHeight={height}
                rotation={rotation}
                selectionOutlineColor="hsl(var(--primary))"
            />
        </div>
    )
})

/**
 * Annotation Toolbar with tools, zoom, and history controls
 * Uses EmbedPDF 1.5.0 APIs (single document mode - no forDocument scoping)
 */
const AnnotationToolbar = memo(function AnnotationToolbar() {
    const { provides: annotationApi } = useAnnotationCapability()
    const { provides: zoomApi } = useZoomCapability()
    const { provides: historyApi } = useHistoryCapability()
    
    const [activeTool, setActiveTool] = useState<string | null>(null)
    const [hasSelection, setHasSelection] = useState(false)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)
    const [currentZoom, setCurrentZoom] = useState(1)

    // Listen to annotation state changes for selection tracking
    useEffect(() => {
        if (!annotationApi) return
        const unsubscribe = annotationApi.onStateChange((state: AnnotationState) => {
            // Track selection state via selectedUid (singular in v1.5.0)
            setHasSelection(state.selectedUid !== null)
            // Also sync active tool
            setActiveTool(state.activeToolId)
        })
        return unsubscribe
    }, [annotationApi])

    // Listen to history capability for undo/redo
    useEffect(() => {
        if (!historyApi) return
        const updateHistoryState = () => {
            setCanUndo(historyApi.canUndo())
            setCanRedo(historyApi.canRedo())
        }
        // Initial state
        updateHistoryState()
        // Subscribe to changes
        const unsubscribe = historyApi.onHistoryChange(() => {
            updateHistoryState()
        })
        return unsubscribe
    }, [historyApi])

    // Listen to zoom changes
    useEffect(() => {
        if (!zoomApi) return
        const unsubscribe = zoomApi.onZoomChange((event: ZoomChangeEvent) => {
            setCurrentZoom(event.newZoom)
        })
        // Initial state
        const initialState: ZoomState = zoomApi.getState()
        setCurrentZoom(initialState.currentZoomLevel)
        return unsubscribe
    }, [zoomApi])

    const handleToolSelect = useCallback((tool: string | null) => {
        annotationApi?.setActiveTool(tool)
        setActiveTool(tool)
    }, [annotationApi])

    const handleDelete = useCallback(() => {
        if (!annotationApi) return
        const selection = annotationApi.getSelectedAnnotation()
        if (selection) {
            annotationApi.deleteAnnotation(selection.object.pageIndex, selection.object.id)
        }
    }, [annotationApi])

    const handleZoomIn = useCallback(() => {
        zoomApi?.zoomIn()
    }, [zoomApi])

    const handleZoomOut = useCallback(() => {
        zoomApi?.zoomOut()
    }, [zoomApi])

    const handleZoomReset = useCallback(() => {
        zoomApi?.requestZoom(1)
    }, [zoomApi])

    const handleUndo = useCallback(() => {
        historyApi?.undo()
    }, [historyApi])

    const handleRedo = useCallback(() => {
        historyApi?.redo()
    }, [historyApi])

    return (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-background shrink-0">
            {/* Selection Tool */}
            <ToolButton
                icon={IconPointer}
                tooltip="Select"
                isActive={!activeTool}
                onClick={() => handleToolSelect(null)}
            />

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Annotation Tools */}
            <ToolButton
                icon={IconHighlight}
                tooltip="Highlight"
                isActive={activeTool === 'highlight'}
                onClick={() => handleToolSelect('highlight')}
            />
            <ToolButton
                icon={IconPencil}
                tooltip="Pen / Ink"
                isActive={activeTool === 'ink'}
                onClick={() => handleToolSelect('ink')}
            />
            <ToolButton
                icon={IconSquare}
                tooltip="Rectangle"
                isActive={activeTool === 'square'}
                onClick={() => handleToolSelect('square')}
            />
            <ToolButton
                icon={IconCircle}
                tooltip="Circle"
                isActive={activeTool === 'circle'}
                onClick={() => handleToolSelect('circle')}
            />

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* History */}
            <ToolButton
                icon={IconArrowBackUp}
                tooltip="Undo"
                onClick={handleUndo}
                disabled={!canUndo}
            />
            <ToolButton
                icon={IconArrowForwardUp}
                tooltip="Redo"
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

            <div className="flex-1" />

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
                tooltip="Reset Zoom"
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
    onClick: () => void
}

const ToolButton = memo(function ToolButton({
    icon: Icon,
    tooltip,
    isActive,
    disabled,
    variant = 'default',
    onClick
}: ToolButtonProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="icon"
                    className={cn(
                        'h-8 w-8',
                        isActive && 'bg-primary/10 text-primary',
                        variant === 'destructive' && !disabled && 'hover:bg-destructive/10 hover:text-destructive'
                    )}
                    onClick={onClick}
                    disabled={disabled}
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
