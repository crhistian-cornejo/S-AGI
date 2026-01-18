import { memo, useState } from "react"
import { IconFile, IconChevronDown, IconChevronRight } from "@tabler/icons-react"
import { FileSearchIcon, IconSpinner } from "./icons"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { getToolStatus, type ToolPart } from "./agent-tool-registry"
import { cn } from "@/lib/utils"

interface FileSearchResult {
  filename: string
  score?: number
  text?: string
}

interface AgentFileSearchProps {
  part: ToolPart
  chatStatus?: string
}

export const AgentFileSearch = memo(function AgentFileSearch({
  part,
  chatStatus,
}: AgentFileSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { isPending, isError } = getToolStatus(part, chatStatus)

  const error = part.output?.error as string | undefined
  // File search results from vector store
  const results = (part.output?.results as FileSearchResult[]) || []
  const resultsCount = results.length || (part.output?.count as number) || 0

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden mx-2">
      {/* Header - clickable to toggle expand */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center justify-between px-2.5 h-8 w-full text-left",
          "cursor-pointer hover:bg-blue-500/10 transition-colors duration-150",
        )}
      >
        <div className="flex items-center gap-2 text-xs truncate flex-1 min-w-0">
          <FileSearchIcon className="w-4 h-4 flex-shrink-0 text-blue-500" />

          {isPending ? (
            <TextShimmer
              as="span"
              duration={1.2}
              className="text-sm font-medium text-blue-600 dark:text-blue-400"
            >
              Searching Knowledge Base...
            </TextShimmer>
          ) : (
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Searched Knowledge Base
            </span>
          )}

          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold">
            Documents
          </span>
        </div>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="flex items-center gap-1.5 text-xs">
            {isPending ? (
              <IconSpinner className="w-3.5 h-3.5 text-blue-500" />
            ) : isError || error ? (
              <span className="text-destructive font-medium">Failed</span>
            ) : (
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                {resultsCount > 0 ? `${resultsCount} result${resultsCount !== 1 ? 's' : ''}` : "Done"}
              </span>
            )}
          </div>
          
          {/* Expand/collapse indicator */}
          {!isPending && resultsCount > 0 && (
            isExpanded ? (
              <IconChevronDown size={14} className="text-blue-500" />
            ) : (
              <IconChevronRight size={14} className="text-blue-500" />
            )
          )}
        </div>
      </button>
      
      {/* Expanded results */}
      {isExpanded && !isPending && results.length > 0 && (
        <div className="border-t border-blue-500/20 max-h-48 overflow-y-auto">
          {results.slice(0, 5).map((result, index) => (
            <div 
              key={`${result.filename}-${index}`}
              className="px-3 py-2 hover:bg-blue-500/10 transition-colors border-b border-blue-500/10 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <IconFile size={14} className="text-blue-500 shrink-0" />
                <span className="text-xs font-medium text-foreground truncate">
                  {result.filename}
                </span>
                {result.score !== undefined && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {Math.round(result.score * 100)}% match
                  </span>
                )}
              </div>
              {result.text && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 pl-5">
                  {result.text}
                </p>
              )}
            </div>
          ))}
          {results.length > 5 && (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
              +{results.length - 5} more results
            </div>
          )}
        </div>
      )}
    </div>
  )
})
