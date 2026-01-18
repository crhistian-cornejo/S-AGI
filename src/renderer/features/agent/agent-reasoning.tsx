import { useState } from 'react'
import { cn } from '@/lib/utils'
import { IconChevronDown, IconChevronRight, IconPaperclip, IconTool, IconExternalLink } from '@tabler/icons-react'
import { BrainIcon, CustomTerminalIcon, FileSearchIcon, GlobeIcon, IconSpinner } from './icons'

export interface AgentReasoningAction {
  type: 'attachments' | 'web-search' | 'file-search' | 'code-interpreter' | 'tool'
  count?: number
  label?: string
}

/** Web search info with query and sources */
export interface WebSearchData {
  searchId: string
  query?: string
  status: 'searching' | 'done'
  action?: 'search' | 'open_page' | 'find_in_page'
  domains?: string[]
}

/** URL citation from the response */
export interface UrlCitationData {
  type: 'url_citation'
  url: string
  title?: string
  startIndex: number
  endIndex: number
}

/** File citation from file_search */
export interface FileCitationData {
  type: 'file_citation'
  fileId: string
  filename: string
  index: number
}

export type CitationData = UrlCitationData | FileCitationData

export interface AgentReasoningProps {
  /** The reasoning content (thinking process) */
  content: string
  /** Whether the reasoning is still in progress */
  isStreaming?: boolean
  /** Optional summary of the reasoning */
  summary?: string
  /** Start collapsed (default: false for streaming, true for completed) */
  defaultCollapsed?: boolean
  /** Custom className */
  className?: string
  /** Total thinking time in milliseconds */
  durationMs?: number
  /** Context actions used during reasoning */
  actions?: AgentReasoningAction[]
  /** Web searches with detailed info (query, sources) */
  webSearches?: WebSearchData[]
  /** Citations collected from the response (URL and file citations) */
  annotations?: CitationData[]
}

/**
 * Compact component to display AI reasoning/thinking process
 * Collapsible toggle similar to ChatGPT's "Show thinking"
 */
