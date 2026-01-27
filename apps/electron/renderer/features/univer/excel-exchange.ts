/**
 * Excel Import/Export utilities using ExcelJS
 * 
 * Converts between Univer's IWorkbookData format and .xlsx files
 */

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

// Univer cell data structure (simplified)
interface UniverCellData {
    v?: string | number | boolean | null  // value
    f?: string  // formula
    s?: {  // style
        bl?: number  // bold (1 = true)
        it?: number  // italic
        fs?: number  // font size
        cl?: { rgb: string }  // font color
        bg?: { rgb: string }  // background color
        ht?: number  // horizontal alignment (1=left, 2=center, 3=right)
        vt?: number  // vertical alignment (1=top, 2=middle, 3=bottom)
        bd?: {  // borders
            t?: { s: number; cl?: { rgb: string } }
            b?: { s: number; cl?: { rgb: string } }
            l?: { s: number; cl?: { rgb: string } }
            r?: { s: number; cl?: { rgb: string } }
        }
    }
}

interface UniverSheetData {
    id: string
    name: string
    rowCount: number
    columnCount: number
    cellData: Record<number, Record<number, UniverCellData>>
    mergeData?: Array<{
        startRow: number
        endRow: number
        startColumn: number
        endColumn: number
    }>
    columnData?: Record<number, { w?: number }>
    rowData?: Record<number, { h?: number }>
}

interface UniverWorkbookData {
    id: string
    name: string
    sheetOrder: string[]
    sheets: Record<string, UniverSheetData>
}

function buildWorkbook(univerData: UniverWorkbookData): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'S-AGI'
    workbook.created = new Date()

    // Process each sheet in order
    for (const sheetId of univerData.sheetOrder) {
        const sheetData = univerData.sheets[sheetId]
        if (!sheetData) continue

        const worksheet = workbook.addWorksheet(sheetData.name)

        // Set column widths
        if (sheetData.columnData) {
            for (const [colIndex, colData] of Object.entries(sheetData.columnData)) {
                const col = worksheet.getColumn(Number(colIndex) + 1)
                if (colData.w) {
                    // Univer uses pixels, Excel uses character width (approximately)
                    col.width = colData.w / 7
                }
            }
        }

        // Process cell data
        for (const [rowIndex, rowCells] of Object.entries(sheetData.cellData)) {
            const rowNum = Number(rowIndex) + 1  // Excel is 1-indexed
            const row = worksheet.getRow(rowNum)

            // Set row height if specified
            const rowHeight = sheetData.rowData?.[Number(rowIndex)]?.h
            if (rowHeight !== undefined) {
                row.height = rowHeight
            }

            for (const [colIndex, cellData] of Object.entries(rowCells)) {
                const colNum = Number(colIndex) + 1  // Excel is 1-indexed
                const cell = row.getCell(colNum)

                // Set value or formula
                if (cellData.f && cellData.f.startsWith('=')) {
                    cell.value = { formula: cellData.f.slice(1), result: cellData.v ?? undefined }
                } else {
                    cell.value = cellData.v ?? ''
                }

                // Apply styles
                if (cellData.s) {
                    const style = cellData.s
                    
                    // Font styling
                    cell.font = {
                        bold: style.bl === 1,
                        italic: style.it === 1,
                        size: style.fs || 11,
                        color: style.cl?.rgb ? { argb: normalizeColor(style.cl.rgb) } : undefined
                    }

                    // Background fill
                    if (style.bg?.rgb) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: normalizeColor(style.bg.rgb) }
                        }
                    }

                    // Alignment
                    cell.alignment = {
                        horizontal: style.ht === 1 ? 'left' : style.ht === 2 ? 'center' : style.ht === 3 ? 'right' : undefined,
                        vertical: style.vt === 1 ? 'top' : style.vt === 2 ? 'middle' : style.vt === 3 ? 'bottom' : undefined
                    }

                    // Borders
                    if (style.bd) {
                        cell.border = {
                            top: style.bd.t ? { style: getBorderStyle(style.bd.t.s), color: { argb: normalizeColor(style.bd.t.cl?.rgb || '#000000') } } : undefined,
                            bottom: style.bd.b ? { style: getBorderStyle(style.bd.b.s), color: { argb: normalizeColor(style.bd.b.cl?.rgb || '#000000') } } : undefined,
                            left: style.bd.l ? { style: getBorderStyle(style.bd.l.s), color: { argb: normalizeColor(style.bd.l.cl?.rgb || '#000000') } } : undefined,
                            right: style.bd.r ? { style: getBorderStyle(style.bd.r.s), color: { argb: normalizeColor(style.bd.r.cl?.rgb || '#000000') } } : undefined
                        }
                    }
                }
            }
        }

        // Apply merged cells
        if (sheetData.mergeData) {
            for (const merge of sheetData.mergeData) {
                worksheet.mergeCells(
                    merge.startRow + 1,
                    merge.startColumn + 1,
                    merge.endRow + 1,
                    merge.endColumn + 1
                )
            }
        }
    }

    return workbook
}

