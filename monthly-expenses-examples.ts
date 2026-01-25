/**
 * Advanced Examples for Monthly Expenses Table
 *
 * This file demonstrates various use cases and patterns for working with
 * the monthly expenses table in Univer
 */

import {
    getMonthlyExpensesTableData,
    createCustomExpensesTable,
    MONTHLY_EXPENSES_TABLE_DATA,
} from './monthly-expenses-table'

/**
 * Example 1: Multiple Budget Scenarios Comparison
 *
 * Create different budget scenarios for comparison (e.g., conservative, standard, optimistic)
 */
export function createBudgetScenarios() {
    const conservativeExpenses = [
        { category: 'Vivienda', amount: 1000 },
        { category: 'Alimentación', amount: 350 },
        { category: 'Transporte', amount: 250 },
        { category: 'Servicios', amount: 120 },
        { category: 'Entretenimiento', amount: 100 },
        { category: 'Salud', amount: 80 },
        { category: 'Otros', amount: 50 },
    ]

    const standardExpenses = [
        { category: 'Vivienda', amount: 1200 },
        { category: 'Alimentación', amount: 450 },
        { category: 'Transporte', amount: 300 },
        { category: 'Servicios', amount: 150 },
        { category: 'Entretenimiento', amount: 200 },
        { category: 'Salud', amount: 100 },
        { category: 'Otros', amount: 100 },
    ]

    const optimisticExpenses = [
        { category: 'Vivienda', amount: 1500 },
        { category: 'Alimentación', amount: 600 },
        { category: 'Transporte', amount: 400 },
        { category: 'Servicios', amount: 200 },
        { category: 'Entretenimiento', amount: 300 },
        { category: 'Salud', amount: 150 },
        { category: 'Otros', amount: 200 },
    ]

    return {
        conservative: createCustomExpensesTable(conservativeExpenses),
        standard: createCustomExpensesTable(standardExpenses),
        optimistic: createCustomExpensesTable(optimisticExpenses),
    }
}

/**
 * Example 2: Business Department Budget
 *
 * Create a budget for a specific business department
 */
export function createDepartmentBudget(department: string) {
    const departmentBudgets: {
        [key: string]: Array<{ category: string; amount: number }>
    } = {
        'Marketing': [
            { category: 'Digital Advertising', amount: 5000 },
            { category: 'Content Creation', amount: 2000 },
            { category: 'Tools & Software', amount: 1500 },
            { category: 'Events', amount: 3000 },
            { category: 'Team Training', amount: 1000 },
        ],
        'Operations': [
            { category: 'Facilities Rent', amount: 8000 },
            { category: 'Utilities', amount: 2000 },
            { category: 'Maintenance', amount: 1500 },
            { category: 'Equipment', amount: 3000 },
            { category: 'Supplies', amount: 1000 },
        ],
        'IT': [
            { category: 'Cloud Services', amount: 4000 },
            { category: 'Software Licenses', amount: 3000 },
            { category: 'Hardware', amount: 5000 },
            { category: 'Security', amount: 2000 },
            { category: 'Development Tools', amount: 1500 },
        ],
        'Human Resources': [
            { category: 'Salaries (Benefits Pool)', amount: 20000 },
            { category: 'Training & Development', amount: 3000 },
            { category: 'Recruitment', amount: 2000 },
            { category: 'Wellness Programs', amount: 1500 },
            { category: 'Compliance', amount: 1000 },
        ],
    }

    const expenses = departmentBudgets[department] || departmentBudgets['Operations']
    const data = createCustomExpensesTable(expenses)

    return {
        ...data,
        name: `${department} Budget`,
        sheets: {
            [department]: {
                ...data.sheets.Gastos,
                id: `sheet-${department.toLowerCase()}`,
                name: department,
            },
        },
        sheetOrder: [department],
    }
}

/**
 * Example 3: Quarterly Expense Comparison
 *
 * Create a multi-sheet workbook comparing expenses across 3 months
 */
