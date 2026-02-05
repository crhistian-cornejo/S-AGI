import { memo, useState, useMemo } from "react"
import { IconExternalLink, IconWorld, IconLoader2, IconChevronDown } from "@tabler/icons-react"
import { SearchIcon, ExpandIcon, CollapseIcon, GlobeIcon } from "./icons"
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

/** URL citation with title from annotations */
export interface UrlCitationSource {
  type: 'url_citation'
  url: string
  title?: string
  startIndex: number
  endIndex: number
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
// Individual Web Search Card - Shows one search with its query and sources
// ============================================================================

export interface WebSearchItem {
  searchId: string
  query?: string
  status: 'searching' | 'done'
  action?: 'search' | 'open_page' | 'find_in_page'
  domains?: string[]
  url?: string
  sources?: Array<{ url: string; title?: string }>
}

interface IndividualWebSearchCardProps {
  search: WebSearchItem
  /** URL citations with titles from annotations - these have the article titles */
  annotations?: UrlCitationSource[]
}

/**
 * Individual web search card - shows a single search with its query and sources
 * Used to display each search separately with favicons
 * Shows sources in real-time as they are found during searching
 *
 * Like Claude's web search UI - shows query, result count, and sources with titles
 */
export const IndividualWebSearchCard = memo(function IndividualWebSearchCard({
  search,
  annotations = [],
}: IndividualWebSearchCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const isSearching = search.status === 'searching'
  const query = search.query || 'Web search'

  // Debug logging
  console.log('[WebSearchCard] Rendering:', {
    searchId: search.searchId,
    query,
    status: search.status,
    domains: search.domains,
    annotationsCount: annotations.length,
    annotations: annotations.slice(0, 3),
  })

  // Build sources from annotations (which have titles), search.sources, or fall back to domains
  // Deduplicate by URL to show each unique page only once
  const sources: Source[] = useMemo(() => {
    let rawSources: Source[] = []

    // Priority 1: If we have annotations with titles, use those
    if (annotations.length > 0) {
      console.log('[WebSearchCard] Using annotations for sources:', annotations.length)
      rawSources = annotations.map(a => ({
        url: a.url,
        title: a.title || undefined
      }))
    }
    // Priority 2: If we have sources from the search event (with titles)
    else if (search.sources && search.sources.length > 0) {
      console.log('[WebSearchCard] Using search.sources:', search.sources.length)
      rawSources = search.sources.map(s => ({
        url: s.url,
        title: s.title || undefined
      }))
    }
    // Priority 3: Fall back to domains/urls from search data (no titles)
    else {
      if (search.domains) {
        console.log('[WebSearchCard] Using domains fallback:', search.domains.length)
        for (const domain of search.domains) {
          const url = domain.startsWith('http') ? domain : `https://${domain}`
          rawSources.push({ url, title: undefined })
        }
      }

      if (search.url) {
        const url = search.url.startsWith('http') ? search.url : `https://${search.url}`
        rawSources.push({ url, title: undefined })
      }
    }

    // Deduplicate by URL - keep first occurrence (usually has best title)
    const seen = new Set<string>()
    const uniqueSources: Source[] = []
    for (const source of rawSources) {
      // Normalize URL for deduplication (remove trailing slash, fragment, etc.)
      const normalizedUrl = source.url.replace(/\/$/, '').split('#')[0].split('?')[0]
      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl)
        uniqueSources.push(source)
      }
    }

    console.log('[WebSearchCard] Deduplicated sources:', rawSources.length, '->', uniqueSources.length)
    return uniqueSources
  }, [search.domains, search.url, search.sources, annotations])

  const resultCount = sources.length
  const hasSources = resultCount > 0

  return (
    <div className="relative">
      {/* Header row - query with globe icon and result count */}
      <button
        type="button"
        onClick={() => hasSources && setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-2 w-full text-left py-0.5",
          hasSources && "cursor-pointer hover:opacity-80 transition-opacity",
        )}
      >
        {/* Globe icon - positioned on the vertical line */}
        <GlobeIcon className="absolute -left-5 top-[3px] w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />

