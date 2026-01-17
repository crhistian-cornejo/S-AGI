import { memo, useState } from "react"
import { GlobeIcon, IconSpinner, ExpandIcon, CollapseIcon } from "./icons"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { getToolStatus, type ToolPart } from "./agent-tool-registry"
import { cn } from "@/lib/utils"

interface AgentWebFetchProps {
  part: ToolPart
  chatStatus?: string
}

export const AgentWebFetch = memo(function AgentWebFetch({
  part,
  chatStatus,
}: AgentWebFetchProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { isPending, isError } = getToolStatus(part, chatStatus)

  const url = (part.input?.url as string) || ""
  const result = (part.output?.result as string) || (part.output?.content as string) || ""
  const bytes = (part.output?.bytes as number) || 0
  const statusCode = part.output?.code as number | undefined
  const isSuccess = statusCode === 200

  // Extract hostname for display
  let hostname = ""
  try {
    hostname = new URL(url).hostname.replace("www.", "")
  } catch {
    hostname = url.slice(0, 30)
  }

  // Format bytes
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const hasContent = result.length > 0

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header - clickable to toggle expand */}
      <button
        type="button"
        onClick={() => hasContent && !isPending && setIsExpanded(!isExpanded)}
        disabled={!hasContent || isPending}
        className={cn(
          "flex items-center justify-between px-2.5 h-7 w-full text-left",
          hasContent && !isPending && "cursor-pointer hover:bg-muted/50 transition-colors duration-150",
        )}
      >
        <div className="flex items-center gap-1.5 text-xs truncate flex-1 min-w-0">
          <GlobeIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />

          {isPending ? (
            <TextShimmer
              as="span"
              duration={1.2}
              className="text-xs text-muted-foreground"
            >
              Fetching
            </TextShimmer>
          ) : (
            <span className="text-xs text-muted-foreground">Fetched</span>
          )}

          <span className="truncate text-foreground">{hostname}</span>
        </div>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="flex items-center gap-1.5 text-xs">
            {isPending ? (
              <IconSpinner className="w-3 h-3" />
            ) : isError || !isSuccess ? (
              <span className="text-destructive">
                {statusCode ? `Error ${statusCode}` : "Failed"}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {formatBytes(bytes)}
              </span>
            )}
          </div>

          {/* Expand/Collapse icon */}
          {hasContent && !isPending && (
            <div className="relative w-4 h-4">
              <ExpandIcon
                className={cn(
                  "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                  isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100",
                )}
              />
              <CollapseIcon
                className={cn(
                  "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                  isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
                )}
              />
            </div>
          )}
        </div>
      </button>

      {/* Content - expandable */}
      {hasContent && isExpanded && (
        <div className="border-t border-border max-h-[300px] overflow-y-auto">
          <pre className="px-2.5 py-2 text-xs text-foreground whitespace-pre-wrap break-words font-mono">
            {result}
          </pre>
        </div>
      )}
    </div>
  )
})

// Legacy interface for backwards compatibility
export interface WebFetchResult {
  url: string
  title?: string
  content?: string
  statusCode?: number
  error?: string
  contentType?: string
  wordCount?: number
}

export interface AgentWebFetchProps_Legacy {
  toolCallId: string
  args: {
    url: string
    format?: 'text' | 'markdown' | 'html'
    timeout?: number
  }
  result?: WebFetchResult
  status: 'pending' | 'executing' | 'complete' | 'error'
  className?: string
}
