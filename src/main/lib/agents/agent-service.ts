/**
 * Agent Service - Integrates specialized agents with the main AI router
 *
 * This service provides:
 * - Agent selection based on context and message content
 * - PDF context management
 * - Streaming integration with tRPC
 */

import type { LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { OrchestratorAgent, routeMessage } from './orchestrator'
import { PDFAgent, createPDFAgent } from './pdf-agent'
import { ExcelAgent, createExcelAgent } from './excel-agent'
import { DocsAgent, createDocsAgent } from './docs-agent'
import type { AgentContext, PDFContext, ExcelContext, DocsContext } from './types'
import { extractTextFromPdfWithPages, type PageContent } from '../documents/document-processor'
import log from 'electron-log'
import { readFile } from 'node:fs/promises'

/**
 * Agent selection result
 */
export interface AgentSelection {
    agent: 'excel' | 'docs' | 'pdf' | 'direct'
    context: AgentContext
    reason: string
}

/**
 * Loaded PDF context for agent use
 */
interface LoadedPDFContext {
    path: string
    pages: PageContent[]
    loadedAt: number
}

// Cache for loaded PDF contexts (per chat)
const pdfContextCache = new Map<string, LoadedPDFContext>()

// Cache TTL: 30 minutes
const PDF_CACHE_TTL_MS = 30 * 60 * 1000

/**
 * Load PDF content into context for agent use
 */
export async function loadPDFContext(
    chatId: string,
    pdfPath: string
): Promise<PageContent[] | null> {
    try {
        // Check cache first
        const cached = pdfContextCache.get(chatId)
        if (cached && cached.path === pdfPath && Date.now() - cached.loadedAt < PDF_CACHE_TTL_MS) {
            log.info(`[AgentService] Using cached PDF context for ${chatId}`)
            return cached.pages
        }

        // Load PDF
        log.info(`[AgentService] Loading PDF context: ${pdfPath}`)
        const buffer = await readFile(pdfPath)
        const result = await extractTextFromPdfWithPages(buffer)

        if (!result || result.pages.length === 0) {
            log.warn(`[AgentService] Failed to extract text from PDF: ${pdfPath}`)
            return null
        }

        // Cache the result
        pdfContextCache.set(chatId, {
            path: pdfPath,
            pages: result.pages,
            loadedAt: Date.now()
        })

        log.info(`[AgentService] Loaded ${result.pages.length} pages from PDF`)
        return result.pages
    } catch (error) {
        log.error(`[AgentService] Error loading PDF:`, error)
        return null
    }
}

/**
 * Clear PDF context for a chat
 */
export function clearPDFContext(chatId: string): void {
    pdfContextCache.delete(chatId)
    log.info(`[AgentService] Cleared PDF context for ${chatId}`)
}

/**
 * Get current PDF context for a chat (if any)
 */
export function getPDFContext(chatId: string): LoadedPDFContext | null {
    const cached = pdfContextCache.get(chatId)
    if (cached && Date.now() - cached.loadedAt < PDF_CACHE_TTL_MS) {
        return cached
    }
    return null
}

/**
 * Select the appropriate agent for a message
 */
export function selectAgent(
    message: string,
    context: AgentContext
): AgentSelection {
    const route = routeMessage(message, context)

    let reason = ''
    switch (route) {
        case 'excel':
            reason = 'Message contains spreadsheet/data keywords'
            break
        case 'docs':
            reason = 'Message requests document creation or editing'
            break
        case 'pdf':
            reason = 'PDF context loaded and question relates to document content'
            break
        default:
            reason = 'General query - using direct response'
    }

    return {
        agent: route,
        context,
        reason
    }
}

/**
 * Create a language model instance from API key
 */
export function createModel(apiKey: string, modelId: string = 'gpt-4o'): LanguageModel {
    const provider = createOpenAI({ apiKey })
    return provider(modelId)
}

/**
 * Execute a specialized agent for a message
 *
 * @param message - User message
 * @param context - Agent context with chat info and any loaded documents
 * @param model - Language model to use
 * @param onToken - Callback for streaming tokens
 * @returns Agent response
 */
export async function executeSpecializedAgent(
    message: string,
    context: AgentContext,
    model: LanguageModel,
    onToken?: (token: string) => void
): Promise<{
    response: string
    citations?: Array<{ pageNumber: number; text: string }>
    toolsUsed?: string[]
}> {
    const selection = selectAgent(message, context)
    log.info(`[AgentService] Selected agent: ${selection.agent} - ${selection.reason}`)

    try {
        switch (selection.agent) {
            case 'pdf': {
                if (!context.pdfPages || context.pdfPages.length === 0) {
                    return {
                        response: 'No hay un PDF cargado para consultar. Por favor, sube un documento primero.',
                        toolsUsed: []
                    }
                }

                const pdfContext: PDFContext = {
                    ...context,
                    pdfPath: context.pdfPath || 'document.pdf',
                    pages: context.pdfPages
                }

                const pdfAgent = createPDFAgent(model, pdfContext)
                const result = await pdfAgent.generate({ prompt: message })

                // Stream the final result if callback provided
                if (onToken && result.text) {
                    onToken(result.text)
                }

                return {
                    response: result.text,
                    toolsUsed: result.toolCalls?.map(tc => tc.toolName) || []
                }
            }

            case 'excel': {
                const excelContext: ExcelContext = {
                    ...context,
                    workbookId: context.artifactId
                }

                const excelAgent = createExcelAgent(model, excelContext)
                const result = await excelAgent.generate({ prompt: message })

                // Stream the final result if callback provided
                if (onToken && result.text) {
                    onToken(result.text)
                }

                return {
                    response: result.text,
                    toolsUsed: result.toolCalls?.map(tc => tc.toolName) || []
                }
            }

            case 'docs': {
                const docsContext: DocsContext = {
                    ...context,
                    documentId: context.artifactId
                }

                const docsAgent = createDocsAgent(model, docsContext)
                const result = await docsAgent.generate({ prompt: message })

                // Stream the final result if callback provided
                if (onToken && result.text) {
                    onToken(result.text)
                }

                return {
                    response: result.text,
                    toolsUsed: result.toolCalls?.map(tc => tc.toolName) || []
                }
            }

            default:
                // Return empty to let the main AI router handle it
                return {
                    response: '',
                    toolsUsed: []
                }
        }
    } catch (error) {
        log.error(`[AgentService] Agent execution failed:`, error)
        throw error
    }
}

/**
 * Check if a message should be handled by a specialized agent
 */
export function shouldUseSpecializedAgent(
    message: string,
    context: AgentContext
): boolean {
    const selection = selectAgent(message, context)
    return selection.agent !== 'direct'
}

/**
 * Export agent instances for direct use
 */
export {
    OrchestratorAgent,
    PDFAgent,
    ExcelAgent,
    DocsAgent
}