        {/* Query text */}
        <span className="text-[13px] text-muted-foreground/80">{query}</span>

        {/* Result count */}
        {hasSources ? (
          <span className="text-[11px] text-muted-foreground/50 ml-auto">
            {resultCount} resultado{resultCount !== 1 ? 's' : ''}
          </span>
        ) : isSearching ? (
          <span className="text-[11px] text-muted-foreground/50 ml-auto animate-pulse">
            Buscando...
          </span>
        ) : null}

        {/* Chevron for expand/collapse */}
        {hasSources && (
          <IconChevronDown
            size={12}
            className={cn(
              "text-muted-foreground/50 transition-transform duration-200",
              !isExpanded && "-rotate-90"
            )}
          />
        )}
      </button>

      {/* Sources list - Claude style with favicons and titles */}
      {/* Max height for ~5 items with scrolling */}
      {isExpanded && hasSources && (
        <div className="mt-1.5 rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
          <div className={cn(
            "overflow-y-auto",
            sources.length > 5 && "max-h-[220px]"
          )}>
            {sources.map((source, index) => (
              <SourceItemEnhanced key={`${source.url}-${index}`} source={source} isFirst={index === 0} />
            ))}
          </div>
          {/* Show loading indicator at bottom if still searching */}
          {isSearching && (
            <div className="px-2.5 py-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/60 border-t border-border/20">
              <IconLoader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Buscando más...</span>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton when searching with no sources yet */}
      {isSearching && !hasSources && (
        <div className="mt-1.5 rounded-lg border border-border/50 bg-card/50 overflow-hidden">
          <div className="p-2.5 space-y-2.5">
            <div className="flex items-center gap-3 animate-pulse">
              <div className="w-5 h-5 rounded bg-muted-foreground/20" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted-foreground/20 rounded w-4/5" />
                <div className="h-2.5 bg-muted-foreground/10 rounded w-2/5" />
              </div>
            </div>
            <div className="flex items-center gap-3 animate-pulse" style={{ animationDelay: '150ms' }}>
              <div className="w-5 h-5 rounded bg-muted-foreground/15" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted-foreground/15 rounded w-3/5" />
                <div className="h-2.5 bg-muted-foreground/10 rounded w-1/3" />
              </div>
            </div>
            <div className="flex items-center gap-3 animate-pulse" style={{ animationDelay: '300ms' }}>
              <div className="w-5 h-5 rounded bg-muted-foreground/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted-foreground/10 rounded w-2/3" />
                <div className="h-2.5 bg-muted-foreground/5 rounded w-1/4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Show empty state when done searching but no sources found */}
      {!isSearching && !hasSources && (
        <div className="mt-1.5 rounded-lg border border-border/30 bg-muted/10 overflow-hidden">
          <div className="px-3 py-2 text-[11px] text-muted-foreground/60 text-center">
            Sin fuentes encontradas
          </div>
        </div>
      )}
    </div>
  )
})

/** Enhanced source item with title display like Claude */
function SourceItemEnhanced({ source, isFirst }: { source: Source; isFirst: boolean }) {
  const hostname = useMemo(() => {
    try {
      return new URL(source.url).hostname.replace('www.', '')
    } catch {
      return source.url
    }
  }, [source.url])

  const faviconUrl = useMemo(() => {
    try {
      const domain = new URL(source.url).hostname
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    } catch {
      return null
    }
  }, [source.url])

  // Use title if available, otherwise show hostname
  const displayTitle = source.title || hostname

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 hover:bg-muted/40 transition-colors group",
        !isFirst && "border-t border-border/30"
      )}
    >
      {/* Favicon */}
      <div className="w-5 h-5 shrink-0 rounded overflow-hidden bg-muted/50 flex items-center justify-center">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const parent = e.currentTarget.parentElement
              if (parent) {
                parent.innerHTML = '<span class="text-[10px] text-muted-foreground">🌐</span>'
              }
            }}
          />
        ) : (
          <IconWorld size={14} className="text-muted-foreground" />
        )}
      </div>

      {/* Title and domain */}
      <div className="min-w-0 flex-1">
        <span className="text-[13px] text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {displayTitle}
        </span>
        {source.title && (
          <span className="text-[11px] text-muted-foreground/60 block">
            {hostname}
          </span>
        )}
      </div>

      {/* Domain on right when no title */}
      {!source.title && (
        <span className="text-[11px] text-muted-foreground/50 shrink-0">
          {hostname}
        </span>
      )}
    </a>
  )
}

