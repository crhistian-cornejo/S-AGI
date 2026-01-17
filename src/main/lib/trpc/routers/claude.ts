import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import { router, publicProcedure } from '../trpc'
import log from 'electron-log'

// Types for AI streaming
export type AIStreamEvent =
    | { type: 'text-delta'; delta: string }
    | { type: 'text-done'; text: string }
    | { type: 'tool-call-start'; toolCallId: string; toolName: string }
    | { type: 'tool-call-delta'; toolCallId: string; argsDelta: string }
    | { type: 'tool-call-done'; toolCallId: string; toolName: string; args: unknown }
    | { type: 'tool-result'; toolCallId: string; result: unknown }
    | { type: 'finish'; usage?: { promptTokens: number; completionTokens: number } }
    | { type: 'error'; error: string }

// Tool definitions for spreadsheet operations
const SPREADSHEET_TOOLS = [
    {
        name: 'create_spreadsheet',
        description: 'Create a new spreadsheet with column headers and optional initial data',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name of the spreadsheet' },
                columns: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Column headers'
                },
                rows: {
                    type: 'array',
                    items: { type: 'array', items: {} },
                    description: 'Initial row data (2D array)'
                }
            },
            required: ['name', 'columns']
        }
    },
    {
        name: 'update_cells',
        description: 'Update multiple cells in a spreadsheet',
        parameters: {
            type: 'object',
            properties: {
                artifactId: { type: 'string', description: 'ID of the spreadsheet artifact' },
                updates: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            row: { type: 'number' },
                            column: { type: 'number' },
                            value: {}
                        }
                    },
                    description: 'Array of cell updates'
                }
            },
            required: ['artifactId', 'updates']
        }
    },
    {
        name: 'insert_formula',
        description: 'Insert a formula into a spreadsheet cell',
        parameters: {
            type: 'object',
            properties: {
                artifactId: { type: 'string' },
                cell: { type: 'string', description: 'Cell reference (e.g., A1, B2)' },
                formula: { type: 'string', description: 'Excel-style formula (e.g., =SUM(A1:A10))' }
            },
            required: ['artifactId', 'cell', 'formula']
        }
    }
]

// System prompt for spreadsheet AI
const SYSTEM_PROMPT = `You are S-AGI, an AI assistant specialized in creating and manipulating spreadsheets.

You can:
1. Create new spreadsheets with custom columns and data
2. Update cells with new values
3. Insert formulas using Excel-style syntax
4. Analyze data and provide insights

When the user asks you to create a spreadsheet, use the create_spreadsheet tool.
When the user asks you to modify cells or add formulas, use the appropriate tools.

Be concise but helpful. Format your responses nicely with Markdown when appropriate.`

export const claudeRouter = router({
    // Get AI status
    getStatus: publicProcedure.query(() => {
        return {
            availableProviders: ['openai', 'anthropic'],
            availableTools: SPREADSHEET_TOOLS.map(t => t.name)
        }
    }),

    // Stream chat with AI using API keys passed from renderer
    chat: publicProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            prompt: z.string(),
            mode: z.enum(['plan', 'agent']).default('agent'),
            provider: z.enum(['openai', 'anthropic']).default('openai'),
            apiKey: z.string(),
            model: z.string().optional(),
            messages: z.array(z.object({
                role: z.enum(['user', 'assistant', 'system']),
                content: z.string()
            })).optional()
        }))
        .subscription(({ input }) => {
            return observable<AIStreamEvent>((emit) => {
                const abortController = new AbortController()

                const runChat = async () => {
                    try {
                        log.info(`[AI] Starting chat with ${input.provider}`)

                        const messages = [
                            { role: 'system' as const, content: SYSTEM_PROMPT },
                            ...(input.messages || []),
                            { role: 'user' as const, content: input.prompt }
                        ]

                        if (input.provider === 'openai') {
                            await streamOpenAI({
                                apiKey: input.apiKey,
                                model: input.model || 'gpt-4o',
                                messages,
                                tools: SPREADSHEET_TOOLS,
                                mode: input.mode,
                                signal: abortController.signal,
                                onEvent: (event) => emit.next(event)
                            })
                        } else {
                            await streamAnthropic({
                                apiKey: input.apiKey,
                                model: input.model || 'claude-sonnet-4-20250514',
                                messages,
                                tools: SPREADSHEET_TOOLS,
                                mode: input.mode,
                                signal: abortController.signal,
                                onEvent: (event) => emit.next(event)
                            })
                        }
                    } catch (error) {
                        if (error instanceof Error && error.name === 'AbortError') {
                            log.info('[AI] Chat aborted')
                            return
                        }
                        log.error('[AI] Chat error:', error)
                        emit.next({
                            type: 'error',
                            error: error instanceof Error ? error.message : 'Unknown error'
                        })
                    }
                }

                runChat()

                return () => {
                    log.info('[AI] Subscription closed, aborting')
                    abortController.abort()
                }
            })
        }),

    // Cancel ongoing chat
    cancel: publicProcedure
        .input(z.object({ chatId: z.string() }))
        .mutation(() => {
            // Cancellation is handled by the abort controller in the subscription
            return { success: true }
        })
})

