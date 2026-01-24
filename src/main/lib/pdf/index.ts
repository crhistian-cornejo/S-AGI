/**
 * PDF Module
 *
 * Unified PDF operations using LibPDF for manipulation
 * and EmbedPDF for viewing (in renderer).
 *
 * This module provides:
 * - Text extraction with positions (for RAG citations)
 * - PDF merge/split operations
 * - Form filling and flattening
 * - PDF compression
 * - Metadata extraction
 */

// Core PDF service
export {
  loadPdf,
  extractTextWithPositions,
  extractText,
  searchTextWithPositions,
  getMetadata,
  mergePdfs,
  splitPdf,
  compressPdf,
  getFormFields,
  fillFormFields,
  flattenForm,
  type TextWithPosition,
  type PageContent,
  type SearchResultWithPosition,
  type PDFMetadata,
  type BoundingBox,
} from "./pdf-service";

// Form filling service
export {
  getFields,
  fill,
  flatten,
  fillAndFlatten,
  hasFormFields,
  type FormField,
  type FormFillResult,
} from "./form-filler";

// Compression service
export {
  compress,
  analyzeCompressionPotential,
  compressBatch,
  formatBytes,
  type CompressionResult,
  type CompressionOptions,
} from "./compression-service";
