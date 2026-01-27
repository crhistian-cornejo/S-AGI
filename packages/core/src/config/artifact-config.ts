/**
 * Artifact Configuration - Centralized artifact types and metadata
 *
 * Based on midday patterns for progressive rendering and tool-to-artifact mapping
 * Inspired by Claude for Excel's cell citation system
 */

import { z } from 'zod'

// ============================================================================
// ARTIFACT TYPES
// ============================================================================

export type ArtifactType =
  | 'spreadsheet-canvas'
  | 'document-canvas'
  | 'pdf-canvas'
  | 'chart-canvas'
  | 'image-canvas'
  | 'code-canvas'

// ============================================================================
// ARTIFACT STAGES (Progressive Rendering like midday)
// ============================================================================

export type ArtifactStage =
  | 'loading'        // Initial loading state
  | 'data_ready'     // Core data loaded
  | 'chart_ready'    // Charts/visualizations ready
  | 'analysis_ready' // Analysis/insights complete
  | 'complete'       // Fully rendered

// Stage progression order
export const STAGE_ORDER: ArtifactStage[] = [
  'loading',
  'data_ready',
  'chart_ready',
  'analysis_ready',
  'complete'
]

export function isStageAtLeast(current: ArtifactStage, minimum: ArtifactStage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(minimum)
}

// ============================================================================
// ARTIFACT METADATA
// ============================================================================

export interface ArtifactMetadata {
  title: string
  icon: string // Tabler icon name
  description: string
  stages: ArtifactStage[]
  defaultStage: ArtifactStage
  supportsCitations: boolean
  supportsVersioning: boolean
  color: string
}

export const ARTIFACT_METADATA: Record<ArtifactType, ArtifactMetadata> = {
  'spreadsheet-canvas': {
    title: 'Spreadsheet',
    icon: 'IconTable',
    description: 'Excel-like spreadsheet with formulas and formatting',
    stages: ['loading', 'data_ready', 'chart_ready', 'analysis_ready', 'complete'],
    defaultStage: 'loading',
    supportsCitations: true, // Like Claude for Excel cell citations
    supportsVersioning: true,
    color: '#22c55e' // green-500
  },
  'document-canvas': {
    title: 'Document',
    icon: 'IconFileText',
    description: 'Rich text document with formatting',
    stages: ['loading', 'data_ready', 'complete'],
    defaultStage: 'loading',
    supportsCitations: true,
    supportsVersioning: true,
    color: '#3b82f6' // blue-500
  },
  'pdf-canvas': {
    title: 'PDF Viewer',
    icon: 'IconFileTypePdf',
    description: 'PDF with search and citations',
    stages: ['loading', 'data_ready', 'analysis_ready', 'complete'],
    defaultStage: 'loading',
    supportsCitations: true, // Page-level citations
    supportsVersioning: false,
    color: '#ef4444' // red-500
  },
  'chart-canvas': {
    title: 'Chart',
    icon: 'IconChartBar',
    description: 'Data visualization chart',
    stages: ['loading', 'data_ready', 'chart_ready', 'complete'],
    defaultStage: 'loading',
    supportsCitations: false,
    supportsVersioning: true,
    color: '#8b5cf6' // violet-500
  },
  'image-canvas': {
    title: 'Image',
    icon: 'IconPhoto',
    description: 'Generated or uploaded image',
    stages: ['loading', 'complete'],
    defaultStage: 'loading',
    supportsCitations: false,
    supportsVersioning: true,
    color: '#f59e0b' // amber-500
  },
  'code-canvas': {
    title: 'Code',
    icon: 'IconCode',
    description: 'Code snippet with syntax highlighting',
    stages: ['loading', 'complete'],
    defaultStage: 'loading',
    supportsCitations: false,
    supportsVersioning: true,
    color: '#6366f1' // indigo-500
  }
}

// ============================================================================
// TOOL TO ARTIFACT MAPPING (like midday)
// ============================================================================

export const TOOL_TO_ARTIFACT_MAP: Record<string, ArtifactType> = {
  // Excel/Spreadsheet tools
  create_spreadsheet: 'spreadsheet-canvas',
  update_cells: 'spreadsheet-canvas',
  insert_formula: 'spreadsheet-canvas',
  format_cells: 'spreadsheet-canvas',
  analyze_data: 'spreadsheet-canvas',
  sort_data: 'spreadsheet-canvas',
  add_conditional_formatting: 'spreadsheet-canvas',
  export_to_csv: 'spreadsheet-canvas',

  // Document tools
  create_document: 'document-canvas',
  update_document: 'document-canvas',

  // PDF tools
  search_pdf: 'pdf-canvas',
  extract_pdf_section: 'pdf-canvas',
  summarize_pdf: 'pdf-canvas',
  cite_pdf: 'pdf-canvas',

  // Chart tools
  create_chart: 'chart-canvas',
  update_chart: 'chart-canvas',

  // Image tools
  generate_image: 'image-canvas',
}

