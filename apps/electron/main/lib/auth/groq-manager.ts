import { getGroqKeyStore } from './groq-store'

export class GroqAuthManager {
    private store = getGroqKeyStore()

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

let managerInstance: GroqAuthManager | null = null

export function getGroqAuthManager(): GroqAuthManager {
    if (!managerInstance) {
        managerInstance = new GroqAuthManager()
    }
    return managerInstance
}
