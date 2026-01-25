/**
 * Advanced Univer Spreadsheet Examples
 *
 * Demonstrates advanced use cases and patterns for working with
 * professional spreadsheets in Univer
 */

import { getSalesTableData } from './univer-sales-table-example'

/**
 * Example 1: Creating a Dynamic Table from API Data
 *
 * This pattern shows how to fetch data from an API and convert it
 * into a Univer spreadsheet structure
 */
export function createTableFromAPIData(apiData: Array<Record<string, any>>) {
    const salesData = getSalesTableData()

    // Convert API data to cell references
    // Assumes apiData has fields: id, name, category, quantity, unitPrice, total, date
    const cellData = { ...salesData.sheets.Ventas.cellData }

    apiData.forEach((item, rowIndex) => {
        const row = rowIndex + 1 // Start from row 1 (after header)

        // Map API fields to spreadsheet columns
        cellData[`A${row}`] = { v: item.id, t: 's', s: `cell_${row}_0` }
        cellData[`B${row}`] = { v: item.name, t: 's', s: `cell_${row}_1` }
        cellData[`C${row}`] = { v: item.category, t: 's', s: `cell_${row}_2` }
        cellData[`D${row}`] = { v: item.quantity, t: 'n', s: `cell_${row}_3` }
        cellData[`E${row}`] = {
            v: item.unitPrice,
            t: 'n',
            s: `cell_${row}_4`,
            nm: '$#,##0.00'
        }
        cellData[`F${row}`] = {
            v: item.quantity * item.unitPrice,
            t: 'n',
            s: `cell_${row}_5`,
            f: `=D${row}*E${row}`,
            nm: '$#,##0.00'
        }
        cellData[`G${row}`] = { v: item.date, t: 's', s: `cell_${row}_6` }
    })

    // Update totals row formula to match data length
    const lastDataRow = apiData.length
    cellData[`D${lastDataRow + 1}`] = {
        ...cellData[`D${lastDataRow + 1}`],
        f: `=SUM(D1:D${lastDataRow})`
    }
    cellData[`F${lastDataRow + 1}`] = {
        ...cellData[`F${lastDataRow + 1}`],
        f: `=SUM(F1:F${lastDataRow})`
    }

    return {
        ...salesData,
        sheets: {
            Ventas: {
                ...salesData.sheets.Ventas,
                cellData,
                rowCount: Math.max(apiData.length + 3, 20)
            }
        }
    }
}

/**
 * Example 2: Template Pattern for Different Report Types
 *
 * Create multiple report templates with different layouts
 */
export enum ReportType {
    SALES = 'sales',
    INVENTORY = 'inventory',
    REVENUE = 'revenue',
    CUSTOMER = 'customer'
}

export function createReportTemplate(type: ReportType) {
    const baseData = getSalesTableData()

    switch (type) {
        case ReportType.INVENTORY:
            return createInventoryReport(baseData)
        case ReportType.REVENUE:
            return createRevenueReport(baseData)
        case ReportType.CUSTOMER:
            return createCustomerReport(baseData)
        case ReportType.SALES:
        default:
            return baseData
    }
}

function createInventoryReport(baseData: any) {
    // Modify headers for inventory: remove Date, add Stock Level
    const modifiedData = { ...baseData }
    const cellData = { ...baseData.sheets.Ventas.cellData }

    // Update header
    cellData['G0'] = { v: 'Stock Level', t: 's', s: 'header_6' }

    // Add stock level data (example)
    ;(Object.entries(cellData) as any).forEach(([cellRef, cellValue]: any) => {
        if (cellRef.startsWith('G') && cellRef !== 'G0') {
            const row = cellRef.substring(1)
            cellData[cellRef] = {
                v: Math.floor(Math.random() * 100),
                t: 'n',
                s: `cell_${row}_6`
            }
        }
    })

    modifiedData.sheets.Ventas.cellData = cellData
    modifiedData.sheets.Ventas.name = 'Inventory'
    modifiedData.name = 'Inventory Report'

    return modifiedData
}

function createRevenueReport(baseData: any) {
    // Group by category and show revenue breakdown
    const modifiedData = { ...baseData }
    modifiedData.sheets.Ventas.name = 'Revenue'
    modifiedData.name = 'Revenue Report'
    return modifiedData
}

