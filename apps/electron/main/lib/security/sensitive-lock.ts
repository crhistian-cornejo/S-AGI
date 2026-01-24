let unlockedUntil = 0

export function getSensitiveUnlockUntil(): number {
    return unlockedUntil
}

export function isSensitiveUnlocked(): boolean {
    return Date.now() < unlockedUntil
}

export function unlockSensitiveFor(ms: number): void {
    unlockedUntil = Date.now() + Math.max(0, ms)
}

export function lockSensitiveNow(): void {
    unlockedUntil = 0
}

