/**
 * Document Context Service
 *
 * Provides document context for AI models that don't support native file search.
 * This implements a hybrid RAG strategy:
 * - OpenAI: Uses native file_search with Vector Stores
 * - Other providers: Uses extracted text + local FTS search
 * - Local mode: Uses local vector search with sqlite-vec
 *
 * Adapted from Midday's approach of passing document context directly to models.
 */

import { supabase } from "../supabase/client";
import log from "electron-log";
import {
  searchWithCitations,
  formatCitation,
  type PageContent,
  type BoundingBox,
} from "./document-processor";
import { isLocalStorageMode, getStorageAdapter } from "../storage";
import {
  getLocalVectorSearch,
  buildDocumentContextFromResults,
} from "../vector";

// ============================================================================
// Configuration
// ============================================================================

// Maximum context length to inject (in characters)
const MAX_CONTEXT_LENGTH = 15000;

// Maximum number of search results to include
const MAX_SEARCH_RESULTS = 5;

// Maximum content per document when including full docs
const MAX_DOC_PREVIEW_LENGTH = 3000;

// ============================================================================
// Types
// ============================================================================

export interface DocumentContextOptions {
  /** The chat ID to get documents from */
  chatId: string;
  /** The user's query/prompt */
  query: string;
  /** User ID for access control */
  userId: string;
  /** Whether to search within documents (true) or just list them (false) */
  searchContent?: boolean;
  /** Maximum context length */
  maxLength?: number;
  /** Whether to prefer local vector search (auto-detected if not specified) */
  useLocalVectorSearch?: boolean;
}

export interface CitationWithPosition {
  text: string;
  filename: string;
  pageNumber: number | null;
  citation: string;
  /** Numeric citation ID for inline references [1], [2], etc. */
  citationId?: number;
  /** Machine-parseable marker: [[cite:ID|filename|page|text]] */
  citationMarker?: string;
  /** Bounding box for precise highlighting in PDF viewer */
  boundingBox?: BoundingBox;
  /** Page dimensions for coordinate conversion */
  pageWidth?: number;
  pageHeight?: number;
}

export interface DocumentContext {
  /** Whether context was found */
  hasContext: boolean;
  /** The context text to inject into the system prompt */
  contextText: string;
  /** List of document names included */
  documentNames: string[];
  /** Search results with citations (if search was performed) */
  citations?: CitationWithPosition[];
  /** Total documents in the chat */
  totalDocuments: number;
}

