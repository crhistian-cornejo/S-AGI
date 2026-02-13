/**
 * Worker Message Types
 *
 * Type-safe messages for communication with Web Workers.
 * Replaces `any` in data-processing.worker.ts and data-processing.ts.
 */
import type { UniverSnapshot } from './univer-snapshot'

// =====================================================
// WORKER REQUESTS
// =====================================================

export interface WorkerRequestBase {
  id: number
}

export interface HasRealChangesRequest extends WorkerRequestBase {
  type: 'hasRealChanges'
  payload: {
    oldSnapshot: UniverSnapshot
    newSnapshot: UniverSnapshot
  }
}

export interface JsonStringifyRequest extends WorkerRequestBase {
  type: 'jsonStringify'
  payload: {
    data: unknown
  }
}

export interface DeepEqualRequest extends WorkerRequestBase {
  type: 'deepEqual'
  payload: {
    a: unknown
    b: unknown
  }
}

export type WorkerRequest =
  | HasRealChangesRequest
  | JsonStringifyRequest
  | DeepEqualRequest

// =====================================================
// WORKER RESPONSES
// =====================================================

export interface WorkerResponseSuccess {
  id: number
  result: unknown
  error?: never
}

export interface WorkerResponseError {
  id: number
  result?: never
  error: string
}

export type WorkerResponse = WorkerResponseSuccess | WorkerResponseError

// Type-safe response mapping
export interface WorkerResultMap {
  hasRealChanges: boolean
  jsonStringify: string
  deepEqual: boolean
}
