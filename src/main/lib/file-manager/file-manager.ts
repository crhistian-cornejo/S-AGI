import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile, stat, copyFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import crypto from 'crypto'
import sharp from 'sharp'
import log from 'electron-log'
import type { FileManagerFile, FileManagerFolder, FileManagerState, QuickAccess } from './types'
import { fileUrlFromPath, getExt, inferMime, isImageExt, safeFilename } from './utils'

const STORE_VERSION = 1

function nowIso(): string {
    return new Date().toISOString()
}

async function ensureDir(p: string): Promise<void> {
    await mkdir(p, { recursive: true })
}

function defaultState(): FileManagerState {
    const createdAt = nowIso()
    const folders: FileManagerFolder[] = [
        { id: 'inbox', name: 'Inbox', createdAt, updatedAt: createdAt, isSensitive: false },
        { id: 'images', name: 'Images', createdAt, updatedAt: createdAt, isSensitive: false },
        { id: 'sensitive', name: 'Sensitive', createdAt, updatedAt: createdAt, isSensitive: true }
    ]
    return { version: STORE_VERSION, folders, files: [] }
}

export class FileManager {
    private storePath: string
    private filesRoot: string
    private thumbsRoot: string
    private cache: FileManagerState | null = null

    constructor() {
        const userData = app.getPath('userData')
        const dataDir = join(userData, 'data')
        this.filesRoot = join(userData, 'files')
        this.thumbsRoot = join(userData, 'cache', 'thumbnails')
        this.storePath = join(dataDir, 'file-manager.json')
    }

    async init(): Promise<void> {
        await ensureDir(join(app.getPath('userData'), 'data'))
        await ensureDir(this.filesRoot)
        await ensureDir(this.thumbsRoot)
        await this.load()
    }

    private async load(): Promise<FileManagerState> {
        if (this.cache) return this.cache
        try {
            if (existsSync(this.storePath)) {
                const raw = await readFile(this.storePath, 'utf-8')
                const parsed = JSON.parse(raw) as FileManagerState
                if (parsed?.version === STORE_VERSION && Array.isArray(parsed.folders) && Array.isArray(parsed.files)) {
                    this.cache = parsed
                    return parsed
                }
            }
        } catch (err) {
            log.warn('[FileManager] load failed:', err)
        }
        const fresh = defaultState()
        this.cache = fresh
        await this.save()
        return fresh
    }

    private async save(): Promise<void> {
        if (!this.cache) return
        await writeFile(this.storePath, JSON.stringify(this.cache, null, 2), 'utf-8')
    }

    private async getState(): Promise<FileManagerState> {
        return await this.load()
    }

    private getFolderPath(folderId: string): string {
        return join(this.filesRoot, folderId)
    }

    private getThumbPath(fileId: string): string {
        return join(this.thumbsRoot, `${fileId}.webp`)
    }

    private async ensureFolderDir(folderId: string): Promise<void> {
        await ensureDir(this.getFolderPath(folderId))
    }

    async listFolders(): Promise<FileManagerFolder[]> {
        const state = await this.getState()
        return [...state.folders].sort((a, b) => a.name.localeCompare(b.name))
    }

    async isFolderSensitive(folderId: string): Promise<boolean> {
        const state = await this.getState()
        return state.folders.find(f => f.id === folderId)?.isSensitive ?? false
    }

    async isFileSensitive(fileId: string): Promise<boolean> {
        const state = await this.getState()
        const file = state.files.find(f => f.id === fileId)
        if (!file) return false
        return state.folders.find(f => f.id === file.folderId)?.isSensitive ?? false
    }

    async createFolder(name: string, isSensitive: boolean): Promise<FileManagerFolder> {
        const state = await this.getState()
        const id = crypto.randomUUID()
        const ts = nowIso()
        const folder: FileManagerFolder = { id, name, createdAt: ts, updatedAt: ts, isSensitive }
        state.folders.push(folder)
        this.cache = state
        await this.ensureFolderDir(id)
        await this.save()
        return folder
    }

    async renameFolder(folderId: string, name: string): Promise<FileManagerFolder> {
        const state = await this.getState()
        const folder = state.folders.find(f => f.id === folderId)
        if (!folder) throw new Error('Folder not found')
        folder.name = name
        folder.updatedAt = nowIso()
        this.cache = state
        await this.save()
        return folder
    }

    async deleteFolder(folderId: string): Promise<void> {
        const state = await this.getState()
        const folder = state.folders.find(f => f.id === folderId)
        if (!folder) return
        if (['inbox', 'images', 'sensitive'].includes(folderId)) {
            throw new Error('Default folders cannot be deleted')
        }

        const toDelete = state.files.filter(f => f.folderId === folderId)
        state.files = state.files.filter(f => f.folderId !== folderId)
        state.folders = state.folders.filter(f => f.id !== folderId)
        this.cache = state

        await Promise.all(toDelete.map(async f => {
            try {
                if (f.thumbnailPath) await rm(f.thumbnailPath, { force: true })
            } catch {}
        }))

        try {
            await rm(this.getFolderPath(folderId), { recursive: true, force: true })
        } catch {}

        await this.save()
    }

