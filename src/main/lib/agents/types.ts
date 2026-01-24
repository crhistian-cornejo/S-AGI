/**
 * Agent Types and Interfaces
 */

import type { UIMessageStreamWriter } from 'ai'
import type { PageContent } from '../documents/document-processor'

/**
 * Base context type that satisfies Record<string, unknown>
 */
export type AgentContext = {
    /** Current user ID */
    userId: string
    /** Current chat ID */
    chatId: string
    /** API key for AI provider */
    apiKey?: string
    /** Current artifact ID (spreadsheet, document, or PDF being worked on) */
    artifactId?: string
    /** Current PDF path for PDF agent */
    pdfPath?: string
    /** Extracted PDF pages for context */
    pdfPages?: PageContent[]
    /** Full extracted text */
    pdfContent?: string
    /** Stream writer for UI updates */
    writer?: UIMessageStreamWriter
    /** Additional metadata */
    metadata?: Record<string, unknown>
    /** Index signature for compatibility */
    [key: string]: unknown
}

/**
 * Tool definitions for agents
 */
export interface AgentTools {
    [key: string]: {
        description: string
        inputSchema: unknown
        execute: (args: unknown, context?: AgentContext) => Promise<unknown>
    }
}

/**
 * Excel/Spreadsheet specific context
 */
export type ExcelContext = AgentContext & {
    /** Current workbook ID */
    workbookId?: string
    /** Current sheet ID */
    sheetId?: string
    /** Selected cell range */
    selectedRange?: string
}

/**
 * Document specific context
 */
export type DocsContext = AgentContext & {
    /** Current document ID */
    documentId?: string
    /** Document title */
    documentTitle?: string
    /** Selected text */
    selectedText?: string
}

/**
 * PDF specific context
 */
export type PDFContext = AgentContext & {
    /** PDF file path */
    pdfPath: string
    /** Extracted pages with content */
    pages: PageContent[]
    /** Current page number */
    currentPage?: number
    /** Selected text from PDF */
    selectedText?: string
    /** Vector store ID if using OpenAI */
    vectorStoreId?: string
}

/**
 * Citation result from PDF search
 */
export interface PDFCitation {
    text: string
    pageNumber: number
    filename: string
    citationId: number
}

/**
 * Agent handoff instruction
 */
export interface HandoffInstruction {
    targetAgent: string
    context?: string
    reason?: string
    data?: Record<string, unknown>
}
