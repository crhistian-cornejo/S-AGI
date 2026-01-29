# Agent Panel Enhancements - Ramp Sheets Style Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the Agent Panel with Ramp Sheets-style task tracking UI and Cursor-style workbook checkpoints for undo/restore.

**Architecture:** Three main additions: (1) TaskProgressPanel component with collapsible todo list above chat input, (2) Per-prompt automatic checkpoint system storing workbook snapshots before AI operations, (3) Enhanced tool call visualization with richer badges and clickable cell references.

**Tech Stack:** React, Jotai atoms, tRPC, Supabase (file_versions table), existing Univer integration

---

## Feature Overview

### 1. Task Progress Panel (Ramp Sheets style)
- Collapsible panel above chat input showing AI's planned tasks
- "X of Y tasks completed" header with expand/collapse
- Tasks with checkboxes that show strikethrough when completed
- Auto-expand when streaming, collapse when done

### 2. Workbook Checkpoints (Cursor style)
- Automatic snapshot BEFORE each user prompt is processed
- "Restore to this point" button on each user message
- Restores workbook to pre-AI state, discarding AI changes
- Uses existing file_versions table with new `checkpoint_prompt_id` field

### 3. Enhanced Tool Call Visualization
- Richer badges with Sheet!Range format
- Clickable cell references that highlight in spreadsheet
- Better grouping by operation type (Format, Insert, Formula, etc.)

---

## Task 1: Add Checkpoint Infrastructure to Database

**Files:**
- Create: `apps/electron/main/lib/supabase/migrations/20260128100000_add_prompt_checkpoints.sql`

**Step 1: Create migration file**

```sql
-- Add checkpoint support to file_versions for Cursor-style restore
-- Each user prompt creates a checkpoint before AI operations

-- Add checkpoint fields to file_versions
ALTER TABLE file_versions
ADD COLUMN IF NOT EXISTS checkpoint_prompt_id TEXT,
ADD COLUMN IF NOT EXISTS checkpoint_message_id TEXT,
ADD COLUMN IF NOT EXISTS is_checkpoint BOOLEAN DEFAULT FALSE;

-- Index for fast checkpoint lookups
CREATE INDEX IF NOT EXISTS idx_file_versions_checkpoint
ON file_versions (file_id, is_checkpoint, created_at DESC)
WHERE is_checkpoint = TRUE;

-- Comment for documentation
COMMENT ON COLUMN file_versions.checkpoint_prompt_id IS 'Links this version to the user prompt that triggered it';
COMMENT ON COLUMN file_versions.checkpoint_message_id IS 'The panel_messages.id of the user message';
COMMENT ON COLUMN file_versions.is_checkpoint IS 'True if this version was auto-created before an AI operation';
```

**Step 2: Run migration via Supabase MCP or CLI**

Run: `npx supabase db push` or apply via MCP tool

---

## Task 2: Add Checkpoint Atoms for State Management

**Files:**
- Modify: `apps/electron/renderer/lib/atoms/agent-panel.ts`

**Step 1: Add checkpoint state types and atoms**

Add to the end of the file:

```typescript
// === WORKBOOK CHECKPOINTS (Cursor-style restore) ===

export interface WorkbookCheckpoint {
  id: string
  messageId: string // The user message this checkpoint belongs to
  fileId: string
  versionNumber: number
  prompt: string // Preview of the user prompt
  createdAt: number
  /** Whether this checkpoint can be restored (has subsequent AI changes) */
  canRestore: boolean
}

/** Checkpoints per session (fileId -> checkpoints[]) */
export const agentPanelCheckpointsAtom = atom<Record<string, WorkbookCheckpoint[]>>({})

/** Get checkpoints for a specific file */
export const getFileCheckpointsAtom = (fileId: string) =>
  atom(
    (get) => get(agentPanelCheckpointsAtom)[fileId] ?? [],
    (get, set, checkpoints: WorkbookCheckpoint[]) => {
      const current = get(agentPanelCheckpointsAtom)
      set(agentPanelCheckpointsAtom, { ...current, [fileId]: checkpoints })
    }
  )

/** Add a new checkpoint */
export const addCheckpointAtom = atom(
  null,
  (get, set, checkpoint: WorkbookCheckpoint) => {
    const current = get(agentPanelCheckpointsAtom)
    const fileCheckpoints = current[checkpoint.fileId] ?? []
    set(agentPanelCheckpointsAtom, {
      ...current,
      [checkpoint.fileId]: [...fileCheckpoints, checkpoint],
    })
  }
)
```

---

## Task 3: Create Checkpoint Service in Backend

**Files:**
- Create: `apps/electron/main/lib/trpc/routers/checkpoints.ts`
- Modify: `apps/electron/main/lib/trpc/routers/index.ts` (add router)

