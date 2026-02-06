/**
 * Message queue store for chat
 * Uses the generic createQueueStore factory
 */

import { createQueueStore, createEmptyQueueConstant } from '../../../lib/stores/create-queue-store'
import type { ChatQueueItem } from '../lib/queue-utils'

// Empty array constant to avoid creating new arrays on each call
// Exported for use in selectors to maintain stable reference
export const EMPTY_QUEUE = createEmptyQueueConstant<ChatQueueItem>()

/**
 * Chat message queue store
 *
 * Manages message queues for chat sessions. Each chat has its own queue
 * of pending messages that are processed sequentially.
 *
 * Features:
 * - Entity-scoped queues (keyed by chatId)
 * - Atomic popItem operation to prevent race conditions
 * - Memory cleanup methods (cleanup, clearAll)
 * - subscribeWithSelector for reactive patterns
 */
export const useMessageQueueStore = createQueueStore<ChatQueueItem>({
  name: 'chat-message-queue',
})
