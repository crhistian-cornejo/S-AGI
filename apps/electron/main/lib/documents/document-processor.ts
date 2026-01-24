/**
 * Document Processing Service
 *
 * Adapted from Midday's document processing pipeline for Electron
 * - PDF text extraction using LibPDF (with bounding box positions)
 * - Text file processing
 * - Document classification metadata
 */

import log from "electron-log";
import {
  extractTextWithPositions,
  type TextWithPosition,
  type BoundingBox,
} from "../pdf/pdf-service";

// Re-export position types for consumers
export type { TextWithPosition, BoundingBox };

// ============================================================================
// Configuration
// ============================================================================

const MAX_TEXT_LENGTH = 50_000; // Limit text length for very large documents

// Processing status enum matching Midday
export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

// Supported document types
export const SUPPORTED_DOCUMENT_TYPES = {
  pdf: ["application/pdf", "application/x-pdf"],
  text: ["text/plain", "text/markdown", "text/csv", "text/html", "text/css"],
  code: [
    "text/javascript",
    "application/json",
    "application/typescript",
    "text/x-python",
    "text/x-java",
    "text/x-c",
    "text/x-c++",
    "text/x-csharp",
    "text/x-golang",
    "text/x-ruby",
    "text/x-php",
    "application/x-sh",
    "text/x-tex",
  ],
  office: [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
} as const;

// ============================================================================
// Document Processing Result Types
// ============================================================================

export interface DocumentMetadata {
  title?: string;
  summary?: string;
  pageCount?: number;
  wordCount?: number;
  language?: string;
  extractedAt: string;
}

export interface PageContent {
  pageNumber: number;
  content: string;
  wordCount: number;
  /** Page dimensions */
  width?: number;
  height?: number;
  /** Text lines with bounding box positions for highlighting */
  lines?: TextWithPosition[];
}

export interface ProcessedDocument {
  success: boolean;
  content: string | null;
  /** Individual page contents for citation support */
  pages?: PageContent[];
  metadata: DocumentMetadata;
  processingStatus: ProcessingStatus;
  error?: string;
}

export interface CitedChunk {
  text: string;
  pageNumber: number;
  startIndex: number;
  endIndex: number;
  /** Bounding box for precise highlighting in PDF viewer */
  boundingBox?: BoundingBox;
  /** Page dimensions for coordinate conversion */
  pageWidth?: number;
  pageHeight?: number;
}

// ============================================================================
// PDF Processing
// ============================================================================

/**
 * Extract text from PDF buffer using LibPDF (merged)
 */
export async function extractTextFromPdf(
  pdfBuffer: Buffer,
): Promise<string | null> {
  const result = await extractTextFromPdfWithPages(pdfBuffer);
  return result?.mergedContent || null;
}

/**
 * Extract text from PDF with page-by-page content for citations
 * Uses LibPDF for extraction with bounding box positions
 */
export async function extractTextFromPdfWithPages(pdfBuffer: Buffer): Promise<{
  mergedContent: string;
  pages: PageContent[];
  pageCount: number;
} | null> {
  try {
    log.info("[DocumentProcessor] Starting PDF text extraction with LibPDF...");

    // Convert Buffer to Uint8Array for LibPDF
    const uint8Array = new Uint8Array(pdfBuffer);

    // Extract text with positions using LibPDF
    const libpdfPages = await extractTextWithPositions(uint8Array);

    if (!libpdfPages || libpdfPages.length === 0) {
      log.warn("[DocumentProcessor] PDF appears to be image-based or empty");
      return null;
    }

    const pageCount = libpdfPages.length;
    log.info(`[DocumentProcessor] PDF loaded, pages: ${pageCount}`);

    // Build page content array with citations and positions
    const pages: PageContent[] = [];
    const contentParts: string[] = [];

    for (const libpdfPage of libpdfPages) {
      const pageText = libpdfPage.content.trim();
      if (pageText) {
        pages.push({
          pageNumber: libpdfPage.pageNumber,
          content: pageText,
          wordCount: libpdfPage.wordCount,
          width: libpdfPage.width,
          height: libpdfPage.height,
          lines: libpdfPage.lines,
        });
        // Add page marker for citation tracking
        contentParts.push(`[Page ${libpdfPage.pageNumber}]\n${pageText}`);
      }
    }

    if (pages.length === 0) {
      log.warn("[DocumentProcessor] No text content found in PDF pages");
      return null;
    }

    // Merge all content with page markers
    let mergedContent = contentParts.join("\n\n");

    // Limit total text length
    if (mergedContent.length > MAX_TEXT_LENGTH) {
      log.info(
        `[DocumentProcessor] Truncating text from ${mergedContent.length} to ${MAX_TEXT_LENGTH} chars`,
      );
      mergedContent = mergedContent.substring(0, MAX_TEXT_LENGTH);
    }

    log.info(
      `[DocumentProcessor] Extracted ${mergedContent.length} chars from ${pages.length} pages with position data`,
    );

    return {
      mergedContent,
      pages,
      pageCount,
    };
  } catch (error) {
    log.error("[DocumentProcessor] PDF extraction failed:", error);
    return null;
  }
}

/**
 * Extract text from PDF URL (downloads first)
 */
export async function extractTextFromPdfUrl(
  pdfUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return extractTextFromPdf(Buffer.from(arrayBuffer));
  } catch (error) {
    log.error("[DocumentProcessor] Failed to download PDF:", error);
    return null;
  }
}

