import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'
import type { HotkeyId, HotkeyConfig } from '@shared/hotkey-types'
import { getAllHotkeyIds, getDefaultShortcut } from '@shared/hotkey-types'

const STORE_FILE = 'hotkeys.json'

interface HotkeyStoreData {
    hotkeys: Record<HotkeyId, HotkeyConfig>
}

/**
 * Persistent storage for hotkey configurations
 * Stores in userData/hotkeys.json (not encrypted since shortcuts aren't sensitive)
 */
export class HotkeyStore {
    private storePath: string
    private cache: HotkeyStoreData | null = null

    constructor() {
        const userDataPath = app.getPath('userData')
        const configDir = join(userDataPath, 'config')

        if (!existsSync(configDir)) {
            mkdirSync(configDir, { recursive: true })
        }

        this.storePath = join(configDir, STORE_FILE)
        log.info('[HotkeyStore] Initialized at:', this.storePath)
    }

    /**
     * Get default configurations for all hotkeys
     */
    private getDefaults(): HotkeyStoreData {
        const platform = process.platform
        const hotkeys: Record<string, HotkeyConfig> = {}

        for (const id of getAllHotkeyIds()) {
            hotkeys[id] = {
                id,
                shortcut: getDefaultShortcut(id, platform),
                enabled: true
            }
        }

        return { hotkeys: hotkeys as Record<HotkeyId, HotkeyConfig> }
    }

    /**
     * Load configurations from disk
     */
    private loadFromDisk(): HotkeyStoreData {
        try {
            if (existsSync(this.storePath)) {
                const data = readFileSync(this.storePath, 'utf-8')
                const parsed = JSON.parse(data) as HotkeyStoreData

                // Merge with defaults to handle new hotkeys added in updates
                const defaults = this.getDefaults()
                for (const id of getAllHotkeyIds()) {
                    if (!parsed.hotkeys[id]) {
                        parsed.hotkeys[id] = defaults.hotkeys[id]
                    }
                }

                log.info('[HotkeyStore] Loaded from disk')
                return parsed
            }
        } catch (error) {
            log.error('[HotkeyStore] Failed to load from disk:', error)
        }

        return this.getDefaults()
    }

    /**
     * Save configurations to disk
     */
    private saveToDisk(data: HotkeyStoreData): void {
        try {
            writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8')
            log.info('[HotkeyStore] Saved to disk')
        } catch (error) {
            log.error('[HotkeyStore] Failed to save to disk:', error)
        }
    }

    /**
     * Get cached data or load from disk
     */
    private getData(): HotkeyStoreData {
        if (!this.cache) {
            this.cache = this.loadFromDisk()
        }
        return this.cache
    }

    /**
     * Get all hotkey configurations
     */
    getAll(): HotkeyConfig[] {
        const data = this.getData()
        return Object.values(data.hotkeys)
    }

    /**
     * Get a specific hotkey configuration
     */
    get(id: HotkeyId): HotkeyConfig | null {
        const data = this.getData()
        return data.hotkeys[id] || null
    }

    /**
     * Set a hotkey configuration
     */
    set(id: HotkeyId, config: Partial<Omit<HotkeyConfig, 'id'>>): HotkeyConfig {
        const data = this.getData()
        const current = data.hotkeys[id] || {
            id,
            shortcut: getDefaultShortcut(id, process.platform),
            enabled: true
        }

        const updated: HotkeyConfig = {
            ...current,
            ...config,
            id // Ensure ID is always correct
        }

        data.hotkeys[id] = updated
        this.cache = data
        this.saveToDisk(data)

        log.info('[HotkeyStore] Updated hotkey:', id, updated)
        return updated
    }

    /**
     * Reset a hotkey to its default configuration
     */
    reset(id: HotkeyId): HotkeyConfig {
        const defaultConfig: HotkeyConfig = {
            id,
            shortcut: getDefaultShortcut(id, process.platform),
            enabled: true
        }

        const data = this.getData()
        data.hotkeys[id] = defaultConfig
        this.cache = data
        this.saveToDisk(data)

        log.info('[HotkeyStore] Reset hotkey to default:', id)
        return defaultConfig
    }

    /**
     * Reset all hotkeys to defaults
     */
    resetAll(): HotkeyConfig[] {
        this.cache = this.getDefaults()
        this.saveToDisk(this.cache)
        log.info('[HotkeyStore] Reset all hotkeys to defaults')
        return this.getAll()
    }

    /**
     * Check if a shortcut conflicts with another configured hotkey
     */
    getConflicts(shortcut: string, excludeId?: HotkeyId): HotkeyConfig[] {
        const data = this.getData()
        const normalizedShortcut = shortcut.toLowerCase()

        return Object.values(data.hotkeys).filter(config => {
            if (excludeId && config.id === excludeId) return false
            if (!config.enabled) return false
            return config.shortcut.toLowerCase() === normalizedShortcut
        })
    }

    /**
     * Clear the in-memory cache (force reload from disk on next access)
     */
    clearCache(): void {
        this.cache = null
    }
}

// Singleton instance
let storeInstance: HotkeyStore | null = null

export function getHotkeyStore(): HotkeyStore {
    if (!storeInstance) {
        storeInstance = new HotkeyStore()
    }
    return storeInstance
}