    async listFiles(folderId: string): Promise<Array<FileManagerFile & { url: string; thumbnailUrl: string | null }>> {
        const state = await this.getState()
        const items = state.files.filter(f => f.folderId === folderId)
        const sorted = items.sort((a, b) => new Date((b.lastOpenedAt ?? b.createdAt)).getTime() - new Date((a.lastOpenedAt ?? a.createdAt)).getTime())
        return sorted.map(f => ({
            ...f,
            url: fileUrlFromPath(f.storedPath),
            thumbnailUrl: f.thumbnailPath ? fileUrlFromPath(f.thumbnailPath) : null
        }))
    }

    async getFileById(fileId: string): Promise<FileManagerFile | null> {
        const state = await this.getState()
        return state.files.find(f => f.id === fileId) ?? null
    }

    async getFileUrls(fileId: string): Promise<(FileManagerFile & { url: string; thumbnailUrl: string | null }) | null> {
        const file = await this.getFileById(fileId)
        if (!file) return null
        return {
            ...file,
            url: fileUrlFromPath(file.storedPath),
            thumbnailUrl: file.thumbnailPath ? fileUrlFromPath(file.thumbnailPath) : null
        }
    }

    async deleteFile(fileId: string): Promise<void> {
        const state = await this.getState()
        const file = state.files.find(f => f.id === fileId)
        if (!file) return
        state.files = state.files.filter(f => f.id !== fileId)
        this.cache = state

        try { await rm(file.storedPath, { force: true }) } catch {}
        try { if (file.thumbnailPath) await rm(file.thumbnailPath, { force: true }) } catch {}
        await this.save()
    }

    async markOpened(fileId: string): Promise<void> {
        const state = await this.getState()
        const file = state.files.find(f => f.id === fileId)
        if (!file) return
        file.lastOpenedAt = nowIso()
        file.openCount = (file.openCount ?? 0) + 1
        file.updatedAt = nowIso()
        this.cache = state
        await this.save()
    }

    async getQuickAccess(): Promise<QuickAccess> {
        const state = await this.getState()
        const sortedRecent = [...state.files].sort((a, b) => new Date((b.lastOpenedAt ?? b.createdAt)).getTime() - new Date((a.lastOpenedAt ?? a.createdAt)).getTime())
        const sortedFrequent = [...state.files].sort((a, b) => (b.openCount ?? 0) - (a.openCount ?? 0))
        return {
            recent: sortedRecent.slice(0, 8),
            frequent: sortedFrequent.slice(0, 8)
        }
    }

    async importFromPaths(paths: string[], folderId: string): Promise<FileManagerFile[]> {
        const state = await this.getState()
        const folderExists = state.folders.some(f => f.id === folderId)
        if (!folderExists) throw new Error('Folder not found')
        await this.ensureFolderDir(folderId)

        const imported: FileManagerFile[] = []
        for (const sourcePath of paths) {
            try {
                const s = await stat(sourcePath)
                if (!s.isFile()) continue

                const originalName = safeFilename(sourcePath.split(/[\\/]/).pop() || 'file')
                const ext = getExt(originalName)
                const id = crypto.randomUUID()
                const storedName = `${id}${ext ? `.${ext}` : ''}`
                const destPath = join(this.getFolderPath(folderId), storedName)

                await copyFile(sourcePath, destPath)

                const isImage = isImageExt(ext)
                let thumbnailPath: string | null = null

                if (isImage) {
                    try {
                        const thumbPath = this.getThumbPath(id)
                        await sharp(destPath)
                            .rotate()
                            .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
                            .webp({ quality: 72 })
                            .toFile(thumbPath)
                        thumbnailPath = thumbPath
                    } catch (err) {
                        log.warn('[FileManager] thumbnail failed:', err)
                    }
                }

                const ts = nowIso()
                const file: FileManagerFile = {
                    id,
                    folderId,
                    originalName,
                    storedPath: destPath,
                    ext,
                    size: s.size,
                    mime: inferMime(ext),
                    createdAt: ts,
                    updatedAt: ts,
                    lastOpenedAt: null,
                    openCount: 0,
                    isImage,
                    thumbnailPath
                }

                state.files.push(file)
                imported.push(file)
            } catch (err) {
                log.warn('[FileManager] import failed:', err)
            }
        }

        this.cache = state
        await this.save()
        return imported
    }

    async exportToDirectory(fileIds: string[], targetDir: string): Promise<{ exported: number }> {
        const state = await this.getState()
        const byId = new Map(state.files.map(f => [f.id, f]))
        let exported = 0
        for (const id of fileIds) {
            const f = byId.get(id)
            if (!f) continue
            const base = safeFilename(f.originalName)
            let dest = join(targetDir, base)
            if (existsSync(dest)) {
                const ext = f.ext ? `.${f.ext}` : ''
                const nameWithoutExt = base.endsWith(ext) ? base.slice(0, -ext.length) : base
                let i = 1
                while (existsSync(dest)) {
                    dest = join(targetDir, `${nameWithoutExt} (${i})${ext}`)
                    i += 1
                }
            }
            try {
                await copyFile(f.storedPath, dest)
                exported += 1
            } catch {}
        }
        return { exported }
    }
}

let instance: FileManager | null = null

export function getFileManager(): FileManager {
    if (!instance) {
        instance = new FileManager()
    }
    return instance
}