// ============================================================================
// Text File Processing
// ============================================================================

/**
 * Extract text from plain text files
 */
export function extractTextFromBuffer(
  buffer: Buffer,
  encoding: BufferEncoding = "utf-8",
): string | null {
  try {
    let text = buffer.toString(encoding);

    // Clean up the text
    text = text.trim();

    // Limit length
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.substring(0, MAX_TEXT_LENGTH);
    }

    return text || null;
  } catch (error) {
    log.error("[DocumentProcessor] Text extraction failed:", error);
    return null;
  }
}

// ============================================================================
// Document Metadata Extraction
// ============================================================================

/**
 * Calculate word count from text
 */
export function calculateWordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Detect language from text (basic heuristic)
 */
export function detectLanguage(text: string): string {
  // Simple heuristic based on common words
  const spanishWords = [
    "el",
    "la",
    "de",
    "que",
    "en",
    "un",
    "es",
    "por",
    "con",
    "para",
  ];
  const englishWords = [
    "the",
    "a",
    "is",
    "to",
    "of",
    "and",
    "in",
    "that",
    "it",
    "for",
  ];

  const words = text.toLowerCase().split(/\s+/);
  const sample = words.slice(0, 200);

  let spanishCount = 0;
  let englishCount = 0;

  for (const word of sample) {
    if (spanishWords.includes(word)) spanishCount++;
    if (englishWords.includes(word)) englishCount++;
  }

  if (spanishCount > englishCount) return "es";
  if (englishCount > spanishCount) return "en";
  return "unknown";
}

/**
 * Generate a title from filename
 */
