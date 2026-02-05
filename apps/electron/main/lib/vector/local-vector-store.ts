/**
 * Local Vector Store
 *
 * Stores and retrieves document embeddings using SQLite with sqlite-vec extension.
 * Provides KNN search for semantic document search.
 */

import log from "electron-log";
import { randomUUID } from "crypto";
import { getRawDatabase, initDatabase } from "../storage/local-db";
import type {
  StoreEmbeddingsOptions,
  VectorSearchOptions,
  VectorSearchResult,
  LocalVectorStatus,
} from "./types";

// Type for better-sqlite3 Database
type SQLiteDatabase = import("better-sqlite3").Database;

// ============================================================================
// Module State
// ============================================================================

let sqliteVecLoaded = false;
let vecTablesCreated = false;

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Load sqlite-vec extension into the database
 */
async function loadSqliteVec(db: SQLiteDatabase): Promise<boolean> {
  if (sqliteVecLoaded) return true;

  try {
    // Dynamic import to handle native module loading
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require("sqlite-vec");
    sqliteVec.load(db);
    sqliteVecLoaded = true;
    log.info("[LocalVectorStore] sqlite-vec extension loaded successfully");
    return true;
  } catch (error) {
    log.error("[LocalVectorStore] Failed to load sqlite-vec:", error);
    return false;
  }
}

/**
 * Create vector tables if they don't exist
 */
async function ensureVectorTables(db: SQLiteDatabase): Promise<void> {
  if (vecTablesCreated) return;

  const migrations = [
    // Document embeddings table
    `CREATE TABLE IF NOT EXISTS document_embeddings (
      id TEXT PRIMARY KEY,
      chat_file_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      page_number INTEGER,
      start_char INTEGER,
      end_char INTEGER,
      token_count INTEGER,
      embedding BLOB NOT NULL,
      metadata TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      UNIQUE(chat_file_id, chunk_index)
    )`,

    // Index for chat_file lookups
    `CREATE INDEX IF NOT EXISTS embeddings_chat_file_idx
      ON document_embeddings(chat_file_id)`,

    // Virtual table for vector search (1536 dimensions for text-embedding-3-small)
    `CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings_vec
      USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[1536]
      )`,

    // Add local_vector_status column to chat_files if not exists
    `ALTER TABLE chat_files ADD COLUMN local_vector_status TEXT DEFAULT 'pending'`,

    // Add local_embedding_model column to chat_files if not exists
    `ALTER TABLE chat_files ADD COLUMN local_embedding_model TEXT`,

    // Add chunk_count column to chat_files if not exists
    `ALTER TABLE chat_files ADD COLUMN chunk_count INTEGER DEFAULT 0`,
  ];

  for (const migration of migrations) {
    try {
      db.exec(migration);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Ignore "already exists" and "duplicate column" errors
      if (
        !message.includes("already exists") &&
        !message.includes("duplicate column name")
      ) {
        log.error("[LocalVectorStore] Migration error:", message);
      }
    }
  }

  vecTablesCreated = true;
  log.info("[LocalVectorStore] Vector tables ensured");
}

/**
 * Initialize the vector store (load extension + create tables)
 */
export async function initVectorStore(): Promise<boolean> {
  try {
    const db = await initDatabase();
    if (!db) {
      log.error("[LocalVectorStore] Database not available");
      return false;
    }

    const loaded = await loadSqliteVec(db);
    if (!loaded) return false;

    await ensureVectorTables(db);
    return true;
  } catch (error) {
    log.error("[LocalVectorStore] Initialization failed:", error);
    return false;
  }
}

/**
 * Check if vector store is available
 */
