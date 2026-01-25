/**
 * Professional Monthly Expenses Table for Univer Spreadsheet
 *
 * This file demonstrates how to create a professionally styled monthly expenses table
 * with Univer's formatting capabilities including:
 * - Bold headers with gray background and dark text
 * - Currency formatting for amounts ($)
 * - Percentage calculations with 1 decimal place
 * - Total row with automatic SUM formulas
 * - Realistic expense data for personal or business budgeting
 *
 * Usage: Pass this data structure to createWorkbook() function
 */

export interface ExpensesTableData {
    id: string
    name: string
    sheetOrder: string[]
    sheets: {
        [key: string]: {
            id: string
            name: string
            rowCount: number
            columnCount: number
            cellData: {
                [key: string]: {
                    [key: string]: any
                }
            }
            defaultColumnWidth: number
            defaultRowHeight: number
            columnData?: {
                [key: number]: {
                    width?: number
                }
            }
            rowData?: {
                [key: number]: {
                    height?: number
                }
            }
            mergedData?: Array<{
                startRow: number
                endRow: number
                startColumn: number
                endColumn: number
            }>
            styles?: {
                [key: string]: {
                    bf?: boolean // bold
                    fs?: number // font size
                    fc?: { rgb: string } // font color
                    bg?: { rgb: string } // background color
                    al?: string // alignment
                    bl?: number // border left
                    br?: number // border right
                    bt?: number // border top
                    bb?: number // border bottom
                }
            }
        }
    }
}

/**
 * Generate sample monthly expenses data with realistic amounts
 */
