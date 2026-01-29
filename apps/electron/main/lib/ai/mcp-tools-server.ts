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
 * Supports both artifact system (legacy) and file system (new)
 */
function notifyArtifactUpdate(
    artifactId: string,
    univerData: Record<string, unknown>,
    type: 'spreadsheet' | 'document',
    fileId?: string
) {
    // Send both artifactId and fileId so either system can pick it up
    sendToRenderer('artifact:update', { artifactId, univerData, type, fileId })
}

// Types for univer data structure
interface UniverSheetData {
    cellData: Record<number, Record<number, { v?: unknown; s?: Record<string, unknown> }>>;
    [key: string]: unknown;
}

interface UniverData {
    sheets: Record<string, UniverSheetData>;
    sheetOrder?: string[];
    [key: string]: unknown;
}

interface ArtifactResult {
    id: string;
    univer_data: UniverData;
    user_id?: string;
    isUserFile?: boolean;
}

/**
 * Helper: Get artifact with ownership check (supports both direct and chat-based ownership)
 * Also checks user_files table as fallback for new file system
 */
async function getArtifactWithOwnership(artifactId: string, userId: string): Promise<ArtifactResult> {
    // First try artifacts table (legacy system)
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats(user_id)')
        .eq('id', artifactId)
        .single()

    if (artifact && !error) {
        // Check ownership: direct user_id OR via chat
        const hasDirectOwnership = artifact.user_id === userId
        const chatData = Array.isArray(artifact.chats) ? artifact.chats[0] : artifact.chats
        const hasChatOwnership = chatData?.user_id === userId

        if (!hasDirectOwnership && !hasChatOwnership) {
            throw new Error('Access denied')
        }

        return {
            id: artifact.id,
            univer_data: artifact.univer_data as UniverData,
            user_id: artifact.user_id,
            isUserFile: false
        }
    }

    // Fallback: Try user_files table (new file system)
    const { data: userFile, error: fileError } = await supabase
        .from('user_files')
        .select('*')
        .eq('id', artifactId)
        .eq('user_id', userId)
        .single()

    if (userFile && !fileError) {
        return {
            id: userFile.id,
            univer_data: userFile.univer_data as UniverData,
            user_id: userFile.user_id,
            isUserFile: true
        }
    }

    throw new Error('Artifact not found')
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
 * Helper to get the target ID from context or provided value
 * Supports both artifactId (legacy) and workbookId (new file system)
 */
function getTargetId(providedId: string | undefined, context: ExcelContext): string | undefined {
    // Priority: provided > artifactId > workbookId
    return providedId || context.artifactId || context.workbookId
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
                    const targetId = getTargetId(providedArtifactId, context)

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

                    // Update database (support both artifacts and user_files tables)
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to update cells: ${updateError.message}`)
                    }

                    // Notify renderer for live UI update (include fileId for new file system)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

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
                    const targetId = getTargetId(providedArtifactId, context)

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

                    // Update database (support both artifacts and user_files tables)
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to format cells: ${updateError.message}`)
                    }

                    // Notify renderer for live UI update (include fileId for new file system)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

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
                    const targetId = getTargetId(providedArtifactId, context)
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

                    // Update database (support both artifacts and user_files tables)
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to insert formula: ${updateError.message}`)
                    }

                    // Notify renderer for live UI update (include fileId for new file system)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

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
            description: 'Aplica formato condicional a un rango basado en reglas.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de celdas (ej: A1:D10)'),
                rules: z.array(z.object({
                    type: z.enum(['greaterThan', 'lessThan', 'equals', 'between', 'text_contains']),
                    value: z.union([z.string(), z.number()]),
                    value2: z.union([z.string(), z.number()]).optional(),
                    format: z.object({
                        backgroundColor: z.string().optional().describe('Color de fondo (hex, ej: #FF0000)'),
                        textColor: z.string().optional().describe('Color de texto (hex)'),
                        bold: z.boolean().optional()
                    })
                })).describe('Reglas de formato condicional')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; rules?: Array<{ type: string; value: string | number; value2?: string | number; format: { backgroundColor?: string; textColor?: string; bold?: boolean } }>; artifactId?: string }
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

                    const { range, rules, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de cálculo activa o usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!range || !rules?.length) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Rango y reglas son requeridos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos de hoja de cálculo'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    // Parse range
                    const { start, end } = parseRange(range)

                    // Helper to convert hex to RGB
                    const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
                        return result ? {
                            r: parseInt(result[1], 16),
                            g: parseInt(result[2], 16),
                            b: parseInt(result[3], 16)
                        } : null
                    }

                    // Apply conditional formatting by checking each cell
                    let formattedCount = 0
                    for (let row = start.row; row <= end.row; row++) {
                        for (let col = start.col; col <= end.col; col++) {
                            if (!cellData[row]) cellData[row] = {}
                            const cell = cellData[row][col] as { v?: unknown; s?: unknown } | undefined
                            const cellValue = cell?.v

                            // Check each rule
                            for (const rule of rules) {
                                let matches = false
                                const numValue = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue))
                                const strValue = String(cellValue ?? '').toLowerCase()
                                const ruleValue = typeof rule.value === 'number' ? rule.value : parseFloat(String(rule.value))
                                const ruleValue2 = rule.value2 !== undefined ? (typeof rule.value2 === 'number' ? rule.value2 : parseFloat(String(rule.value2))) : 0

                                switch (rule.type) {
                                    case 'greaterThan':
                                        matches = !isNaN(numValue) && !isNaN(ruleValue) && numValue > ruleValue
                                        break
                                    case 'lessThan':
                                        matches = !isNaN(numValue) && !isNaN(ruleValue) && numValue < ruleValue
                                        break
                                    case 'equals':
                                        if (typeof rule.value === 'number') {
                                            matches = numValue === ruleValue
                                        } else {
                                            matches = strValue === String(rule.value).toLowerCase()
                                        }
                                        break
                                    case 'between':
                                        matches = !isNaN(numValue) && !isNaN(ruleValue) && !isNaN(ruleValue2) && numValue >= ruleValue && numValue <= ruleValue2
                                        break
                                    case 'text_contains':
                                        matches = strValue.includes(String(rule.value).toLowerCase())
                                        break
                                }

                                if (matches) {
                                    // Apply formatting
                                    if (!cellData[row][col]) {
                                        cellData[row][col] = (cell || {}) as typeof cellData[number][number]
                                    }
                                    const targetCell = cellData[row][col] as Record<string, unknown>
                                    if (!targetCell.s) targetCell.s = {}
                                    const style = targetCell.s as Record<string, unknown>

                                    if (rule.format.backgroundColor) {
                                        const rgb = hexToRgb(rule.format.backgroundColor)
                                        if (rgb) {
                                            style.bg = { rgb: `rgb(${rgb.r},${rgb.g},${rgb.b})` }
                                        }
                                    }
                                    if (rule.format.textColor) {
                                        const rgb = hexToRgb(rule.format.textColor)
                                        if (rgb) {
                                            style.cl = { rgb: `rgb(${rgb.r},${rgb.g},${rgb.b})` }
                                        }
                                    }
                                    if (rule.format.bold) {
                                        style.bl = 1
                                    }

                                    formattedCount++
                                    break // Only apply first matching rule
                                }
                            }
                        }
                    }

                    sheet.cellData = cellData

                    // Update database
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to apply conditional formatting: ${updateError.message}`)
                    }

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                range,
                                rulesApplied: rules.length,
                                cellsFormatted: formattedCount,
                                message: `Formato condicional aplicado: ${formattedCount} celdas formateadas`
                            })
                        }]
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
            description: 'Ordena datos en un rango por una columna específica.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de datos a ordenar (ej: A1:D10)'),
                sortColumn: z.string().describe('Columna por la cual ordenar (ej: A, B)'),
                ascending: z.boolean().default(true).describe('Orden ascendente (true) o descendente (false)'),
                hasHeaders: z.boolean().default(true).describe('Si la primera fila son encabezados')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; sortColumn?: string; ascending?: boolean; hasHeaders?: boolean; artifactId?: string }
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

                    const { range, sortColumn, ascending = true, hasHeaders = true, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de cálculo activa o usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!range || !sortColumn) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Rango y columna de ordenamiento son requeridos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos de hoja de cálculo'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    // Parse range and sort column
                    const { start, end } = parseRange(range)
                    const sortColIndex = sortColumn.toUpperCase().charCodeAt(0) - 65

                    // Extract rows to sort
                    const dataStartRow = hasHeaders ? start.row + 1 : start.row
                    const rows: Array<{ rowIndex: number; cells: Record<number, unknown> }> = []

                    for (let row = dataStartRow; row <= end.row; row++) {
                        const rowCells: Record<number, unknown> = {}
                        for (let col = start.col; col <= end.col; col++) {
                            if (cellData[row]?.[col]) {
                                rowCells[col] = cellData[row][col]
                            }
                        }
                        rows.push({ rowIndex: row, cells: rowCells })
                    }

                    // Sort rows by sort column value
                    rows.sort((a, b) => {
                        const aCell = a.cells[sortColIndex] as { v?: unknown } | undefined
                        const bCell = b.cells[sortColIndex] as { v?: unknown } | undefined
                        const aVal = aCell?.v
                        const bVal = bCell?.v

                        // Handle nulls
                        if (aVal === undefined || aVal === null) return ascending ? 1 : -1
                        if (bVal === undefined || bVal === null) return ascending ? -1 : 1

                        // Compare values
                        if (typeof aVal === 'number' && typeof bVal === 'number') {
                            return ascending ? aVal - bVal : bVal - aVal
                        }

                        const aStr = String(aVal).toLowerCase()
                        const bStr = String(bVal).toLowerCase()
                        return ascending ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
                    })

                    // Rewrite sorted data back to cellData
                    for (let i = 0; i < rows.length; i++) {
                        const targetRow = dataStartRow + i
                        const sourceRow = rows[i]

                        // Clear existing row in range
                        if (!cellData[targetRow]) cellData[targetRow] = {}
                        for (let col = start.col; col <= end.col; col++) {
                            delete cellData[targetRow][col]
                        }

                        // Write sorted row data
                        for (const [colKey, cellValue] of Object.entries(sourceRow.cells)) {
                            const col = parseInt(colKey, 10)
                            cellData[targetRow][col] = cellValue as typeof cellData[number][number]
                        }
                    }

                    sheet.cellData = cellData

                    // Update database
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to sort data: ${updateError.message}`)
                    }

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                range,
                                sortedRows: rows.length,
                                sortColumn,
                                ascending,
                                message: `Datos ordenados por columna ${sortColumn} (${ascending ? 'ascendente' : 'descendente'})`
                            })
                        }]
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
                    const targetId = getTargetId(providedArtifactId, context)
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
                    const targetId = getTargetId(providedArtifactId, context)
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
        },
        // ============================================================================
        // NEW TOOLS - Univer Facade API compatible
        // ============================================================================
        {
            name: 'read_cells',
            description: 'Lee el contenido de un rango de celdas. Útil para ver datos existentes antes de modificar.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de celdas a leer (ej: A1:D10)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; artifactId?: string }
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

                    const { range, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de cálculo activa o usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!range) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Rango requerido (ej: A1:D10)'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos de hoja de cálculo'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    // Parse range
                    const { start, end } = parseRange(range)
                    const data: Array<Array<string | number | null>> = []

                    for (let row = start.row; row <= end.row; row++) {
                        const rowData: Array<string | number | null> = []
                        for (let col = start.col; col <= end.col; col++) {
                            const cell = cellData[row]?.[col]
                            rowData.push(cell?.v as string | number | null ?? null)
                        }
                        data.push(rowData)
                    }

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                range,
                                data,
                                rowCount: data.length,
                                colCount: data[0]?.length || 0
                            })
                        }]
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
            name: 'merge_cells',
            description: 'Combina un rango de celdas en una sola celda.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de celdas a combinar (ej: A1:C1)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; artifactId?: string }
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

                    const { range, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !range) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Faltan parámetros requeridos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]

                    // Parse range and add merge data
                    const { start, end } = parseRange(range)
                    const mergeData = (sheet.mergeData || []) as Array<{ startRow: number; startColumn: number; endRow: number; endColumn: number }>

                    // Add merge region
                    mergeData.push({
                        startRow: start.row,
                        startColumn: start.col,
                        endRow: end.row,
                        endColumn: end.col
                    })

                    sheet.mergeData = mergeData

                    // Update database
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to merge cells: ${updateError.message}`)
                    }

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                range,
                                message: `Celdas ${range} combinadas exitosamente`
                            })
                        }]
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
            name: 'insert_rows',
            description: 'Inserta filas nuevas en la hoja de cálculo.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                startRow: z.number().describe('Número de fila donde insertar (1-indexed)'),
                count: z.number().default(1).describe('Cantidad de filas a insertar')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { startRow?: number; count?: number; artifactId?: string }
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

                    const { startRow, count = 1, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || startRow === undefined) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Faltan parámetros requeridos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    // Shift existing rows down
                    const rowStart = startRow - 1 // Convert to 0-indexed
                    const newCellData: Record<number, Record<number, unknown>> = {}

                    for (const [rowKey, rowData] of Object.entries(cellData)) {
                        const row = parseInt(rowKey, 10)
                        if (row >= rowStart) {
                            newCellData[row + count] = rowData
                        } else {
                            newCellData[row] = rowData
                        }
                    }

                    sheet.cellData = newCellData as typeof sheet.cellData
                    sheet.rowCount = ((sheet.rowCount as number) || 100) + count

                    // Update database
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to insert rows: ${updateError.message}`)
                    }

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                insertedAt: startRow,
                                count,
                                message: `${count} fila(s) insertada(s) en la fila ${startRow}`
                            })
                        }]
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
            name: 'delete_rows',
            description: 'Elimina filas de la hoja de cálculo.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                startRow: z.number().describe('Número de fila donde empezar a eliminar (1-indexed)'),
                count: z.number().default(1).describe('Cantidad de filas a eliminar')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { startRow?: number; count?: number; artifactId?: string }
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

                    const { startRow, count = 1, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || startRow === undefined) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Faltan parámetros requeridos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    // Remove rows and shift up
                    const rowStart = startRow - 1 // Convert to 0-indexed
                    const rowEnd = rowStart + count
                    const newCellData: Record<number, Record<number, unknown>> = {}

                    for (const [rowKey, rowData] of Object.entries(cellData)) {
                        const row = parseInt(rowKey, 10)
                        if (row < rowStart) {
                            newCellData[row] = rowData
                        } else if (row >= rowEnd) {
                            newCellData[row - count] = rowData
                        }
                        // Rows in the deleted range are skipped
                    }

                    sheet.cellData = newCellData as typeof sheet.cellData
                    sheet.rowCount = Math.max(((sheet.rowCount as number) || 100) - count, 1)

                    // Update database
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to delete rows: ${updateError.message}`)
                    }

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                deletedFrom: startRow,
                                count,
                                message: `${count} fila(s) eliminada(s) desde la fila ${startRow}`
                            })
                        }]
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
            name: 'set_column_widths',
            description: 'Establece el ancho de una o más columnas.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                columns: z.array(z.object({
                    column: z.string().describe('Letra de la columna (ej: A, B, C)'),
                    width: z.number().describe('Ancho en píxeles')
                })).describe('Columnas y sus anchos')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { columns?: Array<{ column: string; width: number }>; artifactId?: string }
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

                    const { columns, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !columns?.length) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Faltan parámetros requeridos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const columnData = (sheet.columnData || {}) as Record<number, { w?: number }>

                    for (const { column, width } of columns) {
                        const colIndex = column.toUpperCase().charCodeAt(0) - 65
                        columnData[colIndex] = { w: width }
                    }

                    sheet.columnData = columnData

                    // Update database
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to set column widths: ${updateError.message}`)
                    }

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                columnsUpdated: columns.length,
                                message: `Ancho de ${columns.length} columna(s) actualizado`
                            })
                        }]
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
            name: 'create_filter',
            description: 'Crea un filtro automático (autofilter) en un rango de datos.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango del filtro incluyendo encabezados (ej: A1:D10)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; artifactId?: string }
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

                    const { range, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'No hay hoja de cálculo activa o usuario no autenticado'
                                })
                            }],
                            isError: true
                        }
                    }

                    if (!range) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Rango requerido (ej: A1:D10)'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos de hoja de cálculo'
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

                    // Create filter configuration for Univer
                    // Univer stores filters in the sheet's filter property
                    const filterConfig = {
                        ref: {
                            startRow: start.row,
                            startColumn: start.col,
                            endRow: end.row,
                            endColumn: end.col
                        },
                        cachedFilteredOut: [],
                        filterColumns: {}
                    }

                    // Initialize filter columns for each column in range
                    for (let col = start.col; col <= end.col; col++) {
                        (filterConfig.filterColumns as Record<number, object>)[col] = {
                            colId: col,
                            filters: null,
                            customFilters: null
                        }
                    }

                    // Set the filter on the sheet
                    sheet.filter = filterConfig

                    // Update database
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to create filter: ${updateError.message}`)
                    }

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                range,
                                columnsWithFilter: end.col - start.col + 1,
                                message: `Filtro creado en rango ${range}`
                            })
                        }]
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
            name: 'set_row_heights',
            description: 'Establece la altura de una o más filas.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                rows: z.array(z.object({
                    row: z.number().describe('Número de fila (1-indexed)'),
                    height: z.number().describe('Altura en píxeles')
                })).describe('Filas y sus alturas')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { rows?: Array<{ row: number; height: number }>; artifactId?: string }
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

                    const { rows, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !rows?.length) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'Faltan parámetros requeridos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: false,
                                    error: 'El artefacto no contiene datos'
                                })
                            }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const rowData = (sheet.rowData || {}) as Record<number, { h?: number }>

                    for (const { row, height } of rows) {
                        const rowIndex = row - 1 // Convert to 0-indexed
                        if (!rowData[rowIndex]) rowData[rowIndex] = {}
                        rowData[rowIndex].h = height
                    }

                    sheet.rowData = rowData

                    // Update database
                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    const { error: updateError } = await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    if (updateError) {
                        throw new Error(`Failed to set row heights: ${updateError.message}`)
                    }

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                rowsUpdated: rows.length,
                                message: `Altura de ${rows.length} fila(s) actualizada`
                            })
                        }]
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
        // ============================================================================
        // ADDITIONAL TOOLS - Extended functionality
        // ============================================================================
        {
            name: 'apply_number_format',
            description: 'Aplica formato numérico rápido a celdas: moneda, porcentaje, fecha, número.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto (opcional si hay uno activo)'),
                range: z.string().describe('Rango de celdas (ej: B2:B100)'),
                format: z.enum(['currency', 'percentage', 'number', 'date', 'time', 'datetime', 'scientific', 'text']).describe('Tipo de formato'),
                customPattern: z.string().optional().describe('Patrón personalizado (solo si format es custom)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; format?: string; customPattern?: string; artifactId?: string }
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

                    const { range, format, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !range || !format) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({ success: false, error: 'Faltan parámetros requeridos' })
                            }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Sin datos' }) }],
                            isError: true
                        }
                    }

                    // Map format type to pattern
                    const formatPatterns: Record<string, string> = {
                        currency: '$#,##0.00',
                        percentage: '0.00%',
                        number: '#,##0.00',
                        date: 'DD/MM/YYYY',
                        time: 'HH:MM:SS',
                        datetime: 'DD/MM/YYYY HH:MM',
                        scientific: '0.00E+00',
                        text: '@'
                    }

                    const pattern = formatPatterns[format] || '#,##0.00'

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const { start, end } = parseRange(range)

                    for (let row = start.row; row <= end.row; row++) {
                        for (let col = start.col; col <= end.col; col++) {
                            if (!sheet.cellData[row]) sheet.cellData[row] = {}
                            if (!sheet.cellData[row][col]) sheet.cellData[row][col] = {}
                            if (!sheet.cellData[row][col].s) sheet.cellData[row][col].s = {}
                            ;(sheet.cellData[row][col].s as Record<string, unknown>).n = { pattern }
                        }
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase
                        .from(tableName)
                        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
                        .eq('id', targetId)

                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                range,
                                format,
                                pattern,
                                message: `Formato ${format} aplicado a ${range}`
                            })
                        }]
                    }
                } catch (error) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'get_spreadsheet_summary',
            description: 'Obtiene un resumen del contenido: encabezados, cantidad de filas/columnas, y datos de muestra.',
            inputSchema: z.object({
                artifactId: z.string().optional().describe('ID del artefacto'),
                maxRows: z.number().optional().describe('Máximo de filas a incluir (default: 10)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { maxRows?: number; artifactId?: string }
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

                    const targetId = getTargetId(args.artifactId, context)
                    const maxRows = args.maxRows || 10

                    if (!targetId || !context.userId) {
                        return {
                            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No hay hoja activa' }) }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    if (!artifact.univer_data) {
                        return {
                            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Sin datos' }) }],
                            isError: true
                        }
                    }

                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    // Find data bounds
                    let maxRow = 0, maxCol = 0
                    for (const rowStr of Object.keys(cellData)) {
                        const row = parseInt(rowStr)
                        if (row > maxRow) maxRow = row
                        for (const colStr of Object.keys(cellData[row] || {})) {
                            const col = parseInt(colStr)
                            if (col > maxCol) maxCol = col
                        }
                    }

                    // Extract headers (row 0)
                    const headers: string[] = []
                    for (let col = 0; col <= maxCol; col++) {
                        headers.push(String(cellData[0]?.[col]?.v ?? ''))
                    }

                    // Extract sample data
                    const sampleData: Array<Array<unknown>> = []
                    for (let row = 1; row <= Math.min(maxRow, maxRows); row++) {
                        const rowData: unknown[] = []
                        for (let col = 0; col <= maxCol; col++) {
                            rowData.push(cellData[row]?.[col]?.v ?? null)
                        }
                        sampleData.push(rowData)
                    }

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                sheetName: sheet.name || 'Sheet1',
                                totalRows: maxRow + 1,
                                totalColumns: maxCol + 1,
                                headers,
                                sampleData,
                                message: `Hoja con ${maxRow + 1} filas y ${maxCol + 1} columnas`
                            })
                        }]
                    }
                } catch (error) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }],
                        isError: true
                    }
                }
            }
        },
        {
            name: 'copy_range',
            description: 'Copia celdas de un rango a otro (valores, fórmulas y formato).',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                sourceRange: z.string().describe('Rango origen (ej: A1:C5)'),
                destinationCell: z.string().describe('Celda destino superior izquierda (ej: E1)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { sourceRange?: string; destinationCell?: string; artifactId?: string }
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

                    const { sourceRange, destinationCell, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !sourceRange || !destinationCell) {
                        return {
                            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }],
                            isError: true
                        }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]

                    const { start: srcStart, end: srcEnd } = parseRange(sourceRange)
                    const dest = parseCellReference(destinationCell)

                    let cellsCopied = 0
                    for (let srcRow = srcStart.row; srcRow <= srcEnd.row; srcRow++) {
                        for (let srcCol = srcStart.col; srcCol <= srcEnd.col; srcCol++) {
                            const destRow = dest.row + (srcRow - srcStart.row)
                            const destCol = dest.col + (srcCol - srcStart.col)

                            if (sheet.cellData[srcRow]?.[srcCol]) {
                                if (!sheet.cellData[destRow]) sheet.cellData[destRow] = {}
                                sheet.cellData[destRow][destCol] = JSON.parse(JSON.stringify(sheet.cellData[srcRow][srcCol]))
                                cellsCopied++
                            }
                        }
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({ success: true, cellsCopied, message: `${cellsCopied} celdas copiadas de ${sourceRange} a ${destinationCell}` })
                        }]
                    }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'clear_range',
            description: 'Limpia contenido y/o formato de un rango de celdas.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                range: z.string().describe('Rango a limpiar (ej: A1:D10)'),
                clearType: z.enum(['all', 'contents', 'formats']).default('all').describe('Qué limpiar')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; clearType?: string; artifactId?: string }
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

                    const { range, clearType = 'all', artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !range) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const { start, end } = parseRange(range)

                    let cellsCleared = 0
                    for (let row = start.row; row <= end.row; row++) {
                        for (let col = start.col; col <= end.col; col++) {
                            if (sheet.cellData[row]?.[col]) {
                                if (clearType === 'all') {
                                    delete sheet.cellData[row][col]
                                } else if (clearType === 'contents') {
                                    delete sheet.cellData[row][col].v
                                } else if (clearType === 'formats') {
                                    delete sheet.cellData[row][col].s
                                }
                                cellsCleared++
                            }
                        }
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, cellsCleared, message: `${cellsCleared} celdas limpiadas` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'find_replace',
            description: 'Busca y reemplaza texto en la hoja de cálculo.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                find: z.string().describe('Texto a buscar'),
                replace: z.string().describe('Texto de reemplazo'),
                range: z.string().optional().describe('Rango opcional (si no se especifica, busca en toda la hoja)'),
                matchCase: z.boolean().optional().default(false)
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { find?: string; replace?: string; range?: string; matchCase?: boolean; artifactId?: string }
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

                    const { find, replace, range, matchCase = false, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !find || replace === undefined) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    let replacements = 0
                    const searchRange = range ? parseRange(range) : null

                    for (const rowStr of Object.keys(cellData)) {
                        const row = parseInt(rowStr)
                        if (searchRange && (row < searchRange.start.row || row > searchRange.end.row)) continue

                        for (const colStr of Object.keys(cellData[row] || {})) {
                            const col = parseInt(colStr)
                            if (searchRange && (col < searchRange.start.col || col > searchRange.end.col)) continue

                            const cell = cellData[row][col]
                            if (cell?.v !== undefined && typeof cell.v === 'string') {
                                const searchText = matchCase ? find : find.toLowerCase()
                                const cellText = matchCase ? cell.v : cell.v.toLowerCase()
                                if (cellText.includes(searchText)) {
                                    const regex = new RegExp(find, matchCase ? 'g' : 'gi')
                                    cell.v = cell.v.replace(regex, replace)
                                    replacements++
                                }
                            }
                        }
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, replacements, message: `${replacements} reemplazos realizados` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'freeze_panes',
            description: 'Congela filas y/o columnas para navegación más fácil.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                rows: z.number().optional().default(0).describe('Filas a congelar desde arriba (ej: 1 para congelar encabezado)'),
                columns: z.number().optional().default(0).describe('Columnas a congelar desde la izquierda')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { rows?: number; columns?: number; artifactId?: string }
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

                    const { rows = 0, columns = 0, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No hay hoja activa' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId] as Record<string, unknown>

                    sheet.freeze = { startRow: rows, startColumn: columns }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, frozenRows: rows, frozenColumns: columns, message: `Congeladas ${rows} fila(s) y ${columns} columna(s)` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'auto_fill',
            description: 'Auto-rellena un rango basado en un patrón (secuencias, fechas, fórmulas).',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                sourceRange: z.string().describe('Rango fuente con el patrón (ej: A1:A2 con valores 1,2)'),
                fillRange: z.string().describe('Rango destino a rellenar (ej: A1:A10)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { sourceRange?: string; fillRange?: string; artifactId?: string }
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

                    const { sourceRange, fillRange, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !sourceRange || !fillRange) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]

                    const src = parseRange(sourceRange)
                    const fill = parseRange(fillRange)

                    // Extract source values to detect pattern
                    const sourceValues: unknown[] = []
                    for (let row = src.start.row; row <= src.end.row; row++) {
                        for (let col = src.start.col; col <= src.end.col; col++) {
                            sourceValues.push(sheet.cellData[row]?.[col]?.v)
                        }
                    }

                    // Detect if it's a numeric sequence
                    const isNumericSequence = sourceValues.length >= 2 &&
                        sourceValues.every(v => typeof v === 'number') &&
                        sourceValues.length > 1

                    let step = 1
                    if (isNumericSequence && sourceValues.length >= 2) {
                        step = (sourceValues[1] as number) - (sourceValues[0] as number)
                    }

                    // Fill the range
                    let cellsFilled = 0
                    let valueIndex = 0
                    for (let row = fill.start.row; row <= fill.end.row; row++) {
                        for (let col = fill.start.col; col <= fill.end.col; col++) {
                            if (!sheet.cellData[row]) sheet.cellData[row] = {}

                            if (isNumericSequence) {
                                const baseValue = sourceValues[0] as number
                                sheet.cellData[row][col] = { v: baseValue + (step * valueIndex) }
                            } else {
                                // Repeat pattern
                                const patternIndex = valueIndex % sourceValues.length
                                sheet.cellData[row][col] = { v: sourceValues[patternIndex] }
                            }
                            valueIndex++
                            cellsFilled++
                        }
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, cellsFilled, message: `${cellsFilled} celdas auto-rellenadas` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'insert_column',
            description: 'Inserta una o más columnas nuevas en una posición específica.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                column: z.string().describe('Letra de columna donde insertar (ej: "B" inserta antes de B)'),
                count: z.number().optional().default(1).describe('Número de columnas a insertar'),
                headers: z.array(z.string()).optional().describe('Encabezados opcionales para las nuevas columnas')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { column?: string; count?: number; headers?: string[]; artifactId?: string }
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

                    const { column, count = 1, headers, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !column) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    // Convert column letter to index
                    const insertCol = column.toUpperCase().split('').reduce((acc, char) => acc * 26 + (char.charCodeAt(0) - 64), 0) - 1

                    // Shift existing columns to the right
                    for (const rowStr of Object.keys(cellData)) {
                        const row = parseInt(rowStr)
                        const newRowData: Record<number, unknown> = {}
                        for (const colStr of Object.keys(cellData[row] || {})) {
                            const col = parseInt(colStr)
                            if (col >= insertCol) {
                                newRowData[col + count] = cellData[row][col]
                            } else {
                                newRowData[col] = cellData[row][col]
                            }
                        }
                        sheet.cellData[row] = newRowData
                    }

                    // Add headers if provided
                    if (headers && headers.length > 0) {
                        if (!sheet.cellData[0]) sheet.cellData[0] = {}
                        for (let i = 0; i < Math.min(count, headers.length); i++) {
                            sheet.cellData[0][insertCol + i] = { v: headers[i], s: { bl: 1 } }
                        }
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, columnsInserted: count, message: `${count} columna(s) insertada(s) en ${column}` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'delete_column',
            description: 'Elimina una o más columnas de la hoja de cálculo.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                columns: z.array(z.string()).describe('Letras de columnas a eliminar (ej: ["B", "C"])')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { columns?: string[]; artifactId?: string }
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

                    const { columns, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !columns?.length) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    // Convert column letters to indices and sort descending
                    const colIndices = columns.map(c => c.toUpperCase().split('').reduce((acc, char) => acc * 26 + (char.charCodeAt(0) - 64), 0) - 1).sort((a, b) => b - a)

                    // Delete each column (from right to left to maintain indices)
                    for (const deleteCol of colIndices) {
                        for (const rowStr of Object.keys(cellData)) {
                            const row = parseInt(rowStr)
                            const newRowData: Record<number, unknown> = {}
                            for (const colStr of Object.keys(cellData[row] || {})) {
                                const col = parseInt(colStr)
                                if (col < deleteCol) {
                                    newRowData[col] = cellData[row][col]
                                } else if (col > deleteCol) {
                                    newRowData[col - 1] = cellData[row][col]
                                }
                                // Skip col === deleteCol (delete it)
                            }
                            sheet.cellData[row] = newRowData
                        }
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, columnsDeleted: columns.length, message: `${columns.length} columna(s) eliminada(s)` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'duplicate_row',
            description: 'Duplica una fila existente, insertando la copia debajo.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                row: z.number().describe('Número de fila a duplicar (1-indexed)'),
                count: z.number().optional().default(1).describe('Número de copias')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { row?: number; count?: number; artifactId?: string }
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

                    const { row, count = 1, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !row) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}

                    const srcRow = row - 1 // Convert to 0-indexed
                    const sourceRowData = cellData[srcRow] ? JSON.parse(JSON.stringify(cellData[srcRow])) : {}

                    // Shift rows down
                    const maxRow = Math.max(...Object.keys(cellData).map(Number))
                    for (let r = maxRow; r > srcRow; r--) {
                        if (cellData[r]) {
                            cellData[r + count] = cellData[r]
                        }
                    }

                    // Insert duplicates
                    for (let i = 0; i < count; i++) {
                        cellData[srcRow + 1 + i] = JSON.parse(JSON.stringify(sourceRowData))
                    }

                    sheet.cellData = cellData

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, rowsDuplicated: count, message: `Fila ${row} duplicada ${count} vez/veces` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'calculate_range',
            description: 'Calcula estadísticas para un rango numérico: suma, promedio, mín, máx, cuenta.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                range: z.string().describe('Rango de celdas (ej: A1:A100)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; artifactId?: string }
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

                    const { range, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !range) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}
                    const { start, end } = parseRange(range)

                    const values: number[] = []
                    for (let row = start.row; row <= end.row; row++) {
                        for (let col = start.col; col <= end.col; col++) {
                            const val = cellData[row]?.[col]?.v
                            if (typeof val === 'number') {
                                values.push(val)
                            } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
                                values.push(parseFloat(val))
                            }
                        }
                    }

                    if (values.length === 0) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'No se encontraron valores numéricos', count: 0 }) }] }
                    }

                    const sum = values.reduce((a, b) => a + b, 0)
                    const avg = sum / values.length
                    const min = Math.min(...values)
                    const max = Math.max(...values)

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                range,
                                count: values.length,
                                sum: Math.round(sum * 100) / 100,
                                average: Math.round(avg * 100) / 100,
                                min,
                                max,
                                message: `Rango ${range}: Suma=${sum.toFixed(2)}, Promedio=${avg.toFixed(2)}, Mín=${min}, Máx=${max}`
                            })
                        }]
                    }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'remove_duplicates',
            description: 'Elimina filas duplicadas basándose en columnas específicas.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                range: z.string().describe('Rango donde buscar duplicados (ej: A1:D100)'),
                columns: z.array(z.string()).optional().describe('Columnas a comparar (ej: ["A", "B"]). Si no se especifica, compara todas.')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { range?: string; columns?: string[]; artifactId?: string }
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

                    const { range, columns, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !range) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const cellData = sheet.cellData || {}
                    const { start, end } = parseRange(range)

                    // Convert column letters to indices if provided
                    const compareColumns = columns?.map(c => c.toUpperCase().split('').reduce((acc, char) => acc * 26 + (char.charCodeAt(0) - 64), 0) - 1)

                    const seen = new Set<string>()
                    const rowsToDelete: number[] = []

                    for (let row = start.row; row <= end.row; row++) {
                        const keyParts: string[] = []
                        for (let col = start.col; col <= end.col; col++) {
                            if (!compareColumns || compareColumns.includes(col)) {
                                keyParts.push(String(cellData[row]?.[col]?.v ?? ''))
                            }
                        }
                        const key = keyParts.join('|')

                        if (seen.has(key)) {
                            rowsToDelete.push(row)
                        } else {
                            seen.add(key)
                        }
                    }

                    // Delete duplicate rows (from bottom to top)
                    rowsToDelete.sort((a, b) => b - a)
                    for (const row of rowsToDelete) {
                        delete cellData[row]
                        // Shift remaining rows up
                        for (let r = row + 1; r <= end.row + rowsToDelete.length; r++) {
                            if (cellData[r]) {
                                cellData[r - 1] = cellData[r]
                                delete cellData[r]
                            }
                        }
                    }

                    sheet.cellData = cellData

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, duplicatesRemoved: rowsToDelete.length, message: `${rowsToDelete.length} fila(s) duplicada(s) eliminada(s)` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'transpose_range',
            description: 'Transpone un rango, intercambiando filas y columnas.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                sourceRange: z.string().describe('Rango origen (ej: A1:C3)'),
                destinationCell: z.string().describe('Celda destino superior izquierda')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { sourceRange?: string; destinationCell?: string; artifactId?: string }
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

                    const { sourceRange, destinationCell, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !sourceRange || !destinationCell) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]

                    const { start, end } = parseRange(sourceRange)
                    const dest = parseCellReference(destinationCell)

                    // Read source data
                    const sourceData: unknown[][] = []
                    for (let row = start.row; row <= end.row; row++) {
                        const rowData: unknown[] = []
                        for (let col = start.col; col <= end.col; col++) {
                            rowData.push(sheet.cellData[row]?.[col] ? JSON.parse(JSON.stringify(sheet.cellData[row][col])) : null)
                        }
                        sourceData.push(rowData)
                    }

                    // Write transposed data
                    for (let srcRow = 0; srcRow < sourceData.length; srcRow++) {
                        for (let srcCol = 0; srcCol < sourceData[srcRow].length; srcCol++) {
                            const destRow = dest.row + srcCol
                            const destCol = dest.col + srcRow
                            if (!sheet.cellData[destRow]) sheet.cellData[destRow] = {}
                            if (sourceData[srcRow][srcCol]) {
                                sheet.cellData[destRow][destCol] = sourceData[srcRow][srcCol]
                            }
                        }
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    const rows = end.row - start.row + 1
                    const cols = end.col - start.col + 1
                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Rango ${rows}x${cols} transpuesto a ${cols}x${rows}` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'add_comment',
            description: 'Agrega un comentario/nota a una celda.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                cell: z.string().describe('Referencia de celda (ej: A1)'),
                comment: z.string().describe('Texto del comentario'),
                author: z.string().optional().describe('Nombre del autor')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { cell?: string; comment?: string; author?: string; artifactId?: string }
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

                    const { cell, comment, author = 'AI Agent', artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !cell || !comment) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId] as Record<string, unknown>
                    const { row, col } = parseCellReference(cell)

                    // Initialize comments structure if needed
                    if (!sheet.comments) sheet.comments = {}
                    const comments = sheet.comments as Record<string, unknown>
                    const commentKey = `${row},${col}`

                    comments[commentKey] = {
                        row,
                        col,
                        text: comment,
                        author,
                        timestamp: new Date().toISOString()
                    }

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, cell, message: `Comentario agregado a ${cell}` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'rename_sheet',
            description: 'Renombra la pestaña de la hoja de trabajo.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                newName: z.string().describe('Nuevo nombre para la hoja')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { newName?: string; artifactId?: string }
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

                    const { newName, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !newName) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId] as Record<string, unknown>

                    const oldName = sheet.name
                    sheet.name = newName

                    const tableName = artifact.isUserFile ? 'user_files' : 'artifacts'
                    await supabase.from(tableName).update({ univer_data: univerData, updated_at: new Date().toISOString() }).eq('id', targetId)
                    notifyArtifactUpdate(targetId, univerData, 'spreadsheet', artifact.isUserFile ? targetId : undefined)

                    return { content: [{ type: 'text', text: JSON.stringify({ success: true, oldName, newName, message: `Hoja renombrada a "${newName}"` }) }] }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
                }
            }
        },
        {
            name: 'get_cell_value',
            description: 'Obtiene el valor de una celda específica, incluyendo fórmula y formato.',
            inputSchema: z.object({
                artifactId: z.string().optional(),
                cell: z.string().describe('Referencia de celda (ej: A1)')
            }),
            handler: async (rawArgs) => {
                try {
                    let args: { cell?: string; artifactId?: string }
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

                    const { cell, artifactId: providedArtifactId } = args
                    const targetId = getTargetId(providedArtifactId, context)

                    if (!targetId || !context.userId || !cell) {
                        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Parámetros faltantes' }) }], isError: true }
                    }

                    const artifact = await getArtifactWithOwnership(targetId, context.userId)
                    const univerData = artifact.univer_data
                    const sheetId = Object.keys(univerData.sheets)[0]
                    const sheet = univerData.sheets[sheetId]
                    const { row, col } = parseCellReference(cell)

                    const cellData = sheet.cellData[row]?.[col]

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                cell,
                                value: cellData?.v ?? null,
                                formula: cellData?.f ?? null,
                                hasStyle: !!cellData?.s,
                                isEmpty: !cellData
                            })
                        }]
                    }
                } catch (error) {
                    return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Error' }) }], isError: true }
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

    return tools
}

/**
 * Type for creating SDK MCP server (imported dynamically)
 */
export type { McpToolDefinition }
