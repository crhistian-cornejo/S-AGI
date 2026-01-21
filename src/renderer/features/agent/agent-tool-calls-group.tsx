import { memo, useState, useMemo } from "react"
import { IconChevronDown, IconChevronRight, IconCheck, IconLoader2, IconX, IconEye } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { AgentToolRegistry, getToolStatus, type ToolPart } from "./agent-tool-registry"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { Button } from "@/components/ui/button"
import { AgentGeneratedImage } from "./agent-generated-image"
import { AgentGeneratedChart } from "./agent-generated-chart"

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
const parsedArgsCache = new WeakMap<ToolCall, Record<string, unknown>>()

function toToolPart(tc: ToolCall): ToolPart {
  let parsedInput: Record<string, unknown> = {}
  let parsedOutput: Record<string, unknown> = {}

  if (parsedArgsCache.has(tc)) {
    parsedInput = parsedArgsCache.get(tc)!
  } else {
    try {
      if (tc.args) {
        parsedInput = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args
        parsedArgsCache.set(tc, parsedInput)
      }
    } catch { /* ignore */ }
  }

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

function getToolDisplayName(name: string, part: ToolPart): string {
  const toolType = `tool-${name}`
  const meta = AgentToolRegistry[toolType]
  if (meta?.title) {
    return meta.title(part)
  }
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getArtifactId(tc: ToolCall): string | undefined {
  if (tc.result && typeof tc.result === 'object' && 'artifactId' in tc.result) {
    return String((tc.result as { artifactId: unknown }).artifactId)
  }
  return undefined
}

function isArtifactTool(name: string): boolean {
  return name === 'create_spreadsheet' || name === 'create_document'
}

function isImageTool(name: string): boolean {
  return name === 'generate_image' || name === 'edit_image'
}

function isChartTool(name: string): boolean {
  return name === 'generate_chart'
}

function getImageData(tc: ToolCall): { imageUrl: string; prompt: string; size?: string; quality?: string } | undefined {
  if (tc.result && typeof tc.result === 'object' && 'imageUrl' in tc.result) {
    const result = tc.result as { imageUrl?: unknown; prompt?: unknown; size?: unknown; quality?: unknown }
    const imageUrl = result.imageUrl
    if (typeof imageUrl === 'string' && imageUrl) {
      return {
        imageUrl,
        prompt: typeof result.prompt === 'string' ? result.prompt : 'Generated image',
        size: typeof result.size === 'string' ? result.size : undefined,
        quality: typeof result.quality === 'string' ? result.quality : undefined
      }
    }
  }
  return undefined
}

interface ChartResultData {
  artifactId: string
  chartConfig: {
    type: string
    data: {
      labels: string[]
      datasets: Array<{
        label: string
        data: number[]
        backgroundColor?: string
        borderColor?: string
        fill?: boolean
      }>
    }
    options?: Record<string, unknown>
  }
  title?: string
}

function getChartData(tc: ToolCall): ChartResultData | undefined {
  if (tc.result && typeof tc.result === 'object') {
    const result = tc.result as Record<string, unknown>
    const artifactId = result.artifactId
    const chartConfig = result.chartConfig

    if (typeof artifactId === 'string' && chartConfig && typeof chartConfig === 'object') {
      return {
        artifactId,
        chartConfig: chartConfig as ChartResultData['chartConfig'],
        title: typeof result.title === 'string' ? result.title : undefined
      }
    }
  }
  return undefined
}

/** Extract the artifact title from tool call input/result */
function getArtifactTitle(tc: ToolCall): string | undefined {
  // Try to get from input args first
  let parsedInput: Record<string, unknown> = {}
  try {
    if (tc.args) {
      parsedInput = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args
    }
  } catch { /* ignore */ }

  // Check input for title/name
  if (typeof parsedInput.title === 'string' && parsedInput.title) {
    return parsedInput.title
  }
  if (typeof parsedInput.name === 'string' && parsedInput.name) {
    return parsedInput.name
  }

  // Check result for title/name
  if (tc.result && typeof tc.result === 'object') {
    const result = tc.result as Record<string, unknown>
    if (typeof result.title === 'string' && result.title) {
      return result.title
    }
    if (typeof result.name === 'string' && result.name) {
      return result.name
    }
  }

  return undefined
}

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

    if (isArtifactTool(tc.name)) {
      const artifactId = getArtifactId(tc)
      if (artifactId) {
        group.artifactId = artifactId
      }
    }
  }

  return Array.from(groups.values())
}

// ============================================================================
// TREE CONNECTOR LINES
// ============================================================================

interface TreeLinesProps {
  depth: number
  isLast: boolean
  parentLines?: boolean[]
}

