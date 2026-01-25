/**
 * MCP Tools Server - Universal MCP tools for any provider
 *
 * Converts ALL tools from tools.ts to MCP format so they can be used
 * by any MCP-compatible provider (Claude SDK, OpenAI, Anthropic, etc.)
 *
 * This module provides:
 * 1. createUniversalMcpTools() - ALL tools from ALL_TOOLS (~60+ tools):
 *    - Spreadsheet tools (40+): create, update, format, sort, filter, etc.
 *    - Document tools (13+): create, insert, format, headings, lists, tables, etc.
 *    - Image tools (2): generate_image, edit_image
 *    - Chart tools (1): generate_chart
 *    - UI Navigation tools (3): navigate_to_tab, select_artifact, get_ui_context
 *
 * 2. Context-specific tools (for Agent Panel with context):
 *    - createExcelMcpTools() - Excel shortcuts with context
 *    - createPdfMcpTools() - PDF search/read operations
 *    - createDocsMcpTools() - Document shortcuts with context
 *
 * 3. createAllMcpTools() - Combines universal + context-specific tools
 *
 * USAGE:
 * - For universal access (any provider): use createUniversalMcpTools(chatId, userId, toolContext?)
 * - For Agent Panel with context: use createExcelMcpTools(context) / createPdfMcpTools(context) / etc.
 * - For everything: use createAllMcpTools(chatId, userId, toolContext?, excelContext?, pdfContext?, docsContext?)
 *
 * IMPORTANT: All tools follow the same pattern as tools.ts:
 * 1. Validate context (artifactId, userId, chatId)
 * 2. Get artifact from database with ownership check
 * 3. Update database
 * 4. Notify renderer with artifact:update event
 *
 * @see https://modelcontextprotocol.io/
 */

import { z } from 'zod'
import log from 'electron-log'
import { sendToRenderer } from '../window-manager'
import { supabase } from '../supabase/client'
import type { ExcelContext, PDFContext, DocsContext } from '../agents/types'
import { executeTool, ALL_TOOLS, type ToolContext } from '../trpc/routers/tools'

/**
 * MCP Tool Definition compatible with Claude SDK
 */
interface McpToolDefinition<T extends z.ZodRawShape = z.ZodRawShape> {
    name: string
    description: string
    inputSchema: z.ZodObject<T>
    handler: (args: z.infer<z.ZodObject<T>>, extra: unknown) => Promise<McpToolResult>
}

/**
 * MCP Tool Result format
 */
