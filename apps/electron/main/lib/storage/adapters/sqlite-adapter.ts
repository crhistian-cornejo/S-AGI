/**
 * SQLite Storage Adapter
 * Implements IStorageAdapter for local-first storage using raw SQL with better-sqlite3
 */

import log from "electron-log";
import {
  initDatabase,
  closeDatabase,
  isLocalDatabaseAvailable,
  getRawDatabase,
  getLastDatabaseInitError,
} from "../local-db";
import {
  getLocalFileStorage,
  type LocalFileStorage,
} from "../local-files";
import type {
  IStorageAdapter,
  StorageMode,
  FileType,
  PanelType,
  BucketType,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  Chat,
  CreateChatInput,
  UpdateChatInput,
  ListChatsOptions,
  Message,
  CreateMessageInput,
  UpdateMessageInput,
  Artifact,
  CreateArtifactInput,
  UpdateArtifactInput,
  UserFile,
  CreateUserFileInput,
  UpdateUserFileInput,
  ListFilesOptions,
  FileVersion,
  CreateFileVersionInput,
  ListVersionsOptions,
  PanelMessage,
  CreatePanelMessageInput,
  UpdatePanelMessageInput,
  ChatFile,
  CreateChatFileInput,
  FileUploadOptions,
  FileUploadResult,
  QuickPrompt,
  CreateQuickPromptInput,
  UpdateQuickPromptInput,
} from "./storage-adapter";

// Helper to convert Unix timestamp to Date
function toDate(timestamp: number | null): Date | null {
  return timestamp ? new Date(timestamp * 1000) : null;
}

// Parse JSON safely
function parseJson<T>(str: string | null): T | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/**
 * SQLite Storage Adapter
 * Provides local-first storage using better-sqlite3 with raw SQL
 */
export class SQLiteAdapter implements IStorageAdapter {
  readonly mode: StorageMode = "local";
  private _isConnected = false;
  private _fileStorage: LocalFileStorage | null = null;

  get isConnected(): boolean {
    return this._isConnected && isLocalDatabaseAvailable();
  }

  // ============ LIFECYCLE ============

  async initialize(): Promise<void> {
    try {
      const db = await initDatabase();
      if (!db) {
        const lastError = getLastDatabaseInitError();
        const baseMessage =
          "Failed to initialize SQLite database - better-sqlite3 may not be available";
        const errorMessage = lastError?.message
          ? `${baseMessage}. Root cause: ${lastError.message}`
          : baseMessage;
        const hint =
          lastError?.message?.includes("MODULE_NOT_FOUND") ||
          lastError?.message?.includes("was compiled against a different")
            ? " Hint: run `bun install` (postinstall rebuilds native modules) or `bunx electron-rebuild -f -w better-sqlite3`."
            : "";
        throw new Error(`${errorMessage}${hint}`);
      }
      this._fileStorage = getLocalFileStorage();
      this._isConnected = true;
      log.info("[SQLiteAdapter] Initialized successfully, db available:", !!db);
    } catch (error) {
      log.error("[SQLiteAdapter] Initialization failed:", error);
      this._isConnected = false;
      throw error;
    }
  }

  async close(): Promise<void> {
    closeDatabase();
    this._isConnected = false;
    log.info("[SQLiteAdapter] Closed");
  }

  // ============ CHATS ============

