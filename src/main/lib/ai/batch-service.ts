/**
 * OpenAI Batch API Service
 * 
 * Provides 50% cost savings for non-time-sensitive operations.
 * Batches are processed within 24 hours (usually much faster).
 * 
 * Use cases:
 * - Title generation for chats
 * - Embeddings generation
 * - Data classification
 * - Evaluations
 * 
 * @see https://platform.openai.com/docs/guides/batch
 */

import OpenAI from 'openai'
import log from 'electron-log'
import { supabase } from '../supabase/client'
import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'

// Types for batch requests
export interface BatchRequest {
    custom_id: string
    method: 'POST'
    url: '/v1/chat/completions' | '/v1/responses' | '/v1/embeddings'
    body: Record<string, unknown>
}

export interface BatchResult {
    id: string
    custom_id: string
    response: {
        status_code: number
        request_id: string
        body: Record<string, unknown>
    } | null
    error: {
        code: string
        message: string
    } | null
}

export type BatchStatus = 
    | 'validating' 
    | 'failed' 
    | 'in_progress' 
    | 'finalizing' 
    | 'completed' 
    | 'expired' 
    | 'cancelling' 
    | 'cancelled'

// Queue for pending title generation requests
interface PendingTitleRequest {
    chatId: string
    prompt: string
    timestamp: number
}

// Singleton batch manager
class BatchManager {
    private pendingTitles: PendingTitleRequest[] = []
    private batchTimer: NodeJS.Timeout | null = null
    private readonly BATCH_DELAY_MS = 10_000 // Wait 10 seconds to accumulate requests
    private readonly MIN_BATCH_SIZE = 3 // Minimum requests before batching makes sense
    // Note: OpenAI max is 50,000 requests per batch, but we rarely hit this

    /**
     * Queue a title generation request for batch processing
     * If immediate is true or batch threshold not met, process synchronously
     */
    async queueTitleGeneration(
        chatId: string,
        prompt: string,
        apiKey: string,
        options?: { immediate?: boolean }
    ): Promise<string | null> {
        // If immediate mode or we're in development, use sync API
        if (options?.immediate) {
            return this.generateTitleSync(chatId, prompt, apiKey)
        }

        // Add to pending queue
        this.pendingTitles.push({
            chatId,
            prompt,
            timestamp: Date.now()
        })

        log.info(`[Batch] Queued title generation for chat ${chatId}, queue size: ${this.pendingTitles.length}`)

        // If we have enough requests, process immediately
        if (this.pendingTitles.length >= this.MIN_BATCH_SIZE) {
            this.cancelBatchTimer()
            await this.processTitleBatch(apiKey)
            return null // Results will be stored in DB
        }

        // Otherwise, set a timer to process after delay
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(async () => {
                await this.processTitleBatch(apiKey)
            }, this.BATCH_DELAY_MS)
        }

