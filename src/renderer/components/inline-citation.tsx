/**
 * Inline Citation Component
 *
 * Renders compact inline citations with hover tooltips
 * showing the source document and page number.
 */

import { memo } from 'react'
import * as HoverCard from '@radix-ui/react-hover-card'
import { IconFileTypePdf, IconFile, IconFileText } from '@tabler/icons-react'
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
    /** Callback when citation is clicked (for navigation to PDF tab) */
    onNavigate?: (citation: CitationData) => void
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
 * Includes HoverCard showing document details on hover
 */
export const InlineCitation = memo(function InlineCitation({
    citation,
    className,
    onNavigate
}: InlineCitationProps) {
    const extColor = getExtensionColor(citation.filename)
    const isPdf = citation.filename.toLowerCase().endsWith('.pdf')
    const isClickable = isPdf && onNavigate

    const handleClick = (e: React.MouseEvent) => {
        if (isClickable) {
            e.preventDefault()
            e.stopPropagation()
            onNavigate(citation)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            e.stopPropagation()
            onNavigate(citation)
        }
    }

    return (
        <HoverCard.Root openDelay={100} closeDelay={150}>
            <HoverCard.Trigger asChild>
                <button
                    type="button"
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    className={cn(
                        "inline-flex items-center gap-0.5",
                        "h-[15px] px-1 mx-0.5",
                        "text-[9px] font-bold",
                        extColor,
                        "rounded border",
                        "align-baseline relative -top-0.5",
                        "cursor-pointer hover:opacity-80 transition-opacity",
                        isClickable && "hover:ring-2 hover:ring-primary/30 hover:scale-105",
                        className
                    )}
                    title={isClickable ? `Abrir ${citation.filename} en pestaña PDF` : undefined}
                    aria-label={`Cita ${citation.id}: ${citation.filename}${citation.pageNumber ? `, página ${citation.pageNumber}` : ''}`}
                >
                    {getFileIcon(citation.filename)}
                    <span>{citation.id}</span>
                </button>
            </HoverCard.Trigger>
            <HoverCard.Portal>
                <HoverCard.Content
                    side="top"
                    align="center"
                    sideOffset={6}
                    className="z-50 w-72 rounded-xl border border-border bg-popover/95 p-3 shadow-xl backdrop-blur animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                >
                    {/* Header with file info */}
                    <div className="flex items-start gap-2 mb-2">
                        <div className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                            getExtensionColor(citation.filename).replace('border-', 'bg-').replace('/20', '/30')
                        )}>
                            <IconFileText size={16} className="opacity-80" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                                {citation.filename}
                            </p>
                            {citation.pageNumber && (
                                <p className="text-xs text-muted-foreground">
                                    Página {citation.pageNumber}
                                </p>
                            )}
                        </div>
                        <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            extColor
                        )}>
                            [{citation.id}]
                        </span>
                    </div>

                    {/* Quoted text */}
                    {citation.text && citation.text !== 'Fuente citada del documento' && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                            <p className="text-xs text-muted-foreground italic line-clamp-4">
                                "{citation.text}"
                            </p>
                        </div>
                    )}

                    <HoverCard.Arrow className="fill-border" />
                </HoverCard.Content>
            </HoverCard.Portal>
        </HoverCard.Root>
    )
})

/**
 * Citations footer showing all sources at the end of a message
 * Each item has a HoverCard showing the quoted text
 */
interface CitationsFooterProps {
    citations: CitationData[]
    className?: string
    /** Callback when a citation is clicked (for navigation to PDF tab) */
    onNavigate?: (citation: CitationData) => void
}

export const CitationsFooter = memo(function CitationsFooter({
    citations,
    className,
    onNavigate
}: CitationsFooterProps) {
    if (!citations || citations.length === 0) return null

    // Group citations by filename
    const citationsByFile = new Map<string, CitationData[]>()
    for (const citation of citations) {
        const existing = citationsByFile.get(citation.filename) || []
        existing.push(citation)
        citationsByFile.set(citation.filename, existing)
    }

    return (
        <div className={cn(
            "mt-3 pt-2 border-t border-border/30",
            className
        )}>
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground/50">
                    Fuentes:
                </span>
                {[...citationsByFile.entries()].map(([filename, fileCitations]) => {
                    const isPdf = filename.toLowerCase().endsWith('.pdf')
                    const isClickable = isPdf && onNavigate
                    const firstCitation = fileCitations[0]

                    const handleClick = (e: React.MouseEvent) => {
                        if (isClickable && firstCitation) {
                            e.preventDefault()
                            e.stopPropagation()
                            onNavigate(firstCitation)
                        }
                    }

                    const handleKeyDown = (e: React.KeyboardEvent) => {
                        if (isClickable && firstCitation && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault()
                            e.stopPropagation()
                            onNavigate(firstCitation)
                        }
                    }

                    return (
                    <HoverCard.Root key={filename} openDelay={100} closeDelay={150}>
                        <HoverCard.Trigger asChild>
                            <button
                                type="button"
                                onClick={handleClick}
                                onKeyDown={handleKeyDown}
                                className={cn(
                                    "inline-flex items-center gap-1 px-1.5 py-0.5",
                                    "text-[10px] rounded border cursor-pointer",
                                    "hover:opacity-80 transition-opacity",
                                    isClickable && "hover:ring-2 hover:ring-primary/30 hover:scale-105",
                                    getExtensionColor(filename)
                                )}
                                title={isClickable ? `Abrir ${filename} en pestaña PDF` : undefined}
                                aria-label={`Fuente: ${filename}`}
                            >
                                {getFileIcon(filename)}
                                <span className="max-w-[150px] truncate">{filename}</span>
                            </button>
                        </HoverCard.Trigger>
                        <HoverCard.Portal>
                            <HoverCard.Content
                                side="top"
                                align="center"
                                sideOffset={6}
                                className="z-50 w-80 rounded-xl border border-border bg-popover/95 p-3 shadow-xl backdrop-blur animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                            >
                                {/* Header */}
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={cn(
                                        "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
                                        getExtensionColor(filename).replace('border-', 'bg-').replace('/20', '/30')
                                    )}>
                                        <IconFileText size={16} className="opacity-80" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                            {filename}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {fileCitations.length} cita{fileCitations.length !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </div>

                                {/* Citation excerpts */}
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {fileCitations.map((citation) => (
                                        <div
                                            key={citation.id}
                                            className="text-xs p-2 rounded-lg bg-muted/50 border border-border/30"
                                        >
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className={cn(
                                                    "text-[9px] font-bold px-1 py-0.5 rounded",
                                                    getExtensionColor(filename)
                                                )}>
                                                    [{citation.id}]
                                                </span>
                                                {citation.pageNumber && (
                                                    <span className="text-muted-foreground">
                                                        Pág. {citation.pageNumber}
                                                    </span>
                                                )}
                                            </div>
                                            {citation.text && citation.text !== 'Fuente citada del documento' && (
                                                <p className="text-muted-foreground italic line-clamp-2">
                                                    "{citation.text}"
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <HoverCard.Arrow className="fill-border" />
                            </HoverCard.Content>
                        </HoverCard.Portal>
                    </HoverCard.Root>
                    )
                })}
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
