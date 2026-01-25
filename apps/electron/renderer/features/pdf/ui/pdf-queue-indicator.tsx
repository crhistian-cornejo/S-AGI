"use client"

import { memo, useState, useCallback, useEffect } from "react"
import { IconChevronDown, IconX } from "@tabler/icons-react"
import { motion, AnimatePresence } from "motion/react"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { createTextPreview } from "../lib/queue-utils"
import type { PdfQueueItem } from "../lib/queue-utils"

const QUEUE_EXPANDED_KEY = "pdf-queue-expanded"

// Queue item row component
const QueueItemRow = memo(function QueueItemRow({
    item,
    onRemove,
}: {
    item: PdfQueueItem
    onRemove?: (itemId: string) => void
}) {
    const handleRemove = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            onRemove?.(item.id)
        },
        [item.id, onRemove]
    )

    // Get display text - truncate message and show attachment count
    const hasAttachments = item.selectedText !== undefined
    const attachmentCount = hasAttachments ? 1 : 0

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors cursor-default">
            <span className="truncate flex-1 text-foreground">
                {createTextPreview(item.query, 60)}
            </span>
            {hasAttachments && (
                <span className="flex-shrink-0 text-muted-foreground text-[10px]">
                    +{attachmentCount} context
                </span>
            )}
            <div className="flex items-center gap-1">
                {onRemove && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={handleRemove}
                                className="flex-shrink-0 p-1 hover:bg-foreground/10 rounded text-muted-foreground hover:text-foreground transition-all"
                            >
                                <IconX className="w-3.5 h-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Remove</TooltipContent>
                    </Tooltip>
                )}
            </div>
        </div>
    )
})

interface PdfQueueIndicatorProps {
    queue: PdfQueueItem[]
    onRemoveItem?: (itemId: string) => void
}

export const PdfQueueIndicator = memo(function PdfQueueIndicator({
    queue,
    onRemoveItem,
}: PdfQueueIndicatorProps) {
    // Load expanded state from localStorage
    const [isExpanded, setIsExpanded] = useState(() => {
        if (typeof window === "undefined") return true
        const saved = localStorage.getItem(QUEUE_EXPANDED_KEY)
        return saved !== null ? saved === "true" : true // Default to expanded
    })

    // Save expanded state to localStorage
    useEffect(() => {
        localStorage.setItem(QUEUE_EXPANDED_KEY, String(isExpanded))
    }, [isExpanded])

    if (queue.length === 0) {
        return null
    }

    return (
        <div
            className="border border-border bg-muted/30 overflow-hidden flex flex-col rounded-t-xl border-b-0 pb-4"
        >
            {/* Header - at top */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => setIsExpanded(!isExpanded)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setIsExpanded(!isExpanded)
                    }
                }}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Collapse" : "Expand"} queue`}
                className="flex items-center justify-between pr-1 pl-3 h-8 cursor-pointer hover:bg-muted/50 transition-colors duration-150 focus:outline-none rounded-sm"
            >
                <div className="flex items-center gap-2 text-xs flex-1 min-w-0">
                    <IconChevronDown
                        className={cn(
                            "w-4 h-4 text-muted-foreground transition-transform duration-200",
                            !isExpanded && "-rotate-90"
                        )}
                    />
                    <span className="text-xs text-muted-foreground">
                        {queue.length} question{queue.length !== 1 ? 's' : ''} in queue
                    </span>
                </div>
            </div>

            {/* Expanded content - queue items */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-border max-h-[200px] overflow-y-auto">
                            {queue.map((item) => (
                                <QueueItemRow
                                    key={item.id}
                                    item={item}
                                    onRemove={onRemoveItem}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
})
