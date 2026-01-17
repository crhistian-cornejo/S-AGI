import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import log from 'electron-log'

/**
 * Tool execution router - executes spreadsheet tools in the main process
 * This enables the Agent Loop to run tools and get results without renderer involvement
 */

// Helper: Create Univer workbook data structure
function createUniverWorkbook(name: string, columns: string[], rows: any[][] = []): any {
    const sheetId = 'sheet1'
    const cellData: Record<number, Record<number, any>> = {}

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

// Helper: Parse cell reference (e.g., "A1" -> { row: 0, col: 0 })
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

// Tool definitions with their schemas
// IMPORTANT: Avoid z.any() and nested z.array() as OpenAI JSON Schema conversion doesn't handle them well
// For 2D arrays, use JSON string that we parse on execution
const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const SPREADSHEET_TOOLS = {
    create_spreadsheet: {
        description: 'Create a new spreadsheet with column headers and optional initial data.',
        inputSchema: z.object({
            name: z.string().describe('Name of the spreadsheet'),
            columns: z.array(z.string()).describe('Column headers (array of strings)'),
            // Using JSON string to avoid nested array schema issues with OpenAI
            rows: z.string().optional().describe('Optional: JSON string of 2D array for initial row data. Example: [["John", 25, true], ["Jane", 30, false]]. Each inner array is a row with values matching column order. Omit if no initial data needed.')
        })
    },
    update_cells: {
        description: 'Update multiple cells in a spreadsheet',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            updates: z.array(z.object({
                row: z.number().describe('Row index (0-based, 0 is header)'),
                column: z.number().describe('Column index (0-based)'),
                value: CellValueSchema.describe('Cell value')
            })).describe('Array of cell updates')
        })
    },
    insert_formula: {
        description: 'Insert a formula into a spreadsheet cell',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            cell: z.string().describe('Cell reference (e.g., A1, B2)'),
            formula: z.string().describe('Excel-style formula (e.g., =SUM(A1:A10))')
        })
    },
    format_cells: {
        description: 'Apply comprehensive formatting to a range of cells including fonts, colors, alignment, borders, and number formats',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range (e.g., A1:B5 or just A1 for single cell)'),
            format: z.object({
                // Font styling
                bold: z.boolean().optional().describe('Make text bold'),
                italic: z.boolean().optional().describe('Make text italic'),
                underline: z.boolean().optional().describe('Underline text'),
                strikethrough: z.boolean().optional().describe('Strikethrough text'),
                fontSize: z.number().optional().describe('Font size in points (e.g., 12, 14, 18)'),
                fontColor: z.string().optional().describe('Text color as hex (e.g., #FF0000 for red)'),
                fontFamily: z.string().optional().describe('Font family name (e.g., Arial, Times New Roman)'),
                // Cell background
                backgroundColor: z.string().optional().describe('Background color as hex (e.g., #FFFF00 for yellow)'),
                // Alignment
                horizontalAlign: z.enum(['left', 'center', 'right']).optional().describe('Horizontal text alignment'),
                verticalAlign: z.enum(['top', 'middle', 'bottom']).optional().describe('Vertical text alignment'),
                textWrap: z.boolean().optional().describe('Enable text wrapping in cells'),
                // Number formatting
                numberFormat: z.string().optional().describe('Number format pattern (e.g., #,##0.00 for thousands separator, 0.00% for percentage, $#,##0.00 for currency)'),
                // Borders
                border: z.object({
                    style: z.enum(['thin', 'medium', 'thick', 'dashed', 'dotted']).optional(),
                    color: z.string().optional().describe('Border color as hex'),
                    sides: z.array(z.enum(['top', 'bottom', 'left', 'right', 'all'])).optional().describe('Which sides to apply border')
                }).optional().describe('Border styling options')
            }).describe('Formatting options to apply')
        })
    },
    merge_cells: {
        description: 'Merge a range of cells into one',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range to merge (e.g., A1:C1)')
        })
    },
    set_column_width: {
        description: 'Set the width of one or more columns',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            columns: z.array(z.string()).describe('Column letters (e.g., ["A", "B", "C"])'),
            width: z.number().describe('Width in pixels (e.g., 100, 150, 200)')
        })
    },
    set_row_height: {
        description: 'Set the height of one or more rows',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            rows: z.array(z.number()).describe('Row numbers (1-based, e.g., [1, 2, 3])'),
            height: z.number().describe('Height in pixels (e.g., 25, 40, 60)')
        })
    },
    add_row: {
        description: 'Add a new row of data to an existing spreadsheet',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            values: z.array(CellValueSchema).describe('Values for the new row'),
            position: z.enum(['append', 'prepend']).default('append').describe('Where to add the row')
        })
    },
    delete_row: {
        description: 'Delete one or more rows from a spreadsheet',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            rows: z.array(z.number()).describe('Row numbers to delete (1-based, header is row 1)')
        })
    },
    get_spreadsheet_summary: {
        description: 'Get a summary of spreadsheet contents including headers, row count, and sample data. Use this to understand the current state before making modifications.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            maxRows: z.number().optional().default(10).describe('Maximum rows to include in summary')
        })
    }
}

