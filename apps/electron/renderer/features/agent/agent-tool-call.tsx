/**
 * Agent Tool Call - Individual tool call display component
 *
 * Features:
 * - Shimmer animation for pending state
 * - Tooltip support for full path display
 * - Click handler for file opening
 * - HTML subtitle support for colored diff stats
 */

import { memo } from "react"
import { TextShimmer } from "@/components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface AgentToolCallProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
  tooltipContent?: string
  isPending: boolean
  isError: boolean
  isNested?: boolean
  onClick?: () => void
}

export const AgentToolCall = memo(
  function AgentToolCall({
    icon: Icon,
    title,
    subtitle,
    tooltipContent,
    isPending,
    isError,
    isNested,
    onClick,
  }: AgentToolCallProps) {
    // Ensure title and subtitle are strings
    const titleStr = String(title)
    const subtitleStr = subtitle ? String(subtitle) : undefined

    const content = (
      <div
        className={cn(
          "flex items-start gap-1.5 py-0.5",
          isNested ? "px-2.5" : "rounded-md px-2",
          onClick && "cursor-pointer hover:bg-muted/30 transition-colors"
        )}
        onClick={onClick}
      >
        {/* Icon */}
        <div
          className={cn(
            "flex-shrink-0 flex items-center pt-[1px] w-4 h-4",
            isPending && "text-primary",
            !isPending && !isError && "text-muted-foreground",
            isError && "text-destructive"
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        {/* Content container */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs flex items-center gap-1.5 min-w-0">
            {/* Title */}
            <span
              className={cn(
                "font-medium whitespace-nowrap flex-shrink-0",
                isPending && "text-foreground",
                !isPending && !isError && "text-muted-foreground",
                isError && "text-destructive"
              )}
            >
              {isPending ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  {titleStr}
                </TextShimmer>
              ) : (
                titleStr
              )}
            </span>

            {/* Subtitle */}
            {subtitleStr && (
              <span
                className="text-muted-foreground/60 font-normal truncate min-w-0"
                dangerouslySetInnerHTML={{ __html: subtitleStr }}
              />
            )}
          </div>
        </div>
      </div>
    )

    // Wrap with tooltip if tooltipContent is available
    if (tooltipContent) {
      return (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              {content}
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="text-xs font-mono max-w-md break-all"
            >
              {tooltipContent}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return content
  },
  (prevProps, nextProps) => {
    // Custom comparison for memoization
    return (
      prevProps.title === nextProps.title &&
      prevProps.subtitle === nextProps.subtitle &&
      prevProps.tooltipContent === nextProps.tooltipContent &&
      prevProps.isPending === nextProps.isPending &&
      prevProps.isError === nextProps.isError &&
      prevProps.isNested === nextProps.isNested &&
      prevProps.onClick === nextProps.onClick
    )
  },
)

export default AgentToolCall
