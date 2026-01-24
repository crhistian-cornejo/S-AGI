import { ipcMain, systemPreferences } from 'electron'
import { z } from 'zod'
import { getSensitiveUnlockUntil, lockSensitiveNow, unlockSensitiveFor } from './sensitive-lock'
import { getSensitivePinStore } from './pin-store'
import { validateIPCSender } from './ipc-validation'

export function registerSecurityIpc(): void {
    ipcMain.handle('security:sensitive-status', async (event) => {
        if (!validateIPCSender(event.sender)) return { unlockedUntil: null, canBiometric: false, pinEnabled: false }
        const canBiometric = process.platform === 'darwin' && systemPreferences.canPromptTouchID()
        const pinEnabled = getSensitivePinStore().hasPin()
        return {
            unlockedUntil: getSensitiveUnlockUntil(),
            canBiometric,
            pinEnabled
        }
    })

    ipcMain.handle('security:unlock-sensitive', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return { success: false, error: 'Unauthorized', unlockedUntil: getSensitiveUnlockUntil() }
        const { ttlMs, reason } = z.object({
            ttlMs: z.number().int().min(10_000).max(60 * 60 * 1000).optional().default(5 * 60 * 1000),
            reason: z.string().min(1).max(120).optional().default('Unlock sensitive files')
        }).parse(input)

        if (process.platform === 'darwin' && systemPreferences.canPromptTouchID()) {
            try {
                await systemPreferences.promptTouchID(reason)
                unlockSensitiveFor(ttlMs)
                return { success: true, unlockedUntil: getSensitiveUnlockUntil() }
            } catch (err: any) {
                return { success: false, error: err?.message || 'Biometric failed', unlockedUntil: getSensitiveUnlockUntil() }
            }
        }

        return { success: false, error: 'Biometric not supported on this OS', unlockedUntil: getSensitiveUnlockUntil() }
    })

    ipcMain.handle('security:set-pin', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return { success: false }
        const { pin } = z.object({
            pin: z.string().min(4).max(32)
        }).parse(input)
        getSensitivePinStore().setPin(pin)
        return { success: true }
    })

    ipcMain.handle('security:clear-pin', async (event) => {
        if (!validateIPCSender(event.sender)) return { success: false }
        getSensitivePinStore().clear()
        lockSensitiveNow()
        return { success: true }
    })

    ipcMain.handle('security:unlock-with-pin', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return { success: false, unlockedUntil: getSensitiveUnlockUntil(), error: 'Unauthorized' }
        const { pin, ttlMs } = z.object({
            pin: z.string().min(4).max(32),
            ttlMs: z.number().int().min(10_000).max(60 * 60 * 1000).optional().default(5 * 60 * 1000)
        }).parse(input)

        const store = getSensitivePinStore()
        if (!store.hasPin()) return { success: false, unlockedUntil: getSensitiveUnlockUntil(), error: 'PIN not set' }
        if (!store.verifyPin(pin)) return { success: false, unlockedUntil: getSensitiveUnlockUntil(), error: 'Invalid PIN' }
        unlockSensitiveFor(ttlMs)
        return { success: true, unlockedUntil: getSensitiveUnlockUntil() }
    })

    ipcMain.handle('security:lock-sensitive', async (event) => {
        if (!validateIPCSender(event.sender)) return { success: false }
        lockSensitiveNow()
        return { success: true }
    })
}
