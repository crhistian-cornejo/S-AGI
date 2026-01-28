/**
 * Excel Import/Export utilities using SheetJS (xlsx)
 *
 * Alternative to LuckyExcel with support for:
 * - Cell styles (font, fill, borders, alignment) - via cellStyles option
 * - Number formats
 * - Formulas
 * - Merged cells
 * - Column widths and row heights
 * - Basic cell styling
 * 
 * Note: Images/drawings support is limited in SheetJS Community Edition
 */

import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

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
                                // Update style in styles object
                                if (univerData.styles?.[cell.s]) {
                                    univerData.styles[cell.s].ff = 'Arial'
                                }
                            } else {
                                // Update inline style
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
// CONVERSION: UNIVER -> SHEETJS
// ============================================

/**
 * Convert Univer cell style to SheetJS cell style
 */
function convertUniverStyleToSheetJS(style: UniverCellStyle | undefined): Partial<XLSX.CellStyle> {
    if (!style) return {}
    
    const sheetJSStyle: Partial<XLSX.CellStyle> = {}
    
    // Font
    if (style.ff || style.fs || style.bl || style.cl) {
        sheetJSStyle.font = {}
        if (style.ff) sheetJSStyle.font.name = style.ff.split(',')[0].trim()
        if (style.fs) sheetJSStyle.font.sz = style.fs
        if (style.bl) sheetJSStyle.font.bold = style.bl === 1
        if (style.it) sheetJSStyle.font.italic = style.it === 1
        if (style.ul) sheetJSStyle.font.underline = style.ul === 1
        if (style.cl) {
            sheetJSStyle.font.color = {
                rgb: rgbToHex(style.cl.r, style.cl.g, style.cl.b)
            }
        }
    }
    
    // Fill (background)
    if (style.bg) {
        sheetJSStyle.fill = {
            fgColor: {
                rgb: rgbToHex(style.bg.r, style.bg.g, style.bg.b)
            }
        }
    }
    
    // Alignment
    if (style.ht !== undefined || style.vt !== undefined) {
        sheetJSStyle.alignment = {}
        if (style.ht !== undefined) {
            const alignMap: Record<number, string> = {
                0: 'left',
                1: 'center',
                2: 'right'
            }
            sheetJSStyle.alignment.horizontal = alignMap[style.ht] || 'left'
        }
        if (style.vt !== undefined) {
            const vertMap: Record<number, string> = {
                0: 'top',
                1: 'middle',
                2: 'bottom'
            }
            sheetJSStyle.alignment.vertical = vertMap[style.vt] || 'top'
        }
        if (style.tb) {
            sheetJSStyle.alignment.wrapText = true
        }
    }
    
    // Borders
    if (style.bd) {
        sheetJSStyle.border = {}
        const borderStyleMap: Record<number, string> = {
            0: 'thin',
            1: 'medium',
            2: 'thick'
        }
        
        if (style.bd.t) {
            sheetJSStyle.border.top = {
                style: borderStyleMap[style.bd.t.s] || 'thin',
                color: { rgb: rgbToHex(style.bd.t.cl.r, style.bd.t.cl.g, style.bd.t.cl.b) }
            }
        }
        if (style.bd.b) {
            sheetJSStyle.border.bottom = {
                style: borderStyleMap[style.bd.b.s] || 'thin',
                color: { rgb: rgbToHex(style.bd.b.cl.r, style.bd.b.cl.g, style.bd.b.cl.b) }
            }
        }
        if (style.bd.l) {
            sheetJSStyle.border.left = {
                style: borderStyleMap[style.bd.l.s] || 'thin',
                color: { rgb: rgbToHex(style.bd.l.cl.r, style.bd.l.cl.g, style.bd.l.cl.b) }
            }
        }
        if (style.bd.r) {
            sheetJSStyle.border.right = {
                style: borderStyleMap[style.bd.r.s] || 'thin',
                color: { rgb: rgbToHex(style.bd.r.cl.r, style.bd.r.cl.g, style.bd.r.cl.b) }
            }
        }
    }
    
    return sheetJSStyle
}

function rgbToHex(r: number, g: number, b: number): string {
    return [r, g, b].map(x => {
        const hex = Math.round(x).toString(16)
        return hex.length === 1 ? '0' + hex : hex
    }).join('').toUpperCase()
}

/**
 * Convert Univer workbook to SheetJS workbook
 */
function convertUniverToSheetJS(univerData: UniverWorkbookData): XLSX.WorkBook {
    const workbook: XLSX.WorkBook = {
        SheetNames: [],
        Sheets: {}
    }
    
    const sheetOrder = univerData.sheetOrder || Object.keys(univerData.sheets || {})
    
    for (const sheetId of sheetOrder) {
        const univerSheet = univerData.sheets?.[sheetId]
        if (!univerSheet) continue
        
        const sheetName = univerSheet.name || sheetId
        workbook.SheetNames.push(sheetName)
        
        // Convert cell data
        const sheetData: Record<string, XLSX.CellObject> = {}
        const range: XLSX.Range = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } }
        
        if (univerSheet.cellData) {
            for (const [rowKey, row] of Object.entries(univerSheet.cellData)) {
                const rowNum = parseInt(rowKey, 10)
                if (isNaN(rowNum)) continue
                
                for (const [colKey, cell] of Object.entries(row)) {
                    const colNum = parseInt(colKey, 10)
                    if (isNaN(colNum)) continue
                    
                    const cellAddress = XLSX.utils.encode_cell({ r: rowNum, c: colNum })
                    const sheetJSCell: XLSX.CellObject = {}
                    
                    // Value
                    if (cell.f) {
                        sheetJSCell.f = cell.f
                        sheetJSCell.t = 'n' // formula
                    } else if (typeof cell.v === 'boolean') {
                        sheetJSCell.v = cell.v
                        sheetJSCell.t = 'b'
                    } else if (typeof cell.v === 'number') {
                        sheetJSCell.v = cell.v
                        sheetJSCell.t = 'n'
                    } else {
                        sheetJSCell.v = String(cell.v || '')
                        sheetJSCell.t = 's'
                    }
                    
                    // Style
                    if (cell.s) {
                        const style = typeof cell.s === 'string' 
                            ? univerData.styles?.[cell.s] 
                            : cell.s as UniverCellStyle
                        
                        if (style) {
                            const sheetJSStyle = convertUniverStyleToSheetJS(style)
                            Object.assign(sheetJSCell, sheetJSStyle)
                        }
                    }
                    
                    sheetData[cellAddress] = sheetJSCell
                    
                    // Update range
                    if (rowNum > range.e.r) range.e.r = rowNum
                    if (colNum > range.e.c) range.e.c = colNum
                }
            }
        }
        
        // Set column widths
        const colWidths: Array<{ wch: number }> = []
        if (univerSheet.columnData) {
            for (let i = 0; i <= range.e.c; i++) {
                const colData = univerSheet.columnData[String(i)]
                colWidths.push({ wch: colData?.w ? colData.w / 7 : univerSheet.defaultColumnWidth ? univerSheet.defaultColumnWidth / 7 : 10 })
            }
        } else if (univerSheet.defaultColumnWidth) {
            const defaultWidth = univerSheet.defaultColumnWidth / 7 // Convert pixels to characters
            for (let i = 0; i <= range.e.c; i++) {
                colWidths.push({ wch: defaultWidth })
            }
        }
        
        // Create worksheet
        const worksheet: XLSX.WorkSheet = {
            '!ref': XLSX.utils.encode_range(range),
            ...sheetData
        }
        
        if (colWidths.length > 0) {
            worksheet['!cols'] = colWidths
        }
        
        // Handle merged cells
        if (univerSheet.mergeData && univerSheet.mergeData.length > 0) {
            worksheet['!merges'] = univerSheet.mergeData.map(merge => ({
                s: { r: merge.startRow, c: merge.startColumn },
                e: { r: merge.endRow, c: merge.endColumn }
            }))
        }
        
        workbook.Sheets[sheetName] = worksheet
    }
    
    return workbook
}

