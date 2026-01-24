/**
 * Streaming status store for PDF chat
 * Adapted from 1code's streaming status store
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type StreamingStatus = 'ready' | 'processing' | 'error'

interface StreamingStatusState {
    // Map: pdfId -> status
    statuses: Record<string, StreamingStatus>

    // Actions
    getStatus: (pdfId: string) => StreamingStatus
    setStatus: (pdfId: string, status: StreamingStatus) => void
    clearStatus: (pdfId: string) => void
}

export const useStreamingStatusStore = create<StreamingStatusState>()(
  subscribeWithSelector((set, get) => ({
    statuses: {},

    getStatus: (pdfId) => {
      return get().statuses[pdfId] ?? 'ready'
    },

    setStatus: (pdfId, status) => {
      set((state) => ({
        statuses: {
          ...state.statuses,
          [pdfId]: status,
        },
      }))
    },

    clearStatus: (pdfId) => {
      set((state) => {
        const newStatuses = { ...state.statuses }
        delete newStatuses[pdfId]
        return { statuses: newStatuses }
      })
    },
  }))
)
