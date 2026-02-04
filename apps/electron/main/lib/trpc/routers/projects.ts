import log from "electron-log";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getStorageAdapter, isLocalStorageMode } from "../../storage";

/**
 * Map project to snake_case format for API consistency
 */
function mapProjectToSnakeCase(project: {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string | null;
  isCollapsed: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: project.id,
    user_id: project.userId,
    name: project.name,
    icon: project.icon,
    color: project.color,
    is_collapsed: project.isCollapsed,
    sort_order: project.sortOrder,
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}

export const projectsRouter = router({
  // List all projects for current user
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      if (!isLocalStorageMode()) {
        // Cloud mode not yet supported for projects
        log.warn("[Projects] Cloud mode not supported yet");
        return [];
      }

      log.debug("[Projects] Local mode - listing projects");
      const adapter = await getStorageAdapter();
      const projects = await adapter.projects.list(ctx.userId);
      return projects.map(mapProjectToSnakeCase);
    } catch (err) {
      log.error("[Projects] List error:", err);
      return [];
    }
  }),

  // Get a single project by ID
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!isLocalStorageMode()) {
        return null;
      }

      const adapter = await getStorageAdapter();
      const project = await adapter.projects.get(input.id, ctx.userId);
      return project ? mapProjectToSnakeCase(project) : null;
    }),

  // Create a new project
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        icon: z.string().optional().default("📁"),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isLocalStorageMode()) {
        throw new Error("Cloud mode not supported yet");
      }

      log.info("[Projects] Creating project:", input.name);
      const adapter = await getStorageAdapter();
      const project = await adapter.projects.create({
        userId: ctx.userId,
        name: input.name,
        icon: input.icon,
        color: input.color,
      });
      log.info("[Projects] Created project:", project.id);
      return mapProjectToSnakeCase(project);
    }),

  // Update a project
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        icon: z.string().optional(),
        color: z.string().nullable().optional(),
        isCollapsed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isLocalStorageMode()) {
        throw new Error("Cloud mode not supported yet");
      }

      const { id, name, icon, isCollapsed } = input;
      // Convert null to undefined for color
      const color = input.color === null ? undefined : input.color;
      log.debug("[Projects] Updating project:", id);
      const adapter = await getStorageAdapter();
      const project = await adapter.projects.update(id, ctx.userId, { name, icon, color, isCollapsed });
      return mapProjectToSnakeCase(project);
    }),

  // Toggle collapse state of a project
  toggleCollapse: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!isLocalStorageMode()) {
        throw new Error("Cloud mode not supported yet");
      }

      const adapter = await getStorageAdapter();
      const project = await adapter.projects.get(input.id, ctx.userId);
      if (!project) throw new Error("Project not found");

      const updated = await adapter.projects.update(input.id, ctx.userId, {
        isCollapsed: !project.isCollapsed,
      });
      log.debug("[Projects] Toggled collapse for:", input.id, "→", !project.isCollapsed);
      return mapProjectToSnakeCase(updated);
    }),

  // Delete a project (chats will be unassigned, not deleted)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!isLocalStorageMode()) {
        throw new Error("Cloud mode not supported yet");
      }

      log.info("[Projects] Deleting project:", input.id);
      const adapter = await getStorageAdapter();
      await adapter.projects.delete(input.id, ctx.userId);
      log.info("[Projects] Deleted project:", input.id);
      return { success: true };
    }),

  // Reorder projects
  reorder: protectedProcedure
    .input(
      z.object({
        projectIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isLocalStorageMode()) {
        throw new Error("Cloud mode not supported yet");
      }

      log.debug("[Projects] Reordering projects");
      const adapter = await getStorageAdapter();
      await adapter.projects.reorder(ctx.userId, input.projectIds);
      return { success: true };
    }),

  // Move a chat to a project (or remove from project if projectId is null)
  moveChat: protectedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
        projectId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isLocalStorageMode()) {
        throw new Error("Cloud mode not supported yet");
      }

      log.debug("[Projects] Moving chat:", input.chatId, "to project:", input.projectId);
      const adapter = await getStorageAdapter();
      const chat = await adapter.chats.updateById!(input.chatId, {
        projectId: input.projectId,
      });
      log.info("[Projects] Moved chat:", input.chatId, "to project:", input.projectId);
      return {
        id: chat.id,
        project_id: chat.projectId,
      };
    }),

  // Reorder chats within a project
  reorderChats: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid().nullable(),
        chatIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isLocalStorageMode()) {
        throw new Error("Cloud mode not supported yet");
      }

      log.debug("[Projects] Reordering chats in project:", input.projectId);
      const adapter = await getStorageAdapter();

      // Update sort_order for each chat
      for (let i = 0; i < input.chatIds.length; i++) {
        await adapter.chats.updateById!(input.chatIds[i], {
          projectId: input.projectId,
          sortOrder: i,
        });
      }

      return { success: true };
    }),
});
