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
  // Soft delete fields for version restoration
  is_obsolete?: boolean
  obsoleted_at?: string
  obsoleted_by_version?: number
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

// Cache configuration
const CACHE_MAX_ENTRIES = 50 // Maximum number of entries to keep
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days max age for non-dirty entries
// Note: CACHE_CLEANUP_INTERVAL is defined in use-cache-maintenance.ts hook

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

// Cleanup old cache entries - removes non-dirty entries older than CACHE_MAX_AGE_MS
// and keeps only the most recent CACHE_MAX_ENTRIES entries
export const cleanupSnapshotCacheAtom = atom(
  null,
  (get, set) => {
    const cache = get(fileSnapshotCacheAtom)
    const now = Date.now()
    const entries = Object.entries(cache)

    if (entries.length === 0) return 0

    // First pass: remove old non-dirty entries
    const filtered = entries.filter(([_, snapshot]) => {
      // Always keep dirty entries
      if (snapshot.isDirty) return true
      // Remove if older than max age
      return (now - snapshot.timestamp) < CACHE_MAX_AGE_MS
    })

    // Second pass: if still too many, keep only the most recent
    const sorted = filtered.sort((a, b) => b[1].timestamp - a[1].timestamp)
    const kept = sorted.slice(0, CACHE_MAX_ENTRIES)

    // Only update if something changed
    const removedCount = entries.length - kept.length
    if (removedCount > 0) {
      const newCache = Object.fromEntries(kept)
      set(fileSnapshotCacheAtom, newCache)
      console.log(`[SnapshotCache] Cleaned up ${removedCount} old entries, kept ${kept.length}`)
    }

    return removedCount
  }
)

// Clear all non-dirty entries from cache (for manual cleanup)
export const clearNonDirtyCacheAtom = atom(
  null,
  (get, set) => {
    const cache = get(fileSnapshotCacheAtom)
    const dirtyEntries = Object.entries(cache).filter(([_, s]) => s.isDirty)
    const newCache = Object.fromEntries(dirtyEntries)
    set(fileSnapshotCacheAtom, newCache)
    return Object.keys(cache).length - dirtyEntries.length
  }
)

// Get cache statistics
export const cacheStatsAtom = atom((get) => {
  const cache = get(fileSnapshotCacheAtom)
  const entries = Object.values(cache)
  const now = Date.now()

  return {
    totalEntries: entries.length,
    dirtyEntries: entries.filter(s => s.isDirty).length,
    oldEntries: entries.filter(s => !s.isDirty && (now - s.timestamp) > CACHE_MAX_AGE_MS).length,
    estimatedSizeKB: Math.round(JSON.stringify(cache).length / 1024),
  }
})

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

// Data of the version being previewed (for rendering in editor)
// IMPORTANT: Includes fileId to ensure we're showing data for the correct file
export const versionPreviewDataAtom = atom<{
  fileId: string // Required to verify data matches current file
  versionNumber: number
  univerData?: unknown
  content?: string
  changeType: string
  changeDescription?: string
} | null>(null)

// Loading state for version preview fetch
export const versionPreviewLoadingAtom = atom<boolean>(false)

// Whether the editor is in preview mode (read-only, showing a historical version)
export const isPreviewingVersionAtom = atom((get) => get(versionPreviewDataAtom) !== null)

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
