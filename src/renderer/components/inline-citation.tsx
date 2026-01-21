/**
 * Inline Citation Component
 *
 * Renders compact inline citations with hover tooltips
 * showing the source document and page number.
 */

import { memo } from 'react'
import { IconFileTypePdf, IconFile } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export interface CitationData {
    id: number
    filename: string
    pageNumber: number | null
    text: string
}

interface InlineCitationProps {
    citation: CitationData
    className?: string
}

/**
 * Get file type icon based on extension
 */
function getFileIcon(filename: string) {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') {
        return <IconFileTypePdf size={12} className="text-red-500" />
    }
    return <IconFile size={12} className="text-blue-500" />
}

/**
 * Get file extension badge color
 */
function getExtensionColor(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
        case 'pdf':
            return 'bg-red-500/10 text-red-600 border-red-500/20'
        case 'doc':
        case 'docx':
            return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
        case 'txt':
        case 'md':
            return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
        default:
            return 'bg-primary/10 text-primary border-primary/20'
    }
}

/**
 * Single inline citation badge
 * Shows as a small superscript number with file icon
 */
export const InlineCitation = memo(function InlineCitation({
    citation,
    className
}: InlineCitationProps) {
    const extColor = getExtensionColor(citation.filename)

    return (
        <span
            className={cn(
                "inline-flex items-center gap-0.5",
                "h-[15px] px-1 mx-0.5",
                "text-[9px] font-bold",
                extColor,
                "rounded border",
                "align-baseline relative -top-0.5",
                className
            )}
            title={citation.filename}
        >
            {getFileIcon(citation.filename)}
            <span>{citation.id}</span>
        </span>
    )
})

/**
 * Citations footer showing all sources at the end of a message
 * Each item has a HoverCard showing the quoted text
 */
interface CitationsFooterProps {
    citations: CitationData[]
    className?: string
}

export const CitationsFooter = memo(function CitationsFooter({
    citations,
    className
}: CitationsFooterProps) {
    if (!citations || citations.length === 0) return null

    // Get unique filenames
    const uniqueFiles = [...new Set(citations.map(c => c.filename))]

    return (
        <div className={cn(
            "mt-3 pt-2 border-t border-border/30",
            className
        )}>
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground/50">
                    Fuentes:
                </span>
                {uniqueFiles.map((filename) => (
                    <span
                        key={filename}
                        className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5",
                            "text-[10px] rounded border",
                            getExtensionColor(filename)
                        )}
                    >
                        {getFileIcon(filename)}
                        <span className="max-w-[150px] truncate">{filename}</span>
                    </span>
                ))}
            </div>
        </div>
    )
})

/**
 * Parse citation markers from text and extract citation data
 * Format: [[cite:ID|filename|page|text]]
 */
export function parseCitations(content: string): {
    processedContent: string
    citations: CitationData[]
} {
    const citations: CitationData[] = []
    const citationMap = new Map<number, CitationData>()

    // Pattern: [[cite:ID|filename|pageNumber|quotedText]]
    const citationPattern = /\[\[cite:(\d+)\|([^|]+)\|([^|]*)\|([^\]]+)\]\]/g

    const processedContent = content.replace(citationPattern, (_match, id, filename, page, text) => {
        const citationId = parseInt(id, 10)
        const pageNumber = page ? parseInt(page, 10) : null

        if (!citationMap.has(citationId)) {
            const citation: CitationData = {
                id: citationId,
                filename: filename.trim(),
                pageNumber,
                text: text.trim()
            }
            citationMap.set(citationId, citation)
            citations.push(citation)
        }

        // Return a placeholder that will be replaced by React component
        return `{{CITE:${citationId}}}`
    })

    return { processedContent, citations }
}

/**
 * Check if content contains citation markers
 */
export function hasCitations(content: string): boolean {
    return /\[\[cite:\d+\|/.test(content)
}