export function isVectorStoreAvailable(): boolean {
  return sqliteVecLoaded && vecTablesCreated;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Store embeddings for a document
 */
export async function storeEmbeddings(
  options: StoreEmbeddingsOptions
): Promise<{ success: boolean; count: number; error?: string }> {
  const db = getRawDatabase();
  if (!db) {
    return { success: false, count: 0, error: "Database not available" };
  }

  if (!sqliteVecLoaded) {
    const loaded = await loadSqliteVec(db);
    if (!loaded) {
      return { success: false, count: 0, error: "sqlite-vec not available" };
    }
    await ensureVectorTables(db);
  }

  const { chatFileId, chunks, modelId } = options;

  try {
    // Delete existing embeddings for this file (if re-processing)
    db.prepare(`DELETE FROM document_embeddings WHERE chat_file_id = ?`).run(
      chatFileId
    );
    db.prepare(`DELETE FROM document_embeddings_vec WHERE id IN (SELECT id FROM document_embeddings WHERE chat_file_id = ?)`).run(
      chatFileId
    );

    // Prepare statements
    const insertEmbedding = db.prepare(`
      INSERT INTO document_embeddings (
        id, chat_file_id, chunk_index, chunk_text, page_number,
        start_char, end_char, token_count, embedding, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVec = db.prepare(`
      INSERT INTO document_embeddings_vec (id, embedding)
      VALUES (?, ?)
    `);

    // Use a transaction for atomicity
    const insertAll = db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const id = randomUUID();

        // Convert Float32Array to Buffer for storage
        const embeddingBuffer = Buffer.from(chunk.embedding.buffer);

        // Insert into main table
        insertEmbedding.run(
          id,
          chatFileId,
          i,
          chunk.text,
          chunk.pageNumber,
          chunk.startChar,
          chunk.endChar,
          chunk.tokenCount,
          embeddingBuffer,
          chunk.boundingBox ? JSON.stringify({ boundingBox: chunk.boundingBox }) : null
        );

        // Insert into vector table
        insertVec.run(id, embeddingBuffer);
      }
    });

    insertAll();

    // Update chat_files with vector status
    db.prepare(`
      UPDATE chat_files
      SET local_vector_status = 'completed',
          local_embedding_model = ?,
          chunk_count = ?
      WHERE id = ?
    `).run(modelId, chunks.length, chatFileId);

    log.info(
      `[LocalVectorStore] Stored ${chunks.length} embeddings for file ${chatFileId}`
    );

    return { success: true, count: chunks.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("[LocalVectorStore] Failed to store embeddings:", error);

    // Update status to failed
    try {
      db.prepare(`
        UPDATE chat_files
        SET local_vector_status = 'failed'
        WHERE id = ?
      `).run(chatFileId);
    } catch {}

    return { success: false, count: 0, error: errorMessage };
  }
}

/**
 * Search for similar chunks within a chat's documents
 */
export async function searchInChat(
  options: VectorSearchOptions
): Promise<VectorSearchResult[]> {
  const db = getRawDatabase();
  if (!db) {
    log.error("[LocalVectorStore] Database not available for search");
    return [];
  }

  if (!sqliteVecLoaded) {
    const loaded = await loadSqliteVec(db);
    if (!loaded) return [];
    await ensureVectorTables(db);
  }

  const { chatId, queryEmbedding, limit = 10, minScore = 0.3, fileIds } = options;

  try {
    // Convert query embedding to buffer
    const queryBuffer = Buffer.from(queryEmbedding.buffer);

    // Build the query
    // We use vec0's KNN search with distance metric
    // Lower distance = more similar
    let sql = `
      SELECT
        de.id,
        de.chat_file_id,
        de.chunk_index,
        de.chunk_text,
        de.page_number,
        de.start_char,
        de.end_char,
        de.metadata,
        cf.filename,
        vec_distance_cosine(dev.embedding, ?) AS distance
      FROM document_embeddings_vec dev
      JOIN document_embeddings de ON de.id = dev.id
      JOIN chat_files cf ON cf.id = de.chat_file_id
      WHERE cf.chat_id = ?
    `;

    const params: any[] = [queryBuffer, chatId];

    // Filter by file IDs if specified
    if (fileIds && fileIds.length > 0) {
      const placeholders = fileIds.map(() => "?").join(", ");
      sql += ` AND de.chat_file_id IN (${placeholders})`;
      params.push(...fileIds);
    }

    // Only include completed vectors
    sql += ` AND cf.local_vector_status = 'completed'`;

    // Order by distance (lower is better) and limit
    sql += ` ORDER BY distance ASC LIMIT ?`;
    params.push(limit);

    const results = db.prepare(sql).all(...params) as any[];

    // Convert to VectorSearchResult format
    const searchResults: VectorSearchResult[] = [];

    for (const row of results) {
      // Convert distance to similarity score (1 - distance for cosine)
      const score = 1 - (row.distance || 0);

      // Skip results below minimum score
      if (score < minScore) continue;

      // Parse metadata
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};

      searchResults.push({
        text: row.chunk_text,
        filename: row.filename,
        pageNumber: row.page_number,
        score,
        citation: formatCitation(row.filename, row.page_number),
        boundingBox: metadata.boundingBox,
        chatFileId: row.chat_file_id,
        chunkIndex: row.chunk_index,
      });
    }

    log.info(
      `[LocalVectorStore] Search returned ${searchResults.length} results for chat ${chatId}`
    );

    return searchResults;
  } catch (error) {
    log.error("[LocalVectorStore] Search failed:", error);
    return [];
  }
}

/**
 * Delete embeddings for a chat file
 */
export async function deleteEmbeddings(chatFileId: string): Promise<boolean> {
  const db = getRawDatabase();
  if (!db) return false;

  try {
    // Get IDs first for vec table deletion
    const ids = db
      .prepare(`SELECT id FROM document_embeddings WHERE chat_file_id = ?`)
      .all(chatFileId) as { id: string }[];

    // Delete from vec table
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(", ");
      db.prepare(
        `DELETE FROM document_embeddings_vec WHERE id IN (${placeholders})`
      ).run(...ids.map((r) => r.id));
    }

    // Delete from main table
    db.prepare(`DELETE FROM document_embeddings WHERE chat_file_id = ?`).run(
      chatFileId
    );

    // Update chat_files status
    db.prepare(`
      UPDATE chat_files
      SET local_vector_status = 'pending',
          chunk_count = 0
      WHERE id = ?
    `).run(chatFileId);

    log.info(`[LocalVectorStore] Deleted embeddings for file ${chatFileId}`);
    return true;
  } catch (error) {
    log.error("[LocalVectorStore] Failed to delete embeddings:", error);
    return false;
  }
}

/**
 * Get vector status for a chat file
 */
export function getVectorStatus(chatFileId: string): LocalVectorStatus | null {
  const db = getRawDatabase();
  if (!db) return null;

  try {
    const result = db
      .prepare(`SELECT local_vector_status FROM chat_files WHERE id = ?`)
      .get(chatFileId) as { local_vector_status: string } | undefined;

    return (result?.local_vector_status as LocalVectorStatus) || null;
  } catch {
    return null;
  }
}

/**
 * Get embedding count for a chat
 */
export function getEmbeddingCount(chatId: string): number {
  const db = getRawDatabase();
  if (!db) return 0;

  try {
    const result = db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM document_embeddings de
        JOIN chat_files cf ON cf.id = de.chat_file_id
        WHERE cf.chat_id = ?
      `
      )
      .get(chatId) as { count: number };

    return result.count;
  } catch {
    return 0;
  }
}

/**
 * Check if a chat has any local vectors
 */
export function chatHasVectors(chatId: string): boolean {
  return getEmbeddingCount(chatId) > 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a citation string
 */
function formatCitation(filename: string, pageNumber: number | null): string {
  const baseName = filename.replace(/\.[^.]+$/, "");
  if (pageNumber !== null) {
    return `[${baseName}, p. ${pageNumber}]`;
  }
  return `[${baseName}]`;
}
