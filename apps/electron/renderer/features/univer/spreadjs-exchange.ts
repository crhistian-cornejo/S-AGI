/**
 * Excel Import/Export utilities using SpreadJS for maximum fidelity
 *
 * SpreadJS provides complete Excel compatibility including:
 * - Full cell styles (font, fill, borders, alignment) with 100% fidelity
 * - Images and drawings (native support)
 * - Charts (30+ types)
 * - Shapes and objects
 * - Pivot tables
 * - Conditional formatting
 * - Data validation
 * - Formulas (500+ Excel functions)
 * - Merged cells
 * - Column widths and row heights
 * - Hyperlinks
 * - Comments and notes
 */

import * as GC from '@mescius/spread-sheets'
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css'
import { saveAs } from 'file-saver'

// Import shapes plugin
import '@grapecity/spread-sheets-shapes'

// Excel IO is included in the main package, but we need to ensure it's available
// The Excel.IO class is part of GC.Spread.Excel.IO namespace

// ============================================
// UNIVER DATA TYPES
// ============================================

export interface UniverWorkbookData {
    id: string
    name: string
    sheetOrder: string[]
    sheets: Record<string, UniverSheetData>
    styles?: Record<string, UniverCellStyle>
    resources?: Array<{
        name: string
        data: string
    }>
    [key: string]: unknown
}

interface UniverSheetData {
    id: string
    name: string
    cellData: Record<string, Record<string, UniverCell>>
    rowCount?: number
    columnCount?: number
    defaultColumnWidth?: number
    defaultRowHeight?: number
    columnData?: Record<string, { w: number }>
    rowData?: Record<string, { h: number }>
    mergeData?: Array<{
        startRow: number
        endRow: number
        startColumn: number
        endColumn: number
    }>
    [key: string]: unknown
}

interface UniverCell {
    v: string | number | boolean
    s?: string | UniverCellStyle
    f?: string // formula
    [key: string]: unknown
}

interface UniverCellStyle {
    ff?: string // font family
    fs?: number // font size
    bl?: number // bold
    it?: number // italic
    ul?: number // underline
    cl?: { r: number; g: number; b: number } // color
    bg?: { r: number; g: number; b: number } // background color
    bd?: {
        t?: { s: number; cl: { r: number; g: number; b: number } }
        b?: { s: number; cl: { r: number; g: number; b: number } }
        l?: { s: number; cl: { r: number; g: number; b: number } }
        r?: { s: number; cl: { r: number; g: number; b: number } }
    } // borders
    ht?: number // horizontal alignment
    vt?: number // vertical alignment
    tb?: number // text wrap
    [key: string]: unknown
}

// ============================================
// FONT DETECTION AND VALIDATION
// ============================================

/**
 * Extract all unique fonts used in Univer workbook data
 */
function extractFontsFromUniverData(univerData: UniverWorkbookData): Set<string> {
    const fonts = new Set<string>()
    
    if (!univerData.sheets) return fonts
    
    for (const sheet of Object.values(univerData.sheets)) {
        if (sheet.cellData) {
            for (const row of Object.values(sheet.cellData)) {
                for (const cell of Object.values(row)) {
                    if (cell.s) {
                        const style = typeof cell.s === 'string' 
                            ? univerData.styles?.[cell.s] 
                            : cell.s as UniverCellStyle
                        if (style?.ff) {
                            fonts.add(style.ff.trim())
                        }
                    }
                }
            }
        }
    }
    
    return fonts
}

/**
 * Check if a font is available on the system
 */
