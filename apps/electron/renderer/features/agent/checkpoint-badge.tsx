/**
 * Checkpoint Badge
 *
 * Small badge shown on user messages that have a checkpoint.
 * Clicking shows tooltip with version info and restore option.
 */

import { memo } from "react";
import { IconBookmark, IconRestore } from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CheckpointBadgeProps {
  versionNumber: number;
  canRestore: boolean;
  onRestoreClick?: () => void;
  className?: string;
}

export const CheckpointBadge = memo(function CheckpointBadge({
  versionNumber,
  canRestore,
  onRestoreClick,
  className,
}: CheckpointBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "h-5 px-1.5 gap-1 text-[10px] font-medium cursor-default",
            "bg-muted/50 border-border/60 text-muted-foreground",
            "hover:bg-muted hover:border-border",
            "transition-colors",
            className
          )}
        >
          <IconBookmark size={10} className="text-primary" />
          v{versionNumber}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[200px]">
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Checkpoint v{versionNumber}</p>
          <p className="text-[10px] text-muted-foreground">
            State saved before this prompt
          </p>
          {canRestore && onRestoreClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestoreClick();
              }}
              className={cn(
                "flex items-center gap-1.5 w-full mt-1 px-2 py-1 rounded",
                "text-[10px] font-medium",
                "bg-primary/10 text-primary hover:bg-primary/20",
                "transition-colors"
              )}
            >
              <IconRestore size={10} />
              Restore to this point
            </button>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

export default CheckpointBadge;