// OpenAI streaming implementation
async function streamOpenAI(options: {
    apiKey: string
    model: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    tools: typeof SPREADSHEET_TOOLS
    mode: 'plan' | 'agent'
    signal: AbortSignal
    onEvent: (event: AIStreamEvent) => void
}) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${options.apiKey}`
        },
        body: JSON.stringify({
            model: options.model,
            messages: options.messages,
            tools: options.mode === 'agent' ? options.tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }
            })) : undefined,
            stream: true
        }),
        signal: options.signal
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${error}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map()

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') {
                // Emit finish event
                options.onEvent({ type: 'text-done', text: fullText })
                options.onEvent({ type: 'finish' })
                return
            }

            try {
                const json = JSON.parse(data)
                const delta = json.choices?.[0]?.delta

                if (delta?.content) {
                    fullText += delta.content
                    options.onEvent({ type: 'text-delta', delta: delta.content })
                }

                // Handle tool calls
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index
                        if (!toolCalls.has(idx)) {
                            toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' })
                            if (tc.function?.name) {
                                options.onEvent({
                                    type: 'tool-call-start',
                                    toolCallId: tc.id || `tool_${idx}`,
                                    toolName: tc.function.name
                                })
                            }
                        }
                        const existing = toolCalls.get(idx)!
                        if (tc.id) existing.id = tc.id
                        if (tc.function?.name) existing.name = tc.function.name
                        if (tc.function?.arguments) {
                            existing.args += tc.function.arguments
                            options.onEvent({
                                type: 'tool-call-delta',
                                toolCallId: existing.id,
                                argsDelta: tc.function.arguments
                            })
                        }
                    }
                }

                // Check if we're done with choices
                if (json.choices?.[0]?.finish_reason === 'tool_calls') {
                    for (const [, tc] of toolCalls) {
                        try {
                            const args = JSON.parse(tc.args)
                            options.onEvent({
                                type: 'tool-call-done',
                                toolCallId: tc.id,
                                toolName: tc.name,
                                args
                            })
                        } catch {
                            // Ignore parse errors
                        }
                    }
                }
            } catch {
                // Ignore parse errors
            }
        }
    }

    options.onEvent({ type: 'text-done', text: fullText })
    options.onEvent({ type: 'finish' })
}

// Anthropic streaming implementation
async function streamAnthropic(options: {
    apiKey: string
    model: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    tools: typeof SPREADSHEET_TOOLS
    mode: 'plan' | 'agent'
    signal: AbortSignal
    onEvent: (event: AIStreamEvent) => void
}) {
    // Extract system message
    const systemMessage = options.messages.find(m => m.role === 'system')?.content || ''
    const chatMessages = options.messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: options.model,
            max_tokens: 4096,
            system: systemMessage,
            messages: chatMessages,
            tools: options.mode === 'agent' ? options.tools.map(t => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters
            })) : undefined,
            stream: true
        }),
        signal: options.signal
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Anthropic API error: ${response.status} - ${error}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    let currentToolCallId = ''
    let currentToolName = ''
    let currentToolArgs = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (!data) continue

            try {
                const json = JSON.parse(data)

                switch (json.type) {
                    case 'content_block_start':
                        if (json.content_block?.type === 'tool_use') {
                            currentToolCallId = json.content_block.id
                            currentToolName = json.content_block.name
                            currentToolArgs = ''
                            options.onEvent({
                                type: 'tool-call-start',
                                toolCallId: currentToolCallId,
                                toolName: currentToolName
                            })
                        }
                        break

                    case 'content_block_delta':
                        if (json.delta?.type === 'text_delta') {
                            fullText += json.delta.text
                            options.onEvent({ type: 'text-delta', delta: json.delta.text })
                        } else if (json.delta?.type === 'input_json_delta') {
                            currentToolArgs += json.delta.partial_json
                            options.onEvent({
                                type: 'tool-call-delta',
                                toolCallId: currentToolCallId,
                                argsDelta: json.delta.partial_json
                            })
                        }
                        break

                    case 'content_block_stop':
                        if (currentToolCallId && currentToolName) {
                            try {
                                const args = JSON.parse(currentToolArgs)
                                options.onEvent({
                                    type: 'tool-call-done',
                                    toolCallId: currentToolCallId,
                                    toolName: currentToolName,
                                    args
                                })
                            } catch {
                                // Ignore parse errors
                            }
                            currentToolCallId = ''
                            currentToolName = ''
                            currentToolArgs = ''
                        }
                        break

                    case 'message_stop':
                        options.onEvent({ type: 'text-done', text: fullText })
                        options.onEvent({
                            type: 'finish',
                            usage: json.message?.usage ? {
                                promptTokens: json.message.usage.input_tokens,
                                completionTokens: json.message.usage.output_tokens
                            } : undefined
                        })
                        return
                }
            } catch {
                // Ignore parse errors
            }
        }
    }

    options.onEvent({ type: 'text-done', text: fullText })
    options.onEvent({ type: 'finish' })
}