export function generateTitleFromFilename(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");

  // Replace separators with spaces
  const withSpaces = nameWithoutExt.replace(/[-_]/g, " ");

  // Capitalize first letter of each word
  return withSpaces
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Generate a summary from text (first ~200 words)
 */
export function generateSummary(text: string, maxWords: number = 200): string {
  const words = text.split(/\s+/);
  const summaryWords = words.slice(0, maxWords);

  let summary = summaryWords.join(" ");
  if (words.length > maxWords) {
    summary += "...";
  }

  return summary;
}

// ============================================================================
// Main Document Processor
// ============================================================================

/**
 * Process a document and extract content + metadata
 */
export async function processDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ProcessedDocument> {
  const startTime = Date.now();
  log.info(`[DocumentProcessor] Processing: ${filename} (${mimeType})`);

  try {
    let content: string | null = null;
    let pages: PageContent[] | undefined = undefined;

    // PDF processing with page extraction
    if (SUPPORTED_DOCUMENT_TYPES.pdf.includes(mimeType as any)) {
      const pdfResult = await extractTextFromPdfWithPages(buffer);
      if (pdfResult) {
        content = pdfResult.mergedContent;
        pages = pdfResult.pages;
      }
    }
    // Text-based files
    else if (
      SUPPORTED_DOCUMENT_TYPES.text.includes(mimeType as any) ||
      SUPPORTED_DOCUMENT_TYPES.code.includes(mimeType as any)
    ) {
      content = extractTextFromBuffer(buffer);
      // Single "page" for text files
      if (content) {
        pages = [
          {
            pageNumber: 1,
            content,
            wordCount: calculateWordCount(content),
          },
        ];
      }
    }
    // Office documents - not supported for text extraction yet
    else if (SUPPORTED_DOCUMENT_TYPES.office.includes(mimeType as any)) {
      log.info(
        "[DocumentProcessor] Office document - text extraction not implemented",
      );
      content = null;
    }
    // Unknown type
    else {
      log.warn(`[DocumentProcessor] Unsupported document type: ${mimeType}`);
    }

    // Generate metadata
    const metadata: DocumentMetadata = {
      title: generateTitleFromFilename(filename),
      extractedAt: new Date().toISOString(),
    };

    if (content) {
      metadata.wordCount = calculateWordCount(content);
      metadata.language = detectLanguage(content);
      metadata.summary = generateSummary(content);
      metadata.pageCount = pages?.length || 1;
    }

    const duration = Date.now() - startTime;
    log.info(
      `[DocumentProcessor] Completed in ${duration}ms, extracted ${content?.length || 0} chars from ${pages?.length || 0} pages`,
    );

    return {
      success: !!content,
      content,
      pages,
      metadata,
      processingStatus: content ? "completed" : "failed",
      error: content ? undefined : "Could not extract text from document",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    log.error("[DocumentProcessor] Processing failed:", error);

    return {
      success: false,
      content: null,
      metadata: {
        title: generateTitleFromFilename(filename),
        extractedAt: new Date().toISOString(),
      },
      processingStatus: "failed",
      error: errorMessage,
    };
  }
}

/**
 * Check if a MIME type is a processable document
 */
export function isProcessableDocument(mimeType: string): boolean {
  const allTypes = [
    ...SUPPORTED_DOCUMENT_TYPES.pdf,
    ...SUPPORTED_DOCUMENT_TYPES.text,
    ...SUPPORTED_DOCUMENT_TYPES.code,
  ];
  return allTypes.includes(mimeType as any);
}

/**
 * Check if a file extension is a processable document
 */
export function isProcessableExtension(extension: string): boolean {
  const ext = extension.toLowerCase().replace(".", "");
  const processableExtensions = [
    "pdf",
    "txt",
    "md",
    "csv",
    "html",
    "css",
    "js",
    "ts",
    "tsx",
    "jsx",
    "json",
    "py",
    "java",
    "c",
    "cpp",
    "cs",
    "go",
    "rb",
    "php",
    "sh",
    "tex",
  ];
  return processableExtensions.includes(ext);
}

// ============================================================================
// Citation Utilities
// ============================================================================

/**
 * Find which page a text snippet comes from
 */
export function findPageForText(
  text: string,
  pages: PageContent[],
): number | null {
  const normalizedSearch = text.toLowerCase().trim();

  for (const page of pages) {
    if (page.content.toLowerCase().includes(normalizedSearch)) {
      return page.pageNumber;
    }
  }

  return null;
}

/**
 * Extract a citation with page reference and bounding box
 */
export function extractCitation(
  searchText: string,
  pages: PageContent[],
  contextChars: number = 100,
): CitedChunk | null {
  const normalizedSearch = searchText.toLowerCase().trim();

  for (const page of pages) {
    const lowerContent = page.content.toLowerCase();
    const index = lowerContent.indexOf(normalizedSearch);

    if (index !== -1) {
      // Get surrounding context
      const startIndex = Math.max(0, index - contextChars);
      const endIndex = Math.min(
        page.content.length,
        index + searchText.length + contextChars,
      );

      let text = page.content.substring(startIndex, endIndex);

      // Add ellipsis if truncated
      if (startIndex > 0) text = "..." + text;
      if (endIndex < page.content.length) text = text + "...";

      // Find bounding box from lines if available
      let boundingBox: BoundingBox | undefined;
      if (page.lines) {
        // Find which line contains the match
        let charCount = 0;
        for (const line of page.lines) {
          const lineEnd = charCount + line.text.length + 1;
          if (index >= charCount && index < lineEnd) {
            boundingBox = line.boundingBox;
            break;
          }
          charCount = lineEnd;
        }
      }

      return {
        text,
        pageNumber: page.pageNumber,
        startIndex: index,
        endIndex: index + searchText.length,
        boundingBox,
        pageWidth: page.width,
        pageHeight: page.height,
      };
    }
  }

  return null;
}

/**
 * Format a citation reference
 */
export function formatCitation(
  filename: string,
  pageNumber: number,
  style: "inline" | "footnote" | "bracket" = "bracket",
): string {
  const baseName = filename.replace(/\.[^.]+$/, "");

  switch (style) {
    case "inline":
      return `(${baseName}, p. ${pageNumber})`;
    case "footnote":
      return `[${pageNumber}]`;
    case "bracket":
    default:
      return `[${baseName}, página ${pageNumber}]`;
  }
}

/**
 * Find bounding box for text at given index within page lines
 */
function findBoundingBoxForIndex(
  index: number,
  lines: TextWithPosition[] | undefined,
): BoundingBox | undefined {
  if (!lines) return undefined;

  let charCount = 0;
  for (const line of lines) {
    const lineEnd = charCount + line.text.length + 1;
    if (index >= charCount && index < lineEnd) {
      return line.boundingBox;
    }
    charCount = lineEnd;
  }
  return undefined;
}

/**
 * Search for text across all pages and return all matches with citations
 * Includes bounding box positions for PDF highlighting
 */
export function searchWithCitations(
  query: string,
  pages: PageContent[],
  maxResults: number = 5,
): CitedChunk[] {
  const results: CitedChunk[] = [];
  const normalizedQuery = query.toLowerCase().trim();
  const words = normalizedQuery.split(/\s+/);

  for (const page of pages) {
    const lowerContent = page.content.toLowerCase();

    // Search for exact phrase first
    let index = lowerContent.indexOf(normalizedQuery);
    while (index !== -1 && results.length < maxResults) {
      const startContext = Math.max(0, index - 50);
      const endContext = Math.min(
        page.content.length,
        index + query.length + 50,
      );

      let text = page.content.substring(startContext, endContext);
      if (startContext > 0) text = "..." + text;
      if (endContext < page.content.length) text = text + "...";

      results.push({
        text,
        pageNumber: page.pageNumber,
        startIndex: index,
        endIndex: index + query.length,
        boundingBox: findBoundingBoxForIndex(index, page.lines),
        pageWidth: page.width,
        pageHeight: page.height,
      });

      index = lowerContent.indexOf(normalizedQuery, index + 1);
    }

    // If no exact matches, try word-by-word for longer queries
    if (results.length === 0 && words.length > 2) {
      for (const word of words) {
        if (word.length < 4) continue; // Skip short words

        let wordIndex = lowerContent.indexOf(word);
        while (wordIndex !== -1 && results.length < maxResults) {
          const startContext = Math.max(0, wordIndex - 30);
          const endContext = Math.min(
            page.content.length,
            wordIndex + word.length + 80,
          );

          let text = page.content.substring(startContext, endContext);
          if (startContext > 0) text = "..." + text;
          if (endContext < page.content.length) text = text + "...";

          results.push({
            text,
            pageNumber: page.pageNumber,
            startIndex: wordIndex,
            endIndex: wordIndex + word.length,
            boundingBox: findBoundingBoxForIndex(wordIndex, page.lines),
            pageWidth: page.width,
            pageHeight: page.height,
          });

          wordIndex = lowerContent.indexOf(word, wordIndex + 1);
        }
      }
    }

    if (results.length >= maxResults) break;
  }

  return results;
}
