import { useCallback } from 'react'

export type HapticFeedbackType = 
    | 'light' 
    | 'medium' 
    | 'heavy' 
    | 'selection' 
    | 'success' 
    | 'warning' 
    | 'error'

/**
 * Hook for haptic feedback on macOS via Electron
 * Uses NSHapticFeedbackManager through IPC
 * 
 * Note: This requires the main process to implement the 'haptic:perform' handler
 */
export function useHaptic() {
    const isMac = typeof window !== 'undefined' && 
        (window as any).desktopApi?.platform === 'darwin'

    /**
     * Perform haptic feedback of a specific type
     */
    const perform = useCallback(async (type: HapticFeedbackType): Promise<void> => {
        if (!isMac) {
            // Haptic feedback only available on macOS
            return
        }

        try {
            await (window as any).desktopApi?.haptic?.(type)
        } catch (error) {
            // Silently fail - haptics are enhancement, not critical
            console.debug('[Haptic] Failed to perform feedback:', error)
        }
    }, [isMac])

    /**
     * Light haptic feedback - for subtle interactions
     */
    const lightImpact = useCallback(() => perform('light'), [perform])

    /**
     * Medium haptic feedback - for standard interactions
     */
    const mediumImpact = useCallback(() => perform('medium'), [perform])

    /**
     * Heavy haptic feedback - for significant actions
     */
    const heavyImpact = useCallback(() => perform('heavy'), [perform])

    /**
     * Selection changed haptic - for picker/list selections
     */
    const selectionChanged = useCallback(() => perform('selection'), [perform])

    /**
     * Success haptic - for completed actions
     */
    const success = useCallback(() => perform('success'), [perform])

    /**
     * Warning haptic - for alerts
     */
    const warning = useCallback(() => perform('warning'), [perform])

    /**
     * Error haptic - for failures
     */
    const error = useCallback(() => perform('error'), [perform])

    return {
        isSupported: isMac,
        perform,
        lightImpact,
        mediumImpact,
        heavyImpact,
        selectionChanged,
        success,
        warning,
        error
    }
}
