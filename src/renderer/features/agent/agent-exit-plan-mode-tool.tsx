import { memo, useMemo, useState } from "react"
import { IconCircle, IconChevronDown, IconChevronUp, IconSparkles } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { ChatMarkdownRenderer } from "@/components/chat-markdown-renderer"
import type { ToolPart } from "./agent-tool-registry"
import { PlanningIcon } from "./icons"

interface ExitPlanModeToolPart extends ToolPart {
  output?: {
    plan?: string
    success?: boolean
  }
}

interface AgentExitPlanModeToolProps {
  part: ExitPlanModeToolPart
  chatStatus?: string
}

interface ParsedPlan {
  summary: string
  steps: Array<{
    number: number
    title: string
    description: string
  }>
  notes: string[]
}

// Parse markdown plan into structured data
function parsePlanMarkdown(markdown: string): ParsedPlan {
  const lines = markdown.split('\n')
  const result: ParsedPlan = {
    summary: '',
    steps: [],
    notes: []
  }

  let currentSection: 'none' | 'summary' | 'steps' | 'notes' = 'none'
  let currentStep: { number: number; title: string; description: string } | null = null

  for (const line of lines) {
    const trimmedLine = line.trim()
    
    // Detect section headers
    if (trimmedLine.match(/^##?\s*(summary|resumen)/i)) {
      currentSection = 'summary'
      continue
    }
    if (trimmedLine.match(/^##?\s*(steps|pasos)/i)) {
      currentSection = 'steps'
      continue
    }
    if (trimmedLine.match(/^##?\s*(notes|notas|considerations|consideraciones)/i)) {
      currentSection = 'notes'
      continue
    }

    // Process content based on section
    if (currentSection === 'summary' && trimmedLine) {
      result.summary += (result.summary ? ' ' : '') + trimmedLine
    }

    if (currentSection === 'steps') {
      // Match numbered step: "1. **Title** - Description" or "1) Title - Description"
      const stepMatch = trimmedLine.match(/^(\d+)[.)]\s*\*?\*?([^*-]+)\*?\*?\s*[-–]?\s*(.*)$/)
      if (stepMatch) {
        if (currentStep) {
          result.steps.push(currentStep)
        }
        currentStep = {
          number: parseInt(stepMatch[1]),
          title: stepMatch[2].trim().replace(/\*\*/g, ''),
          description: stepMatch[3].trim()
        }
      } else if (currentStep && trimmedLine && !trimmedLine.startsWith('#')) {
        // Continuation of description
        currentStep.description += ' ' + trimmedLine
      }
    }

    if (currentSection === 'notes') {
      // Match bullet points
      const noteMatch = trimmedLine.match(/^[-*]\s*(.+)$/)
      if (noteMatch) {
        result.notes.push(noteMatch[1])
      } else if (trimmedLine && !trimmedLine.startsWith('#')) {
        result.notes.push(trimmedLine)
      }
    }
  }

  // Push last step
  if (currentStep) {
    result.steps.push(currentStep)
  }

  return result
}

export const AgentExitPlanModeTool = memo(function AgentExitPlanModeTool({
  part
}: AgentExitPlanModeToolProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)
  
  // Get plan text from output.plan
  const planText = typeof part.output?.plan === "string" ? part.output.plan : ""
  
  // Parse the plan
  const parsedPlan = useMemo(() => {
    if (!planText) return null
    return parsePlanMarkdown(planText)
  }, [planText])

  if (!planText) {
    return null
  }

  // If parsing failed or no steps, show raw markdown
  const hasValidPlan = parsedPlan && parsedPlan.steps.length > 0

  const handleToggle = () => setIsExpanded(!isExpanded)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div className="rounded-xl border bg-[hsl(var(--plan-mode))]/5 border-[hsl(var(--plan-mode))]/30 overflow-hidden mx-2 my-2">
      {/* Header */}
      <div 
        role="button"
        tabIndex={0}
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[hsl(var(--plan-mode))]/10 transition-colors"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--plan-mode))]/20 flex items-center justify-center shrink-0">
          <PlanningIcon className="w-4 h-4 text-[hsl(var(--plan-mode))]" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">Execution Plan</span>
          {hasValidPlan && (
            <span className="text-xs text-muted-foreground block mt-0.5">
              {parsedPlan.steps.length} steps to complete
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <IconChevronUp size={16} className="text-muted-foreground" />
          ) : (
            <IconChevronDown size={16} className="text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-[hsl(var(--plan-mode))]/20">
          {hasValidPlan && !showRawMarkdown ? (
            <>
              {/* Summary */}
              {parsedPlan.summary && (
                <div className="px-4 py-3 bg-[hsl(var(--plan-mode))]/5 border-b border-[hsl(var(--plan-mode))]/10">
                  <div className="flex items-start gap-2">
                    <IconSparkles size={14} className="text-[hsl(var(--plan-mode))] mt-0.5 shrink-0" />
                    <p className="text-sm text-foreground/90">{parsedPlan.summary}</p>
                  </div>
                </div>
              )}

              {/* Steps */}
              <div className="p-4 space-y-1">
                {parsedPlan.steps.map((step, index) => (
                  <div
                    key={step.number}
                    className={cn(
                      "flex items-start gap-3 p-2.5 rounded-lg transition-colors hover:bg-[hsl(var(--plan-mode))]/5",
                      index % 2 === 0 && "bg-muted/20"
                    )}
                  >
                    {/* Step number circle */}
                    <div className="w-6 h-6 rounded-full bg-[hsl(var(--plan-mode))]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-[hsl(var(--plan-mode-foreground))]">
                        {step.number}
                      </span>
                    </div>
                    
                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {step.title}
                      </span>
                      {step.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {step.description}
                        </p>
                      )}
                    </div>

                    {/* Status indicator */}
                    <IconCircle size={14} className="text-muted-foreground/30 shrink-0 mt-1" />
                  </div>
                ))}
              </div>

              {/* Notes */}
              {parsedPlan.notes.length > 0 && (
                <div className="px-4 py-3 bg-muted/30 border-t border-[hsl(var(--plan-mode))]/10">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                    Notes
                  </span>
                  <ul className="space-y-1">
                    {parsedPlan.notes.map((note, idx) => (
                      <li key={`note-${idx}`} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-[hsl(var(--plan-mode))] mt-0.5">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Toggle to raw markdown */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowRawMarkdown(true)
                }}
                className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-[hsl(var(--plan-mode))]/10"
              >
                Show raw plan
              </button>
            </>
          ) : (
            <>
              {/* Raw markdown view */}
              <div className="p-4 text-foreground">
                <ChatMarkdownRenderer content={planText} />
              </div>
              {hasValidPlan && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowRawMarkdown(false)
                  }}
                  className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-[hsl(var(--plan-mode))]/10"
                >
                  Show formatted view
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
})
