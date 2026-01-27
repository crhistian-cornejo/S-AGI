/**
 * @s-agi/core - Citation Types
 *
 * Unified citation system for Claude for Excel patterns.
 * Supports cell citations (spreadsheets), page citations (PDFs), and web citations.
 */

// === Citation Types ===
export type CitationType = 'cell' | 'page' | 'web'

// === Cell Citation (Spreadsheets) ===
export interface CellCitation {
  type: 'cell'
  /** Cell reference (e.g., "A1", "B2:D5") */
  cell: string
  /** Cell value */
  value?: string | number
  /** Sheet name */
  sheet?: string
  /** Associated file ID */
  fileId?: string
  /** Associated artifact ID */
  artifactId?: string
  /** Formula if cell contains one */
  formula?: string
}

// === Page Citation (PDFs/Documents) ===
export interface PageCitation {
  type: 'page'
  /** Citation ID (for reference) */
  id: number
  /** Source filename */
  filename: string
  /** Page number (null if unknown) */
  pageNumber: number | null
  /** Quoted text */
  text: string
  /** Bounding box for precise highlighting */
  boundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  /** Page dimensions for coordinate conversion */
  pageWidth?: number
  pageHeight?: number
  /** Start index in document text */
  startIndex?: number
  /** End index in document text */
  endIndex?: number
}

// === Web Citation (Search Results) ===
export interface WebCitation {
  type: 'web'
  /** Source URL */
  url: string
  /** Page title */
  title?: string
  /** Snippet/excerpt */
  snippet?: string
  /** Favicon URL */
  favicon?: string
}

// === Unified Citation (for rendering) ===
export type Citation = CellCitation | PageCitation | WebCitation

// === Citation Data for Renderer ===
// These types match the component props for easy integration

export interface CellCitationData {
  type: 'cell'
  cell: string
  value?: string | number
  sheet?: string
  fileId?: string
  artifactId?: string
}

export interface PageCitationData {
  id: number
  /** Alias for id (backward compatibility) */
  citationId?: number
  filename: string
  pageNumber: number | null
  text: string
  boundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  pageWidth?: number
  pageHeight?: number
}

// === Citation Parsing Results ===
export interface ParsedCitations {
  /** Content with citation markers replaced by placeholders */
  processedContent: string
  /** Extracted cell citations */
  cellCitations: CellCitationData[]
  /** Extracted page citations */
  pageCitations: PageCitationData[]
}

// === Citation Markers (for AI responses) ===
/**
 * Cell citation format: [[cell:A1]] or [[cell:A1:B5|value]] or [[cell:Sheet1!A1]]
 * Page citation format: [[cite:ID|filename|page|text]]
 */

export const CITATION_PATTERNS = {
  /** Matches [[cell:REF]] or [[cell:REF|VALUE]] */
  cell: /\[\[cell:([A-Z]+\d+(?::[A-Z]+\d+)?|[^|!\]]+![A-Z]+\d+(?::[A-Z]+\d+)?)(?:\|([^\]]+))?\]\]/gi,
  /** Matches [[cite:ID|filename|pageNumber|quotedText]] */
  page: /\[\[cite:(\d+)\|([^|]+)\|([^|]*)\|([^\]]+)\]\]/g,
} as const

// === Helper Functions ===

/**
 * Check if content contains cell citations
 */
export function hasCellCitations(content: string): boolean {
  return /\[\[cell:[A-Z]/i.test(content)
}

/**
 * Check if content contains page citations
 */
export function hasPageCitations(content: string): boolean {
  return /\[\[cite:\d+\|/.test(content)
}

/**
 * Check if content contains any citations
 */
export function hasAnyCitations(content: string): boolean {
  return hasCellCitations(content) || hasPageCitations(content)
}