// Tool execution functions
async function executeCreateSpreadsheet(
    args: z.infer<typeof SPREADSHEET_TOOLS.create_spreadsheet.inputSchema>,
    chatId: string,
    _userId: string
): Promise<{ artifactId: string; message: string }> {
    const { name, columns, rows: rowsJson } = args
    
    // Parse rows from JSON string if provided
    let parsedRows: any[][] = []
    if (rowsJson) {
        try {
            parsedRows = JSON.parse(rowsJson)
            if (!Array.isArray(parsedRows)) {
                throw new Error('Rows must be an array')
            }
        } catch (e) {
            log.warn(`[Tools] Failed to parse rows JSON: ${e}`)
            parsedRows = []
        }
    }
    
    const univerData = createUniverWorkbook(name, columns, parsedRows)
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .insert({
            chat_id: chatId,
            type: 'spreadsheet',
            name,
            content: { columnCount: columns.length, rowCount: parsedRows.length },
            univer_data: univerData
        })
        .select()
        .single()

    if (error) throw new Error(`Failed to create spreadsheet: ${error.message}`)
    
    log.info(`[Tools] Created spreadsheet artifact: ${artifact.id}`)
    return { artifactId: artifact.id, message: `Created spreadsheet "${name}" with ${columns.length} columns and ${parsedRows.length} rows` }
}

async function executeUpdateCells(
    args: z.infer<typeof SPREADSHEET_TOOLS.update_cells.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, updates } = args
    
    // Get artifact with ownership check
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    updates.forEach(({ row, column, value }) => {
        if (!sheet.cellData[row]) sheet.cellData[row] = {}
        sheet.cellData[row][column] = { v: value }
    })

    await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    log.info(`[Tools] Updated ${updates.length} cells in spreadsheet: ${artifactId}`)
    return { artifactId, message: `Updated ${updates.length} cells` }
}

async function executeInsertFormula(
    args: z.infer<typeof SPREADSHEET_TOOLS.insert_formula.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, cell, formula } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const { row, col } = parseCellReference(cell)
    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    if (!sheet.cellData[row]) sheet.cellData[row] = {}
    sheet.cellData[row][col] = { v: formula, f: formula }

    await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    log.info(`[Tools] Inserted formula in ${cell}: ${formula}`)
    return { artifactId, message: `Inserted formula ${formula} in cell ${cell}` }
}

// Helper: Convert alignment to Univer format
function getHorizontalAlign(align: string): number {
    switch (align) {
        case 'left': return 1
        case 'center': return 2
        case 'right': return 3
        default: return 1
    }
}

function getVerticalAlign(align: string): number {
    switch (align) {
        case 'top': return 1
        case 'middle': return 2
        case 'bottom': return 3
        default: return 2
    }
}

// Helper: Convert border style to Univer format
function getBorderStyle(style: string): number {
    switch (style) {
        case 'thin': return 1
        case 'medium': return 2
        case 'thick': return 3
        case 'dashed': return 4
        case 'dotted': return 5
        default: return 1
    }
}

