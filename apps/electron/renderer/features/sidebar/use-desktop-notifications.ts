import { useCallback, useEffect, useState } from 'react'

export type NotificationPermission = 'default' | 'granted' | 'denied'

export interface DesktopNotificationOptions {
    body?: string
    icon?: string
    tag?: string
    requireInteraction?: boolean
    silent?: boolean
    onClick?: () => void
}

/**
 * Hook for managing desktop notifications in Electron
 * Uses the Web Notifications API which works in both web and Electron contexts
 */
export function useDesktopNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>('default')
    const [isSupported, setIsSupported] = useState(false)

    // Check for notification support on mount
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setIsSupported(true)
            setPermission(Notification.permission as NotificationPermission)
        }
    }, [])

    /**
     * Request permission to show notifications
     */
    const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
        if (!isSupported) {
            return 'denied'
        }

        try {
            const result = await Notification.requestPermission()
            setPermission(result as NotificationPermission)
            return result as NotificationPermission
        } catch (error) {
            console.error('[Notifications] Failed to request permission:', error)
            return 'denied'
        }
    }, [isSupported])

    /**
     * Show a desktop notification
     */
    const notify = useCallback((
        title: string, 
        options?: DesktopNotificationOptions
    ): Notification | null => {
        if (!isSupported) {
            console.warn('[Notifications] Not supported in this environment')
            return null
        }

        if (permission !== 'granted') {
            console.warn('[Notifications] Permission not granted')
            return null
        }

        try {
            const notification = new Notification(title, {
                body: options?.body,
                icon: options?.icon,
                tag: options?.tag,
                requireInteraction: options?.requireInteraction,
                silent: options?.silent
            })

            if (options?.onClick) {
                notification.onclick = () => {
                    options.onClick?.()
                    notification.close()
                }
            }

            return notification
        } catch (error) {
            console.error('[Notifications] Failed to show notification:', error)
            return null
        }
    }, [isSupported, permission])

    /**
     * Show a notification for task completion
     */
    const notifyTaskComplete = useCallback((
        taskName: string, 
        success: boolean = true
    ) => {
        return notify(
            success ? 'Task Completed' : 'Task Failed',
            {
                body: taskName,
                tag: 'task-notification',
                silent: !success // Only make sound on failure
            }
        )
    }, [notify])

    /**
     * Show a notification for agent activity
     */
    const notifyAgentActivity = useCallback((
        message: string,
        options?: { urgent?: boolean }
    ) => {
        return notify('S-AGI Agent', {
            body: message,
            tag: 'agent-notification',
            requireInteraction: options?.urgent
        })
    }, [notify])

    return {
        isSupported,
        permission,
        requestPermission,
        notify,
        notifyTaskComplete,
        notifyAgentActivity
    }
}