function createCustomerReport(baseData: any) {
    // Show customer-focused report
    const modifiedData = { ...baseData }
    modifiedData.sheets.Ventas.name = 'Customers'
    modifiedData.name = 'Customer Report'
    return modifiedData
}

/**
 * Example 3: Add Summary Rows with Statistics
 *
 * Adds statistical summary rows (average, min, max) below the data
 */
export function addSummaryStatistics(baseData: any, dataRowCount: number = 10) {
    const modifiedData = { ...baseData }
    const cellData = { ...baseData.sheets.Ventas.cellData }

    // Summary rows positions
    const summaryStartRow = dataRowCount + 2
    const summaryStyle = {
        bf: true,
        bg: { rgb: '#e0e7ff' },
        al: 'right',
        bl: 1, br: 1, bt: 1, bb: 1
    }

    // Average row
    cellData[`C${summaryStartRow}`] = {
        v: 'Average:',
        t: 's',
        s: `summary_label_avg`
    }
    cellData[`D${summaryStartRow}`] = {
        v: null,
        t: 'n',
        s: `summary_avg_qty`,
        f: `=AVERAGE(D1:D${dataRowCount})`
    }
    cellData[`E${summaryStartRow}`] = {
        v: null,
        t: 'n',
        s: `summary_avg_price`,
        f: `=AVERAGE(E1:E${dataRowCount})`,
        nm: '$#,##0.00'
    }
    cellData[`F${summaryStartRow}`] = {
        v: null,
        t: 'n',
        s: `summary_avg_total`,
        f: `=AVERAGE(F1:F${dataRowCount})`,
        nm: '$#,##0.00'
    }

    // Min row
    const minRow = summaryStartRow + 1
    cellData[`C${minRow}`] = {
        v: 'Minimum:',
        t: 's',
        s: `summary_label_min`
    }
    cellData[`E${minRow}`] = {
        v: null,
        t: 'n',
        s: `summary_min_price`,
        f: `=MIN(E1:E${dataRowCount})`,
        nm: '$#,##0.00'
    }

    // Max row
    const maxRow = summaryStartRow + 2
    cellData[`C${maxRow}`] = {
        v: 'Maximum:',
        t: 's',
        s: `summary_label_max`
    }
    cellData[`E${maxRow}`] = {
        v: null,
        t: 'n',
        s: `summary_max_price`,
        f: `=MAX(E1:E${dataRowCount})`,
        nm: '$#,##0.00'
    }

    modifiedData.sheets.Ventas.cellData = cellData
    modifiedData.sheets.Ventas.rowCount = Math.max(summaryStartRow + 3, 25)

    return modifiedData
}

/**
 * Example 4: Multi-Sheet Workbook
 *
 * Create a workbook with multiple sheets for different data sets
 */
export function createMultiSheetWorkbook() {
    const baseData = getSalesTableData()

    const salesSheet = baseData.sheets.Ventas

    // Create summary sheet
    const summarySheet = {
        id: 'sheet-summary',
        name: 'Summary',
        rowCount: 15,
        columnCount: 5,
        cellData: {
            'A0': { v: 'Sales Summary', t: 's', s: 'header_0' },
            'A1': { v: 'Total Revenue:', t: 's' },
            'B1': { v: null, t: 'n', f: "='Ventas'!F11", nm: '$#,##0.00' },
            'A2': { v: 'Total Units:', t: 's' },
            'B2': { v: null, t: 'n', f: "='Ventas'!D11" },
            'A3': { v: 'Avg Product Price:', t: 's' },
            'B3': { v: null, t: 'n', f: "='Ventas'!B11", nm: '$#,##0.00' },
            'A4': { v: 'Number of Products:', t: 's' },
            'B4': { v: 10, t: 'n' }
        },
        defaultColumnWidth: 150,
        defaultRowHeight: 24,
        styles: {}
    }

    return {
        ...baseData,
        sheetOrder: ['Ventas', 'Summary'],
        sheets: {
            Ventas: salesSheet,
            Summary: summarySheet
        }
    }
}

/**
 * Example 5: Highlighting High-Value Items
 *
 * Apply conditional formatting-like styling based on values
 */
