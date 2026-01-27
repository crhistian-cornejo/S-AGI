/**
 * Orchestrator Agent - Routes to specialized agents
 *
 * Based on midday patterns for multi-agent orchestration with handoffs
 * Uses centralized configuration from @s-agi/core
 *
 * Handles:
 * - Automatic routing based on context and message content
 * - Handoffs between agents
 * - Maintaining conversation context across agents
 * - Progressive artifact stages
 */

import { Agent, handoff } from '@ai-sdk-tools/agents'
import type { LanguageModel } from 'ai'
import type { AgentContext, ExcelContext, DocsContext, PDFContext } from './types'
import { createExcelAgent } from './excel-agent'
import { createDocsAgent } from './docs-agent'
import { createPDFAgent } from './pdf-agent'
import log from 'electron-log'
import {
    AGENT_METADATA,
    AGENT_INSTRUCTIONS,
    getAgentForMessage,
    formatContextForAgent,
} from '@s-agi/core'

/**
 * Orchestrator Instructions - using centralized config
 */
const ORCHESTRATOR_INSTRUCTIONS = AGENT_INSTRUCTIONS.orchestrator

/**
 * Get orchestrator metadata from centralized config
 */
const orchestratorMeta = AGENT_METADATA.orchestrator

/**
 * Determine which agent should handle a message
 * Uses centralized routing from @s-agi/core
 */
export function routeMessage(
    message: string,
    context: AgentContext
): 'excel' | 'docs' | 'pdf' | 'direct' {
    const hasPDF = context.pdfPages && context.pdfPages.length > 0
    const hasArtifact = !!context.artifactId

    // Use centralized routing logic
    const agentType = getAgentForMessage(message, { hasPDF, hasArtifact })

    // Map AgentType to route
    switch (agentType) {
        case 'excel':
            return 'excel'
        case 'docs':
            return 'docs'
        case 'pdf':
            return 'pdf'
        case 'orchestrator':
        default:
            return 'direct'
    }
}

/**
 * Create the Orchestrator Agent with handoffs to specialists
 * Uses centralized configuration from @s-agi/core
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
                log.info(`[Orchestrator] Handing off to ${AGENT_METADATA.excel.name}`)
            }
        }),
        handoff(docsAgent, {
            onHandoff: async () => {
                log.info(`[Orchestrator] Handing off to ${AGENT_METADATA.docs.name}`)
            }
        })
    ]

    if (pdfAgent) {
        agentHandoffs.push(handoff(pdfAgent, {
            onHandoff: async () => {
                log.info(`[Orchestrator] Handing off to ${AGENT_METADATA.pdf.name}`)
            }
        }))
    }

    // Format context using centralized template (midday pattern)
    const formattedContext = formatContextForAgent('orchestrator', {
        userName: 'User',
        artifactName: context.artifactId || undefined,
        pdfLoaded: !!pdfContext,
    })

    // Add PDF context to instructions if available
    let instructions = ORCHESTRATOR_INSTRUCTIONS + '\n' + formattedContext
    if (pdfContext) {
        instructions += `\n\n## CONTEXTO ACTUAL:\nHay un PDF cargado con ${pdfContext.pages.length} páginas. Para preguntas sobre el contenido del PDF, usa el PDFAgent.`
    }

    return new Agent({
        name: orchestratorMeta.name,
        model,
        instructions,
        handoffs: agentHandoffs,
        // Programmatic routing using centralized config
        matchOn: (message: string) => {
            const route = routeMessage(message, context)
            log.info(`[Orchestrator] Route decision: ${route}`)
            // Return true to let the orchestrator handle initial routing
            return true
        },
        maxTurns: orchestratorMeta.maxTurns,
        temperature: orchestratorMeta.temperature
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
