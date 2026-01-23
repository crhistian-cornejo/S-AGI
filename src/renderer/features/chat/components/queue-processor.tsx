'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useMessageQueueStore } from '../stores/message-queue-store'
import { useStreamingStatusStore } from '../stores/streaming-status-store'
import { useSendCallbackStore } from '../stores/send-callback-store'
import type { ChatQueueItem } from '../lib/queue-utils'

// Delay between processing queue items (ms)
const QUEUE_PROCESS_DELAY = 500

/**
 * Global queue processor component.
 *
 * This component runs at the app level (MainLayout) and processes
 * message queues for ALL chats, regardless of which one is currently active.
 *
 * Key insight: Unlike a local useEffect in ChatView which only
 * processes the currently active chat's queue, this component listens to
 * ALL queues and streaming statuses globally.
 *
 * Flow:
 * 1. ChatView registers its send callback via useSendCallbackStore
 * 2. When user sends while streaming, message goes to queue via useMessageQueueStore
 * 3. This processor watches both stores
 * 4. When status becomes 'ready' and queue has items, it processes them
 * 5. Calls the registered send callback to actually send the message
 */
export function ChatQueueProcessor() {
  // Track which chats are currently being processed to avoid double-sends
  const processingRef = useRef<Set<string>>(new Set())
  // Track timers for cleanup
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  useEffect(() => {
    // Function to process queue for a specific chat
    const processQueue = async (chatId: string) => {
      // Check if already processing this chat
      if (processingRef.current.has(chatId)) {
        return
      }

      // Check streaming status
      const status = useStreamingStatusStore.getState().getStatus(chatId)
      if (status !== 'ready') {
        return
      }

      // Get queue for this chat
      const queue = useMessageQueueStore.getState().queues[chatId] || []
      if (queue.length === 0) {
        return
      }

      // Get the send callback for this chat
      const sendCallback = useSendCallbackStore.getState().getCallback(chatId)
      if (!sendCallback) {
        console.warn(`[QueueProcessor] No send callback registered for chat ${chatId}`)
        return
      }

      // Mark as processing
      processingRef.current.add(chatId)

      // Pop the first item from queue (atomic operation)
      const item = useMessageQueueStore.getState().popItem(chatId, queue[0].id)
      if (!item) {
        processingRef.current.delete(chatId)
        return
      }

      try {
        console.log(`[QueueProcessor] Processing queued message for chat ${chatId}:`, item.message.substring(0, 50))

        // Call the registered send callback
        await sendCallback(item)

      } catch (error) {
        console.error(`[QueueProcessor] Error processing queue:`, error)

        // Requeue the item at the front so it can be retried
        useMessageQueueStore.getState().prependItem(chatId, item)

        // Set error status (will be cleared on next successful send or manual retry)
        useStreamingStatusStore.getState().setStatus(chatId, 'error')

        // Notify user
        toast.error('Failed to send queued message. It will be retried.')
      } finally {
        processingRef.current.delete(chatId)
      }
    }

    // Schedule processing for a chat with delay
    const scheduleProcessing = (chatId: string) => {
      // Clear any existing timer for this chat
      const existingTimer = timersRef.current.get(chatId)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      // Schedule new processing
      const timer = setTimeout(() => {
        timersRef.current.delete(chatId)
        processQueue(chatId)
      }, QUEUE_PROCESS_DELAY)

      timersRef.current.set(chatId, timer)
    }

    // Check all queues and schedule processing for ready chats
    const checkAllQueues = () => {
      const queues = useMessageQueueStore.getState().queues

      for (const chatId of Object.keys(queues)) {
        const queue = queues[chatId]
        if (!queue || queue.length === 0) continue

        const status = useStreamingStatusStore.getState().getStatus(chatId)

        // Process when ready, or retry on error status
        if ((status === 'ready' || status === 'error') && !processingRef.current.has(chatId)) {
          // If error status, clear it before retrying
          if (status === 'error') {
            useStreamingStatusStore.getState().setStatus(chatId, 'ready')
          }
          scheduleProcessing(chatId)
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
