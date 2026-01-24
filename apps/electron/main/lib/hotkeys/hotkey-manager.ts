import { globalShortcut } from 'electron'
import log from 'electron-log'
import type { HotkeyId, HotkeyStatus } from '@shared/hotkey-types'
import { getAllHotkeyIds } from '@shared/hotkey-types'
import { getHotkeyStore } from './hotkey-store'

type HotkeyHandler = () => void

interface RegistrationState {
    isRegistered: boolean
    error?: string
    shortcut: string
}

/**
 * Manages global keyboard shortcuts registration with Electron
 */
export class HotkeyManager {
    private handlers: Map<HotkeyId, HotkeyHandler> = new Map()
    private registrationState: Map<HotkeyId, RegistrationState> = new Map()

    constructor() {
        log.info('[HotkeyManager] Initialized')
    }

    /**
     * Set the handler function for a hotkey
     */
    setHandler(id: HotkeyId, handler: HotkeyHandler): void {
        this.handlers.set(id, handler)
        log.info('[HotkeyManager] Handler set for:', id)
    }

    /**
     * Register all configured and enabled hotkeys
     */
    registerAll(): void {
        const store = getHotkeyStore()
        const configs = store.getAll()

        for (const config of configs) {
            if (config.enabled) {
                this.register(config.id)
            } else {
                this.registrationState.set(config.id, {
                    isRegistered: false,
                    shortcut: config.shortcut,
                    error: 'Disabled'
                })
            }
        }
    }

    /**
     * Register a single hotkey
     */
    register(id: HotkeyId): boolean {
        const store = getHotkeyStore()
        const config = store.get(id)

        if (!config) {
            log.warn('[HotkeyManager] No config found for:', id)
            return false
        }

        if (!config.enabled) {
            log.info('[HotkeyManager] Hotkey disabled, skipping:', id)
            this.registrationState.set(id, {
                isRegistered: false,
                shortcut: config.shortcut,
                error: 'Disabled'
            })
            return false
        }

        const handler = this.handlers.get(id)
        if (!handler) {
            log.warn('[HotkeyManager] No handler registered for:', id)
            this.registrationState.set(id, {
                isRegistered: false,
                shortcut: config.shortcut,
                error: 'No handler registered'
            })
            return false
        }

        // Unregister if already registered with a different shortcut
        const currentState = this.registrationState.get(id)
        if (currentState?.isRegistered && currentState.shortcut !== config.shortcut) {
            try {
                globalShortcut.unregister(currentState.shortcut)
            } catch (e) {
                // Ignore unregister errors
            }
        }

        // Try to register the shortcut
        try {
            const success = globalShortcut.register(config.shortcut, handler)

            if (success) {
                log.info(`[HotkeyManager] Registered ${id}: ${config.shortcut}`)
                this.registrationState.set(id, {
                    isRegistered: true,
                    shortcut: config.shortcut
                })
                return true
            } else {
                const error = 'Shortcut may be in use by system or another app'
                log.warn(`[HotkeyManager] Failed to register ${id}: ${config.shortcut} - ${error}`)
                this.registrationState.set(id, {
                    isRegistered: false,
                    shortcut: config.shortcut,
                    error
                })
                return false
            }
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Unknown error'
            log.error(`[HotkeyManager] Error registering ${id}:`, error)
            this.registrationState.set(id, {
                isRegistered: false,
                shortcut: config.shortcut,
                error
            })
            return false
        }
    }

    /**
     * Unregister a single hotkey
     */
    unregister(id: HotkeyId): void {
        const state = this.registrationState.get(id)

        if (state?.isRegistered) {
            try {
                globalShortcut.unregister(state.shortcut)
                log.info(`[HotkeyManager] Unregistered ${id}: ${state.shortcut}`)
            } catch (e) {
                log.error(`[HotkeyManager] Error unregistering ${id}:`, e)
            }
        }

        this.registrationState.set(id, {
            isRegistered: false,
            shortcut: state?.shortcut || '',
            error: 'Unregistered'
        })
    }

    /**
     * Unregister all hotkeys
     */
    unregisterAll(): void {
        for (const id of getAllHotkeyIds()) {
            this.unregister(id)
        }
        globalShortcut.unregisterAll()
        log.info('[HotkeyManager] All hotkeys unregistered')
    }

    /**
     * Re-register a hotkey (e.g., after config change)
     */
    reregister(id: HotkeyId): boolean {
        this.unregister(id)
        return this.register(id)
    }

    /**
     * Get the status of a hotkey
     */
    getStatus(id: HotkeyId): HotkeyStatus {
        const store = getHotkeyStore()
        const config = store.get(id)
        const state = this.registrationState.get(id)

        return {
            id,
            isRegistered: state?.isRegistered ?? false,
            error: state?.error,
            shortcut: config?.shortcut ?? '',
            enabled: config?.enabled ?? true
        }
    }

    /**
     * Get status of all hotkeys
     */
    getAllStatus(): HotkeyStatus[] {
        return getAllHotkeyIds().map(id => this.getStatus(id))
    }

    /**
     * Check if a shortcut is already registered globally
     * Note: This checks Electron's registration, not other apps
     */
    isRegistered(shortcut: string): boolean {
        return globalShortcut.isRegistered(shortcut)
    }
}

// Singleton instance
let managerInstance: HotkeyManager | null = null

export function getHotkeyManager(): HotkeyManager {
    if (!managerInstance) {
        managerInstance = new HotkeyManager()
    }
    return managerInstance
}
