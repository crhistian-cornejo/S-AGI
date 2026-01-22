import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { exportToExcel } from '../univer/excel-exchange'
import './tray-popover.css'

// Local type definition (matches TrayRecentItem from env.d.ts)
interface FileFolder {
    id: string
    name: string
    isSensitive: boolean
}

interface FileItem {
    id: string
    folderId: string
    originalName: string
    ext: string
    size: number
    mime: string
    createdAt: string
    updatedAt: string
    lastOpenedAt: string | null
    openCount: number
    isImage: boolean
    thumbnailUrl: string | null
    url: string
}

interface SpreadsheetItem {
    id: string
    name: string
    updatedAt: string
    chatId?: string
}

interface CitationItem {
    id: string
    kind: 'url' | 'file'
    label: string
    url?: string
    filename?: string
    chatId: string
    messageId: string
    createdAt: string
    startIndex?: number
    endIndex?: number
    fileId?: string
}

// Icons as SVG components for better control
const SearchIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Search</title>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
)

const SpreadsheetIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Spreadsheet</title>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
)

const DocumentIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Document</title>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
    </svg>
)

const PdfIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>PDF</title>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 13h2v4H9z" />
        <path d="M13 13h2" />
        <path d="M13 17h2" />
    </svg>
)

const SettingsIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Settings</title>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
)

const QuitIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Quit</title>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
)

const OpenIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Open</title>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
)

const FolderIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Folder</title>
        <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
)

const UploadIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Upload</title>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
)

const DownloadIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Download</title>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
)

const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <title>Delete</title>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
)

// Helper to safely access desktopApi
const getDesktopApi = () => window.desktopApi

