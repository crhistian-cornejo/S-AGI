/**
 * Professional Sales Table Example for Univer Spreadsheet
 *
 * This file demonstrates how to create a professionally styled sales table
 * with Univer's formatting capabilities including:
 * - Bold headers with dark blue background and white text
 * - Alternating row colors for better readability
 * - Defined borders on all cells
 * - Appropriate column widths
 * - Correct text alignment
 * - Formula-based calculations (Total and SUM rows)
 *
 * Usage: Pass this data structure to createWorkbook() function
 */

export interface SalesTableData {
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
 * Generate sample sales data with realistic product information
 */
function generateSalesData(): SalesTableData {
    // Color definitions
    const HEADER_BG = '#1e3a8a' // Dark blue
    const HEADER_TEXT = '#ffffff' // White
    const ALTERNATE_ROW_BG = '#f0f9ff' // Light blue
    const BORDER_STYLE = 1 // Thin border

    // Header row styling
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

    // Normal cell styling with borders
    const cellStyle = {
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    // Alternating row styling (light blue background)
    const alternateRowStyle = {
        ...cellStyle,
        bg: { rgb: ALTERNATE_ROW_BG },
    }

    // Total row styling (bold with light background)
    const totalRowStyle = {
        bf: true,
        bg: { rgb: '#dbeafe' },
        bl: BORDER_STYLE,
        br: BORDER_STYLE,
        bt: BORDER_STYLE,
        bb: BORDER_STYLE,
    }

    // Currency formatting style
    const currencyStyle = {
        ...cellStyle,
        al: 'right',
    }

    const alternateRowCurrencyStyle = {
        ...alternateRowStyle,
        al: 'right',
    }

    // Number formatting style
    const numberStyle = {
        ...cellStyle,
        al: 'center',
    }

    const alternateRowNumberStyle = {
        ...alternateRowStyle,
        al: 'center',
    }

    // Build cell data with realistic product sales
    const cellData: { [key: string]: { [key: string]: any } } = {}

    // Headers (Row 0)
    const headers = ['ID', 'Producto', 'Categoría', 'Cantidad', 'Precio Unitario', 'Total', 'Fecha']
    headers.forEach((header, col) => {
        const cellRef = `${String.fromCharCode(65 + col)}0`
        cellData[cellRef] = {
            v: header,
            t: 's',
            s: `header_${col}`,
        }
    })

    // Sample product data
    const products = [
        {
            id: 'P001',
            name: 'Laptop HP ProBook 15',
            category: 'Electrónica',
            quantity: 5,
            unitPrice: 1299.99,
            date: '2024-01-15',
        },
        {
            id: 'P002',
            name: 'Monitor LG 27" 4K',
            category: 'Periféricos',
            quantity: 8,
            unitPrice: 399.50,
            date: '2024-01-16',
        },
        {
            id: 'P003',
            name: 'Teclado Mecánico RGB',
            category: 'Accesorios',
            quantity: 12,
            unitPrice: 149.99,
            date: '2024-01-17',
        },
        {
            id: 'P004',
            name: 'Mouse Inalámbrico Pro',
            category: 'Accesorios',
            quantity: 15,
            unitPrice: 79.99,
            date: '2024-01-18',
        },
        {
            id: 'P005',
            name: 'Webcam Full HD 1080p',
            category: 'Periféricos',
            quantity: 10,
            unitPrice: 89.50,
            date: '2024-01-19',
        },
        {
            id: 'P006',
            name: 'Micrófono USB Profesional',
            category: 'Audio',
            quantity: 6,
            unitPrice: 159.99,
            date: '2024-01-20',
        },
        {
            id: 'P007',
            name: 'Dock Thunderbolt 3',
            category: 'Conectividad',
            quantity: 4,
            unitPrice: 299.99,
            date: '2024-01-21',
        },
        {
            id: 'P008',
            name: 'Adaptador HDMI 2.1',
            category: 'Cables',
            quantity: 20,
            unitPrice: 24.99,
            date: '2024-01-22',
        },
        {
            id: 'P009',
            name: 'Monitor Luz LED Ajustable',
            category: 'Iluminación',
            quantity: 7,
            unitPrice: 129.99,
            date: '2024-01-23',
        },
        {
            id: 'P010',
            name: 'Soporte Doble Monitor',
            category: 'Accesorios',
            quantity: 9,
            unitPrice: 199.50,
            date: '2024-01-24',
        },
    ]

    // Add data rows (rows 1-10)
    products.forEach((product, rowIndex) => {
        const row = rowIndex + 1
        const isAlternateRow = rowIndex % 2 === 1

        const getStyle = (baseStyle: any) =>
            isAlternateRow ? { ...baseStyle, ...alternateRowStyle } : { ...baseStyle, ...cellStyle }

        // ID
        const cellA = `A${row}`
        cellData[cellA] = {
            v: product.id,
            t: 's',
            s: `cell_${row}_0`,
        }

        // Producto
        const cellB = `B${row}`
        cellData[cellB] = {
            v: product.name,
            t: 's',
            s: `cell_${row}_1`,
        }

        // Categoría
        const cellC = `C${row}`
        cellData[cellC] = {
            v: product.category,
            t: 's',
            s: `cell_${row}_2`,
        }

        // Cantidad
        const cellD = `D${row}`
        cellData[cellD] = {
            v: product.quantity,
            t: 'n',
            s: `cell_${row}_3`,
        }

        // Precio Unitario
        const cellE = `E${row}`
        cellData[cellE] = {
            v: product.unitPrice,
            t: 'n',
            s: `cell_${row}_4`,
            nm: '$#,##0.00',
        }

        // Total (Formula)
        const cellF = `F${row}`
        cellData[cellF] = {
            v: product.quantity * product.unitPrice,
            t: 'n',
            s: `cell_${row}_5`,
            f: `=D${row}*E${row}`,
            nm: '$#,##0.00',
        }

        // Fecha
        const cellG = `G${row}`
        cellData[cellG] = {
            v: product.date,
            t: 's',
            s: `cell_${row}_6`,
        }
    })

    // Totals row (row 11)
    const totalRow = 11

    // Empty cells before totals
    cellData[`A${totalRow}`] = { v: '', t: 's', s: `total_0` }
    cellData[`B${totalRow}`] = { v: '', t: 's', s: `total_1` }
    cellData[`C${totalRow}`] = { v: '', t: 's', s: `total_2` }

    // Total Quantity
    cellData[`D${totalRow}`] = {
        v: undefined, // Will be calculated by formula
        t: 'n',
        s: `total_3`,
        f: '=SUM(D1:D10)',
    }

    // Totals label (spanning)
    cellData[`E${totalRow}`] = {
        v: 'TOTAL:',
        t: 's',
        s: `total_4`,
        al: 'right',
    }

    // Grand Total
    cellData[`F${totalRow}`] = {
        v: undefined, // Will be calculated by formula
        t: 'n',
        s: `total_5`,
        f: '=SUM(F1:F10)',
        nm: '$#,##0.00',
    }

    cellData[`G${totalRow}`] = { v: '', t: 's', s: `total_6` }

    // Build style definitions
    const styles: { [key: string]: any } = {}

    // Header styles
    headers.forEach((_, col) => {
        styles[`header_${col}`] = headerStyle
    })

    // Cell styles for data rows
    for (let row = 1; row <= 10; row++) {
        for (let col = 0; col < 7; col++) {
            const isAlternate = (row - 1) % 2 === 1
            const colLetter = String.fromCharCode(65 + col)

            let style = cellStyle
            if (col === 3 || col === 4 || col === 5) {
                // Number/currency columns
                if (col === 4 || col === 5) {
                    style = isAlternate ? alternateRowCurrencyStyle : currencyStyle
                } else {
                    style = isAlternate ? alternateRowNumberStyle : numberStyle
                }
            } else if (isAlternate) {
                style = alternateRowStyle
            }

            styles[`cell_${row}_${col}`] = style
        }
    }

    // Total row styles
    for (let col = 0; col < 7; col++) {
        styles[`total_${col}`] = {
            ...totalRowStyle,
            ...(col === 4 || col === 5 ? { al: 'right' } : {}),
        }
    }

    return {
        id: 'sales-table-001',
        name: 'Sales Report',
        sheetOrder: ['Ventas'],
        sheets: {
            Ventas: {
                id: 'sheet-ventas',
                name: 'Ventas',
                rowCount: 20,
                columnCount: 7,
                cellData,
                defaultColumnWidth: 120,
                defaultRowHeight: 28,
                columnData: {
                    0: { width: 80 }, // ID
                    1: { width: 200 }, // Producto
                    2: { width: 130 }, // Categoría
                    3: { width: 100 }, // Cantidad
                    4: { width: 130 }, // Precio Unitario
                    5: { width: 130 }, // Total
                    6: { width: 110 }, // Fecha
                },
                rowData: {
                    0: { height: 32 }, // Header row - slightly taller
                    11: { height: 30 }, // Total row - bold, slightly taller
                },
                styles,
            },
        },
    }
}

/**
 * Export the sales table data
 * Ready to use with createWorkbook function:
 * const workbook = createWorkbook(univer, api, getSalesTableData(), 'sales-table')
 */
export function getSalesTableData(): SalesTableData {
    return generateSalesData()
}

/**
 * Alternative: Export as a constant for direct import
 */
export const SALES_TABLE_DATA = generateSalesData()
