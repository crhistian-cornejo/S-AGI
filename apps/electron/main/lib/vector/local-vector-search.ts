/**
 * Local Vector Search
 *
 * High-level API for document vector search.
 * Combines chunking, embedding, and search functionality.
 */

import log from "electron-log";
import { getEmbeddingService } from "./embedding-service";
import { getChunkingService } from "./chunking-service";
import {
  initVectorStore,
  isVectorStoreAvailable,
  storeEmbeddings,
  searchInChat,
  deleteEmbeddings,
  chatHasVectors,
  getEmbeddingCount,
} from "./local-vector-store";
import type { PageContent } from "../documents/document-processor";
import type {
  VectorSearchResult,
  VectorSearchResponse,
  VectorProcessingResult,
  ChunkWithEmbedding,
} from "./types";

// ============================================================================
// Local Vector Search Service
// ============================================================================

export class LocalVectorSearch {
  private initialized = false;

  /**
   * Initialize the vector search system
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      const vectorStoreReady = await initVectorStore();
      if (!vectorStoreReady) {
        log.error("[LocalVectorSearch] Vector store initialization failed");
        return false;
      }

      this.initialized = true;
      log.info("[LocalVectorSearch] Initialized successfully");
      return true;
    } catch (error) {
      log.error("[LocalVectorSearch] Initialization failed:", error);
      return false;
    }
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.initialized && isVectorStoreAvailable();
  }

  /**
   * Process a document and create embeddings
   */
  async processDocument(
    chatFileId: string,
    pages: PageContent[]
  ): Promise<VectorProcessingResult> {
    const startTime = Date.now();

    try {
      if (!this.isReady()) {
        const ready = await this.initialize();
        if (!ready) {
          return {
            success: false,
            chunkCount: 0,
            tokensUsed: 0,
            processingTimeMs: Date.now() - startTime,
            error: "Vector search system not available",
          };
        }
      }

      // Check if embedding service is available
      const embeddingService = getEmbeddingService();
      const isAvailable = await embeddingService.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          chunkCount: 0,
          tokensUsed: 0,
          processingTimeMs: Date.now() - startTime,
          error: "OpenAI API key not configured",
        };
      }

      // Step 1: Chunk the document
      log.info(`[LocalVectorSearch] Chunking document ${chatFileId}...`);
      const chunkingService = getChunkingService();
      const chunks = chunkingService.chunkDocument(pages);

      if (chunks.length === 0) {
        return {
          success: false,
          chunkCount: 0,
          tokensUsed: 0,
          processingTimeMs: Date.now() - startTime,
          error: "No content to process",
        };
      }

      log.info(`[LocalVectorSearch] Created ${chunks.length} chunks`);

      // Step 2: Generate embeddings
      log.info(`[LocalVectorSearch] Generating embeddings...`);
      const texts = chunks.map((c) => c.text);
      const embeddingResult = await embeddingService.embedBatch(texts);

      // Step 3: Combine chunks with embeddings
      const chunksWithEmbeddings: ChunkWithEmbedding[] = chunks.map(
        (chunk, i) => ({
          ...chunk,
          embedding: embeddingResult.embeddings[i],
        })
      );

      // Step 4: Store in vector database
      log.info(`[LocalVectorSearch] Storing embeddings...`);
      const storeResult = await storeEmbeddings({
        chatFileId,
        chunks: chunksWithEmbeddings,
        modelId: embeddingService.getConfig().modelId,
      });

      if (!storeResult.success) {
        return {
          success: false,
          chunkCount: 0,
          tokensUsed: embeddingResult.totalTokensUsed,
          processingTimeMs: Date.now() - startTime,
          error: storeResult.error,
        };
      }

      const processingTimeMs = Date.now() - startTime;
      log.info(
        `[LocalVectorSearch] Document processed: ${chunks.length} chunks, ${embeddingResult.totalTokensUsed} tokens, ${processingTimeMs}ms`
      );