function TreeLines({ depth, isLast, parentLines = [] }: TreeLinesProps) {
  if (depth === 0) return null

  return (
    <div className="flex items-stretch self-stretch">
      {/* Lines for each parent level - first one aligns with parent chevron */}
      {parentLines.map((showLine, idx) => (
        <div key={idx} className="w-5 flex-shrink-0 relative">
          {showLine && (
            <div className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-px bg-muted-foreground/30 dark:bg-muted-foreground/40" />
          )}
        </div>
      ))}
      {/* Current level connector - the "L" or "├" shape */}
      <div className="w-5 flex-shrink-0 relative">
        {/* Vertical line */}
        <div className={cn(
          "absolute left-1/2 -translate-x-1/2 w-px bg-muted-foreground/30 dark:bg-muted-foreground/40",
          isLast ? "top-0 h-1/2" : "top-0 h-full"
        )} />
        {/* Horizontal connector to the item */}
        <div className="absolute top-1/2 left-1/2 w-[10px] h-px bg-muted-foreground/30 dark:bg-muted-foreground/40 -translate-y-1/2" />
      </div>
    </div>
  )
}

// ============================================================================
// STATUS INDICATOR
// ============================================================================

interface StatusIndicatorProps {
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  size?: 'sm' | 'md'
  asDot?: boolean
}

function StatusIndicator({ isPending, isError, isSuccess, size = 'sm', asDot = false }: StatusIndicatorProps) {
  if (asDot) {
    return (
      <div className={cn(
        "rounded-full transition-colors",
        size === 'sm' ? "w-1.5 h-1.5" : "w-2 h-2",
        isPending && "bg-amber-400 animate-pulse",
        isError && "bg-red-400",
        isSuccess && "bg-emerald-400",
        !isPending && !isError && !isSuccess && "bg-muted-foreground/30"
      )} />
    )
  }

  const iconSize = size === 'sm' ? 12 : 14

  if (isPending) {
    return <IconLoader2 size={iconSize} className="text-muted-foreground animate-spin" />
  }
  if (isError) {
    return <IconX size={iconSize} className="text-destructive" />
  }
  if (isSuccess) {
    return <IconCheck size={iconSize} className="text-emerald-500" />
  }
  return null
}

// ============================================================================
// LEAF ITEM - Individual tool call (deepest level)
// ============================================================================

const ToolCallLeaf = memo(function ToolCallLeaf({
  tc,
  chatStatus,
  isLast,
  onViewArtifact,
  depth,
  parentLines
}: {
  tc: ToolCall
  chatStatus?: string
  isLast: boolean
  onViewArtifact?: (id: string) => void
  depth: number
  parentLines: boolean[]
}) {
  const part = toToolPart(tc)
  const { isPending, isError, isSuccess } = getToolStatus(part, chatStatus)
  const toolType = `tool-${tc.name}`
  const meta = AgentToolRegistry[toolType]

  const title = meta?.title ? meta.title(part) : tc.name

  // Get artifact-specific title for charts, spreadsheets, documents
  const artifactTitle = getArtifactTitle(tc)
  const isArtifactCreation = isChartTool(tc.name) || isArtifactTool(tc.name)

  const artifactId = getArtifactId(tc)
  const showViewArtifact = isArtifactTool(tc.name) && artifactId && isSuccess

  const imageData = isImageTool(tc.name) && isSuccess ? getImageData(tc) : undefined
  const chartData = isChartTool(tc.name) && isSuccess ? getChartData(tc) : undefined

  return (
    <div className="relative">
      <div className="flex items-center min-h-[26px] hover:bg-muted/30 transition-colors rounded-sm group">
        {/* Tree connector lines */}
        <TreeLines depth={depth} isLast={isLast} parentLines={parentLines} />

        {/* Status dot */}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <StatusIndicator isPending={isPending} isError={isError} isSuccess={isSuccess} asDot />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex items-center gap-2 py-0.5 pr-2">
          <span className={cn(
            "text-xs truncate",
            isPending ? "text-foreground" : "text-muted-foreground"
          )}>
            {isPending ? (
              <TextShimmer as="span" duration={1.2} className="text-xs">
                {title}
              </TextShimmer>
            ) : title}
          </span>

          {/* Show artifact title (chart name, spreadsheet name, etc.) */}
          {isArtifactCreation && artifactTitle && (
            <span className="text-[11px] text-muted-foreground/70 truncate max-w-[200px]" title={artifactTitle}>
              {artifactTitle}
            </span>
          )}

          {showViewArtifact && onViewArtifact && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
              onClick={(e) => {
                e.stopPropagation()
                onViewArtifact(artifactId)
              }}
            >
              <IconEye size={12} className="mr-0.5" />
              View
            </Button>
          )}

          {!showViewArtifact && (
            <div className="ml-auto opacity-50">
              <StatusIndicator isPending={isPending} isError={isError} isSuccess={isSuccess} />
            </div>
          )}
        </div>
      </div>

      {/* Inline content - w-5 (20px) per depth level + status dot w-5 (20px) */}
      {imageData && (
        <div style={{ marginLeft: `${(depth + 1) * 20 + 20}px` }} className="pb-2">
          <AgentGeneratedImage
            imageUrl={imageData.imageUrl}
            prompt={imageData.prompt}
            size={imageData.size}
            quality={imageData.quality}
          />
        </div>
      )}

      {chartData && (
        <div style={{ marginLeft: `${(depth + 1) * 20 + 20}px` }} className="pb-2">
          <AgentGeneratedChart
            artifactId={chartData.artifactId}
            chartConfig={chartData.chartConfig}
            title={chartData.title}
            onViewInPanel={onViewArtifact}
          />
        </div>
      )}
    </div>
  )
})