// ============================================
// CONVERSION: SHEETJS -> UNIVER
// ============================================

/**
 * Convert SheetJS cell style to Univer cell style
 */
function convertSheetJSStyleToUniver(cell: XLSX.CellObject, styleIndex: number): UniverCellStyle {
    const style: UniverCellStyle = {}
    
    if (cell.font) {
        if (cell.font.name) style.ff = cell.font.name
        if (cell.font.sz) style.fs = cell.font.sz
        if (cell.font.bold) style.bl = 1
        if (cell.font.italic) style.it = 1
        if (cell.font.underline) style.ul = 1
        if (cell.font.color?.rgb) {
            const rgb = hexToRgb(cell.font.color.rgb)
            if (rgb) style.cl = rgb
        }
    }
    
    if (cell.fill?.fgColor?.rgb) {
        const rgb = hexToRgb(cell.fill.fgColor.rgb)
        if (rgb) style.bg = rgb
    }
    
    if (cell.alignment) {
        const alignMap: Record<string, number> = {
            'left': 0,
            'center': 1,
            'right': 2
        }
        if (cell.alignment.horizontal) {
            style.ht = alignMap[cell.alignment.horizontal] ?? 0
        }
        
        const vertMap: Record<string, number> = {
            'top': 0,
            'middle': 1,
            'bottom': 2
        }
        if (cell.alignment.vertical) {
            style.vt = vertMap[cell.alignment.vertical] ?? 0
        }
        
        if (cell.alignment.wrapText) {
            style.tb = 1
        }
    }
    
    if (cell.border) {
        style.bd = {}
        const styleMap: Record<string, number> = {
            'thin': 0,
            'medium': 1,
            'thick': 2
        }
        
        if (cell.border.top) {
            const rgb = hexToRgb(cell.border.top.color?.rgb || '000000')
            style.bd.t = {
                s: styleMap[cell.border.top.style || 'thin'] ?? 0,
                cl: rgb || { r: 0, g: 0, b: 0 }
            }
        }
        if (cell.border.bottom) {
            const rgb = hexToRgb(cell.border.bottom.color?.rgb || '000000')
            style.bd.b = {
                s: styleMap[cell.border.bottom.style || 'thin'] ?? 0,
                cl: rgb || { r: 0, g: 0, b: 0 }
            }
        }
        if (cell.border.left) {
            const rgb = hexToRgb(cell.border.left.color?.rgb || '000000')
            style.bd.l = {
                s: styleMap[cell.border.left.style || 'thin'] ?? 0,
                cl: rgb || { r: 0, g: 0, b: 0 }
            }
        }
        if (cell.border.right) {
            const rgb = hexToRgb(cell.border.right.color?.rgb || '000000')
            style.bd.r = {
                s: styleMap[cell.border.right.style || 'thin'] ?? 0,
                cl: rgb || { r: 0, g: 0, b: 0 }
            }
        }
    }
    
    return style
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})$/.exec(hex)
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null
}

