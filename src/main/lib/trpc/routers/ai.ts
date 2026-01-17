import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import log from 'electron-log'
import { sendToRenderer } from '../../window-manager'
import { supabase } from '../../supabase/client'
import { 
    OpenAIResponsesClient,
    type ResponsesTool,
    type ResponsesFunctionTool,
    type ResponsesMessage,
    type ResponsesStreamEvent,
    type ToolCallOutputItem
} from '../../openai/responses-client'
import { SPREADSHEET_TOOLS, executeTool } from './tools'
import { DOCUMENT_TOOLS, executeDocTool } from './doc-tools'
import type { AIStreamEvent, ReasoningConfig, NativeToolsConfig } from '@shared/ai-types'
import { 
    AI_MODELS, 
    DEFAULT_MODELS, 
    getModelById,
    DEFAULT_REASONING_CONFIG
} from '@shared/ai-types'

// Re-export type for consumers
export type { AIStreamEvent } from '@shared/ai-types'

// Store active streams for cancellation
const activeStreams = new Map<string, AbortController>()

// Maximum number of agent loop steps
const MAX_AGENT_STEPS = 15

// System prompt for S-AGI agent
const SYSTEM_PROMPT = `You are S-AGI, an AI assistant specialized in creating and manipulating spreadsheets, writing documents, and researching information from the web.

## Your Capabilities

### Native Tools (Built-in)
- **Web Search**: You can search the web for current information, news, and data. Use this for up-to-date information.
- **Code Interpreter**: You can write and execute Python code for data analysis, calculations, and generating insights.
- **File Search**: You can search through uploaded files to find relevant information.

### Spreadsheet Tools
**Creation & Data:**
- create_spreadsheet - Create new spreadsheets with column headers and initial data
- update_cells - Update multiple cells with new values
- add_row - Add new rows to existing spreadsheets
- delete_row - Delete rows from a spreadsheet
- insert_formula - Insert Excel-style formulas (=SUM, =AVERAGE, =IF, etc.)

**Formatting & Styling:**
- format_cells - Comprehensive formatting: bold, italic, underline, strikethrough, font size/color/family, background color, alignment (horizontal/vertical), text wrap, number formats, borders
- merge_cells - Merge a range of cells into one
- set_column_width - Set width of columns
- set_row_height - Set height of rows

**Analysis:**
- get_spreadsheet_summary - Get current state of a spreadsheet (use this to understand data before modifications)

### Document Tools
- create_document - Create a new markdown document (reports, articles, analysis, etc.)
- update_document - Update an existing document's content
- get_document_content - Read a document's current content

## IMPORTANT WORKFLOW GUIDELINES:

1. **Multi-tool Operations:** You can use multiple tools in sequence to accomplish complex tasks
2. **Native + Custom Tools:** Combine web search with spreadsheet creation for data-driven reports
3. **Code for Analysis:** Use code interpreter for complex calculations before populating spreadsheets
4. **Context Awareness:** When modifying existing content, first use get_spreadsheet_summary or get_document_content
5. **Research Workflow:** Search the web, analyze with code, then create spreadsheets/documents with findings

## Response Style:
- Be concise but helpful
- Format responses with Markdown when appropriate
- When creating spreadsheets with data, add proper formatting (bold headers, appropriate column widths)
- When writing documents, use proper markdown structure (headings, lists, etc.)
- Explain what you're doing before and after using tools
- When citing web search results, include source URLs when available`

/**
 * Convert Zod schema to JSON Schema for OpenAI Responses API
 * Note: With strict=true, ALL properties must be in required array.
 * Optional fields must use anyOf with null type.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    return convertZodType(schema)
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

/**
 * Create function tools for Responses API
 */
function createFunctionTools(
    chatId: string,
    userId: string
): { tools: ResponsesFunctionTool[]; executors: Map<string, (args: unknown) => Promise<unknown>> } {
    const executors = new Map<string, (args: unknown) => Promise<unknown>>()
    const tools: ResponsesFunctionTool[] = []

    // Add spreadsheet tools
    for (const [name, tool] of Object.entries(SPREADSHEET_TOOLS)) {
        tools.push({
            type: 'function',
            name,
            description: tool.description,
            parameters: zodToJsonSchema(tool.inputSchema),
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
            parameters: zodToJsonSchema(tool.inputSchema),
            strict: true
        })
        executors.set(name, (args) => executeDocTool(name, args, chatId, userId))
    }

    return { tools, executors }
}