export function highlightHighValueItems(baseData: any, threshold: number = 2000) {
    const modifiedData = { ...baseData }
    const cellData = { ...baseData.sheets.Ventas.cellData }

    // Find cells with high values and highlight them
    Object.entries(cellData).forEach(([cellRef, cellValue]: any) => {
        if (cellRef.startsWith('F') && cellRef !== 'F0') {
            const value = cellValue.v
            if (typeof value === 'number' && value > threshold) {
                // Apply highlight style
                const styleId = cellValue.s
                const baseStyle = baseData.sheets.Ventas.styles[styleId] || {}
                baseData.sheets.Ventas.styles[`${styleId}_highlighted`] = {
                    ...baseStyle,
                    bg: { rgb: '#fef3c7' } // Yellow background for high values
                }
                cellValue.s = `${styleId}_highlighted`
            }
        }
    })

    modifiedData.sheets.Ventas.cellData = cellData
    return modifiedData
}

/**
 * Example 6: Export/Convert to Different Formats
 *
 * Convert Univer spreadsheet data to other formats
 */
export function convertToCSV(univerData: any): string {
    const sheet = univerData.sheets[univerData.sheetOrder[0]]
    const rows: string[] = []

    // Find the extent of the data
    let maxRow = 0
    let maxCol = 0

    Object.keys(sheet.cellData).forEach(cellRef => {
        const match = cellRef.match(/([A-Z]+)(\d+)/)
        if (match) {
            const col = match[1].charCodeAt(0) - 64
            const row = parseInt(match[2], 10)
            maxRow = Math.max(maxRow, row)
            maxCol = Math.max(maxCol, col)
        }
    })

    // Build CSV
    for (let row = 0; row <= maxRow; row++) {
        const rowData: string[] = []
        for (let col = 1; col <= maxCol; col++) {
            const colLetter = String.fromCharCode(64 + col)
            const cellRef = `${colLetter}${row}`
            const cell = sheet.cellData[cellRef]
            const value = cell?.v ?? ''

            // Quote values containing commas
            const csvValue = typeof value === 'string' && value.includes(',')
                ? `"${value}"`
                : value

            rowData.push(csvValue)
        }
        rows.push(rowData.join(','))
    }

    return rows.join('\n')
}

/**
 * Example 7: Clone and Modify Table for Comparison
 *
 * Create a modified copy for side-by-side comparison
 */
export function cloneTableWithModifications(
    baseData: any,
    modifications: Record<string, any>
): any {
    const clonedData = JSON.parse(JSON.stringify(baseData))

    // Apply modifications
    Object.entries(modifications).forEach(([path, value]) => {
        const keys = path.split('.')
        let target = clonedData

        // Navigate to the target location
        for (let i = 0; i < keys.length - 1; i++) {
            target = target[keys[i]]
        }

        // Apply the modification
        target[keys[keys.length - 1]] = value
    })

    return clonedData
}

/**
 * Example 8: Batch Operations on Cells
 *
 * Apply formatting to multiple cells at once
 */
export function applyFormattingToRange(
    baseData: any,
    startCell: string,
    endCell: string,
    styleProperties: Record<string, any>
): any {
    const modifiedData = JSON.parse(JSON.stringify(baseData))
    const sheet = modifiedData.sheets[modifiedData.sheetOrder[0]]

    // Parse cell references
    const parseCell = (cell: string) => {
        const match = cell.match(/([A-Z]+)(\d+)/)
        return {
            col: match![1].charCodeAt(0) - 64,
            row: parseInt(match![2], 10)
        }
    }

    const start = parseCell(startCell)
    const end = parseCell(endCell)

    // Apply style to all cells in range
    for (let row = start.row; row <= end.row; row++) {
        for (let col = start.col; col <= end.col; col++) {
            const cellRef = String.fromCharCode(64 + col) + row
            if (sheet.cellData[cellRef]) {
                sheet.cellData[cellRef] = {
                    ...sheet.cellData[cellRef],
                    ...styleProperties
                }
            }
        }
    }

    return modifiedData
}

/**
 * Export all examples for testing
 */
export const AdvancedExamples = {
    createTableFromAPIData,
    createReportTemplate,
    addSummaryStatistics,
    createMultiSheetWorkbook,
    highlightHighValueItems,
    convertToCSV,
    cloneTableWithModifications,
    applyFormattingToRange,
    ReportType
}

export default AdvancedExamples