export async function exportToExcelBuffer(
    univerData: UniverWorkbookData
): Promise<ArrayBuffer> {
    const workbook = buildWorkbook(univerData)
    const buffer = await workbook.xlsx.writeBuffer()
    return buffer as ArrayBuffer
}

/**
 * Export Univer workbook data to Excel (.xlsx) file
 */
export async function exportToExcel(
    univerData: UniverWorkbookData,
    filename: string = 'spreadsheet.xlsx'
): Promise<void> {
    // Generate blob and trigger download
    const buffer = await exportToExcelBuffer(univerData)
    const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    })
    saveAs(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/**
 * Import Excel (.xlsx) file to Univer workbook data format
 */
export async function importFromExcel(file: File): Promise<UniverWorkbookData> {
    const buffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const workbookId = `workbook-${Date.now()}`
    const sheetOrder: string[] = []
    const sheets: Record<string, UniverSheetData> = {}

    workbook.eachSheet((worksheet, sheetId) => {
        const sheetKey = `sheet${sheetId}`
        sheetOrder.push(sheetKey)

        const cellData: Record<number, Record<number, UniverCellData>> = {}
        const columnData: Record<number, { w?: number }> = {}
        const rowData: Record<number, { h?: number }> = {}
        const mergeData: UniverSheetData['mergeData'] = []

        // Process column widths (columns can be null in ExcelJS for empty sheets)
        const worksheetColumns = Array.isArray(worksheet.columns) ? worksheet.columns : []
        worksheetColumns.forEach((col, index) => {
            if (col?.width) {
                columnData[index] = { w: Math.round(col.width * 7) }  // Convert to pixels
            }
        })

        // Process rows
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            const rowIndex = rowNumber - 1  // Convert to 0-indexed

            // Row height
            if (row.height) {
                rowData[rowIndex] = { h: row.height }
            }

            // Process cells
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                const colIndex = colNumber - 1  // Convert to 0-indexed
                
                if (!cellData[rowIndex]) {
                    cellData[rowIndex] = {}
                }

                const univerCell: UniverCellData = {}

                // Value/formula
                if (cell.formula) {
                    univerCell.f = `=${cell.formula}`
                    univerCell.v = cell.result as string | number | boolean | null
                } else {
                    univerCell.v = cell.value as string | number | boolean | null
                }

                // Styles
                const style: UniverCellData['s'] = {}
                let hasStyle = false

                // Font
                if (cell.font) {
                    if (cell.font.bold) { style.bl = 1; hasStyle = true }
                    if (cell.font.italic) { style.it = 1; hasStyle = true }
                    if (cell.font.size) { style.fs = cell.font.size; hasStyle = true }
                    if (cell.font.color?.argb) {
                        style.cl = { rgb: `#${cell.font.color.argb.slice(2)}` }
                        hasStyle = true
                    }
                }

                // Fill
                if (cell.fill && cell.fill.type === 'pattern') {
                    const patternFill = cell.fill as ExcelJS.FillPattern
                    if (patternFill.fgColor?.argb) {
                        style.bg = { rgb: `#${patternFill.fgColor.argb.slice(2)}` }
                        hasStyle = true
                    }
                }

                // Alignment
                if (cell.alignment) {
                    if (cell.alignment.horizontal === 'left') { style.ht = 1; hasStyle = true }
                    else if (cell.alignment.horizontal === 'center') { style.ht = 2; hasStyle = true }
                    else if (cell.alignment.horizontal === 'right') { style.ht = 3; hasStyle = true }

                    if (cell.alignment.vertical === 'top') { style.vt = 1; hasStyle = true }
                    else if (cell.alignment.vertical === 'middle') { style.vt = 2; hasStyle = true }
                    else if (cell.alignment.vertical === 'bottom') { style.vt = 3; hasStyle = true }
                }

                // Borders
                if (cell.border) {
                    style.bd = {}
                    if (cell.border.top) {
                        style.bd.t = { s: parseExcelBorderStyle(cell.border.top.style) }
                        hasStyle = true
                    }
                    if (cell.border.bottom) {
                        style.bd.b = { s: parseExcelBorderStyle(cell.border.bottom.style) }
                        hasStyle = true
                    }
                    if (cell.border.left) {
                        style.bd.l = { s: parseExcelBorderStyle(cell.border.left.style) }
                        hasStyle = true
                    }
                    if (cell.border.right) {
                        style.bd.r = { s: parseExcelBorderStyle(cell.border.right.style) }
                        hasStyle = true
                    }
                }

                if (hasStyle) {
                    univerCell.s = style
                }

                cellData[rowIndex][colIndex] = univerCell
            })
        })

        // Process merged cells
        // ExcelJS stores merges as "A1:B2" format strings
        const mergedCells = Object.keys((worksheet as any)._merges || {})
        for (const mergeRange of mergedCells) {
            const [start, end] = mergeRange.split(':')
            const startRef = parseCellReference(start)
            const endRef = parseCellReference(end)
            
            mergeData.push({
                startRow: startRef.row,
                endRow: endRef.row,
                startColumn: startRef.col,
                endColumn: endRef.col
            })
        }

        sheets[sheetKey] = {
            id: sheetKey,
            name: worksheet.name,
            rowCount: Math.max(100, worksheet.rowCount + 10),
            columnCount: Math.max(26, worksheet.columnCount + 2),
            cellData,
            columnData: Object.keys(columnData).length > 0 ? columnData : undefined,
            rowData: Object.keys(rowData).length > 0 ? rowData : undefined,
            mergeData: mergeData.length > 0 ? mergeData : undefined
        }
    })

    return {
        id: workbookId,
        name: file.name.replace(/\.xlsx?$/i, ''),
        sheetOrder,
        sheets
    }
}

