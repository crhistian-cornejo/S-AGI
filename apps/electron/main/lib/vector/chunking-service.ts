/**
 * Chunking Service
 *
 * Splits documents into chunks suitable for embedding.
 * Implements page-aware chunking that preserves document structure.
 */

import log from "electron-log";
import type { PageContent } from "../documents/document-processor";
import type { DocumentChunk, ChunkingConfig } from "./types";
import { DEFAULT_CHUNKING_CONFIG } from "./types";

// ============================================================================
// Chunking Service
// ============================================================================

export class ChunkingService {
  private config: ChunkingConfig;

  constructor(config: Partial<ChunkingConfig> = {}) {
    this.config = { ...DEFAULT_CHUNKING_CONFIG, ...config };
  }

  /**
   * Chunk a document with page information
   */
  chunkDocument(pages: PageContent[]): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let globalCharOffset = 0;

    for (const page of pages) {
      const pageChunks = this.chunkPage(page, globalCharOffset);
      chunks.push(...pageChunks);

      // Track global character offset across pages
      globalCharOffset += page.content.length + 1; // +1 for newline between pages
    }

    log.info(
      `[ChunkingService] Created ${chunks.length} chunks from ${pages.length} pages`
    );

    return chunks;
  }

  /**
   * Chunk plain text without page information
   */
  chunkText(text: string): DocumentChunk[] {
    const page: PageContent = {
      pageNumber: 1,
      content: text,
      wordCount: text.split(/\s+/).filter((w) => w.length > 0).length,
    };

    return this.chunkPage(page, 0);
  }

  /**
   * Chunk a single page of content
   */
  private chunkPage(page: PageContent, globalOffset: number): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const content = page.content.trim();

    if (!content) return chunks;

    // Split into paragraphs first if preserving paragraph boundaries
    const segments = this.config.preserveParagraphs
      ? this.splitIntoParagraphs(content)
      : [content];

    let charPosition = 0;

    for (const segment of segments) {
      const segmentChunks = this.chunkSegment(
        segment,
        page.pageNumber,
        globalOffset + charPosition
      );
      chunks.push(...segmentChunks);
      charPosition += segment.length + 2; // +2 for paragraph separator
    }

    return chunks;
  }

  /**
   * Chunk a text segment (paragraph or full page)
   */
  private chunkSegment(
    text: string,
    pageNumber: number,
    startOffset: number
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const tokens = this.estimateTokens(text);

    // If segment fits in one chunk, return as-is
    if (tokens <= this.config.targetTokens) {
      chunks.push({
        text: text.trim(),
        pageNumber,
        startChar: startOffset,
        endChar: startOffset + text.length,
        tokenCount: tokens,
      });
      return chunks;
    }

    // Split into sentences for better boundary handling
    const sentences = this.config.preserveSentences
      ? this.splitIntoSentences(text)
      : [text];

    let currentChunk: string[] = [];
    let currentTokens = 0;
    let chunkStartChar = startOffset;
    let currentCharPos = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceTokens = this.estimateTokens(sentence);

      // If single sentence exceeds max, split it
      if (sentenceTokens > this.config.maxTokens) {
        // Flush current chunk first
        if (currentChunk.length > 0) {
          const chunkText = currentChunk.join(" ").trim();
          chunks.push({
            text: chunkText,
            pageNumber,
            startChar: chunkStartChar,
            endChar: chunkStartChar + chunkText.length,
            tokenCount: currentTokens,
          });

          // Apply overlap
          const overlap = this.calculateOverlap(currentChunk);
          currentChunk = overlap.sentences;
          currentTokens = overlap.tokens;
          chunkStartChar = currentCharPos - overlap.chars;
        }

        // Split long sentence by character count
        const longChunks = this.splitLongText(
          sentence,
          pageNumber,
          startOffset + currentCharPos
        );
        chunks.push(...longChunks);
        currentCharPos += sentence.length + 1;
        continue;
      }

      // Check if adding this sentence exceeds target
      if (currentTokens + sentenceTokens > this.config.targetTokens) {
        // Flush current chunk
        if (currentChunk.length > 0) {
          const chunkText = currentChunk.join(" ").trim();
          chunks.push({
            text: chunkText,
            pageNumber,
            startChar: chunkStartChar,
            endChar: chunkStartChar + chunkText.length,
            tokenCount: currentTokens,
          });

          // Apply overlap
          const overlap = this.calculateOverlap(currentChunk);
          currentChunk = overlap.sentences;
          currentTokens = overlap.tokens;
          chunkStartChar = currentCharPos - overlap.chars;
        }
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
      currentCharPos += sentence.length + 1; // +1 for space
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(" ").trim();
      chunks.push({
        text: chunkText,
        pageNumber,
        startChar: chunkStartChar,
        endChar: chunkStartChar + chunkText.length,
        tokenCount: currentTokens,
      });
    }

    return chunks;
  }

  /**
   * Split long text that exceeds max tokens
   */
  private splitLongText(
    text: string,
    pageNumber: number,
    startOffset: number
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const maxChars = this.config.maxTokens * 4; // ~4 chars per token
    const overlapChars = Math.floor(maxChars * this.config.overlapRatio);

    let position = 0;
    while (position < text.length) {
      const end = Math.min(position + maxChars, text.length);
      const chunkText = text.slice(position, end).trim();

      if (chunkText) {
        chunks.push({
          text: chunkText,
          pageNumber,
          startChar: startOffset + position,
          endChar: startOffset + end,
          tokenCount: this.estimateTokens(chunkText),
        });
      }

      // Move position forward with overlap
      position = end - overlapChars;
      if (position <= 0 || end >= text.length) break;
    }

    return chunks;
  }

  /**
   * Calculate overlap for the next chunk
   */
  private calculateOverlap(sentences: string[]): {
    sentences: string[];
    tokens: number;
    chars: number;
  } {
    if (sentences.length === 0 || this.config.overlapRatio === 0) {
      return { sentences: [], tokens: 0, chars: 0 };
    }

    const totalTokens = sentences.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );
    const targetOverlapTokens = Math.floor(
      totalTokens * this.config.overlapRatio
    );

    const overlapSentences: string[] = [];
    let overlapTokens = 0;
    let overlapChars = 0;

    // Take sentences from the end
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentenceTokens = this.estimateTokens(sentences[i]);
      if (overlapTokens + sentenceTokens > targetOverlapTokens) break;

      overlapSentences.unshift(sentences[i]);
      overlapTokens += sentenceTokens;
      overlapChars += sentences[i].length + 1;
    }

    return { sentences: overlapSentences, tokens: overlapTokens, chars: overlapChars };
  }

  /**
   * Split text into paragraphs
   */
  private splitIntoParagraphs(text: string): string[] {
    // Split on double newlines or more
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Handle common sentence endings while preserving abbreviations
    const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z\u00C0-\u00DC])/g;
    const sentences = text
      .split(sentenceRegex)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // If no sentences found, return the whole text
    return sentences.length > 0 ? sentences : [text];
  }

  /**
   * Estimate token count for a text
   * Uses a simple approximation of ~4 characters per token
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get the configuration
   */
  getConfig(): ChunkingConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let chunkingService: ChunkingService | null = null;

/**
 * Get the singleton chunking service instance
 */
export function getChunkingService(): ChunkingService {
  if (!chunkingService) {
    chunkingService = new ChunkingService();
  }
  return chunkingService;
}