      return {
        success: true,
        chunkCount: chunks.length,
        tokensUsed: embeddingResult.totalTokensUsed,
        processingTimeMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.error("[LocalVectorSearch] Document processing failed:", error);

      return {
        success: false,
        chunkCount: 0,
        tokensUsed: 0,
        processingTimeMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Search for relevant content across a chat's documents
   */
  async search(
    chatId: string,
    query: string,
    options: {
      limit?: number;
      minScore?: number;
      fileIds?: string[];
    } = {}
  ): Promise<VectorSearchResponse> {
    const startTime = Date.now();
    const { limit = 10, minScore = 0.3, fileIds } = options;

    try {
      if (!this.isReady()) {
        const ready = await this.initialize();
        if (!ready) {
          return {
            results: [],
            documentsSearched: 0,
            chunksSearched: 0,
            searchTimeMs: Date.now() - startTime,
          };
        }
      }

      // Check if chat has any vectors
      if (!chatHasVectors(chatId)) {
        log.debug(`[LocalVectorSearch] Chat ${chatId} has no vectors`);
        return {
          results: [],
          documentsSearched: 0,
          chunksSearched: 0,
          searchTimeMs: Date.now() - startTime,
        };
      }

      // Generate query embedding
      const embeddingService = getEmbeddingService();
      const { embedding: queryEmbedding } = await embeddingService.embed(query);

      // Search
      const results = await searchInChat({
        chatId,
        queryEmbedding,
        limit,
        minScore,
        fileIds,
      });

      // Deduplicate by page (keep highest scoring result per page per document)
      const deduplicatedResults = this.deduplicateByPage(results);

      const searchTimeMs = Date.now() - startTime;
      const chunksSearched = getEmbeddingCount(chatId);

      log.info(
        `[LocalVectorSearch] Search completed: ${deduplicatedResults.length} results, ${searchTimeMs}ms`
      );

      return {
        results: deduplicatedResults,
        documentsSearched: new Set(results.map((r) => r.chatFileId)).size,
        chunksSearched,
        searchTimeMs,
      };
    } catch (error) {
      log.error("[LocalVectorSearch] Search failed:", error);
      return {
        results: [],
        documentsSearched: 0,
        chunksSearched: 0,
        searchTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Delete vectors for a document
   */
  async deleteDocument(chatFileId: string): Promise<boolean> {
    try {
      return await deleteEmbeddings(chatFileId);
    } catch (error) {
      log.error("[LocalVectorSearch] Delete failed:", error);
      return false;
    }
  }

  /**
   * Check if a chat has vector search available
   */
  chatHasSearch(chatId: string): boolean {
    return chatHasVectors(chatId);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Deduplicate results by page - keep only the highest scoring result per page
   */
  private deduplicateByPage(results: VectorSearchResult[]): VectorSearchResult[] {
    const pageMap = new Map<string, VectorSearchResult>();

    for (const result of results) {
      // Create a unique key for each page in each document
      const pageKey = `${result.chatFileId}:${result.pageNumber ?? "null"}`;

      const existing = pageMap.get(pageKey);
      if (!existing || result.score > existing.score) {
        pageMap.set(pageKey, result);
      }
    }

    // Sort by score descending
    return Array.from(pageMap.values()).sort((a, b) => b.score - a.score);
  }
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build document context for AI prompts from vector search results
 */
export function buildDocumentContextFromResults(
  results: VectorSearchResult[],
  documentNames: string[]
): string {
  if (results.length === 0) return "";

  const header = `
================================================================================
DOCUMENT CONTEXT - UPLOADED FILES
================================================================================

The user has uploaded ${documentNames.length} document(s) to this conversation:
${documentNames.map((n) => `- ${n}`).join("\n")}

The following excerpts are RELEVANT to the user's query (with citations):

`;

  const citations = results
    .map((r, i) => {
      const citationNum = i + 1;
      return `[${citationNum}] ${r.citation}:
>>> "${r.text}"
`;
    })
    .join("\n");

  const footer = `
================================================================================

CRITICAL: CITATION INSTRUCTIONS (YOU MUST FOLLOW THESE EXACTLY)

YOU MUST use numeric citations [1], [2], [3] in your response like academic papers.

RULES:
1. EVERY fact from documents MUST have a citation number immediately after it
2. Use [1], [2], [3] etc. matching the numbered excerpts above
3. Place citations INLINE after each claim: "El proyecto tiene 2 etapas [1]"
4. Multiple sources for same fact: "La inversión fue de $1M [1][3]"
5. DO NOT write any information without a citation number
6. If not found: "No encontré esta información en los documentos."

CORRECT FORMAT EXAMPLE:
"El servicio consiste en revisar costos [1] y elaborar la Cuarta Modificación [2]. El plazo total es de 6 meses [3], dividido en dos etapas [1][2]."

Remember: EVERY piece of information needs [N] citation.
================================================================================
`;

  return header + citations + footer;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let localVectorSearch: LocalVectorSearch | null = null;

/**
 * Get the singleton LocalVectorSearch instance
 */
export function getLocalVectorSearch(): LocalVectorSearch {
  if (!localVectorSearch) {
    localVectorSearch = new LocalVectorSearch();
  }
  return localVectorSearch;
}