**Step 1: Create checkpoint router**

```typescript
/**
 * Checkpoint Router - Cursor-style workbook restore points
 *
 * Creates automatic snapshots before each AI operation,
 * allowing users to restore to any previous prompt state.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../../supabase/client";
import log from "electron-log";

export const checkpointsRouter = router({
  /**
   * Create a checkpoint before AI operation
   * Called automatically when user sends a prompt
   */
  create: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        messageId: z.string(),
        promptPreview: z.string().max(100), // First 100 chars of prompt
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { fileId, messageId, promptPreview } = input;

      // Get current file state
      const { data: file, error: fileError } = await supabase
        .from("user_files")
        .select("id, univer_data, content, version_count")
        .eq("id", fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (fileError || !file) {
        log.error("[Checkpoints] Error getting file:", fileError);
        throw new Error("File not found");
      }

      // Get next version number atomically
      const { data: nextVersion, error: versionError } = await supabase.rpc(
        "get_next_file_version",
        { p_file_id: fileId }
      );

      if (versionError) {
        log.error("[Checkpoints] Error getting next version:", versionError);
        throw new Error("Failed to create checkpoint");
      }

      const versionNumber = nextVersion || (file.version_count || 0) + 1;

      // Create checkpoint version
      const { data: checkpoint, error: insertError } = await supabase
        .from("file_versions")
        .insert({
          file_id: fileId,
          version_number: versionNumber,
          univer_data: file.univer_data,
          content: file.content,
          change_type: "checkpoint",
          change_description: `Checkpoint: ${promptPreview}`,
          created_by: ctx.userId,
          is_checkpoint: true,
          checkpoint_message_id: messageId,
          checkpoint_prompt_id: messageId, // Same as messageId for now
          size_bytes: JSON.stringify(file.univer_data || file.content || "").length,
        })
        .select("id, version_number, created_at")
        .single();

      if (insertError) {
        log.error("[Checkpoints] Error creating checkpoint:", insertError);
        throw new Error("Failed to create checkpoint");
      }

      // Update file version count
      await supabase
        .from("user_files")
        .update({ version_count: versionNumber })
        .eq("id", fileId);

      log.info(`[Checkpoints] Created checkpoint v${versionNumber} for file ${fileId}`);

      return {
        id: checkpoint.id,
        versionNumber: checkpoint.version_number,
        createdAt: checkpoint.created_at,
      };
    }),

  /**
   * List checkpoints for a file
   */
  list: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const { data: file } = await supabase
        .from("user_files")
        .select("id, version_count")
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (!file) {
        throw new Error("File not found");
      }

      const { data, error } = await supabase
        .from("file_versions")
        .select("id, version_number, change_description, checkpoint_message_id, created_at")
        .eq("file_id", input.fileId)
        .eq("is_checkpoint", true)
        .order("version_number", { ascending: false })
        .limit(input.limit);

      if (error) {
        log.error("[Checkpoints] Error listing checkpoints:", error);
        throw new Error(error.message);
      }

      // Mark which checkpoints can be restored (have subsequent versions)
      const currentVersion = file.version_count || 0;
      return (data || []).map((cp) => ({
        ...cp,
        canRestore: cp.version_number < currentVersion,
      }));
    }),

  /**
   * Restore to a checkpoint
   * This marks all versions after the checkpoint as obsolete
   */
  restore: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        checkpointVersionNumber: z.number().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { fileId, checkpointVersionNumber } = input;

      // Get the checkpoint version
      const { data: checkpoint, error: cpError } = await supabase
        .from("file_versions")
        .select("*")
        .eq("file_id", fileId)
        .eq("version_number", checkpointVersionNumber)
        .eq("is_checkpoint", true)
        .single();

      if (cpError || !checkpoint) {
        throw new Error("Checkpoint not found");
      }

      // Verify ownership
      const { data: file } = await supabase
        .from("user_files")
        .select("id, version_count")
        .eq("id", fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (!file) {
        throw new Error("File not found");
      }

      // Mark all versions after checkpoint as obsolete
      const { error: obsoleteError } = await supabase
        .from("file_versions")
        .update({
          is_obsolete: true,
          obsoleted_at: new Date().toISOString(),
          obsoleted_by_version: checkpointVersionNumber,
        })
        .eq("file_id", fileId)
        .gt("version_number", checkpointVersionNumber);

      if (obsoleteError) {
        log.error("[Checkpoints] Error marking versions obsolete:", obsoleteError);
      }

      // Restore file to checkpoint state
      const { data: updatedFile, error: updateError } = await supabase
        .from("user_files")
        .update({
          univer_data: checkpoint.univer_data,
          content: checkpoint.content,
          version_count: checkpointVersionNumber,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileId)
        .eq("user_id", ctx.userId)
        .select()
        .single();

      if (updateError) {
        throw new Error("Failed to restore checkpoint");
      }

      log.info(`[Checkpoints] Restored file ${fileId} to checkpoint v${checkpointVersionNumber}`);

      return {
        file: updatedFile,
        restoredToVersion: checkpointVersionNumber,
      };
    }),
});
```

