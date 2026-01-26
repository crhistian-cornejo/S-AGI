import { app } from 'electron'
import { join } from 'path'
import { chmod, mkdir } from 'fs/promises'

export interface StoragePaths {
    userData: string
    config: string
    data: string
    cache: string
    templates: string
    backups: string
    files: string
    secure: string
    logs: string
    temp: string
}

export function getStoragePaths(): StoragePaths {
    const userData = app.getPath('userData')
    return {
        userData,
        config: join(userData, 'config'),
        data: join(userData, 'data'),
        cache: join(userData, 'cache'),
        templates: join(userData, 'templates'),
        backups: join(userData, 'backups'),
        files: join(userData, 'files'),
        secure: join(userData, 'secure'),
        logs: app.getPath('logs'),
        temp: app.getPath('temp')
    }
}

export async function ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true })
}

export async function ensurePrivateDir(path: string): Promise<void> {
    await ensureDir(path)
    if (process.platform === 'win32') return
    try {
        await chmod(path, 0o700)
    } catch {
        return
    }
}
