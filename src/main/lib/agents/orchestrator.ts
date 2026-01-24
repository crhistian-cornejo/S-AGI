/**
 * Orchestrator Agent - Routes to specialized agents
 *
 * Handles:
 * - Automatic routing based on context and message content
 * - Handoffs between agents
 * - Maintaining conversation context across agents
 */

import { Agent, handoff } from '@ai-sdk-tools/agents'
import type { LanguageModel } from 'ai'
import type { AgentContext, ExcelContext, DocsContext, PDFContext } from './types'
import { createExcelAgent } from './excel-agent'
import { createDocsAgent } from './docs-agent'
import { createPDFAgent } from './pdf-agent'
import log from 'electron-log'

/**
 * Orchestrator Instructions
 */
const ORCHESTRATOR_INSTRUCTIONS = `Eres el orquestador principal de S-AGI. Tu rol es entender las solicitudes del usuario y delegarlas al agente especializado correcto.

## Agentes disponibles:

### ExcelAgent (Hojas de cálculo)
Usa cuando el usuario quiera:
- Crear o editar spreadsheets/hojas de cálculo
- Analizar datos numéricos
- Crear tablas con fórmulas
- Ordenar, filtrar o formatear datos
- Exportar a CSV

Palabras clave: excel, spreadsheet, hoja de cálculo, tabla, datos, fórmula, celda, columna, fila

### DocsAgent (Documentos)
Usa cuando el usuario quiera:
- Crear documentos de texto (informes, propuestas, ensayos)
- Investigar temas y generar contenido
- Editar o formatear documentos
- Crear contenido estructurado con secciones

Palabras clave: documento, informe, propuesta, ensayo, escribir, redactar, investigar, artículo

### PDFAgent (PDFs)
Usa cuando el usuario quiera:
- Hacer preguntas sobre un PDF cargado
- Buscar información en un PDF
- Resumir un PDF
- Extraer secciones de un PDF
- Navegar páginas de un PDF

Palabras clave: pdf, buscar en el documento, página, citar, resumir PDF

## Reglas de routing:

1. Si hay un PDF activo y la pregunta es sobre su contenido → PDFAgent
2. Si pide crear/editar hojas de cálculo → ExcelAgent
3. Si pide crear/editar documentos de texto → DocsAgent
4. Si no está claro, pregunta al usuario qué tipo de resultado espera

## Respuesta directa:
Para preguntas generales que no requieren herramientas especializadas, responde directamente sin delegar.

## Handoffs:
Cuando delegues, proporciona contexto relevante al agente especializado.`

/**
 * Pattern matching for agent routing
 */
const ROUTING_PATTERNS = {
    excel: {
        keywords: [
            'excel', 'spreadsheet', 'hoja de cálculo', 'tabla', 'datos',
            'fórmula', 'celda', 'columna', 'fila', 'csv', 'ordenar datos',
            'filtrar', 'suma', 'promedio', 'gráfico de datos'
        ],
        patterns: [
            /crea(?:r)?\s+(?:una?\s+)?(?:hoja|tabla|spreadsheet)/i,
            /(?:analiza|calcula|suma|promedia)/i,
            /formato\s+(?:de\s+)?(?:celda|número|moneda)/i
        ]
    },
    docs: {
        keywords: [
            'documento', 'informe', 'propuesta', 'ensayo', 'escribir',
            'redactar', 'investigar', 'artículo', 'manual', 'guía',
            'reporte', 'carta', 'memo', 'texto'
        ],
        patterns: [
            /(?:escribe|redacta|genera|crea)\s+(?:un\s+)?(?:documento|informe|propuesta|ensayo)/i,
            /investiga\s+(?:sobre|acerca)/i,
            /(?:actualiza|edita)\s+el\s+documento/i
        ]
    },
    pdf: {
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
        ]
    }
}

/**
 * Determine which agent should handle a message
 */
