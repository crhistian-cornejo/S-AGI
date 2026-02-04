/**
 * PDF Analyzer
 *
 * Analyzes PDF extraction results to determine if GLM-OCR would improve quality.
 * Uses heuristics to detect scanned PDFs, tables, formulas, and complex layouts.
 */

import log from 'electron-log'
import type { ProcessedDocument } from '../documents/document-processor'
import type {
  PDFAnalysisResult,
  PDFAnalysisReason,
  PDFCharacteristics,
} from './types'

// ============================================================================
// Configuration
// ============================================================================

const THRESHOLDS = {
  /** Minimum confidence to suggest OCR */
  MIN_CONFIDENCE_TO_SUGGEST: 0.5,
  /** Minimum confidence for auto-processing */
  MIN_CONFIDENCE_AUTO_PROCESS: 0.8,
  /** Word count below this for multi-page PDF suggests scanned */
  SCANNED_WORD_THRESHOLD: 50,
  /** Words per page below this suggests scanned */
  SCANNED_WORDS_PER_PAGE: 20,
  /** Text density below this suggests scanned */
  SCANNED_TEXT_DENSITY: 0.1,
  /** Minimum table indicators to detect tables */
  TABLE_PATTERN_MIN_COUNT: 3,
  /** Minimum formula indicators to detect formulas */
  FORMULA_PATTERN_MIN_COUNT: 2,
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a processed document to determine if OCR would improve quality
 */
export function analyzePDFQuality(
  processedDoc: ProcessedDocument
): PDFAnalysisResult {
  const characteristics = extractCharacteristics(processedDoc)
  const { score, reasons } = calculateScore(characteristics, processedDoc)

  const result: PDFAnalysisResult = {
    needsOCR: score >= THRESHOLDS.MIN_CONFIDENCE_TO_SUGGEST,
    confidence: Math.min(score, 1),
    reasons,
    characteristics,
  }

  log.debug('[PDFAnalyzer] Analysis result:', {
    needsOCR: result.needsOCR,
    confidence: result.confidence.toFixed(2),
    reasons: result.reasons,
  })

  return result
}

/**
 * Check if PDF should be auto-processed with OCR
 */
export function shouldAutoProcess(analysis: PDFAnalysisResult): boolean {
  return (
    analysis.needsOCR &&
    analysis.confidence >= THRESHOLDS.MIN_CONFIDENCE_AUTO_PROCESS
  )
}

// ============================================================================
// Characteristic Extraction
// ============================================================================

function extractCharacteristics(
  doc: ProcessedDocument
): PDFCharacteristics {
  const content = doc.content || ''
  const wordCount = doc.metadata.wordCount || countWords(content)
  const pageCount = doc.metadata.pageCount || doc.pages?.length || 1
  const wordsPerPage = wordCount / Math.max(pageCount, 1)

  return {
    isScanned: detectScanned(wordCount, pageCount, wordsPerPage),
    hasTables: detectTables(content),
    hasFormulas: detectFormulas(content),
    hasComplexLayout: detectComplexLayout(content, doc.pages),
    textDensity: calculateTextDensity(content, pageCount),
    imageRatio: estimateImageRatio(wordCount, pageCount),
    wordCount,
    pageCount,
  }
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect if PDF appears to be scanned (image-based)
 */
function detectScanned(
  wordCount: number,
  pageCount: number,
  wordsPerPage: number
): boolean {
  // Very few words for multi-page document
  if (pageCount > 1 && wordCount < THRESHOLDS.SCANNED_WORD_THRESHOLD) {
    return true
  }

  // Very low words per page
  if (pageCount >= 3 && wordsPerPage < THRESHOLDS.SCANNED_WORDS_PER_PAGE) {
    return true
  }

  return false
}

/**
 * Detect table structures in content
 */
function detectTables(content: string): boolean {
  let tableIndicators = 0

  // Markdown table patterns (|---|)
  const markdownTableHeaders = (content.match(/\|[-:]+\|/g) || []).length
  tableIndicators += markdownTableHeaders

  // HTML table tags
  const htmlTables = (content.match(/<table|<tr|<td|<th/gi) || []).length
  tableIndicators += Math.min(htmlTables / 4, 5) // Normalize since tables have many tags

  // Tab-separated patterns (common in poorly extracted tables)
  const tabPatterns = (content.match(/\t.*\t.*\t/g) || []).length
  tableIndicators += tabPatterns > 5 ? 2 : 0

  // Multiple consecutive lines with similar structure (column alignment)
  const alignedLines = detectAlignedLines(content)
  tableIndicators += alignedLines ? 2 : 0

  // Pipe characters used as separators
  const pipeLines = (content.match(/\|[^|]+\|[^|]+\|/g) || []).length
  tableIndicators += pipeLines > 3 ? 2 : 0

  return tableIndicators >= THRESHOLDS.TABLE_PATTERN_MIN_COUNT
}

/**
 * Detect mathematical formulas in content
 */
function detectFormulas(content: string): boolean {
  let formulaIndicators = 0

  // LaTeX block formulas $$...$$
  const blockFormulas = (content.match(/\$\$[\s\S]+?\$\$/g) || []).length
  formulaIndicators += blockFormulas * 2

  // LaTeX inline formulas $...$
  const inlineFormulas = (content.match(/\$[^$\n]{2,}\$/g) || []).length
  formulaIndicators += inlineFormulas

  // Common math symbols
  const mathSymbols = [
    /[∑∫∏∂∇√∞±≤≥≠≈∈∉⊂⊃∪∩]/g,
    /[αβγδεζηθικλμνξπρστυφχψω]/gi,
    /\^[\d{}\[\]()]/g, // Superscripts
    /_{[\d\w]}/g, // Subscripts
    /\\frac|\\sqrt|\\sum|\\int|\\lim/g, // LaTeX commands
  ]

  for (const pattern of mathSymbols) {
    const matches = (content.match(pattern) || []).length
    formulaIndicators += matches > 0 ? 1 : 0
  }

  // Fraction patterns like "1/2" or "x/y"
  const fractionPatterns = (content.match(/\b\w+\/\w+\b/g) || []).length
  if (fractionPatterns > 5) formulaIndicators += 1

  return formulaIndicators >= THRESHOLDS.FORMULA_PATTERN_MIN_COUNT
}

/**
 * Detect complex multi-column layouts
 */
function detectComplexLayout(
  content: string,
  pages?: ProcessedDocument['pages']
): boolean {
  // Check for unusual whitespace patterns indicating columns
  const largeGaps = (content.match(/  {4,}/g) || []).length
  if (largeGaps > 10) return true

  // Check for very short lines mixed with normal lines
  const lines = content.split('\n').filter((l) => l.trim())
  const shortLines = lines.filter((l) => l.length < 40 && l.length > 5).length
  const normalLines = lines.filter((l) => l.length >= 40).length

  // High ratio of short to normal lines suggests columns
  if (normalLines > 0 && shortLines / normalLines > 2) {
    return true
  }

  // Check page content for uneven distribution
  if (pages && pages.length > 1) {
    const contentLengths = pages.map((p) => p.content.length)
    const avgLength = contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length
    const variance =
      contentLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) /
      contentLengths.length
    const stdDev = Math.sqrt(variance)

    // High variance in page content length suggests inconsistent extraction
    if (avgLength > 0 && stdDev / avgLength > 0.8) {
      return true
    }
  }

  return false
}

/**
 * Detect lines that appear to be aligned in columns
 */
function detectAlignedLines(content: string): boolean {
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 5) return false

  // Check for consistent spacing patterns
  let alignedCount = 0
  const spacingPatterns: number[][] = []

  for (const line of lines.slice(0, 50)) {
    // Check first 50 lines
    const gaps = []
    let gapStart = -1

    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ' || line[i] === '\t') {
        if (gapStart === -1) gapStart = i
      } else {
        if (gapStart !== -1 && i - gapStart >= 2) {
          gaps.push(gapStart)
        }
        gapStart = -1
      }
    }

    if (gaps.length >= 2) {
      spacingPatterns.push(gaps)
    }
  }

  // Check if spacing patterns are similar
  if (spacingPatterns.length >= 3) {
    for (let i = 1; i < spacingPatterns.length; i++) {
      const prev = spacingPatterns[i - 1]
      const curr = spacingPatterns[i]

      if (prev.length === curr.length && prev.length >= 2) {
        const similar = prev.every((pos, idx) => Math.abs(pos - curr[idx]) <= 3)
        if (similar) alignedCount++
      }
    }
  }

  return alignedCount >= 3
}