async function isFontAvailable(fontFamily: string): Promise<boolean> {
    const normalized = fontFamily
        .replace(/['"]/g, '')
        .split(',')[0]
        .trim()
    
    if (!normalized) return false
    
    const commonSystemFonts = [
        'arial', 'helvetica', 'times new roman', 'times', 'courier new', 'courier',
        'verdana', 'georgia', 'palatino', 'garamond', 'bookman', 'comic sans ms',
        'trebuchet ms', 'arial black', 'impact', 'tahoma', 'lucida console',
        'lucida sans unicode', 'ms sans serif', 'ms serif', 'calibri',
        'cambria', 'candara', 'consolas', 'constantia', 'corbel', 'segoe ui'
    ]
    
    const normalizedLower = normalized.toLowerCase()
    if (commonSystemFonts.some(font => 
        normalizedLower === font || 
        normalizedLower.includes(font) ||
        font.includes(normalizedLower)
    )) {
        return true
    }
    
    if (typeof document !== 'undefined') {
        try {
            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            if (!context) return false
            
            context.font = '12px monospace'
            const baselineWidth = context.measureText('mmmmmmmmmmlli').width
            
            context.font = `12px "${normalized}", monospace`
            const testWidth = context.measureText('mmmmmmmmmmlli').width
            
            return Math.abs(baselineWidth - testWidth) > 0.1
        } catch {
            return false
        }
    }
    
    return false
}

/**
 * Check which fonts from a set are not available
 */
async function findMissingFonts(fonts: Set<string>): Promise<string[]> {
    const missing: string[] = []
    
    const checks = Array.from(fonts).map(async (font) => {
        const available = await isFontAvailable(font)
        if (!available) {
            missing.push(font)
        }
    })
    
    await Promise.all(checks)
    
    return missing.sort()
}

/**
 * Replace missing fonts with Arial in Univer workbook data
 */
function replaceMissingFonts(univerData: UniverWorkbookData, missingFonts: string[]): void {
    if (missingFonts.length === 0 || !univerData.sheets) return
    
    const missingSet = new Set(missingFonts.map(f => f.toLowerCase()))
    
    for (const sheet of Object.values(univerData.sheets)) {
        if (sheet.cellData) {
            for (const row of Object.values(sheet.cellData)) {
                for (const cell of Object.values(row)) {
                    if (cell.s) {
                        const style = typeof cell.s === 'string' 
                            ? univerData.styles?.[cell.s] 
                            : cell.s as UniverCellStyle
                        
                        if (style?.ff && missingSet.has(style.ff.toLowerCase())) {
                            if (typeof cell.s === 'string') {
                                if (univerData.styles?.[cell.s]) {
                                    univerData.styles[cell.s].ff = 'Arial'
                                }
                            } else {
                                (cell.s as UniverCellStyle).ff = 'Arial'
                            }
                        }
                    }
                }
            }
        }
    }
}

// ============================================
// CONVERSION: UNIVER -> SPREADJS
// ============================================

/**
 * Convert Univer cell style to SpreadJS style
 */
function convertUniverStyleToSpreadJS(style: UniverCellStyle | undefined): GC.Spread.Sheets.Style {
    const spreadStyle = new GC.Spread.Sheets.Style()
    
    if (!style) return spreadStyle
    
    // Font
    if (style.ff || style.fs || style.bl || style.cl) {
        const font = style.ff?.split(',')[0].trim() || 'Arial'
        const size = style.fs || 11
        const bold = style.bl === 1
        const italic = style.it === 1
        const underline = style.ul === 1
        
        let color = 'black'
        if (style.cl) {
            color = rgbToHex(style.cl.r, style.cl.g, style.cl.b)
        }
        
        spreadStyle.font = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}${underline ? 'underline ' : ''}${size}pt ${font}`
        spreadStyle.foreColor = color
    }
    
    // Background
    if (style.bg) {
        spreadStyle.backColor = rgbToHex(style.bg.r, style.bg.g, style.bg.b)
    }
    
    // Alignment
    if (style.ht !== undefined || style.vt !== undefined || style.tb) {
        const alignMap: Record<number, GC.Spread.Sheets.HorizontalAlign> = {
            0: GC.Spread.Sheets.HorizontalAlign.left,
            1: GC.Spread.Sheets.HorizontalAlign.center,
            2: GC.Spread.Sheets.HorizontalAlign.right
        }
        const vertMap: Record<number, GC.Spread.Sheets.VerticalAlign> = {
            0: GC.Spread.Sheets.VerticalAlign.top,
            1: GC.Spread.Sheets.VerticalAlign.center,
            2: GC.Spread.Sheets.VerticalAlign.bottom
        }
        
        if (style.ht !== undefined) {
            spreadStyle.hAlign = alignMap[style.ht] ?? GC.Spread.Sheets.HorizontalAlign.left
        }
        if (style.vt !== undefined) {
            spreadStyle.vAlign = vertMap[style.vt] ?? GC.Spread.Sheets.VerticalAlign.top
        }
        if (style.tb) {
            spreadStyle.wordWrap = true
        }
    }
    
    // Borders
    if (style.bd) {
        const borderStyleMap: Record<number, GC.Spread.Sheets.LineStyle> = {
            0: GC.Spread.Sheets.LineStyle.thin,
            1: GC.Spread.Sheets.LineStyle.medium,
            2: GC.Spread.Sheets.LineStyle.thick
        }
        
        const borders = new GC.Spread.Sheets.BorderLine()
        
        if (style.bd.t) {
            borders.style = borderStyleMap[style.bd.t.s] ?? GC.Spread.Sheets.LineStyle.thin
            borders.color = rgbToHex(style.bd.t.cl.r, style.bd.t.cl.g, style.bd.t.cl.b)
            spreadStyle.borderTop = borders
        }
        if (style.bd.b) {
            const bBorder = new GC.Spread.Sheets.BorderLine()
            bBorder.style = borderStyleMap[style.bd.b.s] ?? GC.Spread.Sheets.LineStyle.thin
            bBorder.color = rgbToHex(style.bd.b.cl.r, style.bd.b.cl.g, style.bd.b.cl.b)
            spreadStyle.borderBottom = bBorder
        }
        if (style.bd.l) {
            const lBorder = new GC.Spread.Sheets.BorderLine()
            lBorder.style = borderStyleMap[style.bd.l.s] ?? GC.Spread.Sheets.LineStyle.thin
            lBorder.color = rgbToHex(style.bd.l.cl.r, style.bd.l.cl.g, style.bd.l.cl.b)
            spreadStyle.borderLeft = lBorder
        }
        if (style.bd.r) {
            const rBorder = new GC.Spread.Sheets.BorderLine()
            rBorder.style = borderStyleMap[style.bd.r.s] ?? GC.Spread.Sheets.LineStyle.thin
            rBorder.color = rgbToHex(style.bd.r.cl.r, style.bd.r.cl.g, style.bd.r.cl.b)
            spreadStyle.borderRight = rBorder
        }
    }
    
    return spreadStyle
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
        const hex = Math.round(x).toString(16)
        return hex.length === 1 ? '0' + hex : hex
    }).join('')
}

/**
 * Convert Univer workbook to SpreadJS workbook
 */
function convertUniverToSpreadJS(univerData: UniverWorkbookData): GC.Spread.Sheets.Workbook {
    const spread = new GC.Spread.Sheets.Workbook()
    
    const sheetOrder = univerData.sheetOrder || Object.keys(univerData.sheets || {})
    
    // Remove default sheet if we have custom sheets
    if (sheetOrder.length > 0 && spread.sheets.length > 0) {
        spread.sheets.remove(0)
    }
    
    for (const sheetId of sheetOrder) {
        const univerSheet = univerData.sheets?.[sheetId]
        if (!univerSheet) continue
        
        const sheetName = univerSheet.name || sheetId
        const sheet = spread.sheets.add(0, sheetName)
        
        // Convert cells
        if (univerSheet.cellData) {
            for (const [rowKey, row] of Object.entries(univerSheet.cellData)) {
                const rowNum = parseInt(rowKey, 10)
                if (isNaN(rowNum)) continue
                
                for (const [colKey, cell] of Object.entries(row)) {
                    const colNum = parseInt(colKey, 10)
                    if (isNaN(colNum)) continue
                    
                    // Set value
                    if (cell.f) {
                        // Formula
                        sheet.setFormula(rowNum, colNum, cell.f)
                    } else {
                        // Value
                        sheet.setValue(rowNum, colNum, cell.v ?? '')
                    }
                    
                    // Set style
                    if (cell.s) {
                        const style = typeof cell.s === 'string' 
                            ? univerData.styles?.[cell.s] 
                            : cell.s as UniverCellStyle
                        
                        if (style) {
                            const spreadStyle = convertUniverStyleToSpreadJS(style)
                            sheet.setStyle(rowNum, colNum, spreadStyle)
                        }
                    }
                }
            }
        }
        
        // Set column widths
        if (univerSheet.columnData) {
            for (const [colKey, colData] of Object.entries(univerSheet.columnData)) {
                const colNum = parseInt(colKey, 10)
                if (!isNaN(colNum) && colData.w) {
                    sheet.setColumnWidth(colNum, colData.w)
                }
            }
        } else if (univerSheet.defaultColumnWidth) {
            sheet.defaults.colWidth = univerSheet.defaultColumnWidth
        }
        
        // Set row heights
        if (univerSheet.rowData) {
            for (const [rowKey, rowData] of Object.entries(univerSheet.rowData)) {
                const rowNum = parseInt(rowKey, 10)
                if (!isNaN(rowNum) && rowData.h) {
                    sheet.setRowHeight(rowNum, rowData.h)
                }
            }
        } else if (univerSheet.defaultRowHeight) {
            sheet.defaults.rowHeight = univerSheet.defaultRowHeight
        }
        
        // Merged cells
        if (univerSheet.mergeData) {
            for (const merge of univerSheet.mergeData) {
                sheet.addSpan(
                    merge.startRow,
                    merge.startColumn,
                    merge.endRow - merge.startRow + 1,
                    merge.endColumn - merge.startColumn + 1
                )
            }
        }
        
        // Handle images/drawings from resources
        if (univerData.resources) {
            const drawingResource = univerData.resources.find(
                r => r.name === 'SHEET_DRAWING_PLUGIN' || r.name?.includes('drawing')
            )
            
            if (drawingResource?.data) {
                try {
                    const drawingsData = JSON.parse(drawingResource.data)
                    const sheetDrawings = drawingsData[sheetId]
                    
                    if (sheetDrawings && typeof sheetDrawings === 'object') {
                        for (const [drawingId, drawing] of Object.entries(sheetDrawings)) {
                            const draw = drawing as Record<string, unknown>
                            if (draw.source && draw.sheetTransform) {
                                const transform = draw.sheetTransform as {
                                    from?: { column?: number; row?: number }
                                    to?: { column?: number; row?: number }
                                }
                                
                                if (transform.from && transform.to) {
                                    const fromCol = transform.from.column ?? 0
                                    const fromRow = transform.from.row ?? 0
                                    const toCol = transform.to.column ?? fromCol + 1
                                    const toRow = transform.to.row ?? fromRow + 1
                                    
                                    // Add image to SpreadJS
                                    const image = new Image()
                                    image.src = draw.source as string
                                    image.onload = () => {
                                        sheet.pictures.add(
                                            drawingId,
                                            image,
                                            fromRow,
                                            fromCol,
                                            toRow - fromRow,
                                            toCol - fromCol
                                        )
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[SpreadJSExchange] Failed to parse drawings:', e)
                }
            }
        }
    }
    
    return spread
}

// ============================================
// CONVERSION: SPREADJS -> UNIVER
// ============================================

/**
 * Convert SpreadJS style to Univer cell style
 */
function convertSpreadJSStyleToUniver(style: GC.Spread.Sheets.Style, styleIndex: number): UniverCellStyle {
    const univerStyle: UniverCellStyle = {}
    
    // Font parsing
    if (style.font) {
        const fontMatch = style.font.match(/(?:bold\s+)?(?:italic\s+)?(?:underline\s+)?(\d+)pt\s+(.+)/i)
        if (fontMatch) {
            univerStyle.fs = parseInt(fontMatch[1], 10)
            univerStyle.ff = fontMatch[2].trim()
        }
        
        if (style.font.includes('bold')) univerStyle.bl = 1
        if (style.font.includes('italic')) univerStyle.it = 1
        if (style.font.includes('underline')) univerStyle.ul = 1
    }
    
    // Colors
    if (style.foreColor) {
        const rgb = hexToRgb(style.foreColor)
        if (rgb) univerStyle.cl = rgb
    }
    
    if (style.backColor) {
        const rgb = hexToRgb(style.backColor)
        if (rgb) univerStyle.bg = rgb
    }
    
    // Alignment
    if (style.hAlign !== undefined) {
        const alignMap: Record<number, number> = {
            [GC.Spread.Sheets.HorizontalAlign.left]: 0,
            [GC.Spread.Sheets.HorizontalAlign.center]: 1,
            [GC.Spread.Sheets.HorizontalAlign.right]: 2
        }
        univerStyle.ht = alignMap[style.hAlign] ?? 0
    }
    
    if (style.vAlign !== undefined) {
        const vertMap: Record<number, number> = {
            [GC.Spread.Sheets.VerticalAlign.top]: 0,
            [GC.Spread.Sheets.VerticalAlign.center]: 1,
            [GC.Spread.Sheets.VerticalAlign.bottom]: 2
        }
        univerStyle.vt = vertMap[style.vAlign] ?? 0
    }
    
    if (style.wordWrap) {
        univerStyle.tb = 1
    }
    
    // Borders
    if (style.borderTop || style.borderBottom || style.borderLeft || style.borderRight) {
        univerStyle.bd = {}
        
        const borderStyleMap: Record<number, number> = {
            [GC.Spread.Sheets.LineStyle.thin]: 0,
            [GC.Spread.Sheets.LineStyle.medium]: 1,
            [GC.Spread.Sheets.LineStyle.thick]: 2
        }
        
        if (style.borderTop) {
            const rgb = hexToRgb(style.borderTop.color)
            univerStyle.bd.t = {
                s: borderStyleMap[style.borderTop.style] ?? 0,
                cl: rgb || { r: 0, g: 0, b: 0 }
            }
        }
        if (style.borderBottom) {
            const rgb = hexToRgb(style.borderBottom.color)
            univerStyle.bd.b = {
                s: borderStyleMap[style.borderBottom.style] ?? 0,
                cl: rgb || { r: 0, g: 0, b: 0 }
            }
        }
        if (style.borderLeft) {
            const rgb = hexToRgb(style.borderLeft.color)
            univerStyle.bd.l = {
                s: borderStyleMap[style.borderLeft.style] ?? 0,
                cl: rgb || { r: 0, g: 0, b: 0 }
            }
        }
        if (style.borderRight) {
            const rgb = hexToRgb(style.borderRight.color)
            univerStyle.bd.r = {
                s: borderStyleMap[style.borderRight.style] ?? 0,
                cl: rgb || { r: 0, g: 0, b: 0 }
            }
        }
    }
    
    return univerStyle
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null
}

/**
 * Convert SpreadJS workbook to Univer workbook
 */
function convertSpreadJSToUniver(workbook: GC.Spread.Sheets.Workbook, fileName: string): UniverWorkbookData {
    const univerData: UniverWorkbookData = {
        id: `workbook-${Date.now()}`,
        name: fileName.replace(/\.xlsx?$/i, ''),
        sheetOrder: [],
        sheets: {},
        styles: {}
    }
    
    let styleIndex = 0
    const styleMap = new Map<string, string>()
    
    for (let i = 0; i < workbook.sheets.length; i++) {
        const spreadSheet = workbook.sheets.get(i)
        const sheetId = `sheet_${i}`
        const sheetName = spreadSheet.name()
        
        univerData.sheetOrder.push(sheetId)
        
        const sheetData: UniverSheetData = {
            id: sheetId,
            name: sheetName,
            cellData: {}
        }
        
        // Get used range
        const usedRange = spreadSheet.getUsedRange()
        if (usedRange) {
            sheetData.rowCount = usedRange.row + usedRange.rowCount
            sheetData.columnCount = usedRange.col + usedRange.colCount
            
            // Convert cells
            for (let row = usedRange.row; row < usedRange.row + usedRange.rowCount; row++) {
                for (let col = usedRange.col; col < usedRange.col + usedRange.colCount; col++) {
                    const value = spreadSheet.getValue(row, col)
                    const formula = spreadSheet.getFormula(row, col)
                    const style = spreadSheet.getStyle(row, col)
                    
                    if (value !== undefined || formula) {
                        const rowKey = String(row)
                        const colKey = String(col)
                        
                        if (!sheetData.cellData[rowKey]) {
                            sheetData.cellData[rowKey] = {}
                        }
                        
                        const univerCell: UniverCell = {
                            v: value ?? ''
                        }
                        
                        if (formula) {
                            univerCell.f = formula
                        }
                        
                        // Style
                        if (style) {
                            const univerStyle = convertSpreadJSStyleToUniver(style, styleIndex)
                            const styleKey = JSON.stringify(univerStyle)
                            
                            if (!styleMap.has(styleKey)) {
                                const styleId = `style_${styleIndex++}`
                                styleMap.set(styleKey, styleId)
                                univerData.styles![styleId] = univerStyle
                            }
                            
                            univerCell.s = styleMap.get(styleKey)!
                        }
                        
                        sheetData.cellData[rowKey][colKey] = univerCell
                    }
                }
            }
        }
        
        // Column widths
        sheetData.columnData = {}
        for (let col = 0; col < (sheetData.columnCount || 26); col++) {
            const width = spreadSheet.getColumnWidth(col)
            if (width && width !== spreadSheet.defaults.colWidth) {
                sheetData.columnData![String(col)] = { w: width }
            }
        }
        
        // Row heights
        sheetData.rowData = {}
        for (let row = 0; row < (sheetData.rowCount || 100); row++) {
            const height = spreadSheet.getRowHeight(row)
            if (height && height !== spreadSheet.defaults.rowHeight) {
                sheetData.rowData![String(row)] = { h: height }
            }
        }
        
        // Merged cells
        const spans = spreadSheet.getSpans()
        if (spans && spans.length > 0) {
            sheetData.mergeData = spans.map(span => ({
                startRow: span.row,
                endRow: span.row + span.rowCount - 1,
                startColumn: span.col,
                endColumn: span.col + span.colCount - 1
            }))
        }
        
        // Images/drawings
        const pictures = spreadSheet.pictures.all()
        if (pictures && pictures.length > 0) {
            if (!univerData.resources) {
                univerData.resources = []
            }
            
            const drawings: Record<string, Record<string, unknown>> = {}
            drawings[sheetId] = {}
            
            pictures.forEach((picture, index) => {
                const drawingId = `drawing_${index}`
                const image = picture.image()
                
                if (image && image.src) {
                    drawings[sheetId][drawingId] = {
                        drawingId,
                        drawingType: 1,
                        source: image.src,
                        sheetTransform: {
                            from: {
                                column: picture.startColumn(),
                                row: picture.startRow()
                            },
                            to: {
                                column: picture.endColumn(),
                                row: picture.endRow()
                            }
                        }
                    }
                }
            })
            
            if (Object.keys(drawings[sheetId]).length > 0) {
                const drawingResource = univerData.resources.find(
                    r => r.name === 'SHEET_DRAWING_PLUGIN'
                )
                
                if (drawingResource) {
                    const existingDrawings = JSON.parse(drawingResource.data || '{}')
                    Object.assign(existingDrawings, drawings)
                    drawingResource.data = JSON.stringify(existingDrawings)
                } else {
                    univerData.resources.push({
                        name: 'SHEET_DRAWING_PLUGIN',
                        data: JSON.stringify(drawings)
                    })
                }
            }
        }
        
        univerData.sheets[sheetId] = sheetData
    }
    
    return univerData
}

// ============================================
// EXCEL EXPORT FUNCTIONS
// ============================================

/**
 * Export Univer workbook data to Excel buffer using SpreadJS
 */
export async function exportToExcelBuffer(univerData: UniverWorkbookData): Promise<ArrayBuffer> {
    const spread = convertUniverToSpreadJS(univerData)
    const excelIO = new (GC as any).Spread.Excel.IO()
    
    // Convert workbook to JSON
    const json = JSON.stringify(spread.toJSON())
    
    // Export to blob
    return new Promise((resolve, reject) => {
        excelIO.save(
            json,
            (blob: Blob) => {
                blob.arrayBuffer()
                    .then(buffer => resolve(buffer))
                    .catch(error => reject(error))
            },
            (error: Error) => {
                reject(error)
            }
        )
    })
}

/**
 * Export Univer workbook data to Excel file and trigger download using SpreadJS
 */
export async function exportToExcel(
    univerData: UniverWorkbookData,
    filename: string = 'spreadsheet.xlsx'
): Promise<void> {
    const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    const spread = convertUniverToSpreadJS(univerData)
    const excelIO = new (GC as any).Spread.Excel.IO()
    
    // Convert workbook to JSON
    const json = JSON.stringify(spread.toJSON())
    
    return new Promise((resolve, reject) => {
        excelIO.save(
            json,
            (blob: Blob) => {
                saveAs(blob, finalFilename)
                resolve()
            },
            (error: Error) => {
                console.error('[SpreadJSExchange] Export failed:', error)
                reject(error)
            }
        )
    })
}

// ============================================
// EXCEL IMPORT FUNCTIONS
// ============================================

/**
 * Import Excel file to Univer workbook data format using SpreadJS
 */
export async function importFromExcel(
    file: File,
    onMissingFonts?: (missingFonts: string[]) => void
): Promise<UniverWorkbookData> {
    return new Promise((resolve, reject) => {
        try {
            // Create SpreadJS workbook and Excel IO
            const spread = new GC.Spread.Sheets.Workbook()
            const excelIO = new (GC as any).Spread.Excel.IO()
            
            // Import Excel file
            excelIO.open(
                file,
                async (json: any) => {
                    try {
                        // Load JSON into workbook
                        spread.fromJSON(json)
                        
                        // Convert to Univer format
                        const univerData = convertSpreadJSToUniver(spread, file.name)
                        
                        // Ensure required fields
                        if (!univerData.id) {
                            univerData.id = `workbook-${Date.now()}`
                        }
                        if (!univerData.name) {
                            univerData.name = file.name.replace(/\.xlsx?$/i, '')
                        }
                        if (!univerData.sheetOrder && univerData.sheets) {
                            univerData.sheetOrder = Object.keys(univerData.sheets)
                        }
                        
                        // Check for missing fonts
                        const fonts = extractFontsFromUniverData(univerData)
                        if (fonts.size > 0) {
                            const missingFonts = await findMissingFonts(fonts)
                            if (missingFonts.length > 0) {
                                replaceMissingFonts(univerData, missingFonts)
                                if (onMissingFonts) {
                                    onMissingFonts(missingFonts)
                                }
                            }
                        }
                        
                        resolve(univerData)
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error)
                        reject(new Error(`Failed to convert SpreadJS to Univer: ${errorMessage}`))
                    }
                },
                (error: Error) => {
                    reject(new Error(`Excel import failed: ${error.message || 'Unknown error'}`))
                }
            )
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            reject(new Error(`Excel import failed: ${errorMessage || 'Unknown error'}`))
        }
    })
}
