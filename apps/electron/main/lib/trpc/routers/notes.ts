/**
 * Notes tRPC Router
 *
 * Full CRUD for note pages and note spaces, backed by local SQLite.
 * Replaces the renderer-side localStorage-based notes-storage.ts.
 *
 * Includes a one-time migration endpoint that imports existing
 * localStorage data sent from the renderer.
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { getRawDatabase } from "../../storage";
import log from "electron-log";

// ============================================================================
// Helpers
// ============================================================================

function getDb() {
  const db = getRawDatabase();
  if (!db) throw new Error("Database not available");
  return db;
}

/** Convert a SQLite row (snake_case integers) to a NotePage-compatible shape */
function rowToPage(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content ? JSON.parse(row.content as string) : [],
    spaceId: (row.space_id as string) || null,
    parentId: (row.parent_id as string) || null,
    icon: (row.icon as string) || undefined,
    coverImage: (row.cover_image as string) || undefined,
    descriptionVisible: row.description_visible === 1,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToSpace(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    icon: (row.icon as string) || undefined,
    color: (row.color as string) || undefined,
    archived: row.archived === 1,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

// ============================================================================
// Router
// ============================================================================

export const notesRouter = router({
  // ─── Pages ───────────────────────────────────────────────────────────

  /** List all non-archived pages */
  listPages: publicProcedure.query(() => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM note_pages ORDER BY updated_at DESC").all() as Record<string, unknown>[];
    return rows.map(rowToPage);
  }),

  /** Get a single page by ID */
  getPage: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDb();
      const row = db.prepare("SELECT * FROM note_pages WHERE id = ?").get(input.id) as Record<string, unknown> | undefined;
      return row ? rowToPage(row) : null;
    }),

  /** Get pages by space (null = root level) */
  getPagesBySpace: publicProcedure
    .input(z.object({ spaceId: z.string().nullable() }))
    .query(({ input }) => {
      const db = getDb();
      const rows = input.spaceId
        ? (db.prepare("SELECT * FROM note_pages WHERE space_id = ? AND archived = 0 ORDER BY updated_at DESC").all(input.spaceId) as Record<string, unknown>[])
        : (db.prepare("SELECT * FROM note_pages WHERE space_id IS NULL AND archived = 0 ORDER BY updated_at DESC").all() as Record<string, unknown>[]);
      return rows.map(rowToPage);
    }),

  /** Get pages by parent (for nested sub-pages) */
  getPagesByParent: publicProcedure
    .input(z.object({ parentId: z.string().nullable() }))
    .query(({ input }) => {
      const db = getDb();
      const rows = input.parentId
        ? (db.prepare("SELECT * FROM note_pages WHERE parent_id = ? AND archived = 0 ORDER BY updated_at DESC").all(input.parentId) as Record<string, unknown>[])
        : (db.prepare("SELECT * FROM note_pages WHERE parent_id IS NULL AND archived = 0 ORDER BY updated_at DESC").all() as Record<string, unknown>[]);
      return rows.map(rowToPage);
    }),

  /** Get pinned (favorite) pages */
  getFavorites: publicProcedure.query(() => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM note_pages WHERE pinned = 1 AND archived = 0 ORDER BY updated_at DESC").all() as Record<string, unknown>[];
    return rows.map(rowToPage);
  }),

  /** Get recent pages */
  getRecent: publicProcedure
    .input(z.object({ limit: z.number().int().positive().default(10) }).optional())
    .query(({ input }) => {
      const db = getDb();
      const limit = input?.limit ?? 10;
      const rows = db.prepare("SELECT * FROM note_pages WHERE archived = 0 ORDER BY updated_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
      return rows.map(rowToPage);
    }),

  /** Create a new page */
  createPage: publicProcedure
    .input(
      z.object({
        title: z.string().default("Untitled"),
        spaceId: z.string().nullable().default(null),
        parentId: z.string().nullable().default(null),
        icon: z.string().optional(),
        content: z.any().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDb();
      const now = Date.now();
      const id = `page-${now}-${Math.random().toString(36).substr(2, 9)}`;

      const defaultContent = input.content || [
        { type: "heading", content: input.title },
        { type: "paragraph", content: "Start writing..." },
      ];

      db.prepare(
        `INSERT INTO note_pages (id, title, content, space_id, parent_id, icon, pinned, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      ).run(
        id,
        input.title,
        JSON.stringify(defaultContent),
        input.spaceId,
        input.parentId,
        input.icon || null,
        now,
        now,
      );

      log.info("[Notes] Created page:", id, input.title);

      const row = db.prepare("SELECT * FROM note_pages WHERE id = ?").get(id) as Record<string, unknown>;
      return rowToPage(row);
    }),

  /** Update an existing page */
  savePage: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        content: z.any().optional(),
        spaceId: z.string().nullable().optional(),
        parentId: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        coverImage: z.string().nullable().optional(),
        descriptionVisible: z.boolean().optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDb();
      const now = Date.now();

      // Build dynamic SET clause
      const sets: string[] = ["updated_at = ?"];
      const values: unknown[] = [now];

      if (input.title !== undefined) {
        sets.push("title = ?");
        values.push(input.title);
      }
      if (input.content !== undefined) {
        sets.push("content = ?");
        values.push(JSON.stringify(input.content));
      }
      if (input.spaceId !== undefined) {
        sets.push("space_id = ?");
        values.push(input.spaceId);
      }
      if (input.parentId !== undefined) {
        sets.push("parent_id = ?");
        values.push(input.parentId);
      }
      if (input.icon !== undefined) {
        sets.push("icon = ?");
        values.push(input.icon);
      }
      if (input.coverImage !== undefined) {
        sets.push("cover_image = ?");
        values.push(input.coverImage);
      }
      if (input.descriptionVisible !== undefined) {
        sets.push("description_visible = ?");
        values.push(input.descriptionVisible ? 1 : 0);
      }
      if (input.pinned !== undefined) {
        sets.push("pinned = ?");
        values.push(input.pinned ? 1 : 0);
      }
      if (input.archived !== undefined) {
        sets.push("archived = ?");
        values.push(input.archived ? 1 : 0);
      }

      values.push(input.id);
      db.prepare(`UPDATE note_pages SET ${sets.join(", ")} WHERE id = ?`).run(...values);

      const row = db.prepare("SELECT * FROM note_pages WHERE id = ?").get(input.id) as Record<string, unknown> | undefined;
      return row ? rowToPage(row) : null;
    }),

  /** Delete a page (and cascade to children) */
  deletePage: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDb();

      // Delete children recursively
      const deleteChildren = db.prepare("DELETE FROM note_pages WHERE parent_id = ?");
      const getChildren = db.prepare("SELECT id FROM note_pages WHERE parent_id = ?");

      function cascadeDelete(parentId: string) {
        const children = getChildren.all(parentId) as Array<{ id: string }>;
        for (const child of children) {
          cascadeDelete(child.id);
        }
        deleteChildren.run(parentId);
      }

      cascadeDelete(input.id);
      db.prepare("DELETE FROM note_pages WHERE id = ?").run(input.id);

      log.info("[Notes] Deleted page:", input.id);
      return { success: true };
    }),

  // ─── Spaces ──────────────────────────────────────────────────────────

  /** List all spaces */
  listSpaces: publicProcedure.query(() => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM note_spaces ORDER BY updated_at DESC").all() as Record<string, unknown>[];
    return rows.map(rowToSpace);
  }),

  /** Get a single space by ID */
  getSpace: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDb();
      const row = db.prepare("SELECT * FROM note_spaces WHERE id = ?").get(input.id) as Record<string, unknown> | undefined;
      return row ? rowToSpace(row) : null;
    }),

  /** Create a new space */
  createSpace: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        icon: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDb();
      const now = Date.now();
      const id = `space-${now}-${Math.random().toString(36).substr(2, 9)}`;

      db.prepare(
        `INSERT INTO note_spaces (id, name, icon, color, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      ).run(id, input.name, input.icon || null, input.color || null, now, now);

      log.info("[Notes] Created space:", id, input.name);

      const row = db.prepare("SELECT * FROM note_spaces WHERE id = ?").get(id) as Record<string, unknown>;
      return rowToSpace(row);
    }),

  /** Update a space */
  saveSpace: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        icon: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
        archived: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDb();
      const now = Date.now();

      const sets: string[] = ["updated_at = ?"];
      const values: unknown[] = [now];

      if (input.name !== undefined) {
        sets.push("name = ?");
        values.push(input.name);
      }
      if (input.icon !== undefined) {
        sets.push("icon = ?");
        values.push(input.icon);
      }
      if (input.color !== undefined) {
        sets.push("color = ?");
        values.push(input.color);
      }
      if (input.archived !== undefined) {
        sets.push("archived = ?");
        values.push(input.archived ? 1 : 0);
      }

      values.push(input.id);
      db.prepare(`UPDATE note_spaces SET ${sets.join(", ")} WHERE id = ?`).run(...values);

      const row = db.prepare("SELECT * FROM note_spaces WHERE id = ?").get(input.id) as Record<string, unknown> | undefined;
      return row ? rowToSpace(row) : null;
    }),

  /** Delete a space (pages in this space get their space_id set to NULL via FK) */
  deleteSpace: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDb();

      // Also delete all pages that belong to this space
      db.prepare("DELETE FROM note_pages WHERE space_id = ?").run(input.id);
      db.prepare("DELETE FROM note_spaces WHERE id = ?").run(input.id);

      log.info("[Notes] Deleted space:", input.id, "(and its pages)");
      return { success: true };
    }),

  // ─── Migration ───────────────────────────────────────────────────────

  /**
   * One-time migration: import pages and spaces from localStorage (sent by renderer).
   * This is idempotent — it uses INSERT OR IGNORE so duplicates are safely skipped.
   */
  migrateFromLocalStorage: publicProcedure
    .input(
      z.object({
        pages: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            content: z.any(),
            spaceId: z.string().nullable(),
            parentId: z.string().nullable(),
            icon: z.string().optional(),
            coverImage: z.string().optional(),
            descriptionVisible: z.boolean().optional(),
            pinned: z.boolean().optional(),
            archived: z.boolean().optional(),
            createdAt: z.number(),
            updatedAt: z.number(),
          }),
        ),
        spaces: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            icon: z.string().optional(),
            color: z.string().optional(),
            archived: z.boolean().optional(),
            createdAt: z.number(),
            updatedAt: z.number(),
          }),
        ),
      }),
    )
    .mutation(({ input }) => {
      const db = getDb();

      const insertSpace = db.prepare(
        `INSERT OR IGNORE INTO note_spaces (id, name, icon, color, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );

      const insertPage = db.prepare(
        `INSERT OR IGNORE INTO note_pages (id, title, content, space_id, parent_id, icon, cover_image, description_visible, pinned, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const migrate = db.transaction(() => {
        // Insert spaces first (FK reference)
        for (const s of input.spaces) {
          insertSpace.run(
            s.id,
            s.name,
            s.icon || null,
            s.color || null,
            s.archived ? 1 : 0,
            s.createdAt,
            s.updatedAt,
          );
        }

        // Insert pages (parent_id FK may reference other pages, order matters)
        // Insert root pages first, then sub-pages
        const rootPages = input.pages.filter((p) => !p.parentId);
        const childPages = input.pages.filter((p) => !!p.parentId);

        for (const p of [...rootPages, ...childPages]) {
          insertPage.run(
            p.id,
            p.title,
            JSON.stringify(p.content),
            p.spaceId,
            p.parentId,
            p.icon || null,
            p.coverImage || null,
            p.descriptionVisible !== false ? 1 : 0,
            p.pinned ? 1 : 0,
            p.archived ? 1 : 0,
            p.createdAt,
            p.updatedAt,
          );
        }
      });

      migrate();

      log.info(
        `[Notes] Migration complete: ${input.spaces.length} spaces, ${input.pages.length} pages imported`,
      );

      return {
        spacesImported: input.spaces.length,
        pagesImported: input.pages.length,
      };
    }),

  /** Check if SQLite already has notes data (used by renderer to decide whether to migrate) */
  hasMigratedData: publicProcedure.query(() => {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM note_pages").get() as { count: number };
    return row.count > 0;
  }),
});
