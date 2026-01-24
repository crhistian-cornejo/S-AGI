/**
 * Centralized Store Barrel Export
 *
 * This module provides a single import point for all state management stores.
 * The app uses two state management solutions:
 *
 * 1. **Jotai** (lib/atoms) - Global app state, persisted settings, UI state
 * 2. **Zustand** (feature stores) - Feature-local state with complex actions
 *
 * Usage:
 *   // Import Jotai atoms
 *   import { selectedChatIdAtom, themeAtom } from '@/store/atoms'
 *
 *   // Import Zustand stores
 *   import { useChatMessageQueueStore, useChatStreamingStatusStore } from '@/store/chat'
 *   import { usePdfMessageQueueStore, usePdfStreamingStatusStore } from '@/store/pdf'
 *
 *   // Import Jotai store instance
 *   import { appStore } from '@/store/jotai'
 *
 * Architecture Notes:
 * - Zustand stores are kept in feature directories for co-location with related code
 * - This barrel provides re-exports for convenience without moving files
 * - Feature-specific types are exported alongside their stores
 */

// === JOTAI ATOMS (Global App State) ===
// Re-export all atoms from the atoms module
export * from '@/lib/atoms'

// === JOTAI STORE INSTANCE ===
export { appStore } from '@/lib/stores/jotai-store'

// === CHAT ZUSTAND STORES ===
// Feature-local stores for chat message queue and streaming status
export {
  useMessageQueueStore as useChatMessageQueueStore,
  EMPTY_QUEUE as CHAT_EMPTY_QUEUE,
} from '@/features/chat/stores/message-queue-store'

export {
  useStreamingStatusStore as useChatStreamingStatusStore,
  type StreamingStatus as ChatStreamingStatus,
} from '@/features/chat/stores/streaming-status-store'

export {
  useSendCallbackStore,
  type SendCallback,
} from '@/features/chat/stores/send-callback-store'

// === PDF ZUSTAND STORES ===
// Feature-local stores for PDF chat message queue and streaming status
export {
  useMessageQueueStore as usePdfMessageQueueStore,
  EMPTY_QUEUE as PDF_EMPTY_QUEUE,
} from '@/features/pdf/stores/message-queue-store'

export {
  useStreamingStatusStore as usePdfStreamingStatusStore,
  type StreamingStatus as PdfStreamingStatus,
} from '@/features/pdf/stores/streaming-status-store'
