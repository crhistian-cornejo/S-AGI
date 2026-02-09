/**
 * Data Processing Worker Client
 *
 * Provides async API for offloading heavy data operations to a Web Worker.
 * Falls back to main-thread execution if workers are unavailable.
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

type PendingRequest = {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker | null {
  if (worker) return worker;

  try {
    worker = new Worker(
      new URL("./data-processing.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, result, error } = event.data;
      const req = pending.get(id);
      if (!req) return;

      pending.delete(id);
      if (error) {
        req.reject(new Error(error));
      } else {
        req.resolve(result);
      }
    };

    worker.onerror = (event) => {
      const message = event.message || "Data processing worker crashed";
      for (const [, req] of pending) {
        req.reject(new Error(message));
      }
      pending.clear();
      worker = null;
    };

    return worker;
  } catch {
    // Workers not available (e.g., test environment)
    return null;
  }
}

function postToWorker<T>(type: WorkerRequest["type"], payload: any): Promise<T> {
  const w = getWorker();

  // Fallback: run on main thread if worker unavailable
  if (!w) {
    return Promise.resolve(runOnMainThread(type, payload));
  }

  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type, payload } satisfies WorkerRequest);
  });
}

function runOnMainThread(type: string, payload: any): any {
  switch (type) {
    case "hasRealChanges": {
      const { oldSnapshot, newSnapshot } = payload;
      if (!oldSnapshot || !newSnapshot) return false;
      if (oldSnapshot === newSnapshot) return false;
      const oldSheets = oldSnapshot.sheets || {};
      const newSheets = newSnapshot.sheets || {};
      const oldIds = Object.keys(oldSheets).sort();
      const newIds = Object.keys(newSheets).sort();
      if (oldIds.join(",") !== newIds.join(",")) return true;
      for (const sid of oldIds) {
        if (JSON.stringify(oldSheets[sid]?.cellData || {}) !== JSON.stringify(newSheets[sid]?.cellData || {})) return true;
        if (oldSheets[sid]?.name !== newSheets[sid]?.name) return true;
      }
      return false;
    }
    case "jsonStringify":
      return JSON.stringify(payload.data);
    case "deepEqual":
      return JSON.stringify(payload.a) === JSON.stringify(payload.b);
    default:
      throw new Error(`Unknown operation: ${type}`);
  }
}

/**
 * Check if two spreadsheet snapshots have real content changes.
 * Runs in a Web Worker to avoid blocking the UI during auto-save checks.
 */
export function hasRealChangesAsync(oldSnapshot: any, newSnapshot: any): Promise<boolean> {
  return postToWorker("hasRealChanges", { oldSnapshot, newSnapshot });
}

/**
 * Stringify a large object in a Web Worker.
 */
export function jsonStringifyAsync(data: any): Promise<string> {
  return postToWorker("jsonStringify", { data });
}

/**
 * Deep equality check in a Web Worker.
 */
export function deepEqualAsync(a: any, b: any): Promise<boolean> {
  return postToWorker("deepEqual", { a, b });
}