export interface DocumentFile {
  id: string;
  filename: string;
  content_type: string | null;
  file_size: number | null;
  extracted_content: string | null;
  pages: PageContent[] | null;
  metadata: Record<string, unknown> | null;
  processing_status: string | null;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get document context for AI prompt injection
 * Use this for providers that don't support native file search (Anthropic, Gemini, etc.)
 */
export async function getDocumentContext(
  options: DocumentContextOptions,
): Promise<DocumentContext> {
  const {
    chatId,
    query,
    userId,
    searchContent = true,
    maxLength = MAX_CONTEXT_LENGTH,
    useLocalVectorSearch,
  } = options;

  try {
    // Determine if we should use local vector search
    const shouldUseLocalVector = useLocalVectorSearch ?? isLocalStorageMode();

    // Try local vector search first if in local mode
    if (shouldUseLocalVector && searchContent && query.trim()) {
      const localResult = await getLocalVectorContext(chatId, query, userId);
      if (localResult.hasContext) {
        log.info(`[DocumentContext] Using local vector search: ${localResult.citations?.length || 0} citations`);
        return localResult;
      }
      log.info("[DocumentContext] Local vector search returned no results, falling back to text search");
    }

    // Fallback: Get documents from storage (Supabase or local SQLite)
    let documents: DocumentFile[] = [];

    if (shouldUseLocalVector) {
      // Local mode: Get from SQLite via storage adapter
      documents = await getLocalDocuments(chatId, userId);
    } else {
      // Cloud mode: Get from Supabase
      const { data, error } = await supabase
        .from("chat_files")
        .select(
          `
                  id,
                  filename,
                  content_type,
                  file_size,
                  extracted_content,
                  pages,
                  metadata,
                  processing_status
              `,
        )
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .eq("processing_status", "completed")
        .order("created_at", { ascending: false });

      if (error) {
        log.error("[DocumentContext] Failed to fetch documents:", error);
        return {
          hasContext: false,
          contextText: "",
          documentNames: [],
          totalDocuments: 0,
        };
      }

      documents = (data || []) as DocumentFile[];
    }

    if (documents.length === 0) {
      return {
        hasContext: false,
        contextText: "",
        documentNames: [],
        totalDocuments: 0,
      };
    }

    // If search is enabled, search within documents
    if (searchContent && query.trim()) {
      return await searchDocumentsForContext(documents, query, maxLength);
    }

    // Otherwise, return document summaries
    return getDocumentSummaries(documents, maxLength);
  } catch (error) {
    log.error("[DocumentContext] Error getting context:", error);
    return {
      hasContext: false,
      contextText: "",
      documentNames: [],
      totalDocuments: 0,
    };
  }
}

/**
 * Get document context using local vector search
 */
async function getLocalVectorContext(
  chatId: string,
  query: string,
  _userId: string,
): Promise<DocumentContext> {
  try {
    const vectorSearch = getLocalVectorSearch();

    // Check if chat has vectors
    if (!vectorSearch.chatHasSearch(chatId)) {
      return {
        hasContext: false,
        contextText: "",
        documentNames: [],
        totalDocuments: 0,
      };
    }

    // Perform vector search
    const searchResponse = await vectorSearch.search(chatId, query, {
      limit: MAX_SEARCH_RESULTS,
      minScore: 0.3,
    });

    if (searchResponse.results.length === 0) {
      return {
        hasContext: false,
        contextText: "",
        documentNames: [],
        totalDocuments: 0,
      };
    }

    // Get unique document names
    const documentNames = [...new Set(searchResponse.results.map((r) => r.filename))];

    // Convert vector results to citations
    const citations: CitationWithPosition[] = searchResponse.results.map((r, i) => ({
      text: r.text,
      filename: r.filename,
      pageNumber: r.pageNumber,
      citation: r.citation,
      citationId: i + 1,
      citationMarker: `[[cite:${i + 1}|${r.filename}|${r.pageNumber || ""}|${r.text.replace(/\|/g, "¦").replace(/\]/g, "⟧")}]]`,
      boundingBox: r.boundingBox,
      pageWidth: r.pageWidth,
      pageHeight: r.pageHeight,
    }));

    // Build context text
    const contextText = buildDocumentContextFromResults(searchResponse.results, documentNames);

    log.info(
      `[DocumentContext] Local vector search: ${searchResponse.results.length} results from ${documentNames.length} docs in ${searchResponse.searchTimeMs}ms`
    );

    return {
      hasContext: true,
      contextText,
      documentNames,
      citations,
      totalDocuments: searchResponse.documentsSearched,
    };
  } catch (error) {
    log.error("[DocumentContext] Local vector search failed:", error);
    return {
      hasContext: false,
      contextText: "",
      documentNames: [],
      totalDocuments: 0,
    };
  }
}

/**
 * Get documents from local SQLite storage
 */
async function getLocalDocuments(chatId: string, userId: string): Promise<DocumentFile[]> {
  try {
    const adapter = await getStorageAdapter();
    const files = await adapter.chatFiles.list(chatId, userId);

    return files
      .filter((f) => f.processingStatus === "completed")
      .map((f) => ({
        id: f.id,
        filename: f.filename,
        content_type: f.contentType || null,
        file_size: f.fileSize || null,
        extracted_content: f.extractedContent || null,
        pages: (f.pages as PageContent[]) || null,
        metadata: (f.metadata as Record<string, unknown>) || null,
        processing_status: f.processingStatus || null,
      }));
  } catch (error) {
    log.error("[DocumentContext] Failed to get local documents:", error);
    return [];
  }
}

/**
 * Search within documents and return relevant context with citations
 */
async function searchDocumentsForContext(
  documents: DocumentFile[],
  query: string,
  maxLength: number,
): Promise<DocumentContext> {
  const allCitations: DocumentContext["citations"] = [];
  const contextParts: string[] = [];
  let currentLength = 0;
  let citationIndex = 1;

  for (const doc of documents) {
    if (currentLength >= maxLength) break;

    // Try to search with page-level citations
    if (doc.pages && Array.isArray(doc.pages) && doc.pages.length > 0) {
      const pages = doc.pages as PageContent[];
      const results = searchWithCitations(query, pages, MAX_SEARCH_RESULTS);

      for (const result of results) {
        if (currentLength >= maxLength) break;

        // Human-readable citation for display
        const citation = formatCitation(
          doc.filename,
          result.pageNumber,
          "bracket",
        );

        // Machine-parseable citation marker for inline rendering
        // Format: [[cite:ID|filename|page|text]]
        const citationMarker = `[[cite:${citationIndex}|${doc.filename}|${result.pageNumber}|${result.text.replace(/\|/g, "¦").replace(/\]/g, "⟧")}]]`;

        allCitations.push({
          text: result.text,
          filename: doc.filename,
          pageNumber: result.pageNumber,
          citation,
          citationId: citationIndex,
          citationMarker,
          boundingBox: result.boundingBox,
          pageWidth: result.pageWidth,
          pageHeight: result.pageHeight,
        });

        // Context with numbered reference for the AI to use
        const contextChunk = `\n[${citationIndex}] ${citation}:\n>>> "${result.text}"\n`;
        if (currentLength + contextChunk.length <= maxLength) {
          contextParts.push(contextChunk);
          currentLength += contextChunk.length;
          citationIndex++;
        }
      }
    }
    // Fallback: search in extracted_content without page numbers
    else if (doc.extracted_content) {
      const lowerContent = doc.extracted_content.toLowerCase();
      const lowerQuery = query.toLowerCase();

      // Simple search for query terms
      const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 3);
      for (const word of queryWords) {
        const index = lowerContent.indexOf(word);
        if (index !== -1 && currentLength < maxLength) {
          const start = Math.max(0, index - 100);
          const end = Math.min(
            doc.extracted_content.length,
            index + word.length + 200,
          );
          let snippet = doc.extracted_content.substring(start, end);
          if (start > 0) snippet = "..." + snippet;
          if (end < doc.extracted_content.length) snippet += "...";

          const citation = `[${doc.filename}]`;
          const citationMarker = `[[cite:${citationIndex}|${doc.filename}||${snippet.replace(/\|/g, "¦").replace(/\]/g, "⟧")}]]`;

          allCitations.push({
            text: snippet,
            filename: doc.filename,
            pageNumber: null,
            citation,
            citationId: citationIndex,
            citationMarker,
          });

          const contextChunk = `\n[${citationIndex}] ${citation}:\n>>> "${snippet}"\n`;
          if (currentLength + contextChunk.length <= maxLength) {
            contextParts.push(contextChunk);
            currentLength += contextChunk.length;
            citationIndex++;
          }
          break; // One match per document in fallback mode
        }
      }
    }
  }

