/**
 * Generic queue store factory for creating type-safe Zustand queue stores.
 *
 * This factory eliminates duplication across message-queue-store implementations
 * (chat, pdf, agents) by providing a reusable, configurable queue store creator.
 *
 * Usage:
 * ```typescript
 * interface MyQueueItem extends BaseQueueItem {
 *   customField: string;
 * }
 *
 * export const useMyQueueStore = createQueueStore<MyQueueItem>({
 *   name: 'my-queue',
 *   statusField: 'status',      // Field to check for 'pending' status
 *   pendingValue: 'pending',    // Value that indicates item is pending
 * });
 * ```
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { StoreApi, UseBoundStore, Mutate } from 'zustand'

/**
 * Type alias for a queue store with subscribeWithSelector middleware
 */
type QueueStore<T extends BaseQueueItem> = UseBoundStore<
  Mutate<StoreApi<QueueStoreState<T>>, [['zustand/subscribeWithSelector', never]]>
>

/**
 * Base interface that all queue items must implement.
 * Items need an `id` for identification and a status-like field for queue ordering.
 */
export interface BaseQueueItem {
  id: string
  status: string
}

/**
 * Configuration options for creating a queue store.
 */
export interface QueueStoreConfig<T extends BaseQueueItem> {
  /** Name of the store (for debugging) */
  name?: string
  /** Field to check for pending status. Defaults to 'status' */
  statusField?: keyof T
  /** Value that indicates an item is pending. Defaults to 'pending' */
  pendingValue?: T[keyof T]
  /** Custom filter function for getNextItem. Overrides statusField/pendingValue */
  pendingFilter?: (item: T) => boolean
}

/**
 * State interface for the queue store.
 * Uses a Record to map entity IDs (chatId, pdfId, etc.) to their queue arrays.
 */
export interface QueueStoreState<T extends BaseQueueItem> {
  /** Map of entityId -> queue items */
  queues: Record<string, T[]>

  // Core queue operations
  /** Add an item to the end of the queue for an entity */
  addToQueue: (entityId: string, item: T) => void
  /** Remove an item by ID from an entity's queue */
  removeFromQueue: (entityId: string, itemId: string) => void
  /** Get the queue for an entity (returns empty array if none) */
  getQueue: (entityId: string) => T[]
  /** Get the next pending item from an entity's queue */
  getNextItem: (entityId: string) => T | null
  /** Clear all items from an entity's queue */
  clearQueue: (entityId: string) => void

  // Advanced operations
  /** Atomically pop (find and remove) an item from the queue */
  popItem: (entityId: string, itemId: string) => T | null
  /** Add an item to the front of the queue (for error recovery/retry) */
  prependItem: (entityId: string, item: T) => void
  /** Update an item in the queue by ID */
  updateItem: (entityId: string, itemId: string, updates: Partial<T>) => void

  // Cleanup operations
  /** Remove the entire queue for an entity (memory cleanup) */
  cleanup: (entityId: string) => void
  /** Clear all queues (for logout or full reset) */
  clearAll: () => void
}

/**
 * Creates a generic queue store with Zustand.
 *
 * Features:
 * - Type-safe with full TypeScript support
 * - Entity-scoped queues (keyed by chatId, pdfId, etc.)
 * - Atomic operations (popItem) to prevent race conditions
 * - Memory cleanup methods
 * - subscribeWithSelector middleware for reactive patterns
 *
 * @param config - Configuration options for the store
 * @returns A Zustand hook for the queue store
 */
export function createQueueStore<T extends BaseQueueItem>(
  config: QueueStoreConfig<T> = {}
): QueueStore<T> {
  const {
    statusField = 'status' as keyof T,
    pendingValue = 'pending' as T[keyof T],
    pendingFilter,
  } = config

  // Create empty array constant per store instance to maintain stable reference
  const EMPTY_QUEUE: T[] = []

  // Determine the filter function for finding pending items
  const isPending = pendingFilter ?? ((item: T) => item[statusField] === pendingValue)

  return create<QueueStoreState<T>>()(
    subscribeWithSelector((set, get) => ({
      queues: {},

      addToQueue: (entityId, item) => {
        set((state) => ({
          queues: {
            ...state.queues,
            [entityId]: [...(state.queues[entityId] || []), item],
          },
        }))
      },

      removeFromQueue: (entityId, itemId) => {
        set((state) => {
          const currentQueue = state.queues[entityId] || []
          const newQueue = currentQueue.filter((i) => i.id !== itemId)
          // Only update if something was actually removed
          if (newQueue.length === currentQueue.length) return state
          return {
            queues: {
              ...state.queues,
              [entityId]: newQueue,
            },
          }
        })
      },

      getQueue: (entityId) => {
        return get().queues[entityId] ?? EMPTY_QUEUE
      },

      getNextItem: (entityId) => {
        const queue = get().queues[entityId] || []
        return queue.find(isPending) || null
      },

      clearQueue: (entityId) => {
        set((state) => ({
          queues: {
            ...state.queues,
            [entityId]: [],
          },
        }))
      },

      // Atomic pop: find and remove in single set() call to prevent race conditions
      popItem: (entityId, itemId) => {
        let foundItem: T | null = null
        set((state) => {
          const currentQueue = state.queues[entityId] || []
          foundItem = currentQueue.find((i) => i.id === itemId) || null
          if (!foundItem) return state
          return {
            queues: {
              ...state.queues,
              [entityId]: currentQueue.filter((i) => i.id !== itemId),
            },
          }
        })
        return foundItem
      },

      // Add item to front of queue (used for error recovery - requeue failed items)
      prependItem: (entityId, item) => {
        set((state) => ({
          queues: {
            ...state.queues,
            [entityId]: [item, ...(state.queues[entityId] || [])],
          },
        }))
      },

      // Update specific fields of an item in the queue
      updateItem: (entityId, itemId, updates) => {
        set((state) => {
          const currentQueue = state.queues[entityId] || []
          const itemIndex = currentQueue.findIndex((i) => i.id === itemId)
          if (itemIndex === -1) return state

          const newQueue = [...currentQueue]
          newQueue[itemIndex] = { ...newQueue[itemIndex], ...updates }
          return {
            queues: {
              ...state.queues,
              [entityId]: newQueue,
            },
          }
        })
      },

      // Remove queue for a deleted entity to prevent memory leak
      cleanup: (entityId) => {
        set((state) => {
          const newQueues = { ...state.queues }
          delete newQueues[entityId]
          return { queues: newQueues }
        })
      },

      // Clear all queues (useful for logout or full reset)
      clearAll: () => {
        set({ queues: {} })
      },
    }))
  )
}

/**
 * Creates an empty queue constant for use in selectors.
 * Each store should have its own constant to maintain stable references.
 *
 * @returns An empty array (not frozen to avoid type issues)
 */
export function createEmptyQueueConstant<T>(): T[] {
  return []
}

/**
 * Helper to create a typed selector for a specific entity's queue.
 * Useful for memoized selectors with React.
 *
 * @param entityId - The entity ID to select the queue for
 * @returns A selector function
 */
export function createQueueSelector<T extends BaseQueueItem>(entityId: string) {
  const EMPTY: T[] = []
  return (state: QueueStoreState<T>): T[] => state.queues[entityId] ?? EMPTY
}
