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
        promptPreview: z.string().max(100),
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
          checkpoint_prompt_id: messageId,
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

      const currentVersion = file.version_count || 0;
      return (data || []).map((cp) => ({
        ...cp,
        canRestore: cp.version_number < currentVersion,
      }));
    }),

  /**
   * Restore to a checkpoint
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