export function createQuarterlyExpenseAnalysis() {
    const q1Expenses = [
        { category: 'Vivienda', amount: 1200 },
        { category: 'Alimentación', amount: 500 },
        { category: 'Transporte', amount: 350 },
        { category: 'Servicios', amount: 180 },
        { category: 'Entretenimiento', amount: 150 },
        { category: 'Salud', amount: 100 },
        { category: 'Otros', amount: 80 },
    ]

    const q2Expenses = [
        { category: 'Vivienda', amount: 1200 },
        { category: 'Alimentación', amount: 480 },
        { category: 'Transporte', amount: 320 },
        { category: 'Servicios', amount: 150 },
        { category: 'Entretenimiento', amount: 200 },
        { category: 'Salud', amount: 120 },
        { category: 'Otros', amount: 100 },
    ]

    const q3Expenses = [
        { category: 'Vivienda', amount: 1200 },
        { category: 'Alimentación', amount: 520 },
        { category: 'Transporte', amount: 380 },
        { category: 'Servicios', amount: 200 },
        { category: 'Entretenimiento', amount: 250 },
        { category: 'Salud', amount: 80 },
        { category: 'Otros', amount: 120 },
    ]

    const baseData = getMonthlyExpensesTableData()
    const q1Data = createCustomExpensesTable(q1Expenses)
    const q2Data = createCustomExpensesTable(q2Expenses)
    const q3Data = createCustomExpensesTable(q3Expenses)

    // Create a workbook with 3 sheets
    return {
        id: 'quarterly-analysis-001',
        name: 'Quarterly Expense Analysis',
        sheetOrder: ['Q1 2024', 'Q2 2024', 'Q3 2024'],
        sheets: {
            'Q1 2024': {
                ...q1Data.sheets.Gastos,
                id: 'sheet-q1',
                name: 'Q1 2024',
            },
            'Q2 2024': {
                ...q2Data.sheets.Gastos,
                id: 'sheet-q2',
                name: 'Q2 2024',
            },
            'Q3 2024': {
                ...q3Data.sheets.Gastos,
                id: 'sheet-q3',
                name: 'Q3 2024',
            },
        },
    }
}

/**
 * Example 4: Project Budget Tracker
 *
 * Track budget for a specific project with allocated vs. spent comparison
 */
