/**
 * Data Processing Web Worker
 *
 * Offloads heavy CPU operations from the main thread:
 * - JSON deep comparison for auto-save dirty detection
 * - Large data serialization/hashing
 * - Spreadsheet data diffing
 */

interface WorkerRequest {
  id: number;
  type: "hasRealChanges" | "jsonStringify" | "deepEqual";
  payload: any;
}

interface WorkerResponse {
  id: number;
  result?: any;
  error?: string;
}

/**
 * Fast comparison of two spreadsheet snapshots to detect real changes.
 * Mirrors the logic from univer-diff-stats.ts but runs off the main thread.
 */
function hasRealChanges(oldSnapshot: any, newSnapshot: any): boolean {
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
function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  const response: WorkerResponse = { id };

  try {
    switch (type) {
      case "hasRealChanges":
        response.result = hasRealChanges(payload.oldSnapshot, payload.newSnapshot);
        break;
      case "jsonStringify":
        response.result = JSON.stringify(payload.data);
        break;
      case "deepEqual":
        response.result = deepEqual(payload.a, payload.b);
        break;
      default:
        response.error = `Unknown operation: ${type}`;
    }
  } catch (err) {
    response.error = err instanceof Error ? err.message : String(err);
  }

  self.postMessage(response);
};