        return null // Async processing
    }

    /**
     * Generate title synchronously (for urgent requests or fallback)
     */
    private async generateTitleSync(
        chatId: string,
        prompt: string,
        apiKey: string
    ): Promise<string> {
        const client = new OpenAI({ apiKey })
        
        try {
            const response = await client.responses.create({
                model: 'gpt-5-nano',
                input: prompt,
                instructions: "Generate a short, concise title (max 5 words) for the user's message. Do not use quotes. Just respond with the title, nothing else.",
                max_output_tokens: 50
            })

            const title = response.output_text?.trim() || this.getFallbackTitle(prompt)
            
            // Update in database
            await supabase
                .from('chats')
                .update({ title })
                .eq('id', chatId)

            return title
        } catch (error) {
            log.error('[Batch] Sync title generation failed:', error)
            return this.getFallbackTitle(prompt)
        }
    }

    /**
     * Process accumulated title requests as a batch
     */
    private async processTitleBatch(apiKey: string): Promise<void> {
        this.cancelBatchTimer()

        if (this.pendingTitles.length === 0) {
            return
        }

        const requests = [...this.pendingTitles]
        this.pendingTitles = []

        log.info(`[Batch] Processing ${requests.length} title requests as batch`)

        // If only 1-2 requests, use sync API (batch overhead not worth it)
        if (requests.length < this.MIN_BATCH_SIZE) {
            for (const req of requests) {
                await this.generateTitleSync(req.chatId, req.prompt, apiKey)
            }
            return
        }

        try {
            const client = new OpenAI({ apiKey })

            // Create JSONL content for batch
            const batchRequests: BatchRequest[] = requests.map(req => ({
                custom_id: req.chatId,
                method: 'POST',
                url: '/v1/chat/completions',
                body: {
                    model: 'gpt-4o-mini', // Use chat completions for batch (cheaper)
                    messages: [
                        {
                            role: 'system',
                            content: "Generate a short, concise title (max 5 words) for the user's message. Do not use quotes. Just respond with the title, nothing else."
                        },
                        {
                            role: 'user',
                            content: req.prompt.slice(0, 500) // Limit prompt length
                        }
                    ],
                    max_tokens: 20
                }
            }))

            // Write to temp file
            const tempDir = app.getPath('temp')
            const batchFilePath = path.join(tempDir, `batch_titles_${Date.now()}.jsonl`)
            const jsonlContent = batchRequests.map(r => JSON.stringify(r)).join('\n')
            await fs.writeFile(batchFilePath, jsonlContent, 'utf-8')

            // Upload file
            const fileBuffer = await fs.readFile(batchFilePath)
            const file = await client.files.create({
                file: new File([fileBuffer], 'batch_input.jsonl', { type: 'application/jsonl' }),
                purpose: 'batch'
            })

            log.info(`[Batch] Uploaded batch file: ${file.id}`)

            // Create batch
            const batch = await client.batches.create({
                input_file_id: file.id,
                endpoint: '/v1/chat/completions',
                completion_window: '24h',
                metadata: {
                    type: 'title_generation',
                    count: String(requests.length)
                }
            })

            log.info(`[Batch] Created batch: ${batch.id}, status: ${batch.status}`)

            // Store batch info for later retrieval
            await supabase.from('batch_jobs').insert({
                id: batch.id,
                type: 'title_generation',
                status: batch.status,
                input_file_id: file.id,
                request_count: requests.length,
                created_at: new Date().toISOString()
            })

            // Clean up temp file
            await fs.unlink(batchFilePath).catch(() => {})

            // Start polling for results (in background)
            this.pollBatchResults(batch.id, apiKey)

        } catch (error) {
            log.error('[Batch] Failed to create batch:', error)
            
            // Fallback: process synchronously
            for (const req of requests) {
                await this.generateTitleSync(req.chatId, req.prompt, apiKey)
            }
        }
    }

    /**
     * Poll for batch completion and process results
     */
    private async pollBatchResults(batchId: string, apiKey: string): Promise<void> {
        const client = new OpenAI({ apiKey })
        const maxAttempts = 60 // Poll for up to 1 hour (1 min intervals)
        let attempts = 0

        const poll = async () => {
            attempts++
            
            try {
                const batch = await client.batches.retrieve(batchId)
                
                log.info(`[Batch] Poll ${attempts}: status=${batch.status}, completed=${batch.request_counts?.completed}/${batch.request_counts?.total}`)

                // Update status in DB
                await supabase
                    .from('batch_jobs')
                    .update({
                        status: batch.status,
                        completed_count: batch.request_counts?.completed,
                        failed_count: batch.request_counts?.failed
                    })
                    .eq('id', batchId)

                if (batch.status === 'completed') {
                    await this.processBatchResults(batch, apiKey)
                    return
                }

                if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
                    log.error(`[Batch] Batch ${batchId} ended with status: ${batch.status}`)
                    return
                }

                // Continue polling
                if (attempts < maxAttempts) {
                    setTimeout(poll, 60_000) // Poll every minute
                }

            } catch (error) {
                log.error(`[Batch] Poll error for ${batchId}:`, error)
                if (attempts < maxAttempts) {
                    setTimeout(poll, 60_000)
                }
            }
        }

        // Start polling after 30 seconds (give batch time to start)
        setTimeout(poll, 30_000)
    }

    /**
     * Process completed batch results
     */
    private async processBatchResults(
        batch: OpenAI.Batches.Batch,
        apiKey: string
    ): Promise<void> {
        if (!batch.output_file_id) {
            log.error('[Batch] No output file for completed batch')
            return
        }

        const client = new OpenAI({ apiKey })

        try {
            const fileResponse = await client.files.content(batch.output_file_id)
            const content = await fileResponse.text()
            const results = content.split('\n').filter(Boolean).map(line => JSON.parse(line) as BatchResult)

            log.info(`[Batch] Processing ${results.length} results`)

            for (const result of results) {
                if (result.error) {
                    log.warn(`[Batch] Request ${result.custom_id} failed:`, result.error)
                    continue
                }

                if (result.response?.status_code === 200) {
                    const body = result.response.body as any
                    const title = body.choices?.[0]?.message?.content?.trim()

                    if (title) {
                        await supabase
                            .from('chats')
                            .update({ title })
                            .eq('id', result.custom_id)
                        
                        log.info(`[Batch] Updated title for chat ${result.custom_id}: "${title}"`)
                    }
                }
            }

            // Update batch job status
            await supabase
                .from('batch_jobs')
                .update({
                    status: 'processed',
                    completed_at: new Date().toISOString()
                })
                .eq('id', batch.id)

        } catch (error) {
            log.error('[Batch] Failed to process results:', error)
        }
    }

    private cancelBatchTimer(): void {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer)
            this.batchTimer = null
        }
    }

    private getFallbackTitle(prompt: string): string {
        const trimmed = prompt.trim()
        if (!trimmed) return 'New Chat'
        if (trimmed.length <= 25) return trimmed
        return `${trimmed.slice(0, 25)}...`
    }

    /**
     * Get pending batch jobs status
     */
    async getPendingBatches(): Promise<Array<{
        id: string
        type: string
        status: string
        requestCount: number
        completedCount: number
        createdAt: string
    }>> {
        const { data } = await supabase
            .from('batch_jobs')
            .select('*')
            .in('status', ['validating', 'in_progress', 'finalizing'])
            .order('created_at', { ascending: false })
            .limit(10)

        return (data || []).map(job => ({
            id: job.id,
            type: job.type,
            status: job.status,
            requestCount: job.request_count,
            completedCount: job.completed_count || 0,
            createdAt: job.created_at
        }))
    }
}

