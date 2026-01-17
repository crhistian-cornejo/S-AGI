import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

/**
 * Handles OAuth callback by capturing tokens from:
 * 1. URL hash fragment (web flow)
 * 2. IPC from main process (Electron OAuth window)
 */
export function OAuthCallbackHandler() {
    const hasProcessed = useRef(false)
    const utils = trpc.useUtils()

    const setSession = trpc.auth.setSession.useMutation({
        onSuccess: () => {
            toast.success('Signed in successfully!')
            // Clear the hash from URL if present
            if (window.location.hash) {
                window.history.replaceState(null, '', window.location.pathname)
            }
            // Invalidate auth queries to refresh the UI
            utils.auth.getSession.invalidate()
            utils.auth.getUser.invalidate()
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to complete sign in')
            console.error('[OAuth] setSession error:', error)
            // Reset so user can try again
            hasProcessed.current = false
        }
    })

    // Handle tokens received from main process (Electron OAuth window)
    useEffect(() => {
        const cleanup = window.desktopApi?.onOAuthTokens?.((data) => {
            if (hasProcessed.current) return
            hasProcessed.current = true
            
            console.log('[OAuth] Received tokens from main process')
            setSession.mutate({
                access_token: data.access_token,
                refresh_token: data.refresh_token
            })
        })

        return () => {
            cleanup?.()
        }
    }, [setSession])

    // Handle tokens from URL hash (web flow fallback)
    useEffect(() => {
        if (hasProcessed.current) return

        const hash = window.location.hash
        if (!hash || !hash.includes('access_token')) return

        hasProcessed.current = true
        console.log('[OAuth] Found tokens in URL hash, processing...')

        // Parse hash fragment
        const params = new URLSearchParams(hash.substring(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')

        if (access_token && refresh_token) {
            console.log('[OAuth] Setting session with tokens from hash')
            setSession.mutate({ access_token, refresh_token })
        } else {
            console.error('[OAuth] Missing tokens in hash')
            toast.error('OAuth callback missing tokens')
            hasProcessed.current = false
        }
    }, [setSession])

    return null
}
