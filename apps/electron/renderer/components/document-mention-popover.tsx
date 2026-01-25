/**
 * Document Mention Popover
 * Shows a list of Knowledge Base documents when user types "@"
 * Allows selecting a specific document to ask questions about
 */
import { useEffect, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
    IconFile,
    IconFileTypePdf,
    IconFileTypeDoc,
    IconFileTypeTxt,
    IconFileTypeJs,
    IconFileTypeCss,
    IconFileTypeHtml,
    IconFileCode,
    IconFileTypeTs,
    IconSearch,
    IconX,
} from '@tabler/icons-react'

export interface MentionableDocument {
    id: string
    filename: string
    bytes?: number
    status?: string
}

interface DocumentMentionPopoverProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (doc: MentionableDocument) => void
    documents: MentionableDocument[]
    searchQuery: string
    selectedIndex: number
    onSelectedIndexChange: (index: number) => void
}

function getFileIcon(filename: string, size = 16) {
    const ext = filename.split('.').pop()?.toLowerCase()

    switch (ext) {
        case 'pdf':
            return <IconFileTypePdf size={size} className="text-red-500" />
        case 'doc':
        case 'docx':
            return <IconFileTypeDoc size={size} className="text-blue-500" />
        case 'txt':
        case 'md':
            return <IconFileTypeTxt size={size} className="text-muted-foreground" />
        case 'js':
        case 'jsx':
            return <IconFileTypeJs size={size} className="text-yellow-500" />
        case 'ts':
        case 'tsx':
            return <IconFileTypeTs size={size} className="text-blue-400" />
        case 'css':
            return <IconFileTypeCss size={size} className="text-purple-500" />
        case 'html':
            return <IconFileTypeHtml size={size} className="text-orange-500" />
        case 'py':
        case 'java':
        case 'go':
        case 'rb':
        case 'php':
        case 'c':
        case 'cpp':
        case 'cs':
            return <IconFileCode size={size} className="text-green-500" />
        default:
            return <IconFile size={size} className="text-muted-foreground" />
    }
}

function formatFileSize(bytes?: number): string {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentMentionPopover({
    isOpen,
    onClose,
    onSelect,
    documents,
    searchQuery,
    selectedIndex,
    onSelectedIndexChange,
}: DocumentMentionPopoverProps) {
    const popoverRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // Filter documents based on search query (text after @)
    const filteredDocs = useMemo(() => {
        if (!searchQuery) return documents
        const query = searchQuery.toLowerCase()
        return documents.filter(doc =>
            doc.filename.toLowerCase().includes(query)
        )
    }, [documents, searchQuery])

    // Scroll selected item into view
    useEffect(() => {
        if (!listRef.current || selectedIndex < 0) return
        const items = listRef.current.querySelectorAll('[data-mention-item]')
        const selectedItem = items[selectedIndex] as HTMLElement
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
    }, [selectedIndex])

    // Reset selection when filtered docs change
    useEffect(() => {
        if (filteredDocs.length > 0 && selectedIndex >= filteredDocs.length) {
            onSelectedIndexChange(0)
        }
    }, [filteredDocs.length, selectedIndex, onSelectedIndexChange])

    // Handle click outside
    useEffect(() => {
        if (!isOpen) return

        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose()
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, onClose])

    if (!isOpen || documents.length === 0) return null

    return (
        <div
            ref={popoverRef}
            className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
                <div className="flex items-center gap-2">
                    <IconFile size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Knowledge Base
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full">
                        {filteredDocs.length} {filteredDocs.length === 1 ? 'doc' : 'docs'}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <IconX size={12} />
                </button>
            </div>

            {/* Search hint */}
            {searchQuery && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border/30">
                    <IconSearch size={12} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                        Filtering: <span className="font-medium text-foreground">{searchQuery}</span>
                    </span>
                </div>
            )}

            {/* Document list */}
            <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1">
                {filteredDocs.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No documents match "{searchQuery}"
                    </div>
                ) : (
                    filteredDocs.map((doc, index) => (
                        <button
                            key={doc.id}
                            type="button"
                            data-mention-item
                            onClick={() => onSelect(doc)}
                            onMouseEnter={() => onSelectedIndexChange(index)}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                                index === selectedIndex
                                    ? "bg-primary/10 text-foreground"
                                    : "hover:bg-accent/50 text-foreground/90"
                            )}
                        >
                            <div className="shrink-0">
                                {getFileIcon(doc.filename)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                    {doc.filename}
                                </div>
                                {doc.bytes && (
                                    <div className="text-[10px] text-muted-foreground">
                                        {formatFileSize(doc.bytes)}
                                    </div>
                                )}
                            </div>
                            {index === selectedIndex && (
                                <div className="shrink-0 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                                    Enter
                                </div>
                            )}
                        </button>
                    ))
                )}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-1.5 border-t border-border/50 bg-muted/20">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                        <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">↑↓</kbd> navigate
                        <span className="mx-2">·</span>
                        <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">Enter</kbd> select
                        <span className="mx-2">·</span>
                        <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">Esc</kbd> close
                    </span>
                </div>
            </div>
        </div>
    )
}

/**
 * Badge component to show selected document in input
 */
interface DocumentMentionBadgeProps {
    document: MentionableDocument
    onRemove: () => void
}

export function DocumentMentionBadge({ document, onRemove }: DocumentMentionBadgeProps) {
    return (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-sm">
            {getFileIcon(document.filename, 14)}
            <span className="font-medium text-primary truncate max-w-[150px]">
                {document.filename}
            </span>
            <button
                type="button"
                onClick={onRemove}
                className="p-0.5 rounded hover:bg-primary/20 text-primary/60 hover:text-primary transition-colors"
            >
                <IconX size={12} />
            </button>
        </div>
    )
}
