import { streamText, type StopCondition, type ToolSet } from 'ai'
import log from 'electron-log'
import { sendToRenderer } from '../window-manager'
import { getUsageTracker } from '../storage/usage-tracker'
import { getLanguageModel, isProviderAvailable } from './providers'
import { getSystemPrompt, UI_TOOL_SCHEMAS, executeUITool } from './agent'
import type { AIProvider, AIStreamEvent, ReasoningEffort } from '@s-agi/core/types/ai'

/**
 * Adapter to convert AI SDK v6 stream events to S-AGI AIStreamEvent format
 * This provides backwards compatibility with the existing renderer implementation
 */

export interface StreamingOptions {
    chatId: string
    prompt: string
    provider: AIProvider
    modelId: string
    userId: string
    messages?: Array<{
        role: 'user' | 'assistant' | 'system'
        content: string
        images?: Array<{ type: 'image'; data: string; mediaType: string }>
    }>
    images?: Array<{ type: 'image'; data: string; mediaType: string }>
    mode?: 'agent' | 'plan'
    signal?: AbortSignal
    system?: string
    tools?: ToolSet
    stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>
    /** Maximum number of tool execution steps (default: 15) */
    maxSteps?: number
    /** Reasoning effort level for models that support it */
    reasoning?: { effort: ReasoningEffort }
    /** Callback after usage is tracked (for rate limit tracking) */
    onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void
    /** Provider-specific options to pass through to streamText */
    providerOptions?: Record<string, unknown>
    /** Callback after text is complete but before finish event.
     *  Use for generating suggestions, emitting rate limit warnings, etc. */
    onBeforeFinish?: (text: string, usage: { promptTokens: number; completionTokens: number }) => Promise<void>
}

/**
 * Emit an AIStreamEvent to the renderer
 */
function emit(event: AIStreamEvent): void {
    sendToRenderer('ai:stream', event)
}

/**
 * Convert AI SDK messages to the internal format
 */
function convertMessages(
    messages: Array<{
        role: 'user' | 'assistant' | 'system'
        content: string
        images?: Array<{ type: 'image'; data: string; mediaType: string }>
    }>,
    currentPrompt: string,
    images?: Array<{ type: 'image'; data: string; mediaType: string }>
): Array<{ role: 'user' | 'assistant' | 'system'; content: string | Array<{ type: string; text?: string; image?: string }> }> {
    const result: Array<{ role: 'user' | 'assistant' | 'system'; content: string | Array<{ type: string; text?: string; image?: string }> }> = []

    // Add previous messages
    for (const msg of messages) {
        if (msg.images?.length) {
            const content: Array<{ type: string; text?: string; image?: string }> = [
                ...msg.images.map(img => ({
                    type: 'image' as const,
                    image: `data:${img.mediaType};base64,${img.data}`
                })),
                { type: 'text' as const, text: msg.content }
            ]
            result.push({ role: msg.role, content })
        } else {
            result.push({ role: msg.role, content: msg.content })
        }
    }

    // Add current message with optional images
    if (images?.length) {
        const content: Array<{ type: string; text?: string; image?: string }> = [
            ...images.map(img => ({
                type: 'image' as const,
                image: `data:${img.mediaType};base64,${img.data}`
            })),
            { type: 'text' as const, text: currentPrompt }
        ]
        result.push({ role: 'user', content })
    } else {
        result.push({ role: 'user', content: currentPrompt })
    }

    return result
}

/**
 * Map provider-specific error messages for better UX.
 */
function mapProviderError(provider: AIProvider, error: any): string {
    // AI SDK wraps errors in multiple layers — walk the cause chain to find the original API error
    // Chain: AI_NoOutputGeneratedError → AI_APICallError → original HTTP error
    const cause = error?.cause?.cause || error?.cause || error
    const status = cause?.status || cause?.statusCode || error?.cause?.status || error?.status || error?.statusCode
    const message = cause?.message || error?.cause?.message || error?.message || ''
    const responseBody = cause?.responseBody || cause?.data?.message || error?.cause?.responseBody || ''

    if (provider === 'cerebras') {
        if (status === 404 || message.includes('does not exist') || responseBody.includes('not_found')) {
            return `Cerebras model not found or not accessible. Preview models (Qwen 3 235B, GLM 4.7) may require pay-as-you-go. Try a production model like GPT-OSS 120B or Qwen 3 32B.`
        }
        if (status === 402) {
            return 'Cerebras API returned 402 (Payment Required). This usually means you\'re using an API key from a Team organization that requires credits. Go to cloud.cerebras.ai, switch to your Personal account, and copy that API key instead. The free tier (1M tokens/day) is only available on Personal accounts.'
        }
        if (status === 429) {
            return 'Cerebras rate limit exceeded. Free tier limits per model: 60K tokens/min, 30 requests/min, 1M tokens/day. Wait a moment or switch to another model.'
        }
    }

    if (provider === 'groq') {
        if (status === 413 || (status === 429 && message.includes('Request too large'))) {
            // TPM limit exceeded — request itself is too large for the model's token budget
            return `Groq request too large for this model's token limit. Try a shorter message, fewer tools, or switch to a model with higher limits (e.g. GPT-OSS 120B).`
        }
        if (status === 429) {
            return `Groq rate limit exceeded. Wait a moment or switch to another model.`
        }
    }

    if (provider === 'zai') {
        // Z.AI billing errors
        if (status === 402 || status === 429 || message.includes('billing') || message.includes('quota')) {
            return `Z.AI billing/quota error. Try switching to GLM-4.7-Flash (free tier).`
        }
    }

    if (provider === 'claude') {
        if (status === 401 || status === 403) {
            return 'Anthropic authentication failed. Please reconnect Claude Code or check your API key in Settings.'
        }
        if (status === 429) {
            return 'Anthropic rate limit exceeded. Wait a moment or switch to another model.'
        }
        if (status === 529) {
            return 'Anthropic API is overloaded. Please try again in a moment.'
        }
    }

    // If AI SDK wrapped the error, try to surface the original cause message
    if (message.includes('No output generated')) {
        // Try responseBody first (JSON error from API), then cause message
        if (responseBody) return responseBody
        const causeMsg = cause?.message || error?.cause?.message || ''
        if (causeMsg && causeMsg !== message) return causeMsg
    }
    return message || 'Unknown error occurred'
}

