import { memo, useMemo } from 'react'
import { useAtomValue } from 'jotai'
import {
    pdfSearchResultsAtom,
    pdfSearchCurrentIndexAtom,
    type PdfSearchResult
} from '@/lib/atoms'
import { cn } from '@/lib/utils'

interface SearchHighlightsProps {
    pageIndex: number
    scale: number
    pageWidth: number
    pageHeight: number
}

/**
 * Search Highlights Overlay Component
 * Renders yellow highlight boxes over search results on the PDF page
 */
export const SearchHighlights = memo(function SearchHighlights({
    pageIndex,
    scale,
    pageWidth,
    pageHeight
}: SearchHighlightsProps) {
    const searchResults = useAtomValue(pdfSearchResultsAtom)
    const currentIndex = useAtomValue(pdfSearchCurrentIndexAtom)

    // Filter results for this specific page
    const pageResults = useMemo(() => {
        return searchResults.filter((result: PdfSearchResult) => result.pageIndex === pageIndex)
    }, [searchResults, pageIndex])

    // Find the current active result if it's on this page
    const activeResultOnThisPage = useMemo(() => {
        const currentResult = searchResults[currentIndex]
        return currentResult?.pageIndex === pageIndex ? currentResult : null
    }, [searchResults, currentIndex, pageIndex])

    if (pageResults.length === 0) {
        return null
    }

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{
                width: pageWidth * scale,
                height: pageHeight * scale
            }}
        >
            {pageResults.map((result, idx) => {
                const isActive = activeResultOnThisPage === result

                // Each result can have multiple rectangles (for text wrapping)
                return result.rects.map((rect, rectIdx) => {
                    // Use rect coordinates directly - they are already in the correct coordinate system
                    // Scale them to match the current zoom level
                    const x = rect.x * scale
                    const y = rect.y * scale
                    const width = rect.width * scale
                    const height = rect.height * scale

                    return (
                        <div
                            key={`search-${idx}-${rectIdx}`}
                            className={cn(
                                "absolute rounded-sm transition-all",
                                isActive
                                    ? "bg-yellow-400/60 ring-2 ring-yellow-500"
                                    : "bg-yellow-300/40"
                            )}
                            style={{
                                left: x,
                                top: y,
                                width,
                                height,
                                // Active result is more prominent
                                zIndex: isActive ? 10 : 5
                            }}
                        />
                    )
                })
            })}
        </div>
    )
})
