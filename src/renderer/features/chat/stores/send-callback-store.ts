/**
 * Send callback registry store
 * ChatView registers its sendMessage function here so QueueProcessor can call it
 *
 * This pattern allows the QueueProcessor to trigger message sending
 * without having direct access to all the state and mutations in ChatView
 */

import { create } from 'zustand'
import type { ChatQueueItem } from '../lib/queue-utils'

export type SendCallback = (item: ChatQueueItem) => Promise<void>

interface SendCallbackState {
  // Map: chatId -> sendMessage callback
  callbacks: Record<string, SendCallback>

  // Actions
  registerCallback: (chatId: string, callback: SendCallback) => void
  unregisterCallback: (chatId: string) => void
  getCallback: (chatId: string) => SendCallback | null
}

export const useSendCallbackStore = create<SendCallbackState>()((set, get) => ({
  callbacks: {},

  registerCallback: (chatId, callback) => {
    set((state) => ({
      callbacks: {
        ...state.callbacks,
        [chatId]: callback,
      },
    }))
  },

  unregisterCallback: (chatId) => {
    set((state) => {
      const newCallbacks = { ...state.callbacks }
      delete newCallbacks[chatId]
      return { callbacks: newCallbacks }
    })
  },

  getCallback: (chatId) => {
    return get().callbacks[chatId] ?? null
  },
}))
