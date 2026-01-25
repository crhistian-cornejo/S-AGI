/**
 * Queue utilities for managing message queue in chat
 * Adapted from 1code's agent queue implementation
 */

export interface QueuedImage {
  id: string
  base64Data: string
  mediaType: string
  filename: string
}

export interface QueuedDocument {
  id: string
  file: File
}

export interface QueuedTargetDocument {
  id: string
  filename: string
}

export type ChatQueueItem = {
  id: string
  chatId: string
  message: string
  images?: QueuedImage[]
  documents?: QueuedDocument[]
  targetDocument?: QueuedTargetDocument | null
  generateImage?: boolean
  imageSize?: string
  timestamp: Date
  status: 'pending' | 'processing'
}

export function generateQueueId(): string {
  return `queue_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

export function createQueueItem(
  id: string,
  chatId: string,
  message: string,
  options?: {
    images?: QueuedImage[]
    documents?: QueuedDocument[]
    targetDocument?: QueuedTargetDocument | null
    generateImage?: boolean
    imageSize?: string
  }
): ChatQueueItem {
  return {
    id,
    chatId,
    message,
    images: options?.images && options.images.length > 0 ? options.images : undefined,
    documents: options?.documents && options.documents.length > 0 ? options.documents : undefined,
    targetDocument: options?.targetDocument,
    generateImage: options?.generateImage,
    imageSize: options?.imageSize,
    timestamp: new Date(),
    status: 'pending',
  }
}

export function getNextQueueItem(
  queue: ChatQueueItem[]
): ChatQueueItem | null {
  return queue.find((item) => item.status === 'pending') || null
}

export function removeQueueItem(
  queue: ChatQueueItem[],
  itemId: string
): ChatQueueItem[] {
  return queue.filter((item) => item.id !== itemId)
}

export function updateQueueItemStatus(
  queue: ChatQueueItem[],
  itemId: string,
  status: ChatQueueItem['status']
): ChatQueueItem[] {
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