// Helper functions

function normalizeColor(color: string): string {
    // Convert #RGB or #RRGGBB to ARGB format (FF prefix for full opacity)
    if (color.startsWith('#')) {
        color = color.slice(1)
    }
    if (color.length === 3) {
        color = color.split('').map(c => c + c).join('')
    }
    return `FF${color.toUpperCase()}`
}

function getBorderStyle(style: number): ExcelJS.BorderStyle {
    switch (style) {
        case 1: return 'thin'
        case 2: return 'medium'
        case 3: return 'thick'
        case 4: return 'dashed'
        case 5: return 'dotted'
        default: return 'thin'
    }
}

function parseExcelBorderStyle(style?: ExcelJS.BorderStyle): number {
    switch (style) {
        case 'thin': return 1
        case 'medium': return 2
        case 'thick': return 3
        case 'dashed': return 4
        case 'dotted': return 5
        default: return 1
    }
}

function parseCellReference(ref: string): { row: number; col: number } {
    const match = ref.match(/^([A-Z]+)(\d+)$/i)
    if (!match) {
        return { row: 0, col: 0 }
    }
    
    const colStr = match[1].toUpperCase()
    const rowStr = match[2]
    
    // Convert column letters to index (A=0, B=1, ..., Z=25, AA=26, etc.)
    let col = 0
    for (let i = 0; i < colStr.length; i++) {
        col = col * 26 + (colStr.charCodeAt(i) - 64)
    }
    col -= 1  // Convert to 0-indexed
    
    const row = parseInt(rowStr, 10) - 1  // Convert to 0-indexed
    
    return { row, col }
}
