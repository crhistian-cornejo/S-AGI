import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../../supabase/client";
import log from "electron-log";

// Schemas
const fileTypeSchema = z.enum(["excel", "doc", "note"]);
const changeTypeSchema = z.enum([
  "created",
  "auto_save",
  "manual_save",
  "ai_edit",
  "ai_create",
  "restore",
  "import",
]);

// Schema for commit options
const commitOptionsSchema = z
  .object({
    commitId: z.string().uuid().optional(),
    commitMessage: z.string().optional(),
    commitParentId: z.string().uuid().optional(),
  })
  .optional();

export const userFilesRouter = router({
  // ==================== QUERIES ====================

  // List files by type
  list: protectedProcedure
    .input(
      z.object({
        type: fileTypeSchema,
        includeArchived: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = supabase
        .from("user_files")
        .select(
          "id, name, type, description, icon, color, is_pinned, version_count, total_edits, created_at, updated_at, last_opened_at",
        )
        .eq("user_id", ctx.userId)
        .eq("type", input.type)
        .is("deleted_at", null)
        .order("is_pinned", { ascending: false })
        .order("last_opened_at", { ascending: false, nullsFirst: false }) // Most recent first
        .order("updated_at", { ascending: false, nullsFirst: false }) // Fallback for files without last_opened_at
        .range(input.offset, input.offset + input.limit - 1);

      if (!input.includeArchived) {
        query = query.eq("is_archived", false);
      }

      const { data, error } = await query;
      if (error) {
        log.error("[UserFilesRouter] Error listing files:", error);
        throw new Error(error.message);
      }
      return data || [];
    }),

  // Get file by ID (full data including univer_data)
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("user_files")
        .select("*")
        .eq("id", input.id)
        .eq("user_id", ctx.userId)
        .is("deleted_at", null)
        .single();

      if (error) {
        log.error("[UserFilesRouter] Error getting file:", error);
        throw new Error(error.message);
      }
      return data;
    }),

  // Get the most recently opened file by type
  getLastOpened: protectedProcedure
    .input(z.object({ type: fileTypeSchema }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("user_files")
        .select("*")
        .eq("user_id", ctx.userId)
        .eq("type", input.type)
        .is("deleted_at", null)
        .eq("is_archived", false)
        .order("last_opened_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        log.error("[UserFilesRouter] Error getting last opened file:", error);
        throw new Error(error.message);
      }
      return data;
    }),

  // ==================== MUTATIONS ====================

  // Create new file
  create: protectedProcedure
    .input(
      z.object({
        type: fileTypeSchema,
        name: z.string().min(1).max(255),
        univerData: z.any().optional(),
        content: z.string().optional(),
        description: z.string().optional(),
        aiModel: z.string().optional(),
        aiPrompt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Create file
      const { data: file, error: fileError } = await supabase
        .from("user_files")
        .insert({
          user_id: ctx.userId,
          type: input.type,
          name: input.name,
          univer_data: input.univerData,
          content: input.content,
          description: input.description,
          last_opened_at: new Date().toISOString(),
          version_count: 1,
          total_edits: 0,
        })
        .select()
        .single();

      if (fileError) {
        log.error("[UserFilesRouter] Error creating file:", fileError);
        throw new Error(fileError.message);
      }

      // Create initial version
      const { error: versionError } = await supabase
        .from("file_versions")
        .insert({
          file_id: file.id,
          version_number: 1,
          univer_data: input.univerData,
          content: input.content,
          change_type: input.aiModel ? "ai_create" : "created",
          change_description: "Archivo creado",
          created_by: ctx.userId,
          ai_model: input.aiModel,
          ai_prompt: input.aiPrompt,
          size_bytes: JSON.stringify(input.univerData || input.content || "")
            .length,
        });

      if (versionError) {
        log.error(
          "[UserFilesRouter] Error creating initial version:",
          versionError,
        );
        // Don't throw - file was created successfully
      }

      log.info("[UserFilesRouter] Created file:", file.id, file.name);
      return file;
    }),

  // Update file (creates new version)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().optional(),
        univerData: z.any().optional(),
        content: z.string().optional(),
        description: z.string().optional(),
        metadata: z.any().optional(),
        changeType: changeTypeSchema.default("auto_save"),
        changeDescription: z.string().optional(),
        aiModel: z.string().optional(),
        aiPrompt: z.string().optional(),
        toolName: z.string().optional(),
        skipVersion: z.boolean().default(false),
        commitOptions: commitOptionsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        id,
        skipVersion,
        changeType,
        changeDescription,
        aiModel,
        aiPrompt,
        toolName,
        commitOptions,
        ...updates
      } = input;

      // Get current file for version count and previous version data
      const { data: currentFile, error: fetchError } = await supabase
        .from("user_files")
        .select("version_count, total_edits, univer_data, content")
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .single();

      if (fetchError) {
        log.error(
          "[UserFilesRouter] Error fetching file for update:",
          fetchError,
        );
        throw new Error(fetchError.message);
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        total_edits: (currentFile.total_edits || 0) + 1,
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.univerData !== undefined)
        updateData.univer_data = updates.univerData;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.description !== undefined)
        updateData.description = updates.description;
      if (updates.metadata !== undefined)
        updateData.metadata = updates.metadata;

      // Update file
      const { data: file, error: updateError } = await supabase
        .from("user_files")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .select()
        .single();

      if (updateError) {
        log.error("[UserFilesRouter] Error updating file:", updateError);
        throw new Error(updateError.message);
      }

      // Create new version if needed
      if (
        !skipVersion &&
        (updates.univerData !== undefined || updates.content !== undefined)
      ) {
        const newVersionNumber = (currentFile.version_count || 0) + 1;

        // Get previous version for diff calculation (if available)
        const { data: previousVersion } = await supabase
          .from("file_versions")
          .select("id, univer_data, content")
          .eq("file_id", id)
          .eq("version_number", newVersionNumber - 1)
          .single();

        // Prepare version insert data
        const versionData: Record<string, unknown> = {
          file_id: id,
          version_number: newVersionNumber,
          univer_data: updates.univerData,
          content: updates.content,
          change_type: changeType,
          change_description:
            changeDescription || `Versión ${newVersionNumber}`,
          created_by: ctx.userId,
          ai_model: aiModel,
          ai_prompt: aiPrompt,
          tool_name: toolName,
          size_bytes: JSON.stringify(
            updates.univerData || updates.content || "",
          ).length,
        };

        // Add commit fields if provided
        if (commitOptions) {
          if (commitOptions.commitId) {
            versionData.commit_id = commitOptions.commitId;
          }
          if (commitOptions.commitMessage) {
            versionData.commit_message = commitOptions.commitMessage;
          }
          if (commitOptions.commitParentId) {
            versionData.commit_parent_id = commitOptions.commitParentId;
          } else if (previousVersion?.id) {
            // Auto-link to previous version if no parent specified
            versionData.commit_parent_id = previousVersion.id;
          }
        } else if (previousVersion?.id) {
          // Auto-link to previous version
          versionData.commit_parent_id = previousVersion.id;
        }

        // Note: diff_summary will be calculated on client side and can be updated later
        // For now, we store a placeholder that indicates diff should be calculated
        versionData.diff_summary = {
          needsCalculation: true,
          previousVersionNumber: newVersionNumber - 1,
        };

        const { error: versionError } = await supabase
          .from("file_versions")
          .insert(versionData);

        if (versionError) {
          log.error("[UserFilesRouter] Error creating version:", versionError);
        } else {
          // Update version count
          await supabase
            .from("user_files")
            .update({ version_count: newVersionNumber })
            .eq("id", id);

          // Update returned file with new version count
          file.version_count = newVersionNumber;
        }
      }

      log.debug("[UserFilesRouter] Updated file:", id);
      return file;
    }),

  // Mark file as opened
  markOpened: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("user_files")
        .update({ last_opened_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("user_id", ctx.userId)
        .select()
        .single();

      if (error) {
        log.error("[UserFilesRouter] Error marking file as opened:", error);
        throw new Error(error.message);
      }
      return data;
    }),

  // Delete file (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from("user_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("user_id", ctx.userId);

      if (error) {
        log.error("[UserFilesRouter] Error deleting file:", error);
        throw new Error(error.message);
      }

      log.info("[UserFilesRouter] Deleted file:", input.id);
      return { success: true };
    }),

  // Toggle pin
  togglePin: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: current } = await supabase
        .from("user_files")
        .select("is_pinned")
        .eq("id", input.id)
        .eq("user_id", ctx.userId)
        .single();

      const { data, error } = await supabase
        .from("user_files")
        .update({ is_pinned: !current?.is_pinned })
        .eq("id", input.id)
        .eq("user_id", ctx.userId)
        .select()
        .single();

      if (error) {
        log.error("[UserFilesRouter] Error toggling pin:", error);
        throw new Error(error.message);
      }
      return data;
    }),

  // Toggle archive
  toggleArchive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: current } = await supabase
        .from("user_files")
        .select("is_archived")
        .eq("id", input.id)
        .eq("user_id", ctx.userId)
        .single();

      const { data, error } = await supabase
        .from("user_files")
        .update({ is_archived: !current?.is_archived })
        .eq("id", input.id)
        .eq("user_id", ctx.userId)
        .select()
        .single();

      if (error) {
        log.error("[UserFilesRouter] Error toggling archive:", error);
        throw new Error(error.message);
      }
      return data;
    }),

  // Rename file
  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("user_files")
        .update({ name: input.name })
        .eq("id", input.id)
        .eq("user_id", ctx.userId)
        .select()
        .single();

      if (error) {
        log.error("[UserFilesRouter] Error renaming file:", error);
        throw new Error(error.message);
      }
      return data;
    }),

  // ==================== VERSIONS ====================

  // List versions of a file
  listVersions: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify file ownership
      const { data: file } = await supabase
        .from("user_files")
        .select("id")
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (!file) {
        throw new Error("File not found");
      }

      const { data, error } = await supabase
        .from("file_versions")
        .select(
          "id, version_number, change_type, change_description, ai_model, ai_prompt, tool_name, size_bytes, created_at, univer_data, content, commit_id, commit_message",
        )
        .eq("file_id", input.fileId)
        .order("version_number", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        log.error("[UserFilesRouter] Error listing versions:", error);
        throw new Error(error.message);
      }
      return data || [];
    }),

  // Get specific version
  getVersion: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        versionNumber: z.number().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify file ownership
      const { data: file } = await supabase
        .from("user_files")
        .select("id")
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (!file) {
        throw new Error("File not found");
      }

      const { data, error } = await supabase
        .from("file_versions")
        .select("*")
        .eq("file_id", input.fileId)
        .eq("version_number", input.versionNumber)
        .single();

      if (error) {
        log.error("[UserFilesRouter] Error getting version:", error);
        throw new Error(error.message);
      }
      return data;
    }),

  // Restore to a previous version
  restoreVersion: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        versionNumber: z.number().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the version to restore
      const { data: version, error: versionError } = await supabase
        .from("file_versions")
        .select("*")
        .eq("file_id", input.fileId)
        .eq("version_number", input.versionNumber)
        .single();

      if (versionError) {
        log.error(
          "[UserFilesRouter] Error getting version to restore:",
          versionError,
        );
        throw new Error(versionError.message);
      }

      // Get current file
      const { data: currentFile, error: fileError } = await supabase
        .from("user_files")
        .select("version_count")
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (fileError) {
        log.error("[UserFilesRouter] Error getting current file:", fileError);
        throw new Error(fileError.message);
      }

      const currentVersionNumber = currentFile.version_count || 0;

      // IMPORTANT: When restoring, we need to:
      // 1. Mark all versions after the restored one as obsolete (soft delete)
      // 2. Create a new version with the restored content
      // 3. This creates a new branch in the version history

      // First, mark all versions after the restored one as obsolete
      // We'll add an 'is_obsolete' flag to track this
      // For now, we'll delete them (hard delete) as per user's request
      if (input.versionNumber < currentVersionNumber) {
        const { error: deleteError } = await supabase
          .from("file_versions")
          .delete()
          .eq("file_id", input.fileId)
          .gt("version_number", input.versionNumber);

        if (deleteError) {
          log.error(
            "[UserFilesRouter] Error deleting future versions:",
            deleteError,
          );
          // Don't throw - continue with restore
        } else {
          log.info(
            `[UserFilesRouter] Deleted ${currentVersionNumber - input.versionNumber} future versions`,
          );
        }
      }

      // The new version number will be the restored version + 1
      // This creates a new branch from the restored point
      const newVersionNumber = input.versionNumber + 1;

      // Update file with restored data
      const { data: updatedFile, error: updateError } = await supabase
        .from("user_files")
        .update({
          univer_data: version.univer_data,
          content: version.content,
          version_count: newVersionNumber,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .select()
        .single();

      if (updateError) {
        log.error("[UserFilesRouter] Error restoring file:", updateError);
        throw new Error(updateError.message);
      }

      // Create new version indicating the restore
      // This is the "superior" version after restoration
      const { error: newVersionError } = await supabase
        .from("file_versions")
        .insert({
          file_id: input.fileId,
          version_number: newVersionNumber,
          univer_data: version.univer_data,
          content: version.content,
          change_type: "restore",
          change_description: `Restaurado desde versión ${input.versionNumber}`,
          created_by: ctx.userId,
          size_bytes: JSON.stringify(
            version.univer_data || version.content || "",
          ).length,
          commit_parent_id: version.id, // Link to the restored version
        });

      if (newVersionError) {
        log.error(
          "[UserFilesRouter] Error creating restore version:",
          newVersionError,
        );
      }

      log.info(
        "[UserFilesRouter] Restored file to version:",
        input.versionNumber,
        "Created new version:",
        newVersionNumber,
      );
      return updatedFile;
    }),

  // Compare two versions (returns versions + computed diff)
  compareVersions: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        versionA: z.number().min(1),
        versionB: z.number().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify file ownership
      const { data: file } = await supabase
        .from("user_files")
        .select("id, type")
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (!file) {
        throw new Error("File not found");
      }

      const { data, error } = await supabase
        .from("file_versions")
        .select("*")
        .eq("file_id", input.fileId)
        .in("version_number", [input.versionA, input.versionB])
        .order("version_number", { ascending: true });

      if (error) {
        log.error("[UserFilesRouter] Error comparing versions:", error);
        throw new Error(error.message);
      }

      const versionA = data?.find((v) => v.version_number === input.versionA);
      const versionB = data?.find((v) => v.version_number === input.versionB);

      // Calculate diff if both versions exist and file is Excel/Doc
      let diff = null;
      if (
        versionA &&
        versionB &&
        (file.type === "excel" || file.type === "doc")
      ) {
        // Diff calculation happens on client side for better performance
        // We just return the data here
        diff = {
          hasChanges: true,
          // Client will calculate actual diff using univer-diff.ts
          versionA: versionA.univer_data,
          versionB: versionB.univer_data,
        };
      }

      return {
        versionA,
        versionB,
        diff,
      };
    }),

  // Get version stats for a file
  getVersionStats: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify file ownership
      const { data: file } = await supabase
        .from("user_files")
        .select("id, version_count, total_edits")
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (!file) {
        throw new Error("File not found");
      }

      // Get counts by change type
      const { data: typeCounts, error } = await supabase
        .from("file_versions")
        .select("change_type")
        .eq("file_id", input.fileId);

      if (error) {
        log.error("[UserFilesRouter] Error getting version stats:", error);
        throw new Error(error.message);
      }

      const stats = {
        totalVersions: file.version_count || 0,
        totalEdits: file.total_edits || 0,
        byType: {} as Record<string, number>,
      };

      typeCounts?.forEach((v) => {
        stats.byType[v.change_type] = (stats.byType[v.change_type] || 0) + 1;
      });

      return stats;
    }),

  // ==================== COMMITS ====================

  // Create a commit (group multiple changes)
  createCommit: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        message: z.string().min(1).max(500),
        versionNumbers: z.array(z.number().min(1)).optional(), // Optional: specific versions to include
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify file ownership
      const { data: file } = await supabase
        .from("user_files")
        .select("id")
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (!file) {
        throw new Error("File not found");
      }

      // Generate commit ID
      const commitId = crypto.randomUUID();

      // If versionNumbers provided, update those versions
      // Otherwise, create a new version with the commit
      if (input.versionNumbers && input.versionNumbers.length > 0) {
        const { error } = await supabase
          .from("file_versions")
          .update({
            commit_id: commitId,
            commit_message: input.message,
          })
          .eq("file_id", input.fileId)
          .in("version_number", input.versionNumbers);

        if (error) {
          log.error(
            "[UserFilesRouter] Error updating versions with commit:",
            error,
          );
          throw new Error(error.message);
        }
      }

      return { commitId, message: input.message };
    }),

  // Get commit history for a file
  getCommits: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify file ownership
      const { data: file } = await supabase
        .from("user_files")
        .select("id")
        .eq("id", input.fileId)
        .eq("user_id", ctx.userId)
        .single();

      if (!file) {
        throw new Error("File not found");
      }

      // Get versions grouped by commit
      const { data, error } = await supabase
        .from("file_versions")
        .select(
          "commit_id, commit_message, version_number, change_type, change_description, created_at",
        )
        .eq("file_id", input.fileId)
        .not("commit_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        log.error("[UserFilesRouter] Error getting commits:", error);
        throw new Error(error.message);
      }

      // Group by commit_id
      const commits = new Map<string, any>();
      for (const version of data || []) {
        const commitId = version.commit_id;
        if (!commits.has(commitId)) {
          commits.set(commitId, {
            commitId,
            message: version.commit_message,
            versions: [],
            createdAt: version.created_at,
          });
        }
        commits.get(commitId)!.versions.push({
          versionNumber: version.version_number,
          changeType: version.change_type,
          changeDescription: version.change_description,
          createdAt: version.created_at,
        });
      }

      return Array.from(commits.values());
    }),

  // ==================== CLEANUP ====================

  // Cleanup old versions (keep last N)
  cleanupOldVersions: protectedProcedure
    .input(
      z.object({
        fileId: z.string().uuid().optional(), // If not provided, cleanup all files
        keepCount: z.number().min(1).max(1000).default(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fileId) {
        // Cleanup specific file
        const { data: file } = await supabase
          .from("user_files")
          .select("id")
          .eq("id", input.fileId)
          .eq("user_id", ctx.userId)
          .single();

        if (!file) {
          throw new Error("File not found");
        }

        const { data, error } = await supabase.rpc(
          "cleanup_old_file_versions",
          {
            p_file_id: input.fileId,
            p_keep_count: input.keepCount,
          },
        );

        if (error) {
          log.error("[UserFilesRouter] Error cleaning up versions:", error);
          throw new Error(error.message);
        }

        return { deletedCount: data || 0, fileId: input.fileId };
      } else {
        // Cleanup all user's files
        const { data: files } = await supabase
          .from("user_files")
          .select("id")
          .eq("user_id", ctx.userId)
          .is("deleted_at", null);

        if (!files || files.length === 0) {
          return { deletedCount: 0, filesProcessed: 0 };
        }

        let totalDeleted = 0;
        for (const file of files) {
          try {
            const { data } = await supabase.rpc("cleanup_old_file_versions", {
              p_file_id: file.id,
              p_keep_count: input.keepCount,
            });
            totalDeleted += data || 0;
          } catch (err) {
            log.error(
              `[UserFilesRouter] Error cleaning up file ${file.id}:`,
              err,
            );
          }
        }

        return { deletedCount: totalDeleted, filesProcessed: files.length };
      }
    }),
});
