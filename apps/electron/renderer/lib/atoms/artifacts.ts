/**
 * Artifact Atoms
 *
 * State management for artifacts:
 * - Selected artifact
 * - Artifact panel
 * - Snapshot cache (for unsaved changes)
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { Artifact } from '@s-agi/core/types'

// === ARTIFACT SELECTION ===

/** Currently selected artifact ID */
export const selectedArtifactIdAtom = atom<string | null>(null)

/** Currently selected artifact data */
export const selectedArtifactAtom = atom<Artifact | null>(null)

// === ARTIFACT PANEL STATE ===

/** Whether artifact panel is open (persisted) */
export const artifactPanelOpenAtom = atomWithStorage(
  'artifact-panel-open',
  true
)

/** Artifact panel width (persisted) */
export const artifactPanelWidthAtom = atomWithStorage(
  'artifact-panel-width',
  500
)

// === ARTIFACT SNAPSHOT CACHE ===
// Cache for unsaved artifact changes - PERSISTED to prevent data loss on tab switch

export interface ArtifactSnapshot {
  univerData: unknown
  timestamp: number
  isDirty: boolean
}

export const artifactSnapshotCacheAtom = atomWithStorage<Record<string, ArtifactSnapshot>>(
  'artifact-snapshot-cache',
  {}
)

/** Helper atom to get/set individual artifact snapshots */
export const getArtifactSnapshotAtom = (artifactId: string) =>
  atom(
    (get) => get(artifactSnapshotCacheAtom)[artifactId] ?? null,
    (get, set, snapshot: ArtifactSnapshot | null) => {
      const cache = get(artifactSnapshotCacheAtom)
      if (snapshot) {
        set(artifactSnapshotCacheAtom, { ...cache, [artifactId]: snapshot })
      } else {
        const { [artifactId]: _, ...rest } = cache
        set(artifactSnapshotCacheAtom, rest)
      }
    }
  )
