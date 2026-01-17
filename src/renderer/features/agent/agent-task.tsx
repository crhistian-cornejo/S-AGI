import { memo, useState } from "react"
import { IconCheck, IconAlertCircle } from "@tabler/icons-react"
import { SparklesIcon, IconSpinner, ExpandIcon, CollapseIcon } from "./icons"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { getToolStatus, type ToolPart } from "./agent-tool-registry"
import { cn } from "@/lib/utils"

interface SubTask {
  id: string
  name: string
  status: 'pending' | 'running' | 'complete' | 'error'
  message?: string
}

interface AgentTaskProps {
  part: ToolPart
  chatStatus?: string
}

export const AgentTask = memo(function AgentTask({
  part,
  chatStatus,
}: AgentTaskProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { isPending, isError } = getToolStatus(part, chatStatus)

  const description = (part.input?.description as string) || "Running task"
  const prompt = (part.input?.prompt as string) || ""
  const subagentType = (part.input?.subagent_type as string) || ""
  const message = (part.output?.message as string) || ""
  const output = (part.output?.output as string) || ""
  const subTasks = (part.output?.subTasks as SubTask[]) || []
  const success = part.output?.success as boolean | undefined

  const isComplete = part.state === "output-available"
  const hasError = isError || (isComplete && success === false)

  const getAgentLabel = () => {
    switch (subagentType) {
      case 'general': return 'General'
      case 'explore': return 'Explore'
      default: return 'Agent'
    }
  }

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
          <SparklesIcon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />

          {isPending ? (
            <TextShimmer
              as="span"
              duration={1.2}
              className="text-xs text-muted-foreground"
            >
              Running task
            </TextShimmer>
          ) : (
            <span className="text-xs text-muted-foreground">Task completed</span>
          )}

          <span className="truncate text-foreground">{description}</span>
          
          <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-600 font-medium flex-shrink-0">
            {getAgentLabel()}
          </span>
        </div>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <div className="flex items-center gap-1.5 text-xs">
            {isPending ? (
              <IconSpinner className="w-3 h-3" />
            ) : hasError ? (
              <IconAlertCircle className="w-3 h-3 text-destructive" />
            ) : (
              <IconCheck className="w-3 h-3 text-emerald-500" />
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
      {isExpanded && (
        <div className="border-t border-border">
          {/* Prompt */}
          {prompt && (
            <div className="px-2.5 py-2 border-b border-border/30">
              <span className="text-xs text-muted-foreground font-medium">Task Prompt:</span>
              <p className="text-xs text-foreground mt-1 whitespace-pre-wrap line-clamp-5">
                {prompt.slice(0, 500)}
                {prompt.length > 500 && "..."}
              </p>
            </div>
          )}

          {/* Sub-tasks */}
          {subTasks.length > 0 && (
            <div className="px-2.5 py-2 border-b border-border/30 space-y-1">
              <span className="text-xs text-muted-foreground font-medium">Sub-tasks:</span>
              {subTasks.map((subTask) => (
                <SubTaskItem key={subTask.id} subTask={subTask} />
              ))}
            </div>
          )}

          {/* Output */}
          {output && (
            <div className="px-2.5 py-2 border-b border-border/30">
              <span className="text-xs text-muted-foreground font-medium">Result:</span>
              <pre className="text-xs font-mono text-foreground/80 mt-1 whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                {output}
              </pre>
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={cn(
              "px-2.5 py-2",
              hasError ? "bg-red-500/5" : "",
            )}>
              <p className={cn(
                "text-xs",
                hasError ? "text-red-500" : "text-muted-foreground",
              )}>
                {message}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

function SubTaskItem({ subTask }: { subTask: SubTask }) {
  const getIcon = () => {
    switch (subTask.status) {
      case 'complete':
        return <IconCheck size={12} className="text-emerald-500" />
      case 'running':
        return <IconSpinner className="w-3 h-3 text-cyan-500" />
      case 'error':
        return <IconAlertCircle size={12} className="text-red-500" />
      default:
        return <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/30" />
    }
  }

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      {getIcon()}
      <span className={cn(
        "text-xs",
        subTask.status === 'complete' ? 'text-muted-foreground' : 'text-foreground'
      )}>
        {subTask.name}
      </span>
      {subTask.message && (
        <span className="text-xs text-muted-foreground ml-auto truncate max-w-[150px]">
          {subTask.message}
        </span>
      )}
    </div>
  )
}

// Legacy interface for backwards compatibility
export interface TaskResult {
  success: boolean
  message?: string
  output?: string
  subTasks?: SubTask[]
}

export interface AgentTaskProps_Legacy {
  toolCallId: string
  args: {
    description: string
    prompt: string
    subagent_type?: string
  }
  result?: TaskResult
  status: 'pending' | 'executing' | 'complete' | 'error'
  className?: string
}
