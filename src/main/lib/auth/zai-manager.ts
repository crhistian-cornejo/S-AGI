import { getZaiKeyStore } from './zai-store'

export class ZaiAuthManager {
    private store = getZaiKeyStore()

    setApiKey(key: string | null): void {
        const normalized = key?.trim() || null
        this.store.setKey(normalized)
    }

    getApiKey(): string | null {
        return this.store.getKey()
    }

    hasApiKey(): boolean {
        return this.store.hasKey()
    }

    clear(): void {
        this.store.clear()
    }
}

let managerInstance: ZaiAuthManager | null = null

export function getZaiAuthManager(): ZaiAuthManager {
    if (!managerInstance) {
        managerInstance = new ZaiAuthManager()
    }
    return managerInstance
}
