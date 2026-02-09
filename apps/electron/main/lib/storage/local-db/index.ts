/**
 * Local SQLite Database Initialization
 * Uses better-sqlite3 directly with raw SQL queries
 */

import { app } from "electron";
import { join, dirname } from "path";
import { existsSync, mkdirSync } from "fs";
import log from "electron-log";

// Type for better-sqlite3 Database
type SQLiteDatabase = import("better-sqlite3").Database;

let sqlite: SQLiteDatabase | null = null;
let initPromise: Promise<SQLiteDatabase | null> | null = null;
let lastInitError: Error | null = null;

/**
 * Get the path to the local database
 */
export function getDatabasePath(): string {
  const userDataPath = app.getPath("userData");
  const dataDir = join(userDataPath, "local-data");

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    log.info(`[LocalDB] Created data directory: ${dataDir}`);
  }

  return join(dataDir, "s-agi.db");
}

/**
 * Get the base path for local storage
 */
export function getLocalStoragePath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, "local-data");
}

/**
 * Initialize the local SQLite database
 */
export async function initDatabase(): Promise<SQLiteDatabase | null> {
  // Return existing instance if already initialized
  if (sqlite) {
    log.debug("[LocalDB] Returning existing SQLite instance");
    return sqlite;
  }

  // Return existing promise if initialization is in progress
  if (initPromise) {
    log.debug("[LocalDB] Returning existing init promise");
    return initPromise;
  }

  log.info("[LocalDB] Starting database initialization...");

  initPromise = (async () => {
    try {
      // Use require for native modules - they don't work well with dynamic import in Electron
      log.info("[LocalDB] Loading better-sqlite3...");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BetterSqlite3 = require("better-sqlite3");
      log.info("[LocalDB] better-sqlite3 loaded successfully");

      const dbPath = getDatabasePath();
      log.info(`[LocalDB] Database path: ${dbPath}`);

      // Ensure parent directory exists
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        log.info(`[LocalDB] Created directory: ${dir}`);
      }

      // Create SQLite connection
      log.info("[LocalDB] Creating SQLite connection...");
      const db = new BetterSqlite3(dbPath) as SQLiteDatabase;
      log.info("[LocalDB] SQLite connection created");

      // Enable WAL mode for better concurrency
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      db.pragma("synchronous = NORMAL");
      // Performance pragmas: larger cache, memory temp store, mmap for faster reads
      db.pragma("cache_size = -64000"); // 64MB page cache (negative = KB)
      db.pragma("temp_store = MEMORY"); // Keep temp tables in memory
      db.pragma("mmap_size = 268435456"); // 256MB memory-mapped I/O
      log.info("[LocalDB] Pragmas set");

      // Run migrations (create tables if they don't exist)
      runMigrations(db);

      // Store in module-level variable
      sqlite = db;
      lastInitError = null;

      log.info("[LocalDB] Database initialized successfully");
      return sqlite;
    } catch (error) {
      // better-sqlite3 might not be available (e.g., in web builds)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      log.error("[LocalDB] SQLite initialization failed:", errorMessage);
      if (errorStack) {
        log.error("[LocalDB] Stack trace:", errorStack);
      }
      sqlite = null;
      lastInitError = error instanceof Error ? error : new Error(errorMessage);
      initPromise = null;
      return null;
    }
  })();

  return initPromise;
}

/**
 * Run database migrations (create tables if they don't exist)
 */
