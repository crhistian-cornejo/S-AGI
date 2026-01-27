/**
 * Notes Atoms
 *
 * State management for notes functionality:
 * - Selected note
 * - Sidebar state
 * - Page cache
 * - Open tabs
 * - Editor state
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { NotePage } from '@/lib/notes-storage'
import type { OpenNoteTab } from '@/lib/notes-tabs'

// === NOTE SELECTION ===

export const selectedNotePageIdAtom = atomWithStorage<string | null>(
  'selected-note-page-id',
  null
)

// === SIDEBAR STATE ===

export const notesSidebarOpenAtom = atomWithStorage('notes-sidebar-open', true)

// === PAGE CACHE ===

/** Cache for note pages content (loaded on demand) */
export const notePagesCacheAtom = atom<Record<string, NotePage>>({})

// === OPEN TABS ===

/** Open tabs for notes (Notion-style) */
export const openNoteTabsAtom = atom<OpenNoteTab[]>([])

// === EDITOR STATE ===

export const notesSelectedModelIdAtom = atomWithStorage<string>(
  'notes-selected-model-id',
  'gpt-5-mini'
)

export const notesEditorRefAtom = atom<{
  editor: any
  exportPdf: () => Promise<void>
} | null>(null)

export const notesIsExportingPdfAtom = atom(false)

// === PAGE ACTIONS ===

/** Action atom for creating new pages (set by sidebar, called by tabs) */
export const createNotePageActionAtom = atom<((spaceId?: string | null, parentId?: string | null) => void) | null>(null)

/** Notification atom for sidebar refresh when pages are updated externally */
export const notesPageUpdatedAtom = atom<number>(0)
