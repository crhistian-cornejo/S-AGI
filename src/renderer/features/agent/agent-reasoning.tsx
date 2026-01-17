import { useState } from 'react'
import { cn } from '@/lib/utils'
import { BrainIcon, ExpandIcon, CollapseIcon, IconSpinner } from './icons'

export interface AgentReasoningProps {
  /** The reasoning content (thinking process) */
  content: string
  /** Whether the reasoning is still in progress */
  isStreaming?: boolean
  /** Optional summary of the reasoning */
  summary?: string
  /** Custom className */
  className?: string
}

/**
 * Component to display AI reasoning/thinking process
 * Used for o-series models and GPT-5 with reasoning enabled
 */
export function AgentReasoning({
  content,
  isStreaming = false,
  summary,
  className
}: AgentReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Don't render if there's no content
  if (!content && !isStreaming) return null
  
  const hasContent = content.length > 0
  const displayContent = isExpanded ? content : summary || content.slice(0, 200)
  const shouldTruncate = content.length > 200 && !isExpanded && !summary
  
  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 bg-muted/30 overflow-hidden",
        "transition-all duration-200",
        className
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2",
          "text-sm text-muted-foreground hover:text-foreground",
          "transition-colors cursor-pointer",
          hasContent && "hover:bg-muted/50"
        )}
        disabled={!hasContent}
      >
        <div className="flex items-center gap-2 flex-1">
          {isStreaming ? (
            <IconSpinner className="w-4 h-4" />
          ) : (
            <BrainIcon className="w-4 h-4" />
          )}
          <span className="font-medium">
            {isStreaming ? "Thinking..." : "Reasoning"}
          </span>
          {!isStreaming && hasContent && (
            <span className="text-xs text-muted-foreground/70">
              ({content.split(/\s+/).length} words)
            </span>
          )}
        </div>
        
        {hasContent && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {isExpanded ? (
              <>
                <CollapseIcon className="w-3 h-3" />
                <span>Collapse</span>
              </>
            ) : (
              <>
                <ExpandIcon className="w-3 h-3" />
                <span>Expand</span>
              </>
            )}
          </div>
        )}
      </button>
      
      {/* Content */}
      {hasContent && (
        <div
          className={cn(
            "px-3 pb-3 text-sm text-muted-foreground",
            "whitespace-pre-wrap font-mono text-xs leading-relaxed",
            isExpanded ? "max-h-96 overflow-y-auto" : "max-h-24 overflow-hidden"
          )}
        >
          {displayContent}
          {shouldTruncate && (
            <span className="text-muted-foreground/50">...</span>
          )}
        </div>
      )}
      
      {/* Streaming indicator */}
      {isStreaming && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 bg-current rounded-full animate-pulse" />
            <span className="w-1 h-1 bg-current rounded-full animate-pulse delay-75" />
            <span className="w-1 h-1 bg-current rounded-full animate-pulse delay-150" />
          </div>
        </div>
      )}
    </div>
  )
}