function generateMonthlyExpensesData(): ExpensesTableData {
    // Color definitions
    const HEADER_BG = '#d3d3d3' // Light gray
    const HEADER_TEXT = '#000000' // Dark gray/black
    const BORDER_STYLE = 1 // Thin border
    const ALTERNATE_ROW_BG = '#f5f5f5' // Very light gray

    // Header row styling
    const headerStyle = {
        bf: true, // bold
        fs: 12,
        fc: { rgb: HEADER_TEXT },
        bg: { rgb: HEADER_BG },
        al: 'center',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    // Normal cell styling with borders
    const cellStyle = {
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    // Alternating row styling (light gray background)
    const alternateRowStyle = {
        ...cellStyle,
        bg: { rgb: ALTERNATE_ROW_BG },
    }

    // Total row styling (bold with gray background)
    const totalRowStyle = {
        bf: true,
        bg: { rgb: '#e0e0e0' }, // Medium gray
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    // Currency formatting style (right-aligned)
    const currencyStyle = {
        ...cellStyle,
        al: 'right',
    }

    const alternateRowCurrencyStyle = {
        ...alternateRowStyle,
        al: 'right',
    }

    // Percentage formatting style (center-aligned)
    const percentageStyle = {
        ...cellStyle,
        al: 'center',
    }

    const alternateRowPercentageStyle = {
        ...alternateRowStyle,
        al: 'center',
    }

    // Build cell data with realistic monthly expenses
    const cellData: { [key: string]: { [key: string]: any } } = {}

    // Headers (Row 0)
    const headers = ['Expense Category', 'Amount ($)', 'Percentage of Total (%)']
    headers.forEach((header, col) => {
        const cellRef = `${String.fromCharCode(65 + col)}0`
        cellData[cellRef] = {
            v: header,
            t: 's',
            s: `header_${col}`,
        }
    })

    // Expense categories with amounts
    const expenses = [
        { category: 'Vivienda', amount: 1200 },
        { category: 'Alimentación', amount: 450 },
        { category: 'Transporte', amount: 300 },
        { category: 'Servicios', amount: 150 },
        { category: 'Entretenimiento', amount: 200 },
        { category: 'Salud', amount: 100 },
        { category: 'Otros', amount: 100 },
    ]

    // Add data rows (rows 1-7)
    expenses.forEach((expense, rowIndex) => {
        const row = rowIndex + 1
        const isAlternateRow = rowIndex % 2 === 1

        // Category name (Column A)
        const cellA = `A${row}`
        cellData[cellA] = {
            v: expense.category,
            t: 's',
            s: `cell_${row}_0`,
            ...(isAlternateRow && { bg: { rgb: ALTERNATE_ROW_BG } }),
            al: 'left',
            bl: BORDER_STYLE,
            br: BORDER_STYLE,
            bt: BORDER_STYLE,
            bb: BORDER_STYLE,
        }

        // Amount in currency (Column B)
        const cellB = `B${row}`
        cellData[cellB] = {
            v: expense.amount,
            t: 'n',
            s: `cell_${row}_1`,
            nm: '$#,##0.00', // Currency format
            ...(isAlternateRow ? alternateRowCurrencyStyle : currencyStyle),
        }

        // Percentage calculation (Column C)
        // Formula: (Amount / Total) * 100
        // We'll reference the total in B8 (total amount)
        const cellC = `C${row}`
        cellData[cellC] = {
            v: null, // Will be calculated by formula
            t: 'n',
            s: `cell_${row}_2`,
            f: `=(B${row}/$B$8)*100`, // Using absolute reference for total
            nm: '0.0', // 1 decimal place format
            ...(isAlternateRow ? alternateRowPercentageStyle : percentageStyle),
        }
    })

    // Total row (row 8)
    const totalRow = 8
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0)

    // Total label (Column A)
    cellData[`A${totalRow}`] = {
        v: 'TOTAL',
        t: 's',
        s: `total_0`,
        bf: true,
        bg: { rgb: '#e0e0e0' },
        al: 'left',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    // Total Amount with SUM formula (Column B)
    cellData[`B${totalRow}`] = {
        v: totalAmount, // Display value (optional, formula will calculate)
        t: 'n',
        s: `total_1`,
        f: '=SUM(B1:B7)', // Sum all expense amounts
        nm: '$#,##0.00', // Currency format
        bf: true,
        bg: { rgb: '#e0e0e0' },
        al: 'right',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    // Total Percentage (Column C) - should equal 100%
    cellData[`C${totalRow}`] = {
        v: 100.0,
        t: 'n',
        s: `total_2`,
        f: '=SUM(C1:C7)', // Sum all percentages
        nm: '0.0', // 1 decimal place format
        bf: true,
        bg: { rgb: '#e0e0e0' },
        al: 'center',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    return {
        id: 'monthly-expenses-001',
        name: 'Monthly Budget',
        sheetOrder: ['Gastos'],
        sheets: {
            Gastos: {
                id: 'sheet-gastos',
                name: 'Gastos',
                rowCount: 15,
                columnCount: 3,
                cellData,
                defaultColumnWidth: 180,
                defaultRowHeight: 28,
                columnData: {
                    0: { width: 240 }, // Expense Category
                    1: { width: 180 }, // Amount
                    2: { width: 240 }, // Percentage
                },
                rowData: {
                    0: { height: 32 }, // Header row - slightly taller
                    8: { height: 30 }, // Total row - bold, slightly taller
                },
                styles: {},
            },
        },
    }
}

/**
 * Export the monthly expenses table data
 * Ready to use with createWorkbook function:
 * const workbook = createWorkbook(univer, api, getMonthlyExpensesTableData(), 'monthly-expenses')
 */
export function getMonthlyExpensesTableData(): ExpensesTableData {
    return generateMonthlyExpensesData()
}

/**
 * Alternative: Export as a constant for direct import
 */
export const MONTHLY_EXPENSES_TABLE_DATA = generateMonthlyExpensesData()

/**
 * Helper function to create expenses table with custom data
 * Allows dynamic generation of expense tables with different amounts
 *
 * @param customExpenses - Array of { category: string, amount: number }
 * @returns ExpensesTableData configured with custom expenses
 */
export function createCustomExpensesTable(
    customExpenses: Array<{ category: string; amount: number }>
): ExpensesTableData {
    const baseData = generateMonthlyExpensesData()
    const cellData = { ...baseData.sheets.Gastos.cellData }

    // Clear existing expense rows (keep header)
    for (let row = 1; row <= 7; row++) {
        delete cellData[`A${row}`]
        delete cellData[`B${row}`]
        delete cellData[`C${row}`]
    }

    // Color definitions (same as in generateMonthlyExpensesData)
    const BORDER_STYLE = 1
    const ALTERNATE_ROW_BG = '#f5f5f5'

    const cellStyle = {
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    const alternateRowStyle = {
        ...cellStyle,
        bg: { rgb: ALTERNATE_ROW_BG },
    }

    // Add custom expense rows
    const totalAmount = customExpenses.reduce((sum, exp) => sum + exp.amount, 0)

    customExpenses.forEach((expense, rowIndex) => {
        const row = rowIndex + 1
        const isAlternateRow = rowIndex % 2 === 1

        // Category name
        cellData[`A${row}`] = {
            v: expense.category,
            t: 's',
            s: `cell_${row}_0`,
            al: 'left',
            ...(isAlternateRow && { bg: { rgb: ALTERNATE_ROW_BG } }),
            bl: BORDER_STYLE,
            br: BORDER_STYLE,
            bt: BORDER_STYLE,
            bb: BORDER_STYLE,
        }

        // Amount
        cellData[`B${row}`] = {
            v: expense.amount,
            t: 'n',
            s: `cell_${row}_1`,
            nm: '$#,##0.00',
            al: 'right',
            ...(isAlternateRow && { bg: { rgb: ALTERNATE_ROW_BG } }),
            bl: BORDER_STYLE,
            br: BORDER_STYLE,
            bt: BORDER_STYLE,
            bb: BORDER_STYLE,
        }

        // Percentage
        cellData[`C${row}`] = {
            v: null,
            t: 'n',
            s: `cell_${row}_2`,
            f: `=(B${row}/$B$${customExpenses.length + 1})*100`,
            nm: '0.0',
            al: 'center',
            ...(isAlternateRow && { bg: { rgb: ALTERNATE_ROW_BG } }),
            bl: BORDER_STYLE,
            br: BORDER_STYLE,
            bt: BORDER_STYLE,
            bb: BORDER_STYLE,
        }
    })

    // Update totals row
    const totalRow = customExpenses.length + 1

    cellData[`A${totalRow}`] = {
        v: 'TOTAL',
        t: 's',
        bf: true,
        bg: { rgb: '#e0e0e0' },
        al: 'left',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    cellData[`B${totalRow}`] = {
        v: totalAmount,
        t: 'n',
        f: `=SUM(B1:B${customExpenses.length})`,
        nm: '$#,##0.00',
        bf: true,
        bg: { rgb: '#e0e0e0' },
        al: 'right',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    cellData[`C${totalRow}`] = {
        v: 100.0,
        t: 'n',
        f: `=SUM(C1:C${customExpenses.length})`,
        nm: '0.0',
        bf: true,
        bg: { rgb: '#e0e0e0' },
        al: 'center',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    return {
        ...baseData,
        sheets: {
            Gastos: {
                ...baseData.sheets.Gastos,
                cellData,
                rowCount: Math.max(customExpenses.length + 3, 15),
                rowData: {
                    0: { height: 32 },
                    [totalRow]: { height: 30 },
                },
            },
        },
    }
}