/**
 * Convert SheetJS workbook to Univer workbook
 */
function convertSheetJSToUniver(workbook: XLSX.WorkBook, fileName: string): UniverWorkbookData {
    const univerData: UniverWorkbookData = {
        id: `workbook-${Date.now()}`,
        name: fileName.replace(/\.xlsx?$/i, ''),
        sheetOrder: workbook.SheetNames,
        sheets: {},
        styles: {}
    }
    
    let styleIndex = 0
    const styleMap = new Map<string, string>() // Map style objects to style IDs
    
    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        if (!worksheet) continue
        
        const sheetId = `sheet_${univerData.sheetOrder.indexOf(sheetName)}`
        const sheetData: UniverSheetData = {
            id: sheetId,
            name: sheetName,
            cellData: {}
        }
        
        // Parse range
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
        sheetData.rowCount = range.e.r + 1
        sheetData.columnCount = range.e.c + 1
        
        // Convert cells
        for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
                const cell = worksheet[cellAddress] as XLSX.CellObject | undefined
                
                if (!cell) continue
                
                const rowKey = String(row)
                const colKey = String(col)
                
                if (!sheetData.cellData[rowKey]) {
                    sheetData.cellData[rowKey] = {}
                }
                
                const univerCell: UniverCell = {
                    v: cell.v ?? ''
                }
                
                // Formula
                if (cell.f) {
                    univerCell.f = cell.f
                }
                
                // Style
                const style = convertSheetJSStyleToUniver(cell, styleIndex)
                const styleKey = JSON.stringify(style)
                
                if (!styleMap.has(styleKey)) {
                    const styleId = `style_${styleIndex++}`
                    styleMap.set(styleKey, styleId)
                    univerData.styles![styleId] = style
                }
                
                univerCell.s = styleMap.get(styleKey)!
                
                sheetData.cellData[rowKey][colKey] = univerCell
            }
        }
        
        // Column widths
        if (worksheet['!cols']) {
            sheetData.columnData = {}
            worksheet['!cols'].forEach((col, index) => {
                if (col.wch) {
                    sheetData.columnData![String(index)] = { w: col.wch * 7 } // Convert characters to pixels
                }
            })
        }
        
        // Merged cells
        if (worksheet['!merges']) {
            sheetData.mergeData = worksheet['!merges'].map(merge => ({
                startRow: merge.s.r,
                endRow: merge.e.r,
                startColumn: merge.s.c,
                endColumn: merge.e.c
            }))
        }
        
        univerData.sheets[sheetId] = sheetData
    }
    
    return univerData
}

// ============================================
// EXCEL EXPORT FUNCTIONS
// ============================================

/**
 * Export Univer workbook data to Excel buffer
 */
export async function exportToExcelBuffer(univerData: UniverWorkbookData): Promise<ArrayBuffer> {
    const workbook = convertUniverToSheetJS(univerData)
    const buffer = XLSX.write(workbook, { 
        type: 'array',
        bookType: 'xlsx',
        cellStyles: true
    })
    return buffer.buffer
}

/**
 * Export Univer workbook data to Excel file and trigger download
 */
export async function exportToExcel(
    univerData: UniverWorkbookData,
    filename: string = 'spreadsheet.xlsx'
): Promise<void> {
    const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    const workbook = convertUniverToSheetJS(univerData)
    const buffer = XLSX.write(workbook, { 
        type: 'array',
        bookType: 'xlsx',
        cellStyles: true
    })
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, finalFilename)
}

// ============================================
// EXCEL IMPORT FUNCTIONS
// ============================================

/**
 * Import Excel file to Univer workbook data format
 */
export async function importFromExcel(
    file: File,
    onMissingFonts?: (missingFonts: string[]) => void
): Promise<UniverWorkbookData> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        
        reader.onload = async (e) => {
            try {
                const data = e.target?.result
                if (!data) {
                    reject(new Error('Failed to read file'))
                    return
                }
                
                // Read workbook with cellStyles to preserve styles
                const workbook = XLSX.read(data, { 
                    type: 'array',
                    cellStyles: true 
                })
                
                // Convert to Univer format
                const univerData = convertSheetJSToUniver(workbook, file.name)
                
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
                reject(new Error(`Excel import failed: ${errorMessage || 'Unknown error'}`))
            }
        }
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'))
        }
        
        reader.readAsArrayBuffer(file)
    })
}
