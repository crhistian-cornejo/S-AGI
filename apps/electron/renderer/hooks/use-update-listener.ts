import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import {
  updateStatusAtom,
  updateVersionAtom,
  updateDownloadPercentAtom,
  updateErrorAtom,
} from '@/lib/atoms'

/**
 * Global listener for auto-update IPC events.
 * Mount once at the app root (MainLayout) so update state
 * is captured regardless of which tab the user is on.
 */
export function useUpdateListener() {
  const setStatus = useSetAtom(updateStatusAtom)
  const setVersion = useSetAtom(updateVersionAtom)
  const setPercent = useSetAtom(updateDownloadPercentAtom)
  const setError = useSetAtom(updateErrorAtom)

  useEffect(() => {
    const api = window.desktopApi?.update
    if (!api) return

    const onChecking = api.onChecking(() => {
      setStatus('checking')
      setError(null)
    })
    const onAvailable = api.onAvailable((data: { version: string }) => {
      setStatus('available')
      setVersion(data.version)
      setError(null)
    })
    const onNotAvailable = api.onNotAvailable(() => {
      setStatus('up-to-date')
      setVersion(null)
      setPercent(0)
    })
    const onDownloadProgress = api.onDownloadProgress(
      (data: { percent: number }) => {
        setStatus('downloading')
        setPercent(data.percent)
      }
    )
    const onDownloaded = api.onDownloaded((data: { version: string }) => {
      setStatus('downloaded')
      setVersion(data.version)
      setPercent(100)
    })
    const onError = api.onError((data: { message: string }) => {
      setStatus('error')
      setError(data.message)
    })

    return () => {
      onChecking?.()
      onAvailable?.()
      onNotAvailable?.()
      onDownloadProgress?.()
      onDownloaded?.()
      onError?.()
    }
  }, [setStatus, setVersion, setPercent, setError])
}
