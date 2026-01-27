/**
 * Agent Configuration - Centralized agent definitions and shared settings
 *
 * Based on midday patterns for multi-agent orchestration with handoffs
 * Inspired by Claude for Excel's specialized spreadsheet agent
 */

// ============================================================================
// AGENT TYPES
// ============================================================================

export type AgentType =
  | 'orchestrator'  // Triage/router agent
  | 'excel'         // Spreadsheet specialist
  | 'pdf'           // PDF analysis specialist
  | 'docs'          // Document creation specialist
  | 'chart'         // Visualization specialist
  | 'research'      // Web research specialist

// ============================================================================
// AGENT STATUS (for UI)
// ============================================================================

export type AgentStatus =
  | 'idle'
  | 'routing'      // Orchestrator deciding which agent
  | 'executing'    // Agent executing tools
  | 'completing'   // Agent finishing up

export interface AgentStatusInfo {
  status: AgentStatus
  agent: AgentType
  message?: string
  toolCall?: {
    name: string
    stage: 'starting' | 'running' | 'completed' | 'failed'
  }
}

// ============================================================================
// AGENT METADATA
// ============================================================================

export interface AgentMetadata {
  name: string
  displayName: string
  description: string
  icon: string
  color: string
  /** Keywords that trigger routing to this agent */
  keywords: string[]
  /** Regex patterns for routing */
  patterns: RegExp[]
  /** Default model for this agent */
  defaultModel: string
  /** Max turns before stopping */
  maxTurns: number
  /** Temperature for this agent */
  temperature: number
}

export const AGENT_METADATA: Record<AgentType, AgentMetadata> = {
  orchestrator: {
    name: 'Orchestrator',
    displayName: 'Thinking...',
    description: 'Routes requests to specialized agents',
    icon: 'IconBrain',
    color: '#8b5cf6',
    keywords: [],
    patterns: [],
    defaultModel: 'gpt-4o-mini', // Fast for routing decisions
    maxTurns: 3,
    temperature: 0.3
  },
  excel: {
    name: 'ExcelAgent',
    displayName: 'Creating spreadsheet...',
    description: 'Specialist for spreadsheet creation and manipulation',
    icon: 'IconTable',
    color: '#22c55e',
    keywords: [
      'excel', 'spreadsheet', 'hoja de cálculo', 'tabla', 'datos',
      'fórmula', 'celda', 'columna', 'fila', 'csv', 'ordenar',
      'filtrar', 'suma', 'promedio', 'gráfico de datos'
    ],
    patterns: [
      /crea(?:r)?\s+(?:una?\s+)?(?:hoja|tabla|spreadsheet)/i,
      /(?:analiza|calcula|suma|promedia)/i,
      /formato\s+(?:de\s+)?(?:celda|número|moneda)/i
    ],
    defaultModel: 'gpt-4o', // Precise for data operations
    maxTurns: 15,
    temperature: 0.2
  },
  pdf: {
    name: 'PDFAgent',
    displayName: 'Analyzing PDF...',
    description: 'Specialist for PDF analysis and citation',
    icon: 'IconFileTypePdf',
    color: '#ef4444',
    keywords: [
      'pdf', 'página', 'citar', 'documento cargado',
      'buscar en el', 'encontrar en el', 'dice el documento',
      'según el documento', 'en el archivo'
    ],
    patterns: [
      /(?:busca|encuentra|qué dice)\s+(?:en\s+)?(?:el\s+)?(?:pdf|documento)/i,
      /(?:resume|resumen)\s+(?:del?\s+)?(?:pdf|documento)/i,
      /página\s+\d+/i,
      /(?:de acuerdo|según)\s+(?:con\s+)?(?:el\s+)?(?:pdf|documento)/i
    ],
    defaultModel: 'gpt-4o',
    maxTurns: 10,
    temperature: 0.3
  },
  docs: {
    name: 'DocsAgent',
    displayName: 'Writing document...',
    description: 'Specialist for document creation and editing',
    icon: 'IconFileText',
    color: '#3b82f6',
    keywords: [
      'documento', 'informe', 'propuesta', 'ensayo', 'escribir',
      'redactar', 'investigar', 'artículo', 'manual', 'guía',
      'reporte', 'carta', 'memo', 'texto'
    ],
    patterns: [
      /(?:escribe|redacta|genera|crea)\s+(?:un\s+)?(?:documento|informe|propuesta|ensayo)/i,
      /investiga\s+(?:sobre|acerca)/i,
      /(?:actualiza|edita)\s+el\s+documento/i
    ],
    defaultModel: 'gpt-4o',
    maxTurns: 10,
    temperature: 0.5
  },
  chart: {
    name: 'ChartAgent',
    displayName: 'Creating chart...',
    description: 'Specialist for data visualization',
    icon: 'IconChartBar',
    color: '#8b5cf6',
    keywords: [
      'gráfico', 'chart', 'visualización', 'diagrama',
      'barras', 'líneas', 'pastel', 'pie'
    ],
    patterns: [
      /(?:crea|genera|dibuja)\s+(?:un\s+)?(?:gráfico|chart|diagrama)/i,
      /visualiza(?:r)?\s+(?:los\s+)?datos/i
    ],
    defaultModel: 'gpt-4o',
    maxTurns: 5,
    temperature: 0.3
  },
  research: {
    name: 'ResearchAgent',
    displayName: 'Researching...',
    description: 'Specialist for web research and information gathering',
    icon: 'IconWorldSearch',
    color: '#0ea5e9',
    keywords: [
      'busca en internet', 'investiga', 'busca información',
      'qué es', 'quién es', 'cuándo', 'dónde'
    ],
    patterns: [
      /busca(?:r)?\s+(?:en\s+)?(?:internet|web|google)/i,
      /investiga(?:r)?\s+(?:sobre|acerca)/i,
      /(?:qué|quién|cuándo|dónde|cómo)\s+(?:es|fue|será)/i
    ],
    defaultModel: 'gpt-4o-mini',
    maxTurns: 5,
    temperature: 0.5
  }
}

