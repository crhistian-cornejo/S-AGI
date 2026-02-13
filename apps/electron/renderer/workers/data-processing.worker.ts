/**
 * Data Processing Web Worker
 *
 * Offloads heavy CPU operations from the main thread:
 * - JSON deep comparison for auto-save dirty detection
 * - Large data serialization/hashing
 * - Spreadsheet data diffing
 */

import type { WorkerRequest, WorkerResponse } from "@s-agi/core/types";

interface SnapshotLike {
  sheets?: Record<string, {
    cellData?: Record<string, Record<string, unknown>>;
    name?: string;
  }>;
  sheetOrder?: string[];
}

/**
 * Fast comparison of two spreadsheet snapshots to detect real changes.
 * Mirrors the logic from univer-diff-stats.ts but runs off the main thread.
 */
function hasRealChanges(oldSnapshot: SnapshotLike, newSnapshot: SnapshotLike): boolean {
  if (!oldSnapshot || !newSnapshot) return false;
  if (oldSnapshot === newSnapshot) return false;

  const oldSheets = oldSnapshot.sheets || {};
  const newSheets = newSnapshot.sheets || {};
  const oldSheetIds = Object.keys(oldSheets).sort();
  const newSheetIds = Object.keys(newSheets).sort();

  if (oldSheetIds.join(",") !== newSheetIds.join(",")) {
    return true;
  }

  for (const sheetId of oldSheetIds) {
    const oldSheet = oldSheets[sheetId];
    const newSheet = newSheets[sheetId];

    if (!oldSheet || !newSheet) continue;

    const oldCellData = JSON.stringify(oldSheet.cellData || {});
    const newCellData = JSON.stringify(newSheet.cellData || {});

    if (oldCellData !== newCellData) {
      return true;
    }

    if (oldSheet.name !== newSheet.name) {
      return true;
    }
  }

  return false;
}

/**
 * Deep equality check for arbitrary JSON-serializable objects.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    let result: unknown;
    switch (type) {
      case "hasRealChanges":
        result = hasRealChanges(
          payload.oldSnapshot as SnapshotLike,
          payload.newSnapshot as SnapshotLike,
        );
        break;
      case "jsonStringify":
        result = JSON.stringify(payload.data);
        break;
      case "deepEqual":
        result = deepEqual(payload.a, payload.b);
        break;
      default:
        self.postMessage({ id, error: `Unknown operation: ${type}` } satisfies WorkerResponse);
        return;
    }
    self.postMessage({ id, result } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