export function TrayPopover() {
    const [view, setView] = useState<'quick' | 'files'>('quick')
    const [searchQuery, setSearchQuery] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [folders, setFolders] = useState<FileFolder[]>([])
    const [selectedFolderId, setSelectedFolderId] = useState<string>(() => {
        try {
            return localStorage.getItem('tray:selectedFolderId') || 'inbox'
        } catch {
            return 'inbox'
        }
    })
    const [folderFiles, setFolderFiles] = useState<FileItem[]>([])
    const [allFiles, setAllFiles] = useState<FileItem[]>([])
    const [isImporting, setIsImporting] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [filesError, setFilesError] = useState<string | null>(null)
    const [sensitiveStatus, setSensitiveStatus] = useState<{ unlockedUntil: number; canBiometric: boolean; pinEnabled: boolean } | null>(null)
    const [user, setUser] = useState<{ email: string; avatarUrl: string | null; fullName: string | null } | null>(null)
    const [pin, setPin] = useState('')
    const [pinBusy, setPinBusy] = useState(false)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [viewer, setViewer] = useState<{ open: boolean; items: FileItem[]; index: number; zoom: number }>({ open: false, items: [], index: 0, zoom: 1 })
    const [spreadsheets, setSpreadsheets] = useState<SpreadsheetItem[]>([])
    const [citations, setCitations] = useState<CitationItem[]>([])
    const [pinnedCitationIds, setPinnedCitationIds] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem('tray:pinnedCitations')
            if (!raw) return []
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    })

    const fetchAllFiles = useCallback(async () => {
        const api = getDesktopApi()
        if (!api?.files) return
        try {
            const list = await api.files.listAllFiles()
            setAllFiles(list || [])
        } catch (error) {
            console.error('Failed to fetch all files:', error)
            setAllFiles([])
        }
    }, [])

    const fetchSpreadsheets = useCallback(async () => {
        const api = getDesktopApi()
        if (!api?.tray) return
        try {
            const list = await api.tray.getSpreadsheets()
            setSpreadsheets(list || [])
        } catch (error) {
            console.error('Failed to fetch spreadsheets:', error)
            setSpreadsheets([])
        }
    }, [])

    const fetchCitations = useCallback(async () => {
        const api = getDesktopApi()
        if (!api?.tray) return
        try {
            const list = await api.tray.getCitations()
            setCitations(list || [])
        } catch (error) {
            console.error('Failed to fetch citations:', error)
            setCitations([])
        }
    }, [])

    const fetchFolders = useCallback(async () => {
        const api = getDesktopApi()
        if (!api?.files) return
        const list = await api.files.listFolders()
        setFolders(list || [])
    }, [])

    const fetchFiles = useCallback(async (folderId: string) => {
        const api = getDesktopApi()
        if (!api?.files) return
        try {
            setFilesError(null)
            const list = await api.files.listFiles({ folderId })
            setFolderFiles(list || [])
        } catch (err: any) {
            setFolderFiles([])
            setFilesError(err?.message || 'Failed to load files')
        }
    }, [])

    const fetchSensitiveStatus = useCallback(async () => {
        const api = getDesktopApi()
        if (!api?.security) return
        const status = await api.security.getSensitiveStatus()
        setSensitiveStatus(status || null)
    }, [])

    const fetchUser = useCallback(async () => {
        const api = getDesktopApi()
        if (!api?.tray) return
        const u = await api.tray.getUser()
        setUser(u || null)
    }, [])

    const fetchQuickData = useCallback(async () => {
        setIsLoading(true)
        await Promise.all([
            fetchAllFiles(),
            fetchSpreadsheets(),
            fetchCitations()
        ])
        setIsLoading(false)
    }, [fetchAllFiles, fetchSpreadsheets, fetchCitations])

    useEffect(() => {
        fetchQuickData().catch(() => {})
        fetchFolders().catch(() => {})
        fetchSensitiveStatus().catch(() => {})
        fetchUser().catch(() => {})
        
        // Auto focus search input
        setTimeout(() => {
            searchInputRef.current?.focus()
        }, 100)
        
        const api = getDesktopApi()
        const cleanup = api?.tray?.onRefresh(() => {
            fetchQuickData().catch(() => {})
            fetchFolders().catch(() => {})
            fetchSensitiveStatus().catch(() => {})
            fetchUser().catch(() => {})
            fetchFiles(selectedFolderId).catch(() => {})
        })
        
        return () => {
            cleanup?.()
        }
    }, [fetchQuickData, fetchFolders, fetchFiles, fetchSensitiveStatus, fetchUser, selectedFolderId])

    useEffect(() => {
        try {
            localStorage.setItem('tray:selectedFolderId', selectedFolderId)
        } catch {}
        fetchFiles(selectedFolderId).catch(() => {})
    }, [selectedFolderId, fetchFiles])

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toLowerCase().includes('mac')
            const mod = isMac ? e.metaKey : e.ctrlKey

            if (mod && e.key === '1') {
                e.preventDefault()
                setView('quick')
            }
            if (mod && e.key === '2') {
                e.preventDefault()
                setView('files')
            }
            if (mod && (e.key === 'u' || e.key === 'U')) {
                e.preventDefault()
                const api = getDesktopApi()
                if (api?.files) {
                    setView('files')
                    setIsImporting(true)
                    api.files.pickAndImport({ folderId: selectedFolderId })
                        .finally(() => setIsImporting(false))
                }
            }
            if (mod && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault()
                searchInputRef.current?.focus()
            }

            if (viewer.open) {
                if (e.key === 'Escape') {
                    e.preventDefault()
                    setViewer({ open: false, items: [], index: 0, zoom: 1 })
                }
                if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    setViewer(v => ({ ...v, index: Math.max(0, v.index - 1), zoom: 1 }))
                }
                if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    setViewer(v => ({ ...v, index: Math.min(v.items.length - 1, v.index + 1), zoom: 1 }))
                }
                if (e.key === '+' || e.key === '=') {
                    e.preventDefault()
                    setViewer(v => ({ ...v, zoom: Math.min(6, v.zoom + 0.25) }))
                }
                if (e.key === '-' || e.key === '_') {
                    e.preventDefault()
                    setViewer(v => ({ ...v, zoom: Math.max(1, v.zoom - 0.25) }))
                }
                if (e.key === '0') {
                    e.preventDefault()
                    setViewer(v => ({ ...v, zoom: 1 }))
                }
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [selectedFolderId, viewer.open])

    const handleAction = (action: string, data?: Record<string, unknown>) => {
        const api = getDesktopApi()
        api?.tray?.action({ action, ...data })
    }

    const filteredFiles = useMemo(() => folderFiles.filter(f =>
        f.originalName.toLowerCase().includes(searchQuery.toLowerCase())
    ), [folderFiles, searchQuery])

    const imageFiles = useMemo(() => filteredFiles.filter(f => f.isImage), [filteredFiles])

    const filteredAllFiles = useMemo(() => allFiles.filter(f =>
        f.originalName.toLowerCase().includes(searchQuery.toLowerCase())
    ), [allFiles, searchQuery])

    const quickImageFiles = useMemo(() => filteredAllFiles.filter(f => f.isImage), [filteredAllFiles])

    const quickPdfFiles = useMemo(() => filteredAllFiles.filter(f =>
        f.ext.toLowerCase() === 'pdf' || f.mime === 'application/pdf'
    ), [filteredAllFiles])

    const filteredSpreadsheets = useMemo(() => spreadsheets.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    ), [spreadsheets, searchQuery])

    const filteredCitations = useMemo(() => citations.filter(c =>
        c.label.toLowerCase().includes(searchQuery.toLowerCase())
    ), [citations, searchQuery])

    const pinnedCitations = useMemo(() => {
        const pinned = new Set(pinnedCitationIds)
        return filteredCitations.filter(c => pinned.has(c.id))
    }, [filteredCitations, pinnedCitationIds])

    const recentCitations = useMemo(() => {
        const pinned = new Set(pinnedCitationIds)
        return filteredCitations.filter(c => !pinned.has(c.id))
    }, [filteredCitations, pinnedCitationIds])

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)
        const diffDays = Math.floor(diffMs / 86400000)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins}m`
        if (diffHours < 24) return `${diffHours}h`
        if (diffDays < 7) return `${diffDays}d`
        return date.toLocaleDateString()
    }

    const formatBytes = (bytes: number) => {
        if (!bytes || bytes < 0) return '0 B'
        const units = ['B', 'KB', 'MB', 'GB', 'TB']
        let value = bytes
        let idx = 0
        while (value >= 1024 && idx < units.length - 1) {
            value /= 1024
            idx += 1
        }
        const dp = idx === 0 ? 0 : idx === 1 ? 0 : 1
        return `${value.toFixed(dp)} ${units[idx]}`
    }

    const createFolder = async () => {
        const api = getDesktopApi()
        if (!api?.files) return
        const name = window.prompt('Folder name')
        if (!name) return
        const folder = await api.files.createFolder({ name })
        await fetchFolders()
        setSelectedFolderId(folder.id)
        setView('files')
    }

    const renameFolder = async () => {
        const api = getDesktopApi()
        if (!api?.files) return
        const current = folders.find(f => f.id === selectedFolderId)
        const name = window.prompt('Rename folder', current?.name || '')
        if (!name) return
        await api.files.renameFolder({ folderId: selectedFolderId, name })
        await fetchFolders()
    }

    const deleteFolder = async () => {
        const api = getDesktopApi()
        if (!api?.files) return
        const current = folders.find(f => f.id === selectedFolderId)
        if (!current) return
        const ok = window.confirm(`Delete folder "${current.name}" and all its files?`)
        if (!ok) return
        await api.files.deleteFolder({ folderId: selectedFolderId })
        await fetchFolders()
        setSelectedFolderId('inbox')
    }

    const pickAndImport = async () => {
        const api = getDesktopApi()
        if (!api?.files) return
        setIsImporting(true)
        try {
            await api.files.pickAndImport({ folderId: selectedFolderId })
            await fetchFiles(selectedFolderId)
            await fetchAllFiles()
        } finally {
            setIsImporting(false)
        }
    }

    const importDropped = async (paths: string[]) => {
        const api = getDesktopApi()
        if (!api?.files) return
        setIsImporting(true)
        try {
            await api.files.importPaths({ folderId: selectedFolderId, paths })
            await fetchFiles(selectedFolderId)
            await fetchAllFiles()
        } finally {
            setIsImporting(false)
        }
    }

    const unlockSensitive = async () => {
        const api = getDesktopApi()
        if (!api?.security) return
        const res = await api.security.unlockSensitive({ reason: 'Unlock sensitive files' })
        setSensitiveStatus(s => s ? { ...s, unlockedUntil: res.unlockedUntil } : { unlockedUntil: res.unlockedUntil, canBiometric: false, pinEnabled: false })
        if (res.success) {
            await fetchFiles(selectedFolderId)
        }
    }

    const unlockWithPin = async () => {
        const api = getDesktopApi()
        if (!api?.security) return
        setPinBusy(true)
        try {
            const res = await api.security.unlockWithPin({ pin })
            setSensitiveStatus(s => s ? { ...s, unlockedUntil: res.unlockedUntil } : { unlockedUntil: res.unlockedUntil, canBiometric: false, pinEnabled: true })
            if (res.success) {
                setPin('')
                await fetchFiles(selectedFolderId)
            } else {
                setFilesError(res.error || 'PIN unlock failed')
            }
        } finally {
            setPinBusy(false)
        }
    }

    const setNewPin = async () => {
        const api = getDesktopApi()
        if (!api?.security) return
        setPinBusy(true)
        try {
            const res = await api.security.setPin({ pin })
            if (res?.success) {
                setSensitiveStatus(s => s ? { ...s, pinEnabled: true } : { unlockedUntil: 0, canBiometric: false, pinEnabled: true })
                setFilesError(null)
            }
        } finally {
            setPinBusy(false)
        }
    }

    const openFile = async (fileId: string) => {
        const api = getDesktopApi()
        if (!api?.files) return
        try {
            await api.files.openFile({ fileId })
            await fetchFiles(selectedFolderId)
        } catch (err: any) {
            setFilesError(err?.message || 'Failed to open file')
        }
    }

    const deleteFile = async (fileId: string) => {
        const api = getDesktopApi()
        if (!api?.files) return
        try {
            await api.files.deleteFile({ fileId })
            setSelectedIds(ids => ids.filter(x => x !== fileId))
            await fetchFiles(selectedFolderId)
        } catch (err: any) {
            setFilesError(err?.message || 'Failed to delete file')
        }
    }

    const downloadFiles = async (fileIds: string[]) => {
        const api = getDesktopApi()
        if (!api?.files) return
        try {
            await api.files.exportFiles({ fileIds })
        } catch (err: any) {
            setFilesError(err?.message || 'Failed to download files')
        }
    }

    const openViewer = (items: FileItem[], startId: string) => {
        const index = Math.max(0, items.findIndex(f => f.id === startId))
        setViewer({ open: true, items, index, zoom: 1 })
    }

    const currentImage = useMemo(() => {
        if (!viewer.open) return null
        return viewer.items[viewer.index] || null
    }, [viewer])

    const togglePinCitation = (id: string) => {
        setPinnedCitationIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
    }

    useEffect(() => {
        try {
            localStorage.setItem('tray:pinnedCitations', JSON.stringify(pinnedCitationIds))
        } catch {}
    }, [pinnedCitationIds])

    const downloadSpreadsheet = async (item: SpreadsheetItem) => {
        const api = getDesktopApi()
        if (!api?.tray) return
        try {
            const data = await api.tray.getSpreadsheetData({ id: item.id })
            if (!data?.univerData) return
            const name = data.name || item.name || 'spreadsheet'
            await exportToExcel(data.univerData, `${name}.xlsx`)
        } catch (err) {
            console.error('Failed to export spreadsheet:', err)
        }
    }

    const toggleSelect = (fileId: string) => {
        setSelectedIds(ids => ids.includes(fileId) ? ids.filter(x => x !== fileId) : [...ids, fileId])
    }

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const paths: string[] = []
        for (const file of Array.from(e.dataTransfer.files)) {
            const anyFile = file as any
            if (anyFile?.path) paths.push(anyFile.path)
        }
        if (paths.length) {
            await importDropped(paths)
        }
    }

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    const onDragEnter = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    return (
        <div className="tray-popover" role="application" tabIndex={-1} onDrop={onDrop} onDragOver={onDragOver} onDragEnter={onDragEnter} onDragLeave={onDragLeave}>
            <div className="popover-arrow" />

            {isDragging && (
                <div className="drop-overlay">
                    <div className="drop-card">
                        <UploadIcon />
                        <div className="drop-title">Drop files to import</div>
                        <div className="drop-subtitle">{folders.find(f => f.id === selectedFolderId)?.name || 'Folder'}</div>
                    </div>
                </div>
            )}

            <div className="topbar">
                <div className="view-switch">
                    <button type="button" className={`switch-btn ${view === 'quick' ? 'active' : ''}`} onClick={() => setView('quick')}>Quick</button>
                    <button type="button" className={`switch-btn ${view === 'files' ? 'active' : ''}`} onClick={() => setView('files')}>Files</button>
                </div>
                <div className="topbar-right">
                    <div className="topbar-hints">Ctrl/⌘+1 · Ctrl/⌘+2</div>
                    <div className="user-avatar" title={user?.email || ''}>
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.fullName || user.email} />
                        ) : (
                            <div className="user-fallback">{(user?.email || 'U').slice(0, 1).toUpperCase()}</div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="search-container">
                <div className="search-input-wrapper">
                    <div className="search-icon">
                        <SearchIcon />
                    </div>
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="search-input"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {view === 'quick' ? (
                <>
                    <div className="actions-section">
                        <button
                            type="button"
                            className="action-button"
                            onClick={pickAndImport}
                        >
                            <UploadIcon />
                            <span>{isImporting ? 'Importing…' : 'Import Files'}</span>
                        </button>
                    </div>

                    <div className="separator" />

                    <div className="recent-section-wrapper">
                        <div className="recent-section">
                            {isLoading ? (
                                <div className="empty-state">Loading...</div>
                            ) : (
                                <>
                                    <div className="quick-section">
                                        <div className="section-label">Images</div>
                                        {quickImageFiles.length === 0 ? (
                                            <div className="empty-state">No images</div>
                                        ) : (
                                            <div className="gallery-grid">
                                                {quickImageFiles.slice(0, 30).map(img => (
                                                    <button key={img.id} type="button" className="gallery-tile" onClick={() => openViewer(quickImageFiles, img.id)}>
                                                        <img src={img.thumbnailUrl || img.url} alt={img.originalName} />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="quick-section">
                                        <div className="section-label">
                                            <span>PDFs</span>
                                            <button
                                                type="button"
                                                className="mini-btn"
                                                onClick={() => handleAction('open-local-pdf')}
                                                title="Open local PDF (view only)"
                                                style={{ marginLeft: 'auto' }}
                                            >
                                                <PdfIcon />
                                            </button>
                                        </div>
                                        {quickPdfFiles.length === 0 ? (
                                            <div className="empty-state">
                                                <button
                                                    type="button"
                                                    className="action-button small"
                                                    onClick={() => handleAction('open-local-pdf')}
                                                >
                                                    <PdfIcon />
                                                    <span>Open Local PDF</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="quick-list">
                                                {quickPdfFiles.slice(0, 8).map(file => (
                                                    <div key={file.id} className="quick-row">
                                                        <button type="button" className="quick-row-main" onClick={() => openFile(file.id)}>
                                                            <DocumentIcon />
                                                            <span className="quick-row-label">{file.originalName}</span>
                                                        </button>
                                                        <button type="button" className="mini-btn" onClick={() => downloadFiles([file.id])} title="Download">
                                                            <DownloadIcon />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="quick-section">
                                        <div className="section-label">Spreadsheets</div>
                                        {filteredSpreadsheets.length === 0 ? (
                                            <div className="empty-state">No spreadsheets</div>
                                        ) : (
                                            <div className="quick-list">
                                                {filteredSpreadsheets.slice(0, 8).map(item => (
                                                    <div key={item.id} className="quick-row">
                                                        <div className="quick-row-main static">
                                                            <SpreadsheetIcon />
                                                            <span className="quick-row-label">{item.name}</span>
                                                        </div>
                                                        <button type="button" className="mini-btn" onClick={() => downloadSpreadsheet(item)} title="Download">
                                                            <DownloadIcon />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="quick-section">
                                        <div className="section-label">Notes & Citations</div>
                                        <div className="quick-sub-label">Pinned</div>
                                        {pinnedCitations.length === 0 ? (
                                            <div className="empty-state">No pinned notes</div>
                                        ) : (
                                            <div className="quick-list">
                                                {pinnedCitations.slice(0, 8).map(citation => (
                                                    <div key={citation.id} className="quick-row">
                                                        <div className="quick-row-main static">
                                                            <span className="quick-row-label">{citation.label}</span>
                                                        </div>
                                                        <button type="button" className="mini-btn" onClick={() => togglePinCitation(citation.id)} title="Unpin">
                                                            ✓
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="quick-sub-label">Recent</div>
                                        {recentCitations.length === 0 ? (
                                            <div className="empty-state">No recent notes</div>
                                        ) : (
                                            <div className="quick-list">
                                                {recentCitations.slice(0, 8).map(citation => (
                                                    <div key={citation.id} className="quick-row">
                                                        <div className="quick-row-main static">
                                                            <span className="quick-row-label">{citation.label}</span>
                                                        </div>
                                                        <button type="button" className="mini-btn" onClick={() => togglePinCitation(citation.id)} title="Pin">
                                                            +
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className="files-toolbar">
                        <div className="folder-select">
                            <FolderIcon />
                            <select
                                value={selectedFolderId}
                                onChange={(e) => setSelectedFolderId(e.target.value)}
                                className="folder-select-input"
                            >
                                {folders.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}{f.isSensitive ? ' (Secure)' : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div className="files-toolbar-actions">
                            <button type="button" className="mini-btn" onClick={pickAndImport} title="Import (Ctrl/⌘+U)">
                                <UploadIcon />
                            </button>
                            <button type="button" className="mini-btn" onClick={createFolder} title="New folder">
                                +
                            </button>
                            <button type="button" className="mini-btn" onClick={renameFolder} title="Rename folder">
                                Rename
                            </button>
                            <button type="button" className="mini-btn danger" onClick={deleteFolder} title="Delete folder">
                                <TrashIcon />
                            </button>
                        </div>
                    </div>

                    <div className="separator" />

                    <div className="files-section-wrapper">
                        <div className="files-section">
                            <div className="section-label">
                                {searchQuery ? 'Files (filtered)' : 'Files'}
                            </div>
                            <div className="files-list">
                                {(() => {
                                    const current = folders.find(f => f.id === selectedFolderId)
                                    const isLocked = !!current?.isSensitive && (sensitiveStatus?.unlockedUntil ?? 0) < Date.now()
                                    if (isLocked) {
                                        const canBiometric = !!sensitiveStatus?.canBiometric
                                        const pinEnabled = !!sensitiveStatus?.pinEnabled
                                        return (
                                            <div className="locked-card">
                                                <div className="locked-title">Sensitive folder locked</div>
                                                <div className="locked-subtitle">
                                                    {canBiometric ? 'Unlock with Touch ID' : pinEnabled ? 'Unlock with PIN' : 'Set a PIN to protect this folder'}
                                                </div>
                                                {canBiometric ? (
                                                    <button type="button" className="batch-btn" onClick={unlockSensitive}>
                                                        Unlock
                                                    </button>
                                                ) : (
                                                    <div className="pin-row">
                                                        <input
                                                            className="pin-input"
                                                            type="password"
                                                            inputMode="numeric"
                                                            placeholder="PIN"
                                                            value={pin}
                                                            onChange={(e) => setPin(e.target.value)}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="batch-btn"
                                                            onClick={pinEnabled ? unlockWithPin : setNewPin}
                                                            disabled={pinBusy || pin.length < 4}
                                                        >
                                                            {pinEnabled ? (pinBusy ? 'Unlocking…' : 'Unlock') : (pinBusy ? 'Saving…' : 'Set PIN')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    }

                                    if (filesError) {
                                        return <div className="empty-state">{filesError}</div>
                                    }

                                    if (filteredFiles.length === 0) {
                                        return <div className="empty-state">No files</div>
                                    }

                                    return filteredFiles.map(file => (
                                        <div key={file.id} className={`file-row ${selectedIds.includes(file.id) ? 'selected' : ''}`}>
                                            <button type="button" className="file-main" onClick={() => file.isImage ? openViewer(imageFiles, file.id) : openFile(file.id)}>
                                                <div className="file-thumb">
                                                    {file.isImage ? (
                                                        <img src={file.thumbnailUrl || file.url} alt={file.originalName} />
                                                    ) : (
                                                        <div className="file-ext">{(file.ext || 'FILE').toUpperCase()}</div>
                                                    )}
                                                </div>
                                                <div className="file-meta">
                                                    <div className="file-name">{file.originalName}</div>
                                                    <div className="file-sub">{formatBytes(file.size)} · {formatDate(file.lastOpenedAt || file.createdAt)}</div>
                                                </div>
                                            </button>
                                            <div className="file-actions">
                                                <button type="button" className="mini-btn" onClick={() => toggleSelect(file.id)} title="Select">
                                                    {selectedIds.includes(file.id) ? '✓' : '○'}
                                                </button>
                                                <button type="button" className="mini-btn" onClick={() => downloadFiles([file.id])} title="Download">
                                                    <DownloadIcon />
                                                </button>
                                                <button type="button" className="mini-btn danger" onClick={() => deleteFile(file.id)} title="Delete">
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                })()}
                            </div>

                            {imageFiles.length > 0 && (
                                <>
                                    <div className="section-label">Gallery</div>
                                    <div className="gallery-grid">
                                        {imageFiles.slice(0, 30).map(img => (
                                            <button key={img.id} type="button" className="gallery-tile" onClick={() => openViewer(imageFiles, img.id)}>
                                                <img src={img.thumbnailUrl || img.url} alt={img.originalName} />
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {selectedIds.length > 0 && (
                        <div className="batch-bar">
                            <div className="batch-label">{selectedIds.length} selected</div>
                            <button type="button" className="batch-btn" onClick={() => downloadFiles(selectedIds)}>
                                <DownloadIcon />
                                <span>Download</span>
                            </button>
                            <button type="button" className="batch-btn danger" onClick={() => Promise.all(selectedIds.map(id => deleteFile(id))).then(() => setSelectedIds([]))}>
                                <TrashIcon />
                                <span>Delete</span>
                            </button>
                        </div>
                    )}
                </>
            )}

            <footer className="popover-footer">
                <div className="footer-main-actions">
                    <button 
                        type="button"
                        className="footer-btn"
                        onClick={() => handleAction('open-main')}
                    >
                        <OpenIcon />
                        <span>Open S-AGI</span>
                    </button>
                    <button 
                        type="button"
                        className="footer-btn"
                        onClick={() => handleAction('settings')}
                    >
                        <SettingsIcon />
                        <span>Settings</span>
                    </button>
                </div>
                <button 
                    type="button"
                    className="footer-btn quit"
                    onClick={() => handleAction('quit')}
                    title="Quit S-AGI"
                >
                    <QuitIcon />
                    <span>Quit</span>
                </button>
            </footer>

            {viewer.open && currentImage && (
                <div className="viewer-overlay">
                    <div className="viewer-card">
                        <div className="viewer-top">
                            <div className="viewer-title">{currentImage.originalName}</div>
                            <div className="viewer-actions">
                                <button type="button" className="mini-btn" onClick={() => downloadFiles([currentImage.id])} title="Download">
                                    <DownloadIcon />
                                </button>
                                <button type="button" className="mini-btn danger" onClick={() => deleteFile(currentImage.id)} title="Delete">
                                    <TrashIcon />
                                </button>
                                <button type="button" className="mini-btn" onClick={() => setViewer({ open: false, items: [], index: 0, zoom: 1 })} title="Close (Esc)">
                                    ✕
                                </button>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="viewer-body"
                            onDoubleClick={() => setViewer(v => ({ ...v, zoom: v.zoom === 1 ? 2 : v.zoom === 2 ? 3 : 1 }))}
                            onWheel={(e) => {
                                const isMac = navigator.platform.toLowerCase().includes('mac')
                                const mod = isMac ? e.metaKey : e.ctrlKey
                                if (!mod) return
                                e.preventDefault()
                                const delta = e.deltaY > 0 ? -0.15 : 0.15
                                setViewer(v => ({ ...v, zoom: Math.min(6, Math.max(1, v.zoom + delta)) }))
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setViewer(v => ({ ...v, zoom: v.zoom === 1 ? 2 : v.zoom === 2 ? 3 : 1 }))
                                }
                            }}
                        >
                            <img
                                className="viewer-image"
                                src={currentImage.url}
                                alt={currentImage.originalName}
                                style={{ transform: `scale(${viewer.zoom})` }}
                            />
                        </button>
                        <div className="viewer-bottom">
                            <button type="button" className="mini-btn" disabled={viewer.index <= 0} onClick={() => setViewer(v => ({ ...v, index: Math.max(0, v.index - 1), zoom: 1 }))}>
                                ←
                            </button>
                            <div className="viewer-counter">{viewer.index + 1} / {viewer.items.length} · {viewer.zoom.toFixed(2)}×</div>
                            <button type="button" className="mini-btn" disabled={viewer.index >= viewer.items.length - 1} onClick={() => setViewer(v => ({ ...v, index: Math.min(v.items.length - 1, v.index + 1), zoom: 1 }))}>
                                →
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