export function createProjectBudgetTracker(
    projectName: string,
    allocatedExpenses: Array<{ category: string; allocated: number; spent: number }>
) {
    const BORDER_STYLE = 1
    const HEADER_BG = '#d3d3d3'
    const HEADER_TEXT = '#000000'
    const ALTERNATE_ROW_BG = '#f5f5f5'

    const headerStyle = {
        bf: true,
        fs: 12,
        fc: { rgb: HEADER_TEXT },
        bg: { rgb: HEADER_BG },
        al: 'center',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

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

    const cellData: any = {}

    // Headers
    const headers = ['Category', 'Allocated ($)', 'Spent ($)', 'Remaining ($)', 'Variance (%)']
    headers.forEach((header, col) => {
        const cellRef = `${String.fromCharCode(65 + col)}0`
        cellData[cellRef] = {
            v: header,
            t: 's',
            s: `header_${col}`,
            ...headerStyle,
        }
    })

    // Data rows
    allocatedExpenses.forEach((expense, rowIndex) => {
        const row = rowIndex + 1
        const isAlternateRow = rowIndex % 2 === 1

        const baseStyle = isAlternateRow ? alternateRowStyle : cellStyle

        // Category
        cellData[`A${row}`] = {
            v: expense.category,
            t: 's',
            ...baseStyle,
            al: 'left',
        }

        // Allocated
        cellData[`B${row}`] = {
            v: expense.allocated,
            t: 'n',
            nm: '$#,##0.00',
            ...baseStyle,
            al: 'right',
        }

        // Spent
        cellData[`C${row}`] = {
            v: expense.spent,
            t: 'n',
            nm: '$#,##0.00',
            ...baseStyle,
            al: 'right',
        }

        // Remaining (Formula: Allocated - Spent)
        cellData[`D${row}`] = {
            v: null,
            t: 'n',
            f: `=B${row}-C${row}`,
            nm: '$#,##0.00',
            ...baseStyle,
            al: 'right',
        }

        // Variance % (Formula: (Spent / Allocated) * 100)
        cellData[`E${row}`] = {
            v: null,
            t: 'n',
            f: `=(C${row}/B${row})*100`,
            nm: '0.0',
            ...baseStyle,
            al: 'center',
        }
    })

    // Totals row
    const totalRow = allocatedExpenses.length + 1
    const totalStyle = {
        bf: true,
        bg: { rgb: '#e0e0e0' },
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    cellData[`A${totalRow}`] = {
        v: 'TOTAL',
        t: 's',
        ...totalStyle,
        al: 'left',
    }

    cellData[`B${totalRow}`] = {
        v: null,
        t: 'n',
        f: `=SUM(B1:B${allocatedExpenses.length})`,
        nm: '$#,##0.00',
        ...totalStyle,
        al: 'right',
    }

    cellData[`C${totalRow}`] = {
        v: null,
        t: 'n',
        f: `=SUM(C1:C${allocatedExpenses.length})`,
        nm: '$#,##0.00',
        ...totalStyle,
        al: 'right',
    }

    cellData[`D${totalRow}`] = {
        v: null,
        t: 'n',
        f: `=SUM(D1:D${allocatedExpenses.length})`,
        nm: '$#,##0.00',
        ...totalStyle,
        al: 'right',
    }

    cellData[`E${totalRow}`] = {
        v: null,
        t: 'n',
        f: `=(C${totalRow}/B${totalRow})*100`,
        nm: '0.0',
        ...totalStyle,
        al: 'center',
    }

    return {
        id: `project-budget-${projectName.replace(/\s+/g, '-').toLowerCase()}`,
        name: `Project Budget: ${projectName}`,
        sheetOrder: ['Budget'],
        sheets: {
            Budget: {
                id: 'sheet-budget',
                name: 'Budget',
                rowCount: Math.max(allocatedExpenses.length + 3, 15),
                columnCount: 5,
                cellData,
                defaultColumnWidth: 160,
                defaultRowHeight: 28,
                columnData: {
                    0: { width: 200 },
                    1: { width: 160 },
                    2: { width: 160 },
                    3: { width: 180 },
                    4: { width: 200 },
                },
                rowData: {
                    0: { height: 32 },
                    [totalRow]: { height: 30 },
                },
                styles: {},
            },
        },
    }
}

/**
 * Example 5: Personal Finance Breakdown
 *
 * Create a comprehensive personal finance overview
 */
export function createPersonalFinanceBreakdown() {
    const incomeData = [
        { category: 'Primary Salary', amount: 5000 },
        { category: 'Freelance Work', amount: 1000 },
        { category: 'Investment Returns', amount: 500 },
    ]

    const expenseData = [
        { category: 'Vivienda', amount: 1200 },
        { category: 'Alimentación', amount: 450 },
        { category: 'Transporte', amount: 300 },
        { category: 'Servicios', amount: 150 },
        { category: 'Entretenimiento', amount: 200 },
        { category: 'Salud', amount: 100 },
        { category: 'Ahorros', amount: 500 },
        { category: 'Otros', amount: 100 },
    ]

    const savingsData = [
        { category: 'Fondo de Emergencia', amount: 300 },
        { category: 'Retiro', amount: 200 },
    ]

    const incomeSheetData = createCustomExpensesTable(incomeData)
    const expenseSheetData = createCustomExpensesTable(expenseData)
    const savingsSheetData = createCustomExpensesTable(savingsData)

    return {
        id: 'personal-finance-001',
        name: 'Personal Finance Overview',
        sheetOrder: ['Ingresos', 'Gastos', 'Ahorros'],
        sheets: {
            Ingresos: {
                ...incomeSheetData.sheets.Gastos,
                id: 'sheet-income',
                name: 'Ingresos',
            },
            Gastos: {
                ...expenseSheetData.sheets.Gastos,
                id: 'sheet-expenses',
                name: 'Gastos',
            },
            Ahorros: {
                ...savingsSheetData.sheets.Gastos,
                id: 'sheet-savings',
                name: 'Ahorros',
            },
        },
    }
}

/**
 * Example 6: Expense Analysis with Custom Threshold
 *
 * Highlight expenses that exceed a certain percentage of total
 */
export function analyzeExpensesByThreshold(
    expenseData: Array<{ category: string; amount: number }>,
    threshold: number = 30 // percentage
) {
    const tableData = createCustomExpensesTable(expenseData)
    const cellData = { ...tableData.sheets.Gastos.cellData }
    const styles = { ...tableData.sheets.Gastos.styles }

    const totalAmount = expenseData.reduce((sum, exp) => sum + exp.amount, 0)

    // Find high-expense categories and flag them
    expenseData.forEach((expense, rowIndex) => {
        const row = rowIndex + 1
        const percentage = (expense.amount / totalAmount) * 100

        if (percentage > threshold) {
            // Apply warning style to this row
            const cellRef = `C${row}`
            if (cellData[cellRef]) {
                cellData[cellRef] = {
                    ...cellData[cellRef],
                    bg: { rgb: '#fef3c7' }, // Yellow background
                }
            }
        }
    })

    return {
        ...tableData,
        sheets: {
            Gastos: {
                ...tableData.sheets.Gastos,
                cellData,
                styles,
            },
        },
    }
}

/**
 * Example 7: Year-over-Year Expense Comparison
 *
 * Compare monthly expenses for the same months in different years
 */
export function createYearOverYearComparison(
    currentYearExpenses: Array<{ category: string; amount: number }>,
    previousYearExpenses: Array<{ category: string; amount: number }>
) {
    const BORDER_STYLE = 1
    const HEADER_BG = '#d3d3d3'
    const HEADER_TEXT = '#000000'

    const headerStyle = {
        bf: true,
        fs: 12,
        fc: { rgb: HEADER_TEXT },
        bg: { rgb: HEADER_BG },
        al: 'center',
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    const cellStyle = {
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    const cellData: any = {}

    // Headers
    const headers = [
        'Category',
        '2024 Amount ($)',
        '2024 %',
        '2023 Amount ($)',
        '2023 %',
        'Change ($)',
        'Change (%)',
    ]
    headers.forEach((header, col) => {
        const cellRef = `${String.fromCharCode(65 + col)}0`
        cellData[cellRef] = {
            v: header,
            t: 's',
            ...headerStyle,
        }
    })

    // Data rows
    currentYearExpenses.forEach((expense, rowIndex) => {
        const row = rowIndex + 1
        const isAlternateRow = rowIndex % 2 === 1

        const baseStyle = isAlternateRow ? { ...cellStyle, bg: { rgb: '#f5f5f5' } } : cellStyle

        cellData[`A${row}`] = {
            v: expense.category,
            t: 's',
            ...baseStyle,
            al: 'left',
        }

        // Current year amount
        cellData[`B${row}`] = {
            v: expense.amount,
            t: 'n',
            nm: '$#,##0.00',
            ...baseStyle,
            al: 'right',
        }

        // Current year percentage
        cellData[`C${row}`] = {
            v: null,
            t: 'n',
            f: `=(B${row}/$B$${currentYearExpenses.length + 1})*100`,
            nm: '0.0',
            ...baseStyle,
            al: 'center',
        }

        // Previous year amount (matching category)
        const prevExpense = previousYearExpenses.find((e) => e.category === expense.category)
        cellData[`D${row}`] = {
            v: prevExpense?.amount || 0,
            t: 'n',
            nm: '$#,##0.00',
            ...baseStyle,
            al: 'right',
        }

        // Previous year percentage
        cellData[`E${row}`] = {
            v: null,
            t: 'n',
            f: `=(D${row}/$D$${currentYearExpenses.length + 1})*100`,
            nm: '0.0',
            ...baseStyle,
            al: 'center',
        }

        // Change amount
        cellData[`F${row}`] = {
            v: null,
            t: 'n',
            f: `=B${row}-D${row}`,
            nm: '$#,##0.00',
            ...baseStyle,
            al: 'right',
        }

        // Change percentage
        cellData[`G${row}`] = {
            v: null,
            t: 'n',
            f: `=(F${row}/D${row})*100`,
            nm: '0.0',
            ...baseStyle,
            al: 'center',
        }
    })

    return {
        id: 'yoy-comparison-001',
        name: 'Year-over-Year Comparison',
        sheetOrder: ['Comparison'],
        sheets: {
            Comparison: {
                id: 'sheet-comparison',
                name: 'Comparison',
                rowCount: Math.max(currentYearExpenses.length + 3, 15),
                columnCount: 7,
                cellData,
                defaultColumnWidth: 140,
                defaultRowHeight: 28,
                columnData: {
                    0: { width: 180 },
                    1: { width: 160 },
                    2: { width: 140 },
                    3: { width: 160 },
                    4: { width: 140 },
                    5: { width: 160 },
                    6: { width: 140 },
                },
                rowData: {
                    0: { height: 32 },
                    [currentYearExpenses.length + 1]: { height: 30 },
                },
                styles: {},
            },
        },
    }
}

/**
 * Export all examples
 */
export const ExpenseExamples = {
    createBudgetScenarios,
    createDepartmentBudget,
    createQuarterlyExpenseAnalysis,
    createProjectBudgetTracker,
    createPersonalFinanceBreakdown,
    analyzeExpensesByThreshold,
    createYearOverYearComparison,
}

export default ExpenseExamples
