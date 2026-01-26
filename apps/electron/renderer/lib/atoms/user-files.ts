import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

// =====================================================
// USER FILES ATOMS
// Persistent file system for Excel, Docs, Notes
// with git-like version history
// =====================================================

export type UserFileType = 'excel' | 'doc' | 'note'

export interface UserFile {
  id: string
  user_id: string
  type: UserFileType
  name: string
  description?: string
  univer_data?: unknown
  content?: string
  metadata?: Record<string, unknown>
  icon?: string
  color?: string
  version_count: number
  total_edits: number
  created_at: string
  updated_at: string
  last_opened_at?: string | null
  is_pinned: boolean
  is_archived: boolean
  folder_path?: string
  tags?: string[]
}

export interface FileVersion {
  id: string
  file_id: string
  version_number: number
  univer_data?: unknown
  content?: string
  change_type: 'created' | 'auto_save' | 'manual_save' | 'ai_edit' | 'ai_create' | 'restore' | 'import'
  change_description?: string
  change_summary?: unknown
  created_by?: string
  ai_model?: string
  ai_prompt?: string
  tool_name?: string
  size_bytes?: number
  created_at: string
}

// =====================================================
// CURRENT FILE STATE (persisted in localStorage)
// =====================================================

// Store only IDs in localStorage (data loaded from DB)
export const currentExcelFileIdAtom = atomWithStorage<string | null>(
  'current-excel-file-id',
  null
)

export const currentDocFileIdAtom = atomWithStorage<string | null>(
  'current-doc-file-id',
  null
)

export const currentNoteFileIdAtom = atomWithStorage<string | null>(
  'current-note-file-id',
  null
)

// Loaded file data (not persisted - fetched from DB)
export const currentExcelFileAtom = atom<UserFile | null>(null)
export const currentDocFileAtom = atom<UserFile | null>(null)
export const currentNoteFileAtom = atom<UserFile | null>(null)

// =====================================================
// HELPER ATOMS (factory pattern)
// =====================================================

// Get the file ID atom for a specific type
export const getFileIdAtom = (type: UserFileType) => {
  switch (type) {
    case 'excel': return currentExcelFileIdAtom
    case 'doc': return currentDocFileIdAtom
    case 'note': return currentNoteFileIdAtom
  }
}

// Get the file data atom for a specific type
export const getFileAtom = (type: UserFileType) => {
  switch (type) {
    case 'excel': return currentExcelFileAtom
    case 'doc': return currentDocFileAtom
    case 'note': return currentNoteFileAtom
  }
}

// =====================================================
// SNAPSHOT CACHE (for unsaved changes)
// Persisted to localStorage to survive tab switches and page reloads
// =====================================================

export interface FileSnapshot {
  univerData?: unknown
  content?: string
  timestamp: number
  isDirty: boolean
}

// Cache for unsaved file changes - PERSISTED to prevent data loss on tab switch
export const fileSnapshotCacheAtom = atomWithStorage<Record<string, FileSnapshot>>(
  'file-snapshot-cache',
  {}
)

// =====================================================
// SCRATCH SESSION IDs (for tabs without a file selected)
// These provide stable IDs for unsaved "scratch" content
// =====================================================

// Stable session ID for Excel tab when no file is selected
export const excelScratchSessionIdAtom = atomWithStorage<string>(
  'excel-scratch-session-id',
  `scratch-excel-${Date.now()}`
)

// Stable session ID for Doc tab when no file is selected
export const docScratchSessionIdAtom = atomWithStorage<string>(
  'doc-scratch-session-id',
  `scratch-doc-${Date.now()}`
)

// Helper atom to get/set individual file snapshots
export const getFileSnapshotAtom = (fileId: string) =>
  atom(
    (get) => get(fileSnapshotCacheAtom)[fileId] ?? null,
    (get, set, snapshot: FileSnapshot | null) => {
      const cache = get(fileSnapshotCacheAtom)
      if (snapshot) {
        set(fileSnapshotCacheAtom, { ...cache, [fileId]: snapshot })
      } else {
        const { [fileId]: _, ...rest } = cache
        set(fileSnapshotCacheAtom, rest)
      }
    }
  )

// =====================================================
// SAVING STATE
// =====================================================

// Track which files are currently being saved
export const fileSavingAtom = atom<Record<string, boolean>>({})

// Helper to check if a specific file is saving
export const isFileSavingAtom = (fileId: string) =>
  atom((get) => get(fileSavingAtom)[fileId] ?? false)

// =====================================================
// VERSION HISTORY PANEL
// =====================================================

// Whether the version history panel is open
export const versionHistoryOpenAtom = atom<boolean>(false)

// Which file's history is being viewed
export const versionHistoryFileIdAtom = atom<string | null>(null)

// Selected version for preview (null = current version)
export const versionHistoryPreviewVersionAtom = atom<number | null>(null)

// =====================================================
// FILE LIST STATE
// =====================================================

// Cached file lists per type (updated by tRPC queries)
export const excelFilesListAtom = atom<UserFile[]>([])
export const docFilesListAtom = atom<UserFile[]>([])
export const noteFilesListAtom = atom<UserFile[]>([])

// Helper to get file list atom by type
export const getFilesListAtom = (type: UserFileType) => {
  switch (type) {
    case 'excel': return excelFilesListAtom
    case 'doc': return docFilesListAtom
    case 'note': return noteFilesListAtom
  }
}

// =====================================================
// UI STATE
// =====================================================

// File browser sidebar state
export const fileBrowserOpenAtom = atomWithStorage('file-browser-open', true)
export const fileBrowserWidthAtom = atomWithStorage('file-browser-width', 240)

// Search/filter state
export const fileSearchQueryAtom = atom<string>('')
export const fileFilterTypeAtom = atom<UserFileType | 'all'>('all')
export const fileShowArchivedAtom = atom<boolean>(false)

// =====================================================
// DERIVED ATOMS
// =====================================================

// Check if any file has unsaved changes
export const hasUnsavedChangesAtom = atom((get) => {
  const cache = get(fileSnapshotCacheAtom)
  return Object.values(cache).some(snapshot => snapshot?.isDirty)
})

// Get all dirty file IDs
export const dirtyFileIdsAtom = atom((get) => {
  const cache = get(fileSnapshotCacheAtom)
  return Object.entries(cache)
    .filter(([_, snapshot]) => snapshot?.isDirty)
    .map(([fileId]) => fileId)
})

// Current file for a given type (combines ID + data)
export const getCurrentFileAtom = (type: UserFileType) =>
  atom((get) => {
    const fileId = get(getFileIdAtom(type))
    const fileData = get(getFileAtom(type))
    if (!fileId || !fileData || fileData.id !== fileId) {
      return null
    }
    return fileData
  })
