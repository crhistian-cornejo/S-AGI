import { memo, useState, useMemo } from "react"
import { IconCheck, IconX } from "@tabler/icons-react"
import { IconSpinner, ExpandIcon, CollapseIcon } from "./icons"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { getToolStatus, type ToolPart } from "./agent-tool-registry"
import { cn } from "@/lib/utils"

interface AgentBashProps {
  part: ToolPart
  chatStatus?: string
}

// Extract command summary - first word of each command in a pipeline
function extractCommandSummary(command: string): string {
  // First, normalize line continuations (backslash + newline) into single line
  const normalizedCommand = command.replace(/\\\s*\n\s*/g, " ")
  const parts = normalizedCommand.split(/\s*(?:&&|\|\||;|\|)\s*/)
  const firstWords = parts.map((p) => p.trim().split(/\s+/)[0]).filter(Boolean)
  // Limit to first 4 commands to keep it concise
  const limited = firstWords.slice(0, 4)
  if (firstWords.length > 4) {
    return limited.join(", ") + "..."
  }
  return limited.join(", ")
}

export const AgentBash = memo(function AgentBash({
  part,
  chatStatus,
}: AgentBashProps) {
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const { isPending } = getToolStatus(part, chatStatus)

  const command = (part.input?.command as string) || ""
  const stdout = (part.output?.stdout as string) || (part.output?.output as string) || ""
  const stderr = (part.output?.stderr as string) || ""
  const exitCode = (part.output?.exitCode as number | undefined) ?? (part.output?.exit_code as number | undefined)

  // For bash tools, success/error is determined by exitCode, not by state
  // exitCode 0 = success, anything else (or undefined if no output yet) = error
  const isSuccess = exitCode === 0
  const isError = exitCode !== undefined && exitCode !== 0

  // Determine if we have any output
  const hasOutput = stdout || stderr

  // Memoize command summary to avoid recalculation on every render
  const commandSummary = useMemo(
    () => extractCommandSummary(command),
    [command],
  )

  // Check if command input is still being streamed
  const isInputStreaming = part.state === "input-streaming"

  // If command is still being generated (input-streaming state), show like other tools
  // Use isPending to stop shimmer when chat is stopped (consistent with other tools)
  if (isInputStreaming || !command) {
    return (
      <div className="flex items-start gap-1.5 rounded-md py-0.5 px-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0">
              {isPending ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  Generating command
                </TextShimmer>
              ) : (
                "Generating command"
              )}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header - fixed height to prevent layout shift */}
      <div className="flex items-center justify-between px-2.5 h-7">
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {isPending ? "Running command: " : "Ran command: "}
          {commandSummary}
        </span>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* Status - min-width ensures no layout shift */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-[60px] justify-end">
            {isPending ? (
              <IconSpinner className="w-3 h-3" />
            ) : isSuccess ? (
              <>
                <IconCheck className="w-3 h-3" />
                <span>Success</span>
              </>
            ) : isError ? (
              <>
                <IconX className="w-3 h-3" />
                <span>Failed</span>
              </>
            ) : null}
          </div>

          {/* Expand/Collapse button - only show when not pending and has output */}
          {!isPending && hasOutput && (
            <button
              type="button"
              onClick={() => setIsOutputExpanded(!isOutputExpanded)}
              className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
            >
              <div className="relative w-4 h-4">
                <ExpandIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isOutputExpanded
                      ? "opacity-0 scale-75"
                      : "opacity-100 scale-100",
                  )}
                />
                <CollapseIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isOutputExpanded
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-75",
                  )}
                />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Content - always visible, clickable to expand (only when collapsed) */}
      <div
        className={cn(
          "border-t border-border px-2.5 py-1.5 transition-colors duration-150",
          isOutputExpanded
            ? "max-h-[200px] overflow-y-auto"
            : "max-h-[72px] overflow-hidden",
          hasOutput && !isOutputExpanded && "cursor-pointer hover:bg-muted/50",
        )}
      >
        {hasOutput && !isOutputExpanded && (
          <button
            type="button"
            onClick={() => setIsOutputExpanded(true)}
            className="absolute inset-0 w-full h-full opacity-0"
            aria-label="Expand output"
          />
        )}
        {/* Command */}
        <div className="font-mono text-xs">
          <span className="text-amber-600 dark:text-amber-400">$ </span>
          <span className="text-foreground whitespace-pre-wrap break-all">
            {command}
          </span>
        </div>

        {/* Stdout - normal color */}
        {stdout && (
          <div className="mt-1.5 font-mono text-xs text-muted-foreground whitespace-pre-wrap break-all">
            {stdout}
          </div>
        )}

        {/* Stderr - warning/error color based on exit code */}
        {stderr && (
          <div
            className={cn(
              "mt-1.5 font-mono text-xs whitespace-pre-wrap break-all",
              // If exitCode is 0, it's a warning (e.g. npm warnings)
              // If exitCode is non-zero, it's an error
              exitCode === 0 || exitCode === undefined
                ? "text-amber-600 dark:text-amber-400"
                : "text-rose-500 dark:text-rose-400",
            )}
          >
            {stderr}
          </div>
        )}
      </div>
    </div>
  )
})

// Legacy interface for backwards compatibility
export interface BashToolResult {
  command: string
  output?: string
  exitCode?: number
  error?: string
  workingDirectory?: string
}

export interface AgentBashProps_Legacy {
  toolCallId: string
  args: {
    command: string
    workdir?: string
    timeout?: number
    description?: string
  }
  result?: BashToolResult
  status: 'pending' | 'executing' | 'complete' | 'error'
  className?: string
}
