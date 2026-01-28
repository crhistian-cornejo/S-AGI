/**
 * Excel Import/Export utilities using LuckyExcel (@mertdeveci55/univer-import-export)
 *
 * Native Univer import/export solution with full support for:
 * - Cell styles (font, fill, borders, alignment)
 * - Number formats
 * - Images and drawings (native support)
 * - Merged cells
 * - Column widths and row heights
 * - Formulas
 * - Conditional formatting
 * - Data validation
 * - Hyperlinks
 * - Charts
 */

// Polyfill Buffer for browser (required by LuckyExcel when getBuffer: true)
import { Buffer } from 'buffer'
if (typeof window !== 'undefined' && !window.Buffer) {
    (window as typeof window & { Buffer: typeof Buffer }).Buffer = Buffer
}

import LuckyExcel from '@mertdeveci55/univer-import-export'

// ============================================
// FONT DETECTION AND VALIDATION
// ============================================

/**
 * Extract all unique fonts used in Univer workbook data
 * @param univerData - Univer workbook snapshot data
 * @returns Set of unique font family names
 */
function extractFontsFromUniverData(univerData: UniverWorkbookData): Set<string> {
    const fonts = new Set<string>()
    
    if (!univerData.sheets) return fonts
    
    for (const sheet of Object.values(univerData.sheets)) {
        const sheetData = sheet as Record<string, unknown>
        
        if (sheetData.cellData && typeof sheetData.cellData === 'object') {
            const cellData = sheetData.cellData as Record<string, Record<string, unknown>>
            
            for (const row of Object.values(cellData)) {
                if (typeof row === 'object' && row !== null) {
                    for (const cell of Object.values(row)) {
                        if (cell && typeof cell === 'object') {
                            const cellObj = cell as Record<string, unknown>
                            if (cellObj.s && typeof cellObj.s === 'object') {
                                const style = cellObj.s as Record<string, unknown>
                                if (style.ff && typeof style.ff === 'string') {
                                    const fontFamily = style.ff.trim()
                                    if (fontFamily) {
                                        fonts.add(fontFamily)
                                    }
                                }
                            }
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
 * Uses a combination of techniques to detect font availability
 * @param fontFamily - Font family name to check
 * @returns Promise resolving to true if font is available
 */
async function isFontAvailable(fontFamily: string): Promise<boolean> {
    // Normalize font family name (remove quotes, handle fallbacks)
    const normalized = fontFamily
        .replace(/['"]/g, '')
        .split(',')[0]
        .trim()
    
    if (!normalized) return false
    
    // List of common system fonts that are almost always available
    const commonSystemFonts = [
        'arial', 'helvetica', 'times new roman', 'times', 'courier new', 'courier',
        'verdana', 'georgia', 'palatino', 'garamond', 'bookman', 'comic sans ms',
        'trebuchet ms', 'arial black', 'impact', 'tahoma', 'lucida console',
        'lucida sans unicode', 'ms sans serif', 'ms serif', 'calibri',
        'cambria', 'candara', 'consolas', 'constantia', 'corbel', 'segoe ui'
    ]
    
    const normalizedLower = normalized.toLowerCase()
    
    // Check if it's a common system font
    if (commonSystemFonts.some(font => 
        normalizedLower === font || 
        normalizedLower.includes(font) ||
        font.includes(normalizedLower)
    )) {
        return true
    }
    
    // For other fonts, use canvas measurement technique
    // This is more reliable than document.fonts.check() which requires fonts to be loaded
    if (typeof document !== 'undefined') {
        try {
            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            if (!context) return false
            
            // Baseline measurement with a common font
            context.font = '12px monospace'
            const baselineWidth = context.measureText('mmmmmmmmmmlli').width
            
            // Measure with the target font
            context.font = `12px "${normalized}", monospace`
            const testWidth = context.measureText('mmmmmmmmmmlli').width
            
            // If widths are different, the font is likely available
            // (though this isn't 100% accurate, it's a good heuristic)
            return Math.abs(baselineWidth - testWidth) > 0.1
        } catch {
            // If measurement fails, assume font might not be available
            return false
        }
    }
    
    // Fallback: assume font is not available if we can't check
    return false
}

/**
 * Check which fonts from a set are not available
 * @param fonts - Set of font family names to check
 * @returns Promise resolving to array of missing font names
 */
async function findMissingFonts(fonts: Set<string>): Promise<string[]> {
    const missing: string[] = []
    
    // Check fonts in parallel
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
 * @param univerData - Univer workbook snapshot data
 * @param missingFonts - Array of font names to replace
 */
function replaceMissingFonts(univerData: UniverWorkbookData, missingFonts: string[]): void {
    if (missingFonts.length === 0 || !univerData.sheets) return
    
    const missingSet = new Set(missingFonts.map(f => f.toLowerCase()))
    
    for (const sheet of Object.values(univerData.sheets)) {
        const sheetData = sheet as Record<string, unknown>
        
        if (sheetData.cellData && typeof sheetData.cellData === 'object') {
            const cellData = sheetData.cellData as Record<string, Record<string, unknown>>
            
            for (const row of Object.values(cellData)) {
                if (typeof row === 'object' && row !== null) {
                    for (const cell of Object.values(row)) {
                        if (cell && typeof cell === 'object') {
                            const cellObj = cell as Record<string, unknown>
                            if (cellObj.s && typeof cellObj.s === 'object') {
                                const style = cellObj.s as Record<string, unknown>
                                if (style.ff && typeof style.ff === 'string') {
                                    const fontFamily = style.ff.trim()
                                    if (fontFamily && missingSet.has(fontFamily.toLowerCase())) {
                                        style.ff = 'Arial'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ============================================
// UNIVER DATA TYPES
// ============================================

export interface UniverWorkbookData {
    id: string
    name: string
    sheetOrder: string[]
    sheets: Record<string, unknown>
    resources?: Array<{
        name: string
        data: string
    }>
    [key: string]: unknown  // Allow additional properties for full Univer snapshot compatibility
}

// ============================================
// NORMALIZATION FUNCTIONS
// ============================================

/**
 * Normalize Univer workbook data to ensure images/drawings are properly formatted for LuckyExcel
 * @param univerData - Univer workbook snapshot data
 * @returns Normalized Univer workbook data
 */
/**
 * Normalize a single drawing for LuckyExcel export
 * LuckyExcel expects:
 * - source: base64 string (can include data:image/... prefix)
 * - sheetTransform.from/to with column, columnOffset, row, rowOffset
 * - drawingType: number (1 = image)
 */
function normalizeDrawingForExport(drawing: Record<string, unknown>, drawingId: string): Record<string, unknown> | null {
    // Ensure we have a valid drawing with source
    if (!drawing.source) {
        console.warn(`[ExcelExchange] Drawing ${drawingId} has no source, skipping`)
        return null
    }
    
    const normalized: Record<string, unknown> = { ...drawing }
    
    // Set drawingId
    if (!normalized.drawingId) {
        normalized.drawingId = drawingId
    }
    
    // Set drawingType to 1 (image) - LuckyExcel expects number
    // Univer uses DrawingTypeEnum.DRAWING_IMAGE which might be 0 or 1
    normalized.drawingType = 1
    
    // Ensure source is a string (base64 or URL)
    const source = normalized.source as string
    
    // LuckyExcel checks for base64 with:
    // this.workbook.addImage({ base64: n.source, extension: "png" })
    // So the source should be the base64 data (can include data:image/png;base64, prefix)
    console.log(`[ExcelExchange] Drawing ${drawingId} source type:`, 
        source.startsWith('data:') ? 'base64' : 
        source.startsWith('http') ? 'URL' : 'unknown',
        'length:', source.length
    )
    
    // Handle sheetTransform - LuckyExcel needs from/to with column, columnOffset, row, rowOffset
    if (!normalized.sheetTransform && normalized.transform) {
        const transform = normalized.transform as Record<string, unknown>
        
        // Check if transform already has from/to structure
        if (transform.from && transform.to) {
            normalized.sheetTransform = {
                from: transform.from,
                to: transform.to
            }
        } else if (typeof transform.left === 'number' || typeof transform.top === 'number') {
            // Convert pixel-based transform to cell-based sheetTransform
            // Default cell dimensions: column width ~72px, row height ~20px
            const COL_WIDTH = 72
            const ROW_HEIGHT = 20
            
            const left = (transform.left as number) || 0
            const top = (transform.top as number) || 0
            const width = (transform.width as number) || 100
            const height = (transform.height as number) || 100
            
            const fromCol = Math.floor(left / COL_WIDTH)
            const fromRow = Math.floor(top / ROW_HEIGHT)
            const toCol = Math.floor((left + width) / COL_WIDTH)
            const toRow = Math.floor((top + height) / ROW_HEIGHT)
            
            // Calculate offsets in EMUs (English Metric Units) - LuckyExcel uses this
            // 1 column = 914400 EMUs approximately, 1 row = 182880 EMUs approximately
            const colOffsetPx = left - (fromCol * COL_WIDTH)
            const rowOffsetPx = top - (fromRow * ROW_HEIGHT)
            const toColOffsetPx = (left + width) - (toCol * COL_WIDTH)
            const toRowOffsetPx = (top + height) - (toRow * ROW_HEIGHT)
            
            normalized.sheetTransform = {
                from: {
                    column: fromCol,
                    columnOffset: Math.round(colOffsetPx * 9525), // EMUs per pixel
                    row: fromRow,
                    rowOffset: Math.round(rowOffsetPx * 9525)
                },
                to: {
                    column: toCol,
                    columnOffset: Math.round(toColOffsetPx * 9525),
                    row: toRow,
                    rowOffset: Math.round(toRowOffsetPx * 9525)
                }
            }
        }
    }
    
    // Validate sheetTransform structure
    if (normalized.sheetTransform) {
        const st = normalized.sheetTransform as Record<string, unknown>
        const from = st.from as Record<string, unknown> | undefined
        const to = st.to as Record<string, unknown> | undefined
        
        if (from && to) {
            console.log(`[ExcelExchange] Drawing ${drawingId} sheetTransform:`, {
                from: { col: from.column, row: from.row },
                to: { col: to.column, row: to.row }
            })
        } else {
            console.warn(`[ExcelExchange] Drawing ${drawingId} has invalid sheetTransform:`, st)
        }
    } else {
        console.warn(`[ExcelExchange] Drawing ${drawingId} has no sheetTransform`)
    }
    
    return normalized
}

function normalizeUniverDataForExport(univerData: UniverWorkbookData): UniverWorkbookData {
    // Deep clone to avoid mutating original
    const normalized = JSON.parse(JSON.stringify(univerData))
    
    // Ensure resources array exists
    if (!normalized.resources) {
        normalized.resources = []
    }
    
    // Collect all drawings from multiple sources
    const allDrawings: Record<string, Record<string, unknown>> = {}
    
    console.log('[ExcelExchange] Starting export normalization...')
    console.log('[ExcelExchange] Resources available:', normalized.resources?.map((r: { name: string }) => r.name))
    
    // Source 1: Check drawings in resources (SHEET_DRAWING_PLUGIN)
    const drawingResourceNames = ['SHEET_DRAWING_PLUGIN', 'sheet.drawing', 'drawing']
    for (const resourceName of drawingResourceNames) {
        const resource = normalized.resources?.find(
            (r: { name?: string }) => r.name === resourceName || r.name?.toLowerCase().includes('drawing')
        )
        
        if (resource?.data) {
            try {
                const drawingsData = typeof resource.data === 'string' 
                    ? JSON.parse(resource.data) 
                    : resource.data
                
                console.log(`[ExcelExchange] Found drawings in resource "${resource.name}":`, 
                    Object.keys(drawingsData).length, 'sheets')
                
                for (const [sheetId, drawings] of Object.entries(drawingsData)) {
                    if (drawings && typeof drawings === 'object') {
                        const drawingsObj = drawings as Record<string, unknown>
                        
                        for (const [drawingId, drawing] of Object.entries(drawingsObj)) {
                            if (drawing && typeof drawing === 'object') {
                                const normalizedDrawing = normalizeDrawingForExport(
                                    drawing as Record<string, unknown>, 
                                    drawingId
                                )
                                
                                if (normalizedDrawing) {
                                    if (!allDrawings[sheetId]) {
                                        allDrawings[sheetId] = {}
                                    }
                                    allDrawings[sheetId][drawingId] = normalizedDrawing
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`[ExcelExchange] Failed to parse resource "${resource.name}":`, e)
            }
            break // Found drawings resource, no need to check others
        }
    }
    
    // Source 2: Check drawings directly in sheets (sheet.drawings)
    if (normalized.sheets) {
        for (const [sheetId, sheet] of Object.entries(normalized.sheets)) {
            const sheetData = sheet as Record<string, unknown>
            
            if (sheetData.drawings && typeof sheetData.drawings === 'object') {
                const drawings = sheetData.drawings as Record<string, unknown>
                console.log(`[ExcelExchange] Found drawings in sheet "${sheetId}":`, 
                    Object.keys(drawings).length)
                
                for (const [drawingId, drawing] of Object.entries(drawings)) {
                    if (drawing && typeof drawing === 'object') {
                        const normalizedDrawing = normalizeDrawingForExport(
                            drawing as Record<string, unknown>, 
                            drawingId
                        )
                        
                        if (normalizedDrawing) {
                            if (!allDrawings[sheetId]) {
                                allDrawings[sheetId] = {}
                            }
                            // Sheet drawings take priority over resource drawings
                            allDrawings[sheetId][drawingId] = normalizedDrawing
                        }
                    }
                }
            }
        }
    }
    
    // Update or create SHEET_DRAWING_PLUGIN resource
    const drawingResourceIndex = normalized.resources.findIndex(
        (r: { name?: string }) => r.name === 'SHEET_DRAWING_PLUGIN'
    )
    
    const totalDrawings = Object.values(allDrawings).reduce(
        (sum, sheet) => sum + Object.keys(sheet).length, 0
    )
    
    console.log('[ExcelExchange] Export summary:', {
        sheetsWithDrawings: Object.keys(allDrawings).length,
        totalDrawings,
        sheetIds: Object.keys(allDrawings)
    })
    
    if (totalDrawings > 0) {
        const drawingsData = JSON.stringify(allDrawings)
        
        if (drawingResourceIndex >= 0) {
            normalized.resources[drawingResourceIndex].data = drawingsData
        } else {
            normalized.resources.push({
                name: 'SHEET_DRAWING_PLUGIN',
                data: drawingsData
            })
        }
        
        // Log a sample for debugging
        const firstSheetDrawings = Object.values(allDrawings)[0] as Record<string, unknown>
        if (firstSheetDrawings) {
            const sampleDrawing = Object.values(firstSheetDrawings)[0] as Record<string, unknown>
            console.log('[ExcelExchange] Sample drawing for export:', {
                drawingId: sampleDrawing?.drawingId,
                drawingType: sampleDrawing?.drawingType,
                hasSource: !!sampleDrawing?.source,
                sourceLength: (sampleDrawing?.source as string)?.length,
                hasSheetTransform: !!sampleDrawing?.sheetTransform
            })
        }
    } else {
        console.warn('[ExcelExchange] No drawings found to export!')
    }
    
    return normalized
}

/**
 * Normalize imported Univer workbook data to ensure proper structure
 * @param univerData - Univer workbook data from LuckyExcel
 * @returns Normalized Univer workbook data
 */
function normalizeUniverDataForImport(univerData: UniverWorkbookData): UniverWorkbookData {
    // Deep clone to avoid mutating original
    const normalized = JSON.parse(JSON.stringify(univerData))
    
    // Ensure resources array exists
    if (!normalized.resources) {
        normalized.resources = []
    }
    
    // Parse drawings from resources and add to sheets if needed
    const drawingResourceIndex = normalized.resources.findIndex(
        (r: { name?: string }) => r.name === 'SHEET_DRAWING_PLUGIN' || r.name?.includes('drawing')
    )
    
    if (drawingResourceIndex >= 0) {
        const drawingResource = normalized.resources[drawingResourceIndex]
        
        try {
            const drawingsData = JSON.parse(drawingResource.data || '{}')
            
            // Add drawings to corresponding sheets
            if (normalized.sheets && typeof drawingsData === 'object') {
                for (const [sheetId, drawings] of Object.entries(drawingsData)) {
                    if (normalized.sheets[sheetId] && drawings && typeof drawings === 'object') {
                        const sheet = normalized.sheets[sheetId] as Record<string, unknown>
                        
                        // Convert drawings to object format if it's an array
                        if (Array.isArray(drawings)) {
                            sheet.drawings = drawings.reduce((acc, drawing, index) => {
                                const drawingObj = drawing as Record<string, unknown>
                                const id = (drawingObj.drawingId as string) || `drawing_${index}`
                                acc[id] = drawing
                                return acc
                            }, {} as Record<string, unknown>)
                        } else {
                            sheet.drawings = drawings
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[ExcelExchange] Failed to parse drawing resource:', e)
        }
    }
    
    return normalized
}

// ============================================
// EXCEL EXPORT FUNCTIONS
// ============================================

/**
 * Export Univer workbook data to Excel buffer
 * Uses LuckyExcel with getBuffer option to get buffer without downloading
 * @param univerData - Univer workbook snapshot data
 * @returns Promise resolving to ArrayBuffer
 */
export async function exportToExcelBuffer(univerData: UniverWorkbookData): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        // Normalize data to ensure images/drawings are properly formatted
        const normalizedData = normalizeUniverDataForExport(univerData)
        
        // LuckyExcel supports getBuffer option to return buffer instead of downloading
        LuckyExcel.transformUniverToExcel({
            snapshot: normalizedData,
            fileName: 'temp.xlsx', // Not used when getBuffer is true, but required
            getBuffer: true, // This makes it return buffer instead of downloading
            success: (buffer?: ArrayBuffer | Blob | Buffer) => {
                if (!buffer) {
                    reject(new Error('LuckyExcel export returned no buffer'))
                    return
                }
                
                // Convert Blob to ArrayBuffer if needed
                if (buffer instanceof Blob) {
                    buffer.arrayBuffer()
                        .then(arrayBuffer => resolve(arrayBuffer))
                        .catch(error => {
                            const errorMessage = error instanceof Error ? error.message : String(error)
                            reject(new Error(`Failed to convert blob to buffer: ${errorMessage}`))
                        })
                } else if (Buffer.isBuffer(buffer)) {
                    // Node.js Buffer - convert to ArrayBuffer
                    resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
                } else {
                    resolve(buffer as ArrayBuffer)
                }
            },
            error: (error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : String(error)
                reject(new Error(`LuckyExcel export failed: ${errorMessage || 'Unknown error'}`))
            }
        })
    })
}

/**
 * Export Univer workbook data to Excel file and trigger download
 * @param univerData - Univer workbook snapshot data
 * @param filename - Output filename (default: 'spreadsheet.xlsx')
 */
export async function exportToExcel(
    univerData: UniverWorkbookData,
    filename: string = 'spreadsheet.xlsx'
): Promise<void> {
    const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    
    return new Promise((resolve, reject) => {
        // Normalize data to ensure images/drawings are properly formatted
        const normalizedData = normalizeUniverDataForExport(univerData)
        
        // LuckyExcel handles the download automatically with the fileName
        LuckyExcel.transformUniverToExcel({
            snapshot: normalizedData,
            fileName: finalFilename, // Use the provided filename
            success: () => {
                resolve()
            },
            error: (error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : String(error)
                console.error('[ExcelExchange] Export failed:', errorMessage)
                reject(new Error(`LuckyExcel export failed: ${errorMessage || 'Unknown error'}`))
            }
        })
    })
}

// ============================================
// EXCEL IMPORT FUNCTIONS
// ============================================

/**
 * Import Excel file to Univer workbook data format
 * @param file - Excel file (.xlsx or .xls)
 * @param onMissingFonts - Optional callback when missing fonts are detected
 * @returns Promise resolving to UniverWorkbookData
 */
export async function importFromExcel(
    file: File,
    onMissingFonts?: (missingFonts: string[]) => void
): Promise<UniverWorkbookData> {
    return new Promise((resolve, reject) => {
        // LuckyExcel uses callbacks, wrap in Promise
        LuckyExcel.transformExcelToUniver(
            file,
            async (univerData: unknown) => {
                // Cast to our type - LuckyExcel returns IWorkbookData which is compatible
                const data = univerData as UniverWorkbookData
                // Ensure the data has required fields
                if (!data.id) {
                    data.id = `workbook-${Date.now()}`
                }
                if (!data.name) {
                    data.name = file.name.replace(/\.xlsx?$/i, '')
                }
                if (!data.sheetOrder && data.sheets) {
                    // Generate sheetOrder from sheets if missing
                    data.sheetOrder = Object.keys(data.sheets)
                }
                
                // Normalize imported data to ensure images/drawings are properly structured
                const normalizedData = normalizeUniverDataForImport(data)
                
                // Check for missing fonts
                const fonts = extractFontsFromUniverData(normalizedData)
                if (fonts.size > 0) {
                    const missingFonts = await findMissingFonts(fonts)
                    if (missingFonts.length > 0) {
                        // Replace missing fonts with Arial
                        replaceMissingFonts(normalizedData, missingFonts)
                        
                        // Notify caller about missing fonts
                        if (onMissingFonts) {
                            onMissingFonts(missingFonts)
                        }
                    }
                }
                
                resolve(normalizedData)
            },
            (error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : String(error)
                reject(new Error(`LuckyExcel import failed: ${errorMessage || 'Unknown error'}`))
            }
        )
    })
}
