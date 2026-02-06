/**
 * Message queue store for PDF chat
 * Uses the generic createQueueStore factory
 */

import { createQueueStore, createEmptyQueueConstant } from '../../../lib/stores/create-queue-store'
import type { PdfQueueItem } from '../lib/queue-utils'

// Empty array constant to avoid creating new arrays on each call
// Exported for use in selectors to maintain stable reference
export const EMPTY_QUEUE = createEmptyQueueConstant<PdfQueueItem>()

/**
 * PDF message queue store
 *
 * Manages message queues for PDF chat sessions. Each PDF has its own queue
 * of pending queries that are processed sequentially.
 *
 * Features:
 * - Entity-scoped queues (keyed by pdfId)
 * - Atomic popItem operation to prevent race conditions
 * - Memory cleanup methods (cleanup, clearAll)
 * - subscribeWithSelector for reactive patterns
 */
export const useMessageQueueStore = createQueueStore<PdfQueueItem>({
  name: 'pdf-message-queue',
})