function runMigrations(db: SQLiteDatabase): void {
  log.info("[LocalDB] Running migrations...");

  // Create tables using raw SQL for initial setup
  const migrations = [
    // Local user table
    `CREATE TABLE IF NOT EXISTS local_user (
      id TEXT PRIMARY KEY DEFAULT 'local-user',
      display_name TEXT DEFAULT 'Local User',
      email TEXT,
      avatar_path TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      last_sync_at INTEGER,
      cloud_user_id TEXT
    )`,

    // Settings table
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )`,

    // Chats table
    `CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      title TEXT DEFAULT 'New Chat',
      archived INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      source_type TEXT,
      source_id TEXT,
      openai_vector_store_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      deleted_at INTEGER,
      cloud_id TEXT,
      sync_status TEXT DEFAULT 'pending',
      last_sync_at INTEGER
    )`,

    // Chat messages table
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT,
      metadata TEXT,
      model_id TEXT,
      model_name TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      cloud_id TEXT,
      sync_status TEXT DEFAULT 'pending'
    )`,

    // Artifacts table
    `CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      chat_id TEXT REFERENCES chats(id) ON DELETE SET NULL,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      message_id TEXT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT,
      univer_data TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      cloud_id TEXT,
      sync_status TEXT DEFAULT 'pending'
    )`,

    // User files table
    `CREATE TABLE IF NOT EXISTS user_files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      univer_data TEXT,
      content TEXT,
      metadata TEXT,
      icon TEXT,
      color TEXT,
      version_count INTEGER DEFAULT 1,
      total_edits INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      folder_path TEXT,
      tags TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      last_opened_at INTEGER,
      deleted_at INTEGER,
      cloud_id TEXT,
      sync_status TEXT DEFAULT 'pending'
    )`,

    // File versions table
    `CREATE TABLE IF NOT EXISTS file_versions (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES user_files(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      univer_data TEXT,
      content TEXT,
      change_type TEXT NOT NULL,
      change_description TEXT,
      change_summary TEXT,
      diff_summary TEXT,
      created_by TEXT,
      ai_model TEXT,
      ai_prompt TEXT,
      tool_name TEXT,
      size_bytes INTEGER,
      commit_id TEXT,
      commit_message TEXT,
      commit_parent_id TEXT,
      checkpoint_prompt_id TEXT,
      checkpoint_message_id TEXT,
      is_checkpoint INTEGER DEFAULT 0,
      is_obsolete INTEGER DEFAULT 0,
      obsoleted_at INTEGER,
      obsoleted_by_version INTEGER,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )`,

    // Panel messages table
    `CREATE TABLE IF NOT EXISTS panel_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      panel_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      tab_type TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      model_id TEXT,
      model_name TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      cloud_id TEXT,
      sync_status TEXT DEFAULT 'pending'
    )`,

    // Chat files table
    `CREATE TABLE IF NOT EXISTS chat_files (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      file_size INTEGER,
      file_hash TEXT,
      content_type TEXT,
      openai_file_id TEXT,
      openai_vector_store_file_id TEXT,
      processing_status TEXT DEFAULT 'pending',
      extracted_content TEXT,
      metadata TEXT,
      pages INTEGER,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )`,

    // Quick prompts table
    `CREATE TABLE IF NOT EXISTS quick_prompts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      "order" INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )`,

    // Projects table (folders for organizing threads)
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local-user',
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📁',
      color TEXT,
      is_collapsed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )`,

    // Create indexes
    `CREATE INDEX IF NOT EXISTS chats_user_id_idx ON chats(user_id)`,
    `CREATE INDEX IF NOT EXISTS chats_updated_at_idx ON chats(updated_at)`,
    `CREATE INDEX IF NOT EXISTS chats_source_idx ON chats(source_type, source_id)`,
    `CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON chat_messages(chat_id)`,
    `CREATE INDEX IF NOT EXISTS messages_created_at_idx ON chat_messages(created_at)`,
    `CREATE INDEX IF NOT EXISTS artifacts_chat_id_idx ON artifacts(chat_id)`,
    `CREATE INDEX IF NOT EXISTS artifacts_user_id_idx ON artifacts(user_id)`,
    `CREATE INDEX IF NOT EXISTS artifacts_type_idx ON artifacts(type)`,
    `CREATE INDEX IF NOT EXISTS user_files_user_id_type_idx ON user_files(user_id, type)`,
    `CREATE INDEX IF NOT EXISTS user_files_last_opened_idx ON user_files(last_opened_at)`,
    `CREATE INDEX IF NOT EXISTS file_versions_file_id_idx ON file_versions(file_id)`,
    `CREATE INDEX IF NOT EXISTS file_versions_version_idx ON file_versions(file_id, version_number)`,
    `CREATE INDEX IF NOT EXISTS panel_messages_source_idx ON panel_messages(panel_type, source_id, tab_type)`,
    `CREATE INDEX IF NOT EXISTS chat_files_chat_id_idx ON chat_files(chat_id)`,
    `CREATE INDEX IF NOT EXISTS chat_files_hash_idx ON chat_files(chat_id, file_hash)`,

    // Projects indexes
    `CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id)`,
    `CREATE INDEX IF NOT EXISTS projects_sort_order_idx ON projects(sort_order)`,

    // Add project_id and sort_order to chats table (migration for existing databases)
    `ALTER TABLE chats ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`,
    `ALTER TABLE chats ADD COLUMN sort_order INTEGER DEFAULT 0`,

    // Index for chats project lookups
    `CREATE INDEX IF NOT EXISTS chats_project_id_idx ON chats(project_id)`,
    `CREATE INDEX IF NOT EXISTS chats_sort_order_idx ON chats(project_id, sort_order)`,

    // Insert default local user if not exists
    `INSERT OR IGNORE INTO local_user (id, display_name) VALUES ('local-user', 'Local User')`,
  ];

  for (const migration of migrations) {
    try {
      db.exec(migration);
    } catch (error) {
      // Ignore errors for already existing tables/indexes/columns
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("already exists") && !message.includes("duplicate column name")) {
        log.error(`[LocalDB] Migration error: ${message}`);
      }
    }
  }

  log.info("[LocalDB] Migrations completed");
}

/**
 * Get the database instance (initializes if needed)
 */
export async function getDatabase(): Promise<SQLiteDatabase | null> {
  if (!sqlite) {
    return initDatabase();
  }
  return sqlite;
}

/**
 * Get the raw SQLite database for direct queries
 */
export function getRawDatabase(): SQLiteDatabase | null {
  return sqlite;
}

/**
 * Check if the local database is available
 */
export function isLocalDatabaseAvailable(): boolean {
  return sqlite !== null;
}

/**
 * Get the last initialization error (if any)
 */
export function getLastDatabaseInitError(): Error | null {
  return lastInitError;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (sqlite) {
    try {
      sqlite.close();
      log.info("[LocalDB] Database connection closed");
    } catch (error) {
      log.error("[LocalDB] Error closing database:", error);
    }
    sqlite = null;
    initPromise = null;
  }
}
