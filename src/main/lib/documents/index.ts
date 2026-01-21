/**
 * Document Processing Module
 *
 * Exports document processing utilities adapted from Midday
 */

export {
    // Main processor
    processDocument,

    // PDF utilities
    extractTextFromPdf,
    extractTextFromPdfWithPages,
    extractTextFromPdfUrl,

    // Text utilities
    extractTextFromBuffer,
    calculateWordCount,
    detectLanguage,
    generateTitleFromFilename,
    generateSummary,

    // Citation utilities
    findPageForText,
    extractCitation,
    formatCitation,
    searchWithCitations,

    // Type guards
    isProcessableDocument,
    isProcessableExtension,

    // Types
    type ProcessingStatus,
    type ProcessedDocument,
    type DocumentMetadata,
    type PageContent,
    type CitedChunk,

    // Constants
    SUPPORTED_DOCUMENT_TYPES
} from './document-processor'

// Document context for multi-provider support
export {
    getDocumentContext,
    supportsNativeFileSearch,
    getProviderFromModelId,
    shouldUseLocalContext,
    type DocumentContext,
    type DocumentContextOptions
} from './document-context'
