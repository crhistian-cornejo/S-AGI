/**
 * Tool Helpers - Shared utilities for tool executors
 */

import { supabase } from '../../../supabase/client'
import { sendToRenderer } from '../../../window-manager'
import log from 'electron-log'

/**
 * Context passed to tools that need external API access
 */
export interface ToolContext {
    apiKey?: string
    provider?: 'openai' | 'anthropic' | 'zai' | 'chatgpt-plus'
    baseURL?: string
    headers?: Record<string, string>
}

/**
 * Notify renderer of artifact updates for live UI sync
 */
export function notifyArtifactUpdate(
    artifactId: string,
    univerData: unknown,
    type: 'spreadsheet' | 'document'
): void {
    sendToRenderer('artifact:update', { artifactId, univerData, type })
    log.info(`[Tools] Sent live update for ${type}: ${artifactId}`)
}

/**
 * Get artifact with ownership check (supports both direct and chat-based ownership)
 */
export async function getArtifactWithOwnership(
    artifactId: string,
    userId: string
): Promise<{
    id: string
    chat_id: string
    user_id: string
    type: string
    name: string
    content: unknown
    univer_data: any
    created_at: string
    updated_at: string
    chats?: { user_id: string } | { user_id: string }[]
}> {
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) {
        throw new Error('Artifact not found')
    }

    // Check ownership: direct user_id OR via chat
    const hasDirectOwnership = artifact.user_id === userId
    const chatData = Array.isArray(artifact.chats) ? artifact.chats[0] : artifact.chats
    const hasChatOwnership = chatData?.user_id === userId

    if (!hasDirectOwnership && !hasChatOwnership) {
        throw new Error('Access denied')
    }

    return artifact
}

/**
 * Create Univer workbook data structure
 */
export function createUniverWorkbook(
    name: string,
    columns: string[],
    rows: unknown[][] = []
): {
    id: string
    name: string
    sheetOrder: string[]
    sheets: Record<string, {
        id: string
        name: string
        rowCount: number
        columnCount: number
        cellData: Record<number, Record<number, { v: unknown; s?: unknown }>>
        tabColor: string
        defaultColumnWidth: number
        defaultRowHeight: number
    }>
} {
    const sheetId = 'sheet1'
    const cellData: Record<number, Record<number, { v: unknown; s?: unknown }>> = {}

    // Add column headers (row 0) with styling
    columns.forEach((col, colIndex) => {
        cellData[0] = cellData[0] || {}
        cellData[0][colIndex] = {
            v: col,
            s: {
                bl: 1, // Bold
                bg: { rgb: '#f3f4f6' },
            }
        }
    })

    // Add row data
    rows.forEach((row, rowIndex) => {
        cellData[rowIndex + 1] = cellData[rowIndex + 1] || {}
        if (Array.isArray(row)) {
            row.forEach((cellValue, colIndex) => {
                cellData[rowIndex + 1][colIndex] = { v: cellValue }
            })
        }
    })

    return {
        id: crypto.randomUUID(),
        name,
        sheetOrder: [sheetId],
        sheets: {
            [sheetId]: {
                id: sheetId,
                name: 'Sheet1',
                rowCount: Math.max(100, rows.length + 10),
                columnCount: Math.max(26, columns.length + 2),
                cellData,
                tabColor: '',
                defaultColumnWidth: 100,
                defaultRowHeight: 24,
            }
        },
    }
}

/**
 * Parse cell reference (e.g., "A1" -> { row: 0, col: 0 })
 */
export function parseCellReference(cell: string): { row: number; col: number } {
    const colMatch = cell.match(/[A-Z]+/i)
    const rowMatch = cell.match(/\d+/)

    if (!colMatch || !rowMatch) {
        throw new Error(`Invalid cell reference: ${cell}`)
    }

    const col = colMatch[0].toUpperCase().split('').reduce((acc, char) =>
        acc * 26 + (char.charCodeAt(0) - 64), 0) - 1
    const row = parseInt(rowMatch[0]) - 1

    return { row, col }
}

/**
 * Create Univer document data structure (for Word-like documents)
 */
export function createUniverDocument(
    title: string,
    content: string = ''
): Record<string, unknown> {
    // Convert plain text content to Univer document format
    const lines = content ? content.split('\n') : ['']
    let dataStream = ''
    const paragraphs: Array<{ startIndex: number; paragraphStyle?: Record<string, unknown> }> = []

    let currentIndex = 0
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        paragraphs.push({
            startIndex: currentIndex,
            paragraphStyle: {}
        })
        dataStream += line + '\r\n'
        currentIndex += line.length + 2 // +2 for \r\n
    }

    return {
        id: crypto.randomUUID(),
        title,
        body: {
            dataStream,
            textRuns: [],
            paragraphs
        },
        documentStyle: {
            pageSize: {
                width: 816, // 8.5 inches * 96 DPI
                height: 1056 // 11 inches * 96 DPI
            },
            marginTop: 72,
            marginBottom: 72,
            marginLeft: 90,
            marginRight: 90
        }
    }
}

/**
 * Convert horizontal alignment string to Univer format
 */
export function getHorizontalAlign(align: string): number {
    switch (align) {
        case 'left': return 1
        case 'center': return 2
        case 'right': return 3
        default: return 1
    }
}

/**
 * Convert vertical alignment string to Univer format
 */
export function getVerticalAlign(align: string): number {
    switch (align) {
        case 'top': return 1
        case 'middle': return 2
        case 'bottom': return 3
        default: return 2
    }
}

/**
 * Convert border style string to Univer format
 */
export function getBorderStyle(style: string): number {
    switch (style) {
        case 'thin': return 1
        case 'medium': return 2
        case 'thick': return 3
        case 'dashed': return 4
        case 'dotted': return 5
        default: return 1
    }
}

/**
 * Column number to letter (0 -> A, 25 -> Z, 26 -> AA)
 */
export function columnToLetter(col: number): string {
    let letter = ''
    let temp = col + 1
    while (temp > 0) {
        const mod = (temp - 1) % 26
        letter = String.fromCharCode(65 + mod) + letter
        temp = Math.floor((temp - mod) / 26)
    }
    return letter
}

/**
 * Re-export supabase for executor access
 */
export { supabase }
