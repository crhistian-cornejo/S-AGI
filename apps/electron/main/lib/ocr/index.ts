/**
 * OCR Module Exports
 *
 * GLM-OCR integration for advanced PDF text extraction
 */

// Types
export * from './types'

// Services
export {
  processWithGLMOCR,
  processFromUrlWithGLMOCR,
  isGLMOCRAvailable,
  GLMOCRServiceError,
} from './glm-ocr-service'

// Analyzer
export {
  analyzePDFQuality,
  shouldAutoProcess,
  THRESHOLDS as OCR_THRESHOLDS,
} from './pdf-analyzer'
