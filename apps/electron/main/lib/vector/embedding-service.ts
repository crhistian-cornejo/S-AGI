/**
 * Embedding Service
 *
 * Generates embeddings using OpenAI's text-embedding-3-small model.
 * Supports single text and batch embedding operations.
 */

import OpenAI from "openai";
import log from "electron-log";
import { getCredentialManager } from "../shared/credentials";
import type {
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingModelConfig,
} from "./types";
import { DEFAULT_EMBEDDING_CONFIG } from "./types";

// ============================================================================
// Service Configuration
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ============================================================================
// Embedding Service
// ============================================================================

export class EmbeddingService {
  private openai: OpenAI | null = null;
  private config: EmbeddingModelConfig;

  constructor(config: Partial<EmbeddingModelConfig> = {}) {
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
  }

  /**
   * Initialize the OpenAI client lazily
   */
  private async getClient(): Promise<OpenAI> {
    if (this.openai) return this.openai;

    const credentialManager = getCredentialManager();
    const apiKey = await credentialManager.getOpenAIKey();

    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    this.openai = new OpenAI({ apiKey });
    return this.openai;
  }

  /**
   * Generate an embedding for a single text
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const client = await this.getClient();
    const startTime = Date.now();

    // Truncate if too long
    const truncatedText = this.truncateToTokenLimit(text);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await client.embeddings.create({
          model: this.config.modelId,
          input: truncatedText,
          encoding_format: "float",
        });

        const embedding = new Float32Array(response.data[0].embedding);
        const tokensUsed = response.usage?.total_tokens ?? 0;

        log.debug(
          `[EmbeddingService] Generated embedding in ${Date.now() - startTime}ms, ${tokensUsed} tokens`
        );

        return { embedding, tokensUsed };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRetryable = this.isRetryableError(error);

        if (isRetryable && attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
          log.warn(
            `[EmbeddingService] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms:`,
            lastError.message
          );
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    log.error("[EmbeddingService] Failed to generate embedding:", lastError);
    throw lastError;
  }

  /**
   * Generate embeddings for multiple texts in a batch
   * Automatically handles batching to stay within API limits
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokensUsed: 0 };
    }

    const client = await this.getClient();
    const startTime = Date.now();

    // Truncate all texts
    const truncatedTexts = texts.map((t) => this.truncateToTokenLimit(t));

    // Split into batches based on max batch size
    const batches: string[][] = [];
    for (let i = 0; i < truncatedTexts.length; i += this.config.maxBatchSize) {
      batches.push(truncatedTexts.slice(i, i + this.config.maxBatchSize));
    }

    const allEmbeddings: Float32Array[] = [];
    let totalTokensUsed = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await client.embeddings.create({
            model: this.config.modelId,
            input: batch,
            encoding_format: "float",
          });

          // Sort by index to ensure correct order
          const sortedData = response.data.sort((a, b) => a.index - b.index);

          for (const item of sortedData) {
            allEmbeddings.push(new Float32Array(item.embedding));
          }

          totalTokensUsed += response.usage?.total_tokens ?? 0;

          log.debug(
            `[EmbeddingService] Batch ${batchIndex + 1}/${batches.length} completed, ${batch.length} embeddings`
          );
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const isRetryable = this.isRetryableError(error);

          if (isRetryable && attempt < MAX_RETRIES - 1) {
            const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
            log.warn(
              `[EmbeddingService] Batch ${batchIndex + 1} retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms:`,
              lastError.message
            );
            await this.sleep(delay);
          } else {
            throw lastError;
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    log.info(
      `[EmbeddingService] Generated ${allEmbeddings.length} embeddings in ${duration}ms, ${totalTokensUsed} tokens`
    );

    return { embeddings: allEmbeddings, totalTokensUsed };
  }

  /**
   * Estimate token count for a text (rough approximation)
   * OpenAI uses ~4 chars per token on average for English text
   */
  estimateTokens(text: string): number {
    // Simple approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get the embedding model configuration
   */
  getConfig(): EmbeddingModelConfig {
    return { ...this.config };
  }

  /**
   * Check if the service is configured and ready
   */
  async isAvailable(): Promise<boolean> {
    try {
      const credentialManager = getCredentialManager();
      const apiKey = await credentialManager.getOpenAIKey();
      return !!apiKey;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Truncate text to stay within token limits
   */
  private truncateToTokenLimit(text: string): string {
    const estimatedTokens = this.estimateTokens(text);
    if (estimatedTokens <= this.config.maxTokens) {
      return text;
    }

    // Truncate to approximately maxTokens (with some buffer)
    const maxChars = (this.config.maxTokens - 100) * 4;
    return text.slice(0, maxChars);
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    const status = (error as any)?.status;
    const code = (error as any)?.code;

    // Rate limit
    if (status === 429) return true;

    // Server errors
    if (typeof status === "number" && status >= 500 && status < 600) {
      return true;
    }

    // Network errors
    const networkCodes = [
      "ETIMEDOUT",
      "ECONNRESET",
      "EPIPE",
      "ENOTFOUND",
      "ECONNREFUSED",
    ];
    if (networkCodes.includes(code)) return true;

    return false;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let embeddingService: EmbeddingService | null = null;

/**
 * Get the singleton embedding service instance
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}
