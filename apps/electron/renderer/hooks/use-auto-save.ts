/**
 * useAutoSave - Reusable Auto-Save Hook
 *
 * Provides debounced auto-save functionality with:
 * - Configurable debounce delay
 * - Dirty state tracking
 * - Save-in-progress indicator
 * - Error handling with retry
 * - Cleanup on unmount (saves pending changes)
 *
 * Based on IMPROVEMENTS.md specifications.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseAutoSaveOptions<T> {
  /** Data to save */
  data: T
  /** Save function (async) */
  onSave: (data: T) => Promise<void>
  /** Debounce delay in milliseconds (default: 3000) */
  debounceMs?: number
  /** Enable/disable auto-save (default: true) */
  enabled?: boolean
  /** Called when save succeeds */
  onSuccess?: () => void
  /** Called when save fails */
  onError?: (error: Error) => void
  /** Unique key for this save instance (for multiple editors) */
  saveKey?: string
}

export interface UseAutoSaveReturn {
  /** Mark data as dirty (triggers save after debounce) */
  markDirty: () => void
  /** Whether there are unsaved changes */
  isDirty: boolean
  /** Whether a save is in progress */
  isSaving: boolean
  /** Force immediate save */
  saveNow: () => Promise<void>
  /** Last save timestamp */
  lastSaved: number | null
  /** Last error (cleared on successful save) */
  error: Error | null
}

export function useAutoSave<T>({
  data,
  onSave,
  debounceMs = 3000,
  enabled = true,
  onSuccess,
  onError,
  saveKey,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Refs to avoid stale closures
  const dataRef = useRef(data)
  const isDirtyRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const saveKeyRef = useRef(saveKey)
  const isMountedRef = useRef(true)

  // Update refs when props change
  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    saveKeyRef.current = saveKey
  }, [saveKey])

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // The actual save function
  const performSave = useCallback(async () => {
    if (!isDirtyRef.current) return

    const currentData = dataRef.current

    setIsSaving(true)
    setError(null)

    try {
      await onSave(currentData)

      // Only update state if still mounted
      if (isMountedRef.current) {
        isDirtyRef.current = false
        setIsDirty(false)
        setLastSaved(Date.now())
        onSuccess?.()
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))

      if (isMountedRef.current) {
        // Keep dirty flag on error so we retry
        setError(error)
        onError?.(error)
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false)
      }
    }
  }, [onSave, onSuccess, onError])

  // Mark dirty and schedule save
  const markDirty = useCallback(() => {
    isDirtyRef.current = true
    setIsDirty(true)

    if (!enabled) return

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Schedule new save
    timeoutRef.current = setTimeout(() => {
      performSave()
    }, debounceMs)
  }, [enabled, debounceMs, performSave])

  // Force immediate save
  const saveNow = useCallback(async () => {
    // Clear pending debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    await performSave()
  }, [performSave])

  // Cleanup: save pending changes on unmount
  useEffect(() => {
    return () => {
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      // Save if dirty
      if (isDirtyRef.current && enabled) {
        // Fire and forget - component is unmounting
        onSave(dataRef.current).catch((err) => {
          console.error('[useAutoSave] Failed to save on unmount:', err)
        })
      }
    }
  }, [onSave, enabled])

  // Reset state when saveKey changes (switching files)
  useEffect(() => {
    if (saveKey !== undefined) {
      // Clear pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      // Reset state
      isDirtyRef.current = false
      setIsDirty(false)
      setError(null)
    }
  }, [saveKey])

  return {
    markDirty,
    isDirty,
    isSaving,
    saveNow,
    lastSaved,
    error,
  }
}

/**
 * Hook for auto-saving with comparison
 *
 * Only marks dirty when data actually changes.
 * Useful when data updates frequently but values stay the same.
 */
export function useAutoSaveWithCompare<T>({
  data,
  compare = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  ...options
}: UseAutoSaveOptions<T> & {
  compare?: (prev: T, next: T) => boolean
}): UseAutoSaveReturn {
  const prevDataRef = useRef<T>(data)
  const autoSave = useAutoSave({ data, ...options })

  useEffect(() => {
    if (!compare(prevDataRef.current, data)) {
      prevDataRef.current = data
      autoSave.markDirty()
    }
  }, [data, compare, autoSave])

  return autoSave
}