interface McpToolResult {
    content: Array<{ type: 'text'; text: string }>
    isError?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function asChatIdOrNull(v: string | undefined): string | null {
    if (!v) return null
    return UUID_RE.test(v) ? v : null
}

/**
 * Helper: Notify renderer of artifact updates for live UI sync
 */
function notifyArtifactUpdate(artifactId: string, univerData: Record<string, unknown>, type: 'spreadsheet' | 'document') {
    sendToRenderer('artifact:update', { artifactId, univerData, type })
    log.info(`[MCP Tools] Sent live update for ${type}: ${artifactId}`)
}

/**
 * Helper: Get artifact with ownership check (supports both direct and chat-based ownership)
 */
async function getArtifactWithOwnership(artifactId: string, userId: string) {
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
 * Helper: Parse cell reference (e.g., "A1" -> { row: 0, col: 0 })
 */
function parseCellReference(cell: string): { row: number; col: number } {
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
 * Helper: Parse range (e.g., "A1:B5" -> { start: {row: 0, col: 0}, end: {row: 4, col: 1} })
 */
function parseRange(range: string): { start: { row: number; col: number }; end: { row: number; col: number } } {
    const [startCell, endCell] = range.split(':')
    const start = parseCellReference(startCell)
    const end = endCell ? parseCellReference(endCell) : start
    return { start, end }
}

/**
 * Helper: Get horizontal alignment code for Univer
 */
function getHorizontalAlign(align: 'left' | 'center' | 'right'): number {
    switch (align) {
        case 'left': return 1
        case 'center': return 2
        case 'right': return 3
        default: return 1
    }
}

/**
 * Helper: Get vertical alignment code for Univer
 */
function getVerticalAlign(align: 'top' | 'middle' | 'bottom'): number {
    switch (align) {
        case 'top': return 1
        case 'middle': return 2
        case 'bottom': return 3
        default: return 2
    }
}

/**
 * Helper: Get border style code for Univer
 */
function getBorderStyle(style: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted'): number {
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
 * Create MCP-compatible Excel tools
 */
export function createExcelMcpTools(context: ExcelContext): McpToolDefinition[] {
    return [
        {
            name: 'create_spreadsheet',
            description: 'Crea una nueva hoja de calculo con datos iniciales. Usalo para crear tablas, reportes o analisis.',
            inputSchema: z.object({
                title: z.string().describe('Titulo de la hoja de calculo'),
                headers: z.array(z.string()).describe('Encabezados de las columnas'),
                data: z.array(z.array(z.union([z.string(), z.number(), z.null()])))
                    .optional()
                    .describe('Filas de datos (array de arrays)'),
                columnWidths: z.array(z.number())
                    .optional()
                    .describe('Anchos de columna en pixeles')
            }),
            handler: async (rawArgs) => {
                try {
                    // Debug: Log raw args to understand SDK format
                    log.info('[MCP ExcelTool] Raw args received:', JSON.stringify(rawArgs, null, 2))

                    // Claude SDK may pass args in different formats:
                    // 1. Direct object: { title, headers, data, columnWidths }
                    // 2. Wrapped: { input: { title, headers, data, columnWidths } }
                    // 3. String JSON: '{"title": "...", "headers": [...]}'
                    let args: { title?: string; headers?: string[]; data?: Array<Array<string | number | null>>; columnWidths?: number[] }

                    if (typeof rawArgs === 'string') {
                        try {
                            args = JSON.parse(rawArgs)
                        } catch {
                            args = { title: rawArgs }
                        }
                    } else if (rawArgs && typeof rawArgs === 'object') {
                        // Check if args are wrapped in an 'input' property
                        const objArgs = rawArgs as Record<string, unknown>
                        if ('input' in objArgs && typeof objArgs.input === 'object') {
                            args = objArgs.input as typeof args
                        } else {
                            args = rawArgs as typeof args
                        }
                    } else {
                        args = {}
                    }

                    const { title, headers, data, columnWidths } = args

                    log.info('[MCP ExcelTool] Parsed args:', { title, headersCount: headers?.length, dataRowCount: data?.length })

                    if (!context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    // chat_id optional for agent panel (sessionId is not a UUID); use null when invalid
                    const chatId = asChatIdOrNull(context.chatId)

                    // Validate required fields
                    if (!title || !headers || !Array.isArray(headers)) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: `Datos inválidos. title: ${title}, headers: ${JSON.stringify(headers)}`
                                })
                            }],
                            isError: true
                        }
                    }

                    log.info(`[MCP ExcelTool] Creating spreadsheet: ${title}`)

                    // Build cell data (using number keys for rows/columns as Univer expects)
                    const cellData: Record<number, Record<number, { v: string | number; s?: unknown }>> = {}

                    // Add headers (row 0)
                    headers.forEach((header: string, col: number) => {
                        if (!cellData[0]) cellData[0] = {}
                        cellData[0][col] = {
                            v: header,
                            s: { bl: 1, bg: { rgb: '#f3f4f6' } } // Bold + gray background
                        }
                    })

                    // Add data rows
                    if (data) {
                        data.forEach((row: Array<string | number | null>, rowIndex: number) => {
                            const rowNum = rowIndex + 1
                            if (!cellData[rowNum]) cellData[rowNum] = {}
                            row.forEach((cell: string | number | null, col: number) => {
                                if (cell !== null && cell !== undefined) {
                                    cellData[rowNum][col] = { v: cell }
                                }
                            })
                        })
                    }

                    // Build workbook structure matching Univer format
                    const sheetId = 'sheet1'
                    const workbookData = {
                        id: crypto.randomUUID(),
                        name: title,
                        sheetOrder: [sheetId],
                        sheets: {
                            [sheetId]: {
                                id: sheetId,
                                name: 'Sheet1',
                                rowCount: Math.max(100, (data?.length || 0) + 10),
                                columnCount: Math.max(26, headers.length + 5),
                                cellData,
                                defaultColumnWidth: 100,
                                defaultRowHeight: 24,
                                columnData: columnWidths
                                    ? Object.fromEntries(columnWidths.map((w: number, i: number) => [String(i), { w }]))
                                    : undefined
                            }
                        }
                    }

                    // Save to database (chat_id null when agent panel uses sessionId like 'excel-default')
                    const { data: artifact, error } = await supabase
                        .from('artifacts')
                        .insert({
                            chat_id: chatId,
                            user_id: context.userId,
                            type: 'spreadsheet',
                            name: title,
                            content: { columnCount: headers.length, rowCount: (data?.length || 0) + 1 },
                            univer_data: workbookData
                        })
                        .select()
                        .single()

                    if (error) {
                        throw new Error(`Failed to create spreadsheet: ${error.message}`)
                    }

                    log.info(`[MCP ExcelTool] Created spreadsheet artifact: ${artifact.id}`)

                    // Notify renderer
                    sendToRenderer('artifact:created', {
                        type: 'spreadsheet',
                        id: artifact.id,
                        name: title,
                        artifactId: artifact.id
                    })

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                artifactId: artifact.id,
                                title,
                                rowCount: (data?.length || 0) + 1,
                                columnCount: headers.length,
                                message: `Hoja de calculo "${title}" creada con ${headers.length} columnas y ${(data?.length || 0) + 1} filas.`
                            })
                        }]
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    log.error(`[MCP ExcelTool] Error creating spreadsheet:`, message)
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'update_cells',
            description: 'Actualiza celdas especificas en la hoja de calculo activa.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                updates: z.array(z.object({
                    cell: z.string().describe('Referencia de celda (ej: A1, B2)'),
                    value: z.union([z.string(), z.number()]).describe('Nuevo valor'),
                    formula: z.string().optional().describe('Formula (ej: =SUM(A1:A10))')
                })).describe('Lista de actualizaciones de celdas')
            }),
            handler: async (rawArgs) => {
                try {
                    // Parse args with same pattern as create_spreadsheet
                    let args: { updates?: Array<{ cell: string; value: string | number; formula?: string }>; artifactId?: string }
                    if (typeof rawArgs === 'string') {
                        args = JSON.parse(rawArgs)
                    } else if (rawArgs && typeof rawArgs === 'object') {
                        const objArgs = rawArgs as Record<string, unknown>
                        args = ('input' in objArgs && typeof objArgs.input === 'object')
                            ? objArgs.input as typeof args
                            : rawArgs as typeof args
                    } else {
                        args = {}
                    }

                    const { updates, artifactId: providedArtifactId } = args
                    const targetId = providedArtifactId || context.artifactId

                    if (!targetId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de calculo activa. Proporciona artifactId o abre una hoja primero.'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!updates || !Array.isArray(updates)) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Datos inválidos: updates debe ser un array'
                                })
                            }],
                            isError: true
                        }
                    }

                    log.info(`[MCP ExcelTool] Updating ${updates.length} cells in ${targetId}`)

                    // Get artifact with ownership check
                    const artifact = await getArtifactWithOwnership(targetId, context.userId)

                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos de hoja de calculo'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]

                    // Convert cell references to row/column and update
                    for (const update of updates) {
                        const { row, col } = parseCellReference(update.cell)
                        if (!sheet.cellData[row]) sheet.cellData[row] = {}
                        sheet.cellData[row][col] = {
                            v: update.formula || update.value
                        }
                    }

                    // Update database
                    const { error: updateError } = await supabase
                        .from('artifacts')
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to update cells: ${updateError.message}`)
                    }

                    // Notify renderer for live UI update
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet')

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                updatedCells: updates.length,
                                message: `${updates.length} celda(s) actualizada(s).`
                            })
                        }]
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    log.error(`[MCP ExcelTool] Error updating cells:`, message)
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'format_cells',
            description: 'Aplica formato a un rango de celdas.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de celdas (ej: A1:D10)'),
                format: z.object({
                    bold: z.boolean().optional(),
                    italic: z.boolean().optional(),
                    backgroundColor: z.string().optional().describe('Color hex (ej: #FFFF00)'),
                    textColor: z.string().optional().describe('Color hex (ej: #000000)'),
                    fontSize: z.number().optional(),
                    horizontalAlign: z.enum(['left', 'center', 'right']).optional(),
                    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
                    textWrap: z.boolean().optional(),
                    numberFormat: z.string().optional().describe('Formato numerico (ej: #,##0.00)'),
                    border: z.object({
                        style: z.enum(['thin', 'medium', 'thick', 'dashed', 'dotted']).optional(),
                        color: z.string().optional(),
                        sides: z.array(z.enum(['top', 'bottom', 'left', 'right', 'all'])).optional()
                    }).optional()
                }).describe('Opciones de formato')
            }),
            handler: async (rawArgs) => {
                try {
                    // Parse args with robust pattern
                    type FormatOptions = {
                        bold?: boolean
                        italic?: boolean
                        backgroundColor?: string
                        textColor?: string
                        fontSize?: number
                        horizontalAlign?: 'left' | 'center' | 'right'
                        verticalAlign?: 'top' | 'middle' | 'bottom'
                        textWrap?: boolean
                        numberFormat?: string
                        border?: {
                            style?: 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted'
                            color?: string
                            sides?: Array<'top' | 'bottom' | 'left' | 'right' | 'all'>
                        }
                    }
                    type FormatArgs = {
                        range?: string
                        format?: FormatOptions
                        artifactId?: string
                    }
                    let args: FormatArgs
                    if (typeof rawArgs === 'string') {
                        args = JSON.parse(rawArgs)
                    } else if (rawArgs && typeof rawArgs === 'object') {
                        const objArgs = rawArgs as Record<string, unknown>
                        args = ('input' in objArgs && typeof objArgs.input === 'object')
                            ? objArgs.input as FormatArgs
                            : rawArgs as FormatArgs
                    } else {
                        args = {}
                    }

                    const { range, format, artifactId: providedArtifactId } = args
                    const targetId = providedArtifactId || context.artifactId

                    if (!targetId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de calculo activa. Proporciona artifactId o abre una hoja primero.'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!range || !format) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Datos inválidos: range y format son requeridos'
                                })
                            }],
                            isError: true
                        }
                    }

                    log.info(`[MCP ExcelTool] Formatting range: ${range} in ${targetId}`)

                    // Get artifact with ownership check
                    const artifact = await getArtifactWithOwnership(targetId, context.userId)

                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos de hoja de calculo'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]

                    // Parse range
                    const { start, end } = parseRange(range)

                    // Apply formatting to each cell in range
                    for (let row = start.row; row <= end.row; row++) {
                        for (let col = start.col; col <= end.col; col++) {
                            if (!sheet.cellData[row]) sheet.cellData[row] = {}
                            if (!sheet.cellData[row][col]) sheet.cellData[row][col] = {}
                            
                            const cell = sheet.cellData[row][col]
                            if (!cell.s) cell.s = {}
                            
                            // Font styling
                            if (format.bold !== undefined) cell.s.bl = format.bold ? 1 : 0
                            if (format.italic !== undefined) cell.s.it = format.italic ? 1 : 0
                            if (format.textColor) cell.s.cl = { rgb: format.textColor }
                            if (format.fontSize !== undefined) cell.s.fs = format.fontSize
                            
                            // Background
                            if (format.backgroundColor) cell.s.bg = { rgb: format.backgroundColor }
                            
                            // Alignment
                            if (format.horizontalAlign) cell.s.ht = getHorizontalAlign(format.horizontalAlign)
                            if (format.verticalAlign) cell.s.vt = getVerticalAlign(format.verticalAlign)
                            if (format.textWrap !== undefined) cell.s.tb = format.textWrap ? 2 : 1
                            
                            // Number format
                            if (format.numberFormat) cell.s.n = { pattern: format.numberFormat }
                            
                            // Borders
                            if (format.border) {
                                const borderStyle = getBorderStyle(format.border.style || 'thin')
                                const borderColor = format.border.color || '#000000'
                                const sides = format.border.sides || ['all']
                                
                                const borderDef = {
                                    s: borderStyle,
                                    cl: { rgb: borderColor }
                                }
                                
                                if (!cell.s.bd) cell.s.bd = {}
                                
                                if (sides.includes('all') || sides.includes('top')) cell.s.bd.t = borderDef
                                if (sides.includes('all') || sides.includes('bottom')) cell.s.bd.b = borderDef
                                if (sides.includes('all') || sides.includes('left')) cell.s.bd.l = borderDef
                                if (sides.includes('all') || sides.includes('right')) cell.s.bd.r = borderDef
                            }
                        }
                    }

                    // Update database
                    const { error: updateError } = await supabase
                        .from('artifacts')
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to format cells: ${updateError.message}`)
                    }

                    // Notify renderer for live UI update
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet')

                    const cellCount = (end.row - start.row + 1) * (end.col - start.col + 1)
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                range,
                                cellCount,
                                message: `Formato aplicado a ${cellCount} celda(s) en el rango ${range}.`
                            })
                        }]
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    log.error(`[MCP ExcelTool] Error formatting cells:`, message)
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'insert_formula',
            description: 'Inserta una formula en una celda.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                cell: z.string().describe('Referencia de celda (ej: E5)'),
                formula: z.string().describe('Formula Excel (ej: =SUM(A1:A10), =AVERAGE(B1:B5))')
            }),
            handler: async ({ cell, formula, artifactId: providedArtifactId }) => {
                try {
                    const targetId = providedArtifactId || context.artifactId
                    if (!targetId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de calculo activa. Proporciona artifactId o abre una hoja primero.'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    log.info(`[MCP ExcelTool] Inserting formula in ${cell}: ${formula}`)

                    // Get artifact with ownership check
                    const artifact = await getArtifactWithOwnership(targetId, context.userId)

                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos de hoja de calculo'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]

                    // Parse cell reference and insert formula
                    const { row, col } = parseCellReference(cell)
                    if (!sheet.cellData[row]) sheet.cellData[row] = {}
                    sheet.cellData[row][col] = { v: formula }

                    // Update database
                    const { error: updateError } = await supabase
                        .from('artifacts')
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to insert formula: ${updateError.message}`)
                    }

                    // Notify renderer for live UI update
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet')

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                cell,
                                formula,
                                message: `Formula "${formula}" insertada en ${cell}.`
                            })
                        }]
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    log.error(`[MCP ExcelTool] Error inserting formula:`, message)
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'add_conditional_formatting',
            description: 'Aplica formato condicional a un rango. (Funcionalidad avanzada - requiere implementación completa)',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de celdas'),
                rules: z.array(z.object({
                    type: z.enum(['greaterThan', 'lessThan', 'equals', 'between', 'text_contains']),
                    value: z.union([z.string(), z.number()]),
                    value2: z.union([z.string(), z.number()]).optional(),
                    format: z.object({
                        backgroundColor: z.string().optional(),
                        textColor: z.string().optional(),
                        bold: z.boolean().optional()
                    })
                })).describe('Reglas de formato condicional')
            }),
            handler: async ({ range: _range, rules: _rules, artifactId: providedArtifactId }) => {
                try {
                    const targetId = providedArtifactId || context.artifactId
                    if (!targetId || !context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de calculo activa o usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    // TODO: Implement full conditional formatting logic
                    // For now, return a message indicating this needs full implementation
                    log.warn(`[MCP ExcelTool] Conditional formatting requested but not fully implemented yet`)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: 'Formato condicional no está completamente implementado. Usa format_cells para aplicar formato básico.'
                            })
                        }],
                        isError: true
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'sort_data',
            description: 'Ordena datos en un rango. (Funcionalidad avanzada - requiere implementación completa)',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de datos a ordenar'),
                sortColumn: z.string().describe('Columna por la cual ordenar (ej: A, B)'),
                ascending: z.boolean().default(true).describe('Orden ascendente (true) o descendente (false)'),
                hasHeaders: z.boolean().default(true).describe('Si la primera fila son encabezados')
            }),
            handler: async ({ range: _range, sortColumn: _sortColumn, ascending: _ascending, hasHeaders: _hasHeaders, artifactId: providedArtifactId }) => {
                try {
                    const targetId = providedArtifactId || context.artifactId
                    if (!targetId || !context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de calculo activa o usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    // TODO: Implement full sort logic
                    log.warn(`[MCP ExcelTool] Sort requested but not fully implemented yet`)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: 'Ordenamiento de datos no está completamente implementado. Esta funcionalidad requiere lógica compleja de reordenamiento de filas.'
                            })
                        }],
                        isError: true
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'analyze_data',
            description: 'Analiza datos y genera estadisticas basicas. (Funcionalidad avanzada - requiere implementación completa)',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de datos a analizar'),
                analysisType: z.enum(['summary', 'distribution', 'trends']).describe('Tipo de analisis')
            }),
            handler: async ({ range: _range, analysisType: _analysisType, artifactId: providedArtifactId }) => {
                try {
                    const targetId = providedArtifactId || context.artifactId
                    if (!targetId || !context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de calculo activa o usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    // TODO: Implement analysis logic
                    log.warn(`[MCP ExcelTool] Analysis requested but not fully implemented yet`)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: 'Análisis de datos no está completamente implementado. Esta funcionalidad requiere lógica de análisis estadístico.'
                            })
                        }],
                        isError: true
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'export_to_csv',
            description: 'Exporta los datos a formato CSV. (Funcionalidad avanzada - requiere implementación completa)',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().optional().describe('Rango a exportar (omitir para toda la hoja)'),
                filename: z.string().optional().describe('Nombre del archivo')
            }),
            handler: async ({ range: _range, filename: _filename, artifactId: providedArtifactId }) => {
                try {
                    const targetId = providedArtifactId || context.artifactId
                    if (!targetId || !context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de calculo activa o usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    // TODO: Implement CSV export logic
                    log.warn(`[MCP ExcelTool] CSV export requested but not fully implemented yet`)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: 'Exportación a CSV no está completamente implementada. Esta funcionalidad requiere acceso al sistema de archivos.'
                            })
                        }],
                        isError: true
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        }
    ]
}

/**
 * Create MCP-compatible PDF tools
 */
export function createPdfMcpTools(context: PDFContext): McpToolDefinition[] {
    return [
        {
            name: 'search_pdf',
            description: 'Busca texto en el documento PDF cargado.',
            inputSchema: z.object({
                query: z.string().describe('Texto a buscar'),
                caseSensitive: z.boolean().default(false).optional()
            }),
            handler: async ({ query, caseSensitive }) => {
                log.info(`[MCP PdfTool] Searching PDF for: ${query}`)

                if (!context.pages || context.pages.length === 0) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ error: 'No hay PDF cargado.' }) }],
                        isError: true
                    }
                }

                const results: Array<{ page: number; snippet: string }> = []
                const searchQuery = caseSensitive ? query : query.toLowerCase()

                for (const page of context.pages) {
                    const content = caseSensitive ? page.content : page.content.toLowerCase()
                    if (content.includes(searchQuery)) {
                        // Extract snippet around match
                        const index = content.indexOf(searchQuery)
                        const start = Math.max(0, index - 50)
                        const end = Math.min(page.content.length, index + query.length + 50)
                        const snippet = page.content.substring(start, end)

                        results.push({
                            page: page.pageNumber,
                            snippet: `...${snippet}...`
                        })
                    }
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            query,
                            resultsCount: results.length,
                            results: results.slice(0, 10),
                            message: results.length > 0
                                ? `Encontrado "${query}" en ${results.length} pagina(s).`
                                : `No se encontro "${query}" en el documento.`
                        })
                    }]
                }
            }
        },
        {
            name: 'get_page_content',
            description: 'Obtiene el contenido de una pagina especifica.',
            inputSchema: z.object({
                pageNumber: z.number().describe('Numero de pagina (empezando en 1)')
            }),
            handler: async ({ pageNumber }) => {
                log.info(`[MCP PdfTool] Getting page ${pageNumber}`)

                if (!context.pages || context.pages.length === 0) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ error: 'No hay PDF cargado.' }) }],
                        isError: true
                    }
                }

                const page = context.pages.find((p) => p.pageNumber === pageNumber)
                if (!page) {
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                error: `Pagina ${pageNumber} no encontrada. El documento tiene ${context.pages.length} paginas.`
                            })
                        }],
                        isError: true
                    }
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            pageNumber,
                            wordCount: page.wordCount,
                            content: page.content
                        })
                    }]
                }
            }
        },
        {
            name: 'summarize_pdf',
            description: 'Resume el contenido del PDF o una seccion especifica.',
            inputSchema: z.object({
                startPage: z.number().optional().describe('Pagina inicial'),
                endPage: z.number().optional().describe('Pagina final')
            }),
            handler: async ({ startPage, endPage }) => {
                log.info(`[MCP PdfTool] Summarizing pages ${startPage || 1} to ${endPage || 'end'}`)

                if (!context.pages || context.pages.length === 0) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ error: 'No hay PDF cargado.' }) }],
                        isError: true
                    }
                }

                const start = startPage || 1
                const end = endPage || context.pages.length
                const selectedPages = context.pages.filter(
                    (p) => p.pageNumber >= start && p.pageNumber <= end
                )

                const combinedContent = selectedPages.map((p) => p.content).join('\n\n')
                const totalWords = selectedPages.reduce((sum, p) => sum + p.wordCount, 0)

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            pagesIncluded: selectedPages.length,
                            totalWords,
                            content: combinedContent.substring(0, 5000), // Limit to 5000 chars
                            truncated: combinedContent.length > 5000
                        })
                    }]
                }
            }
        }
    ]
}

/**
 * Create MCP-compatible Docs tools
 */
export function createDocsMcpTools(context: DocsContext): McpToolDefinition[] {
    return [
        {
            name: 'insert_text',
            description: 'Inserta texto en el documento.',
            inputSchema: z.object({
                text: z.string().describe('Texto a insertar'),
                position: z.enum(['start', 'end', 'cursor']).default('cursor'),
                formatting: z.object({
                    bold: z.boolean().optional(),
                    italic: z.boolean().optional(),
                    heading: z.enum(['h1', 'h2', 'h3']).optional()
                }).optional()
            }),
            handler: async ({ text, position, formatting }) => {
                log.info(`[MCP DocsTool] Inserting text at ${position}`)

                sendToRenderer('docs:insert-text', {
                    documentId: context.documentId,
                    text,
                    position,
                    formatting,
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            position,
                            charCount: text.length,
                            message: `Texto insertado (${text.length} caracteres).`
                        })
                    }]
                }
            }
        },
        {
            name: 'create_document',
            description: 'Crea un nuevo documento con contenido estructurado.',
            inputSchema: z.object({
                title: z.string().describe('Titulo del documento'),
                content: z.array(z.object({
                    type: z.enum(['heading', 'paragraph', 'list', 'table']),
                    level: z.number().optional().describe('Nivel para headings (1-3)'),
                    text: z.string().optional(),
                    items: z.array(z.string()).optional().describe('Items para listas'),
                    rows: z.array(z.array(z.string())).optional().describe('Filas para tablas')
                })).describe('Bloques de contenido')
            }),
            handler: async ({ title, content }) => {
                log.info(`[MCP DocsTool] Creating document: ${title}`)

                const artifactId = crypto.randomUUID()

                sendToRenderer('artifact:created', {
                    type: 'document',
                    id: artifactId,
                    artifactId,
                    name: title,
                    title,
                    data: { title, content },
                    chatId: context.chatId,
                    userId: context.userId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            artifactId,
                            title,
                            blockCount: content.length,
                            message: `Documento "${title}" creado con ${content.length} bloques.`
                        })
                    }]
                }
            }
        }
    ]
}

/**
 * Create universal MCP tools from ALL_TOOLS
 * This converts all tools in the app to MCP format for use with any provider
 */
export function createUniversalMcpTools(
    chatId: string,
    userId: string,
    toolContext?: ToolContext
): McpToolDefinition[] {
    const tools: McpToolDefinition[] = []

    for (const [toolName, toolDef] of Object.entries(ALL_TOOLS)) {
        tools.push({
            name: toolName,
            description: toolDef.description,
            inputSchema: toolDef.inputSchema as z.ZodObject<z.ZodRawShape>,
            handler: async (args) => {
                try {
                    log.info(`[MCP Universal] Executing tool: ${toolName}`)

                    // Validate required context
                    if (!userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!chatId && toolName !== 'get_ui_context') {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay chat activo. Abre o crea un chat primero.'
                                })
                            }],
                            isError: true
                        }
                    }

                    // Execute tool using the centralized executeTool function
                    const result = await executeTool(
                        toolName,
                        args,
                        chatId || '', // Some tools don't need chatId
                        userId,
                        toolContext // Pass context for image tools that need API keys
                    )

                    // Convert result to MCP format
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                ...(typeof result === 'object' && result !== null ? result : { result })
                            })
                        }]
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error'
                    log.error(`[MCP Universal] Error executing ${toolName}:`, message)
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: message
                            })
                        }],
                        isError: true
                    }
                }
            }
        })
    }

    log.info(`[MCP Universal] Created ${tools.length} universal MCP tools`)
    return tools
}

/**
 * Create all MCP tools (universal + context-specific)
 * Use this when you need ALL tools available, not just context-specific ones
 */
export function createAllMcpTools(
    chatId: string,
    userId: string,
    toolContext?: ToolContext,
    excelContext?: ExcelContext,
    pdfContext?: PDFContext,
    docsContext?: DocsContext
): McpToolDefinition[] {
    const tools: McpToolDefinition[] = []

    // Add all universal tools from ALL_TOOLS
    tools.push(...createUniversalMcpTools(chatId, userId, toolContext))

    // Optionally add context-specific tools if contexts are provided
    // These provide shortcuts and context-aware operations
    if (excelContext) {
        const excelTools = createExcelMcpTools(excelContext)
        // Only add if not already present (avoid duplicates)
        for (const tool of excelTools) {
            if (!tools.find(t => t.name === tool.name)) {
                tools.push(tool)
            }
        }
    }

    if (pdfContext) {
        const pdfTools = createPdfMcpTools(pdfContext)
        for (const tool of pdfTools) {
            if (!tools.find(t => t.name === tool.name)) {
                tools.push(tool)
            }
        }
    }

    if (docsContext) {
        const docsTools = createDocsMcpTools(docsContext)
        for (const tool of docsTools) {
            if (!tools.find(t => t.name === tool.name)) {
                tools.push(tool)
            }
        }
    }

    log.info(`[MCP] Created ${tools.length} total MCP tools (universal + context-specific)`)
    return tools
}

/**
 * Type for creating SDK MCP server (imported dynamically)
 */
export type { McpToolDefinition }
