/**
 * Checkpoint Types
 * Unified types for workbook version control and restore points
 */

/**
 * Checkpoint metadata stored with each version
 */
export interface WorkbookCheckpoint {
    /** Unique identifier for this checkpoint */
    id: string
    /** File ID this checkpoint belongs to */
    fileId: string
    /** Version number (sequential) */
    versionNumber: number
    /** Description/preview of the prompt that triggered this checkpoint */
    prompt: string
    /** ID of the message that triggered this checkpoint */
    messageId?: string
    /** When the checkpoint was created */
    createdAt: string
    /** Whether this checkpoint can be restored (older than current) */
    canRestore: boolean
}

/**
 * Enriched checkpoint with diff stats
 */
export interface EnrichedCheckpoint extends WorkbookCheckpoint {
    /** Statistics about the snapshot at this point */
    stats?: {
        cellCount: number
        sheetCount: number
        formulaCount: number
    }
    /** Diff from the previous checkpoint */
    diffFromPrevious?: {
        cellsChanged: number
        sheetsChanged: number
        formulasChanged: number
    }
}

/**
 * Result of a restore operation
 */
export interface RestoreResult {
    /** The restored file data */
    file: {
        id: string
        univer_data: unknown
        content?: string
        version_count: number
    }
    /** Version number restored to */
    restoredToVersion: number
}

/**
 * Diff between two snapshots
 */
export interface SnapshotDiff {
    /** Total number of changes */
    totalChanges: number
    /** Number of cells that changed */
    cellsChanged: number
    /** Number of sheets added/removed */
    sheetsChanged: number
    /** Number of formulas added/removed/modified */
    formulasChanged: number
    /** Details for each changed sheet */
    sheetDiffs: SheetDiff[]
}

/**
 * Diff details for a single sheet
 */
export interface SheetDiff {
    /** Sheet name */
    sheetName: string
    /** Whether the sheet was added, removed, or modified */
    changeType: 'added' | 'removed' | 'modified'
    /** Number of cells changed in this sheet */
    cellsChanged: number
    /** Number of rows changed */
    rowsChanged: number
    /** Number of columns changed */
    columnsChanged: number
}

/**
 * Options for snapshot diffing
 */
export interface SnapshotDiffOptions {
    /** Only compare values, ignore styles */
    ignoreStyles?: boolean
    /** Only compare calculated values, ignore formulas */
    ignoreFormulas?: boolean
    /** Perform deep cell-by-cell comparison vs quick JSON compare */
    deepCompare?: boolean
}

/**
 * Checkpoint list item (for UI display)
 */
export interface CheckpointListItem {
    id: string
    versionNumber: number
    prompt: string
    createdAt: string
    canRestore: boolean
    /** Relative time string (e.g., "2 min ago") */
    relativeTime?: string
}

/**
 * Checkpoint timeline data
 */
export interface CheckpointTimeline {
    /** All checkpoints for a file, ordered by version descending */
    checkpoints: CheckpointListItem[]
    /** Current version number of the file */
    currentVersion: number
    /** Total checkpoint count */
    totalCount: number
}