/**
 * Build native tools array based on configuration and model support
 */
function buildNativeTools(
    modelId: string,
    config?: NativeToolsConfig
): ResponsesTool[] {
    const model = getModelById(modelId)
    if (!model) return []

    const tools: ResponsesTool[] = []

    // Web Search
    if (config?.webSearch !== false && model.supportsNativeWebSearch) {
        const webSearchConfig = typeof config?.webSearch === 'object' ? config.webSearch : {}
        tools.push({
            type: 'web_search',
            search_context_size: webSearchConfig.searchContextSize || 'medium'
        })
    }

    // Code Interpreter
    if (config?.codeInterpreter && model.supportsCodeInterpreter) {
        const codeConfig = typeof config.codeInterpreter === 'object' ? config.codeInterpreter : {}
        tools.push({
            type: 'code_interpreter',
            container: {
                type: codeConfig.containerType || 'auto'
            }
        })
    }

    // File Search
    if (config?.fileSearch && model.supportsFileSearch) {
        const fileConfig = typeof config.fileSearch === 'object' ? config.fileSearch : {}
        tools.push({
            type: 'file_search',
            vector_store_ids: fileConfig.vectorStoreIds,
            max_num_results: fileConfig.maxResults
        })
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

/**
 * Convert internal messages to Responses API format
 */
function toResponsesMessages(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    currentPrompt: string,
    images?: Array<{ type: 'image'; data: string; mediaType: string }>
): ResponsesMessage[] {
    const result: ResponsesMessage[] = []

    // Add previous messages
    for (const msg of messages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            result.push({ role: msg.role, content: msg.content })
        }
    }

    // Add current message with optional images
    if (images?.length) {
        result.push({
            role: 'user',
            content: [
                ...images.map(img => ({
                    type: 'image_url' as const,
                    image_url: { url: `data:${img.mediaType};base64,${img.data}` }
                })),
                { type: 'text' as const, text: currentPrompt }
            ]
        })
    } else {
        result.push({ role: 'user', content: currentPrompt })
    }

    return result
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
                effort: z.enum(['none', 'low', 'medium', 'high']),
                streamReasoning: z.boolean().optional(),
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
            previousResponseId: z.string().optional()
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
                try {
                    const modelId = input.model || DEFAULT_MODELS.openai
                    const modelDef = getModelById(modelId)
                    
                    log.info(`[AI] Starting Responses API agent loop with ${modelId}`)
                    if (input.images?.length) {
                        log.info(`[AI] Including ${input.images.length} image(s)`)
                    }

                    // Create Responses API client
                    const client = new OpenAIResponsesClient({
                        apiKey: input.apiKey,
                        model: modelId
                    })

                    // Build tools
                    const { tools: functionTools, executors } = input.mode === 'agent' 
                        ? createFunctionTools(input.chatId, ctx.userId)
                        : { tools: [], executors: new Map() }
                    
                    const nativeTools = buildNativeTools(modelId, input.nativeTools)
                    const allTools: ResponsesTool[] = [...functionTools, ...nativeTools]

                    // Build messages
                    const messages = toResponsesMessages(
                        input.messages || [],
                        input.prompt,
                        input.images
                    )

                    // Determine reasoning config
                    const reasoningConfig: ReasoningConfig | undefined = modelDef?.supportsReasoning
                        ? (input.reasoning || { 
                            effort: modelDef.defaultReasoningEffort || DEFAULT_REASONING_CONFIG.effort 
                          })
                        : undefined

                    let currentStepNumber = 0
                    let fullText = ''
                    let fullReasoning = ''
                    let currentResponseId = input.previousResponseId
                    let pendingToolCalls: ToolCallOutputItem[] = []

                    // Agent loop
                    while (currentStepNumber < MAX_AGENT_STEPS) {
                        currentStepNumber++
                        log.info(`[AI] Step ${currentStepNumber}`)

                        // Stream the response
                        const streamGenerator = currentResponseId && pendingToolCalls.length > 0
                            ? client.submitToolOutputsStream(
                                currentResponseId,
                                pendingToolCalls.map(tc => ({
                                    call_id: tc.call_id,
                                    output: tc.arguments // This will be the result after execution
                                })),
                                { tools: allTools, reasoning: reasoningConfig },
                                abortController.signal
                              )
                            : client.stream({
                                input: messages,
                                tools: allTools.length > 0 ? allTools : undefined,
                                reasoning: reasoningConfig,
                                instructions: SYSTEM_PROMPT,
                                store: true
                              }, abortController.signal)

                        pendingToolCalls = []
                        let hasToolCalls = false

                        for await (const event of streamGenerator) {
                            if (abortController.signal.aborted) {
                                log.info('[AI] Stream aborted')
                                return
                            }

                            handleStreamEvent(
                                event,
                                emit,
                                {
                                    onTextDelta: (delta) => { fullText += delta },
                                    onReasoningDelta: (delta) => { fullReasoning += delta },
                                    onToolCall: (toolCall) => {
                                        hasToolCalls = true
                                        pendingToolCalls.push(toolCall)
                                    },
                                    onResponseId: (id) => { currentResponseId = id }
                                }
                            )
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
                                            toolCallId: toolCall.call_id,
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
                                        toolCallId: toolCall.call_id,
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
                    if (fullReasoning) {
                        emit({ type: 'reasoning-done', text: fullReasoning })
                    }
                    emit({
                        type: 'finish',
                        usage: { promptTokens: 0, completionTokens: 0 }, // Will be updated from response
                        totalSteps: currentStepNumber
                    })

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
                const client = new OpenAIResponsesClient({
                    apiKey: input.apiKey,
                    model: 'gpt-5-nano' // Fast model for title generation
                })

                const response = await client.create({
                    input: [{ role: 'user', content: input.prompt }],
                    instructions: "Generate a short, concise title (max 5 words) for the user's message. Do not use quotes. Just respond with the title, nothing else.",
                    maxOutputTokens: 50
                })

                const title = response.output_text?.trim() || 'New Chat'
                return { title }
            } catch (error) {
                log.error('[AI] Generate title error:', error)
                return { title: 'New Chat' }
            }
        })
})