// ============================================================================
// Consolidated Web Search Timeline - Single component for all searches
// Shows sources in real-time as they are discovered
// ============================================================================

interface ConsolidatedWebSearchTimelineProps {
  searches: WebSearchItem[]
  annotations?: UrlCitationSource[]
}

/**
 * Consolidated web search timeline - ONE component for all searches
 * Aggregates sources from all searches + annotations in real-time
 * Shows progress and sources as they come in
 */
export const ConsolidatedWebSearchTimeline = memo(function ConsolidatedWebSearchTimeline({
  searches,
  annotations = [],
}: ConsolidatedWebSearchTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Aggregate ALL sources from all searches + annotations
  const { allSources, isSearching } = useMemo(() => {
    const sourcesMap = new Map<string, Source>()
    let searching = false

    // 1. First collect from annotations (they have the best titles)
    for (const annotation of annotations) {
      const normalizedUrl = annotation.url.replace(/\/$/, '').split('#')[0].split('?')[0]
      if (!sourcesMap.has(normalizedUrl)) {
        sourcesMap.set(normalizedUrl, {
          url: annotation.url,
          title: annotation.title || undefined
        })
      }
    }

    // 2. Then collect from each search's sources
    for (const search of searches) {
      if (search.status === 'searching') {
        searching = true
      }

      // Collect sources from search (these have titles from OpenAI)
      if (search.sources && search.sources.length > 0) {
        for (const source of search.sources) {
          const normalizedUrl = source.url.replace(/\/$/, '').split('#')[0].split('?')[0]
          if (!sourcesMap.has(normalizedUrl)) {
            sourcesMap.set(normalizedUrl, {
              url: source.url,
              title: source.title || undefined
            })
          }
        }
      }

      // Collect domains as fallback (no titles)
      if (search.domains && search.domains.length > 0) {
        for (const domain of search.domains) {
          const url = domain.startsWith('http') ? domain : `https://${domain}`
          const normalizedUrl = url.replace(/\/$/, '').split('#')[0].split('?')[0]
          if (!sourcesMap.has(normalizedUrl)) {
            let title: string | undefined
            try {
              title = new URL(url).hostname.replace('www.', '')
            } catch {
              title = domain
            }
            sourcesMap.set(normalizedUrl, { url, title })
          }
        }
      }

      // Collect single URL if present
      if (search.url) {
        const url = search.url.startsWith('http') ? search.url : `https://${search.url}`
        const normalizedUrl = url.replace(/\/$/, '').split('#')[0].split('?')[0]
        if (!sourcesMap.has(normalizedUrl)) {
          let title: string | undefined
          try {
            title = new URL(url).hostname.replace('www.', '')
          } catch {
            title = search.url
          }
          sourcesMap.set(normalizedUrl, { url, title })
        }
      }
    }

    return {
      allSources: Array.from(sourcesMap.values()),
      isSearching: searching,
    }
  }, [searches, annotations])

  const sourceCount = allSources.length
  const hasSources = sourceCount > 0

  return (
    <div className="relative">
      {/* Header row - Web search with globe icon */}
      <button
        type="button"
        onClick={() => (hasSources || isSearching) && setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-2 w-full text-left py-0.5",
          (hasSources || isSearching) && "cursor-pointer hover:opacity-80 transition-opacity",
        )}
      >
        {/* Globe icon - positioned on the vertical line */}
        <GlobeIcon className="absolute -left-5 top-[3px] w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />

        {/* Label */}
        <span className="text-[13px] text-muted-foreground/80">Web search</span>

        {/* Result count or searching status */}
        {hasSources ? (
          <span className="text-[11px] text-muted-foreground/50 ml-auto">
            {sourceCount} resultado{sourceCount !== 1 ? 's' : ''}
          </span>
        ) : isSearching ? (
          <span className="text-[11px] text-muted-foreground/50 ml-auto animate-pulse">
            Buscando...
          </span>
        ) : null}

        {/* Chevron for expand/collapse */}
        {(hasSources || isSearching) && (
          <IconChevronDown
            size={12}
            className={cn(
              "text-muted-foreground/50 transition-transform duration-200",
              !isExpanded && "-rotate-90"
            )}
          />
        )}
      </button>

      {/* Sources list - shows all aggregated sources */}
      {isExpanded && hasSources && (
        <div className="mt-1.5 rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
          <div className={cn(
            "overflow-y-auto",
            sourceCount > 5 && "max-h-[220px]"
          )}>
            {allSources.map((source, index) => (
              <SourceItemEnhanced key={`${source.url}-${index}`} source={source} isFirst={index === 0} />
            ))}
          </div>
          {/* Show loading indicator at bottom if still searching */}
          {isSearching && (
            <div className="px-2.5 py-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/60 border-t border-border/20">
              <IconLoader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Buscando más fuentes...</span>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton when searching with no sources yet */}
      {isSearching && !hasSources && (
        <div className="mt-1.5 rounded-lg border border-border/50 bg-card/50 overflow-hidden">
          <div className="p-2.5 space-y-2.5">
            <div className="flex items-center gap-3 animate-pulse">
              <div className="w-5 h-5 rounded bg-muted-foreground/20" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted-foreground/20 rounded w-4/5" />
                <div className="h-2.5 bg-muted-foreground/10 rounded w-2/5" />
              </div>
            </div>
            <div className="flex items-center gap-3 animate-pulse" style={{ animationDelay: '150ms' }}>
              <div className="w-5 h-5 rounded bg-muted-foreground/15" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted-foreground/15 rounded w-3/5" />
                <div className="h-2.5 bg-muted-foreground/10 rounded w-1/3" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state - when done but no sources */}
      {!isSearching && !hasSources && (
        <div className="mt-1.5 rounded-lg border border-border/30 bg-muted/10 overflow-hidden">
          <div className="px-3 py-2 text-[11px] text-muted-foreground/60 text-center">
            Sin fuentes encontradas
          </div>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Consolidated Web Search Component - Groups multiple searches into one UI
// ============================================================================

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
      return new URL(source.url).hostname.replace('www.', '')
    } catch {
      return source.url
    }
  }, [source.url])

  const faviconUrl = useMemo(() => {
    try {
      const domain = new URL(source.url).hostname
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
    } catch {
      return null
    }
  }, [source.url])

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-muted/30 transition-colors group"
    >
      {/* Favicon */}
      <div className="w-4 h-4 shrink-0 rounded overflow-hidden bg-muted/50 flex items-center justify-center">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const parent = e.currentTarget.parentElement
              if (parent) {
                parent.innerHTML = '<span class="text-[8px] text-muted-foreground">🌐</span>'
              }
            }}
          />
        ) : (
          <IconWorld size={12} className="text-muted-foreground" />
        )}
      </div>

      {/* Title and domain */}
      <div className="min-w-0 flex-1">
        <span className="text-xs text-foreground group-hover:text-violet-600 transition-colors truncate block">
          {source.title || hostname}
        </span>
      </div>

      {/* Domain on right */}
      <span className="text-[10px] text-muted-foreground/70 shrink-0">
        {hostname}
      </span>
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
