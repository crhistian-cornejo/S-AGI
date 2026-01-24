/**
 * Queue utilities for managing PDF chat message queue
 * Adapted from 1code's agent queue implementation
 */

// Text context selected from PDF viewer
export interface PdfSelectedText {
    text: string
    pageNumber: number
}

// Queued message item for PDF chat
export type PdfQueueItem = {
    id: string
    pdfId: string
    query: string
    selectedText?: PdfSelectedText
    currentPage?: number
    timestamp: Date
    status: 'pending' | 'processing'
}

export function generateQueueId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

export function createQueueItem(
    id: string,
    pdfId: string,
    query: string,
    selectedText?: PdfSelectedText,
    currentPage?: number
): PdfQueueItem {
    return {
        id,
        pdfId,
        query,
        selectedText,
        currentPage,
        timestamp: new Date(),
        status: 'pending',
    }
}

export function getNextQueueItem(
    queue: PdfQueueItem[]
): PdfQueueItem | null {
    return queue.find((item) => item.status === 'pending') || null
}

export function removeQueueItem(
    queue: PdfQueueItem[],
    itemId: string
): PdfQueueItem[] {
    return queue.filter((item) => item.id !== itemId)
}

export function updateQueueItemStatus(
    queue: PdfQueueItem[],
    itemId: string,
    status: PdfQueueItem['status']
): PdfQueueItem[] {
    return queue.map((item) =>
        item.id === itemId ? { ...item, status } : item
    )
}

// Helper to create a truncated preview from text
export function createTextPreview(text: string, maxLength: number = 50): string {
    const trimmed = text.trim().replace(/\s+/g, ' ')
    if (trimmed.length <= maxLength) return trimmed
    return trimmed.slice(0, maxLength) + '...'
}
