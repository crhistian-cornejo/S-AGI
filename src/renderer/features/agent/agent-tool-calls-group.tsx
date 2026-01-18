import { memo, useState, useMemo } from "react"
import { IconChevronDown, IconChevronRight, IconCheck, IconLoader2, IconX, IconEye } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { AgentToolRegistry, getToolStatus, type ToolPart } from "./agent-tool-registry"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { Button } from "@/components/ui/button"

interface ToolCall {
  id: string
  name: string
  args?: string
  result?: unknown
  status?: 'streaming' | 'done' | 'executing' | 'complete' | 'error'
}

interface AgentToolCallsGroupProps {
  toolCalls: ToolCall[]
  chatStatus?: string
  onViewArtifact?: (id: string) => void
  /** Whether this is during streaming (show all expanded) */
  isStreaming?: boolean
}

interface GroupedToolCall {
  name: string
  displayName: string
  count: number
  calls: ToolCall[]
  icon: React.ComponentType<{ className?: string }> | null
  /** Artifact ID if this is a create_spreadsheet/create_document */
  artifactId?: string
}

// Convert ToolCall to ToolPart for registry functions
function toToolPart(tc: ToolCall): ToolPart {
  let parsedInput: Record<string, unknown> = {}
  let parsedOutput: Record<string, unknown> = {}
  
  try {
    if (tc.args) {
      parsedInput = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args
    }
  } catch { /* ignore */ }
  
  if (tc.result && typeof tc.result === 'object') {
    parsedOutput = tc.result as Record<string, unknown>
  }
  
  const stateMap: Record<string, ToolPart['state']> = {
    'streaming': 'input-streaming',
    'done': 'input-available',
    'executing': 'input-available',
    'complete': 'output-available',
    'error': 'output-error'
  }
  
  return {
    type: `tool-${tc.name}`,
    state: stateMap[tc.status || 'complete'] || 'output-available',
    input: parsedInput,
    output: parsedOutput
  }
}

// Get display name for a tool
function getToolDisplayName(name: string, part: ToolPart): string {
  const toolType = `tool-${name}`
  const meta = AgentToolRegistry[toolType]
  if (meta?.title) {
    return meta.title(part)
  }
  // Fallback: format tool name
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Extract artifact ID from tool call result
function getArtifactId(tc: ToolCall): string | undefined {
  if (tc.result && typeof tc.result === 'object' && 'artifactId' in tc.result) {
    return String((tc.result as { artifactId: unknown }).artifactId)
  }
  return undefined
}

// Check if tool creates an artifact
function isArtifactTool(name: string): boolean {
  return name === 'create_spreadsheet' || name === 'create_document'
}

// Group tool calls by type
function groupToolCalls(toolCalls: ToolCall[]): GroupedToolCall[] {
  const groups = new Map<string, GroupedToolCall>()
  
  for (const tc of toolCalls) {
    const part = toToolPart(tc)
    const displayName = getToolDisplayName(tc.name, part)
    const toolType = `tool-${tc.name}`
    const meta = AgentToolRegistry[toolType]
    
    if (!groups.has(tc.name)) {
      groups.set(tc.name, {
        name: tc.name,
        displayName,
        count: 0,
        calls: [],
        icon: meta?.icon || null,
        artifactId: undefined
      })
    }
    
    const group = groups.get(tc.name)!
    group.count++
    group.calls.push(tc)
    
    // Capture artifact ID if available
    if (isArtifactTool(tc.name)) {
      const artifactId = getArtifactId(tc)
      if (artifactId) {
        group.artifactId = artifactId
      }
    }
  }
  
  return Array.from(groups.values())
}

// Single tool call row inside expanded view
const ToolCallRow = memo(function ToolCallRow({ 
  tc, 
  chatStatus,
  showBorder = true,
  onViewArtifact
}: { 
  tc: ToolCall
  chatStatus?: string
  showBorder?: boolean
  onViewArtifact?: (id: string) => void
}) {
  const part = toToolPart(tc)
  const { isPending, isError, isSuccess } = getToolStatus(part, chatStatus)
  const toolType = `tool-${tc.name}`
  const meta = AgentToolRegistry[toolType]
  
  const title = meta?.title ? meta.title(part) : tc.name
  const subtitle = meta?.subtitle ? meta.subtitle(part) : null
  
  const artifactId = getArtifactId(tc)
  const showViewArtifact = isArtifactTool(tc.name) && artifactId && isSuccess
  
  return (
    <div className={cn(
      "flex items-center gap-2 py-1.5 px-3",
      showBorder && "border-b border-border/30"
    )}>
      {/* Status icon */}
      <div className="w-4 h-4 flex items-center justify-center shrink-0">
        {isPending ? (
          <IconLoader2 size={14} className="text-muted-foreground animate-spin" />
        ) : isError ? (
          <IconX size={14} className="text-destructive" />
        ) : (
          <IconCheck size={14} className="text-emerald-500" />
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className={cn(
          "text-xs font-medium truncate",
          isPending ? "text-foreground" : "text-muted-foreground"
        )}>
          {isPending ? (
            <TextShimmer as="span" duration={1.2} className="text-xs">
              {title}
            </TextShimmer>
          ) : title}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground/50 truncate">
            {subtitle}
          </span>
        )}
      </div>
      
      {/* View Artifact button */}
      {showViewArtifact && onViewArtifact && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onViewArtifact(artifactId)
          }}
        >
          <IconEye size={14} className="mr-1" />
          View
        </Button>
      )}
    </div>
  )
})

