export interface FileManagerFolder {
    id: string
    name: string
    createdAt: string
    updatedAt: string
    isSensitive: boolean
}

export interface FileManagerFile {
    id: string
    folderId: string
    originalName: string
    storedPath: string
    ext: string
    size: number
    mime: string
    createdAt: string
    updatedAt: string
    lastOpenedAt: string | null
    openCount: number
    isImage: boolean
    thumbnailPath: string | null
}

export interface FileManagerState {
    version: number
    folders: FileManagerFolder[]
    files: FileManagerFile[]
}

export interface QuickAccess {
    recent: FileManagerFile[]
    frequent: FileManagerFile[]
}

