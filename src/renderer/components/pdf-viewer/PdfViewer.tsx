import { useState, useCallback, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import {
  IconZoomIn,
  IconZoomOut,
  IconDownload,
  IconExternalLink,
  IconLock,
  IconChevronLeft,
  IconChevronRight
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PdfViewerProps {
  url: string
  className?: string
  onDownload?: () => void
}

export function PdfViewer({ url, className, onDownload }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [isPasswordProtected, setIsPasswordProtected] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Handle page navigation
  const goToPreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1))
  }, [])

  const goToNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(numPages, prev + 1))
  }, [numPages])

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(numPages, page)))
  }, [numPages])

  // Handle zoom
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(3.0, prev + 0.25))
  }, [])

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.5, prev - 0.25))
  }, [])

  const handleResetZoom = useCallback(() => {
    setScale(1.0)
  }, [])

  // Handle password submission
  const handlePasswordSubmit = useCallback(() => {
    if (!password.trim()) {
      setPasswordError('Please enter a password')
      return
    }

    setPasswordError('')
    // PDF.js will automatically retry with the password
    // We reload the document with password
    window.location.reload()
  }, [password])

  // Document load success
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setIsLoading(false)
    setIsPasswordProtected(false)
    setError(null)
    setCurrentPage(1)
  }, [])

  // Document load error
  const onDocumentLoadError = useCallback((error: Error) => {
    setIsLoading(false)
    const errorMessage = error.message.toLowerCase()

    // Check for password protection
    if (errorMessage.includes('password') || errorMessage.includes('encrypted')) {
      setIsPasswordProtected(true)
      return
    }

    setError(error.message)
    toast.error('Failed to load PDF')
  }, [])

  // Page load success
  const onPageLoadSuccess = useCallback(() => {
    setIsLoading(false)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (error) return

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            goToPreviousPage()
          }
          break
        case 'ArrowRight':
        case 'ArrowDown':
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
            handleResetZoom()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [error, goToPreviousPage, goToNextPage, zoomIn, zoomOut, handleResetZoom])

  return (
    <div
      className={cn(
        'flex flex-col h-full w-full bg-muted/30 overflow-hidden',
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-background border-b border-border shrink-0">
        {/* Page Navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goToPreviousPage}
            disabled={currentPage <= 1}
            title="Previous page (⌘/Ctrl + ←)"
          >
            <IconChevronLeft size={16} />
          </Button>
          <div className="flex items-center gap-1 text-sm">
            <input
              type="number"
              min={1}
              max={numPages}
              value={currentPage}
              onChange={(e) => goToPage(parseInt(e.target.value, 10) || 1)}
              className="w-12 px-2 py-1 text-center bg-muted rounded border-none focus:ring-1 focus:ring-primary text-xs"
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
            title="Next page (⌘/Ctrl + →)"
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
            title="Zoom out (⌘/Ctrl + -)"
          >
            <IconZoomOut size={16} />
          </Button>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.25}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="w-20 h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={zoomIn}
            disabled={scale >= 3}
            title="Zoom in (⌘/Ctrl + +)"
          >
            <IconZoomIn size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={handleResetZoom}
            title="Reset zoom (⌘/Ctrl + 0)"
          >
            {Math.round(scale * 100)}%
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {onDownload && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onDownload}
              title="Download PDF"
            >
              <IconDownload size={16} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => window.open(url, '_blank')}
            title="Open in browser"
          >
            <IconExternalLink size={16} />
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto relative">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold mb-2">Failed to load PDF</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {isPasswordProtected && (
          <div className="absolute inset-0 flex items-center justify-center p-8 bg-background">
            <div className="w-full max-w-sm space-y-4">
              <div className="text-center space-y-2">
                <div className="flex justify-center">
                  <IconLock size={48} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Password Protected</h3>
                <p className="text-sm text-muted-foreground">
                  This PDF is password protected. Please enter the password below.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handlePasswordSubmit()
                }}
                className="space-y-3"
              >
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 border border-border rounded-lg bg-muted focus:ring-2 focus:ring-primary focus:outline-none"
                />
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
                <Button type="submit" className="w-full">
                  Unlock PDF
                </Button>
              </form>

              <p className="text-xs text-muted-foreground text-center">
                The password will be used to unlock this PDF only.
              </p>
            </div>
          </div>
        )}

        {!error && !isPasswordProtected && (
          <div className="min-w-full flex flex-col items-center py-4">
            {isLoading && (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    Loading PDF...
                  </p>
                </div>
              </div>
            )}

            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
              error={null}
              className="flex flex-col items-center gap-4"
            >
              {Array.from({ length: numPages }).map((_, index) => (
                <Page
                  key={`page_${index + 1}`}
                  pageNumber={index + 1}
                  scale={scale}
                  renderAnnotationLayer={true}
                  renderTextLayer={true}
                  onLoadSuccess={onPageLoadSuccess}
                  className="shadow-lg rounded-sm bg-white"
                />
              ))}
            </Document>
          </div>
        )}
      </div>
    </div>
  )
}