// Group row (for display in expanded section)
const GroupRow = memo(function GroupRow({ 
  group, 
  chatStatus,
  showBorder = true,
  onViewArtifact
}: { 
  group: GroupedToolCall
  chatStatus?: string
  showBorder?: boolean
  onViewArtifact?: (id: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Check status
  const hasPending = group.calls.some(tc => {
    const part = toToolPart(tc)
    return getToolStatus(part, chatStatus).isPending
  })
  
  const allSuccess = group.calls.every(tc => {
    const part = toToolPart(tc)
    return getToolStatus(part, chatStatus).isSuccess
  })
  
  const Icon = group.icon
  const showViewArtifact = isArtifactTool(group.name) && group.artifactId && allSuccess
  
  // All groups are expandable (even single items)
  return (
    <div className={cn(showBorder && "border-b border-border/30")}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(!isExpanded) } }}
        className="w-full flex items-center gap-2 py-1.5 px-3 hover:bg-muted/20 transition-colors cursor-pointer select-none"
      >
        {/* Expand icon */}
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {isExpanded ? (
            <IconChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <IconChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>
        
        {/* Tool icon */}
        {Icon && (
          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        
        {/* Title */}
        <span className="text-xs font-medium text-foreground">
          {hasPending ? (
            <TextShimmer as="span" duration={1.2} className="text-xs">
              {group.displayName}
            </TextShimmer>
          ) : group.displayName}
        </span>
        
        {/* Count badge - only show if more than 1 */}
        {group.count > 1 && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            allSuccess 
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          )}>
            {group.count}×
          </span>
        )}
        
        {/* View Artifact button for group */}
        {showViewArtifact && onViewArtifact && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
            onClick={(e) => {
              e.stopPropagation()
              onViewArtifact(group.artifactId!)
            }}
          >
            <IconEye size={12} className="mr-0.5" />
            View
          </Button>
        )}
        
        {/* Status indicator */}
        {!showViewArtifact && (
          <div className="ml-auto">
            {hasPending ? (
              <IconLoader2 size={12} className="text-muted-foreground animate-spin" />
            ) : allSuccess ? (
              <IconCheck size={12} className="text-emerald-500" />
            ) : null}
          </div>
        )}
      </div>
      
      {/* Expanded sub-items */}
      {isExpanded && (
        <div className="bg-muted/10 border-t border-border/20 pl-4">
          {group.calls.map((tc, idx) => (
            <ToolCallRow 
              key={tc.id} 
              tc={tc} 
              chatStatus={chatStatus}
              showBorder={idx < group.calls.length - 1}
              onViewArtifact={onViewArtifact}
            />
          ))}
        </div>
      )}
    </div>
  )
})

export const AgentToolCallsGroup = memo(function AgentToolCallsGroup({
  toolCalls,
  chatStatus,
  onViewArtifact,
  isStreaming = false
}: AgentToolCallsGroupProps) {
  const [isExpanded, setIsExpanded] = useState(isStreaming)
  const groups = useMemo(() => groupToolCalls(toolCalls), [toolCalls])
  
  if (toolCalls.length === 0) {
    return null
  }
  
  // Calculate overall status
  const allComplete = toolCalls.every(tc => tc.status === 'complete')
  const hasPending = toolCalls.some(tc => 
    tc.status === 'streaming' || tc.status === 'executing' || tc.status === 'done'
  )
  const hasError = toolCalls.some(tc => tc.status === 'error')
  
  // Summary text
  const summaryText = hasPending 
    ? `Running ${toolCalls.length} tool${toolCalls.length !== 1 ? 's' : ''}...`
    : `${toolCalls.length} tool${toolCalls.length !== 1 ? 's' : ''} completed`
  
  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      allComplete 
        ? "border-border/50 bg-muted/10" 
        : "border-border/40 bg-muted/5"
    )}>
      {/* Main header - always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(!isExpanded) } }}
        className="w-full flex items-center gap-2 py-2 px-3 hover:bg-muted/20 transition-colors cursor-pointer select-none"
      >
        {/* Expand icon */}
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {isExpanded ? (
            <IconChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <IconChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>
        
        {/* Summary */}
        <span className="text-xs font-medium text-foreground">
          {hasPending ? (
            <TextShimmer as="span" duration={1.2} className="text-xs">
              {summaryText}
            </TextShimmer>
          ) : summaryText}
        </span>
        
        {/* Status indicator */}
        <div className="ml-auto">
          {hasPending ? (
            <IconLoader2 size={14} className="text-muted-foreground animate-spin" />
          ) : hasError ? (
            <IconX size={14} className="text-destructive" />
          ) : (
            <IconCheck size={14} className="text-emerald-500" />
          )}
        </div>
      </div>
      
      {/* Expanded content - list of groups */}
      {isExpanded && (
        <div className="border-t border-border/30 bg-background/50">
          {groups.map((group, idx) => (
            <GroupRow 
              key={group.name} 
              group={group} 
              chatStatus={chatStatus}
              showBorder={idx < groups.length - 1}
              onViewArtifact={onViewArtifact}
            />
          ))}
        </div>
      )}
    </div>
  )
})
