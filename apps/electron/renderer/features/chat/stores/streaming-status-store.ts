/**
 * Streaming status store for chat
 * Adapted from 1code's streaming status store
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type StreamingStatus = 'ready' | 'streaming' | 'submitted' | 'error'

interface StreamingStatusState {
  // Map: chatId -> streaming status
  statuses: Record<string, StreamingStatus>

  // Actions
  setStatus: (chatId: string, status: StreamingStatus) => void
  getStatus: (chatId: string) => StreamingStatus
  isStreaming: (chatId: string) => boolean
  clearStatus: (chatId: string) => void

  // Get all chats that are ready (not streaming)
  getReadyChats: () => string[]
}

export const useStreamingStatusStore = create<StreamingStatusState>()(
  subscribeWithSelector((set, get) => ({
    statuses: {},

    setStatus: (chatId, status) => {
      set((state) => ({
        statuses: {
          ...state.statuses,
          [chatId]: status,
        },
      }))
    },

    getStatus: (chatId) => {
      return get().statuses[chatId] ?? 'ready'
    },

    isStreaming: (chatId) => {
      const status = get().statuses[chatId] ?? 'ready'
      return status === 'streaming' || status === 'submitted'
    },

    clearStatus: (chatId) => {
      set((state) => {
        const newStatuses = { ...state.statuses }
        delete newStatuses[chatId]
        return { statuses: newStatuses }
      })
    },

    getReadyChats: () => {
      const { statuses } = get()
      return Object.entries(statuses)
        .filter(([_, status]) => status === 'ready')
        .map(([chatId]) => chatId)
    },
  }))
)
