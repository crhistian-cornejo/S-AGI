import { useState, type ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { IconBookmark, IconChevronDown, IconChevronRight, IconPaperclip, IconTool } from '@tabler/icons-react'
import { BrainIcon, CustomTerminalIcon, FileSearchIcon, GlobeIcon, IconSpinner } from './icons'
import { getModelById } from '@s-agi/core/types/ai'
import { OpenAIIcon, ZaiIcon, ClaudeIcon } from '@/components/icons/model-icons'
import { AgentToolCallFlat, type ToolCall } from './agent-tool-call-flat'

export interface AgentReasoningAction {
  type: 'attachments' | 'web-search' | 'file-search' | 'code-interpreter' | 'tool' | 'model'
  count?: number
  label?: string
  modelId?: string
  modelName?: string
  toolCall?: ToolCall
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
      if (p === 'zai') return ZaiIcon
      if (p === 'claude') return ClaudeIcon
      return OpenAIIcon
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

  const displayText = summary || content
  const hasContent = displayText.length > 0
  const hasActions = actions.length > 0
  const hasWebSearches = webSearches.length > 0
  const hasAnnotations = annotations.length > 0
  const canToggle = hasContent || hasActions || hasWebSearches || hasAnnotations

  if (!canToggle && !isStreaming) return null

  const hasDuration = typeof durationMs === 'number' && durationMs > 0
  const headerLabel = isStreaming
    ? 'Thinking...'
    : hasDuration
      ? `Thought for ${formatThinkingDuration(durationMs)}`
      : 'Activity'

  const urlSet = new Set<string>()
  const fileSet = new Set<string>()
  annotations.forEach((annotation) => {
    if (annotation.type === 'url_citation') {
      urlSet.add(annotation.url)
    }
    if (annotation.type === 'file_citation') {
      fileSet.add(annotation.fileId)
    }
  })
  const uniqueUrlCount = urlSet.size
  const uniqueFileCount = fileSet.size

  const totalSources = uniqueUrlCount + uniqueFileCount

  const normalizedActions = hasWebSearches
    ? actions.filter((a) => a.type !== 'web-search')
    : actions

  const sequenceItems: Array<{
    key: string
    icon: ComponentType<{ className?: string }>
    label: string
    badge?: string
    isActive?: boolean
    toolCall?: ToolCall
  }> = [
    ...normalizedActions.map((action, index) => ({
      key: `${action.type}-${index}`,
      icon: getActionIcon(action),
      label: getActionLabel(action),
      isActive: false,
      toolCall: action.toolCall
    })),
    ...webSearches.map((ws) => ({
      key: `web-${ws.searchId}`,
      icon: GlobeIcon,
      label: ws.status === 'searching' ? 'Searching the web' : 'Searched the web',
      badge: ws.query ? `"${ws.query}"` : undefined,
      isActive: ws.status === 'searching'
    })),
    ...(totalSources > 0
      ? [
          {
            key: 'sources',
            icon: IconBookmark,
            label: 'Sources',
            badge: String(totalSources),
            isActive: false
          }
        ]
      : [])
  ]

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
          {sequenceItems.length > 0 && (
            <div className="relative space-y-2">
              <div className="absolute left-[6px] top-2 bottom-2 w-px bg-border/40" />
              {sequenceItems.map((item) => {
                const ItemIcon = item.icon
                return (
                  <div key={item.key} className="relative pl-5">
                    <span
                      className={cn(
                        "absolute left-0 top-2 h-2 w-2 rounded-full",
                        item.isActive ? "bg-primary" : "bg-muted-foreground/40"
                      )}
                    />
                    
                    {item.toolCall ? (
                      <div className="-mt-1.5">
                        <AgentToolCallFlat
                          toolCalls={[item.toolCall]}
                          isStreaming={item.toolCall.status === 'executing' || item.toolCall.status === 'streaming'}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                        <ItemIcon
                          className={cn(
                            "w-3.5 h-3.5",
                            item.isActive && "text-primary"
                          )}
                        />
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className="ml-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
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

      {isStreaming && !hasContent && sequenceItems.length === 0 && (
        <div className="mt-1 pl-5 flex items-center gap-1">
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse" />
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:150ms]" />
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:300ms]" />
        </div>
      )}
    </div>
  )
}
