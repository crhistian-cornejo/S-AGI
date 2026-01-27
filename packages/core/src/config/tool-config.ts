/**
 * Tool Configuration - Centralized tool definitions and categories
 *
 * Based on midday patterns for tool organization
 * Inspired by Claude for Excel's tool confirmation system
 */

import { z } from 'zod'

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

export type ToolCategory =
  | 'excel'     // Spreadsheet operations
  | 'pdf'       // PDF analysis and extraction
  | 'docs'      // Document creation and editing
  | 'chart'     // Chart and visualization
  | 'ui'        // UI navigation
  | 'web'       // Web search and fetch
  | 'system'    // System operations

export const TOOL_CATEGORY_METADATA: Record<ToolCategory, {
  title: string
  icon: string
  description: string
  color: string
}> = {
  excel: {
    title: 'Spreadsheet',
    icon: 'IconTable',
    description: 'Create and manipulate spreadsheets',
    color: '#22c55e'
  },
  pdf: {
    title: 'PDF',
    icon: 'IconFileTypePdf',
    description: 'Search and analyze PDFs',
    color: '#ef4444'
  },
  docs: {
    title: 'Documents',
    icon: 'IconFileText',
    description: 'Create and edit documents',
    color: '#3b82f6'
  },
  chart: {
    title: 'Charts',
    icon: 'IconChartBar',
    description: 'Create data visualizations',
    color: '#8b5cf6'
  },
  ui: {
    title: 'Navigation',
    icon: 'IconLayoutNavbar',
    description: 'Navigate the application',
    color: '#6366f1'
  },
  web: {
    title: 'Web',
    icon: 'IconWorld',
    description: 'Search and fetch web content',
    color: '#0ea5e9'
  },
  system: {
    title: 'System',
    icon: 'IconSettings',
    description: 'System operations',
    color: '#64748b'
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export interface ToolDefinition {
  name: string
  category: ToolCategory
  description: string
  inputSchema: z.ZodType<unknown>
  requiresApproval: boolean
  icon: string
  /** Tool-specific UI component name */
  uiComponent?: string
  /** Tags for filtering/searching */
  tags?: string[]
}

// ============================================================================
// EXCEL TOOLS (Claude for Excel pattern)
// ============================================================================

export const EXCEL_TOOLS: Record<string, ToolDefinition> = {
  create_spreadsheet: {
    name: 'create_spreadsheet',
    category: 'excel',
    description: 'Create a new spreadsheet with headers and data. Use for tables, reports, or data analysis.',
    inputSchema: z.object({
      title: z.string().describe('Title of the spreadsheet'),
      headers: z.array(z.string()).describe('Column headers'),
      data: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).optional().describe('Data rows'),
      columnWidths: z.array(z.number()).optional().describe('Column widths in pixels'),
    }),
    requiresApproval: false,
    icon: 'IconTablePlus',
    uiComponent: 'SpreadsheetCreatedTool',
    tags: ['create', 'new', 'table']
  },

  update_cells: {
    name: 'update_cells',
    category: 'excel',
    description: 'Update cell values in a range. Can update values, formulas, or both.',
    inputSchema: z.object({
      range: z.string().describe('Cell range in A1:B10 format'),
      values: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).describe('Values for the range'),
      artifactId: z.string().optional(),
    }),
    requiresApproval: false,
    icon: 'IconEdit',
    uiComponent: 'CellsUpdatedTool',
    tags: ['update', 'edit', 'cells']
  },

  insert_formula: {
    name: 'insert_formula',
    category: 'excel',
    description: 'Insert an Excel formula. Supports SUM, AVERAGE, IF, VLOOKUP, and more.',
    inputSchema: z.object({
      cell: z.string().describe('Target cell (e.g., C10)'),
      formula: z.string().describe('Formula to insert (e.g., =SUM(A1:A9))'),
      artifactId: z.string().optional(),
    }),
    requiresApproval: false,
    icon: 'IconMathFunction',
    uiComponent: 'FormulaInsertedTool',
    tags: ['formula', 'calculate', 'function']
  },

  format_cells: {
    name: 'format_cells',
    category: 'excel',
    description: 'Apply formatting to cells: bold, colors, borders, number formats.',
    inputSchema: z.object({
      range: z.string().describe('Cell range'),
      format: z.object({
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        backgroundColor: z.string().optional(),
        textColor: z.string().optional(),
        numberFormat: z.enum(['number', 'currency', 'percentage', 'date', 'text']).optional(),
        horizontalAlign: z.enum(['left', 'center', 'right']).optional(),
        borders: z.boolean().optional(),
      }),
      artifactId: z.string().optional(),
    }),
    requiresApproval: false,
    icon: 'IconPalette',
    uiComponent: 'CellsFormattedTool',
    tags: ['format', 'style', 'appearance']
  },

  analyze_data: {
    name: 'analyze_data',
    category: 'excel',
    description: 'Analyze data range: calculate statistics, identify patterns, generate insights.',
    inputSchema: z.object({
      range: z.string().describe('Data range to analyze'),
      metrics: z.array(z.enum(['sum', 'average', 'min', 'max', 'count', 'stddev'])).optional(),
      includeChart: z.boolean().default(false),
      artifactId: z.string().optional(),
    }),
    requiresApproval: false,
    icon: 'IconChartInfographic',
    uiComponent: 'DataAnalysisTool',
    tags: ['analyze', 'statistics', 'insights']
  },

  sort_data: {
    name: 'sort_data',
    category: 'excel',
    description: 'Sort data by a specific column.',
    inputSchema: z.object({
      range: z.string().describe('Range to sort'),
      sortColumn: z.number().describe('Column index (0-based)'),
      ascending: z.boolean().default(true),
      hasHeaders: z.boolean().default(true),
      artifactId: z.string().optional(),
    }),
    requiresApproval: false,
    icon: 'IconArrowsSort',
    tags: ['sort', 'order', 'arrange']
  },

  create_chart: {
    name: 'create_chart',
    category: 'excel',
    description: 'Generate a chart from data range.',
    inputSchema: z.object({
      range: z.string().describe('Data range for the chart'),
      chartType: z.enum(['bar', 'line', 'pie', 'area', 'scatter']).describe('Chart type'),
      title: z.string().optional(),
      artifactId: z.string().optional(),
    }),
    requiresApproval: false,
    icon: 'IconChartBar',
    uiComponent: 'ChartCreatedTool',
    tags: ['chart', 'graph', 'visualize']
  },
}

