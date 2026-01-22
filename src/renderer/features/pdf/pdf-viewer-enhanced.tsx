import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { useAtom } from 'jotai'
import {
    IconZoomIn,
    IconZoomOut,
    IconDownload,
    IconExternalLink,
    IconChevronLeft,
    IconChevronRight,
    IconSearch,
    IconLoader2
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    highlightText?: string
    className?: string
    onTextSelect?: (text: string, pageNumber: number) => void
}

/**
 * Enhanced PDF Viewer for the PDF Tab
 * Features:
 * - Page navigation with jump to page
 * - Zoom controls
 * - Text selection for AI queries
 * - Keyboard shortcuts
 * - Text highlighting (for citation navigation)
 */
export const PdfViewerEnhanced = memo(function PdfViewerEnhanced({
    source,
    highlightText,
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

    const containerRef = useRef<HTMLDivElement>(null)
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

    // Sync page input with current page
    useEffect(() => {
        setPageInputValue(String(currentPage))
    }, [currentPage])

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

        // Scroll to page
        const pageElement = pageRefs.current.get(validPage)
        if (pageElement && containerRef.current) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }, [numPages, setCurrentPage])

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

    // Document load handlers
    const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
        setNumPages(numPages)
        setIsLoading(false)
        setError(null)
    }, [])

    const onDocumentLoadError = useCallback((error: Error) => {
        setIsLoading(false)
        setError(error.message)
        toast.error('Failed to load PDF')
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
                    }
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [error, source, goToPreviousPage, goToNextPage, zoomIn, zoomOut, resetZoom])

    // Handle download
    const handleDownload = useCallback(() => {
        if (!source?.url) return
        const link = document.createElement('a')
        link.href = source.url
        link.download = `${source.name}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success('PDF downloaded')
    }, [source])

    // Handle open in browser
    const handleOpenExternal = useCallback(() => {
        if (!source?.url) return
        window.open(source.url, '_blank')
    }, [source])

    if (!source) {
        return (
            <div className={cn("flex items-center justify-center h-full", className)}>
                <div className="text-center text-muted-foreground">
                    <p className="text-sm">Select a PDF to view</p>
                </div>
            </div>
        )
    }

    if (!source.url) {
        return (
            <div className={cn("flex items-center justify-center h-full", className)}>
                <div className="text-center text-muted-foreground">
                    <p className="text-sm">PDF URL not available</p>
                </div>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col h-full w-full bg-muted/30 overflow-hidden", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-background border-b border-border shrink-0">
                {/* Page Navigation */}
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={goToPreviousPage}
                        disabled={currentPage <= 1}
                        title="Previous page (Cmd/Ctrl + Left)"
                    >
                        <IconChevronLeft size={16} />
                    </Button>
                    <div className="flex items-center gap-1 text-sm">
                        <Input
                            type="text"
                            value={pageInputValue}
                            onChange={handlePageInputChange}
                            onBlur={handlePageInputBlur}
                            onKeyDown={handlePageInputKeyDown}
                            className="w-12 h-7 px-2 text-center text-xs"
                        />
                        <span className="text-muted-foreground">/</span>
                        <span className="text-muted-foreground">{numPages || '-'}</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={goToNextPage}
                        disabled={currentPage >= numPages}
                        title="Next page (Cmd/Ctrl + Right)"
                    >
                        <IconChevronRight size={16} />
                    </Button>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={zoomOut}
                        disabled={scale <= 0.5}
                        title="Zoom out (Cmd/Ctrl + -)"
                    >
                        <IconZoomOut size={16} />
                    </Button>
                    <input
                        type="range"
                        min={0.5}
                        max={3}
                        step={0.25}
                        value={scale}
                        onChange={(e) => setScale(Number.parseFloat(e.target.value))}
                        className="w-20 h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={zoomIn}
                        disabled={scale >= 3}
                        title="Zoom in (Cmd/Ctrl + +)"
                    >
                        <IconZoomIn size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={resetZoom}
                        title="Reset zoom (Cmd/Ctrl + 0)"
                    >
                        {Math.round(scale * 100)}%
                    </Button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowSearch(!showSearch)}
                        title="Search (Cmd/Ctrl + F)"
                    >
                        <IconSearch size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleDownload}
                        title="Download PDF"
                    >
                        <IconDownload size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleOpenExternal}
                        title="Open in browser"
                    >
                        <IconExternalLink size={16} />
                    </Button>
                </div>
            </div>

            {/* Search Bar */}
            {showSearch && (
                <div className="flex items-center gap-2 px-3 py-2 bg-background border-b border-border">
                    <IconSearch size={14} className="text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search in PDF..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 h-7 text-sm"
                        autoFocus
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowSearch(false)}
                    >
                        Close
                    </Button>
                </div>
            )}

            {/* PDF Content */}
            <div
                ref={containerRef}
                className="flex-1 overflow-auto relative"
                onMouseUp={handleTextSelection}
            >
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center p-8">
                        <div className="text-center max-w-md">
                            <div className="text-6xl mb-4">⚠️</div>
                            <h3 className="text-lg font-semibold mb-2">Failed to load PDF</h3>
                            <p className="text-sm text-muted-foreground">{error}</p>
                        </div>
                    </div>
                )}

                {!error && (
                    <div className="min-w-full flex flex-col items-center py-4">
                        {isLoading && (
                            <div className="flex items-center justify-center h-64">
                                <div className="flex flex-col items-center gap-4">
                                    <IconLoader2 size={32} className="animate-spin text-primary" />
                                    <p className="text-sm text-muted-foreground">
                                        Loading PDF...
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
                            className="flex flex-col items-center gap-4"
                        >
                            {Array.from({ length: numPages }).map((_, index) => (
                                <div
                                    key={`page_${index + 1}`}
                                    ref={(el) => {
                                        if (el) pageRefs.current.set(index + 1, el)
                                    }}
                                    className="relative"
                                >
                                    <Page
                                        pageNumber={index + 1}
                                        scale={scale}
                                        renderAnnotationLayer={true}
                                        renderTextLayer={true}
                                        className="shadow-lg rounded-sm bg-white"
                                    />
                                    {/* Page number indicator */}
                                    <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                                        {index + 1}
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