/**
 * Stream AI response using AI SDK v6
 * Supports tools (via maxSteps), images, reasoning, and all providers.
 * Converts AI SDK events to AIStreamEvent format for renderer compatibility.
 */
export async function streamWithAISDK(options: StreamingOptions): Promise<{
    text: string
    usage?: { promptTokens: number; completionTokens: number }
    responseId?: string
}> {
    const {
        prompt,
        provider,
        modelId,
        messages = [],
        images,
        mode = 'agent',
        signal,
        system,
        tools,
        stopWhen,
        maxSteps = 15,
        onUsage,
        providerOptions,
        onBeforeFinish
    } = options

    const startTime = Date.now()

    // Validate provider availability
    if (!isProviderAvailable(provider)) {
        const error = `Provider ${provider} is not available. Please configure credentials in Settings.`
        emit({ type: 'error', error })
        throw new Error(error)
    }

    const model = getLanguageModel(provider, modelId)
    const systemPrompt = system ?? getSystemPrompt(mode)

    log.info(`[AI SDK] Starting stream with ${modelId} (provider: ${provider}, tools: ${tools ? Object.keys(tools).length : 0}, maxSteps: ${maxSteps})`)
    if (providerOptions && Object.keys(providerOptions).length > 0) {
        log.info(`[AI SDK] providerOptions: ${JSON.stringify(providerOptions)}`)
    }

    let fullText = ''
    let stepCount = 0
    let totalPromptTokens = 0
    let totalCompletionTokens = 0

    try {
        const seenToolCalls = new Set<string>()
        const result = streamText({
            model,
            system: systemPrompt,
            messages: convertMessages(messages, prompt, images) as any,
            abortSignal: signal,
            tools,
            stopWhen,
            maxSteps,
            providerOptions: providerOptions as any,
            onChunk: ({ chunk }) => {
                if (chunk.type === 'text-delta') {
                    const text = (chunk as any).text || ''
                    fullText += text
                    emit({ type: 'text-delta', delta: text })
                }
                // AI SDK v6: reasoning chunks are type 'reasoning-delta' with .text property
                if (chunk.type === 'reasoning-delta') {
                    const reasoningText = (chunk as any).text || ''
                    if (reasoningText) {
                        emit({
                            type: 'reasoning-summary-delta',
                            delta: reasoningText,
                            summaryIndex: 0,
                        })
                    }
                }
            },
            onStepFinish: ({ usage, toolCalls, toolResults, reasoning }) => {
                stepCount++

                // Handle usage
                if (usage) {
                    const promptTok = (usage as any).promptTokens || (usage as any).inputTokens || 0
                    const completionTok = (usage as any).completionTokens || (usage as any).outputTokens || 0
                    totalPromptTokens += promptTok
                    totalCompletionTokens += completionTok
                }

                // Handle reasoning from step finish
                // AI SDK v6: reasoning is Array<{ type: 'reasoning'; text: string }>
                if (reasoning) {
                    let reasoningText: string | undefined
                    if (Array.isArray(reasoning)) {
                        reasoningText = reasoning
                            .filter((r: any) => r.text)
                            .map((r: any) => r.text)
                            .join('\n')
                    } else if (typeof reasoning === 'string') {
                        reasoningText = reasoning
                    }
                    if (reasoningText) {
                        emit({
                            type: 'reasoning-summary-done',
                            text: reasoningText,
                            summaryIndex: 0,
                        })
                    }
                }

                // Handle tool calls and results
                if (toolCalls) {
                    for (const toolCall of toolCalls) {
                        if (!seenToolCalls.has(toolCall.toolCallId)) {
                            seenToolCalls.add(toolCall.toolCallId)
                            emit({
                                type: 'tool-call-start',
                                toolCallId: toolCall.toolCallId,
                                toolName: toolCall.toolName,
                                args: (toolCall as { args?: Record<string, unknown> }).args
                            })
                        }
                        emit({
                            type: 'tool-call-done',
                            toolCallId: toolCall.toolCallId,
                            toolName: toolCall.toolName,
                            args: (toolCall as any).args || (toolCall as any).input
                        })
                    }
                }

                if (toolResults) {
                    for (const toolResult of toolResults) {
                        const output = (toolResult as any).result || (toolResult as any).output
                        const outputType =
                            output && typeof output === 'object' && 'type' in output
                                ? (output as { type?: string }).type
                                : undefined
                        const success = outputType !== 'error-text' && outputType !== 'execution-denied'

                        emit({
                            type: 'tool-result',
                            toolCallId: toolResult.toolCallId,
                            toolName: toolResult.toolName,
                            result: output,
                            success
                        })
                    }
                }

                // Emit step complete
                const hasMore = !!toolCalls && toolCalls.length > 0
                log.info(`[AI SDK] Step ${stepCount} complete: toolCalls=${toolCalls?.length ?? 0}, hasMore=${hasMore}, textSoFar=${fullText.length}chars`)
                emit({
                    type: 'step-complete',
                    stepNumber: stepCount,
                    hasMoreSteps: hasMore
                })
            }
        })

        // Consume the stream to completion.
        // AI SDK v6 uses backpressure: tokens are only generated when consumed.
        // `await result` does NOT consume the stream — we must await a property
        // like `result.text` which drives the stream and triggers all callbacks.
        log.info(`[AI SDK] Awaiting result.text (stream consumption)...`)
        const finalText = await result.text
        log.info(`[AI SDK] result.text resolved: ${finalText.length} chars (fullText from onChunk: ${fullText.length} chars)`)
        // Use finalText as fallback if onChunk missed anything
        if (!fullText && finalText) {
            fullText = finalText
        }

        // Emit text done
        if (fullText) {
            emit({ type: 'text-done', text: fullText })
        }

        // Call onBeforeFinish (suggestions, rate limit warnings, etc.)
        // Use a timeout to prevent blocking the finish event if the callback hangs
        if (onBeforeFinish) {
            try {
                await Promise.race([
                    onBeforeFinish(fullText, {
                        promptTokens: totalPromptTokens,
                        completionTokens: totalCompletionTokens
                    }),
                    new Promise<void>((_, reject) =>
                        setTimeout(() => reject(new Error('onBeforeFinish timed out after 15s')), 15_000)
                    )
                ])
            } catch (err) {
                log.warn('[AI SDK] onBeforeFinish callback error:', err)
            }
        }

        // Emit finish
        emit({
            type: 'finish',
            usage: {
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens
            },
            totalSteps: stepCount
        })

        log.info(`[AI SDK] Stream completed: ${stepCount} steps, ${totalPromptTokens + totalCompletionTokens} tokens`)

        // Notify usage callback (for rate limit tracking)
        if (onUsage) {
            onUsage({ promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens })
        }

        // Log usage to local database
        try {
            const tracker = getUsageTracker()
            tracker.logRequest({
                chatId: options.chatId,
                provider: provider,
                modelId: modelId,
                modelName: modelId,
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                totalTokens: totalPromptTokens + totalCompletionTokens,
                requestDurationMs: Date.now() - startTime
            })
        } catch (logError) {
            log.warn('[AI SDK] Failed to log usage:', logError)
        }

        return {
            text: fullText,
            usage: {
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens
            }
        }

    } catch (error: any) {
        // Handle abort
        if (error.name === 'AbortError' || signal?.aborted) {
            log.info('[AI SDK] Stream aborted')
            emit({ type: 'finish', totalSteps: stepCount })

            // Log partial usage even for aborted requests
            try {
                const tracker = getUsageTracker()
                if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
                    tracker.logRequest({
                        chatId: options.chatId,
                        provider: provider,
                        modelId: modelId,
                        modelName: modelId,
                        promptTokens: totalPromptTokens,
                        completionTokens: totalCompletionTokens,
                        totalTokens: totalPromptTokens + totalCompletionTokens,
                        requestDurationMs: Date.now() - startTime
                    })
                }
            } catch (logError) {
                log.warn('[AI SDK] Failed to log aborted usage:', logError)
            }

            return { text: fullText }
        }

        // Map provider-specific error messages
        const errorMessage = mapProviderError(provider, error)
        log.error(`[AI SDK] Stream error (${provider}):`, error)
        emit({ type: 'error', error: errorMessage })
        throw new Error(errorMessage)
    }
}

/**
 * Check if AI SDK v6 streaming should be used
 * This allows gradual rollout of the new implementation
 */
export function shouldUseAISDK(
    env: Record<string, string | undefined> = (import.meta as any).env ?? {}
): boolean {
    const raw =
        env.MAIN_VITE_AI_SDK_STREAMING ??
        env.AI_SDK_STREAMING ??
        ''
    return raw === 'true' || raw === '1'
}

// Re-export UI tool utilities for use in other modules
export { UI_TOOL_SCHEMAS, executeUITool }
