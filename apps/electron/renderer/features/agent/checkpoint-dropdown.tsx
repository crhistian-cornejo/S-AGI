/**
 * Checkpoint Dropdown - Quick access to checkpoints in the agent panel header
 *
 * Displays recent checkpoints with quick restore functionality
 */

import { memo, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  IconHistory,
  IconRestore,
  IconClock,
  IconLoader2,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface CheckpointDropdownProps {
  fileId: string;
  onRestoreClick: (checkpoint: {
    id: string;
    versionNumber: number;
    prompt: string;
    createdAt: string;
  }) => void;
  onViewAllClick?: () => void;
  className?: string;
}

export const CheckpointDropdown = memo(function CheckpointDropdown({
  fileId,
  onRestoreClick,
  onViewAllClick,
  className,
}: CheckpointDropdownProps) {
  // Fetch checkpoints for this file
  const { data: checkpoints, isLoading } = trpc.checkpoints.list.useQuery(
    { fileId, limit: 5 },
    { enabled: !!fileId }
  );

  // Format relative time
  const formattedCheckpoints = useMemo(() => {
    if (!checkpoints) return [];
    return checkpoints.map((cp) => ({
      ...cp,
      relativeTime: formatDistanceToNow(new Date(cp.created_at), {
        addSuffix: true,
      }),
      prompt:
        cp.change_description?.replace(/^Checkpoint:\s*/, "") ||
        "Checkpoint",
    }));
  }, [checkpoints]);

  const hasCheckpoints = formattedCheckpoints.length > 0;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative h-7 w-7 rounded flex items-center justify-center",
                "text-muted-foreground/60 hover:text-foreground hover:bg-accent",
                "transition-all disabled:opacity-50",
                hasCheckpoints && "text-muted-foreground",
                className
              )}
              disabled={isLoading}
            >
              {isLoading ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : (
                <IconHistory size={14} />
              )}
              {hasCheckpoints && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {hasCheckpoints
            ? `${formattedCheckpoints.length} checkpoint${formattedCheckpoints.length !== 1 ? "s" : ""}`
            : "No checkpoints"}
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium text-foreground">Checkpoints</p>
          <p className="text-[10px] text-muted-foreground">
            Restore to a previous state
          </p>
        </div>

        <DropdownMenuSeparator />

        {formattedCheckpoints.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <IconClock
              size={24}
              className="mx-auto mb-2 text-muted-foreground/50"
            />
            <p className="text-xs text-muted-foreground">No checkpoints yet</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Checkpoints are created before each AI operation
            </p>
          </div>
        ) : (
          <>
            {formattedCheckpoints.map((cp) => (
              <DropdownMenuItem
                key={cp.id}
                disabled={!cp.canRestore}
                className="flex items-center gap-2 py-2 cursor-pointer"
                onClick={() =>
                  cp.canRestore &&
                  onRestoreClick({
                    id: cp.id,
                    versionNumber: cp.version_number,
                    prompt: cp.prompt,
                    createdAt: cp.created_at,
                  })
                }
              >
                <div className="shrink-0 w-6 h-6 rounded bg-muted/60 flex items-center justify-center">
                  <IconRestore
                    size={12}
                    className={cn(
                      cp.canRestore
                        ? "text-foreground"
                        : "text-muted-foreground/40"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{cp.prompt}</p>
                  <p className="text-[10px] text-muted-foreground">
                    v{cp.version_number} · {cp.relativeTime}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}

            {onViewAllClick && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="justify-center text-xs text-muted-foreground"
                  onClick={onViewAllClick}
                >
                  View all checkpoints
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export default CheckpointDropdown;
