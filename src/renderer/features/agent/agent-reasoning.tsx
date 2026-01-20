import { useState } from 'react'
import { cn } from '@/lib/utils'
import { IconChevronDown, IconChevronRight, IconPaperclip, IconTool } from '@tabler/icons-react'
import { BrainIcon, CustomTerminalIcon, FileSearchIcon, GlobeIcon, IconSpinner } from './icons'
import { getModelById } from '@shared/ai-types'
import { OpenAIIcon, ZaiIcon } from '@/components/icons/model-icons'

export interface AgentReasoningAction {
  type: 'attachments' | 'web-search' | 'file-search' | 'code-interpreter' | 'tool' | 'model'
  count?: number
  label?: string
  modelId?: string
  modelName?: string
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
  if (action.type === 'model') return action.modelName || action.modelId || 'Model'
  const count = action.count ?? 1
  switch (action.type) {
    case 'attachments':
      return `Read ${count} attachment${count === 1 ? '' : 's'}`
    case 'web-search':
      return count > 1 ? `Searched the web (${count}x)` : 'Searched the web'
    case 'file-search':
      return count > 1 ? `Searched Knowledge Base (${count}x)` : 'Searched Knowledge Base'
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
    case 'model': {
      const p = getModelById(action.modelId || '')?.provider
      return p === 'zai' ? ZaiIcon : OpenAIIcon
    }
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

  return (
    <div className={cn("", className)}>
      {/* Header row with thinking toggle */}
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
                "font-mono whitespace-pre-wrap break-words min-w-0 max-w-full",
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
