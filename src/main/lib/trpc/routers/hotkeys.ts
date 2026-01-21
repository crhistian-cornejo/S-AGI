import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { getHotkeyStore, getHotkeyManager } from '../../hotkeys'
import type { HotkeyId } from '@shared/hotkey-types'
import { isValidShortcut, isReservedShortcut, HOTKEY_DEFINITIONS } from '@shared/hotkey-types'

/**
 * tRPC router for hotkey configuration
 */
export const hotkeysRouter = router({
    /**
     * Get all hotkeys with their current status
     */
    getHotkeys: publicProcedure.query(() => {
        const manager = getHotkeyManager()
        const statuses = manager.getAllStatus()

        return statuses.map(status => ({
            ...status,
            name: HOTKEY_DEFINITIONS[status.id]?.name ?? status.id,
            description: HOTKEY_DEFINITIONS[status.id]?.description ?? ''
        }))
    }),

    /**
     * Get a single hotkey status
     */
    getHotkey: publicProcedure
        .input(z.object({ id: z.string() }))
        .query(({ input }) => {
            const manager = getHotkeyManager()
            const status = manager.getStatus(input.id as HotkeyId)
            const def = HOTKEY_DEFINITIONS[input.id as HotkeyId]

            return {
                ...status,
                name: def?.name ?? input.id,
                description: def?.description ?? ''
            }
        }),

    /**
     * Update a hotkey configuration
     */
    setHotkey: publicProcedure
        .input(z.object({
            id: z.string(),
            shortcut: z.string().optional(),
            enabled: z.boolean().optional()
        }))
        .mutation(({ input }) => {
            const store = getHotkeyStore()
            const manager = getHotkeyManager()

            // Validate shortcut if provided
            if (input.shortcut !== undefined) {
                const validation = isValidShortcut(input.shortcut)
                if (!validation.valid) {
                    return {
                        success: false,
                        error: validation.error
                    }
                }

                // Check for reserved shortcuts
                if (isReservedShortcut(input.shortcut, process.platform)) {
                    return {
                        success: false,
                        error: 'This shortcut is reserved by the system'
                    }
                }

                // Check for conflicts with other hotkeys
                const conflicts = store.getConflicts(input.shortcut, input.id as HotkeyId)
                if (conflicts.length > 0) {
                    const conflictNames = conflicts
                        .map(c => HOTKEY_DEFINITIONS[c.id]?.name ?? c.id)
                        .join(', ')
                    return {
                        success: false,
                        error: `Shortcut conflicts with: ${conflictNames}`
                    }
                }
            }

            // Update the configuration
            const updated = store.set(input.id as HotkeyId, {
                shortcut: input.shortcut,
                enabled: input.enabled
            })

            // Re-register the hotkey with new settings
            if (updated.enabled) {
                manager.reregister(input.id as HotkeyId)
            } else {
                manager.unregister(input.id as HotkeyId)
            }

            const status = manager.getStatus(input.id as HotkeyId)

            return {
                success: true,
                hotkey: {
                    ...status,
                    name: HOTKEY_DEFINITIONS[input.id as HotkeyId]?.name ?? input.id,
                    description: HOTKEY_DEFINITIONS[input.id as HotkeyId]?.description ?? ''
                }
            }
        }),

    /**
     * Validate a shortcut without saving
     */
    validateShortcut: publicProcedure
        .input(z.object({
            shortcut: z.string(),
            excludeId: z.string().optional()
        }))
        .mutation(({ input }) => {
            const store = getHotkeyStore()
            const manager = getHotkeyManager()

            // Check format
            const validation = isValidShortcut(input.shortcut)
            if (!validation.valid) {
                return {
                    valid: false,
                    error: validation.error
                }
            }

            // Check for reserved shortcuts
            if (isReservedShortcut(input.shortcut, process.platform)) {
                return {
                    valid: false,
                    error: 'This shortcut is reserved by the system'
                }
            }

            // Check for conflicts with other configured hotkeys
            const conflicts = store.getConflicts(input.shortcut, input.excludeId as HotkeyId | undefined)
            if (conflicts.length > 0) {
                const conflictNames = conflicts
                    .map(c => HOTKEY_DEFINITIONS[c.id]?.name ?? c.id)
                    .join(', ')
                return {
                    valid: false,
                    error: `Conflicts with: ${conflictNames}`
                }
            }

            // Check if already registered globally (by another app)
            const isGloballyRegistered = manager.isRegistered(input.shortcut)
            if (isGloballyRegistered) {
                return {
                    valid: true,
                    warning: 'This shortcut may be in use by another app'
                }
            }

            return { valid: true }
        }),

    /**
     * Reset a hotkey to its default configuration
     */
    resetHotkey: publicProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => {
            const store = getHotkeyStore()
            const manager = getHotkeyManager()

            store.reset(input.id as HotkeyId)
            manager.reregister(input.id as HotkeyId)

            const status = manager.getStatus(input.id as HotkeyId)

            return {
                success: true,
                hotkey: {
                    ...status,
                    name: HOTKEY_DEFINITIONS[input.id as HotkeyId]?.name ?? input.id,
                    description: HOTKEY_DEFINITIONS[input.id as HotkeyId]?.description ?? ''
                }
            }
        }),

    /**
     * Reset all hotkeys to their default configurations
     */
    resetAllHotkeys: publicProcedure.mutation(() => {
        const store = getHotkeyStore()
        const manager = getHotkeyManager()

        store.resetAll()
        manager.unregisterAll()
        manager.registerAll()

        const statuses = manager.getAllStatus()

        return {
            success: true,
            hotkeys: statuses.map(status => ({
                ...status,
                name: HOTKEY_DEFINITIONS[status.id]?.name ?? status.id,
                description: HOTKEY_DEFINITIONS[status.id]?.description ?? ''
            }))
        }
    })
})
