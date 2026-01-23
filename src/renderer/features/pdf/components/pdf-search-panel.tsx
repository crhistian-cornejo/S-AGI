import { memo, useCallback, useEffect, useState, useRef } from 'react'
import { useAtom } from 'jotai'
import {
    IconSearch,
    IconX,
    IconChevronUp,
    IconChevronDown,
    IconLoader2,
    IconAlertCircle
} from '@tabler/icons-react'
import { useRegistry } from '@embedpdf/core/react'
import { useLoaderCapability } from '@embedpdf/plugin-loader/react'
import { useScroll } from '@embedpdf/plugin-scroll/react'
import type { PdfEngine, SearchResult } from '@embedpdf/models'
import {
    pdfSearchQueryAtom,
    pdfSearchResultsAtom,
    pdfSearchCurrentIndexAtom,
    pdfSearchLoadingAtom,
    type PdfSearchResult
} from '@/lib/atoms'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PdfSearchPanelProps {
    className?: string
    onClose?: () => void
}

/**
 * PDF Search Panel Component
 * Provides full-text search within the PDF document
 */
export const PdfSearchPanel = memo(function PdfSearchPanel({
    className,
    onClose
}: PdfSearchPanelProps) {
    const { registry, pluginsReady } = useRegistry()
    const { provides: loaderApi } = useLoaderCapability()
    const { provides: scrollApi } = useScroll()

    const [query, setQuery] = useAtom(pdfSearchQueryAtom)
    const [results, setResults] = useAtom(pdfSearchResultsAtom)
    const [currentIndex, setCurrentIndex] = useAtom(pdfSearchCurrentIndexAtom)
    const [isLoading, setIsLoading] = useAtom(pdfSearchLoadingAtom)

    const [localQuery, setLocalQuery] = useState(query)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // Perform search
    const handleSearch = useCallback(async () => {
        const searchQuery = localQuery.trim()
        if (!searchQuery || !registry || !loaderApi || !pluginsReady) {
            setResults([])
            setCurrentIndex(0)
            return
        }

        // Cancel any pending search
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        abortControllerRef.current = new AbortController()

        const doc = loaderApi.getDocument()
        if (!doc) {
            setError('No document loaded')
            return
        }

        setIsLoading(true)
        setError(null)
        setQuery(searchQuery)

        try {
            const engine = registry.getEngine() as PdfEngine
            if (!engine) {
                throw new Error('PDF engine not available')
            }

            console.log('[PDF Search] Starting search for:', searchQuery)

            // Use searchAllPages API
            const task = engine.searchAllPages(doc, searchQuery)

            // Wait for task to complete
            const result = await new Promise<any>((resolve, reject) => {
                task.wait(resolve, reject)
            })

            console.log('[PDF Search] Search completed:', result)

            // Convert results to our format
            // The API returns { results: SearchResult[], total: number }
            const searchResults: PdfSearchResult[] = (result.results || []).map((match: SearchResult) => ({
                pageIndex: match.pageIndex,
                charIndex: match.charIndex,
                charCount: match.charCount,
                rects: match.rects?.map(r => ({
                    x: r.origin?.x ?? 0,
                    y: r.origin?.y ?? 0,
                    width: r.size?.width ?? 0,
                    height: r.size?.height ?? 0
                })) ?? [],
                context: match.context
            }))

            // Sort by page index
            searchResults.sort((a, b) => a.pageIndex - b.pageIndex)

            setResults(searchResults)
            setCurrentIndex(0)

            console.log(`[PDF Search] Found ${searchResults.length} results`)

            // Navigate to first result if any
            if (searchResults.length > 0 && scrollApi) {
                const pageNumber = searchResults[0].pageIndex + 1
                console.log(`[PDF Search] Navigating to page ${pageNumber}`)
                scrollApi.scrollToPage({
                    pageNumber,
                    behavior: 'smooth'
                })
            }
        } catch (err) {
            if ((err as Error).name === 'AbortError') {
                return // Search was cancelled
            }
            console.error('[PDF Search] Error:', err)
            setError(err instanceof Error ? err.message : 'Search failed')
            setResults([])
        } finally {
            setIsLoading(false)
        }
    }, [localQuery, registry, loaderApi, pluginsReady, setQuery, setResults, setCurrentIndex, setIsLoading, scrollApi])

    // Navigate to next/previous result
    const goToResult = useCallback((direction: 'next' | 'prev') => {
        if (results.length === 0 || !scrollApi) return

        let newIndex: number
        if (direction === 'next') {
            newIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0
        } else {
            newIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1
        }

        setCurrentIndex(newIndex)
        const result = results[newIndex]
        if (result) {
            const pageNumber = result.pageIndex + 1
            console.log(`[PDF Search] Navigating to result ${newIndex + 1} on page ${pageNumber}`)
            scrollApi.scrollToPage({
                pageNumber,
                behavior: 'smooth'
            })
        }
    }, [results, currentIndex, setCurrentIndex, scrollApi])

    // Handle Enter key to search
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleSearch()
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose?.()
        } else if (e.key === 'F3' || (e.key === 'g' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault()
            if (e.shiftKey) {
                goToResult('prev')
            } else {
                goToResult('next')
            }
        }
    }, [handleSearch, onClose, goToResult])

    // Clear search
    const handleClear = useCallback(() => {
        setLocalQuery('')
        setQuery('')
        setResults([])
        setCurrentIndex(0)
        inputRef.current?.focus()
    }, [setQuery, setResults, setCurrentIndex])

    return (
        <div className={cn("flex flex-col gap-2 p-2", className)}>
            {/* Search input */}
            <div className="flex items-center gap-1">
                <div className="relative flex-1">
                    <IconSearch
                        size={14}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder="Search in document..."
                        value={localQuery}
                        onChange={(e) => setLocalQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="h-8 pl-7 pr-8 text-sm"
                    />
                    {localQuery && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
                            onClick={handleClear}
                        >
                            <IconX size={12} />
                        </Button>
                    )}
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={handleSearch}
                    disabled={!localQuery.trim() || isLoading}
                >
                    {isLoading ? (
                        <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                        'Search'
                    )}
                </Button>
                {onClose && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 ml-1"
                        onClick={onClose}
                    >
                        <IconX size={16} />
                    </Button>
                )}
            </div>

            {/* Results navigation */}
            {results.length > 0 && (
                <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-muted-foreground">
                        {currentIndex + 1} of {results.length} results
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => goToResult('prev')}
                        >
                            <IconChevronUp size={14} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => goToResult('next')}
                        >
                            <IconChevronDown size={14} />
                        </Button>
                    </div>
                </div>
            )}

            {/* No results message */}
            {query && !isLoading && results.length === 0 && !error && (
                <div className="px-1 py-2 text-xs text-muted-foreground text-center">
                    No results found for "{query}"
                </div>
            )}

            {/* Error message */}
            {error && (
                <div className="flex items-center gap-2 px-2 py-2 text-xs text-destructive bg-destructive/10 rounded">
                    <IconAlertCircle size={14} />
                    <span>{error}</span>
                </div>
            )}

            {/* Result list preview (optional, shows context) */}
            {results.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {results.slice(0, 20).map((result, idx) => (
                        <button
                            key={`${result.pageIndex}-${result.charIndex}`}
                            type="button"
                            className={cn(
                                "w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors",
                                idx === currentIndex && "bg-primary/10 text-primary"
                            )}
                            onClick={() => {
                                setCurrentIndex(idx)
                                if (scrollApi) {
                                    const pageNumber = result.pageIndex + 1
                                    console.log(`[PDF Search] Navigating to result ${idx + 1} on page ${pageNumber}`)
                                    scrollApi.scrollToPage({
                                        pageNumber,
                                        behavior: 'smooth'
                                    })
                                }
                            }}
                        >
                            <span className="font-medium text-muted-foreground">
                                Page {result.pageIndex + 1}
                            </span>
                            {result.context && (
                                <p className="mt-0.5 line-clamp-1 text-foreground/70">
                                    {result.context.before && `...${result.context.before}`}
                                    <span className="font-medium text-foreground bg-yellow-200/50 dark:bg-yellow-500/30 px-0.5 rounded">
                                        {result.context.match}
                                    </span>
                                    {result.context.after && `${result.context.after}...`}
                                </p>
                            )}
                        </button>
                    ))}
                    {results.length > 20 && (
                        <div className="text-xs text-muted-foreground text-center py-1">
                            And {results.length - 20} more results...
                        </div>
                    )}
                </div>
            )}
        </div>
    )
})
