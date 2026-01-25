import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import log from 'electron-log'

export interface AppPreferences {
    trayEnabled: boolean
    quickPromptEnabled: boolean
}

const STORE_FILE = 'preferences.json'

export class PreferencesStore {
    private storePath: string
    private cache: AppPreferences | null = null

    constructor() {
        const userDataPath = app.getPath('userData')
        const configDir = join(userDataPath, 'config')

        if (!existsSync(configDir)) {
            mkdirSync(configDir, { recursive: true })
        }

        this.storePath = join(configDir, STORE_FILE)
        log.info('[PreferencesStore] Initialized at:', this.storePath)
    }

    private getDefaults(): AppPreferences {
        return {
            trayEnabled: true,
            quickPromptEnabled: true
        }
    }

    private loadFromDisk(): AppPreferences {
        try {
            if (existsSync(this.storePath)) {
                const data = readFileSync(this.storePath, 'utf-8')
                const parsed = JSON.parse(data) as Partial<AppPreferences>
                const defaults = this.getDefaults()
                return {
                    trayEnabled: typeof parsed.trayEnabled === 'boolean' ? parsed.trayEnabled : defaults.trayEnabled,
                    quickPromptEnabled: typeof parsed.quickPromptEnabled === 'boolean' ? parsed.quickPromptEnabled : defaults.quickPromptEnabled
                }
            }
        } catch (error) {
            log.error('[PreferencesStore] Failed to load from disk:', error)
        }

        return this.getDefaults()
    }

    private saveToDisk(data: AppPreferences): void {
        try {
            writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8')
            log.info('[PreferencesStore] Saved to disk')
        } catch (error) {
            log.error('[PreferencesStore] Failed to save to disk:', error)
        }
    }

    private getData(): AppPreferences {
        if (!this.cache) {
            this.cache = this.loadFromDisk()
        }
        return this.cache
    }

    getAll(): AppPreferences {
        return this.getData()
    }

    set(patch: Partial<AppPreferences>): AppPreferences {
        const current = this.getData()
        const updated: AppPreferences = {
            trayEnabled: typeof patch.trayEnabled === 'boolean' ? patch.trayEnabled : current.trayEnabled,
            quickPromptEnabled: typeof patch.quickPromptEnabled === 'boolean' ? patch.quickPromptEnabled : current.quickPromptEnabled
        }

        this.cache = updated
        this.saveToDisk(updated)
        return updated
    }

    clearCache(): void {
        this.cache = null
    }
}

let storeInstance: PreferencesStore | null = null

export function getPreferencesStore(): PreferencesStore {
    if (!storeInstance) {
        storeInstance = new PreferencesStore()
    }
    return storeInstance
}
