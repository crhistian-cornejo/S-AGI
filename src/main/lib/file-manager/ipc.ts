import { ipcMain, dialog, shell } from 'electron'
import { z } from 'zod'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getFileManager } from './file-manager'
import { isSensitiveUnlocked } from '../security/sensitive-lock'
import { validateIPCSender } from '../security/ipc-validation'

export function registerFileManagerIpc(getTrayPopover: () => Electron.BrowserWindow | null): void {
    const fm = getFileManager()
    fm.init().catch(() => {})

    const notifyChange = () => {
        const popover = getTrayPopover()
        popover?.webContents.send('tray:refresh')
    }

    const assertFolderAllowed = async (folderId: string) => {
        const isSensitive = await fm.isFolderSensitive(folderId)
        if (isSensitive && !isSensitiveUnlocked()) throw new Error('Sensitive folder locked')
    }

    const assertFileAllowed = async (fileId: string) => {
        const isSensitive = await fm.isFileSensitive(fileId)
        if (isSensitive && !isSensitiveUnlocked()) throw new Error('Sensitive file locked')
    }

    ipcMain.handle('files:list-folders', async (event) => {
        if (!validateIPCSender(event.sender)) return []
        return await fm.listFolders()
    })

    ipcMain.handle('files:create-folder', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) throw new Error('Unauthorized')
        const { name, isSensitive } = z.object({
            name: z.string().min(1).max(64),
            isSensitive: z.boolean().optional().default(false)
        }).parse(input)
        const folder = await fm.createFolder(name, isSensitive)
        notifyChange()
        return folder
    })

    ipcMain.handle('files:rename-folder', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) throw new Error('Unauthorized')
        const { folderId, name } = z.object({
            folderId: z.string().min(1),
            name: z.string().min(1).max(64)
        }).parse(input)
        const folder = await fm.renameFolder(folderId, name)
        notifyChange()
        return folder
    })

    ipcMain.handle('files:delete-folder', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) throw new Error('Unauthorized')
        const { folderId } = z.object({
            folderId: z.string().min(1)
        }).parse(input)
        await fm.deleteFolder(folderId)
        notifyChange()
        return { success: true }
    })

    ipcMain.handle('files:list-files', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return []
        const { folderId } = z.object({
            folderId: z.string().min(1)
        }).parse(input)
        await assertFolderAllowed(folderId)
        return await fm.listFiles(folderId)
    })

    ipcMain.handle('files:list-all', async (event) => {
        if (!validateIPCSender(event.sender)) return []
        const allowSensitive = isSensitiveUnlocked()
        return await fm.listAllFiles(allowSensitive)
    })

    ipcMain.handle('files:get-quick-access', async (event) => {
        if (!validateIPCSender(event.sender)) return []
        return await fm.getQuickAccess()
    })

    ipcMain.handle('files:import-paths', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) throw new Error('Unauthorized')
        const { folderId, paths } = z.object({
            folderId: z.string().min(1),
            paths: z.array(z.string().min(1)).min(1).max(200)
        }).parse(input)
        await assertFolderAllowed(folderId)
        const files = await fm.importFromPaths(paths, folderId)
        notifyChange()
        return files
    })

    ipcMain.handle('files:pick-and-import', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return []
        const { folderId } = z.object({
            folderId: z.string().min(1)
        }).parse(input)
        await assertFolderAllowed(folderId)
        const result = await dialog.showOpenDialog({
            title: 'Select files',
            properties: ['openFile', 'multiSelections']
        })
        if (result.canceled || result.filePaths.length === 0) return []
        const files = await fm.importFromPaths(result.filePaths, folderId)
        notifyChange()
        return files
    })

    ipcMain.handle('files:delete-file', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) throw new Error('Unauthorized')
        const { fileId } = z.object({
            fileId: z.string().min(1)
        }).parse(input)
        await assertFileAllowed(fileId)
        await fm.deleteFile(fileId)
        notifyChange()
        return { success: true }
    })

    ipcMain.handle('files:open-file', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return { success: false }
        const { fileId } = z.object({
            fileId: z.string().min(1)
        }).parse(input)
        await assertFileAllowed(fileId)
        const file = await fm.getFileById(fileId)
        if (!file) return { success: false }
        await shell.openPath(file.storedPath)
        await fm.markOpened(fileId)
        notifyChange()
        return { success: true }
    })

    ipcMain.handle('files:show-in-folder', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return { success: false }
        const { fileId } = z.object({
            fileId: z.string().min(1)
        }).parse(input)
        await assertFileAllowed(fileId)
        const file = await fm.getFileById(fileId)
        if (!file) return { success: false }
        shell.showItemInFolder(file.storedPath)
        return { success: true }
    })

    ipcMain.handle('files:export', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return { exported: 0 }
        const { fileIds } = z.object({
            fileIds: z.array(z.string().min(1)).min(1).max(200)
        }).parse(input)
        for (const id of fileIds) {
            await assertFileAllowed(id)
        }
        const dir = await dialog.showOpenDialog({
            title: 'Choose destination folder',
            properties: ['openDirectory', 'createDirectory']
        })
        if (dir.canceled || dir.filePaths.length === 0) return { exported: 0 }
        const res = await fm.exportToDirectory(fileIds, dir.filePaths[0]!)
        return res
    })

    // Pick local PDF files for viewing only (no import, just returns paths)
    ipcMain.handle('pdf:pick-local', async (event) => {
        if (!validateIPCSender(event.sender)) return { files: [] }
        const result = await dialog.showOpenDialog({
            title: 'Select PDF files to view',
            filters: [
                { name: 'PDF Documents', extensions: ['pdf'] }
            ],
            properties: ['openFile', 'multiSelections']
        })

        if (result.canceled || result.filePaths.length === 0) {
            return { files: [] }
        }

        // Return file info without importing
        const files = result.filePaths.map(filePath => {
            const stats = fs.statSync(filePath)
            return {
                path: filePath,
                name: path.basename(filePath),
                size: stats.size
            }
        })

        return { files }
    })

    // Read a local PDF file as base64 for the viewer
    ipcMain.handle('pdf:read-local', async (event, input: unknown) => {
        if (!validateIPCSender(event.sender)) return { success: false, error: 'Unauthorized' }
        const { filePath } = z.object({
            filePath: z.string().min(1)
        }).parse(input)

        try {
            // Verify file exists and is a PDF
            if (!fs.existsSync(filePath)) {
                return { success: false, error: 'File not found' }
            }

            const stats = fs.statSync(filePath)
            const ext = path.extname(filePath).toLowerCase()
            if (ext !== '.pdf') {
                return { success: false, error: 'File is not a PDF' }
            }

            // Use async read for better performance (doesn't block main thread)
            const buffer = await fs.promises.readFile(filePath)
            const base64 = buffer.toString('base64')

            console.log(`[PDF IPC] Read ${filePath}: ${(stats.size / 1024 / 1024).toFixed(2)}MB`)

            return {
                success: true,
                data: base64,
                size: stats.size
            }
        } catch (error) {
            console.error('[PDF IPC] Error reading file:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to read file'
            }
        }
    })
}