// ============================================================================
// TREE CONNECTOR LINES FOR BRANCHES (with chevron integration)
// ============================================================================

interface TreeLinesWithChevronProps {
  depth: number
  isLast: boolean
  parentLines?: boolean[]
  isExpanded: boolean
  onToggle: () => void
}

function TreeLinesWithChevron({ depth, isLast, parentLines = [], isExpanded, onToggle }: TreeLinesWithChevronProps) {
  return (
    <div className="flex items-center">
      {/* Lines for parent levels */}
      {parentLines.map((showLine, idx) => (
        <div key={idx} className="w-5 h-full flex-shrink-0 relative self-stretch">
          {showLine && (
            <div className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-px bg-muted-foreground/30 dark:bg-muted-foreground/40" />
          )}
        </div>
      ))}
      {/* Current level connector - the "L" or "├" shape */}
      {depth > 0 && (
        <div className="w-5 h-full flex-shrink-0 relative self-stretch">
          {/* Vertical line */}
          <div className={cn(
            "absolute left-1/2 -translate-x-1/2 w-px bg-muted-foreground/30 dark:bg-muted-foreground/40",
            isLast ? "top-0 h-1/2" : "top-0 h-full"
          )} />
          {/* Horizontal connector */}
          <div className="absolute top-1/2 left-1/2 w-[10px] h-px bg-muted-foreground/30 dark:bg-muted-foreground/40 -translate-y-1/2" />
        </div>
      )}
      {/* Chevron button - also shows vertical line if expanded and has children */}
      <div className="relative flex-shrink-0 self-stretch flex items-center">
        {/* Vertical line below chevron when expanded (connects to children) */}
        {isExpanded && (
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 h-1/2 w-px bg-muted-foreground/30 dark:bg-muted-foreground/40" />
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="w-5 h-5 flex items-center justify-center hover:bg-muted/50 rounded-sm transition-colors relative z-10"
        >
          {isExpanded ? (
            <IconChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <IconChevronRight size={14} className="text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// GROUP BRANCH - Category of tool calls
// ============================================================================

const GroupBranch = memo(function GroupBranch({
  group,
  chatStatus,
  isLast,
  onViewArtifact,
  depth,
  parentLines,
  defaultExpanded = false
}: {
  group: GroupedToolCall
  chatStatus?: string
  isLast: boolean
  onViewArtifact?: (id: string) => void
  depth: number
  parentLines: boolean[]
  defaultExpanded?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const hasPending = group.calls.some(tc => getToolStatus(toToolPart(tc), chatStatus).isPending)
  const allSuccess = group.calls.every(tc => getToolStatus(toToolPart(tc), chatStatus).isSuccess)
  const hasError = group.calls.some(tc => getToolStatus(toToolPart(tc), chatStatus).isError)

  const Icon = group.icon
  const showViewArtifact = isArtifactTool(group.name) && group.artifactId && allSuccess

  const isImageGroup = isImageTool(group.name)
  const isChartGroup = isChartTool(group.name)

  const completedImages = isImageGroup
    ? group.calls
      .filter(tc => getToolStatus(toToolPart(tc), chatStatus).isSuccess)
      .map(tc => getImageData(tc))
      .filter((data): data is NonNullable<typeof data> => data !== undefined)
    : []

  const completedCharts = isChartGroup
    ? group.calls
      .filter(tc => getToolStatus(toToolPart(tc), chatStatus).isSuccess)
      .map(tc => getChartData(tc))
      .filter((data): data is NonNullable<typeof data> => data !== undefined)
    : []

  // Child lines: continue parent lines, add current level if not last
  const childParentLines = [...parentLines, !isLast]

  const handleToggle = () => setIsExpanded(!isExpanded)

  return (
    <div className="relative">
      {/* Group header */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle() } }}
        className="flex items-center min-h-[30px] hover:bg-muted/40 transition-colors cursor-pointer select-none rounded-sm group"
      >
        {/* Tree connector lines with integrated chevron */}
        <TreeLinesWithChevron
          depth={depth}
          isLast={isLast}
          parentLines={parentLines}
          isExpanded={isExpanded}
          onToggle={handleToggle}
        />

        {/* Tool icon */}
        {Icon && (
          <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mr-1.5" />
        )}

        {/* Title */}
        <span className="text-xs font-medium text-foreground">
          {hasPending ? (
            <TextShimmer as="span" duration={1.2} className="text-xs">
              {group.displayName}
            </TextShimmer>
          ) : group.displayName}
        </span>

        {/* Count badge */}
        {group.count > 1 && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-1.5",
            allSuccess
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : hasPending
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
          )}>
            {group.count}×
          </span>
        )}

        {/* View Artifact button */}
        {showViewArtifact && onViewArtifact && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto mr-1"
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
          <div className="ml-auto mr-2">
            <StatusIndicator isPending={hasPending} isError={hasError} isSuccess={allSuccess} />
          </div>
        )}
      </div>

      {/* Expanded children */}
      {isExpanded && (
        <div>
          {group.calls.map((tc, idx) => (
            <ToolCallLeaf
              key={tc.id}
              tc={tc}
              chatStatus={chatStatus}
              isLast={idx === group.calls.length - 1}
              onViewArtifact={onViewArtifact}
              depth={depth + 1}
              parentLines={childParentLines}
            />
          ))}
        </div>
      )}

      {/* Inline images when collapsed - w-5 (20px) per depth level + chevron w-5 (20px) */}
      {!isExpanded && completedImages.length > 0 && (
        <div style={{ marginLeft: `${(depth + 1) * 20 + 20}px` }} className="pb-2 space-y-2">
          {completedImages.map((imgData, idx) => (
            <AgentGeneratedImage
              key={`${imgData.imageUrl}-${idx}`}
              imageUrl={imgData.imageUrl}
              prompt={imgData.prompt}
              size={imgData.size}
              quality={imgData.quality}
            />
          ))}
        </div>
      )}

      {/* Inline charts when collapsed - w-5 (20px) per depth level + chevron w-5 (20px) */}
      {!isExpanded && completedCharts.length > 0 && (
        <div style={{ marginLeft: `${(depth + 1) * 20 + 20}px` }} className="pb-2 space-y-2">
          {completedCharts.map((chartData, idx) => (
            <AgentGeneratedChart
              key={`${chartData.artifactId}-${idx}`}
              artifactId={chartData.artifactId}
              chartConfig={chartData.chartConfig}
              title={chartData.title}
              onViewInPanel={onViewArtifact}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// ============================================================================
// MAIN COMPONENT
// ============================================================================

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

  const allComplete = toolCalls.every(tc => tc.status === 'complete')
  const hasPending = toolCalls.some(tc =>
    tc.status === 'streaming' || tc.status === 'executing' || tc.status === 'done'
  )
  const hasError = toolCalls.some(tc => tc.status === 'error')

  const summaryText = hasPending
    ? `Running ${toolCalls.length} tool${toolCalls.length !== 1 ? 's' : ''}...`
    : `${toolCalls.length} tool${toolCalls.length !== 1 ? 's' : ''} completed`

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      allComplete
        ? "border-border/50 bg-card/50"
        : "border-border/40 bg-card/30"
    )}>
      {/* Root header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(!isExpanded) } }}
        className="w-full flex items-center py-2 px-2 hover:bg-muted/30 transition-colors cursor-pointer select-none"
      >
        {/* Expand chevron - aligned with nested chevrons */}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {isExpanded ? (
            <IconChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <IconChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>

        {/* Summary */}
        <span className="text-xs font-medium text-foreground ml-1">
          {hasPending ? (
            <TextShimmer as="span" duration={1.2} className="text-xs">
              {summaryText}
            </TextShimmer>
          ) : summaryText}
        </span>

        {/* Group count badge */}
        {groups.length > 1 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium ml-1.5">
            {groups.length} groups
          </span>
        )}

        {/* Status indicator */}
        <div className="ml-auto mr-1">
          <StatusIndicator isPending={hasPending} isError={hasError} isSuccess={allComplete} size="md" />
        </div>
      </div>

      {/* Expanded tree content */}
      {isExpanded && (
        <div className="border-t border-border/30 bg-background/50 py-1 px-2">
          {groups.map((group, idx) => (
            <GroupBranch
              key={group.name}
              group={group}
              chatStatus={chatStatus}
              isLast={idx === groups.length - 1}
              onViewArtifact={onViewArtifact}
              depth={0}
              parentLines={[]}
              defaultExpanded={groups.length === 1 || isStreaming}
            />
          ))}
        </div>
      )}
    </div>
  )
})
