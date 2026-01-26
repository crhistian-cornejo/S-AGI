import { join } from 'path'
import { readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import log from 'electron-log'
import { ensureDir, ensurePrivateDir, getStoragePaths } from './paths'

export interface BackupEntry {
    id: string
    label: string
    createdAt: string
    sizeBytes: number
}

export class BackupManager {
    private root: string
    private maxBackups: number

    constructor(options?: { maxBackups?: number }) {
        const paths = getStoragePaths()
        this.root = paths.backups
        this.maxBackups = Math.max(1, options?.maxBackups ?? 10)
    }

    async init(): Promise<void> {
        await ensurePrivateDir(this.root)
    }

    private backupPath(id: string): string {
        return join(this.root, `${id}.json`)
    }

    async list(): Promise<BackupEntry[]> {
        await ensureDir(this.root)
        const files = await readdir(this.root)
        const entries: BackupEntry[] = []

        for (const name of files) {
            if (!name.endsWith('.json')) continue
            const path = join(this.root, name)
            try {
                const raw = await readFile(path, 'utf-8')
                const parsed = JSON.parse(raw) as BackupEntry & { payload?: unknown }
                if (parsed?.id && parsed?.createdAt) {
                    entries.push({
                        id: parsed.id,
                        label: parsed.label,
                        createdAt: parsed.createdAt,
                        sizeBytes: parsed.sizeBytes ?? 0
                    })
                }
            } catch {
                continue
            }
        }

        return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }

    async create<T>(label: string, payload: T): Promise<BackupEntry> {
        await ensureDir(this.root)
        const createdAt = new Date().toISOString()
        const id = `${createdAt.replace(/[:.]/g, '-')}`
        const json = JSON.stringify({ id, label, createdAt, payload }, null, 2)
        await writeFile(this.backupPath(id), json, 'utf-8')
        const sizeBytes = Buffer.byteLength(json)
        const entry: BackupEntry = { id, label, createdAt, sizeBytes }
        await this.pruneOld()
        return entry
    }

    async get<T>(id: string): Promise<T | null> {
        try {
            const raw = await readFile(this.backupPath(id), 'utf-8')
            const parsed = JSON.parse(raw) as { payload?: T }
            return parsed.payload ?? null
        } catch {
            return null
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await rm(this.backupPath(id), { force: true })
        } catch {
            return
        }
    }

    private async pruneOld(): Promise<void> {
        const entries = await this.list()
        if (entries.length <= this.maxBackups) return

        const toRemove = entries.slice(this.maxBackups)
        for (const entry of toRemove) {
            try {
                await rm(this.backupPath(entry.id), { force: true })
            } catch (err) {
                log.warn('[BackupManager] prune failed:', err)
            }
        }
    }

    async snapshotDirectory(label: string, dirPath: string): Promise<BackupEntry> {
        const files = await this.collectFiles(dirPath)
        return await this.create(label, { basePath: dirPath, files })
    }

    private async collectFiles(dirPath: string): Promise<Array<{ path: string; content: string }>> {
        const entries = await readdir(dirPath, { withFileTypes: true })
        const files: Array<{ path: string; content: string }> = []

        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name)
            if (entry.isDirectory()) {
                files.push(...await this.collectFiles(fullPath))
                continue
            }
            try {
                const info = await stat(fullPath)
                if (info.size > 5 * 1024 * 1024) continue
                const content = await readFile(fullPath, 'utf-8')
                files.push({ path: fullPath, content })
            } catch {
                continue
            }
        }

        return files
    }
}