// Export singleton
export const batchManager = new BatchManager()

/**
 * Flex Processing Helper
 * 
 * Use for non-urgent requests to get Batch API pricing with sync API.
 * May return 429 if resources unavailable.
 * 
 * @see https://platform.openai.com/docs/guides/flex-processing
 */
export interface FlexOptions {
    /** Timeout in ms (default: 900000 = 15 min) */
    timeout?: number
    /** Retry with standard tier on 429 */
    fallbackToStandard?: boolean
}

export async function createFlexResponse(
    client: OpenAI,
    params: OpenAI.Responses.ResponseCreateParams,
    options?: FlexOptions
): Promise<OpenAI.Responses.Response> {
    const timeout = options?.timeout || 900_000 // 15 minutes

    try {
        const response = await client.responses.create(
            {
                ...params,
                service_tier: 'flex'
            } as any,
            { timeout }
        )
        return response
    } catch (error: any) {
        // Handle 429 Resource Unavailable
        if (error?.status === 429 && options?.fallbackToStandard) {
            log.warn('[Flex] Resource unavailable, falling back to standard tier')
            return client.responses.create(params, { timeout }) as Promise<OpenAI.Responses.Response>
        }
        throw error
    }
}

/**
 * Cost estimation helper
 */
export interface CostEstimate {
    inputTokens: number
    outputTokens: number
    reasoningTokens?: number
    standardCost: number
    batchCost: number
    flexCost: number
    savings: {
        batch: number
        flex: number
    }
}

// Approximate pricing per 1M tokens (as of 2024)
const PRICING = {
    'gpt-5': { input: 5, output: 15, reasoning: 15 },
    'gpt-5-mini': { input: 0.15, output: 0.6, reasoning: 0.6 },
    'gpt-5-nano': { input: 0.075, output: 0.3, reasoning: 0.3 },
    'gpt-4o-mini': { input: 0.15, output: 0.6, reasoning: 0 }
} as const

export function estimateCost(
    model: keyof typeof PRICING,
    inputTokens: number,
    outputTokens: number,
    reasoningTokens: number = 0
): CostEstimate {
    const pricing = PRICING[model] || PRICING['gpt-5-mini']
    
    const inputCost = (inputTokens / 1_000_000) * pricing.input
    const outputCost = (outputTokens / 1_000_000) * pricing.output
    const reasoningCost = (reasoningTokens / 1_000_000) * pricing.reasoning

    const standardCost = inputCost + outputCost + reasoningCost
    const batchCost = standardCost * 0.5 // 50% discount
    const flexCost = standardCost * 0.5 // Same as batch

    return {
        inputTokens,
        outputTokens,
        reasoningTokens,
        standardCost,
        batchCost,
        flexCost,
        savings: {
            batch: standardCost - batchCost,
            flex: standardCost - flexCost
        }
    }
}
