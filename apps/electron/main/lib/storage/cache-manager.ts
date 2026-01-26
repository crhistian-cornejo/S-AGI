import { createHash } from 'crypto'
import { join } from 'path'
import { readdir, readFile, rm, stat, writeFile, unlink } from 'fs/promises'
import log from 'electron-log'
import { ensureDir, ensurePrivateDir, getStoragePaths } from './paths'

export interface CacheEntry<T> {
    value: T
    createdAt: number
    expiresAt: number | null
}

export interface CacheStats {
    entries: number
    sizeBytes: number
}

export interface CleanupResult {
    removed: number
    freedBytes: number
}

interface CacheFile {
    path: string
    size: number
    mtimeMs: number
}

export class CacheManager {
    private cacheRoot: string
    private maxBytes: number

    constructor(subdir: string, options?: { maxSizeMB?: number }) {
        const paths = getStoragePaths()
        this.cacheRoot = join(paths.cache, subdir)
        this.maxBytes = Math.max(1, options?.maxSizeMB ?? 256) * 1024 * 1024
    }

    async init(): Promise<void> {
        await ensurePrivateDir(this.cacheRoot)
    }

    private keyHash(key: string): string {
        return createHash('sha256').update(key).digest('hex').slice(0, 24)
    }

    private entryPath(key: string): string {
        return join(this.cacheRoot, `${this.keyHash(key)}.json`)
    }

    async get<T>(key: string): Promise<T | null> {
        const path = this.entryPath(key)
        try {
            const raw = await readFile(path, 'utf-8')
            const parsed = JSON.parse(raw) as CacheEntry<T>
            if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
                await unlink(path)
                return null
            }
            return parsed.value
        } catch {
            return null
        }
    }

    async set<T>(key: string, value: T, options?: { ttlMs?: number }): Promise<void> {
        await ensureDir(this.cacheRoot)
        const entry: CacheEntry<T> = {
            value,
            createdAt: Date.now(),
            expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null
        }
        await writeFile(this.entryPath(key), JSON.stringify(entry), 'utf-8')
        await this.enforceLimit()
    }

    async delete(key: string): Promise<void> {
        try {
            await unlink(this.entryPath(key))
        } catch {
            return
        }
    }

    async clear(): Promise<void> {
        await rm(this.cacheRoot, { recursive: true, force: true })
        await ensurePrivateDir(this.cacheRoot)
    }

    async getStats(): Promise<CacheStats> {
        await ensureDir(this.cacheRoot)
        const files = await readdir(this.cacheRoot)
        let sizeBytes = 0
        for (const name of files) {
            const info = await stat(join(this.cacheRoot, name))
            if (info.isFile()) sizeBytes += info.size
        }
        return { entries: files.length, sizeBytes }
    }

    private async enforceLimit(): Promise<void> {
        await ensureDir(this.cacheRoot)
        const files = await readdir(this.cacheRoot)
        const detailed: CacheFile[] = []
        let total = 0

        for (const name of files) {
            const path = join(this.cacheRoot, name)
            try {
                const info = await stat(path)
                if (!info.isFile()) continue
                total += info.size
                detailed.push({ path, size: info.size, mtimeMs: info.mtimeMs })
            } catch {
                continue
            }
        }

        if (total <= this.maxBytes) return

        detailed.sort((a, b) => a.mtimeMs - b.mtimeMs)
        let freed = 0
        for (const item of detailed) {
            if (total - freed <= this.maxBytes) break
            try {
                await unlink(item.path)
                freed += item.size
            } catch (err) {
                log.warn('[CacheManager] Failed to remove cache file:', err)
            }
        }
    }

    async cleanupExpired(): Promise<CleanupResult> {
        await ensureDir(this.cacheRoot)
        const files = await readdir(this.cacheRoot)
        let removed = 0
        let freedBytes = 0

        for (const name of files) {
            const path = join(this.cacheRoot, name)
            try {
                const raw = await readFile(path, 'utf-8')
                const parsed = JSON.parse(raw) as CacheEntry<unknown>
                if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
                    const info = await stat(path)
                    await unlink(path)
                    removed += 1
                    freedBytes += info.size
                }
            } catch {
                continue
            }
        }

        return { removed, freedBytes }
    }
}