  chats = {
    // OpenCode-style: list all chats (no user filter needed in single-user mode)
    listAll: async (options?: ListChatsOptions): Promise<Chat[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      let sql = `SELECT * FROM chats WHERE 1=1`;

      if (!options?.includeDeleted) {
        sql += ` AND deleted_at IS NULL`;
      }
      if (!options?.includeArchived) {
        sql += ` AND archived = 0`;
      }
      sql += ` ORDER BY pinned DESC, updated_at DESC`;

      const results = db.prepare(sql).all() as any[];
      return results.map(this.mapChat);
    },

    // Legacy method with userId (for compatibility)
    list: async (userId: string, options?: ListChatsOptions): Promise<Chat[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      let sql = `SELECT * FROM chats WHERE user_id = ?`;
      const params: unknown[] = [userId];

      if (!options?.includeDeleted) {
        sql += ` AND deleted_at IS NULL`;
      }
      if (!options?.includeArchived) {
        sql += ` AND archived = 0`;
      }
      sql += ` ORDER BY pinned DESC, updated_at DESC`;

      const results = db.prepare(sql).all(...params) as any[];
      return results.map(this.mapChat);
    },

    // OpenCode-style: get by id only (no user ownership check)
    getById: async (id: string): Promise<Chat | null> => {
      const db = getRawDatabase();
      if (!db) {
        log.error("[SQLiteAdapter] chats.getById: Database not available");
        return null;
      }

      const result = db.prepare(
        `SELECT * FROM chats WHERE id = ? AND deleted_at IS NULL LIMIT 1`
      ).get(id) as any;

      return result ? this.mapChat(result) : null;
    },

    // OpenCode-style: update by id only (no user ownership check)
    updateById: async (id: string, data: UpdateChatInput): Promise<Chat> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.title !== undefined) {
        updates.push("title = ?");
        params.push(data.title);
      }
      if (data.archived !== undefined) {
        updates.push("archived = ?");
        params.push(data.archived ? 1 : 0);
      }
      if (data.pinned !== undefined) {
        updates.push("pinned = ?");
        params.push(data.pinned ? 1 : 0);
      }
      if (data.projectId !== undefined) {
        updates.push("project_id = ?");
        params.push(data.projectId);
      }
      if (data.sortOrder !== undefined) {
        updates.push("sort_order = ?");
        params.push(data.sortOrder);
      }
      if (data.openaiVectorStoreId !== undefined) {
        updates.push("openai_vector_store_id = ?");
        params.push(data.openaiVectorStoreId);
      }

      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));
      params.push(id);

      db.prepare(`
        UPDATE chats SET ${updates.join(", ")} WHERE id = ?
      `).run(...params);

      const chat = await this.chats.getById(id);
      if (!chat) throw new Error("Chat not found after update");
      return chat;
    },

    // OpenCode-style: delete by id only (no user ownership check)
    deleteById: async (id: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        UPDATE chats SET deleted_at = ?, updated_at = ? WHERE id = ?
      `).run(now, now, id);
    },

    // OpenCode-style: archive by id only (no user ownership check)
    archiveById: async (id: string): Promise<Chat> => {
      return this.chats.updateById(id, { archived: true, pinned: false });
    },

    // OpenCode-style: restore by id only (no user ownership check)
    restoreById: async (id: string): Promise<Chat> => {
      return this.chats.updateById(id, { archived: false });
    },

    // Legacy method with userId (for compatibility)
    get: async (id: string, userId: string): Promise<Chat | null> => {
      const db = getRawDatabase();
      if (!db) {
        log.error("[SQLiteAdapter] chats.get: Database not available");
        return null;
      }

      log.info("[SQLiteAdapter] chats.get query - id:", id, "userId:", userId);

      const result = db.prepare(
        `SELECT * FROM chats WHERE id = ? AND user_id = ? LIMIT 1`
      ).get(id, userId) as any;

      if (!result) {
        // Debug: Check if chat exists at all
        const anyChat = db.prepare(
          `SELECT id, user_id FROM chats WHERE id = ? LIMIT 1`
        ).get(id) as any;
        if (anyChat) {
          log.warn("[SQLiteAdapter] Chat exists but with different user_id. Found:", anyChat.user_id, "Expected:", userId);
        } else {
          log.warn("[SQLiteAdapter] Chat not found in database at all, id:", id);
          // List all chats for debugging
          const allChats = db.prepare(`SELECT id, user_id, title FROM chats LIMIT 10`).all() as any[];
          log.info("[SQLiteAdapter] All chats in database:", JSON.stringify(allChats));
        }
      }

      return result ? this.mapChat(result) : null;
    },

    create: async (data: CreateChatInput): Promise<Chat> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      log.info("[SQLiteAdapter] chats.create - id:", id, "userId:", data.userId, "title:", data.title);

      db.prepare(`
        INSERT INTO chats (id, user_id, title, project_id, source_type, source_id, archived, pinned, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
      `).run(id, data.userId, data.title || "New Chat", data.projectId || null, data.sourceType || null, data.sourceId || null, now, now);

      // Verify the insert worked - use getById (no userId check)
      const chat = await this.chats.getById(id);
      if (!chat) {
        log.error("[SQLiteAdapter] chats.create - failed to retrieve inserted chat, id:", id);
        throw new Error("Failed to create chat");
      }
      return chat;
    },

    update: async (id: string, userId: string, data: UpdateChatInput): Promise<Chat> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.title !== undefined) {
        updates.push("title = ?");
        params.push(data.title);
      }
      if (data.archived !== undefined) {
        updates.push("archived = ?");
        params.push(data.archived ? 1 : 0);
      }
      if (data.pinned !== undefined) {
        updates.push("pinned = ?");
        params.push(data.pinned ? 1 : 0);
      }
      if (data.projectId !== undefined) {
        updates.push("project_id = ?");
        params.push(data.projectId);
      }
      if (data.sortOrder !== undefined) {
        updates.push("sort_order = ?");
        params.push(data.sortOrder);
      }
      if (data.openaiVectorStoreId !== undefined) {
        updates.push("openai_vector_store_id = ?");
        params.push(data.openaiVectorStoreId);
      }

      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));

      params.push(id, userId);

      db.prepare(`
        UPDATE chats SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
      `).run(...params);

      return this.chats.get(id, userId) as Promise<Chat>;
    },

    delete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        UPDATE chats SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?
      `).run(now, now, id, userId);
    },

    archive: async (id: string, userId: string): Promise<Chat> => {
      return this.chats.update(id, userId, { archived: true, pinned: false });
    },

    restore: async (id: string, userId: string): Promise<Chat> => {
      return this.chats.update(id, userId, { archived: false });
    },
  };

  private mapChat = (row: any): Chat => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    archived: Boolean(row.archived),
    pinned: Boolean(row.pinned),
    projectId: row.project_id || null,
    sortOrder: row.sort_order || 0,
    sourceType: row.source_type,
    sourceId: row.source_id,
    openaiVectorStoreId: row.openai_vector_store_id,
    createdAt: toDate(row.created_at) || new Date(),
    updatedAt: toDate(row.updated_at) || new Date(),
    deletedAt: toDate(row.deleted_at),
  });

  // ============ MESSAGES ============

  messages = {
    // OpenCode-style: list by chatId only (no user ownership check)
    listByChatId: async (chatId: string, limit = 100): Promise<Message[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      const results = db.prepare(`
        SELECT * FROM chat_messages
        WHERE chat_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      `).all(chatId, limit) as any[];

      return results.map(this.mapMessage);
    },

    // Legacy method with userId (for compatibility)
    list: async (chatId: string, userId: string, limit = 100): Promise<Message[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      const results = db.prepare(`
        SELECT * FROM chat_messages
        WHERE chat_id = ? AND user_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      `).all(chatId, userId, limit) as any[];

      return results.map(this.mapMessage);
    },

    // OpenCode-style: get by id only (no user ownership check)
    getById: async (id: string): Promise<Message | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(
        `SELECT * FROM chat_messages WHERE id = ? LIMIT 1`
      ).get(id) as any;

      return result ? this.mapMessage(result) : null;
    },

    // Legacy method with userId (for compatibility)
    get: async (id: string, userId: string): Promise<Message | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(
        `SELECT * FROM chat_messages WHERE id = ? AND user_id = ? LIMIT 1`
      ).get(id, userId) as any;

      return result ? this.mapMessage(result) : null;
    },

    add: async (data: CreateMessageInput): Promise<Message> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      log.info("[SQLiteAdapter] messages.add - id:", id, "chatId:", data.chatId, "userId:", data.userId);

      db.prepare(`
        INSERT INTO chat_messages (id, chat_id, user_id, role, content, attachments, metadata, model_id, model_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.chatId,
        data.userId,
        data.role,
        data.content,
        data.attachments ? JSON.stringify(data.attachments) : null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.modelId || null,
        data.modelName || null,
        now,
        now
      );

      // Use getById (no userId check) - OpenCode pattern
      const message = await this.messages.getById(id);
      if (!message) {
        log.error("[SQLiteAdapter] messages.add - failed to retrieve inserted message, id:", id);
        throw new Error("Failed to create message");
      }
      return message;
    },

    update: async (id: string, userId: string, data: UpdateMessageInput): Promise<Message> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.content !== undefined) {
        updates.push("content = ?");
        params.push(data.content);
      }
      if (data.attachments !== undefined) {
        updates.push("attachments = ?");
        params.push(JSON.stringify(data.attachments));
      }
      if (data.metadata !== undefined) {
        updates.push("metadata = ?");
        params.push(JSON.stringify(data.metadata));
      }

      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));
      params.push(id, userId);

      db.prepare(`
        UPDATE chat_messages SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
      `).run(...params);

      return this.messages.get(id, userId) as Promise<Message>;
    },

    delete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      db.prepare(`DELETE FROM chat_messages WHERE id = ? AND user_id = ?`).run(id, userId);
    },
  };

  private mapMessage = (row: any): Message => ({
    id: row.id,
    chatId: row.chat_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    attachments: parseJson(row.attachments),
    metadata: parseJson(row.metadata),
    modelId: row.model_id,
    modelName: row.model_name,
    createdAt: toDate(row.created_at) || new Date(),
    updatedAt: toDate(row.updated_at) || new Date(),
  });

  // ============ ARTIFACTS ============

  artifacts = {
    list: async (chatId: string | null, userId: string): Promise<Artifact[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      let sql = `SELECT * FROM artifacts WHERE user_id = ?`;
      const params: unknown[] = [userId];

      if (chatId) {
        sql += ` AND chat_id = ?`;
        params.push(chatId);
      }
      sql += ` ORDER BY created_at DESC`;

      const results = db.prepare(sql).all(...params) as any[];
      return results.map(this.mapArtifact);
    },

    listStandalone: async (userId: string): Promise<Artifact[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      const results = db.prepare(`
        SELECT * FROM artifacts WHERE user_id = ? AND chat_id IS NULL ORDER BY created_at DESC
      `).all(userId) as any[];

      return results.map(this.mapArtifact);
    },

    listAll: async (userId: string): Promise<Artifact[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      const results = db.prepare(`
        SELECT * FROM artifacts WHERE user_id = ? ORDER BY created_at DESC
      `).all(userId) as any[];

      return results.map(this.mapArtifact);
    },

    get: async (id: string, userId: string): Promise<Artifact | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(
        `SELECT * FROM artifacts WHERE id = ? AND user_id = ? LIMIT 1`
      ).get(id, userId) as any;

      return result ? this.mapArtifact(result) : null;
    },

    create: async (data: CreateArtifactInput): Promise<Artifact> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      db.prepare(`
        INSERT INTO artifacts (id, chat_id, user_id, message_id, type, name, content, univer_data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.chatId || null,
        data.userId,
        data.messageId || null,
        data.type,
        data.name,
        data.content ? JSON.stringify(data.content) : null,
        data.univerData ? JSON.stringify(data.univerData) : null,
        now,
        now
      );

      return this.artifacts.get(id, data.userId) as Promise<Artifact>;
    },

    update: async (id: string, userId: string, data: UpdateArtifactInput): Promise<Artifact> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.name !== undefined) {
        updates.push("name = ?");
        params.push(data.name);
      }
      if (data.content !== undefined) {
        updates.push("content = ?");
        params.push(JSON.stringify(data.content));
      }
      if (data.univerData !== undefined) {
        updates.push("univer_data = ?");
        params.push(JSON.stringify(data.univerData));
      }

      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));
      params.push(id, userId);

      db.prepare(`
        UPDATE artifacts SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
      `).run(...params);

      return this.artifacts.get(id, userId) as Promise<Artifact>;
    },

    delete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      db.prepare(`DELETE FROM artifacts WHERE id = ? AND user_id = ?`).run(id, userId);
    },
  };

  private mapArtifact = (row: any): Artifact => ({
    id: row.id,
    chatId: row.chat_id,
    userId: row.user_id,
    messageId: row.message_id,
    type: row.type,
    name: row.name,
    content: parseJson(row.content),
    univerData: parseJson(row.univer_data),
    createdAt: toDate(row.created_at) || new Date(),
    updatedAt: toDate(row.updated_at) || new Date(),
  });

  // ============ USER FILES ============

  userFiles = {
    list: async (userId: string, type: FileType, options?: ListFilesOptions): Promise<UserFile[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      let sql = `SELECT * FROM user_files WHERE user_id = ? AND type = ? AND deleted_at IS NULL`;
      const params: unknown[] = [userId, type];

      if (!options?.includeArchived) {
        sql += ` AND is_archived = 0`;
      }

      // Sorting
      const sortColumn = options?.sortBy === "name" ? "name" :
                        options?.sortBy === "createdAt" ? "created_at" :
                        options?.sortBy === "lastOpenedAt" ? "last_opened_at" : "updated_at";
      const sortDir = options?.sortOrder === "asc" ? "ASC" : "DESC";
      sql += ` ORDER BY is_pinned DESC, ${sortColumn} ${sortDir}`;

      if (options?.limit) {
        sql += ` LIMIT ?`;
        params.push(options.limit);
      }
      if (options?.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }

      const results = db.prepare(sql).all(...params) as any[];
      return results.map(this.mapUserFile);
    },

    get: async (id: string, userId: string): Promise<UserFile | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(
        `SELECT * FROM user_files WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`
      ).get(id, userId) as any;

      return result ? this.mapUserFile(result) : null;
    },

    create: async (data: CreateUserFileInput): Promise<UserFile> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      db.prepare(`
        INSERT INTO user_files (id, user_id, type, name, description, univer_data, content, metadata, icon, color, version_count, total_edits, is_pinned, is_archived, created_at, updated_at, last_opened_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?, ?, ?)
      `).run(
        id,
        data.userId,
        data.type,
        data.name,
        data.description || null,
        data.univerData ? JSON.stringify(data.univerData) : null,
        data.content || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.icon || null,
        data.color || null,
        now,
        now,
        now
      );

      return this.userFiles.get(id, data.userId) as Promise<UserFile>;
    },

    update: async (id: string, userId: string, data: UpdateUserFileInput): Promise<UserFile> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.name !== undefined) {
        updates.push("name = ?");
        params.push(data.name);
      }
      if (data.description !== undefined) {
        updates.push("description = ?");
        params.push(data.description);
      }
      if (data.univerData !== undefined) {
        updates.push("univer_data = ?");
        params.push(JSON.stringify(data.univerData));
      }
      if (data.content !== undefined) {
        updates.push("content = ?");
        params.push(data.content);
      }
      if (data.metadata !== undefined) {
        updates.push("metadata = ?");
        params.push(JSON.stringify(data.metadata));
      }
      if (data.icon !== undefined) {
        updates.push("icon = ?");
        params.push(data.icon);
      }
      if (data.color !== undefined) {
        updates.push("color = ?");
        params.push(data.color);
      }
      if (data.isPinned !== undefined) {
        updates.push("is_pinned = ?");
        params.push(data.isPinned ? 1 : 0);
      }
      if (data.isArchived !== undefined) {
        updates.push("is_archived = ?");
        params.push(data.isArchived ? 1 : 0);
      }
      if (data.folderPath !== undefined) {
        updates.push("folder_path = ?");
        params.push(data.folderPath);
      }
      if (data.tags !== undefined) {
        updates.push("tags = ?");
        params.push(JSON.stringify(data.tags));
      }

      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));
      params.push(id, userId);

      db.prepare(`
        UPDATE user_files SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
      `).run(...params);

      return this.userFiles.get(id, userId) as Promise<UserFile>;
    },

    delete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        UPDATE user_files SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?
      `).run(now, now, id, userId);
    },

    hardDelete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      db.prepare(`DELETE FROM user_files WHERE id = ? AND user_id = ?`).run(id, userId);
    },

    updateLastOpened: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        UPDATE user_files SET last_opened_at = ? WHERE id = ? AND user_id = ?
      `).run(now, id, userId);
    },

    listVersions: async (fileId: string, _userId: string, options?: ListVersionsOptions): Promise<FileVersion[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      let sql = `SELECT * FROM file_versions WHERE file_id = ?`;
      const params: unknown[] = [fileId];

      if (!options?.includeObsolete) {
        sql += ` AND (is_obsolete = 0 OR is_obsolete IS NULL)`;
      }
      sql += ` ORDER BY version_number DESC`;

      if (options?.limit) {
        sql += ` LIMIT ?`;
        params.push(options.limit);
      }
      if (options?.offset) {
        sql += ` OFFSET ?`;
        params.push(options.offset);
      }

      const results = db.prepare(sql).all(...params) as any[];
      return results.map(this.mapFileVersion);
    },

    getVersion: async (fileId: string, versionNumber: number, _userId: string): Promise<FileVersion | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(`
        SELECT * FROM file_versions WHERE file_id = ? AND version_number = ? LIMIT 1
      `).get(fileId, versionNumber) as any;

      return result ? this.mapFileVersion(result) : null;
    },

    createVersion: async (data: CreateFileVersionInput): Promise<FileVersion> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      db.prepare(`
        INSERT INTO file_versions (id, file_id, version_number, univer_data, content, change_type, change_description, change_summary, created_by, ai_model, ai_prompt, tool_name, size_bytes, commit_id, commit_message, commit_parent_id, is_checkpoint, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.fileId,
        data.versionNumber,
        data.univerData ? JSON.stringify(data.univerData) : null,
        data.content || null,
        data.changeType,
        data.changeDescription || null,
        data.changeSummary ? JSON.stringify(data.changeSummary) : null,
        data.createdBy || null,
        data.aiModel || null,
        data.aiPrompt || null,
        data.toolName || null,
        data.sizeBytes || null,
        data.commitId || null,
        data.commitMessage || null,
        data.commitParentId || null,
        data.isCheckpoint ? 1 : 0,
        now
      );

      // Update version count on file
      db.prepare(`
        UPDATE user_files SET version_count = ? WHERE id = ?
      `).run(data.versionNumber, data.fileId);

      return this.userFiles.getVersion(data.fileId, data.versionNumber, "") as Promise<FileVersion>;
    },

    restoreVersion: async (fileId: string, versionNumber: number, userId: string): Promise<UserFile> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const version = await this.userFiles.getVersion(fileId, versionNumber, userId);
      if (!version) throw new Error("Version not found");

      await this.userFiles.update(fileId, userId, {
        univerData: version.univerData,
        content: version.content || undefined,
      });

      return this.userFiles.get(fileId, userId) as Promise<UserFile>;
    },

    getNextVersionNumber: async (fileId: string): Promise<number> => {
      const db = getRawDatabase();
      if (!db) return 1;

      const result = db.prepare(`
        SELECT MAX(version_number) as max_version FROM file_versions WHERE file_id = ?
      `).get(fileId) as any;

      return (result?.max_version || 0) + 1;
    },
  };

  private mapUserFile = (row: any): UserFile => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    name: row.name,
    description: row.description,
    univerData: parseJson(row.univer_data),
    content: row.content,
    metadata: parseJson(row.metadata),
    icon: row.icon,
    color: row.color,
    versionCount: row.version_count || 1,
    totalEdits: row.total_edits || 0,
    isPinned: Boolean(row.is_pinned),
    isArchived: Boolean(row.is_archived),
    folderPath: row.folder_path,
    tags: parseJson(row.tags),
    createdAt: toDate(row.created_at) || new Date(),
    updatedAt: toDate(row.updated_at) || new Date(),
    lastOpenedAt: toDate(row.last_opened_at),
    deletedAt: toDate(row.deleted_at),
  });

  private mapFileVersion = (row: any): FileVersion => ({
    id: row.id,
    fileId: row.file_id,
    versionNumber: row.version_number,
    univerData: parseJson(row.univer_data),
    content: row.content,
    changeType: row.change_type,
    changeDescription: row.change_description,
    changeSummary: parseJson(row.change_summary),
    diffSummary: parseJson(row.diff_summary),
    createdBy: row.created_by,
    aiModel: row.ai_model,
    aiPrompt: row.ai_prompt,
    toolName: row.tool_name,
    sizeBytes: row.size_bytes,
    commitId: row.commit_id,
    commitMessage: row.commit_message,
    commitParentId: row.commit_parent_id,
    isCheckpoint: Boolean(row.is_checkpoint),
    isObsolete: Boolean(row.is_obsolete),
    obsoletedAt: toDate(row.obsoleted_at),
    obsoletedByVersion: row.obsoleted_by_version,
    createdAt: toDate(row.created_at) || new Date(),
  });

  // ============ PANEL MESSAGES ============

  panelMessages = {
    list: async (panelType: PanelType, sourceId: string, userId: string, tabType?: string): Promise<PanelMessage[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      let sql = `SELECT * FROM panel_messages WHERE panel_type = ? AND source_id = ? AND user_id = ?`;
      const params: unknown[] = [panelType, sourceId, userId];

      if (tabType) {
        sql += ` AND tab_type = ?`;
        params.push(tabType);
      }
      sql += ` ORDER BY created_at ASC`;

      const results = db.prepare(sql).all(...params) as any[];
      return results.map(this.mapPanelMessage);
    },

    get: async (id: string, userId: string): Promise<PanelMessage | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(
        `SELECT * FROM panel_messages WHERE id = ? AND user_id = ? LIMIT 1`
      ).get(id, userId) as any;

      return result ? this.mapPanelMessage(result) : null;
    },

    add: async (data: CreatePanelMessageInput): Promise<PanelMessage> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      db.prepare(`
        INSERT INTO panel_messages (id, user_id, panel_type, source_id, tab_type, role, content, metadata, model_id, model_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.userId,
        data.panelType,
        data.sourceId,
        data.tabType || null,
        data.role,
        data.content,
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.modelId || null,
        data.modelName || null,
        now,
        now
      );

      return this.panelMessages.get(id, data.userId) as Promise<PanelMessage>;
    },

    update: async (id: string, userId: string, data: UpdatePanelMessageInput): Promise<PanelMessage> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.content !== undefined) {
        updates.push("content = ?");
        params.push(data.content);
      }
      if (data.metadata !== undefined) {
        updates.push("metadata = ?");
        params.push(JSON.stringify(data.metadata));
      }

      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));
      params.push(id, userId);

      db.prepare(`
        UPDATE panel_messages SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
      `).run(...params);

      return this.panelMessages.get(id, userId) as Promise<PanelMessage>;
    },

    delete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      db.prepare(`DELETE FROM panel_messages WHERE id = ? AND user_id = ?`).run(id, userId);
    },

    clear: async (panelType: PanelType, sourceId: string, userId: string, tabType?: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      let sql = `DELETE FROM panel_messages WHERE panel_type = ? AND source_id = ? AND user_id = ?`;
      const params: unknown[] = [panelType, sourceId, userId];

      if (tabType) {
        sql += ` AND tab_type = ?`;
        params.push(tabType);
      }

      db.prepare(sql).run(...params);
    },
  };

  private mapPanelMessage = (row: any): PanelMessage => ({
    id: row.id,
    userId: row.user_id,
    panelType: row.panel_type,
    sourceId: row.source_id,
    tabType: row.tab_type,
    role: row.role,
    content: row.content,
    metadata: parseJson(row.metadata),
    modelId: row.model_id,
    modelName: row.model_name,
    createdAt: toDate(row.created_at) || new Date(),
    updatedAt: toDate(row.updated_at) || new Date(),
  });

  // ============ CHAT FILES ============

  chatFiles = {
    list: async (chatId: string, userId: string): Promise<ChatFile[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      const results = db.prepare(`
        SELECT * FROM chat_files WHERE chat_id = ? AND user_id = ? ORDER BY created_at DESC
      `).all(chatId, userId) as any[];

      return results.map(this.mapChatFile);
    },

    get: async (id: string, userId: string): Promise<ChatFile | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(
        `SELECT * FROM chat_files WHERE id = ? AND user_id = ? LIMIT 1`
      ).get(id, userId) as any;

      return result ? this.mapChatFile(result) : null;
    },

    create: async (data: CreateChatFileInput): Promise<ChatFile> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      db.prepare(`
        INSERT INTO chat_files (
          id, chat_id, user_id, filename, storage_path, file_size, file_hash,
          content_type, openai_file_id, openai_vector_store_file_id,
          processing_status, extracted_content, metadata, pages, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.chatId,
        data.userId,
        data.filename,
        data.storagePath,
        data.fileSize || null,
        data.fileHash || null,
        data.contentType || null,
        data.openaiFileId || null,
        data.openaiVectorStoreFileId || null,
        data.processingStatus || "pending",
        data.extractedContent || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.pages ? JSON.stringify(data.pages) : null,
        now
      );

      return this.chatFiles.get(id, data.userId) as Promise<ChatFile>;
    },

    delete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      db.prepare(`DELETE FROM chat_files WHERE id = ? AND user_id = ?`).run(id, userId);
    },

    deleteForChat: async (chatId: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      db.prepare(`DELETE FROM chat_files WHERE chat_id = ? AND user_id = ?`).run(chatId, userId);
    },
  };

  private mapChatFile = (row: any): ChatFile => ({
    id: row.id,
    chatId: row.chat_id,
    userId: row.user_id,
    filename: row.filename,
    storagePath: row.storage_path,
    fileSize: row.file_size,
    fileHash: row.file_hash,
    contentType: row.content_type,
    openaiFileId: row.openai_file_id,
    openaiVectorStoreFileId: row.openai_vector_store_file_id,
    processingStatus: row.processing_status || "pending",
    extractedContent: row.extracted_content,
    metadata: parseJson(row.metadata),
    pages: parseJson(row.pages),
    localVectorStatus: row.local_vector_status,
    localEmbeddingModel: row.local_embedding_model,
    chunkCount: row.chunk_count,
    createdAt: toDate(row.created_at) || new Date(),
  });

  // ============ FILE STORAGE ============

  fileStorage = {
    upload: async (bucket: BucketType, path: string, data: Buffer, options?: FileUploadOptions): Promise<FileUploadResult> => {
      if (!this._fileStorage) {
        return { success: false, error: "File storage not initialized" };
      }
      return this._fileStorage.upload(bucket, path, data, options);
    },

    download: async (bucket: BucketType, path: string): Promise<Buffer | null> => {
      if (!this._fileStorage) return null;
      return this._fileStorage.downloadAsBuffer(bucket, path);
    },

    delete: async (bucket: BucketType, paths: string[]): Promise<void> => {
      if (!this._fileStorage) return;
      await this._fileStorage.deleteFiles(bucket, paths);
    },

    getUrl: async (bucket: BucketType, path: string, _expiresIn?: number): Promise<string> => {
      if (!this._fileStorage) throw new Error("File storage not initialized");
      return this._fileStorage.getUrl(bucket, path);
    },

    exists: (bucket: BucketType, path: string): boolean => {
      if (!this._fileStorage) return false;
      return this._fileStorage.exists(bucket, path);
    },

    generatePath: (bucket: BucketType, userId: string, folder: string, filename: string): string => {
      if (!this._fileStorage) throw new Error("File storage not initialized");
      return this._fileStorage.generatePath(bucket, userId, folder, filename);
    },
  };

  // ============ QUICK PROMPTS ============

  quickPrompts = {
    list: async (userId: string): Promise<QuickPrompt[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      const results = db.prepare(`
        SELECT * FROM quick_prompts WHERE user_id = ? ORDER BY "order" ASC
      `).all(userId) as any[];

      return results.map(this.mapQuickPrompt);
    },

    get: async (id: string, userId: string): Promise<QuickPrompt | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(
        `SELECT * FROM quick_prompts WHERE id = ? AND user_id = ? LIMIT 1`
      ).get(id, userId) as any;

      return result ? this.mapQuickPrompt(result) : null;
    },

    create: async (data: CreateQuickPromptInput): Promise<QuickPrompt> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      db.prepare(`
        INSERT INTO quick_prompts (id, user_id, title, content, "order", created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.userId, data.title, data.content, data.order || 0, now, now);

      return this.quickPrompts.get(id, data.userId) as Promise<QuickPrompt>;
    },

    update: async (id: string, userId: string, data: UpdateQuickPromptInput): Promise<QuickPrompt> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.title !== undefined) {
        updates.push("title = ?");
        params.push(data.title);
      }
      if (data.content !== undefined) {
        updates.push("content = ?");
        params.push(data.content);
      }
      if (data.order !== undefined) {
        updates.push('"order" = ?');
        params.push(data.order);
      }

      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));
      params.push(id, userId);

      db.prepare(`
        UPDATE quick_prompts SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
      `).run(...params);

      return this.quickPrompts.get(id, userId) as Promise<QuickPrompt>;
    },

    delete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      db.prepare(`DELETE FROM quick_prompts WHERE id = ? AND user_id = ?`).run(id, userId);
    },

    reorder: async (userId: string, ids: string[]): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const stmt = db.prepare(`UPDATE quick_prompts SET "order" = ? WHERE id = ? AND user_id = ?`);
      ids.forEach((id, index) => {
        stmt.run(index, id, userId);
      });
    },
  };

  private mapQuickPrompt = (row: any): QuickPrompt => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    content: row.content,
    order: row.order || 0,
    createdAt: toDate(row.created_at) || new Date(),
    updatedAt: toDate(row.updated_at) || new Date(),
  });

  // ============ PROJECTS (Folders for threads) ============

  projects = {
    list: async (userId: string): Promise<Project[]> => {
      const db = getRawDatabase();
      if (!db) return [];

      const results = db.prepare(`
        SELECT * FROM projects WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC
      `).all(userId) as any[];

      return results.map(this.mapProject);
    },

    get: async (id: string, userId: string): Promise<Project | null> => {
      const db = getRawDatabase();
      if (!db) return null;

      const result = db.prepare(
        `SELECT * FROM projects WHERE id = ? AND user_id = ? LIMIT 1`
      ).get(id, userId) as any;

      return result ? this.mapProject(result) : null;
    },

    create: async (data: CreateProjectInput): Promise<Project> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      // Get max sort_order for this user
      const maxOrderResult = db.prepare(`
        SELECT MAX(sort_order) as max_order FROM projects WHERE user_id = ?
      `).get(data.userId) as any;
      const sortOrder = (maxOrderResult?.max_order ?? -1) + 1;

      db.prepare(`
        INSERT INTO projects (id, user_id, name, icon, color, is_collapsed, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(id, data.userId, data.name, data.icon || "📁", data.color || null, sortOrder, now, now);

      return this.projects.get(id, data.userId) as Promise<Project>;
    },

    update: async (id: string, userId: string, data: UpdateProjectInput): Promise<Project> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.name !== undefined) {
        updates.push("name = ?");
        params.push(data.name);
      }
      if (data.icon !== undefined) {
        updates.push("icon = ?");
        params.push(data.icon);
      }
      if (data.color !== undefined) {
        updates.push("color = ?");
        params.push(data.color);
      }
      if (data.isCollapsed !== undefined) {
        updates.push("is_collapsed = ?");
        params.push(data.isCollapsed ? 1 : 0);
      }
      if (data.sortOrder !== undefined) {
        updates.push("sort_order = ?");
        params.push(data.sortOrder);
      }

      updates.push("updated_at = ?");
      params.push(Math.floor(Date.now() / 1000));
      params.push(id, userId);

      db.prepare(`
        UPDATE projects SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
      `).run(...params);

      return this.projects.get(id, userId) as Promise<Project>;
    },

    delete: async (id: string, userId: string): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      // First, unassign all chats from this project
      db.prepare(`
        UPDATE chats SET project_id = NULL WHERE project_id = ? AND user_id = ?
      `).run(id, userId);

      // Then delete the project
      db.prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`).run(id, userId);
    },

    reorder: async (userId: string, ids: string[]): Promise<void> => {
      const db = getRawDatabase();
      if (!db) throw new Error("Database not available");

      const stmt = db.prepare(`UPDATE projects SET sort_order = ? WHERE id = ? AND user_id = ?`);
      ids.forEach((id, index) => {
        stmt.run(index, id, userId);
      });
    },
  };

  private mapProject = (row: any): Project => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    icon: row.icon || "📁",
    color: row.color,
    isCollapsed: Boolean(row.is_collapsed),
    sortOrder: row.sort_order || 0,
    createdAt: toDate(row.created_at) || new Date(),
    updatedAt: toDate(row.updated_at) || new Date(),
  });
}