/**
 * Handle individual stream events (sync for performance)
 */
function handleStreamEvent(
    event: ResponsesStreamEvent,
    emit: (e: AIStreamEvent) => void,
    callbacks: {
        onTextDelta: (delta: string) => void
        onReasoningDelta: (delta: string) => void
        onToolCall: (toolCall: ToolCallOutputItem) => void
        onResponseId: (id: string) => void
    }
): void {
    switch (event.type) {
        case 'response.created':
            callbacks.onResponseId(event.response.id)
            break

        case 'response.output_text.delta':
            callbacks.onTextDelta(event.delta)
            emit({ type: 'text-delta', delta: event.delta })
            break

        case 'response.reasoning.delta':
            callbacks.onReasoningDelta(event.delta)
            emit({ type: 'reasoning-delta', delta: event.delta })
            break

        case 'response.reasoning.done':
            emit({ type: 'reasoning-done', text: event.text })
            break

        case 'response.function_call_arguments.done': {
            emit({
                type: 'tool-call-done',
                toolCallId: event.call_id,
                toolName: event.name,
                args: JSON.parse(event.arguments)
            })
            
            // Create a pending tool call
            callbacks.onToolCall({
                type: 'function_call',
                id: event.call_id,
                call_id: event.call_id,
                name: event.name,
                arguments: event.arguments,
                status: 'completed'
            })
            break
        }

        case 'response.web_search_call.in_progress':
            emit({ type: 'web-search-start', searchId: event.call_id })
            break

        case 'response.web_search_call.completed':
            emit({ type: 'web-search-done', searchId: event.call_id, results: event.output })
            break

        case 'response.code_interpreter.in_progress':
            emit({ type: 'code-interpreter-start', executionId: event.call_id })
            break

        case 'response.code_interpreter.completed':
            emit({ type: 'code-interpreter-done', executionId: event.call_id, output: event.output || '' })
            break

        case 'response.completed':
            // Response completed, no action needed
            break

        case 'response.failed':
        case 'error':
            emit({ type: 'error', error: event.error.message })
            break
    }
}
