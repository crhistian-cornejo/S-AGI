/**
 * Message Checkpoint Restore - Cursor-style restore button
 *
 * Shows on user messages to allow restoring workbook to pre-AI state.
 */

import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { IconHistory, IconLoader2 } from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface MessageCheckpointRestoreProps {
  messageId: string;
  fileId: string;
  checkpointVersion?: number;
  canRestore: boolean;
  onRestoreComplete?: () => void;
  className?: string;
}

export const MessageCheckpointRestore = memo(function MessageCheckpointRestore({
  messageId,
  fileId,
  checkpointVersion,
  canRestore,
  onRestoreComplete,
  className,
}: MessageCheckpointRestoreProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreMutation = trpc.checkpoints.restore.useMutation();
  const utils = trpc.useUtils();

  if (!canRestore || !checkpointVersion) {
    return null;
  }

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restoreMutation.mutateAsync({
        fileId,
        checkpointVersionNumber: checkpointVersion,
      });

      // Invalidate file queries to refresh UI
      await utils.userFiles.get.invalidate({ id: fileId });
      await utils.userFiles.listVersions.invalidate({ fileId });

      toast.success("Workbook restored", {
        description: "Reverted to state before this prompt",
      });

      onRestoreComplete?.();
    } catch (error) {
      console.error("Restore failed:", error);
      toast.error("Failed to restore workbook");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={isRestoring}
              className={cn(
                "h-6 w-6 rounded-md flex items-center justify-center",
                "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50",
                "transition-all opacity-0 group-hover:opacity-100",
                isRestoring && "opacity-100",
                className
              )}
            >
              {isRestoring ? (
                <IconLoader2 size={12} className="animate-spin" />
              ) : (
                <IconHistory size={12} />
              )}
            </button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">
          Restore workbook to this point
        </TooltipContent>
      </Tooltip>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore workbook?</AlertDialogTitle>
          <AlertDialogDescription>
            This will revert the workbook to its state before this prompt was
            sent. All AI changes made after this point will be discarded.
            <br />
            <br />
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRestore}>
            Restore
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

export default MessageCheckpointRestore;
