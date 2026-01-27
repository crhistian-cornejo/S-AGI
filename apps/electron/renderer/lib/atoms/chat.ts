/**
 * Chat Atoms
 *
 * State management for chat functionality:
 * - Selected chat
 * - Input state
 * - Chat mode (plan/agent)
 * - Todo items
 * - Undo stack
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Chat } from '@s-agi/core/types'

// === CHAT SELECTION ===

/** Currently selected chat ID (persisted) */
export const selectedChatIdAtom = atomWithStorage<string | null>(
  'selected-chat-id',
  null
)

/** Currently selected chat data */
export const selectedChatAtom = atom<Chat | null>(null)

// === INPUT STATE ===

/** Current chat input text */
export const chatInputAtom = atom('')

/** Pending message from Quick Prompt - ChatView will auto-send this */
export const pendingQuickPromptMessageAtom = atom<string | null>(null)

// === CHAT MODE ===

/** Chat mode: 'plan' for planning, 'agent' for execution */
export const chatModeAtom = atomWithStorage<'plan' | 'agent'>(
  'chat-mode',
  'agent'
)

/** Whether currently in plan mode */
export const isPlanModeAtom = atomWithStorage<boolean>(
  'agents:isPlanMode',
  false
)

/** Track sub-chats with pending plan approval (plan ready but not yet implemented) */
export const pendingPlanApprovalsAtom = atom<Set<string>>(new Set<string>())

// === TODO STATE ===

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
}

interface TodoState {
  todos: TodoItem[]
  creationToolCallId: string | null
}

/** Storage atom for all todos by subChatId */
const allTodosStorageAtom = atom<Record<string, TodoState>>({})

/** atomFamily-like pattern: get/set todos per subChatId */
export const getTodosAtom = (subChatId: string) =>
  atom(
    (get) =>
      get(allTodosStorageAtom)[subChatId] ?? {
        todos: [],
        creationToolCallId: null,
      },
    (get, set, newState: TodoState) => {
      const current = get(allTodosStorageAtom)
      set(allTodosStorageAtom, { ...current, [subChatId]: newState })
    }
  )

// === UNDO STATE ===

export type UndoItem = {
  action: 'archive' | 'delete'
  chatId: string
  timeoutId: ReturnType<typeof setTimeout>
}

export const undoStackAtom = atom<UndoItem[]>([])
