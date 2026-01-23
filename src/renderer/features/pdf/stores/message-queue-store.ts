/**
 * Message queue store for PDF chat
 * Adapted from 1code's message queue store
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { PdfQueueItem } from '../lib/queue-utils'
import { removeQueueItem } from '../lib/queue-utils'

// Empty array constant to avoid creating new arrays on each call
// Exported for use in selectors to maintain stable reference
export const EMPTY_QUEUE: PdfQueueItem[] = []

interface MessageQueueState {
  // Map: pdfId -> queue items
  queues: Record<string, PdfQueueItem[]>

  // Actions
  addToQueue: (pdfId: string, item: PdfQueueItem) => void
  removeFromQueue: (pdfId: string, itemId: string) => void
  getQueue: (pdfId: string) => PdfQueueItem[]
  getNextItem: (pdfId: string) => PdfQueueItem | null
  clearQueue: (pdfId: string) => void
  // Returns and removes the item from queue (atomic operation)
  popItem: (pdfId: string, itemId: string) => PdfQueueItem | null
  // Add item to front of queue (for error recovery)
  prependItem: (pdfId: string, item: PdfQueueItem) => void
}

export const useMessageQueueStore = create<MessageQueueState>()(
  subscribeWithSelector((set, get) => ({
    queues: {},

    addToQueue: (pdfId, item) => {
      set((state) => ({
        queues: {
          ...state.queues,
          [pdfId]: [...(state.queues[pdfId] || []), item],
        },
      }))
    },

    removeFromQueue: (pdfId, itemId) => {
      set((state) => {
        const currentQueue = state.queues[pdfId] || []
        return {
          queues: {
            ...state.queues,
            [pdfId]: removeQueueItem(currentQueue, itemId),
          },
        }
      })
    },

    getQueue: (pdfId) => {
      return get().queues[pdfId] ?? EMPTY_QUEUE
    },

    getNextItem: (pdfId) => {
      const queue = get().queues[pdfId] || []
      return queue.find((item) => item.status === 'pending') || null
    },

    clearQueue: (pdfId) => {
      set((state) => ({
        queues: {
          ...state.queues,
          [pdfId]: [],
        },
      }))
    },

    // Atomic pop: find and remove in single set() call to prevent race conditions
    popItem: (pdfId, itemId) => {
      let foundItem: PdfQueueItem | null = null
      set((state) => {
        const currentQueue = state.queues[pdfId] || []
        foundItem = currentQueue.find((i) => i.id === itemId) || null
        if (!foundItem) return state
        return {
          queues: {
            ...state.queues,
            [pdfId]: currentQueue.filter((i) => i.id !== itemId),
          },
        }
      })
      return foundItem
    },

    // Add item to front of queue (used for error recovery - requeue failed items)
    prependItem: (pdfId, item) => {
      set((state) => ({
        queues: {
          ...state.queues,
          [pdfId]: [item, ...(state.queues[pdfId] || [])],
        },
      }))
    },
  }))
)