async function executeFormatCells(
    args: z.infer<typeof SPREADSHEET_TOOLS.format_cells.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, range, format } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    // Parse range (e.g., "A1:B5")
    const [startCell, endCell] = range.split(':')
    const start = parseCellReference(startCell)
    const end = endCell ? parseCellReference(endCell) : start

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

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
            if (format.underline !== undefined) cell.s.ul = format.underline ? { s: 1 } : undefined
            if (format.strikethrough !== undefined) cell.s.st = format.strikethrough ? { s: 1 } : undefined
            if (format.fontSize !== undefined) cell.s.fs = format.fontSize
            if (format.fontColor) cell.s.cl = { rgb: format.fontColor }
            if (format.fontFamily) cell.s.ff = format.fontFamily
            
            // Background
            if (format.backgroundColor) cell.s.bg = { rgb: format.backgroundColor }
            
            // Alignment
            if (format.horizontalAlign) cell.s.ht = getHorizontalAlign(format.horizontalAlign)
            if (format.verticalAlign) cell.s.vt = getVerticalAlign(format.verticalAlign)
            if (format.textWrap !== undefined) cell.s.tb = format.textWrap ? 2 : 1 // 2=wrap, 1=overflow
            
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

    await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    const cellCount = (end.row - start.row + 1) * (end.col - start.col + 1)
    log.info(`[Tools] Formatted ${cellCount} cells in range ${range}`)
    return { artifactId, message: `Applied formatting to ${cellCount} cells in range ${range}` }
}

async function executeAddRow(
    args: z.infer<typeof SPREADSHEET_TOOLS.add_row.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; newRowIndex: number }> {
    const { artifactId, values, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    // Find the last row with data
    const rowIndices = Object.keys(sheet.cellData).map(Number)
    const maxRow = rowIndices.length > 0 ? Math.max(...rowIndices) : 0
    const newRowIndex = position === 'append' ? maxRow + 1 : 1

    // If prepending, shift all existing rows down
    if (position === 'prepend') {
        const newCellData: Record<number, any> = { 0: sheet.cellData[0] } // Keep header
        for (let i = 1; i <= maxRow; i++) {
            if (sheet.cellData[i]) {
                newCellData[i + 1] = sheet.cellData[i]
            }
        }
        sheet.cellData = newCellData
    }

    // Add new row
    sheet.cellData[newRowIndex] = {}
    values.forEach((value, colIndex) => {
        sheet.cellData[newRowIndex][colIndex] = { v: value }
    })

    // Update row count if needed
    sheet.rowCount = Math.max(sheet.rowCount, newRowIndex + 10)

    await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    log.info(`[Tools] Added row at index ${newRowIndex}`)
    return { artifactId, message: `Added new row with ${values.length} values`, newRowIndex }
}

async function executeGetSummary(
    args: z.infer<typeof SPREADSHEET_TOOLS.get_spreadsheet_summary.inputSchema>,
    userId: string
): Promise<{ summary: string; headers: string[]; rowCount: number; sampleData: any[][] }> {
    const { artifactId, maxRows } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    // Extract headers (row 0)
    const headers: string[] = []
    if (sheet.cellData[0]) {
        const colCount = Math.max(...Object.keys(sheet.cellData[0]).map(Number)) + 1
        for (let col = 0; col < colCount; col++) {
            headers.push(sheet.cellData[0]?.[col]?.v?.toString() || '')
        }
    }

    // Extract sample data
    const rowIndices = Object.keys(sheet.cellData).map(Number).filter(i => i > 0).sort((a, b) => a - b)
    const sampleData: any[][] = []
    
    for (const rowIdx of rowIndices.slice(0, maxRows)) {
        const row: any[] = []
        for (let col = 0; col < headers.length; col++) {
            row.push(sheet.cellData[rowIdx]?.[col]?.v ?? '')
        }
        sampleData.push(row)
    }

    const summary = `Spreadsheet "${artifact.name}" has ${headers.length} columns and ${rowIndices.length} data rows. Headers: ${headers.join(', ')}`
    
    return { summary, headers, rowCount: rowIndices.length, sampleData }
}

// Helper: Parse column letter to index (A=0, B=1, ..., Z=25, AA=26, etc.)
function parseColumnLetter(col: string): number {
    return col.toUpperCase().split('').reduce((acc, char) => 
        acc * 26 + (char.charCodeAt(0) - 64), 0) - 1
}

async function executeMergeCells(
    args: z.infer<typeof SPREADSHEET_TOOLS.merge_cells.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, range } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const [startCell, endCell] = range.split(':')
    const start = parseCellReference(startCell)
    const end = endCell ? parseCellReference(endCell) : start

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    // Initialize mergeData if not present
    if (!sheet.mergeData) sheet.mergeData = []

    // Add merge definition
    sheet.mergeData.push({
        startRow: start.row,
        endRow: end.row,
        startColumn: start.col,
        endColumn: end.col
    })

    await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    log.info(`[Tools] Merged cells ${range}`)
    return { artifactId, message: `Merged cells in range ${range}` }
}

