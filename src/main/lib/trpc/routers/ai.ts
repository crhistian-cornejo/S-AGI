import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import log from 'electron-log'
import { sendToRenderer } from '../../window-manager'
import { supabase } from '../../supabase/client'
import { getSecureApiKeyStore } from '../../auth/api-key-store'

import OpenAI from 'openai'
import type { Responses } from 'openai/resources/responses/responses'
import { SPREADSHEET_TOOLS, DOCUMENT_TOOLS, PLAN_TOOLS, executeTool } from './tools'
import type { AIStreamEvent, ReasoningConfig, NativeToolsConfig } from '@shared/ai-types'
import { 
    AI_MODELS, 
    DEFAULT_MODELS, 
    getModelById
} from '@shared/ai-types'

// Re-export type for consumers
export type { AIStreamEvent } from '@shared/ai-types'

// Store active streams for cancellation
const activeStreams = new Map<string, AbortController>()

// Maximum number of agent loop steps
const MAX_AGENT_STEPS = 15

const AUTO_TITLE_MAX_LENGTH = 25

function getFallbackTitle(prompt: string) {
    const trimmed = prompt.trim()
    if (!trimmed) return 'New Chat'
    if (trimmed.length <= AUTO_TITLE_MAX_LENGTH) return trimmed
    return `${trimmed.slice(0, AUTO_TITLE_MAX_LENGTH)}...`
}

// System prompt for S-AGI agent
// OPTIMIZATION: OpenAI automatically caches prompts > 1024 tokens
// Keep the static parts at the beginning for maximum cache hits
// @see https://platform.openai.com/docs/guides/prompt-caching
const SYSTEM_PROMPT = `# S-AGI System Instructions
Version: 1.0.0
Role: AI assistant for spreadsheet creation, document writing, and web research

================================================================================
CORE IDENTITY
================================================================================

You are S-AGI, a specialized AI assistant designed to help users create, edit, and analyze spreadsheets and documents. You have access to powerful native tools and custom spreadsheet/document operations.

================================================================================
NATIVE TOOLS (Built-in OpenAI Capabilities)
================================================================================

### Web Search
- Search the web for current information, news, and data
- Use for up-to-date information that may not be in your training data
- Can search specific domains or general web
- Returns URLs and content snippets

### Code Interpreter
- Write and execute Python code for data analysis
- Perform complex calculations and data transformations
- Generate charts and visualizations
- Process and analyze data before creating spreadsheets

### File Search
- Search through uploaded files to find relevant information
- Query vector stores for semantic search
- Extract specific data from documents

================================================================================
SPREADSHEET TOOLS
================================================================================

### Creation & Data Management
- create_spreadsheet: Create new spreadsheets with column headers and initial data
- update_cells: Update multiple cells with new values (batch operation)
- add_row: Add new rows to existing spreadsheets
- delete_row: Delete rows from a spreadsheet
- insert_formula: Insert Excel-style formulas (=SUM, =AVERAGE, =IF, =VLOOKUP, etc.)

### Formatting & Styling
- format_cells: Apply comprehensive formatting including:
  * Text: bold, italic, underline, strikethrough
  * Font: size, color, family
  * Cell: background color, alignment (horizontal/vertical), text wrap
  * Numbers: currency, percentage, date formats
  * Borders: style, color, thickness
- merge_cells: Merge a range of cells into one
- set_column_width: Set width of specific columns
- set_row_height: Set height of specific rows

### Analysis
- get_spreadsheet_summary: Get current state of a spreadsheet
  * Use this FIRST when modifying existing spreadsheets
  * Returns structure, data, and formatting information

================================================================================
DOCUMENT TOOLS
================================================================================

- create_document: Create a new Word-like document with optional initial content
- insert_text: Insert text at the start or end of a document
- replace_document_content: Replace the entire content of a document
- get_document_content: Read a document's current content

================================================================================
WORKFLOW GUIDELINES
================================================================================

1. **Multi-tool Operations**: Execute multiple tools in sequence for complex tasks
2. **Research → Create**: Use web search to gather data, then create spreadsheets
3. **Code → Visualize**: Use code interpreter for analysis, then format results
4. **Context First**: Always use get_spreadsheet_summary or get_document_content before modifications
5. **Parallel Execution**: When possible, batch related operations together

================================================================================
RESPONSE STYLE
================================================================================

- Be concise but helpful
- Use Markdown formatting for clarity
- Explain actions before and after tool use
- For spreadsheets: always format headers (bold) and set column widths
- For documents: use clear structure with headings and lists
- Include source URLs when citing web search results
- Acknowledge errors clearly and suggest alternatives

================================================================================
END OF STATIC INSTRUCTIONS
================================================================================
`