// ============================================================================
// PDF TOOLS
// ============================================================================

export const PDF_TOOLS: Record<string, ToolDefinition> = {
  search_pdf: {
    name: 'search_pdf',
    category: 'pdf',
    description: 'Search for text in the PDF and return matching pages with citations.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      maxResults: z.number().default(10),
      exactMatch: z.boolean().default(false),
    }),
    requiresApproval: false,
    icon: 'IconSearch',
    uiComponent: 'PDFSearchResultsTool',
    tags: ['search', 'find', 'query']
  },

  extract_pdf_section: {
    name: 'extract_pdf_section',
    category: 'pdf',
    description: 'Extract content from specific pages.',
    inputSchema: z.object({
      pages: z.array(z.number()).describe('Page numbers to extract'),
      format: z.enum(['text', 'markdown']).default('text'),
    }),
    requiresApproval: false,
    icon: 'IconFileExport',
    tags: ['extract', 'pages', 'content']
  },

  summarize_pdf: {
    name: 'summarize_pdf',
    category: 'pdf',
    description: 'Generate a summary of the PDF content.',
    inputSchema: z.object({
      maxLength: z.number().default(500),
      style: z.enum(['brief', 'detailed', 'bullet_points']).default('brief'),
    }),
    requiresApproval: false,
    icon: 'IconFileDescription',
    uiComponent: 'PDFSummaryTool',
    tags: ['summarize', 'overview', 'brief']
  },

  cite_pdf: {
    name: 'cite_pdf',
    category: 'pdf',
    description: 'Create a citation from the PDF with page number.',
    inputSchema: z.object({
      pageNumber: z.number().describe('Page number to cite'),
      text: z.string().describe('Text to cite'),
      format: z.enum(['apa', 'mla', 'chicago', 'inline']).default('inline'),
    }),
    requiresApproval: false,
    icon: 'IconQuote',
    uiComponent: 'PDFCitationTool',
    tags: ['cite', 'quote', 'reference']
  },

  navigate_pdf: {
    name: 'navigate_pdf',
    category: 'pdf',
    description: 'Navigate to a specific page in the PDF.',
    inputSchema: z.object({
      pageNumber: z.number().describe('Page to navigate to'),
      highlight: z.string().optional().describe('Text to highlight'),
    }),
    requiresApproval: false,
    icon: 'IconFileSearch',
    tags: ['navigate', 'goto', 'page']
  },
}

// ============================================================================
// DOCUMENT TOOLS
// ============================================================================

