/**
 * S-AGI Specialized Agents
 *
 * Multi-agent orchestration using @ai-sdk-tools/agents
 * - ExcelAgent: Univer Sheets operations
 * - DocsAgent: Univer Documents with research
 * - PDFAgent: PDF context and conversation
 */

export { ExcelAgent, createExcelAgent } from './excel-agent'
export { DocsAgent, createDocsAgent } from './docs-agent'
export { PDFAgent, createPDFAgent } from './pdf-agent'
export { OrchestratorAgent, createOrchestratorAgent } from './orchestrator'

// Agent Service - Integration with AI router
export {
    selectAgent,
    executeSpecializedAgent,
    shouldUseSpecializedAgent,
    loadPDFContext,
    clearPDFContext,
    getPDFContext,
    createModel
} from './agent-service'

// Types
export type {
    AgentContext,
    AgentTools,
    ExcelContext,
    DocsContext,
    PDFContext,
    PDFCitation,
    HandoffInstruction
} from './types'
