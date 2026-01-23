import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { CitationData } from '@/components/inline-citation'

/**
 * PDF Tab State Management
 *
 * These atoms manage the state for the PDF tab, which serves as a unified hub
 * for viewing PDFs from artifacts, knowledge documents (chat_files), and citations.
 */

// === PDF SOURCE TYPES ===

export interface PdfSource {
    /** Source type: artifact, chat_file, local (session-only), or external URL */
    type: 'artifact' | 'chat_file' | 'local' | 'external'
    /** Source ID (artifact.id, chat_file.id, or local path) */
    id: string
    /** Display name */
    name: string
    /** URL to the PDF (storage URL, file:// URL, or external) */
    url: string
    /** Associated chat ID (for chat_files) */
    chatId?: string
    /** Number of pages */
    pageCount?: number
    /** Extracted page content (for chat_files with processing_status = 'completed') */
    pages?: Array<{
        pageNumber: number
        content: string
        wordCount: number
    }>
    /** Additional metadata */
    metadata?: {
        title?: string
        author?: string
        createdAt?: string
        fileSize?: number
        /** Local file path (for local PDFs) */
        localPath?: string
    }
}

// === PDF CHAT (AI Q&A) ===

export interface PdfChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    citations?: CitationData[]
    createdAt: Date
    /** If this was a quick action (summarize, explain, etc.) */
    action?: 'summarize' | 'explain' | 'key_points' | 'custom'
}

// === NAVIGATION REQUEST (from citation clicks) ===

export interface PdfNavigationRequest {
    /** Filename to find and open */
    filename: string
    /** Page to navigate to */
    pageNumber: number | null
    /** Text to highlight (if available) */
    highlightText?: string
    /** Chat ID to help locate the file */
    chatId?: string
    /** Source type hint */
    sourceType?: 'artifact' | 'chat_file'
}

// === PDF TAB ATOMS ===

/**
 * Currently selected PDF in the PDF tab
 * When null, shows empty state / document list
 */
export const selectedPdfAtom = atom<PdfSource | null>(null)

/**
 * Current page number (1-indexed)
 * Persisted to localStorage for session continuity
 */
export const pdfCurrentPageAtom = atomWithStorage('pdf-current-page', 1)

/**
 * Zoom level (0.5 to 3.0, default 1.0)
 * Persisted to localStorage
 */
export const pdfZoomLevelAtom = atomWithStorage('pdf-zoom-level', 1.0)

/**
 * Navigation request from citation clicks
 * When set, PdfTabView will:
 * 1. Find the matching PDF from the list
 * 2. Set it as selectedPdf
 * 3. Navigate to the specified page
 * 4. Clear this atom
 */
export const pdfNavigationRequestAtom = atom<PdfNavigationRequest | null>(null)

/**
 * Whether the document list sidebar is open
 * Persisted to localStorage
 */
export const pdfSidebarOpenAtom = atomWithStorage('pdf-sidebar-open', true)

/**
 * PDF-specific chat messages (mini chat panel for Q&A)
 * Cleared when switching PDFs
 */
export const pdfChatMessagesAtom = atom<PdfChatMessage[]>([])

/**
 * Whether AI is currently processing a PDF query
 */
export const pdfChatStreamingAtom = atom(false)

/**
 * Whether the AI chat panel is open
 * Persisted to localStorage
 */
export const pdfChatPanelOpenAtom = atomWithStorage('pdf-chat-panel-open', false)

/**
 * Text currently selected in the PDF viewer
 * Used to populate AI chat input
 */
export const pdfSelectedTextAtom = atom<{
    text: string
    pageNumber: number
    /** Selection rect for bookmark creation */
    rect?: { x: number; y: number; width: number; height: number }
} | null>(null)

// === PDF BOOKMARKS ===

export interface PdfBookmark {
    /** Unique ID */
    id: string
    /** Display title */
    title: string
    /** Page index (0-based) */
    pageIndex: number
    /** Position on page (in PDF coordinates) */
    position?: { x: number; y: number; zoom?: number }
    /** Highlighted text (if created from selection) */
    highlightText?: string
    /** Highlight rect (for visual indicator) */
    highlightRect?: { x: number; y: number; width: number; height: number }
    /** Color for the bookmark marker */
    color?: string
    /** Child bookmarks (for PDF outline structure) */
    children?: PdfBookmark[]
    /** Whether this is from the PDF's native outline or user-created */
    source: 'pdf' | 'user'
    /** Created timestamp */
    createdAt?: string
    /** Notes/description */
    notes?: string
}

/**
 * PDF outline (native bookmarks from the PDF file)
 * Loaded from the PDF engine
 */
export const pdfOutlineAtom = atom<PdfBookmark[]>([])

/**
 * User-created bookmarks for the current PDF
 * These are saved to the database
 */
export const pdfUserBookmarksAtom = atom<PdfBookmark[]>([])

/**
 * Combined bookmarks (outline + user bookmarks)
 */
export const pdfAllBookmarksAtom = atom((get) => {
    const outline = get(pdfOutlineAtom)
    const userBookmarks = get(pdfUserBookmarksAtom)
    return { outline, userBookmarks }
})

/**
 * Bookmark navigation request
 * When set, the viewer will navigate to this bookmark
 */
export const pdfBookmarkNavigationAtom = atom<{
    bookmarkId: string
    pageIndex: number
    position?: { x: number; y: number; zoom?: number }
    highlightRect?: { x: number; y: number; width: number; height: number }
} | null>(null)

// === PDF SEARCH ===

