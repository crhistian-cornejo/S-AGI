/**
 * Agent Task Tracker - Google Sheets AI style task progress
 *
 * Shows a collapsible task list with completion status,
 * similar to the "X of Y tasks completed" UI in Google Sheets AI.
 */

import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconLoader2,
  IconChevronUp,
  IconChevronDown,
  IconCircleDashed,
  IconArrowUpRight,
} from "@tabler/icons-react";

export interface AgentTask {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface AgentTaskTrackerProps {
  tasks: AgentTask[];
  className?: string;
  defaultExpanded?: boolean;
}

export const AgentTaskTracker = memo(function AgentTaskTracker({
  tasks,
  className,
  defaultExpanded = false,
}: AgentTaskTrackerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalCount = tasks.length;
  const allCompleted = completedCount === totalCount;
  const hasInProgress = tasks.some((t) => t.status === "in_progress");

  return (
    <div
      className={cn(
        "border-t border-border/50 bg-muted/20",
        className
      )}
    >
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3",
          "hover:bg-muted/30 transition-colors",
          "text-left"
        )}
      >
        <div className="flex items-center gap-2">
          {/* Status icon */}
          {hasInProgress ? (
            <IconLoader2
              size={16}
              className="text-primary animate-spin"
            />
          ) : allCompleted ? (
            <IconCheck size={16} className="text-emerald-500" />
          ) : (
            <IconCircleDashed size={16} className="text-muted-foreground" />
          )}

          {/* Progress text */}
          <span className="text-sm font-medium text-foreground">
            {completedCount} of {totalCount} tasks completed
          </span>
        </div>

        {/* Expand/collapse */}
        <div className="flex items-center gap-1">
          {isExpanded ? (
            <IconChevronDown size={16} className="text-muted-foreground" />
          ) : (
            <IconArrowUpRight size={14} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Task list - Collapsible */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-1">
          {tasks.map((task, index) => (
            <TaskItem key={task.id} task={task} index={index} />
          ))}
        </div>
      )}
    </div>
  );
});

// Individual task item
const TaskItem = memo(function TaskItem({
  task,
  index,
}: {
  task: AgentTask;
  index: number;
}) {
  const isCompleted = task.status === "completed";
  const isInProgress = task.status === "in_progress";

  return (
    <div
      className={cn(
        "flex items-start gap-2 py-1.5 rounded-md px-2 -mx-2",
        "transition-colors",
        isInProgress && "bg-primary/5"
      )}
    >
      {/* Status indicator */}
      <div className="mt-0.5 shrink-0">
        {isCompleted ? (
          <IconCheck
            size={14}
            className="text-emerald-500"
          />
        ) : isInProgress ? (
          <IconLoader2
            size={14}
            className="text-primary animate-spin"
          />
        ) : (
          <IconCircleDashed
            size={14}
            className="text-muted-foreground/50"
          />
        )}
      </div>

      {/* Task content */}
      <span
        className={cn(
          "text-sm leading-relaxed",
          isCompleted && "text-muted-foreground line-through decoration-muted-foreground/50",
          isInProgress && "text-foreground font-medium",
          !isCompleted && !isInProgress && "text-muted-foreground"
        )}
      >
        {index + 1}. {task.content}
      </span>
    </div>
  );
});

export default AgentTaskTracker;