// Plan Mode system prompt - used when mode='plan'
const PLAN_MODE_SYSTEM_PROMPT = `# S-AGI Planning Mode

You are in PLANNING MODE. Your ONLY job is to create a plan and call the ExitPlanMode tool.

## CRITICAL RULES

1. **NEVER output text directly** - ALL your output MUST be through the ExitPlanMode tool
2. **ALWAYS call ExitPlanMode** - This is mandatory, not optional
3. **Plan only, don't execute** - You're creating a roadmap, not doing the work

## HOW TO RESPOND

When the user asks for something:
1. Think about what steps are needed
2. Create a plan in markdown format  
3. Call ExitPlanMode with the plan parameter

## PLAN FORMAT (JSON for the tool)

The plan parameter should be markdown with this structure:

## Summary
[One sentence describing what will be accomplished]

## Steps
1. **[Action name]** - [What will be done and expected result]
2. **[Action name]** - [What will be done and expected result]
3. ...

## Notes
- [Any important considerations]

## EXAMPLE

If user says "Create a sales report", you MUST call:

ExitPlanMode({
  plan: "## Summary\\nCreate a sales report spreadsheet with data and formatting.\\n\\n## Steps\\n1. **Create spreadsheet** - Initialize 'Sales Report' with columns\\n2. **Add headers** - Revenue, Units, Region\\n3. **Insert sample data** - Add example rows\\n4. **Add formulas** - SUM for totals\\n5. **Format cells** - Bold headers, currency format\\n\\n## Notes\\n- Will use update_cells for data entry"
})

## AVAILABLE TOOLS FOR EXECUTION (reference only)

- Spreadsheet: create_spreadsheet, update_cells, insert_formula, format_cells, merge_cells, add_row, delete_row
- Documents: create_document, insert_text, replace_document_content
- Native: web_search, code_interpreter

## REMEMBER

- Do NOT write any text response
- Do NOT explain your plan in chat
- JUST call ExitPlanMode with the plan
- The UI will display your plan beautifully
- User will click "Implement Plan" to execute
`

/**
 * Convert Zod schema to JSON Schema for OpenAI Responses API
 * Note: With strict=true, ALL properties must be in required array.
 * Optional fields must use anyOf with null type.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    return convertZodType(schema)
}

function extractWebSearchDetails(wsEvent: any): {
    action?: 'search' | 'open_page' | 'find_in_page'
    query?: string
    domains?: string[]
    url?: string
} {
    const actionValue = wsEvent?.action
    const actionObj = typeof actionValue === 'object' && actionValue !== null ? actionValue : {}
    const actionType = actionValue === 'search' || actionValue === 'open_page' || actionValue === 'find_in_page'
        ? actionValue
        : actionObj.type === 'search' || actionObj.type === 'open_page' || actionObj.type === 'find_in_page'
            ? actionObj.type
            : undefined

    const queries = Array.isArray(actionObj.queries)
        ? actionObj.queries
        : Array.isArray(wsEvent?.queries)
            ? wsEvent.queries
            : undefined

    const query = typeof actionObj.query === 'string'
        ? actionObj.query
        : typeof wsEvent?.query === 'string'
            ? wsEvent.query
            : queries?.[0]

    const domains = Array.isArray(actionObj.domains)
        ? actionObj.domains
        : Array.isArray(wsEvent?.domains)
            ? wsEvent.domains
            : undefined

    const url = typeof actionObj.url === 'string'
        ? actionObj.url
        : typeof wsEvent?.url === 'string'
            ? wsEvent.url
            : undefined

    return {
        action: actionType,
        query,
        domains,
        url
    }
}

function convertZodType(zodType: z.ZodTypeAny): Record<string, unknown> {
    const description = zodType.description || ''
    
    // Handle ZodOptional
    if (zodType instanceof z.ZodOptional) {
        const inner = convertZodType(zodType._def.innerType)
        return {
            anyOf: [inner, { type: 'null' }],
            description: inner.description || description
        }
    }
    
    // Handle ZodDefault
    if (zodType instanceof z.ZodDefault) {
        const inner = convertZodType(zodType._def.innerType)
        return {
            anyOf: [inner, { type: 'null' }],
            description: inner.description || description
        }
    }
    
    // Handle ZodObject
    if (zodType instanceof z.ZodObject) {
        const shape = zodType.shape
        const properties: Record<string, unknown> = {}
        const required: string[] = []
        
        for (const [key, value] of Object.entries(shape)) {
            const fieldType = value as z.ZodTypeAny
            const isOptional = fieldType instanceof z.ZodOptional || fieldType instanceof z.ZodDefault
            
            if (isOptional) {
                const inner = fieldType instanceof z.ZodOptional 
                    ? convertZodType(fieldType._def.innerType)
                    : convertZodType((fieldType as z.ZodDefault<z.ZodTypeAny>)._def.innerType)
                properties[key] = {
                    anyOf: [inner, { type: 'null' }],
                    description: fieldType.description || inner.description || ''
                }
            } else {
                properties[key] = convertZodType(fieldType)
            }
            
            // ALL fields must be required for strict mode
            required.push(key)
        }
        
        return {
            type: 'object',
            properties,
            required,
            additionalProperties: false,
            description
        }
    }
    
    // Handle ZodArray
    if (zodType instanceof z.ZodArray) {
        return {
            type: 'array',
            items: convertZodType(zodType._def.type),
            description
        }
    }
    
    // Handle ZodEnum
    if (zodType instanceof z.ZodEnum) {
        return {
            type: 'string',
            enum: zodType._def.values,
            description
        }
    }
    
    // Handle ZodUnion
    if (zodType instanceof z.ZodUnion) {
        const options = zodType._def.options as z.ZodTypeAny[]
        // Check if it's a simple union of primitives
        const types = options.map(opt => {
            if (opt instanceof z.ZodString) return 'string'
            if (opt instanceof z.ZodNumber) return 'number'
            if (opt instanceof z.ZodBoolean) return 'boolean'
            if (opt instanceof z.ZodNull) return 'null'
            return 'string'
        })
        
        // If all are the same type, just use that type
        const uniqueTypes = [...new Set(types.filter(t => t !== 'null'))]
        if (uniqueTypes.length === 1) {
            if (types.includes('null')) {
                return {
                    anyOf: [{ type: uniqueTypes[0] }, { type: 'null' }],
                    description
                }
            }
            return { type: uniqueTypes[0], description }
        }
        
        // Multiple types
        return {
            anyOf: options.map(opt => convertZodType(opt)),
            description
        }
    }
    
    // Handle primitives
    if (zodType instanceof z.ZodString) {
        return { type: 'string', description }
    }
    if (zodType instanceof z.ZodNumber) {
        return { type: 'number', description }
    }
    if (zodType instanceof z.ZodBoolean) {
        return { type: 'boolean', description }
    }
    if (zodType instanceof z.ZodNull) {
        return { type: 'null', description }
    }
    
    // Fallback
    return { type: 'string', description }
}

// Type for function tools
type FunctionToolParam = Responses.FunctionTool

/**
 * Create function tools for Responses API
 */