  // If no search results, fall back to summaries
  if (contextParts.length === 0) {
    return getDocumentSummaries(documents, maxLength);
  }

  const contextText = buildContextPrompt(
    contextParts,
    documents.map((d) => d.filename),
    true,
  );

  return {
    hasContext: true,
    contextText,
    documentNames: documents.map((d) => d.filename),
    citations: allCitations,
    totalDocuments: documents.length,
  };
}

/**
 * Get document summaries when no specific search is needed
 */
function getDocumentSummaries(
  documents: DocumentFile[],
  maxLength: number,
): DocumentContext {
  const contextParts: string[] = [];
  let currentLength = 0;

  for (const doc of documents) {
    if (currentLength >= maxLength) break;

    const metadata = doc.metadata as Record<string, unknown> | null;
    const summary = metadata?.summary as string | undefined;
    const wordCount = metadata?.wordCount as number | undefined;
    const pageCount = metadata?.pageCount as number | undefined;

    let docContext = `**${doc.filename}**`;
    if (pageCount) docContext += ` (${pageCount} pages)`;
    if (wordCount) docContext += ` - ${wordCount} words`;
    docContext += "\n";

    if (summary) {
      const truncatedSummary =
        summary.length > 500 ? summary.substring(0, 500) + "..." : summary;
      docContext += `Summary: ${truncatedSummary}\n`;
    } else if (doc.extracted_content) {
      const preview = doc.extracted_content.substring(
        0,
        MAX_DOC_PREVIEW_LENGTH,
      );
      docContext += `Content preview: ${preview}${doc.extracted_content.length > MAX_DOC_PREVIEW_LENGTH ? "..." : ""}\n`;
    }

    docContext += "\n";

    if (currentLength + docContext.length <= maxLength) {
      contextParts.push(docContext);
      currentLength += docContext.length;
    }
  }

  const contextText = buildContextPrompt(
    contextParts,
    documents.map((d) => d.filename),
    false,
  );

  return {
    hasContext: contextParts.length > 0,
    contextText,
    documentNames: documents.map((d) => d.filename),
    totalDocuments: documents.length,
  };
}

/**
 * Build the final context prompt to inject into system message
 */
function buildContextPrompt(
  contentParts: string[],
  documentNames: string[],
  isSearchResult: boolean,
): string {
  if (contentParts.length === 0) return "";

  const header = `
================================================================================
DOCUMENT CONTEXT - UPLOADED FILES
================================================================================

The user has uploaded ${documentNames.length} document(s) to this conversation:
${documentNames.map((n) => `- ${n}`).join("\n")}

${
  isSearchResult
    ? `The following excerpts are RELEVANT to the user's query (with citations):`
    : `Document summaries:`
}

`;

  const footer = `
================================================================================

⚠️ CRITICAL: CITATION INSTRUCTIONS (YOU MUST FOLLOW THESE EXACTLY)

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

WRONG (never do this):
"El servicio consiste en revisar costos y elaborar la Cuarta Modificación."

Remember: EVERY piece of information needs [N] citation.
================================================================================
`;

  return header + contentParts.join("\n") + footer;
}

/**
 * Check if a provider supports native file search
 */
export function supportsNativeFileSearch(provider: string): boolean {
  // Only OpenAI supports native file_search with Vector Stores
  const supportedProviders = ["openai"];
  return supportedProviders.includes(provider.toLowerCase());
}

/**
 * Get the AI provider from a model ID
 */
export function getProviderFromModelId(modelId: string): string {
  if (
    modelId.includes("gpt") ||
    modelId.includes("o1") ||
    modelId.includes("o3")
  )
    return "openai";
  if (modelId.includes("claude")) return "anthropic";
  if (modelId.includes("gemini")) return "google";
  if (modelId.includes("glm") || modelId.includes("zhipu")) return "zhipu";
  if (modelId.includes("deepseek")) return "deepseek";
  return "unknown";
}

/**
 * Determine if we should use local document context or native file search
 */
export function shouldUseLocalContext(modelId: string): boolean {
  const provider = getProviderFromModelId(modelId);
  return !supportsNativeFileSearch(provider);
}