export function getArtifactTypeForTool(toolName: string): ArtifactType | null {
  return TOOL_TO_ARTIFACT_MAP[toolName] || null
}

// ============================================================================
// CITATION TYPES (Claude for Excel pattern)
// ============================================================================

export interface CellCitation {
  type: 'cell'
  cell: string       // e.g., "A1"
  range?: string     // e.g., "A1:B10"
  value: string | number
  formula?: string
  artifactId: string
  sheetName?: string
}

export interface PageCitation {
  type: 'page'
  pageNumber: number
  text: string
  filename: string
  startIndex?: number
  endIndex?: number
}

export interface WebCitation {
  type: 'web'
  url: string
  title?: string
  snippet?: string
}

export type Citation = CellCitation | PageCitation | WebCitation

// ============================================================================
// ARTIFACT SCHEMAS (Zod validation like midday)
// ============================================================================

export const SpreadsheetArtifactSchema = z.object({
  stage: z.enum(['loading', 'data_ready', 'chart_ready', 'analysis_ready', 'complete']),
  title: z.string(),
  data: z.object({
    headers: z.array(z.string()).optional(),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).optional(),
    rowCount: z.number().optional(),
    columnCount: z.number().optional(),
  }).optional(),
  formulas: z.array(z.object({
    cell: z.string(),
    formula: z.string(),
    result: z.union([z.string(), z.number()]).optional(),
  })).optional(),
  formatting: z.record(z.unknown()).optional(),
  charts: z.array(z.object({
    type: z.string(),
    range: z.string(),
    title: z.string().optional(),
  })).optional(),
  analysis: z.object({
    summary: z.string().optional(),
    insights: z.array(z.string()).optional(),
    statistics: z.record(z.number()).optional(),
  }).optional(),
  citations: z.array(z.object({
    cell: z.string(),
    source: z.string(),
    pageNumber: z.number().optional(),
  })).optional(),
})

export const DocumentArtifactSchema = z.object({
  stage: z.enum(['loading', 'data_ready', 'complete']),
  title: z.string(),
  content: z.string().optional(),
  sections: z.array(z.object({
    heading: z.string(),
    content: z.string(),
    level: z.number().optional(),
  })).optional(),
  metadata: z.object({
    wordCount: z.number().optional(),
    readingTime: z.number().optional(),
  }).optional(),
})

export const PDFArtifactSchema = z.object({
  stage: z.enum(['loading', 'data_ready', 'analysis_ready', 'complete']),
  filename: z.string(),
  pageCount: z.number().optional(),
  currentPage: z.number().optional(),
  searchResults: z.array(z.object({
    pageNumber: z.number(),
    text: z.string(),
    snippet: z.string().optional(),
  })).optional(),
  summary: z.string().optional(),
  citations: z.array(z.object({
    pageNumber: z.number(),
    text: z.string(),
  })).optional(),
})

export const ChartArtifactSchema = z.object({
  stage: z.enum(['loading', 'data_ready', 'chart_ready', 'complete']),
  title: z.string(),
  chartType: z.enum(['bar', 'line', 'pie', 'area', 'scatter', 'radar']),
  data: z.object({
    labels: z.array(z.string()).optional(),
    datasets: z.array(z.object({
      label: z.string(),
      data: z.array(z.number()),
      color: z.string().optional(),
    })).optional(),
  }).optional(),
  options: z.record(z.unknown()).optional(),
})

export type SpreadsheetArtifact = z.infer<typeof SpreadsheetArtifactSchema>
export type DocumentArtifact = z.infer<typeof DocumentArtifactSchema>
export type PDFArtifact = z.infer<typeof PDFArtifactSchema>
export type ChartArtifact = z.infer<typeof ChartArtifactSchema>

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function shouldShowSkeleton(stage: ArtifactStage, forElement: 'chart' | 'data' | 'analysis'): boolean {
  switch (forElement) {
    case 'data':
      return stage === 'loading'
    case 'chart':
      return stage === 'loading' || stage === 'data_ready'
    case 'analysis':
      return stage !== 'analysis_ready' && stage !== 'complete'
    default:
      return false
  }
}

export function getStageProgress(stage: ArtifactStage): number {
  const index = STAGE_ORDER.indexOf(stage)
  return ((index + 1) / STAGE_ORDER.length) * 100
}

export function getNextStage(current: ArtifactStage): ArtifactStage | null {
  const index = STAGE_ORDER.indexOf(current)
  if (index < STAGE_ORDER.length - 1) {
    return STAGE_ORDER[index + 1]
  }
  return null
}