function createFunctionTools(
    chatId: string,
    userId: string
): { tools: FunctionToolParam[]; executors: Map<string, (args: unknown) => Promise<unknown>> } {
    const executors = new Map<string, (args: unknown) => Promise<unknown>>()
    const tools: FunctionToolParam[] = []

    // Add spreadsheet tools
    for (const [name, tool] of Object.entries(SPREADSHEET_TOOLS)) {
        tools.push({
            type: 'function',
            name,
            description: tool.description,
            parameters: zodToJsonSchema(tool.inputSchema) as FunctionToolParam['parameters'],
            strict: true
        })
        executors.set(name, (args) => executeTool(name, args, chatId, userId))
    }

    // Add document tools
    for (const [name, tool] of Object.entries(DOCUMENT_TOOLS)) {
        tools.push({
            type: 'function',
            name,
            description: tool.description,
            parameters: zodToJsonSchema(tool.inputSchema) as FunctionToolParam['parameters'],
            strict: true
        })
        executors.set(name, (args) => executeTool(name, args, chatId, userId))
    }

    return { tools, executors }
}

/**
 * Create plan mode tools for Responses API (only ExitPlanMode)
 */
function createPlanModeTools(
    chatId: string,
    userId: string
): { tools: FunctionToolParam[]; executors: Map<string, (args: unknown) => Promise<unknown>> } {
    const executors = new Map<string, (args: unknown) => Promise<unknown>>()
    const tools: FunctionToolParam[] = []

    // Add plan mode tools
    for (const [name, tool] of Object.entries(PLAN_TOOLS)) {
        tools.push({
            type: 'function',
            name,
            description: tool.description,
            parameters: zodToJsonSchema(tool.inputSchema) as FunctionToolParam['parameters'],
            strict: true
        })
        executors.set(name, (args) => executeTool(name, args, chatId, userId))
    }

    return { tools, executors }
}

// Union type for all tools
type ToolParam = Responses.Tool

/**
 * Build native tools array based on configuration and model support
 */
function buildNativeTools(
    modelId: string,
    config?: NativeToolsConfig
): ToolParam[] {
    const model = getModelById(modelId)
    if (!model) return []

    const tools: ToolParam[] = []

    // Web Search
    if (config?.webSearch !== false && model.supportsNativeWebSearch) {
        const webSearchConfig = typeof config?.webSearch === 'object' ? config.webSearch : {}
        tools.push({
            type: 'web_search_preview',
            search_context_size: webSearchConfig.searchContextSize || 'medium'
        } as ToolParam)
    }

    // Code Interpreter
    if (config?.codeInterpreter && model.supportsCodeInterpreter) {
        tools.push({
            type: 'code_interpreter'
        } as ToolParam)
    }

    // File Search
    if (config?.fileSearch && model.supportsFileSearch) {
        const fileConfig = typeof config.fileSearch === 'object' ? config.fileSearch : {}
        const vectorStoreIds = fileConfig.vectorStoreIds || []
        
        // Only add file_search tool if we have vector store IDs
        if (vectorStoreIds.length > 0) {
            const fileSearchTool: Record<string, any> = {
                type: 'file_search',
                vector_store_ids: vectorStoreIds
            }
            // Only add max_num_results if specified (avoid undefined in JSON)
            if (fileConfig.maxResults) {
                fileSearchTool.max_num_results = fileConfig.maxResults
            }
            tools.push(fileSearchTool as ToolParam)
        } else {
            log.warn('[AI] file_search enabled but no vector_store_ids provided - skipping tool')
        }
    }

    return tools
}

/**
 * Get list of all available tool names
 */
function getAllToolNames(options: { 
    modelId?: string
    nativeTools?: NativeToolsConfig 
}): string[] {
    const { modelId, nativeTools } = options
    const model = modelId ? getModelById(modelId) : undefined
    
    const tools = [
        ...Object.keys(SPREADSHEET_TOOLS),
        ...Object.keys(DOCUMENT_TOOLS)
    ]
    
    // Add native tools based on model and config
    if (model?.supportsNativeWebSearch && nativeTools?.webSearch !== false) {
        tools.push('web_search')
    }
    if (model?.supportsCodeInterpreter && nativeTools?.codeInterpreter) {
        tools.push('code_interpreter')
    }
    if (model?.supportsFileSearch && nativeTools?.fileSearch) {
        tools.push('file_search')
    }
    
    return tools
}

/**
 * Sanitize API error messages to remove sensitive information
 */
function sanitizeApiError(errorText: string): string {
    return errorText.replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
}

// Types for input content

