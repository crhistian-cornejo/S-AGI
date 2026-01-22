import { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { useAtom } from 'jotai'
import {
    IconZoomReset,
    IconDownload,
    IconExternalLink,
    IconChevronLeft,
    IconChevronRight,
    IconSearch,
    IconLoader2,
    IconMinus,
    IconPlus,
    IconLayoutList,
    IconPrinter,
    IconRotateClockwise,
    IconBookmark,
    IconShare,
    IconDotsVertical,
    IconFileTypePdf,
    IconAlertTriangle
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
    pdfCurrentPageAtom,
    pdfZoomLevelAtom,
    pdfSelectedTextAtom,
    type PdfSource
} from '@/lib/atoms'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PdfViewerEnhancedProps {
    source: PdfSource | null
    className?: string
    onTextSelect?: (text: string, pageNumber: number) => void
}

// Zoom presets for quick selection
const ZOOM_PRESETS = [
    { label: '50%', value: 0.5 },
    { label: '75%', value: 0.75 },
    { label: '100%', value: 1.0 },
    { label: '125%', value: 1.25 },
    { label: '150%', value: 1.5 },
    { label: '200%', value: 2.0 },
]

/**
 * Enhanced PDF Viewer for the PDF Tab
 * Features:
 * - Professional toolbar similar to Univer
 * - Page navigation with keyboard shortcuts
 * - Zoom controls with presets
 * - Text selection for AI queries
 * - Thumbnail sidebar (future)
 * - Annotations and comments support (future)
 */
export const PdfViewerEnhanced = memo(function PdfViewerEnhanced({
    source,
    className,
    onTextSelect
}: PdfViewerEnhancedProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [currentPage, setCurrentPage] = useAtom(pdfCurrentPageAtom)
    const [scale, setScale] = useAtom(pdfZoomLevelAtom)
    const [, setSelectedText] = useAtom(pdfSelectedTextAtom)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pageInputValue, setPageInputValue] = useState(String(currentPage))
    const [searchQuery, setSearchQuery] = useState('')
    const [showSearch, setShowSearch] = useState(false)
    const [rotation, setRotation] = useState(0)
    const [viewMode, setViewMode] = useState<'single' | 'continuous'>('continuous')

    const containerRef = useRef<HTMLDivElement>(null)
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Sync page input with current page
    useEffect(() => {
        setPageInputValue(String(currentPage))
    }, [currentPage])

    // Reset state when source changes
    useEffect(() => {
        setIsLoading(true)
        setError(null)
        setNumPages(0)
        setCurrentPage(1)
        setRotation(0)
    }, [source?.id, setCurrentPage])

    // Handle page navigation
    const goToPreviousPage = useCallback(() => {
        setCurrentPage((prev) => Math.max(1, prev - 1))
    }, [setCurrentPage])

    const goToNextPage = useCallback(() => {
        setCurrentPage((prev) => Math.min(numPages, prev + 1))
    }, [numPages, setCurrentPage])

    const goToPage = useCallback((page: number) => {
        const validPage = Math.max(1, Math.min(numPages, page))
        setCurrentPage(validPage)

        // Scroll to page in continuous mode
        if (viewMode === 'continuous') {
            const pageElement = pageRefs.current.get(validPage)
            if (pageElement && containerRef.current) {
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
        }
    }, [numPages, setCurrentPage, viewMode])

    // Handle zoom
    const zoomIn = useCallback(() => {
        setScale((prev) => Math.min(3.0, prev + 0.25))
    }, [setScale])

    const zoomOut = useCallback(() => {
        setScale((prev) => Math.max(0.5, prev - 0.25))
    }, [setScale])

    const resetZoom = useCallback(() => {
        setScale(1.0)
    }, [setScale])

    const setZoomPreset = useCallback((value: number) => {
        setScale(value)
    }, [setScale])

    // Handle rotation
    const rotate = useCallback(() => {
        setRotation((prev) => (prev + 90) % 360)
    }, [])

    // Document load handlers
    const onDocumentLoadSuccess = useCallback(({ numPages: pages }: { numPages: number }) => {
        setNumPages(pages)
        setIsLoading(false)
        setError(null)
    }, [])

    const onDocumentLoadError = useCallback((err: Error) => {
        setIsLoading(false)
        setError(err.message)
        console.error('PDF load error:', err)
    }, [])

    // Handle text selection
    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection()
        if (selection && selection.toString().trim()) {
            const text = selection.toString().trim()
            setSelectedText({ text, pageNumber: currentPage })
            onTextSelect?.(text, currentPage)
        }
    }, [currentPage, onTextSelect, setSelectedText])

    // Handle page input
    const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPageInputValue(e.target.value)
    }

    const handlePageInputBlur = () => {
        const page = parseInt(pageInputValue, 10)
        if (!Number.isNaN(page)) {
            goToPage(page)
        } else {
            setPageInputValue(String(currentPage))
        }
    }

    const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handlePageInputBlur()
        }
    }

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (error || !source) return

            // Don't capture if typing in input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return
            }

            switch (e.key) {
                case 'ArrowLeft':
                    if (e.metaKey || e.ctrlKey) {
                        e.preventDefault()
                        goToPreviousPage()
                    }
                    break
                case 'ArrowRight':
                    if (e.metaKey || e.ctrlKey) {
                        e.preventDefault()
                        goToNextPage()
                    }
                    break
                case '+':
                case '=':
                    if (e.metaKey || e.ctrlKey) {
                        e.preventDefault()
                        zoomIn()
                    }
                    break
                case '-':
                    if (e.metaKey || e.ctrlKey) {
                        e.preventDefault()
                        zoomOut()
                    }
                    break
                case '0':
                    if (e.metaKey || e.ctrlKey) {
                        e.preventDefault()
                        resetZoom()
                    }
                    break
                case 'f':
                    if (e.metaKey || e.ctrlKey) {
                        e.preventDefault()
                        setShowSearch(true)
                        setTimeout(() => searchInputRef.current?.focus(), 100)
                    }
                    break
                case 'Escape':
                    if (showSearch) {
                        setShowSearch(false)
                        setSearchQuery('')
                    }
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [error, source, goToPreviousPage, goToNextPage, zoomIn, zoomOut, resetZoom, showSearch])

    // Handle download
    const handleDownload = useCallback(() => {
        if (!source?.url) return
        const link = document.createElement('a')
        link.href = source.url
        link.download = `${source.name}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success('Download started')
    }, [source])

    // Handle open in browser
    const handleOpenExternal = useCallback(() => {
        if (!source?.url) return
        window.open(source.url, '_blank')
    }, [source])

    // Handle print
    const handlePrint = useCallback(() => {
        if (!source?.url) return
        const printWindow = window.open(source.url)
        printWindow?.print()
    }, [source])

    // Rendered pages based on view mode
    const renderedPages = useMemo(() => {
        if (viewMode === 'single') {
            return [currentPage]
        }
        // Continuous mode: render all pages
        return Array.from({ length: numPages }, (_, i) => i + 1)
    }, [viewMode, currentPage, numPages])

    if (!source) {
        return (
            <div className={cn("flex items-center justify-center h-full bg-muted/20", className)}>
                <div className="text-center text-muted-foreground">
                    <IconFileTypePdf size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Select a PDF to view</p>
                </div>
            </div>
        )
    }

    if (!source.url) {
        return (
            <div className={cn("flex items-center justify-center h-full bg-muted/20", className)}>
                <div className="text-center">
                    <IconLoader2 size={32} className="mx-auto mb-3 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading PDF...</p>
                </div>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col h-full w-full bg-muted/30 overflow-hidden", className)}>
            {/* Professional Toolbar */}
            <div className="flex items-center gap-1 h-10 px-2 bg-background border-b border-border shrink-0">
                {/* Page Navigation */}
                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={goToPreviousPage}
                                disabled={currentPage <= 1}
                            >
                                <IconChevronLeft size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Previous page</TooltipContent>
                    </Tooltip>

                    <div className="flex items-center gap-1 px-1">
                        <Input
                            type="text"
                            value={pageInputValue}
                            onChange={handlePageInputChange}
                            onBlur={handlePageInputBlur}
                            onKeyDown={handlePageInputKeyDown}
                            className="w-10 h-6 px-1.5 text-center text-xs border-muted"
                        />
                        <span className="text-xs text-muted-foreground">/</span>
                        <span className="text-xs text-muted-foreground min-w-[1.5rem]">{numPages || '-'}</span>
                    </div>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={goToNextPage}
                                disabled={currentPage >= numPages}
                            >
                                <IconChevronRight size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Next page</TooltipContent>
                    </Tooltip>
                </div>

                <Separator orientation="vertical" className="h-5 mx-1" />

                {/* Zoom Controls */}
                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={zoomOut}
                                disabled={scale <= 0.5}
                            >
                                <IconMinus size={14} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Zoom out</TooltipContent>
                    </Tooltip>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs min-w-[3.5rem]">
                                {Math.round(scale * 100)}%
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="min-w-[5rem]">
                            {ZOOM_PRESETS.map((preset) => (
                                <DropdownMenuItem
                                    key={preset.value}
                                    onClick={() => setZoomPreset(preset.value)}
                                    className={cn(scale === preset.value && "bg-accent")}
                                >
                                    {preset.label}
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={resetZoom}>
                                <IconZoomReset size={14} className="mr-2" />
                                Reset
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={zoomIn}
                                disabled={scale >= 3}
                            >
                                <IconPlus size={14} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Zoom in</TooltipContent>
                    </Tooltip>
                </div>

                <Separator orientation="vertical" className="h-5 mx-1" />

                {/* View Controls */}
                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={viewMode === 'continuous' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setViewMode(viewMode === 'single' ? 'continuous' : 'single')}
                            >
                                <IconLayoutList size={14} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {viewMode === 'continuous' ? 'Single page view' : 'Continuous scroll'}
                        </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={rotate}
                            >
                                <IconRotateClockwise size={14} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Rotate</TooltipContent>
                    </Tooltip>
                </div>

                <div className="flex-1" />

                {/* Actions */}
                <div className="flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={showSearch ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                    setShowSearch(!showSearch)
                                    if (!showSearch) {
                                        setTimeout(() => searchInputRef.current?.focus(), 100)
                                    }
                                }}
                            >
                                <IconSearch size={14} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Search (Ctrl+F)</TooltipContent>
                    </Tooltip>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <IconDotsVertical size={14} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleDownload}>
                                <IconDownload size={14} className="mr-2" />
                                Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handlePrint}>
                                <IconPrinter size={14} className="mr-2" />
                                Print
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleOpenExternal}>
                                <IconExternalLink size={14} className="mr-2" />
                                Open in browser
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled>
                                <IconBookmark size={14} className="mr-2" />
                                Bookmarks
                                <span className="ml-auto text-[10px] text-muted-foreground">Soon</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                                <IconShare size={14} className="mr-2" />
                                Share link
                                <span className="ml-auto text-[10px] text-muted-foreground">Soon</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Search Bar */}
            {showSearch && (
                <div className="flex items-center gap-2 h-9 px-3 bg-muted/50 border-b border-border animate-in slide-in-from-top-1 duration-150">
                    <IconSearch size={14} className="text-muted-foreground shrink-0" />
                    <Input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search in document..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 h-6 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <span className="text-[10px] text-muted-foreground">Press ESC to close</span>
                </div>
            )}

            {/* PDF Content */}
            <div
                ref={containerRef}
                className="flex-1 overflow-auto relative"
                onMouseUp={handleTextSelection}
            >
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center p-8 bg-background/80 backdrop-blur-sm z-10">
                        <div className="text-center max-w-md">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-destructive/10 mb-4">
                                <IconAlertTriangle size={28} className="text-destructive" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Failed to load PDF</h3>
                            <p className="text-sm text-muted-foreground mb-4">{error}</p>
                            <Button variant="outline" onClick={() => setError(null)}>
                                Try again
                            </Button>
                        </div>
                    </div>
                )}

                {!error && (
                    <div className="min-w-full flex flex-col items-center py-6 px-4">
                        {isLoading && (
                            <div className="flex items-center justify-center h-64">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-full border-2 border-primary/20" />
                                        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Loading document...
                                    </p>
                                </div>
                            </div>
                        )}

                        <Document
                            file={source.url}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                            loading={null}
                            error={null}
                            className="flex flex-col items-center gap-6"
                        >
                            {renderedPages.map((pageNum) => (
                                <div
                                    key={`page_${pageNum}`}
                                    ref={(el) => {
                                        if (el) pageRefs.current.set(pageNum, el)
                                    }}
                                    className={cn(
                                        "relative group",
                                        viewMode === 'single' && pageNum !== currentPage && "hidden"
                                    )}
                                >
                                    <Page
                                        pageNumber={pageNum}
                                        scale={scale}
                                        rotate={rotation}
                                        renderAnnotationLayer={true}
                                        renderTextLayer={true}
                                        className="shadow-lg rounded-sm overflow-hidden"
                                        loading={
                                            <div className="flex items-center justify-center h-[800px] w-[600px] bg-white dark:bg-zinc-900">
                                                <IconLoader2 className="animate-spin text-muted-foreground" size={24} />
                                            </div>
                                        }
                                    />
                                    {/* Page number badge */}
                                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                                        Page {pageNum} of {numPages}
                                    </div>
                                </div>
                            ))}
                        </Document>
                    </div>
                )}
            </div>
        </div>
    )
})