// ============================================================================
// AGENT INSTRUCTIONS TEMPLATES
// ============================================================================

export const AGENT_INSTRUCTIONS = {
  orchestrator: `You are the main orchestrator for S-AGI. Your role is to understand user requests and delegate to the right specialized agent.

## Available Agents:
- **ExcelAgent**: Spreadsheet creation, data analysis, formulas, formatting
- **DocsAgent**: Document writing, reports, proposals, research
- **PDFAgent**: PDF analysis, search, citations, summaries
- **ChartAgent**: Data visualization, graphs, charts
- **ResearchAgent**: Web search, information gathering

## Routing Rules:
1. If PDF is loaded and question relates to its content → PDFAgent
2. If request involves spreadsheets, data, tables → ExcelAgent
3. If request involves writing documents, reports → DocsAgent
4. If request involves creating charts/graphs → ChartAgent
5. If request needs web information → ResearchAgent
6. For unclear requests, ask the user what type of output they expect

## Response Style:
- Be concise when routing
- Provide context to the specialist agent
- Never make up data - use tools to get real information`,

  excel: `You are an expert spreadsheet specialist working with Univer (similar to Excel/Google Sheets).

## Capabilities:
- Create spreadsheets with structured data
- Update cells with values, formulas, and formats
- Apply conditional formatting
- Sort and filter data
- Generate charts from data
- Perform data analysis

## Rules:
1. Always format headers in bold
2. Set appropriate column widths
3. Use formulas when appropriate (SUM, AVERAGE, IF, VLOOKUP, etc.)
4. Apply proper number formats (currency, percentage, date)
5. Use 2 decimal places for financial data
6. Use DD/MM/YYYY format for dates

## Cell References:
- Use A1 format (column letter + row number)
- Ranges: A1:B10
- Formulas start with =

## Response Style:
- Be concise but informative
- Explain what actions you took
- If errors occur, suggest alternatives

## IMPORTANT: After creating a spreadsheet, navigate to the 'excel' tab so the user can see their content.`,

  pdf: `You are an expert PDF analyst with the ability to search, cite, and summarize documents.

## Capabilities:
- Search text within the PDF
- Navigate to specific pages
- Extract content from pages
- Create citations with page numbers
- Summarize document content

## Citation Rules:
1. Always include page numbers in citations
2. Quote relevant text exactly
3. Use format: "Text quote" (Page X)
4. For multiple citations, list them clearly

## Response Style:
- Provide precise answers with citations
- Reference specific pages
- If information isn't in the PDF, say so clearly

## IMPORTANT: When citing, use the cite_pdf tool to create clickable citations.`,

  docs: `You are an expert document writer capable of creating professional content.

## Capabilities:
- Create documents with proper structure
- Write reports, proposals, essays
- Format with headings and sections
- Research and incorporate information

## Document Structure:
1. Use clear headings (H1, H2, H3)
2. Write concise paragraphs
3. Include bullet points for lists
4. Add proper spacing

## Response Style:
- Write professionally
- Use Markdown formatting
- Organize content logically

## IMPORTANT: After creating a document, navigate to the 'doc' tab.`,

  chart: `You are a data visualization expert.

## Capabilities:
- Create various chart types (bar, line, pie, area, scatter)
- Choose appropriate chart types for data
- Configure chart options and styling

## Chart Selection:
- Bar: Comparisons between categories
- Line: Trends over time
- Pie: Parts of a whole
- Area: Cumulative totals
- Scatter: Correlations

## Response Style:
- Recommend the best chart type
- Explain why you chose it
- Describe the visualization`,

  research: `You are a research specialist with web search capabilities.

## Capabilities:
- Search the web for information
- Fetch content from URLs
- Synthesize information from multiple sources
- Provide citations with sources

## Research Rules:
1. Use multiple sources when possible
2. Always cite your sources
3. Distinguish between facts and opinions
4. Note when information might be outdated

## Response Style:
- Provide well-researched answers
- Include source URLs
- Be objective and balanced`
}