// ============================================================================
// Score Calculation
// ============================================================================

function calculateScore(
  characteristics: PDFCharacteristics,
  doc: ProcessedDocument
): { score: number; reasons: PDFAnalysisReason[] } {
  let score = 0
  const reasons: PDFAnalysisReason[] = []

  // Scanned PDF detection (highest weight)
  if (characteristics.isScanned) {
    score += 0.5
    reasons.push('scanned')
  }

  // Low text density
  if (characteristics.textDensity < THRESHOLDS.SCANNED_TEXT_DENSITY) {
    score += 0.3
    reasons.push('low-text-density')
  }

  // Tables detected
  if (characteristics.hasTables) {
    score += 0.25
    reasons.push('tables')
  }

  // Formulas detected
  if (characteristics.hasFormulas) {
    score += 0.25
    reasons.push('formulas')
  }

  // Complex layout
  if (characteristics.hasComplexLayout) {
    score += 0.2
    reasons.push('complex-layout')
  }

  // Mixed content (some pages have content, others don't)
  if (doc.pages && doc.pages.length > 1) {
    const emptyPages = doc.pages.filter((p) => p.wordCount < 10).length
    if (emptyPages > 0 && emptyPages < doc.pages.length) {
      score += 0.15
      reasons.push('mixed-content')
    }
  }

  return { score, reasons }
}

// ============================================================================
// Utility Functions
// ============================================================================

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
}

function calculateTextDensity(content: string, pageCount: number): number {
  const charCount = content.replace(/\s/g, '').length
  // Estimate: average page has ~3000 characters at normal density
  const expectedChars = pageCount * 3000
  return expectedChars > 0 ? Math.min(charCount / expectedChars, 1) : 0
}

function estimateImageRatio(wordCount: number, pageCount: number): number {
  // Estimate based on words per page
  // ~300 words per page is typical for text-heavy docs
  const expectedWords = pageCount * 300
  const textRatio = expectedWords > 0 ? Math.min(wordCount / expectedWords, 1) : 0
  return 1 - textRatio
}

// ============================================================================
// Exports
// ============================================================================

export { THRESHOLDS }
