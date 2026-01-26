import { join, extname, basename } from 'path'
import { readFile, rm, stat, writeFile, copyFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import log from 'electron-log'
import { ensureDir, ensurePrivateDir, getStoragePaths } from './paths'
import { safeFilename } from '../file-manager/utils'

export type TemplateType = 'spreadsheet' | 'prompt' | 'workflow'

export interface TemplateMeta {
    id: string
    name: string
    type: TemplateType
    createdAt: string
    updatedAt: string
    tags: string[]
    ext?: string
}

export interface TemplateEntry extends TemplateMeta {
    content?: string
}

const META_FILE = 'templates.json'

export class TemplateStore {
    private root: string
    private metaPath: string
    private cache: TemplateMeta[] | null = null

    constructor() {
        const paths = getStoragePaths()
        this.root = paths.templates
        this.metaPath = join(this.root, META_FILE)
    }

    async init(): Promise<void> {
        await ensurePrivateDir(this.root)
        await this.ensureMeta()
    }

    private async ensureMeta(): Promise<void> {
        await ensureDir(this.root)
        try {
            await stat(this.metaPath)
        } catch {
            await writeFile(this.metaPath, JSON.stringify([], null, 2), 'utf-8')
        }
    }

    private async loadMeta(): Promise<TemplateMeta[]> {
        if (this.cache) return this.cache
        try {
            const raw = await readFile(this.metaPath, 'utf-8')
            const parsed = JSON.parse(raw) as TemplateMeta[]
            if (Array.isArray(parsed)) {
                this.cache = parsed
                return parsed
            }
        } catch (err) {
            log.warn('[TemplateStore] meta load failed:', err)
        }
        this.cache = []
        await this.saveMeta([])
        return []
    }

    private async saveMeta(data: TemplateMeta[]): Promise<void> {
        this.cache = data
        await writeFile(this.metaPath, JSON.stringify(data, null, 2), 'utf-8')
    }

    private getTemplatePath(meta: TemplateMeta): string {
        const ext = meta.ext ? `.${meta.ext}` : 'txt'
        return join(this.root, `${meta.id}.${meta.type}.${ext}`)
    }

    async list(type?: TemplateType): Promise<TemplateMeta[]> {
        const meta = await this.loadMeta()
        const items = type ? meta.filter(item => item.type === type) : meta
        return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }

    async get(id: string): Promise<TemplateEntry | null> {
        const meta = await this.loadMeta()
        const entry = meta.find(item => item.id === id)
        if (!entry) return null
        try {
            const content = await readFile(this.getTemplatePath(entry), 'utf-8')
            return { ...entry, content }
        } catch {
            return { ...entry }
        }
    }

    async savePrompt(name: string, content: string, tags: string[] = []): Promise<TemplateMeta> {
        return await this.saveTemplate({
            name,
            type: 'prompt',
            content,
            tags,
            ext: 'txt'
        })
    }

    async saveWorkflow(name: string, content: object, tags: string[] = []): Promise<TemplateMeta> {
        return await this.saveTemplate({
            name,
            type: 'workflow',
            content: JSON.stringify(content, null, 2),
            tags,
            ext: 'json'
        })
    }

    async importSpreadsheetTemplate(filePath: string, name?: string, tags: string[] = []): Promise<TemplateMeta> {
        await ensureDir(this.root)
        const fileName = name ?? safeFilename(basename(filePath))
        const ext = extname(filePath).replace('.', '') || 'xlsx'
        const id = randomUUID()
        const now = new Date().toISOString()
        const meta: TemplateMeta = {
            id,
            name: fileName,
            type: 'spreadsheet',
            createdAt: now,
            updatedAt: now,
            tags,
            ext
        }

        const updated = [...await this.loadMeta(), meta]
        await copyFile(filePath, this.getTemplatePath(meta))
        await this.saveMeta(updated)
        return meta
    }

    async delete(id: string): Promise<void> {
        const meta = await this.loadMeta()
        const entry = meta.find(item => item.id === id)
        if (!entry) return
        const updated = meta.filter(item => item.id !== id)
        try {
            await rm(this.getTemplatePath(entry), { force: true })
        } catch (err) {
            log.warn('[TemplateStore] delete failed:', err)
        }
        await this.saveMeta(updated)
    }

    private async saveTemplate(input: { name: string; type: TemplateType; content: string; tags: string[]; ext?: string }): Promise<TemplateMeta> {
        await ensureDir(this.root)
        const id = randomUUID()
        const now = new Date().toISOString()
        const meta: TemplateMeta = {
            id,
            name: input.name,
            type: input.type,
            createdAt: now,
            updatedAt: now,
            tags: input.tags,
            ext: input.ext
        }

        const updated = [...await this.loadMeta(), meta]
        await writeFile(this.getTemplatePath(meta), input.content, 'utf-8')
        await this.saveMeta(updated)
        return meta
    }
}