**Step 2: Add router to index**

In `apps/electron/main/lib/trpc/routers/index.ts`, add:

```typescript
import { checkpointsRouter } from "./checkpoints";

// In the appRouter:
checkpoints: checkpointsRouter,
```

---

## Task 4: Create TaskProgressPanel Component

**Files:**
- Create: `apps/electron/renderer/features/agent/task-progress-panel.tsx`

**Step 1: Create the component**

```typescript
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
        // Delay collapse so user can see completion
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
```

---

## Task 5: Create MessageCheckpointRestore Component

**Files:**
- Create: `apps/electron/renderer/features/agent/message-checkpoint-restore.tsx`

**Step 1: Create the restore button component**

```typescript
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
```

---

## Task 6: Integrate Checkpoints into Agent Panel Chat Flow

**Files:**
- Modify: `apps/electron/renderer/features/agent/agent-panel.tsx`
- Modify: `apps/electron/main/lib/trpc/routers/agent-panel.ts`

**Step 1: Add checkpoint creation before AI call (frontend)**

In `agent-panel.tsx`, modify the `handleSend` function to create a checkpoint:

```typescript
// Add import at top
import { TaskProgressPanel } from "./task-progress-panel";
import { MessageCheckpointRestore } from "./message-checkpoint-restore";

// Add trpc mutation
const createCheckpoint = trpc.checkpoints.create.useMutation();

// In handleSend, BEFORE calling chatMutation:
const handleSend = useCallback(async () => {
  // ... existing validation code ...

  // Create checkpoint before AI operation (for Excel/Doc files)
  let checkpointInfo: { id: string; versionNumber: number } | null = null;
  const fileId = activeTab === "excel" ? currentExcelFileId :
                 activeTab === "doc" ? currentDocFileId : null;

  if (fileId) {
    try {
      checkpointInfo = await createCheckpoint.mutateAsync({
        fileId,
        messageId: userMessage.id,
        promptPreview: input.trim().slice(0, 100),
      });
      console.log("[AgentPanel] Created checkpoint:", checkpointInfo);
    } catch (err) {
      console.warn("[AgentPanel] Failed to create checkpoint:", err);
      // Continue without checkpoint - don't block the user
    }
  }

  // ... rest of existing handleSend code ...
}, [/* existing deps */ createCheckpoint, currentExcelFileId, currentDocFileId]);
```

**Step 2: Track checkpoint in message metadata**

Modify the user message to include checkpoint info:

```typescript
const userMessage: AgentPanelMessage = {
  id: nanoid(),
  role: "user",
  content: input.trim(),
  timestamp: Date.now(),
  images: /* ... */,
  // NEW: Add checkpoint reference
  checkpointVersion: checkpointInfo?.versionNumber,
};
```

**Step 3: Update AgentPanelMessage type in atoms**

```typescript
export interface AgentPanelMessage {
  // ... existing fields ...
  /** Version number of checkpoint created before this message (for restore) */
  checkpointVersion?: number
}
```

---

## Task 7: Update AgentMessage to Show Restore Button

**Files:**
- Modify: `apps/electron/renderer/features/agent/agent-panel.tsx`

**Step 1: Add restore button to user messages**

In the `AgentMessage` component, add the restore button for user messages:

```typescript
// In AgentMessage component, add to user message rendering:

{/* User message with restore button */}
{isUser && (
  <div className="flex items-start gap-2 group">
    {/* Restore button - shows on hover */}
    {message.checkpointVersion && currentExcelFileId && (
      <MessageCheckpointRestore
        messageId={message.id}
        fileId={currentExcelFileId}
        checkpointVersion={message.checkpointVersion}
        canRestore={true}
        onRestoreComplete={() => {
          // Refresh file data after restore
          window.desktopApi?.requestFileRefresh?.(currentExcelFileId);
        }}
      />
    )}

    {/* Existing user message content */}
    <div className={cn(
      "max-w-[85%]",
      "bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2.5"
    )}>
      {/* ... existing content ... */}
    </div>

    {/* User avatar */}
    {/* ... existing avatar ... */}
  </div>
)}
```

---

## Task 8: Replace AgentTaskTracker with TaskProgressPanel

