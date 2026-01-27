/**
 * Citations Module - Claude for Excel Style
 *
 * Unified citation system for:
 * - Cell citations (Excel/Spreadsheet)
 * - Page citations (PDF/Documents)
 * - Web citations (Search results)
 *
 * Based on Claude for Excel and midday patterns.
 */

// Re-export all citation types
export {
  CellCitation,
  CellCitationsFooter,
  parseCellCitations,
  hasCellCitations,
  type CellCitationData,
} from "../cell-citation";

export {
  InlineCitation,
  CitationsFooter,
  parseCitations,
  hasCitations,
  type CitationData,
} from "../inline-citation";

// Unified types
export type CitationType = "cell" | "page" | "web";

export interface UnifiedCitation {
  type: CitationType;
  id: string;
  label: string;
  // Cell citation fields
  cell?: string;
  value?: string | number;
  sheet?: string;
  // Page citation fields
  pageNumber?: number;
  filename?: string;
  text?: string;
  // Web citation fields
  url?: string;
  title?: string;
  // Navigation
  fileId?: string;
  artifactId?: string;
}

/**
 * Parse all citation types from content
 */
export function parseAllCitations(content: string): {
  processedContent: string;
  cellCitations: import("../cell-citation").CellCitationData[];
  pageCitations: import("../inline-citation").CitationData[];
} {
  const { processedContent: step1, citations: cellCitations } = parseCellCitations(content);
  const { processedContent: step2, citations: pageCitations } = parseCitations(step1);

  return {
    processedContent: step2,
    cellCitations,
    pageCitations,
  };
}

/**
 * Check if content has any citations
 */
export function hasAnyCitations(content: string): boolean {
  return hasCellCitations(content) || hasCitations(content);
}
