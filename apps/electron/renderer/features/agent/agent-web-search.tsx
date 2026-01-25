import { memo, useState, useMemo } from "react"
import { IconExternalLink, IconWorld, IconLoader2 } from "@tabler/icons-react"
import { SearchIcon, ExpandIcon, CollapseIcon } from "./icons"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { getToolStatus, type ToolPart } from "./agent-tool-registry"
import { cn } from "@/lib/utils"

interface SearchResult {
  title: string
  url: string
  snippet?: string
  score?: number
}

interface Source {
  url: string
  title?: string
}

interface AgentWebSearchProps {
  part: ToolPart
  chatStatus?: string
  isNativeSearch?: boolean
}

/**
 * Single web search component (legacy)
 */
export const AgentWebSearch = memo(function AgentWebSearch({
  part,
  chatStatus,
  isNativeSearch,
}: AgentWebSearchProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const { isPending, isError } = getToolStatus(part, chatStatus)

  const query = (part.input?.query as string) || ""
  const results = (part.output?.results as SearchResult[]) || []
  const sources = (part.output?.sources as Source[]) || []
  const error = part.output?.error as string | undefined

  const headerLabel = query || (isNativeSearch ? "Web search" : "Search")
  const headerDomain = (() => {
    if (sources.length > 0) {
      try {
        return new URL(sources[0].url).hostname
      } catch {
        return sources[0].url
      }
    }
    return ""
  })()

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

          <div className="min-w-0">
            <span className="truncate text-foreground block">
              "{headerLabel}"
              {isNativeSearch && (
                <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-600 font-medium">
                  Native
                </span>
              )}
            </span>
            {headerDomain && (
              <span className="truncate text-[10px] text-muted-foreground block">
                {headerDomain}
              </span>
            )}
          </div>
        </div>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="flex items-center gap-1.5 text-xs">
            {isPending ? (
              <IconLoader2 className="w-3 h-3 animate-spin" />
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
                <SourceItem key={`${source.url}-${index}`} source={source} />
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

// ============================================================================
// Consolidated Web Search Component - Groups multiple searches into one UI
// ============================================================================

interface WebSearchItem {
  searchId: string
  query?: string
  status: 'searching' | 'done'
  action?: 'search' | 'open_page' | 'find_in_page'
  domains?: string[]
  url?: string
}

interface ConsolidatedWebSearchProps {
  searches: WebSearchItem[]
  isNativeSearch?: boolean
}

/**
 * Consolidated web search component that groups multiple searches into a single UI
 * Shows accumulated sources and progress across all searches
 */
export const ConsolidatedWebSearch = memo(function ConsolidatedWebSearch({
  searches,
  isNativeSearch = true,
}: ConsolidatedWebSearchProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Aggregate all sources from all searches
  const { allSources, isSearching, currentQuery } = useMemo(() => {
    const sourcesSet = new Map<string, Source>()
    let searching = false
    let done = 0
    let latestQuery = ''

    for (const search of searches) {
      if (search.status === 'searching') {
        searching = true
        if (search.query) latestQuery = search.query
      } else {
        done++
      }

      // Collect domains as sources
      if (search.domains) {
        for (const domain of search.domains) {
          const url = domain.startsWith('http') ? domain : `https://${domain}`
          if (!sourcesSet.has(url)) {
            sourcesSet.set(url, { url, title: domain })
          }
        }
      }

      // Collect URL if present
      if (search.url) {
        const url = search.url.startsWith('http') ? search.url : `https://${search.url}`
        if (!sourcesSet.has(url)) {
          try {
            const hostname = new URL(url).hostname
            sourcesSet.set(url, { url, title: hostname })
          } catch {
            sourcesSet.set(url, { url, title: search.url })
          }
        }
      }

      // Use query as latest if available
      if (search.query && !latestQuery) {
        latestQuery = search.query
      }
    }

    return {
      allSources: Array.from(sourcesSet.values()),
      isSearching: searching,
      doneCount: done,
      totalCount: searches.length,
      currentQuery: latestQuery
    }
  }, [searches])

  const sourceCount = allSources.length

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center justify-between px-2.5 h-8 w-full text-left",
          "cursor-pointer hover:bg-muted/50 transition-colors duration-150",
        )}
      >
        <div className="flex items-center gap-2 text-xs truncate flex-1 min-w-0">
          {isSearching ? (
            <IconLoader2 className="w-3.5 h-3.5 flex-shrink-0 text-violet-500 animate-spin" />
          ) : (
            <IconWorld className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
          )}

          {isSearching ? (
            <TextShimmer
              as="span"
              duration={1.2}
              className="text-xs font-medium"
            >
              Searching the web...
            </TextShimmer>
          ) : (
            <span className="text-xs text-foreground font-medium">Web Search</span>
          )}

          {isNativeSearch && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 font-medium">
              Native
            </span>
          )}

          {currentQuery && (
            <span className="text-xs text-muted-foreground truncate">
              "{currentQuery}"
            </span>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="flex items-center gap-1.5 text-xs">
            {isSearching ? (
              <span className="text-muted-foreground">
                {sourceCount > 0 ? `${sourceCount} source${sourceCount !== 1 ? 's' : ''}` : 'Searching...'}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {sourceCount} source{sourceCount !== 1 ? 's' : ''}
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

      {/* Content - Sources list */}
      {isExpanded && (
        <div className="border-t border-border">
          {allSources.length > 0 ? (
            <div className="divide-y divide-border/30">
              {allSources.map((source, index) => (
                <SourceItem key={`${source.url}-${index}`} source={source} />
              ))}
            </div>
          ) : isSearching ? (
            <div className="px-2.5 py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <IconLoader2 className="w-3 h-3 animate-spin" />
              <span>Looking for sources...</span>
            </div>
          ) : (
            <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
              No sources found
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Shared Components
// ============================================================================

function SourceItem({ source }: { source: Source }) {
  const hostname = useMemo(() => {
    try {
      return new URL(source.url).hostname
    } catch {
      return source.url
    }
  }, [source.url])

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between px-2.5 py-2 hover:bg-muted/30 transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <span className="text-sm text-foreground group-hover:text-violet-600 transition-colors truncate block">
          {source.title || hostname}
        </span>
        <span className="text-xs text-muted-foreground truncate block">
          {hostname}
        </span>
      </div>
      <IconExternalLink size={14} className="text-muted-foreground shrink-0 ml-2 group-hover:text-violet-500" />
    </a>
  )
}

function SearchResultItem({ result }: { result: SearchResult }) {
  const domain = useMemo(() => {
    try {
      return new URL(result.url).hostname
    } catch {
      return result.url
    }
  }, [result.url])

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
  sources?: Source[]
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
