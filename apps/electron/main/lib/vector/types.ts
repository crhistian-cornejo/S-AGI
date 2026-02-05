/**
 * Vector Search Types
 *
 * Type definitions for local vector storage and search functionality.
 */

import type { BoundingBox } from "../documents/document-processor";

// ============================================================================
// Document Chunking Types
// ============================================================================

/**
 * A chunk of document text with metadata for embeddings
 */
export interface DocumentChunk {
  /** The text content of this chunk */
  text: string;
  /** Page number in the source document (null for non-paginated docs) */
  pageNumber: number | null;
  /** Start character position in the original document */
  startChar: number;
  /** End character position in the original document */
  endChar: number;
  /** Estimated token count for this chunk */
  tokenCount: number;
  /** Optional bounding box for PDF highlighting */
  boundingBox?: BoundingBox;
}

/**
 * A chunk with its embedding vector
 */
export interface ChunkWithEmbedding extends DocumentChunk {
  /** The embedding vector (1536 dimensions for text-embedding-3-small) */
  embedding: Float32Array;
}

// ============================================================================
// Embedding Types
// ============================================================================

/**
 * Embedding model configuration
 */
export interface EmbeddingModelConfig {
  /** Model ID (e.g., "text-embedding-3-small") */
  modelId: string;
  /** Number of dimensions in the embedding vector */
  dimensions: number;
  /** Maximum tokens per request */
  maxTokens: number;
  /** Maximum batch size for embedding requests */
  maxBatchSize: number;
}

/**
 * Result from an embedding operation
 */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: Float32Array;
  /** Tokens used for this embedding */
  tokensUsed: number;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  /** Array of embeddings matching input order */
  embeddings: Float32Array[];
  /** Total tokens used */
  totalTokensUsed: number;
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Stored document embedding record
 */
export interface StoredEmbedding {
  /** Unique ID for this embedding */
  id: string;
  /** Reference to the chat_files record */
  chatFileId: string;
  /** Index of this chunk in the document */
  chunkIndex: number;
  /** The chunk text */
  chunkText: string;
  /** Page number (null if not applicable) */
  pageNumber: number | null;
  /** Start character position */
  startChar: number;
  /** End character position */
  endChar: number;
  /** Token count for this chunk */
  tokenCount: number;
  /** The embedding vector */
  embedding: Float32Array;
  /** Additional metadata as JSON */
  metadata: Record<string, unknown> | null;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Options for storing embeddings
 */
export interface StoreEmbeddingsOptions {
  /** The chat file ID these embeddings belong to */
  chatFileId: string;
  /** The chunks with their embeddings */
  chunks: ChunkWithEmbedding[];
  /** The embedding model used */
  modelId: string;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Options for vector search
 */
export interface VectorSearchOptions {
  /** Chat ID to search within */
  chatId: string;
  /** Query embedding vector */
  queryEmbedding: Float32Array;
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Filter by specific file IDs */
  fileIds?: string[];
}

/**
 * A single search result
 */
export interface VectorSearchResult {
  /** The matched text */
  text: string;
  /** Source filename */
  filename: string;
  /** Page number (null if not applicable) */
  pageNumber: number | null;
  /** Similarity score (0-1, higher is better) */
  score: number;
  /** Formatted citation string */
  citation: string;
  /** Bounding box for PDF highlighting */
  boundingBox?: BoundingBox;
  /** Page dimensions for coordinate conversion */
  pageWidth?: number;
  pageHeight?: number;
  /** The chat file ID */
  chatFileId: string;
  /** Chunk index for deduplication */
  chunkIndex: number;
}

/**
 * Search results with metadata
 */
export interface VectorSearchResponse {
  /** Array of search results */
  results: VectorSearchResult[];
  /** Total documents searched */
  documentsSearched: number;
  /** Total chunks searched */
  chunksSearched: number;
  /** Time taken in milliseconds */
  searchTimeMs: number;
}

// ============================================================================
// Processing Status Types
// ============================================================================

/**
 * Local vector processing status for chat files
 */
export type LocalVectorStatus =
  | "pending"      // Not yet processed
  | "processing"   // Currently being processed
  | "completed"    // Successfully indexed
  | "failed"       // Processing failed
  | "not_required" // File type doesn't need vector indexing

/**
 * Vector processing result
 */
export interface VectorProcessingResult {
  /** Whether processing was successful */
  success: boolean;
  /** Number of chunks created */
  chunkCount: number;
  /** Total tokens used for embeddings */
  tokensUsed: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  /** Target size for each chunk in tokens (default: 500) */
  targetTokens: number;
  /** Maximum tokens per chunk (default: 1000) */
  maxTokens: number;
  /** Overlap between chunks as percentage (default: 0.2 = 20%) */
  overlapRatio: number;
  /** Preserve sentence boundaries (default: true) */
  preserveSentences: boolean;
  /** Preserve paragraph boundaries (default: true) */
  preserveParagraphs: boolean;
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  targetTokens: 500,
  maxTokens: 1000,
  overlapRatio: 0.2,
  preserveSentences: true,
  preserveParagraphs: true,
};

/**
 * Default embedding model configuration for OpenAI text-embedding-3-small
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingModelConfig = {
  modelId: "text-embedding-3-small",
  dimensions: 1536,
  maxTokens: 8191,
  maxBatchSize: 2048,
};