// ============================================================================
// SHARED CONFIG (midday pattern)
// ============================================================================

export interface SharedAgentConfig {
  /** Memory settings */
  memory: {
    enabled: boolean
    historyLimit: number
  }
  /** Context formatting */
  contextTemplate: string
  /** Handoff behavior */
  handoff: {
    preserveContext: boolean
    maxHandoffs: number
  }
}

export const SHARED_AGENT_CONFIG: SharedAgentConfig = {
  memory: {
    enabled: true,
    historyLimit: 20
  },
  contextTemplate: `
## Current Context
- User: {userName}
- Timezone: {timezone}
- Date/Time: {dateTime}
- Active Artifact: {artifactName}
- PDF Loaded: {pdfLoaded}
`,
  handoff: {
    preserveContext: true,
    maxHandoffs: 3
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getAgentForMessage(
  message: string,
  context: { hasPDF?: boolean; hasArtifact?: boolean }
): AgentType {
  const lowerMessage = message.toLowerCase()

  // PDF takes priority if loaded and question is about it
  if (context.hasPDF) {
    const pdfMeta = AGENT_METADATA.pdf
    for (const pattern of pdfMeta.patterns) {
      if (pattern.test(message)) return 'pdf'
    }
    for (const keyword of pdfMeta.keywords) {
      if (lowerMessage.includes(keyword)) return 'pdf'
    }
    // Questions with PDF loaded default to PDF agent
    if (message.endsWith('?') && !hasOtherAgentKeywords(lowerMessage)) {
      return 'pdf'
    }
  }

  // Check each agent's keywords and patterns
  const agentOrder: AgentType[] = ['excel', 'docs', 'chart', 'research']

  for (const agentType of agentOrder) {
    const meta = AGENT_METADATA[agentType]

    // Check patterns first (more specific)
    for (const pattern of meta.patterns) {
      if (pattern.test(message)) return agentType
    }

    // Then keywords
    for (const keyword of meta.keywords) {
      if (lowerMessage.includes(keyword)) return agentType
    }
  }

  // Default to orchestrator for routing
  return 'orchestrator'
}

function hasOtherAgentKeywords(lowerMessage: string): boolean {
  const otherKeywords = [
    ...AGENT_METADATA.excel.keywords,
    ...AGENT_METADATA.docs.keywords,
    ...AGENT_METADATA.chart.keywords
  ]
  return otherKeywords.some(kw => lowerMessage.includes(kw))
}

export function getAgentStatusMessage(agent: AgentType, status: AgentStatus): string {
  const meta = AGENT_METADATA[agent]

  switch (status) {
    case 'routing':
      return 'Thinking...'
    case 'executing':
      return meta.displayName
    case 'completing':
      return 'Finishing up...'
    default:
      return ''
  }
}

export function formatContextForAgent(
  _agentType: AgentType,
  context: {
    userName?: string
    timezone?: string
    artifactName?: string
    pdfLoaded?: boolean
  }
): string {
  return SHARED_AGENT_CONFIG.contextTemplate
    .replace('{userName}', context.userName || 'User')
    .replace('{timezone}', context.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
    .replace('{dateTime}', new Date().toLocaleString())
    .replace('{artifactName}', context.artifactName || 'None')
    .replace('{pdfLoaded}', context.pdfLoaded ? 'Yes' : 'No')
}
