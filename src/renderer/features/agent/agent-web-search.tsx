import { memo, useState } from "react"
import { IconExternalLink } from "@tabler/icons-react"
import { SearchIcon, IconSpinner, ExpandIcon, CollapseIcon } from "./icons"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { getToolStatus, type ToolPart } from "./agent-tool-registry"
import { cn } from "@/lib/utils"

interface SearchResult {
  title: string
  url: string
  snippet?: string
  score?: number
}

interface AgentWebSearchProps {
  part: ToolPart
  chatStatus?: string
  isNativeSearch?: boolean
}

export const AgentWebSearch = memo(function AgentWebSearch({
  part,
  chatStatus,
  isNativeSearch,
}: AgentWebSearchProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const { isPending, isError } = getToolStatus(part, chatStatus)

  const query = (part.input?.query as string) || ""
  const results = (part.output?.results as SearchResult[]) || []
  const sources = (part.output?.sources as Array<{ url: string; title?: string }>) || []
  const error = part.output?.error as string | undefined

  const resultCount = results.length || sources.length || 0
  const hasResults = resultCount > 0

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header - clickable to toggle expand */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center justify-between px-2.5 h-7 w-full text-left",
          "cursor-pointer hover:bg-muted/50 transition-colors duration-150",
        )}
      >
        <div className="flex items-center gap-1.5 text-xs truncate flex-1 min-w-0">
          <SearchIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />

          {isPending ? (
            <TextShimmer
              as="span"
              duration={1.2}
              className="text-xs text-muted-foreground"
            >
              Searching web
            </TextShimmer>
          ) : (
            <span className="text-xs text-muted-foreground">Searched web</span>
          )}

          <span className="truncate text-foreground">
            "{query}"
            {isNativeSearch && (
              <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-600 font-medium">
                Native
              </span>
            )}
          </span>
        </div>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="flex items-center gap-1.5 text-xs">
            {isPending ? (
              <IconSpinner className="w-3 h-3" />
            ) : isError || error ? (
              <span className="text-destructive">Failed</span>
            ) : (
              <span className="text-muted-foreground">
                {resultCount} result{resultCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Expand/Collapse icon */}
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
        </div>
      </button>

      {/* Content - expandable */}
      {isExpanded && !isPending && (
        <div className="border-t border-border">
          {/* Error */}
          {error && (
            <div className="px-2.5 py-2 bg-red-500/5">
              <p className="text-xs text-red-500">{error}</p>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="divide-y divide-border/30">
              {results.slice(0, 5).map((item, index) => (
                <SearchResultItem key={`${item.url}-${index}`} result={item} />
              ))}
              {results.length > 5 && (
                <div className="px-2.5 py-2 text-xs text-muted-foreground">
                  +{results.length - 5} more results
                </div>
              )}
            </div>
          )}

          {/* Sources (for native OpenAI search) */}
          {sources.length > 0 && results.length === 0 && (
            <div className="divide-y divide-border/30">
              {sources.slice(0, 5).map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-2.5 py-2 hover:bg-muted/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-foreground group-hover:text-violet-600 transition-colors truncate block">
                      {source.title || source.url}
                    </span>
                    <span className="text-xs text-muted-foreground truncate block">
                      {(() => { try { return new URL(source.url).hostname } catch { return source.url } })()}
                    </span>
                  </div>
                  <IconExternalLink size={14} className="text-muted-foreground shrink-0 ml-2 group-hover:text-violet-500" />
                </a>
              ))}
            </div>
          )}

          {/* No results */}
          {!hasResults && !error && (
            <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  )
})

function SearchResultItem({ result }: { result: SearchResult }) {
  const domain = (() => {
    try {
      return new URL(result.url).hostname
    } catch {
      return result.url
    }
  })()

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start justify-between px-2.5 py-2 hover:bg-muted/30 transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground group-hover:text-violet-600 transition-colors line-clamp-1">
          {result.title}
        </span>
        <span className="text-xs text-muted-foreground block">
          {domain}
        </span>
        {result.snippet && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {result.snippet}
          </p>
        )}
      </div>
      <IconExternalLink size={14} className="text-muted-foreground shrink-0 mt-0.5 ml-2 group-hover:text-violet-500" />
    </a>
  )
}

// Legacy interface for backwards compatibility
export interface WebSearchResult {
  query: string
  results: SearchResult[]
  sources?: Array<{ url: string; title?: string }>
  error?: string
}

export interface AgentWebSearchProps_Legacy {
  toolCallId: string
  args: {
    query: string
    maxResults?: number
    searchType?: 'general' | 'news'
  }
  result?: WebSearchResult
  status: 'pending' | 'executing' | 'complete' | 'error'
  isNativeSearch?: boolean
  className?: string
}