export function routeMessage(
    message: string,
    context: AgentContext
): 'excel' | 'docs' | 'pdf' | 'direct' {
    const lowerMessage = message.toLowerCase()

    // If there's an active PDF and the question seems related to document content
    if (context.pdfPages && context.pdfPages.length > 0) {
        // Check for PDF-specific patterns first
        for (const pattern of ROUTING_PATTERNS.pdf.patterns) {
            if (pattern.test(message)) {
                return 'pdf'
            }
        }

        // Check for PDF keywords
        for (const keyword of ROUTING_PATTERNS.pdf.keywords) {
            if (lowerMessage.includes(keyword)) {
                return 'pdf'
            }
        }

        // If user is asking a question and has a PDF loaded, assume PDF context
        if (message.endsWith('?') && !hasOtherAgentKeywords(lowerMessage)) {
            return 'pdf'
        }
    }

    // Check Excel patterns
    for (const pattern of ROUTING_PATTERNS.excel.patterns) {
        if (pattern.test(message)) {
            return 'excel'
        }
    }
    for (const keyword of ROUTING_PATTERNS.excel.keywords) {
        if (lowerMessage.includes(keyword)) {
            return 'excel'
        }
    }

    // Check Docs patterns
    for (const pattern of ROUTING_PATTERNS.docs.patterns) {
        if (pattern.test(message)) {
            return 'docs'
        }
    }
    for (const keyword of ROUTING_PATTERNS.docs.keywords) {
        if (lowerMessage.includes(keyword)) {
            return 'docs'
        }
    }

    // Default to direct response
    return 'direct'
}

/**
 * Check if message has keywords for other agents (not PDF)
 */
function hasOtherAgentKeywords(lowerMessage: string): boolean {
    const otherKeywords = [
        ...ROUTING_PATTERNS.excel.keywords,
        ...ROUTING_PATTERNS.docs.keywords
    ]

    return otherKeywords.some(kw => lowerMessage.includes(kw))
}

/**
 * Create the Orchestrator Agent with handoffs to specialists
 */
export function createOrchestratorAgent(
    model: LanguageModel,
    context: AgentContext
): Agent<AgentContext> {
    // Create specialized agents
    const excelAgent = createExcelAgent(model, context as ExcelContext)
    const docsAgent = createDocsAgent(model, context as DocsContext)

    // Create PDF agent if we have PDF context
    const pdfContext = context.pdfPages && context.pdfPages.length > 0
        ? {
            ...context,
            pdfPath: context.pdfPath || 'loaded.pdf',
            pages: context.pdfPages
        } as PDFContext
        : null

    const pdfAgent = pdfContext ? createPDFAgent(model, pdfContext) : null

    // Build handoffs array with explicit any typing for mixed agent contexts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentHandoffs: any[] = [
        handoff(excelAgent, {
            onHandoff: async () => {
                log.info('[Orchestrator] Handing off to ExcelAgent')
            }
        }),
        handoff(docsAgent, {
            onHandoff: async () => {
                log.info('[Orchestrator] Handing off to DocsAgent')
            }
        })
    ]

    if (pdfAgent) {
        agentHandoffs.push(handoff(pdfAgent, {
            onHandoff: async () => {
                log.info('[Orchestrator] Handing off to PDFAgent')
            }
        }))
    }

    // Add PDF context to instructions if available
    let instructions = ORCHESTRATOR_INSTRUCTIONS
    if (pdfContext) {
        instructions += `\n\n## CONTEXTO ACTUAL:\nHay un PDF cargado con ${pdfContext.pages.length} páginas. Para preguntas sobre el contenido del PDF, usa el PDFAgent.`
    }

    return new Agent({
        name: 'Orchestrator',
        model,
        instructions,
        handoffs: agentHandoffs,
        // Programmatic routing
        matchOn: (message: string) => {
            const route = routeMessage(message, context)
            log.info(`[Orchestrator] Route decision: ${route}`)
            // Return true to let the orchestrator handle initial routing
            return true
        },
        maxTurns: 5,
        temperature: 0.5
    })
}

// Singleton management
let orchestratorInstance: Agent<AgentContext> | null = null

export const OrchestratorAgent = {
    /**
     * Get or create the orchestrator
     */
    getInstance(model: LanguageModel, context: AgentContext): Agent<AgentContext> {
        // Always create new instance when context changes significantly
        orchestratorInstance = createOrchestratorAgent(model, context)
        return orchestratorInstance
    },

    /**
     * Route a message to the appropriate agent
     */
    route(message: string, context: AgentContext): 'excel' | 'docs' | 'pdf' | 'direct' {
        return routeMessage(message, context)
    },

    /**
     * Reset the orchestrator
     */
    reset(): void {
        orchestratorInstance = null
    }
}
