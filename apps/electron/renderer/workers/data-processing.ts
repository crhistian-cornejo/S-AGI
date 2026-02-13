/**
 * Data Processing Worker Client
 *
 * Provides async API for offloading heavy data operations to a Web Worker.
 * Falls back to main-thread execution if workers are unavailable.
 */

import type { WorkerRequest, WorkerResponse } from "@s-agi/core/types";
import type { UniverSnapshot } from "@s-agi/core/types";

type PendingRequest = {
  resolve: (result: unknown) => void;
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

function postToWorker<T>(type: WorkerRequest["type"], payload: Record<string, unknown>): Promise<T> {
  const w = getWorker();

  // Fallback: run on main thread if worker unavailable
  if (!w) {
    return Promise.resolve(runOnMainThread(type, payload) as T);
  }

  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, type, payload });
  });
}

interface SnapshotLike {
  sheets?: Record<string, { cellData?: unknown; name?: string }>;
}

function runOnMainThread(type: string, payload: Record<string, unknown>): unknown {
  switch (type) {
    case "hasRealChanges": {
      const oldSnapshot = payload.oldSnapshot as SnapshotLike | null;
      const newSnapshot = payload.newSnapshot as SnapshotLike | null;
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
export function hasRealChangesAsync(oldSnapshot: UniverSnapshot | null, newSnapshot: UniverSnapshot | null): Promise<boolean> {
  return postToWorker("hasRealChanges", { oldSnapshot, newSnapshot });
}

/**
 * Stringify a large object in a Web Worker.
 */
export function jsonStringifyAsync(data: unknown): Promise<string> {
  return postToWorker("jsonStringify", { data });
}

/**
 * Deep equality check in a Web Worker.
 */
export function deepEqualAsync(a: unknown, b: unknown): Promise<boolean> {
  return postToWorker("deepEqual", { a, b });
}
