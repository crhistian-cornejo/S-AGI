import log from 'electron-log'

// ============================================================================
// OpenAI Responses API Client
// Native implementation for GPT-5 models with tools, reasoning, and streaming
// ============================================================================

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export interface ResponsesConfig {
    apiKey: string
    model: string
    baseUrl?: string
}

export interface ResponsesInput {
    input: ResponsesMessage[]
    tools?: ResponsesTool[]
    reasoning?: { effort: ReasoningEffort }
    instructions?: string
    store?: boolean
    previousResponseId?: string
    stream?: boolean
    maxOutputTokens?: number
}

export interface ResponsesMessage {
    role: 'user' | 'assistant' | 'system'
    content: string | ResponsesContentPart[]
}

export interface ResponsesContentPart {
    type: 'text' | 'image_url'
    text?: string
    image_url?: { url: string }
}

// ============================================================================
// Tool Types
// ============================================================================

export type ResponsesTool = 
    | ResponsesFunctionTool
    | ResponsesWebSearchTool
    | ResponsesCodeInterpreterTool
    | ResponsesFileSearchTool

export interface ResponsesFunctionTool {
    type: 'function'
    name: string
    description: string
    parameters: Record<string, unknown>
    strict?: boolean
}

export interface ResponsesWebSearchTool {
    type: 'web_search'
    search_context_size?: 'low' | 'medium' | 'high'
}

export interface ResponsesCodeInterpreterTool {
    type: 'code_interpreter'
    container?: {
        type: 'auto' | 'python' | 'javascript'
    }
}

export interface ResponsesFileSearchTool {
    type: 'file_search'
    vector_store_ids?: string[]
    max_num_results?: number
    ranking_options?: {
        ranker: 'auto' | 'default_2024_08_21'
        score_threshold?: number
    }
}

// ============================================================================
// Response Output Types
// ============================================================================

export interface ResponsesOutput {
    id: string
    object: 'response'
    created_at: number
    model: string
    output: OutputItem[]
    output_text?: string
    usage?: {
        input_tokens: number
        output_tokens: number
        reasoning_tokens?: number
    }
    status: 'completed' | 'failed' | 'in_progress' | 'incomplete'
}

export type OutputItem = 
    | TextOutputItem 
    | ToolCallOutputItem 
    | ReasoningOutputItem
    | WebSearchOutputItem

export interface TextOutputItem {
    type: 'text'
    text: string
}

export interface ToolCallOutputItem {
    type: 'function_call'
    id: string
    call_id: string
    name: string
    arguments: string
    status: 'in_progress' | 'completed' | 'failed'
}

export interface ReasoningOutputItem {
    type: 'reasoning'
    id: string
    summary?: Array<{ type: 'summary_text'; text: string }>
}

export interface WebSearchOutputItem {
    type: 'web_search_call'
    id: string
    status: 'completed' | 'in_progress'
}

// ============================================================================
// Streaming Event Types
// ============================================================================

export type ResponsesStreamEvent = 
    | { type: 'response.created'; response: ResponsesOutput }
    | { type: 'response.output_item.added'; item: OutputItem; output_index: number }
    | { type: 'response.output_text.delta'; delta: string; output_index: number }
    | { type: 'response.output_text.done'; text: string; output_index: number }
    | { type: 'response.function_call_arguments.delta'; delta: string; call_id: string; name: string }
    | { type: 'response.function_call_arguments.done'; arguments: string; call_id: string; name: string }
    | { type: 'response.reasoning.delta'; delta: string; output_index: number }
    | { type: 'response.reasoning.done'; text: string; output_index: number }
    | { type: 'response.web_search_call.in_progress'; call_id: string }
    | { type: 'response.web_search_call.completed'; call_id: string; output?: unknown }
    | { type: 'response.code_interpreter.in_progress'; call_id: string }
    | { type: 'response.code_interpreter.completed'; call_id: string; output?: string }
    | { type: 'response.completed'; response: ResponsesOutput }
    | { type: 'response.failed'; error: { message: string; code?: string } }
    | { type: 'error'; error: { message: string; code?: string } }

// ============================================================================
// Client Class
// ============================================================================

export class OpenAIResponsesClient {
    private apiKey: string
    private model: string
    private baseUrl: string

    constructor(config: ResponsesConfig) {
        this.apiKey = config.apiKey
        this.model = config.model
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1'
    }

    /**
     * Create a response using the Responses API
     */
    async create(input: ResponsesInput): Promise<ResponsesOutput> {
        const body = this.buildRequestBody(input)

        const response = await fetch(`${this.baseUrl}/responses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body)
        })

        if (!response.ok) {
            const errorText = await response.text()
            log.error('[Responses] API error:', response.status, errorText)
            throw new Error(`OpenAI Responses API error: ${response.status} - ${errorText}`)
        }

        return await response.json() as ResponsesOutput
    }

    /**
     * Create a streaming response
     */
    async *stream(
        input: ResponsesInput,
        signal?: AbortSignal
    ): AsyncGenerator<ResponsesStreamEvent> {
        const body = this.buildRequestBody({ ...input, stream: true })

        const response = await fetch(`${this.baseUrl}/responses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal
        })