**Files:**
- Modify: `apps/electron/renderer/features/agent/agent-panel.tsx`

**Step 1: Swap component usage**

Replace the existing AgentTaskTracker with the new TaskProgressPanel:

```typescript
// Replace import
import { TaskProgressPanel, type TaskItem } from "./task-progress-panel";

// Replace the task tracker section (around line 1857):

{/* Task Progress Panel - Sticky above input */}
{agentTasks.length > 0 && (
  <TaskProgressPanel
    tasks={agentTasks.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
    }))}
    isStreaming={isStreaming}
  />
)}
```

---

## Task 9: Enhance Tool Call Badges with Clickable Cell References

**Files:**
- Modify: `apps/electron/renderer/features/agent/agent-tool-call-flat.tsx`

**Step 1: Add click handler for cell references**

```typescript
// Add prop to ToolBadgeDisplay
interface ToolBadgeDisplayProps {
  badge: ToolBadge;
  onCellClick?: (range: string) => void;
}

const ToolBadgeDisplay = memo(function ToolBadgeDisplay({
  badge,
  onCellClick,
}: ToolBadgeDisplayProps) {
  // For range badges, make them clickable
  if (badge.type === "range") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-mono",
          onCellClick && "cursor-pointer hover:bg-blue-500/20 transition-colors"
        )}
        onClick={() => onCellClick?.(badge.content)}
      >
        <IconTable size={10} className="mr-1 opacity-60" />
        {badge.content}
      </Badge>
    );
  }
  // ... rest of existing code
});
```

**Step 2: Add IPC call to highlight cells in spreadsheet**

```typescript
// In ToolCallItem, add handler:
const handleCellClick = useCallback((range: string) => {
  // Parse range to get sheet and cells
  // Format: "Sheet1!A1:B5" or just "A1:B5"
  const [sheetPart, cellPart] = range.includes("!")
    ? range.split("!")
    : [undefined, range];

  // Send to main process to highlight cells
  window.desktopApi?.highlightCells?.({
    range: cellPart,
    sheetName: sheetPart,
  });
}, []);
```

---

## Task 10: Add Cell Highlight IPC Handler

**Files:**
- Modify: `apps/electron/preload/index.ts`
- Modify: `apps/electron/main/lib/window-manager.ts`

**Step 1: Add preload API**

```typescript
// In preload/index.ts, add to desktopApi:
highlightCells: (params: { range: string; sheetName?: string }) => {
  ipcRenderer.send("univer:highlight-cells", params);
},
```

**Step 2: Add main process handler**

```typescript
// In main process, add IPC handler:
ipcMain.on("univer:highlight-cells", (event, params) => {
  // Forward to renderer to handle in Univer
  sendToRenderer("univer:highlight-cells", params);
});
```

---

## Task 11: Handle Cell Highlighting in Univer Component

**Files:**
- Modify: `apps/electron/renderer/features/univer/univer-spreadsheet.tsx`

**Step 1: Add listener for highlight events**

```typescript
// Add effect to listen for highlight requests:
useEffect(() => {
  const handleHighlight = (params: { range: string; sheetName?: string }) => {
    if (!univerRef.current) return;

    const univerAPI = FUniver.newAPI(univerRef.current);
    const workbook = univerAPI.getActiveWorkbook();
    if (!workbook) return;

    // If sheet specified, switch to it
    if (params.sheetName) {
      const sheet = workbook.getSheetByName(params.sheetName);
      if (sheet) {
        sheet.activate();
      }
    }

    // Select the range
    const activeSheet = workbook.getActiveSheet();
    if (activeSheet) {
      // Parse range and select
      activeSheet.getRange(params.range).activate();
    }
  };

  return window.desktopApi?.onHighlightCells?.(handleHighlight);
}, []);
```

---

## Task 12: Add Migration to Supabase and Test

**Step 1: Apply migration**

Run the migration created in Task 1.

**Step 2: Manual testing checklist**

- [ ] Send a prompt in Excel tab - checkpoint should be created
- [ ] View version history - checkpoint should appear with "Checkpoint:" prefix
- [ ] Click restore on user message - workbook should revert
- [ ] Task list should show during AI processing
- [ ] Task list should auto-expand/collapse appropriately
- [ ] Clicking cell badges should highlight cells in spreadsheet

---

## Summary

This plan implements:

1. **TaskProgressPanel** - Ramp Sheets-style collapsible task list above chat input
2. **Workbook Checkpoints** - Auto-snapshot before each user prompt with restore capability
3. **Enhanced Tool Visualization** - Clickable cell references that highlight in spreadsheet

The architecture reuses existing infrastructure (file_versions table, atoms pattern) while adding minimal new components.
