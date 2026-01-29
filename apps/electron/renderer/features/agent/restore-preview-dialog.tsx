/**
 * Restore Preview Dialog
 *
 * Shows a preview of what will be restored before confirming.
 * Displays summary stats (cells changed, sheets changed) rather than full diff.
 */

import { memo, useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  IconAlertTriangle,
  IconRestore,
  IconLoader2,
  IconTable,
  IconFile,
  IconMathFunction,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CheckpointData {
  id: string;
  versionNumber: number;
  prompt: string;
  createdAt: string;
}

interface RestorePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkpoint: CheckpointData | null;
  fileId: string;
  currentVersionNumber?: number;
  onRestoreComplete?: () => void;
}

export const RestorePreviewDialog = memo(function RestorePreviewDialog({
  open,
  onOpenChange,
  checkpoint,
  fileId,
  currentVersionNumber,
  onRestoreComplete,
}: RestorePreviewDialogProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreMutation = trpc.checkpoints.restore.useMutation();
  const utils = trpc.useUtils();

  // Calculate versions that will be reverted
  const versionsToRevert = useMemo(() => {
    if (!checkpoint || !currentVersionNumber) return 0;
    return currentVersionNumber - checkpoint.versionNumber;
  }, [checkpoint, currentVersionNumber]);

  // Format relative time
  const relativeTime = useMemo(() => {
    if (!checkpoint) return "";
    return formatDistanceToNow(new Date(checkpoint.createdAt), {
      addSuffix: true,
    });
  }, [checkpoint]);

  const handleRestore = async () => {
    if (!checkpoint) return;

    setIsRestoring(true);
    try {
      await restoreMutation.mutateAsync({
        fileId,
        checkpointVersionNumber: checkpoint.versionNumber,
      });

      // Invalidate file queries to refresh UI
      await utils.userFiles.get.invalidate({ id: fileId });
      await utils.userFiles.listVersions.invalidate({ fileId });
      await utils.checkpoints.list.invalidate({ fileId });

      toast.success("Workbook restored", {
        description: `Reverted to v${checkpoint.versionNumber}`,
      });

      onOpenChange(false);
      onRestoreComplete?.();
    } catch (error) {
      console.error("Restore failed:", error);
      toast.error("Failed to restore workbook");
    } finally {
      setIsRestoring(false);
    }
  };

  if (!checkpoint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconRestore size={18} className="text-primary" />
            Restore Checkpoint
          </DialogTitle>
          <DialogDescription>
            Restore workbook to its state before this prompt was executed.
          </DialogDescription>
        </DialogHeader>

        {/* Checkpoint Info */}
        <div className="space-y-4 py-2">
          {/* Target checkpoint */}
          <div className="rounded-lg border border-border/60 p-3 bg-muted/30">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <IconRestore size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  "{checkpoint.prompt}"
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Version {checkpoint.versionNumber} · {relativeTime}
                </p>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              icon={IconFile}
              label="Versions"
              value={versionsToRevert}
              sublabel="to revert"
              variant="warning"
            />
            <StatCard
              icon={IconTable}
              label="Changes"
              value="All"
              sublabel={`after v${checkpoint.versionNumber}`}
              variant="default"
            />
            <StatCard
              icon={IconMathFunction}
              label="Formulas"
              value="Reset"
              sublabel="to checkpoint"
              variant="default"
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <IconAlertTriangle
              size={16}
              className="shrink-0 text-destructive mt-0.5"
            />
            <div className="text-xs">
              <p className="font-medium text-destructive">
                This action cannot be undone
              </p>
              <p className="text-destructive/80 mt-0.5">
                All changes made after version {checkpoint.versionNumber} will
                be permanently discarded.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRestoring}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <>
                <IconLoader2 size={14} className="mr-2 animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                <IconRestore size={14} className="mr-2" />
                Restore to v{checkpoint.versionNumber}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

// Stat card component
const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  variant = "default",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  sublabel: string;
  variant?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2 text-center",
        variant === "warning"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border/60 bg-muted/30"
      )}
    >
      <Icon
        size={14}
        className={cn(
          "mx-auto mb-1",
          variant === "warning" ? "text-amber-500" : "text-muted-foreground"
        )}
      />
      <p
        className={cn(
          "text-sm font-semibold",
          variant === "warning" ? "text-amber-600" : "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{sublabel}</p>
    </div>
  );
});

export default RestorePreviewDialog;
