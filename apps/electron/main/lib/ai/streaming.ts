import { streamText } from 'ai'
import log from 'electron-log'
import { sendToRenderer } from '../window-manager'
import { getLanguageModel, isProviderAvailable } from './providers'
import { getSystemPrompt, UI_TOOL_SCHEMAS, executeUITool } from './agent'
import type { AIProvider, AIStreamEvent } from '@shared/ai-types'

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
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    images?: Array<{ type: 'image'; data: string; mediaType: string }>
    mode?: 'agent' | 'plan'
    signal?: AbortSignal
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
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    currentPrompt: string,
    images?: Array<{ type: 'image'; data: string; mediaType: string }>
): Array<{ role: 'user' | 'assistant' | 'system'; content: string | Array<{ type: string; text?: string; image?: string }> }> {
    const result: Array<{ role: 'user' | 'assistant' | 'system'; content: string | Array<{ type: string; text?: string; image?: string }> }> = []

    // Add previous messages
    for (const msg of messages) {
        result.push({ role: msg.role, content: msg.content })
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
 * Stream AI response using AI SDK v6
 * Converts AI SDK events to AIStreamEvent format for renderer compatibility
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
        signal
    } = options

    // Validate provider availability
    if (!isProviderAvailable(provider)) {
        const error = `Provider ${provider} is not available. Please configure credentials in Settings.`
        emit({ type: 'error', error })
        throw new Error(error)
    }

    const model = getLanguageModel(provider, modelId)
    const systemPrompt = getSystemPrompt(mode)

    log.info(`[AI SDK] Starting stream with ${modelId} (provider: ${provider})`)

    let fullText = ''
    let stepCount = 0
    let totalPromptTokens = 0
    let totalCompletionTokens = 0

    try {
        const result = streamText({
            model,
            system: systemPrompt,
            messages: convertMessages(messages, prompt, images) as any,
            abortSignal: signal,
            onChunk: ({ chunk }) => {
                // Handle different chunk types
                if (chunk.type === 'text-delta') {
                    const text = (chunk as any).text || (chunk as any).textDelta || ''
                    fullText += text
                    emit({ type: 'text-delta', delta: text })
                }
            },
            onStepFinish: ({ usage, toolCalls, toolResults }) => {
                stepCount++

                // Handle usage
                if (usage) {
                    const promptTok = (usage as any).promptTokens || (usage as any).inputTokens || 0
                    const completionTok = (usage as any).completionTokens || (usage as any).outputTokens || 0
                    totalPromptTokens += promptTok
                    totalCompletionTokens += completionTok
                }

                // Handle tool calls and results
                if (toolCalls) {
                    for (const toolCall of toolCalls) {
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
                        emit({
                            type: 'tool-result',
                            toolCallId: toolResult.toolCallId,
                            toolName: toolResult.toolName,
                            result: (toolResult as any).result || (toolResult as any).output,
                            success: true
                        })
                    }
                }

                // Emit step complete
                emit({
                    type: 'step-complete',
                    stepNumber: stepCount,
                    hasMoreSteps: !!toolCalls && toolCalls.length > 0
                })
            }
        })

        // Wait for the stream to complete
        await result

        // Emit text done
        if (fullText) {
            emit({ type: 'text-done', text: fullText })
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
            return { text: fullText }
        }

        // Handle other errors
        const errorMessage = error.message || 'Unknown error occurred'
        log.error('[AI SDK] Stream error:', error)
        emit({ type: 'error', error: errorMessage })
        throw error
    }
}

/**
 * Check if AI SDK v6 streaming should be used
 * This allows gradual rollout of the new implementation
 */
export function shouldUseAISDK(): boolean {
    // For now, return false to use the existing implementation
    // Set to true or use a feature flag to enable AI SDK v6
    return false
}

// Re-export UI tool utilities for use in other modules
export { UI_TOOL_SCHEMAS, executeUITool }
