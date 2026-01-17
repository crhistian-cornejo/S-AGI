import { z } from 'zod'
import { supabase } from '../../supabase/client'
import log from 'electron-log'

// ============================================================================
// Document Tool Schemas
// ============================================================================

export const DOCUMENT_TOOLS = {
    create_document: {
        description: `Create a new markdown document artifact.
Use this when the user asks you to write a document, report, article, or any text-based content.
The document will be saved and displayed to the user.`,
        inputSchema: z.object({
            name: z.string().describe('Name/title of the document'),
            content: z.string().describe('Markdown content of the document'),
            description: z.string().optional().describe('Brief description of what the document is about')
        })
    },

    update_document: {
        description: `Update an existing document's content.
Use this to modify a document that was previously created.`,
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact to update'),
            content: z.string().describe('New markdown content'),
            appendMode: z.boolean().optional().default(false).describe('If true, append content instead of replacing')
        })
    },

    get_document_content: {
        description: `Get the content of an existing document.
Use this to read a document before making modifications.`,
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact')
        })
    }
} as const

// ============================================================================
// Tool Types
// ============================================================================

export type CreateDocumentInput = z.infer<typeof DOCUMENT_TOOLS.create_document.inputSchema>
export type UpdateDocumentInput = z.infer<typeof DOCUMENT_TOOLS.update_document.inputSchema>
export type GetDocumentContentInput = z.infer<typeof DOCUMENT_TOOLS.get_document_content.inputSchema>

export interface DocumentArtifact {
    id: string
    name: string
    content: string
    description?: string
    created_at: string
    updated_at: string
}

// ============================================================================
// Tool Execution Functions
// ============================================================================

async function executeCreateDocument(
    args: CreateDocumentInput,
    chatId: string,
    _userId: string
): Promise<{ artifactId: string; message: string }> {
    const { name, content, description } = args

    const { data: artifact, error } = await supabase
        .from('artifacts')
        .insert({
            chat_id: chatId,
            type: 'document',
            name,
            content: {
                markdown: content,
                description: description || '',
                wordCount: content.split(/\s+/).length,
                characterCount: content.length
            },
            univer_data: null // Documents don't use Univer
        })
        .select()
        .single()

    if (error) throw new Error(`Failed to create document: ${error.message}`)

    log.info(`[DocTools] Created document artifact: ${artifact.id}`)
    return {
        artifactId: artifact.id,
        message: `Created document "${name}" with ${content.split(/\s+/).length} words`
    }
}

async function executeUpdateDocument(
    args: UpdateDocumentInput,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, content, appendMode } = args

    // Get artifact with ownership check
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')
    if (artifact.type !== 'document') throw new Error('Artifact is not a document')

    const existingContent = artifact.content?.markdown || ''
    const newContent = appendMode ? existingContent + '\n\n' + content : content

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({
            content: {
                markdown: newContent,
                description: artifact.content?.description || '',
                wordCount: newContent.split(/\s+/).length,
                characterCount: newContent.length
            },
            updated_at: new Date().toISOString()
        })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to update document: ${updateError.message}`)

    log.info(`[DocTools] Updated document artifact: ${artifactId}`)
    return {
        artifactId,
        message: appendMode
            ? `Appended content to document (now ${newContent.split(/\s+/).length} words)`
            : `Updated document with ${newContent.split(/\s+/).length} words`
    }
}

async function executeGetDocumentContent(
    args: GetDocumentContentInput,
    userId: string
): Promise<{ artifactId: string; name: string; content: string; wordCount: number }> {
    const { artifactId } = args

    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')
    if (artifact.type !== 'document') throw new Error('Artifact is not a document')

    const content = artifact.content?.markdown || ''

    return {
        artifactId,
        name: artifact.name,
        content,
        wordCount: content.split(/\s+/).length
    }
}

// ============================================================================
// Tool Executor
// ============================================================================

/**
 * Execute a document tool by name
 */
export async function executeDocTool(
    toolName: string,
    args: unknown,
    chatId: string,
    userId: string
): Promise<unknown> {
    log.info(`[DocTools] Executing tool: ${toolName}`, args)

    switch (toolName) {
        case 'create_document': {
            const input = DOCUMENT_TOOLS.create_document.inputSchema.parse(args)
            return executeCreateDocument(input, chatId, userId)
        }

        case 'update_document': {
            const input = DOCUMENT_TOOLS.update_document.inputSchema.parse(args)
            return executeUpdateDocument(input, userId)
        }

        case 'get_document_content': {
            const input = DOCUMENT_TOOLS.get_document_content.inputSchema.parse(args)
            return executeGetDocumentContent(input, userId)
        }

        default:
            throw new Error(`Unknown document tool: ${toolName}`)
    }
}

/**
 * Create document tools for AI SDK
 */
export function createDocTools(chatId: string, userId: string) {
    const createToolDef = <T extends z.ZodType>(name: string, description: string, schema: T) => ({
        description,
        inputSchema: schema,
        execute: async (args: z.infer<T>) => {
            try {
                return await executeDocTool(name, args, chatId, userId)
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                log.error(`[DocTools] Tool ${name} failed:`, error)
                return { error: errorMessage, success: false }
            }
        }
    })

    return {
        create_document: createToolDef(
            'create_document',
            DOCUMENT_TOOLS.create_document.description,
            DOCUMENT_TOOLS.create_document.inputSchema
        ),
        update_document: createToolDef(
            'update_document',
            DOCUMENT_TOOLS.update_document.description,
            DOCUMENT_TOOLS.update_document.inputSchema
        ),
        get_document_content: createToolDef(
            'get_document_content',
            DOCUMENT_TOOLS.get_document_content.description,
            DOCUMENT_TOOLS.get_document_content.inputSchema
        )
    }
}
