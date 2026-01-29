/**
 * Checkpoint Timeline
 *
 * Full timeline view of all checkpoints for a file.
 * Can be shown in a side panel or dialog.
 */

import { memo, useMemo } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  IconHistory,
  IconRestore,
  IconClock,
  IconLoader2,
  IconCheck,
} from "@tabler/icons-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface CheckpointTimelineProps {
  fileId: string;
  currentVersion?: number;
  onRestoreClick: (checkpoint: {
    id: string;
    versionNumber: number;
    prompt: string;
    createdAt: string;
  }) => void;
  className?: string;
}

export const CheckpointTimeline = memo(function CheckpointTimeline({
  fileId,
  currentVersion,
  onRestoreClick,
  className,
}: CheckpointTimelineProps) {
  // Fetch all checkpoints
  const { data: checkpoints, isLoading } = trpc.checkpoints.list.useQuery(
    { fileId, limit: 50 },
    { enabled: !!fileId }
  );

  // Format checkpoints with relative time
  const formattedCheckpoints = useMemo(() => {
    if (!checkpoints) return [];
    return checkpoints.map((cp) => ({
      ...cp,
      relativeTime: formatDistanceToNow(new Date(cp.created_at), {
        addSuffix: true,
      }),
      formattedDate: format(new Date(cp.created_at), "MMM d, HH:mm"),
      prompt:
        cp.change_description?.replace(/^Checkpoint:\s*/, "") ||
        "Checkpoint",
      isCurrent: cp.version_number === currentVersion,
    }));
  }, [checkpoints, currentVersion]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <IconLoader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!checkpoints || checkpoints.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12", className)}>
        <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
          <IconClock size={24} className="text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-foreground">No checkpoints</p>
        <p className="text-xs text-muted-foreground mt-1 text-center max-w-[200px]">
          Checkpoints are automatically created before each AI operation
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="space-y-1 pr-4">
        {formattedCheckpoints.map((cp, index) => (
          <div
            key={cp.id}
            className={cn(
              "relative pl-6",
              index !== formattedCheckpoints.length - 1 && "pb-4"
            )}
          >
            {/* Timeline line */}
            {index !== formattedCheckpoints.length - 1 && (
              <div
                className={cn(
                  "absolute left-[9px] top-4 bottom-0 w-px",
                  cp.isCurrent ? "bg-primary/50" : "bg-border/60"
                )}
              />
            )}

            {/* Timeline node */}
            <div
              className={cn(
                "absolute left-0 top-0.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center",
                cp.isCurrent
                  ? "bg-primary border-primary"
                  : "bg-background border-border"
              )}
            >
              {cp.isCurrent ? (
                <IconCheck size={10} className="text-primary-foreground" />
              ) : (
                <IconHistory
                  size={8}
                  className="text-muted-foreground"
                />
              )}
            </div>

            {/* Content */}
            <div
              className={cn(
                "rounded-lg border p-3 transition-colors",
                cp.isCurrent
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/60 bg-background hover:border-border hover:bg-muted/30"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground">
                      v{cp.version_number}
                    </span>
                    {cp.isCurrent && (
                      <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        CURRENT
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1 truncate">{cp.prompt}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {cp.formattedDate} · {cp.relativeTime}
                  </p>
                </div>

                {cp.canRestore && !cp.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs shrink-0"
                    onClick={() =>
                      onRestoreClick({
                        id: cp.id,
                        versionNumber: cp.version_number,
                        prompt: cp.prompt,
                        createdAt: cp.created_at,
                      })
                    }
                  >
                    <IconRestore size={12} className="mr-1" />
                    Restore
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
});

export default CheckpointTimeline;