function formatThinkingDuration(ms?: number) {
  if (!ms || ms <= 0) return "0 seconds"
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) {
    return seconds === 0
      ? `${minutes} minute${minutes === 1 ? '' : 's'}`
      : `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds}s`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${hours} hour${hours === 1 ? '' : 's'} ${remainingMinutes}m`
}

function getActionLabel(action: AgentReasoningAction) {
  if (action.label) return action.label
  const count = action.count ?? 1
  switch (action.type) {
    case 'attachments':
      return `Read ${count} attachment${count === 1 ? '' : 's'}`
    case 'web-search':
      return count > 1 ? `Searched the web (${count}x)` : 'Searched the web'
    case 'file-search':
      return count > 1 ? `Searched files (${count}x)` : 'Searched files'
    case 'code-interpreter':
      return count > 1 ? `Ran code (${count}x)` : 'Ran code'
    case 'tool':
      return count > 1 ? `Ran ${count} tools` : 'Ran 1 tool'
    default:
      return 'Action'
  }
}

function getActionIcon(action: AgentReasoningAction) {
  switch (action.type) {
    case 'attachments':
      return IconPaperclip
    case 'web-search':
      return GlobeIcon
    case 'file-search':
      return FileSearchIcon
    case 'code-interpreter':
      return CustomTerminalIcon
    case 'tool':
      return IconTool
    default:
      return BrainIcon
  }
}

export function AgentReasoning({
  content,
  isStreaming = false,
  summary,
  defaultCollapsed = false,
  className,
  durationMs,
  actions = [],
  webSearches = [],
  annotations = []
}: AgentReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed)

  // Debug logging
  if (annotations.length > 0) {
    console.log('[AgentReasoning] Received annotations:', annotations.length, annotations)
  }

  const displayText = summary || content
  const hasContent = displayText.length > 0
  const hasActions = actions.length > 0
  const hasWebSearches = webSearches.length > 0
  const hasAnnotations = annotations.length > 0
  const canToggle = hasContent || hasActions || hasWebSearches || hasAnnotations

  if (!canToggle && !isStreaming) return null

  const headerLabel = isStreaming
    ? 'Thinking...'
    : `Thought for ${formatThinkingDuration(durationMs)}`

  // Filter to URL citations and deduplicate by URL
  const urlAnnotations = annotations.filter((a): a is UrlCitationData => a.type === 'url_citation')
  const uniqueAnnotations = urlAnnotations.reduce((acc, annotation) => {
    if (!acc.some(a => a.url === annotation.url)) {
      acc.push(annotation)
    }
    return acc
  }, [] as UrlCitationData[])

  return (
    <div className={cn("", className)}>
      {/* Header row with thinking + stacked sources */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Thinking toggle button */}
        <button
          type="button"
          onClick={() => canToggle && setIsExpanded(!isExpanded)}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs text-muted-foreground/70",
            "hover:text-muted-foreground transition-colors",
            canToggle ? "cursor-pointer" : "cursor-default"
          )}
          disabled={!canToggle}
        >
          {isStreaming ? (
            <IconSpinner className="w-3.5 h-3.5" />
          ) : (
            <BrainIcon className="w-3.5 h-3.5" />
          )}

          <span className="font-medium">{headerLabel}</span>

          {canToggle && (
            isExpanded ? (
              <IconChevronDown size={12} className="ml-0.5" />
            ) : (
              <IconChevronRight size={12} className="ml-0.5" />
            )
          )}
        </button>

        {/* Stacked sources - ALWAYS visible in header when available */}
        {hasAnnotations && uniqueAnnotations.length > 0 && (
          <StackedSources annotations={uniqueAnnotations} />
        )}
      </div>

      {(isExpanded || isStreaming) && (
        <div className="mt-2 pl-5 space-y-2">
          {/* Regular actions */}
          {hasActions && (
            <div className="space-y-1">
              {actions.map((action, index) => {
                const ActionIcon = getActionIcon(action)
                return (
                  <div key={`${action.type}-${index}`} className="flex items-center gap-2 text-xs text-muted-foreground/80">
                    <ActionIcon className="w-3.5 h-3.5" />
                    <span>{getActionLabel(action)}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Web searches with detailed info */}
          {hasWebSearches && (
            <div className="space-y-2">
              {webSearches.map((ws) => (
                <WebSearchItem key={ws.searchId} webSearch={ws} />
              ))}
            </div>
          )}

          {/* Reasoning content */}
          {hasContent && (
            <div
              className={cn(
                "border-l-2 border-border/40 pl-3",
                "text-xs text-muted-foreground/80 leading-relaxed",
                "font-mono whitespace-pre-wrap",
                isExpanded ? "max-h-64 overflow-y-auto" : "max-h-20 overflow-hidden"
              )}
            >
              {displayText}
            </div>
          )}
        </div>
      )}

      {isStreaming && !hasContent && !hasActions && !hasWebSearches && (
        <div className="mt-1 pl-5 flex items-center gap-1">
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse" />
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:150ms]" />
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:300ms]" />
        </div>
      )}
    </div>
  )
}

/** Helper to get favicon URL for a domain */
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
  } catch {
    return ''
  }
}

/** Helper to get domain from URL */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

/** Web search item with query and status */
function WebSearchItem({ webSearch }: { webSearch: WebSearchData }) {
  const isSearching = webSearch.status === 'searching'
  
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
      {isSearching ? (
        <IconSpinner className="w-3.5 h-3.5" />
      ) : (
        <GlobeIcon className="w-3.5 h-3.5" />
      )}
      <span>
        {isSearching ? 'Searching' : 'Searched'} the web
        {webSearch.query && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
            "{webSearch.query}"
          </span>
        )}
      </span>
      <span className="ml-auto text-[10px] px-1 py-0.5 rounded bg-violet-500/10 text-violet-600 font-medium">
        Native
      </span>
    </div>
  )
}

/** Stacked favicons with source count - like ChatGPT's "29 sources" */
function StackedSources({ annotations }: { annotations: CitationData[] }) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Filter to URL citations only (file citations handled separately in message-list)
  const urlAnnotations = annotations.filter((a): a is UrlCitationData => a.type === 'url_citation')
  
  if (urlAnnotations.length === 0) return null
  
  // Get unique domains for stacking (max 4 visible)
  const uniqueDomains = urlAnnotations.reduce((acc, annotation) => {
    const domain = getDomain(annotation.url)
    if (!acc.some(a => getDomain(a.url) === domain)) {
      acc.push(annotation)
    }
    return acc
  }, [] as UrlCitationData[])
  
  const visibleCount = Math.min(4, uniqueDomains.length)
  const visibleSources = uniqueDomains.slice(0, visibleCount)
  
  return (
    <div className="space-y-2">
      {/* Stacked header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground/80 hover:text-muted-foreground transition-colors"
      >
        {/* Stacked favicons */}
        <div className="flex items-center">
          {visibleSources.map((annotation, index) => {
            const faviconUrl = getFaviconUrl(annotation.url)
            return (
              <div
                key={`${annotation.url}-${index}`}
                className="relative rounded-full bg-background border border-border overflow-hidden"
                style={{ 
                  marginLeft: index > 0 ? '-6px' : 0,
                  zIndex: visibleCount - index,
                  width: 18,
                  height: 18
                }}
              >
                {faviconUrl ? (
                  <img
                    src={faviconUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Show fallback globe icon on error
                      e.currentTarget.style.display = 'none'
                      const parent = e.currentTarget.parentElement
                      if (parent) {
                        parent.classList.add('flex', 'items-center', 'justify-center')
                        parent.innerHTML = '<svg class="w-3 h-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <GlobeIcon className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        
        {/* Source count */}
        <span className="font-medium">
          {urlAnnotations.length} source{urlAnnotations.length !== 1 ? 's' : ''}
        </span>
        
        {/* Expand indicator */}
        {isExpanded ? (
          <IconChevronDown size={12} />
        ) : (
          <IconChevronRight size={12} />
        )}
      </button>
      
      {/* Expanded list */}
      {isExpanded && (
        <div className="pl-2 space-y-1 max-h-48 overflow-y-auto">
          {urlAnnotations.map((annotation, index) => (
            <a
              key={`${annotation.url}-${index}`}
              href={annotation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-muted/50 transition-colors group"
            >
              <img
                src={getFaviconUrl(annotation.url)}
                alt=""
                className="w-4 h-4 rounded-sm shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              <span className="text-xs text-muted-foreground group-hover:text-foreground truncate flex-1">
                {annotation.title || getDomain(annotation.url)}
              </span>
              <IconExternalLink size={10} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