        if (!response.ok) {
            const errorText = await response.text()
            log.error('[Responses] Stream error:', response.status, errorText)
            yield { 
                type: 'error', 
                error: { message: `API error: ${response.status} - ${errorText}` } 
            }
            return
        }

        if (!response.body) {
            yield { type: 'error', error: { message: 'No response body' } }
            return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.trim() || line.startsWith(':')) continue
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6)
                        if (data === '[DONE]') continue
                        
                        try {
                            const event = JSON.parse(data) as ResponsesStreamEvent
                            yield event
                        } catch (e) {
                            log.warn('[Responses] Failed to parse event:', data)
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }
    }

    /**
     * Submit tool outputs for a response
     */
    async submitToolOutputs(
        responseId: string,
        toolOutputs: Array<{ call_id: string; output: string }>
    ): Promise<ResponsesOutput> {
        const response = await fetch(`${this.baseUrl}/responses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                previous_response_id: responseId,
                input: toolOutputs.map(to => ({
                    type: 'function_call_output',
                    call_id: to.call_id,
                    output: to.output
                }))
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to submit tool outputs: ${response.status} - ${errorText}`)
        }

        return await response.json() as ResponsesOutput
    }

    /**
     * Submit tool outputs with streaming
     */
    async *submitToolOutputsStream(
        responseId: string,
        toolOutputs: Array<{ call_id: string; output: string }>,
        options?: { tools?: ResponsesTool[]; reasoning?: { effort: ReasoningEffort } },
        signal?: AbortSignal
    ): AsyncGenerator<ResponsesStreamEvent> {
        const body: Record<string, unknown> = {
            model: this.model,
            previous_response_id: responseId,
            input: toolOutputs.map(to => ({
                type: 'function_call_output',
                call_id: to.call_id,
                output: to.output
            })),
            stream: true
        }

        if (options?.tools) {
            body.tools = options.tools
        }
        if (options?.reasoning) {
            body.reasoning = options.reasoning
        }

        const response = await fetch(`${this.baseUrl}/responses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal
        })

        if (!response.ok) {
            const errorText = await response.text()
            yield { 
                type: 'error', 
                error: { message: `API error: ${response.status} - ${errorText}` } 
            }
            return
        }

        if (!response.body) {
            yield { type: 'error', error: { message: 'No response body' } }
            return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.trim() || line.startsWith(':')) continue
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6)
                        if (data === '[DONE]') continue
                        
                        try {
                            const event = JSON.parse(data) as ResponsesStreamEvent
                            yield event
                        } catch (e) {
                            log.warn('[Responses] Failed to parse event:', data)
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }
    }

    private buildRequestBody(input: ResponsesInput): Record<string, unknown> {
        const body: Record<string, unknown> = {
            model: this.model,
            input: input.input
        }

        if (input.tools && input.tools.length > 0) {
            body.tools = input.tools
        }

        if (input.reasoning) {
            body.reasoning = input.reasoning
        }

        if (input.instructions) {
            body.instructions = input.instructions
        }

        if (input.store !== undefined) {
            body.store = input.store
        }

        if (input.previousResponseId) {
            body.previous_response_id = input.previousResponseId
        }

        if (input.stream) {
            body.stream = true
        }

        if (input.maxOutputTokens) {
            body.max_output_tokens = input.maxOutputTokens
        }

        return body
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Zod schema to JSON Schema for OpenAI tools
 */
export function zodToJsonSchema(schema: unknown): Record<string, unknown> {
    // This is a simplified converter - for production use zod-to-json-schema
    if (!schema || typeof schema !== 'object') {
        return { type: 'object', properties: {} }
    }

    const zodSchema = schema as { shape?: Record<string, unknown>; _def?: { typeName?: string } }
    
    if (!zodSchema.shape) {
        return { type: 'object', properties: {} }
    }

    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(zodSchema.shape)) {
        const zodType = value as { _def?: { typeName?: string; description?: string }; description?: string }
        const description = zodType.description || zodType._def?.description || ''
        const typeName = zodType._def?.typeName || ''

        // Determine JSON Schema type
        if (typeName.includes('String')) {
            properties[key] = { type: 'string', description }
        } else if (typeName.includes('Number')) {
            properties[key] = { type: 'number', description }
        } else if (typeName.includes('Boolean')) {
            properties[key] = { type: 'boolean', description }
        } else if (typeName.includes('Array')) {
            properties[key] = { type: 'array', items: {}, description }
        } else if (typeName.includes('Object')) {
            properties[key] = { type: 'object', properties: {}, description }
        } else {
            properties[key] = { type: 'string', description }
        }

        // Check if required (not optional)
        if (!typeName.includes('Optional')) {
            required.push(key)
        }
    }

    return {
        type: 'object',
        properties,
        required,
        additionalProperties: false
    }
}

/**
 * Create function tools from tool definitions
 */
export function createFunctionTools(
    tools: Record<string, { description: string; inputSchema: unknown }>
): ResponsesFunctionTool[] {
    return Object.entries(tools).map(([name, tool]) => ({
        type: 'function' as const,
        name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.inputSchema),
        strict: true
    }))
}
