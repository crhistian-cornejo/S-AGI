import { z } from 'zod'

// Message role types
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])
export type MessageRole = z.infer<typeof MessageRoleSchema>

// Chat schema
export const ChatSchema = z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    title: z.string(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    archived: z.boolean().optional(),
    pinned: z.boolean().optional(),
    deleted_at: z.string().datetime().nullable().optional()
})
export type Chat = z.infer<typeof ChatSchema>

// Message schema
export const MessageSchema = z.object({
    id: z.string().uuid(),
    chat_id: z.string().uuid(),
    role: MessageRoleSchema,
    content: z.any(), // JSONB content
    tool_calls: z.any().optional(),
    attachments: z.array(z.object({
        id: z.string(),
        name: z.string(),
        size: z.number(),
        type: z.string(),
        url: z.string().optional(),
        preview: z.string().optional()
    })).optional(),
    created_at: z.string().datetime()
})
export type Message = z.infer<typeof MessageSchema>

// Artifact types
export const ArtifactTypeSchema = z.enum(['spreadsheet', 'table', 'chart', 'code', 'document', 'pdf'])
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>

// Artifact schema
export const ArtifactSchema = z.object({
    id: z.string().uuid(),
    chat_id: z.string().uuid(),
    message_id: z.string().uuid().optional(),
    type: ArtifactTypeSchema,
    name: z.string(),
    content: z.any(), // JSONB content
    univer_data: z.any().optional(), // Univer workbook data
    pdf_url: z.string().optional(), // URL for PDF files
    pdf_page_count: z.number().optional(), // Number of pages in PDF
    created_at: z.string().datetime(),
    updated_at: z.string().datetime()
})
export type Artifact = z.infer<typeof ArtifactSchema>

// Tool call types for AI SDK
export interface ToolCall {
    id: string
    name: string
    arguments: Record<string, unknown>
}

export interface ToolResult {
    id: string
    result: unknown
    error?: string
}

// Univer workbook data structure
export interface UniverWorkbookData {
    id: string
    name: string
    sheets: UniverSheetData[]
}

export interface UniverSheetData {
    id: string
    name: string
    cellData: Record<string, Record<string, UniverCellData>>
    rowCount?: number
    columnCount?: number
}

export interface UniverCellData {
    v?: string | number | boolean // value
    f?: string // formula
    s?: string // style id
    t?: 'n' | 's' | 'b' | 'f' // type: number, string, boolean, formula
}

// Univer document data structure (for Word-like documents)
export interface UniverDocumentData {
    id: string
    title?: string
    body: {
        dataStream: string
        textRuns?: Array<{
            st: number
            ed: number
            ts?: Record<string, any>
        }>
        paragraphs?: Array<{
            startIndex: number
            paragraphStyle?: Record<string, any>
        }>
    }
    documentStyle?: {
        pageSize?: {
            width: number
            height: number
        }
        marginTop?: number
        marginBottom?: number
        marginLeft?: number
        marginRight?: number
    }
}
