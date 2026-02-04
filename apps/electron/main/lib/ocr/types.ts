/**
 * GLM-OCR Types
 *
 * Types for Z.AI GLM-OCR integration (layout_parsing API)
 */

import type { PageContent, BoundingBox } from '../documents/document-processor'

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface GLMOCRRequest {
  model: 'glm-ocr'
  file: string // URL or base64 data URL
}

export interface GLMOCRResponse {
  /** Markdown structured content */
  content: string
  /** Token usage info */
  usage?: {
    total_tokens: number
    prompt_tokens?: number
    completion_tokens?: number
  }
}

export interface GLMOCRError {
  error: {
    code: string
    message: string
  }
}

// ============================================================================
// Processing Types
// ============================================================================

export interface OCRProcessingResult {
  /** Full extracted content in Markdown format */
  content: string
  /** Page-by-page content for citations */
  pages: PageContent[]
  /** Processing metadata */
  metadata: OCRMetadata
}

export interface OCRMetadata {
  /** Extraction method used */
  extractionMethod: 'native' | 'glm-ocr' | 'hybrid'
  /** Number of tables detected */
  tablesCount?: number
  /** Number of formulas detected */
  formulasCount?: number
  /** OCR confidence score (0-1) */
  ocrConfidence?: number
  /** Processing time in milliseconds */
  processingTimeMs?: number
  /** Original extraction quality before OCR */
  originalQuality?: 'high' | 'medium' | 'low'
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface PDFAnalysisResult {
  /** Whether the PDF would benefit from OCR */
  needsOCR: boolean
  /** Confidence score (0-1) */
  confidence: number
  /** Reasons why OCR is recommended */
  reasons: PDFAnalysisReason[]
  /** Detected characteristics */
  characteristics: PDFCharacteristics
}

export type PDFAnalysisReason =
  | 'scanned'
  | 'tables'
  | 'formulas'
  | 'complex-layout'
  | 'low-text-density'
  | 'mixed-content'

export interface PDFCharacteristics {
  /** PDF appears to be scanned (image-based) */
  isScanned: boolean
  /** Contains table structures */
  hasTables: boolean
  /** Contains mathematical formulas */
  hasFormulas: boolean
  /** Has complex multi-column layout */
  hasComplexLayout: boolean
  /** Text density ratio (0-1) */
  textDensity: number
  /** Ratio of images to text */
  imageRatio: number
  /** Word count from native extraction */
  wordCount: number
  /** Page count */
  pageCount: number
}

// ============================================================================
// Settings Types
// ============================================================================

export interface OCRSettings {
  /** GLM-OCR feature enabled */
  enabled: boolean
  /** Auto-detect PDFs that need OCR */
  autoDetect: boolean
  /** Auto-process without asking */
  autoProcess: boolean
}

export const DEFAULT_OCR_SETTINGS: OCRSettings = {
  enabled: false,
  autoDetect: true,
  autoProcess: false,
}

// ============================================================================
// Event Types (for progress tracking)
// ============================================================================

export interface OCRProgressEvent {
  fileId: string
  status: 'analyzing' | 'processing' | 'completed' | 'failed'
  progress: number // 0-100
  message?: string
  error?: string
}

// ============================================================================
// Re-exports
// ============================================================================

export type { PageContent, BoundingBox }
