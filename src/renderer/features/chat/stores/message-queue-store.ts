/**
 * Message queue store for chat
 * Adapted from 1code's message queue store
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { ChatQueueItem } from '../lib/queue-utils'
import { removeQueueItem } from '../lib/queue-utils'

// Empty array constant to avoid creating new arrays on each call
// Exported for use in selectors to maintain stable reference
export const EMPTY_QUEUE: ChatQueueItem[] = []

interface MessageQueueState {
  // Map: chatId -> queue items
  queues: Record<string, ChatQueueItem[]>

  // Actions
  addToQueue: (chatId: string, item: ChatQueueItem) => void
  removeFromQueue: (chatId: string, itemId: string) => void
  getQueue: (chatId: string) => ChatQueueItem[]
  getNextItem: (chatId: string) => ChatQueueItem | null
  clearQueue: (chatId: string) => void
  // Returns and removes the item from queue (atomic operation)
  popItem: (chatId: string, itemId: string) => ChatQueueItem | null
  // Add item to front of queue (for error recovery)
  prependItem: (chatId: string, item: ChatQueueItem) => void
}

export const useMessageQueueStore = create<MessageQueueState>()(
  subscribeWithSelector((set, get) => ({
    queues: {},

    addToQueue: (chatId, item) => {
      set((state) => ({
        queues: {
          ...state.queues,
          [chatId]: [...(state.queues[chatId] || []), item],
        },
      }))
    },

    removeFromQueue: (chatId, itemId) => {
      set((state) => {
        const currentQueue = state.queues[chatId] || []
        return {
          queues: {
            ...state.queues,
            [chatId]: removeQueueItem(currentQueue, itemId),
          },
        }
      })
    },

    getQueue: (chatId) => {
      return get().queues[chatId] ?? EMPTY_QUEUE
    },

    getNextItem: (chatId) => {
      const queue = get().queues[chatId] || []
      return queue.find((item) => item.status === 'pending') || null
    },

    clearQueue: (chatId) => {
      set((state) => ({
        queues: {
          ...state.queues,
          [chatId]: [],
        },
      }))
    },

    // Atomic pop: find and remove in single set() call to prevent race conditions
    popItem: (chatId, itemId) => {
      let foundItem: ChatQueueItem | null = null
      set((state) => {
        const currentQueue = state.queues[chatId] || []
        foundItem = currentQueue.find((i) => i.id === itemId) || null
        if (!foundItem) return state
        return {
          queues: {
            ...state.queues,
            [chatId]: currentQueue.filter((i) => i.id !== itemId),
          },
        }
      })
      return foundItem
    },

    // Add item to front of queue (used for error recovery - requeue failed items)
    prependItem: (chatId, item) => {
      set((state) => ({
        queues: {
          ...state.queues,
          [chatId]: [item, ...(state.queues[chatId] || [])],
        },
      }))
    },
  }))
)
