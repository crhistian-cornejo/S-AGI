"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useMessageQueueStore } from "../stores/message-queue-store"
import { useStreamingStatusStore } from "../stores/streaming-status-store"
import type { PdfChatMessage } from "@/lib/atoms"
import { trpc } from "@/lib/trpc"

// Delay between processing queue items (ms)
const QUEUE_PROCESS_DELAY = 1000

/**
 * Global queue processor component for PDF chat.
 *
 * This component processes message queues for PDFs, allowing multiple
 * questions to be queued while AI is still responding to previous ones.
 *
 * Features:
 * - Processes queue items sequentially
 * - Handles errors gracefully with requeue
 * - Updates streaming status to prevent duplicate processing
 */
export function PdfQueueProcessor() {
    const processingRef = useRef<Set<string>>(new Set())
    const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
    const queryPdfMutation = trpc.pdf.queryPdf.useMutation()

    useEffect(() => {
        // Function to process queue for a specific PDF
        const processQueue = async (pdfId: string) => {
            // Check if already processing this PDF
            if (processingRef.current.has(pdfId)) {
                return
            }

            // Check streaming status
            const status = useStreamingStatusStore.getState().getStatus(pdfId)
            if (status !== "ready") {
                return
            }

            // Get queue for this PDF
            const queue = useMessageQueueStore.getState().queues[pdfId] || []
            if (queue.length === 0) {
                return
            }

            // Mark as processing
            processingRef.current.add(pdfId)

            // Pop the first item from queue (atomic operation)
            const item = useMessageQueueStore.getState().popItem(pdfId, queue[0].id)
            if (!item) {
                processingRef.current.delete(pdfId)
                return
            }

            try {
                // Set streaming status to processing
                useStreamingStatusStore.getState().setStatus(pdfId, 'processing')

                // Call AI API for PDF query
                const result = await queryPdfMutation.mutateAsync({
                    pdfId: item.pdfId,
                    sourceType: 'chat_file', // Default to chat_file, can be adjusted
                    query: item.query,
                    context: {
                        currentPage: item.currentPage,
                        selectedText: item.selectedText?.text,
                        pageCount: undefined // Would need to fetch this from the PDF source
                    }
                })

                // Transform backend citations to CitationData format
                const citations = result.citations?.map((c: { pageNumber: number; text: string }, idx: number) => ({
                    id: idx + 1,
                    filename: 'Unknown', // Would need to fetch from PDF source
                    pageNumber: c.pageNumber,
                    text: c.text
                })) || undefined

                // Add AI response to chat messages
                // Note: This is a simplified version - in practice you'd need to access
                // the correct atom for the specific PDF's chat messages
                const aiMessage: PdfChatMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: result.answer,
                    createdAt: new Date(),
                    citations
                }

                // For now, we'll just log since we don't have access to the atom setter here
                // In a real implementation, you'd pass the atom setter or use a callback
                console.log('[PdfQueueProcessor] AI response:', aiMessage)

            } catch (error) {
                console.error(`[PdfQueueProcessor] Error processing queue:`, error)

                // Requeue the item at the front so it can be retried
                useMessageQueueStore.getState().prependItem(pdfId, item)

                // Set error status (will be cleared on next successful send or manual retry)
                useStreamingStatusStore.getState().setStatus(pdfId, 'error')

                // Notify user
                toast.error('Failed to process queued message. It will be retried.')
            } finally {
                // Reset streaming status
                useStreamingStatusStore.getState().setStatus(pdfId, 'ready')
                processingRef.current.delete(pdfId)
            }
        }

        // Schedule processing for a PDF with delay
        const scheduleProcessing = (pdfId: string) => {
            // Clear any existing timer for this PDF
            const existingTimer = timersRef.current.get(pdfId)
            if (existingTimer) {
                clearTimeout(existingTimer)
            }

            // Schedule new processing
            const timer = setTimeout(() => {
                timersRef.current.delete(pdfId)
                processQueue(pdfId)
            }, QUEUE_PROCESS_DELAY)

            timersRef.current.set(pdfId, timer)
        }

        // Check all queues and schedule processing for ready PDFs
        const checkAllQueues = () => {
            const queues = useMessageQueueStore.getState().queues

            for (const pdfId of Object.keys(queues)) {
                const queue = queues[pdfId]
                if (!queue || queue.length === 0) continue

                const status = useStreamingStatusStore.getState().getStatus(pdfId)

                // Process when ready, or retry on error status
                if ((status === 'ready' || status === 'error') && !processingRef.current.has(pdfId)) {
                    // If error status, clear it before retrying
                    if (status === 'error') {
                        useStreamingStatusStore.getState().setStatus(pdfId, 'ready')
                    }
                    scheduleProcessing(pdfId)
                }
            }
        }

        // Subscribe to queue changes with selector (requires subscribeWithSelector middleware)
        const unsubscribeQueue = useMessageQueueStore.subscribe(
            (state) => state.queues,
            () => checkAllQueues()
        )

        // Subscribe to streaming status changes with selector
        const unsubscribeStatus = useStreamingStatusStore.subscribe(
            (state) => state.statuses,
            () => checkAllQueues()
        )

        // Initial check
        checkAllQueues()

        // Cleanup
        return () => {
            unsubscribeQueue()
          unsubscribeStatus()

          // Clear all timers
          for (const timer of timersRef.current.values()) {
            clearTimeout(timer)
          }
          timersRef.current.clear()
        }
    }, [])

    // This component doesn't render anything
    return null
}
