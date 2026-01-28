/**
 * Hook for maintaining the file snapshot cache
 * Runs cleanup on app start and periodically to prevent localStorage bloat
 */
import { useEffect, useRef } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import {
  cleanupSnapshotCacheAtom,
  cacheStatsAtom,
} from '@/lib/atoms/user-files'

// Cleanup interval: 1 hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

export function useCacheMaintenance() {
  const cleanup = useSetAtom(cleanupSnapshotCacheAtom)
  const stats = useAtomValue(cacheStatsAtom)
  const lastCleanupRef = useRef<number>(0)

  // Run cleanup on mount and periodically
  useEffect(() => {
    // Run initial cleanup
    const initialRemoved = cleanup()
    console.log('[CacheMaintenance] Initial cleanup completed', {
      removed: initialRemoved,
      stats,
    })
    lastCleanupRef.current = Date.now()

    // Set up periodic cleanup
    const interval = setInterval(() => {
      const removed = cleanup()
      if (removed > 0) {
        console.log('[CacheMaintenance] Periodic cleanup completed', {
          removed,
        })
      }
      lastCleanupRef.current = Date.now()
    }, CLEANUP_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [cleanup])

  return {
    stats,
    runCleanup: cleanup,
    lastCleanup: lastCleanupRef.current,
  }
}