async function executeSetColumnWidth(
    args: z.infer<typeof SPREADSHEET_TOOLS.set_column_width.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, columns, width } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    // Initialize columnData if not present
    if (!sheet.columnData) sheet.columnData = {}

    // Set width for each column
    for (const colLetter of columns) {
        const colIndex = parseColumnLetter(colLetter)
        if (!sheet.columnData[colIndex]) sheet.columnData[colIndex] = {}
        sheet.columnData[colIndex].w = width
    }

    await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    log.info(`[Tools] Set column width for ${columns.join(', ')} to ${width}px`)
    return { artifactId, message: `Set width of column(s) ${columns.join(', ')} to ${width}px` }
}

async function executeSetRowHeight(
    args: z.infer<typeof SPREADSHEET_TOOLS.set_row_height.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, rows, height } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    // Initialize rowData if not present
    if (!sheet.rowData) sheet.rowData = {}

    // Set height for each row (convert from 1-based to 0-based)
    for (const rowNum of rows) {
        const rowIndex = rowNum - 1
        if (!sheet.rowData[rowIndex]) sheet.rowData[rowIndex] = {}
        sheet.rowData[rowIndex].h = height
    }

    await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    log.info(`[Tools] Set row height for rows ${rows.join(', ')} to ${height}px`)
    return { artifactId, message: `Set height of row(s) ${rows.join(', ')} to ${height}px` }
}

async function executeDeleteRow(
    args: z.infer<typeof SPREADSHEET_TOOLS.delete_row.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, rows } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    // Sort rows in descending order to delete from bottom up (avoids index shifting issues)
    const sortedRows = [...rows].sort((a, b) => b - a)

    for (const rowNum of sortedRows) {
        const rowIndex = rowNum - 1 // Convert 1-based to 0-based
        
        // Delete the row data
        delete sheet.cellData[rowIndex]
        
        // Shift all rows above this one down
        const allRowIndices = Object.keys(sheet.cellData).map(Number).sort((a, b) => a - b)
        const newCellData: Record<number, any> = {}
        
        for (const idx of allRowIndices) {
            if (idx < rowIndex) {
                newCellData[idx] = sheet.cellData[idx]
            } else if (idx > rowIndex) {
                newCellData[idx - 1] = sheet.cellData[idx]
            }
        }
        
        sheet.cellData = newCellData
    }

    await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    log.info(`[Tools] Deleted rows ${rows.join(', ')}`)
    return { artifactId, message: `Deleted row(s) ${rows.join(', ')}` }
}