/**
 * Convert internal messages to Responses API format
 */
function toResponsesMessages(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    currentPrompt: string,
    images?: Array<{ type: 'image'; data: string; mediaType: string }>
): Array<Responses.ResponseInputItem> {
    const result: Array<Responses.ResponseInputItem> = []

    // Add previous messages
    for (const msg of messages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            result.push({
                type: 'message',
                role: msg.role,
                content: msg.content
            } as Responses.ResponseInputItem)
        }
    }

    // Add current message with optional images
    if (images?.length) {
        const content: Array<Responses.ResponseInputContent> = [
            ...images.map(img => ({
                type: 'input_image' as const,
                image_url: `data:${img.mediaType};base64,${img.data}`,
                detail: 'auto' as const
            })),
            { type: 'input_text' as const, text: currentPrompt }
        ]
        result.push({
            type: 'message',
            role: 'user',
            content
        } as Responses.ResponseInputItem)
    } else {
        result.push({
            type: 'message',
            role: 'user',
            content: currentPrompt
        } as Responses.ResponseInputItem)
    }

    return result
}

// Type for pending tool calls we need to track
interface PendingToolCall {
    callId: string
    name: string
    arguments: string
}

export const aiRouter = router({
    // Get AI status with available models and tools
    getStatus: protectedProcedure
        .input(z.object({
            modelId: z.string().optional(),
            nativeTools: z.object({
                webSearch: z.boolean().optional(),
                codeInterpreter: z.boolean().optional(),
                fileSearch: z.boolean().optional()
            }).optional()
        }).optional())
        .query(({ input }) => {
            return {
                availableProviders: ['openai'] as const,
                availableModels: AI_MODELS,
                availableTools: getAllToolNames({
                    modelId: input?.modelId,
                    nativeTools: input?.nativeTools
                }),
                supportsReasoning: input?.modelId ? getModelById(input.modelId)?.supportsReasoning ?? false : false
            }
        }),

    // Stream chat with AI using OpenAI Responses API
    // Implements Agent Loop with native tools, reasoning, and function calling
    chat: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            prompt: z.string(),
            mode: z.enum(['plan', 'agent']).default('agent'),
            provider: z.enum(['openai']).default('openai'),
            apiKey: z.string(),
            tavilyApiKey: z.string().optional(),
            model: z.string().optional(),
            messages: z.array(z.object({
                role: z.enum(['user', 'assistant', 'system']),
                content: z.string()
            })).optional(),
            images: z.array(z.object({
                type: z.literal('image'),
                data: z.string(),
                mediaType: z.string()
            })).optional(),
            // Responses API specific
            reasoning: z.object({
                effort: z.enum(['low', 'medium', 'high']),
                summary: z.enum(['auto', 'concise', 'detailed']).optional(),
                maxReasoningTokens: z.number().optional()
            }).optional(),
            nativeTools: z.object({
                webSearch: z.union([
                    z.boolean(),
                    z.object({ searchContextSize: z.enum(['low', 'medium', 'high']).optional() })
                ]).optional(),
                codeInterpreter: z.union([
                    z.boolean(),
                    z.object({ containerType: z.enum(['auto', 'python', 'javascript']).optional() })
                ]).optional(),
                fileSearch: z.union([
                    z.boolean(),
                    z.object({ 
                        vectorStoreIds: z.array(z.string()).optional(),
                        maxResults: z.number().optional()
                    })
                ]).optional()
            }).optional(),
            previousResponseId: z.string().optional(),
            // Cost optimization options
            optimization: z.object({
                /** Maximum output tokens (controls response length and cost) */
                maxOutputTokens: z.number().optional(),
                /** Use flex processing for 50% cost savings (slower, may fail if busy) */
                useFlex: z.boolean().optional(),
                /** Truncation strategy for context window management */
                truncation: z.object({
                    type: z.enum(['auto', 'disabled']).optional()
                }).optional()
            }).optional()
        }))
        .mutation(async ({ ctx, input }) => {
            // Validate user has access to this chat
            const { data: chat, error } = await supabase
                .from('chats')
                .select('id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()

            if (error || !chat) {
                log.error('[AI] Chat access denied:', { chatId: input.chatId, userId: ctx.userId, error })
                throw new Error('Chat not found or access denied')
            }

            // Cancel existing stream for this chat if any
            if (activeStreams.has(input.chatId)) {
                activeStreams.get(input.chatId)?.abort()
                activeStreams.delete(input.chatId)
            }

            const abortController = new AbortController()
            activeStreams.set(input.chatId, abortController)

            const emit = (event: AIStreamEvent) => {
                sendToRenderer('ai:stream', event)
            }

            const runAgentLoop = async () => {
                const startTime = Date.now()
                try {
                    const modelId = input.model || DEFAULT_MODELS.openai
                    const modelDef = getModelById(modelId)
                    
                    log.info(`[AI] Starting Responses API agent loop with ${modelId}`)
                    log.info(`[AI] Reasoning config:`, input.reasoning)
                    if (input.images?.length) {
                        log.info(`[AI] Including ${input.images.length} image(s)`)
                    }

                    // Create OpenAI client
                    const client = new OpenAI({
                        apiKey: input.apiKey
                    })

                    // Build tools based on mode
                    const { tools: functionTools, executors } = input.mode === 'plan'
                        ? createPlanModeTools(input.chatId, ctx.userId)
                        : createFunctionTools(input.chatId, ctx.userId)
                    
                    // Select system prompt based on mode
                    let systemPrompt = input.mode === 'plan' ? PLAN_MODE_SYSTEM_PROMPT : SYSTEM_PROMPT
                    
                    // Build native tools configuration
                    let nativeToolsConfig = input.nativeTools
                    
                    log.info(`[AI] nativeTools input:`, JSON.stringify(nativeToolsConfig))
                    log.info(`[AI] Model ${modelId} supportsFileSearch: ${modelDef?.supportsFileSearch}`)

                    // Track if we should force file_search for document queries
                    let shouldForceFileSearch = false
                    
                    // Helper function to detect if query is about uploaded documents
                    const isDocumentQuery = (prompt: string): boolean => {
                        const docPatterns = [
                            // English patterns
                            /\b(the\s+)?(pdf|document|file|attachment|uploaded)/i,
                            /\b(summarize|summary|resume|resumen)/i,
                            /\b(what\s+does\s+it\s+say|what\s+is\s+in|read\s+the|analyze)/i,
                            /\b(extract|content|contents|information\s+from)/i,
                            // Spanish patterns
                            /\b(el\s+)?(pdf|documento|archivo|adjunto)/i,
                            /\b(qué\s+dice|qué\s+contiene|lee\s+el|analiza)/i,
                            /\b(extrae|contenido|información\s+del)/i,
                        ]
                        return docPatterns.some(pattern => pattern.test(prompt))
                    }

                    // Automatically enable file search if chat has a vector store (Knowledge Base)
                    // This allows the AI to search uploaded documents without explicit frontend request
                    if (modelDef?.supportsFileSearch) {
                        const { data: chatData } = await supabase
                            .from('chats')
                            .select('openai_vector_store_id')
                            .eq('id', input.chatId)
                            .single()
                        
                        if (chatData?.openai_vector_store_id) {
                            log.info(`[AI] Chat has Knowledge Base, auto-enabling file search with vector store: ${chatData.openai_vector_store_id}`)
                            
                            // Check if the current prompt seems to be about uploaded documents
                            shouldForceFileSearch = isDocumentQuery(input.prompt)
                            log.info(`[AI] Query "${input.prompt.substring(0, 50)}..." - isDocumentQuery: ${shouldForceFileSearch}`)
                            
                            nativeToolsConfig = {
                                ...nativeToolsConfig,
                                fileSearch: {
                                    ...(typeof nativeToolsConfig?.fileSearch === 'object' ? nativeToolsConfig.fileSearch : {}),
                                    vectorStoreIds: [chatData.openai_vector_store_id]
                                },
                                // CRITICAL: Disable web_search when query is about documents to force file_search
                                ...(shouldForceFileSearch && { webSearch: false })
                            }
                            
                            if (shouldForceFileSearch) {
                                log.info(`[AI] Disabled web_search to force file_search for document query`)
                            }
                            
                            // Get list of uploaded files to inform the model
                            const { data: chatFiles } = await supabase
                                .from('chat_files')
                                .select('filename, file_size, content_type')
                                .eq('chat_id', input.chatId)
                                .order('created_at', { ascending: false })
                            
                            if (chatFiles && chatFiles.length > 0) {
                                const fileList = chatFiles.map(f => `- ${f.filename}`).join('\n')
                                const knowledgeBaseContext = `

================================================================================
KNOWLEDGE BASE - UPLOADED DOCUMENTS
================================================================================

The user has uploaded the following documents to this conversation:

${fileList}

These documents are indexed in your file_search tool. When the user asks about these documents, use the file_search tool to retrieve their contents.
`
                                systemPrompt = systemPrompt + knowledgeBaseContext
                                log.info(`[AI] Added Knowledge Base context with ${chatFiles.length} files to system prompt`)
                            }
                        }
                    }

                    const nativeTools = buildNativeTools(modelId, nativeToolsConfig)
                    const allTools: ToolParam[] = [...functionTools, ...nativeTools]
                    
                    log.info(`[AI] Tools: ${allTools.length} (${functionTools.length} function, ${nativeTools.length} native)`)
                    
                    // Log native tools detail for debugging
                    if (nativeTools.length > 0) {
                        log.info(`[AI] Native tools detail:`, JSON.stringify(nativeTools, null, 2))
                    }

                    // Build messages
                    const messages = toResponsesMessages(
                        input.messages || [],
                        input.prompt,
                        input.images
                    )

                    // Determine reasoning config
                    const reasoningConfig: ReasoningConfig | undefined = modelDef?.supportsReasoning
                        ? input.reasoning
                        : undefined
                    
                    log.info(`[AI] Final reasoning config:`, reasoningConfig)

                    let currentStepNumber = 0
                    let fullText = ''
                    let fullReasoningSummary = ''
                    let currentResponseId = input.previousResponseId
                    let pendingToolCalls: PendingToolCall[] = []
                    const usageTotals = {
                        promptTokens: 0,
                        completionTokens: 0,
                        reasoningTokens: 0
                    }

                    // Agent loop
                    while (currentStepNumber < MAX_AGENT_STEPS) {
                        currentStepNumber++
                        const stepStartTime = Date.now()
                        log.info(`[AI] Step ${currentStepNumber} starting...`)

                        // Build input for this iteration
                        let inputForRequest: Responses.ResponseCreateParams['input']
                        
                        if (currentResponseId && pendingToolCalls.length > 0) {
                            // Submit tool outputs
                            inputForRequest = pendingToolCalls.map(tc => ({
                                type: 'function_call_output' as const,
                                call_id: tc.callId,
                                output: tc.arguments // This contains the result after execution
                            }))
                        } else {
                            inputForRequest = messages
                        }

                        // Build optimization options
                        const optimization = input.optimization || {}
                        const maxOutputTokens = optimization.maxOutputTokens
                        const truncation = optimization.truncation?.type || 'auto'

                        // Stream the response using the official SDK
                        const streamParams: any = {
                            model: modelId,
                            input: inputForRequest,
                            tools: allTools.length > 0 ? allTools : undefined,
                            instructions: systemPrompt,
                            store: true,
                            previous_response_id: currentResponseId,
                            reasoning: reasoningConfig ? {
                                effort: reasoningConfig.effort,
                                summary: reasoningConfig.summary
                            } : undefined,
                            // Cost optimization parameters
                            ...(maxOutputTokens && { max_output_tokens: maxOutputTokens }),
                            truncation: truncation,
                            // Use flex processing if requested (50% cost savings)
                            ...(optimization.useFlex && { service_tier: 'flex' }),
                            // Force file_search tool when query is about uploaded documents
                            // Only on first step to avoid interfering with tool result handling
                            ...(shouldForceFileSearch && currentStepNumber === 1 && { 
                                tool_choice: { type: 'file_search' }
                            })
                        }

                        log.info(`[AI] Stream params: maxOutputTokens=${maxOutputTokens}, truncation=${truncation}, flex=${!!optimization.useFlex}, tool_choice=${shouldForceFileSearch && currentStepNumber === 1 ? 'file_search' : 'auto'}`)

                        const stream = client.responses.stream(streamParams, {
                            signal: abortController.signal,
                            // Increase timeout for flex processing (can be slower)
                            ...(optimization.useFlex && { timeout: 900_000 }) // 15 minutes
                        })

                        pendingToolCalls = []
                        let hasToolCalls = false

                        // Handle stream events
                        stream
                            .on('response.created', (event) => {
                                log.info(`[AI] Stream: response.created, id=${event.response.id}`)
                                currentResponseId = event.response.id
                            })
                            .on('response.output_text.delta', (event) => {
                                fullText += event.delta
                                emit({ type: 'text-delta', delta: event.delta })
                            })
                            .on('response.reasoning_summary_text.delta', (event) => {
                                if (fullReasoningSummary.length === 0) {
                                    log.info(`[AI] Stream: First reasoning delta received`)
                                }
                                fullReasoningSummary += event.delta
                                emit({ 
                                    type: 'reasoning-summary-delta', 
                                    delta: event.delta,
                                    summaryIndex: event.summary_index
                                })
                            })
                            .on('response.reasoning_summary_text.done', (event) => {
                                log.info(`[AI] Stream: Reasoning summary done, ${event.text?.length || 0} chars`)
                                emit({ 
                                    type: 'reasoning-summary-done', 
                                    text: event.text,
                                    summaryIndex: event.summary_index
                                })
                            })
                            .on('response.output_item.done', (event) => {
                                // Log the full event for debugging
                                log.info(`[AI] output_item.done - type: ${event.item.type}`)
                                
                                // Check if this is a function call item
                                if (event.item.type === 'function_call') {
                                    const functionCall = event.item as Responses.ResponseFunctionToolCall
                                    hasToolCalls = true
                                    
                                    // Emit tool-call-start first so frontend can track it
                                    emit({
                                        type: 'tool-call-start',
                                        toolCallId: functionCall.call_id,
                                        toolName: functionCall.name
                                    })
                                    
                                    // Then emit tool-call-done with args
                                    emit({
                                        type: 'tool-call-done',
                                        toolCallId: functionCall.call_id,
                                        toolName: functionCall.name,
                                        args: JSON.parse(functionCall.arguments)
                                    })
                                    
                                    // Track pending tool call
                                    pendingToolCalls.push({
                                        callId: functionCall.call_id,
                                        name: functionCall.name,
                                        arguments: functionCall.arguments
                                    })
                                }
                                
                                // Check if this is a message with annotations (web search citations)
                                if (event.item.type === 'message') {
                                    const messageItem = event.item as any
                                    log.info(`[AI] Message item done, content count: ${messageItem.content?.length || 0}`)
                                    log.info(`[AI] Message item raw:`, JSON.stringify(messageItem, null, 2))
                                    
                                    // Annotations can be on multiple content items (type: output_text)
                                    const allAnnotations: any[] = []
                                    for (const content of messageItem.content || []) {
                                        log.info(`[AI] Content item type: ${content?.type}, has annotations: ${!!content?.annotations}, count: ${content?.annotations?.length || 0}`)
                                        if (content?.annotations && content.annotations.length > 0) {
                                            allAnnotations.push(...content.annotations)
                                        }
                                    }
                                    
                                    if (allAnnotations.length > 0) {
                                        log.info(`[AI] Total annotations found: ${allAnnotations.length}`)
                                        const urlCitations = allAnnotations
                                            .filter((a: any) => a.type === 'url_citation')
                                            .map((a: any) => ({
                                                type: 'url_citation' as const,
                                                url: a.url,
                                                title: a.title,
                                                startIndex: a.start_index,
                                                endIndex: a.end_index
                                            }))
                                        
                                        if (urlCitations.length > 0) {
                                            log.info(`[AI] Emitting ${urlCitations.length} URL citations`)
                                            emit({ type: 'annotations', annotations: urlCitations })
                                        }
                                    }
                                }
                            })
                            .on('response.web_search_call.in_progress', (event) => {
                                const wsEvent = event as any
                                const { action, query, domains, url } = extractWebSearchDetails(wsEvent)
                                emit({
                                    type: 'web-search-start',
                                    searchId: event.item_id,
                                    action,
                                    query,
                                    domains,
                                    url
                                })
                            })
                            .on('response.web_search_call.searching', (event) => {
                                const wsEvent = event as any
                                const { action, query, domains, url } = extractWebSearchDetails(wsEvent)
                                emit({
                                    type: 'web-search-searching',
                                    searchId: event.item_id,
                                    action,
                                    query,
                                    domains,
                                    url
                                })
                            })
                            .on('response.web_search_call.completed', (event) => {
                                const wsEvent = event as any
                                log.info(`[AI] Web search completed:`, JSON.stringify(wsEvent, null, 2))
                                const { action, query, domains, url } = extractWebSearchDetails(wsEvent)
                                emit({
                                    type: 'web-search-done',
                                    searchId: event.item_id,
                                    action,
                                    query,
                                    domains,
                                    url
                                })
                            })
                            .on('response.code_interpreter_call.in_progress', (event) => {
                                emit({ type: 'code-interpreter-start', executionId: event.item_id })
                            })
                            .on('response.code_interpreter_call.interpreting', (event) => {
                                emit({ type: 'code-interpreter-interpreting', executionId: event.item_id })
                            })
                            .on('response.code_interpreter_call_code.delta', (event) => {
                                emit({ type: 'code-interpreter-code-delta', executionId: event.item_id, delta: event.delta })
                            })
                            .on('response.code_interpreter_call_code.done', (event) => {
                                emit({ type: 'code-interpreter-code-done', executionId: event.item_id, code: event.code })
                            })
                            .on('response.code_interpreter_call.completed', (event) => {
                                emit({ type: 'code-interpreter-done', executionId: event.item_id, output: '' })
                            })
                            .on('response.file_search_call.in_progress', (event) => {
                                emit({ type: 'file-search-start', searchId: event.item_id })
                            })
                            .on('response.file_search_call.searching', (event) => {
                                emit({ type: 'file-search-searching', searchId: event.item_id })
                            })
                            .on('response.file_search_call.completed', (event) => {
                                emit({ type: 'file-search-done', searchId: event.item_id })
                            })
                            .on('error', (event) => {
                                emit({ type: 'error', error: event.message })
                            })

                        // Wait for stream to complete
                        const finalResponse = await stream.finalResponse()
                        const responseUsage = finalResponse.usage
                        if (responseUsage) {
                            usageTotals.promptTokens += responseUsage.input_tokens || 0
                            usageTotals.completionTokens += responseUsage.output_tokens || 0
                            usageTotals.reasoningTokens += responseUsage.output_tokens_details?.reasoning_tokens || 0
                        }
                        log.info(`[AI] Step ${currentStepNumber} complete in ${Date.now() - stepStartTime}ms, text=${fullText.length} chars`)
                        
                        // DEBUG: Log the full final response structure
                        log.info(`[AI] finalResponse keys: ${Object.keys(finalResponse).join(', ')}`)
                        log.info(`[AI] finalResponse.output type: ${typeof finalResponse.output}, isArray: ${Array.isArray(finalResponse.output)}, length: ${(finalResponse.output as any)?.length}`)
                        
                        // Check finalResponse.output for annotations (fallback if not received via streaming)
                        // The annotations may be in the final response output items
                        if (finalResponse.output && Array.isArray(finalResponse.output)) {
                            const allFinalAnnotations: any[] = []
                            
                            for (const outputItem of finalResponse.output) {
                                const itemType = (outputItem as any).type
                                log.info(`[AI] Final output item type: ${itemType}`)
                                
                                // Log the full structure of each output item
                                if (itemType === 'message') {
                                    const msgItem = outputItem as any
                                    log.info(`[AI] Message content count: ${msgItem.content?.length || 0}`)
                                    
                                    for (const content of msgItem.content || []) {
                                        log.info(`[AI] Content type: ${content?.type}, annotations: ${JSON.stringify(content?.annotations?.slice(0, 2))}`)
                                        if (content?.annotations && content.annotations.length > 0) {
                                            log.info(`[AI] Found ${content.annotations.length} annotations in final response`)
                                            allFinalAnnotations.push(...content.annotations)
                                        }
                                    }
                                } else if (itemType === 'web_search_call') {
                                    // Web search results might have URLs here
                                    log.info(`[AI] Web search call item: ${JSON.stringify(outputItem).slice(0, 500)}`)
                                }
                            }
                            
                            if (allFinalAnnotations.length > 0) {
                                const urlCitations = allFinalAnnotations
                                    .filter((a: any) => a.type === 'url_citation')
                                    .map((a: any) => ({
                                        type: 'url_citation' as const,
                                        url: a.url,
                                        title: a.title,
                                        startIndex: a.start_index,
                                        endIndex: a.end_index
                                    }))
                                
                                const fileCitations = allFinalAnnotations
                                    .filter((a: any) => a.type === 'file_citation')
                                    .map((a: any) => ({
                                        type: 'file_citation' as const,
                                        fileId: a.file_id,
                                        filename: a.filename,
                                        index: a.index
                                    }))
                                
                                const allCitations = [...urlCitations, ...fileCitations]
                                
                                if (allCitations.length > 0) {
                                    log.info(`[AI] Emitting ${urlCitations.length} URL citations and ${fileCitations.length} file citations from final response`)
                                    emit({ type: 'annotations', annotations: allCitations })
                                }
                            }
                        } else {
                            log.warn(`[AI] finalResponse.output is not a valid array: ${JSON.stringify(finalResponse.output)?.slice(0, 200)}`)
                        }

                        // Execute any pending tool calls IN PARALLEL
                        if (hasToolCalls && pendingToolCalls.length > 0) {
                            log.info(`[AI] Executing ${pendingToolCalls.length} tool calls in parallel`)
                            
                            await Promise.all(pendingToolCalls.map(async (toolCall) => {
                                try {
                                    const executor = executors.get(toolCall.name)
                                    if (executor) {
                                        const args = JSON.parse(toolCall.arguments)
                                        const result = await executor(args)
                                        
                                        // Update the tool call with the result for next iteration
                                        toolCall.arguments = JSON.stringify(result)
                                        
                                        const success = !(result && typeof result === 'object' && 'error' in result)
                                        emit({
                                            type: 'tool-result',
                                            toolCallId: toolCall.callId,
                                            toolName: toolCall.name,
                                            result,
                                            success
                                        })
                                    }
                                } catch (err) {
                                    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
                                    log.error(`[AI] Tool execution error for ${toolCall.name}:`, err)
                                    toolCall.arguments = JSON.stringify({ error: errorMsg, success: false })
                                    emit({
                                        type: 'tool-result',
                                        toolCallId: toolCall.callId,
                                        toolName: toolCall.name,
                                        result: { error: errorMsg },
                                        success: false
                                    })
                                }
                            }))

                            emit({ type: 'step-complete', stepNumber: currentStepNumber, hasMoreSteps: true })
                            continue // Continue the agent loop
                        }

                        // No more tool calls, we're done
                        emit({ type: 'step-complete', stepNumber: currentStepNumber, hasMoreSteps: false })
                        break
                    }

                    // Finalize
                    emit({ type: 'text-done', text: fullText })
                    emit({
                        type: 'finish',
                        usage: {
                            promptTokens: usageTotals.promptTokens,
                            completionTokens: usageTotals.completionTokens,
                            reasoningTokens: usageTotals.reasoningTokens
                        },
                        totalSteps: currentStepNumber
                    })
                    log.info(`[AI] Agent loop finished in ${Date.now() - startTime}ms, totalSteps=${currentStepNumber}`)

                } catch (error) {
                    if (error instanceof Error && error.name === 'AbortError') {
                        log.info('[AI] Agent loop aborted')
                        return
                    }
                    log.error('[AI] Agent loop error:', error)
                    const errorMessage = error instanceof Error ? sanitizeApiError(error.message) : 'Unknown error'
                    emit({ type: 'error', error: errorMessage })
                } finally {
                    activeStreams.delete(input.chatId)
                }
            }

            // Start processing in background
            runAgentLoop()

            return { success: true, message: 'Agent loop started' }
        }),

    // Cancel ongoing chat
    cancel: protectedProcedure
        .input(z.object({ chatId: z.string() }))
        .mutation(({ input }) => {
            if (activeStreams.has(input.chatId)) {
                log.info(`[AI] Cancelling chat ${input.chatId}`)
                activeStreams.get(input.chatId)?.abort()
                activeStreams.delete(input.chatId)
                return { success: true }
            }
            return { success: false, message: 'No active stream found' }
        }),

    // Generate speech audio from text (OpenAI TTS)
    textToSpeech: protectedProcedure
        .input(z.object({
            text: z.string().min(1),
            model: z.string().optional(),
            voice: z.string().optional()
        }))
        .mutation(async ({ input }) => {
            const store = getSecureApiKeyStore()
            const apiKey = store.getOpenAIKey()

            if (!apiKey) {
                throw new Error('OpenAI API key not configured')
            }

            try {
                const client = new OpenAI({ apiKey })
                const modelId = input.model || 'gpt-4o-mini-tts'
                const voice = input.voice || 'alloy'

                const response = await client.audio.speech.create({
                    model: modelId,
                    voice,
                    input: input.text
                })

                const audioBuffer = Buffer.from(await response.arrayBuffer())

                return {
                    audioBase64: audioBuffer.toString('base64'),
                    mimeType: 'audio/mpeg'
                }
            } catch (error) {
                log.error('[AI] Text-to-speech error:', error)
                throw new Error('Failed to generate speech audio')
            }
        }),

    // Generate chat title
    generateTitle: protectedProcedure
        .input(z.object({
            prompt: z.string(),
            provider: z.enum(['openai']),
            apiKey: z.string(),
            model: z.string().optional()
        }))
        .mutation(async ({ input }) => {
            try {
                const client = new OpenAI({
                    apiKey: input.apiKey
                })

                const modelId = input.model || 'gpt-5-nano'

                const response = await client.responses.create({
                    model: modelId, // Fast model for title generation
                    input: input.prompt,
                    instructions: "Generate a short, concise title (max 5 words) for the user's message. Do not use quotes. Just respond with the title, nothing else.",
                    max_output_tokens: 50
                })

                const candidate = response.output_text?.trim() || ''
                const title = candidate && candidate !== 'New Chat'
                    ? candidate
                    : getFallbackTitle(input.prompt)

                return { title }
            } catch (error) {
                log.error('[AI] Generate title error:', error)
                return { title: getFallbackTitle(input.prompt) }
            }
        })
})
