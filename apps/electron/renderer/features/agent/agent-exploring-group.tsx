/**
 * Agent Exploring Group - Groups consecutive search/read tools
 *
 * Shows a collapsible "Explored 5 files, 2 searches" summary
 * with auto-expand during streaming and auto-collapse when done.
 */

import { memo, useState, useEffect, useRef, useMemo } from "react"
import { cn } from "@/lib/utils"
import { IconChevronRight, IconLoader2 } from "@tabler/icons-react"
import { AgentToolRegistry, getToolStatus, type ToolPart } from "./agent-tool-registry"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { TextShimmer } from "@/components/ui/text-shimmer"

// Tools that should be grouped in "Exploring" section
export const EXPLORING_TOOLS = new Set([
  "tool-Read",
  "tool-Grep",
  "tool-Glob",
  "tool-WebSearch",
  "tool-WebFetch",
])

// Constants for rendering
const MAX_VISIBLE_TOOLS = 5
const TOOL_HEIGHT_PX = 28

interface AgentExploringGroupProps {
  parts: ToolPart[]
  chatStatus?: string
  projectPath?: string
}

export const AgentExploringGroup = memo(function AgentExploringGroup({
  parts,
  chatStatus,
  projectPath,
}: AgentExploringGroupProps) {
  const isStreaming = chatStatus === "streaming" || chatStatus === "submitted"

  // Default: expanded while streaming, collapsed when done
  const [isExpanded, setIsExpanded] = useState(isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wasStreamingRef = useRef(isStreaming)

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setIsExpanded(false)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  // Auto-scroll to bottom when streaming and new parts added
  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [parts.length, isStreaming, isExpanded])

  // Count files (Read, Grep, Glob) and searches (WebSearch, WebFetch)
  const { fileCount, searchCount, hasPending } = useMemo(() => {
    let files = 0
    let searches = 0
    let pending = false

    for (const p of parts) {
      const { isPending } = getToolStatus(p, chatStatus)
      if (isPending) pending = true

      if (["tool-Read", "tool-Grep", "tool-Glob"].includes(p.type)) {
        files++
      } else if (["tool-WebSearch", "tool-WebFetch"].includes(p.type)) {
        searches++
      }
    }

    return { fileCount: files, searchCount: searches, hasPending: pending }
  }, [parts, chatStatus])

  // Build subtitle
  const subtitle = useMemo(() => {
    const subtitleParts: string[] = []
    if (fileCount > 0) {
      subtitleParts.push(`${fileCount} ${fileCount === 1 ? "file" : "files"}`)
    }
    if (searchCount > 0) {
      subtitleParts.push(`${searchCount} ${searchCount === 1 ? "search" : "searches"}`)
    }
    return subtitleParts.join(", ")
  }, [fileCount, searchCount])

  if (parts.length === 0) return null

  return (
    <div className="py-1">
      {/* Header - clickable to toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="group w-full flex items-center gap-1.5 py-0.5 hover:bg-muted/30 rounded-md transition-colors"
      >
        {/* Chevron */}
        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
          <IconChevronRight
            size={14}
            className={cn(
              "text-muted-foreground/60 transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
          />
        </div>

        {/* Title */}
        <span className="text-sm text-muted-foreground">
          {hasPending ? (
            <TextShimmer as="span" duration={1.2} className="text-sm">
              Exploring
            </TextShimmer>
          ) : (
            "Explored"
          )}
        </span>

        {/* Subtitle */}
        <span className="text-xs text-muted-foreground/60">
          {subtitle}
        </span>

        {/* Spinner if pending */}
        {hasPending && (
          <IconLoader2 size={12} className="text-primary animate-spin ml-auto mr-1" />
        )}
      </button>

      {/* Tools list - only show when expanded */}
      {isExpanded && (
        <div className="relative mt-1 ml-5 border-l border-border/50 pl-2">
          {/* Top gradient fade when streaming and has many items */}
          {isStreaming && parts.length > MAX_VISIBLE_TOOLS && (
            <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
          )}

          {/* Scrollable container */}
          <div
            ref={scrollRef}
            className={cn(
              "space-y-0.5",
              parts.length > MAX_VISIBLE_TOOLS && "overflow-y-auto scrollbar-hide"
            )}
            style={
              parts.length > MAX_VISIBLE_TOOLS
                ? { maxHeight: `${MAX_VISIBLE_TOOLS * TOOL_HEIGHT_PX}px` }
                : undefined
            }
          >
            {parts.map((part, idx) => (
              <ExploringToolItem
                key={idx}
                part={part}
                chatStatus={chatStatus}
                projectPath={projectPath}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// Individual tool item within the exploring group
const ExploringToolItem = memo(function ExploringToolItem({
  part,
  chatStatus,
  projectPath,
}: {
  part: ToolPart
  chatStatus?: string
  projectPath?: string
}) {
  const meta = AgentToolRegistry[part.type]
  if (!meta) {
    return (
      <div className="text-xs text-muted-foreground py-0.5">
        {part.type?.replace("tool-", "")}
      </div>
    )
  }

  const { isPending, isError, isSuccess } = getToolStatus(part, chatStatus)
  const Icon = meta.icon
  const title = meta.title(part)
  const subtitle = meta.subtitle?.(part)
  const tooltipContent = meta.tooltipContent?.(part, projectPath)

  const content = (
    <div
      className={cn(
        "flex items-center gap-2 py-0.5 text-xs",
        isPending && "text-foreground",
        isSuccess && "text-muted-foreground",
        isError && "text-destructive"
      )}
    >
      {/* Icon */}
      <div className="shrink-0 w-4 h-4 flex items-center justify-center">
        {isPending ? (
          <IconLoader2 size={12} className="animate-spin text-primary" />
        ) : (
          <Icon className="w-3 h-3" />
        )}
      </div>

      {/* Title */}
      <span className={cn(isPending && "font-medium")}>
        {isPending ? (
          <TextShimmer as="span" duration={1.2} className="text-xs">
            {title}
          </TextShimmer>
        ) : (
          title
        )}
      </span>

      {/* Subtitle */}
      {subtitle && (
        <span
          className="text-muted-foreground/60 truncate"
          dangerouslySetInnerHTML={{ __html: subtitle }}
        />
      )}
    </div>
  )

  // Wrap with tooltip if tooltipContent is available
  if (tooltipContent) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            {content}
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-mono">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return content
})

/**
 * Helper to check if a tool type should be grouped
 */
export function isExploringTool(toolType: string): boolean {
  return EXPLORING_TOOLS.has(toolType)
}

/**
 * Groups consecutive exploring tools from a list of parts
 */
export function groupExploringTools(parts: ToolPart[]): Array<{ type: "exploring-group"; parts: ToolPart[] } | ToolPart> {
  const result: Array<{ type: "exploring-group"; parts: ToolPart[] } | ToolPart> = []
  let currentGroup: ToolPart[] = []

  for (const part of parts) {
    if (isExploringTool(part.type)) {
      currentGroup.push(part)
    } else {
      // Flush current group if it has 3+ items
      if (currentGroup.length >= 3) {
        result.push({ type: "exploring-group", parts: currentGroup })
      } else {
        // Add individually if less than 3
        result.push(...currentGroup)
      }
      currentGroup = []
      result.push(part)
    }
  }

  // Flush remaining group
  if (currentGroup.length >= 3) {
    result.push({ type: "exploring-group", parts: currentGroup })
  } else {
    result.push(...currentGroup)
  }

  return result
}

export default AgentExploringGroup