// Main tool execution function
export async function executeTool(
    toolName: string,
    args: unknown,
    chatId: string,
    userId: string
): Promise<unknown> {
    log.info(`[Tools] Executing tool: ${toolName}`, args)

    switch (toolName) {
        case 'create_spreadsheet':
            return executeCreateSpreadsheet(
                SPREADSHEET_TOOLS.create_spreadsheet.inputSchema.parse(args),
                chatId,
                userId
            )

        case 'update_cells':
            return executeUpdateCells(
                SPREADSHEET_TOOLS.update_cells.inputSchema.parse(args),
                userId
            )

        case 'insert_formula':
            return executeInsertFormula(
                SPREADSHEET_TOOLS.insert_formula.inputSchema.parse(args),
                userId
            )

        case 'format_cells':
            return executeFormatCells(
                SPREADSHEET_TOOLS.format_cells.inputSchema.parse(args),
                userId
            )

        case 'add_row':
            return executeAddRow(
                SPREADSHEET_TOOLS.add_row.inputSchema.parse(args),
                userId
            )

        case 'get_spreadsheet_summary':
            return executeGetSummary(
                SPREADSHEET_TOOLS.get_spreadsheet_summary.inputSchema.parse(args),
                userId
            )

        case 'merge_cells':
            return executeMergeCells(
                SPREADSHEET_TOOLS.merge_cells.inputSchema.parse(args),
                userId
            )

        case 'set_column_width':
            return executeSetColumnWidth(
                SPREADSHEET_TOOLS.set_column_width.inputSchema.parse(args),
                userId
            )

        case 'set_row_height':
            return executeSetRowHeight(
                SPREADSHEET_TOOLS.set_row_height.inputSchema.parse(args),
                userId
            )

        case 'delete_row':
            return executeDeleteRow(
                SPREADSHEET_TOOLS.delete_row.inputSchema.parse(args),
                userId
            )

        default:
            throw new Error(`Unknown tool: ${toolName}`)
    }
}

// Convert tools to API format
export function getToolsForAPI(provider: 'openai' | 'anthropic') {
    const tools = Object.entries(SPREADSHEET_TOOLS).map(([name, tool]) => {
        // Convert Zod schema to JSON Schema
        const zodToJsonSchema = (schema: z.ZodObject<any>): any => {
            const shape = schema.shape
            const properties: Record<string, any> = {}
            const required: string[] = []

            for (const [key, value] of Object.entries(shape)) {
                const zodType = value as z.ZodTypeAny
                const description = zodType.description || ''
                
                // Handle optional types
                const isOptional = zodType.isOptional()
                const innerType = isOptional ? (zodType as z.ZodOptional<any>)._def.innerType : zodType

                if (innerType instanceof z.ZodString) {
                    properties[key] = { type: 'string', description }
                } else if (innerType instanceof z.ZodNumber) {
                    properties[key] = { type: 'number', description }
                } else if (innerType instanceof z.ZodBoolean) {
                    properties[key] = { type: 'boolean', description }
                } else if (innerType instanceof z.ZodArray) {
                    properties[key] = { type: 'array', items: {}, description }
                } else if (innerType instanceof z.ZodObject) {
                    properties[key] = { type: 'object', properties: {}, description }
                } else if (innerType instanceof z.ZodEnum) {
                    properties[key] = { type: 'string', enum: innerType._def.values, description }
                } else {
                    properties[key] = { type: 'string', description }
                }

                if (!isOptional) {
                    required.push(key)
                }
            }

            return { type: 'object', properties, required }
        }

        const parameters = zodToJsonSchema(tool.inputSchema)

        if (provider === 'openai') {
            return {
                type: 'function' as const,
                function: { name, description: tool.description, parameters }
            }
        } else {
            return { name, description: tool.description, input_schema: parameters }
        }
    })

    return tools
}

// tRPC router for direct tool execution (used by renderer for manual tool calls)
export const toolsRouter = router({
    execute: protectedProcedure
        .input(z.object({
            toolName: z.string(),
            args: z.any(),
            chatId: z.string().uuid()
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify chat ownership
            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()

            if (!chat) throw new Error('Chat not found or access denied')

            return executeTool(input.toolName, input.args, input.chatId, ctx.userId)
        }),

    list: protectedProcedure.query(() => {
        return Object.entries(SPREADSHEET_TOOLS).map(([name, tool]) => ({
            name,
            description: tool.description
        }))
    })
})
