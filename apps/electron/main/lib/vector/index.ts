/**
 * Vector Search Module
 *
 * Local vector storage and semantic search for PDF documents.
 * Uses sqlite-vec for efficient KNN search and OpenAI embeddings.
 */

// Types
export type {
  DocumentChunk,
  ChunkWithEmbedding,
  EmbeddingModelConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  StoredEmbedding,
  StoreEmbeddingsOptions,
  VectorSearchOptions,
  VectorSearchResult,
  VectorSearchResponse,
  LocalVectorStatus,
  VectorProcessingResult,
  ChunkingConfig,
} from "./types";

export {
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_EMBEDDING_CONFIG,
} from "./types";

// Embedding Service
export {
  EmbeddingService,
  getEmbeddingService,
} from "./embedding-service";

// Chunking Service
export {
  ChunkingService,
  getChunkingService,
} from "./chunking-service";

// Local Vector Store
export {
  initVectorStore,
  isVectorStoreAvailable,
  storeEmbeddings,
  searchInChat,
  deleteEmbeddings,
  getVectorStatus,
  getEmbeddingCount,
  chatHasVectors,
} from "./local-vector-store";

// Local Vector Search (high-level API)
export {
  LocalVectorSearch,
  getLocalVectorSearch,
  buildDocumentContextFromResults,
} from "./local-vector-search";