export interface PdfSearchResult {
    /** Page index (0-based) */
    pageIndex: number
    /** Character index within the page */
    charIndex: number
    /** Number of characters matched */
    charCount: number
    /** Highlight rects for the match */
    rects: Array<{ x: number; y: number; width: number; height: number }>
    /** Text context around the match */
    context?: { before: string; match: string; after: string }
}

/**
 * Current search query
 */
export const pdfSearchQueryAtom = atom('')

/**
 * Search results
 */
export const pdfSearchResultsAtom = atom<PdfSearchResult[]>([])

/**
 * Currently focused search result index
 */
export const pdfSearchCurrentIndexAtom = atom(0)

/**
 * Whether search is in progress
 */
export const pdfSearchLoadingAtom = atom(false)

/**
 * Search panel open state
 */
export const pdfSearchPanelOpenAtom = atom(false)

/**
 * Local PDFs loaded from filesystem (persisted across sessions)
 * These are for viewing only - no processing, no AI, no vector stores
 * The actual PDF data is loaded on-demand via IPC
 */
export const localPdfsAtom = atomWithStorage<PdfSource[]>('local-pdfs', [])

/**
 * Add a local PDF to the session list
 */
export const addLocalPdfAtom = atom(
    null,
    (get, set, pdf: PdfSource) => {
        const current = get(localPdfsAtom)
        // Avoid duplicates by path
        if (!current.some(p => p.metadata?.localPath === pdf.metadata?.localPath)) {
            set(localPdfsAtom, [...current, pdf])
        }
    }
)

/**
 * Remove a local PDF from the session list
 */
export const removeLocalPdfAtom = atom(
    null,
    (get, set, pdfId: string) => {
        const current = get(localPdfsAtom)
        set(localPdfsAtom, current.filter(p => p.id !== pdfId))
    }
)

/**
 * Clear all local PDFs
 */
export const clearLocalPdfsAtom = atom(
    null,
    (_get, set) => {
        set(localPdfsAtom, [])
    }
)

/**
 * Cache for local PDF blob URLs (in-memory only, not persisted)
 * Maps localPath -> blob URL
 * This allows us to reuse already-loaded PDF data without re-reading from disk
 */
export const localPdfBlobCacheAtom = atom<Record<string, string>>({})

/**
 * Get cached blob URL for a local PDF
 */
export const getLocalPdfBlobAtom = atom(
    (get) => (localPath: string) => get(localPdfBlobCacheAtom)[localPath] ?? null
)

/**
 * Set cached blob URL for a local PDF
 */
export const setLocalPdfBlobAtom = atom(
    null,
    (get, set, { localPath, blobUrl }: { localPath: string; blobUrl: string }) => {
        const cache = get(localPdfBlobCacheAtom)
        set(localPdfBlobCacheAtom, { ...cache, [localPath]: blobUrl })
    }
)

// === DERIVED ATOMS ===

/**
 * Check if the current PDF has extracted content (for AI features)
 */
export const pdfHasExtractedContentAtom = atom((get) => {
    const pdf = get(selectedPdfAtom)
    if (!pdf) return false
    return pdf.type === 'chat_file' && pdf.pages && pdf.pages.length > 0
})

/**
 * Get total word count from extracted pages
 */
export const pdfTotalWordCountAtom = atom((get) => {
    const pdf = get(selectedPdfAtom)
    if (!pdf?.pages) return 0
    return pdf.pages.reduce((sum, page) => sum + (page.wordCount || 0), 0)
})

// === HELPER FUNCTIONS ===

/**
 * Create a PdfSource from an artifact
 */
export function createPdfSourceFromArtifact(artifact: {
    id: string
    name: string
    pdf_url?: string
    pdf_page_count?: number
    created_at?: string
}): PdfSource | null {
    if (!artifact.pdf_url) return null
    return {
        type: 'artifact',
        id: artifact.id,
        name: artifact.name,
        url: artifact.pdf_url,
        pageCount: artifact.pdf_page_count,
        metadata: {
            createdAt: artifact.created_at
        }
    }
}

/**
 * Create a PdfSource from a chat_file
 */
export function createPdfSourceFromChatFile(chatFile: {
    id: string
    filename: string
    storage_path: string
    chat_id: string
    file_size?: number
    pages?: Array<{ pageNumber: number; content: string; wordCount: number }>
    metadata?: Record<string, unknown>
}, signedUrl: string): PdfSource {
    return {
        type: 'chat_file',
        id: chatFile.id,
        name: chatFile.filename,
        url: signedUrl,
        chatId: chatFile.chat_id,
        pageCount: chatFile.pages?.length,
        pages: chatFile.pages,
        metadata: {
            title: chatFile.metadata?.title as string | undefined,
            fileSize: chatFile.file_size,
        }
    }
}

/**
 * Create a PdfSource from a local file path
 * For session-only viewing (no upload, no AI processing)
 */
export function createPdfSourceFromLocalFile(file: {
    path: string
    name: string
    size?: number
}): PdfSource {
    // Create a unique ID from the path (safely handle non-Latin1 characters)
    const pathHash = btoa(encodeURIComponent(file.path).replace(/%([0-9A-F]{2})/g, (_, p1) => 
        String.fromCharCode(parseInt(p1, 16))
    )).slice(0, 16)
    const id = `local-${pathHash}-${Date.now()}`

    return {
        type: 'local',
        id,
        name: file.name,
        // Use file:// protocol for local files in Electron
        url: `file://${file.path}`,
        metadata: {
            localPath: file.path,
            fileSize: file.size,
            createdAt: new Date().toISOString()
        }
    }
}