export const DOCS_TOOLS: Record<string, ToolDefinition> = {
  create_document: {
    name: 'create_document',
    category: 'docs',
    description: 'Create a new document with content.',
    inputSchema: z.object({
      title: z.string().describe('Document title'),
      content: z.string().describe('Initial content (Markdown supported)'),
      template: z.enum(['blank', 'report', 'proposal', 'letter']).optional(),
    }),
    requiresApproval: false,
    icon: 'IconFilePlus',
    uiComponent: 'DocumentCreatedTool',
    tags: ['create', 'new', 'document']
  },

  update_document: {
    name: 'update_document',
    category: 'docs',
    description: 'Update document content.',
    inputSchema: z.object({
      documentId: z.string(),
      content: z.string().describe('New content'),
      append: z.boolean().default(false).describe('Append instead of replace'),
    }),
    requiresApproval: false,
    icon: 'IconFileTextAi',
    tags: ['update', 'edit', 'modify']
  },

  add_section: {
    name: 'add_section',
    category: 'docs',
    description: 'Add a new section to the document.',
    inputSchema: z.object({
      documentId: z.string(),
      heading: z.string(),
      content: z.string(),
      level: z.number().min(1).max(6).default(2),
      position: z.enum(['start', 'end', 'after_current']).default('end'),
    }),
    requiresApproval: false,
    icon: 'IconTextPlus',
    tags: ['section', 'heading', 'add']
  },
}

// ============================================================================
// UI TOOLS
// ============================================================================

export const UI_TOOLS: Record<string, ToolDefinition> = {
  navigate_to_tab: {
    name: 'navigate_to_tab',
    category: 'ui',
    description: 'Switch to a specific application tab. Use after creating content to show it.',
    inputSchema: z.object({
      tab: z.enum(['chat', 'excel', 'doc', 'pdf', 'gallery']).describe('Tab to navigate to'),
      artifactId: z.string().optional().describe('Artifact to select after navigation'),
    }),
    requiresApproval: false,
    icon: 'IconLayoutNavbar',
    tags: ['navigate', 'tab', 'switch']
  },

  select_artifact: {
    name: 'select_artifact',
    category: 'ui',
    description: 'Select and display an artifact.',
    inputSchema: z.object({
      artifactId: z.string().describe('Artifact ID'),
      openInFullTab: z.boolean().default(false),
    }),
    requiresApproval: false,
    icon: 'IconPointer',
    tags: ['select', 'open', 'view']
  },

  show_notification: {
    name: 'show_notification',
    category: 'ui',
    description: 'Show a notification to the user.',
    inputSchema: z.object({
      message: z.string(),
      type: z.enum(['info', 'success', 'warning', 'error']).default('info'),
      duration: z.number().optional(),
    }),
    requiresApproval: false,
    icon: 'IconBell',
    tags: ['notification', 'alert', 'message']
  },
}

// ============================================================================
// WEB TOOLS
// ============================================================================

export const WEB_TOOLS: Record<string, ToolDefinition> = {
  web_search: {
    name: 'web_search',
    category: 'web',
    description: 'Search the web for information.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      maxResults: z.number().default(5),
    }),
    requiresApproval: false,
    icon: 'IconWorldSearch',
    uiComponent: 'WebSearchTool',
    tags: ['search', 'web', 'internet']
  },

  web_fetch: {
    name: 'web_fetch',
    category: 'web',
    description: 'Fetch content from a URL.',
    inputSchema: z.object({
      url: z.string().url().describe('URL to fetch'),
      extractText: z.boolean().default(true),
    }),
    requiresApproval: false,
    icon: 'IconLink',
    uiComponent: 'WebFetchTool',
    tags: ['fetch', 'url', 'page']
  },
}

// ============================================================================
// ALL TOOLS
// ============================================================================

export const ALL_TOOLS: Record<string, ToolDefinition> = {
  ...EXCEL_TOOLS,
  ...PDF_TOOLS,
  ...DOCS_TOOLS,
  ...UI_TOOLS,
  ...WEB_TOOLS,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getToolsByCategory(category: ToolCategory): ToolDefinition[] {
  return Object.values(ALL_TOOLS).filter(tool => tool.category === category)
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return ALL_TOOLS[name]
}

export function toolRequiresApproval(name: string): boolean {
  const tool = ALL_TOOLS[name]
  return tool?.requiresApproval ?? false
}

export function getToolIcon(name: string): string {
  return ALL_TOOLS[name]?.icon ?? 'IconTool'
}

export function getToolUIComponent(name: string): string | undefined {
  return ALL_TOOLS[name]?.uiComponent
}

// Tools that require user confirmation (like Claude for Excel)
export const TOOLS_REQUIRING_CONFIRMATION = new Set([
  // External data fetch (from Claude for Excel)
  'WEBSERVICE',
  'STOCKHISTORY',
  'STOCKSERIES',
  // Import operations
  'IMPORTDATA',
  'IMPORTXML',
  'IMPORTHTML',
  // File system access
  'IMAGE',
  'FILES',
  'DIRECTORY',
  'FOPEN',
  // Code execution
  'CALL',
  'EVALUATE',
  'FORMULA',
])
