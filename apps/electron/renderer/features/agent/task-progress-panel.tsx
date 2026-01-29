/**
 * Task Progress Panel - Ramp Sheets style task list
 *
 * Shows AI's planned tasks with completion progress.
 * Displays above the chat input, auto-expands during streaming.
 */

import { memo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconLoader2,
  IconChevronUp,
  IconChevronDown,
  IconCircle,
  IconListNumbers,
} from "@tabler/icons-react";

export interface TaskItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface TaskProgressPanelProps {
  tasks: TaskItem[];
  isStreaming?: boolean;
  className?: string;
}

export const TaskProgressPanel = memo(function TaskProgressPanel({
  tasks,
  isStreaming = false,
  className,
}: TaskProgressPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand when streaming starts with tasks
  useEffect(() => {
    if (isStreaming && tasks.length > 0) {
      setIsExpanded(true);
    }
  }, [isStreaming, tasks.length]);

  // Auto-collapse when all tasks complete and not streaming
  useEffect(() => {
    if (!isStreaming && tasks.length > 0) {
      const allCompleted = tasks.every((t) => t.status === "completed");
      if (allCompleted) {
        const timer = setTimeout(() => setIsExpanded(false), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [isStreaming, tasks]);

  if (tasks.length === 0) return null;

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalCount = tasks.length;
  const hasInProgress = tasks.some((t) => t.status === "in_progress");

  return (
    <div
      className={cn(
        "border border-border/50 rounded-xl bg-background/80 backdrop-blur-sm",
        "shadow-sm mx-3 mb-2",
        className
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3",
          "hover:bg-muted/30 transition-colors rounded-xl",
          isExpanded && "border-b border-border/30 rounded-b-none"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className={cn(
              "w-6 h-6 rounded-md flex items-center justify-center",
              hasInProgress && "bg-primary/10",
              completedCount === totalCount && "bg-emerald-500/10",
              !hasInProgress && completedCount < totalCount && "bg-muted"
            )}
          >
            {hasInProgress ? (
              <IconLoader2 size={14} className="text-primary animate-spin" />
            ) : completedCount === totalCount ? (
              <IconCheck size={14} className="text-emerald-500" />
            ) : (
              <IconListNumbers size={14} className="text-muted-foreground" />
            )}
          </div>

          {/* Progress text */}
          <span className="text-sm font-medium text-foreground">
            {completedCount} of {totalCount} tasks completed
          </span>
        </div>

        {/* Expand/Collapse chevron */}
        <div className="text-muted-foreground">
          {isExpanded ? (
            <IconChevronUp size={16} />
          ) : (
            <IconChevronDown size={16} />
          )}
        </div>
      </button>

      {/* Task List */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-2 max-h-[200px] overflow-y-auto">
          {tasks.map((task, index) => (
            <TaskItemRow key={task.id} task={task} index={index} />
          ))}
        </div>
      )}
    </div>
  );
});

const TaskItemRow = memo(function TaskItemRow({
  task,
  index,
}: {
  task: TaskItem;
  index: number;
}) {
  const isCompleted = task.status === "completed";
  const isInProgress = task.status === "in_progress";

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-1.5 px-2 -mx-2 rounded-lg transition-colors",
        isInProgress && "bg-primary/5"
      )}
    >
      {/* Checkbox/Status */}
      <div className="mt-0.5 shrink-0">
        {isCompleted ? (
          <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <IconCheck size={12} className="text-emerald-500" />
          </div>
        ) : isInProgress ? (
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
            <IconLoader2 size={12} className="text-primary animate-spin" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
            <IconCircle size={8} className="text-transparent" />
          </div>
        )}
      </div>

      {/* Task content */}
      <span
        className={cn(
          "text-sm leading-relaxed flex-1",
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

export default TaskProgressPanel;
