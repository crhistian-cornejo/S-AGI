/**
 * Agent Thinking Block - Improved thinking/reasoning display
 *
 * Features:
 * - Auto-expand while streaming, auto-collapse when done
 * - Preview text (60 chars) when collapsed
 * - Gradient fade for long content
 * - Blinking cursor during streaming
 * - Auto-scroll to bottom
 */

import { memo, useState, useEffect, useRef, useMemo } from "react"
import { cn } from "@/lib/utils"
import { IconChevronRight } from "@tabler/icons-react"
import { BrainIcon, IconSpinner } from "./icons"

// Constants
const PREVIEW_LENGTH = 60
const SCROLL_THRESHOLD = 500

interface AgentThinkingBlockProps {
  /** The thinking/reasoning content */
  content: string
  /** Whether actively streaming */
  isStreaming?: boolean
  /** Total thinking time in milliseconds */
  durationMs?: number
  /** Custom className */
  className?: string
}

function formatThinkingDuration(ms?: number) {
  if (!ms || ms <= 0) return ""
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`
}

export const AgentThinkingBlock = memo(function AgentThinkingBlock({
  content,
  isStreaming = false,
  durationMs,
  className,
}: AgentThinkingBlockProps) {
  // Default: expanded while streaming, collapsed when done
  const [isExpanded, setIsExpanded] = useState(isStreaming)
  const wasStreamingRef = useRef(isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setIsExpanded(false)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [content, isStreaming, isExpanded])

  // Build preview text for collapsed state
  const previewText = useMemo(() => {
    if (!content) return ""
    return content.slice(0, PREVIEW_LENGTH).replace(/\n/g, " ").trim()
  }, [content])

  const hasContent = content.length > 0
  const hasLongContent = content.length > SCROLL_THRESHOLD

  // Header label
  const headerLabel = isStreaming
    ? "Thinking"
    : durationMs
      ? `Thought for ${formatThinkingDuration(durationMs)}`
      : "Thought"

  if (!hasContent && !isStreaming) return null

  return (
    <div className={cn("py-1", className)}>
      {/* Header - clickable to toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="group w-full flex items-center gap-1.5 py-0.5 hover:bg-muted/30 rounded-md transition-colors"
      >
        {/* Icon */}
        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
          {isStreaming ? (
            <IconSpinner className="w-3.5 h-3.5 text-primary" />
          ) : (
            <BrainIcon className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Title */}
        <span
          className={cn(
            "text-sm",
            isStreaming ? "text-foreground font-medium" : "text-muted-foreground"
          )}
        >
          {headerLabel}
        </span>

        {/* Preview text when collapsed */}
        {!isExpanded && previewText && (
          <span className="text-xs text-muted-foreground/50 truncate max-w-[200px]">
            {previewText}...
          </span>
        )}

        {/* Chevron */}
        <IconChevronRight
          size={12}
          className={cn(
            "text-muted-foreground/60 transition-transform duration-200 ml-auto mr-1",
            isExpanded && "rotate-90",
            !isExpanded && "opacity-0 group-hover:opacity-100"
          )}
        />
      </button>

      {/* Content - only show when expanded */}
      {isExpanded && hasContent && (
        <div className="relative mt-1 ml-5">
          {/* Top gradient fade when streaming and has lots of content */}
          {isStreaming && hasLongContent && (
            <div className="absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-background/70 to-transparent z-10 pointer-events-none" />
          )}

          {/* Scrollable container */}
          <div
            ref={scrollRef}
            className={cn(
              "border-l-2 border-border/40 pl-3",
              "text-xs text-muted-foreground/80 leading-relaxed",
              "font-mono whitespace-pre-wrap break-words min-w-0 max-w-full",
              isStreaming && hasLongContent
                ? "overflow-y-auto scrollbar-none max-h-24"
                : "max-h-64 overflow-y-auto"
            )}
          >
            {content}
            {/* Blinking cursor when streaming */}
            {isStreaming && (
              <span className="inline-block w-1 h-3 bg-primary/60 ml-0.5 animate-pulse" />
            )}
          </div>
        </div>
      )}

      {/* Loading dots when streaming but no content yet */}
      {isStreaming && !hasContent && (
        <div className="mt-1 ml-5 flex items-center gap-1">
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse" />
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:150ms]" />
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:300ms]" />
        </div>
      )}
    </div>
  )
})

export default AgentThinkingBlock
