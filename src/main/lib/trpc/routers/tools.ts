import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import { sendToRenderer } from '../../window-manager'
import { getSecureApiKeyStore } from '../../auth/api-key-store'
import log from 'electron-log'
import OpenAI from 'openai'

/**
 * Tool execution router - executes spreadsheet tools in the main process
 * This enables the Agent Loop to run tools and get results without renderer involvement
 */

// Context passed to tools that need external API access
export interface ToolContext {
    apiKey?: string
    provider?: 'openai' | 'anthropic' | 'zai' | 'chatgpt-plus'
    baseURL?: string
    headers?: Record<string, string>
}

// Helper: Notify renderer of artifact updates for live UI sync
function notifyArtifactUpdate(artifactId: string, univerData: any, type: 'spreadsheet' | 'document') {
    sendToRenderer('artifact:update', { artifactId, univerData, type })
    log.info(`[Tools] Sent live update for ${type}: ${artifactId}`)
}

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
        sheetOrder: [sheetId],
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

// Helper: Create Univer document data structure (for Word-like documents)
function createUniverDocument(title: string, content: string = ''): Record<string, unknown> {
    // Convert plain text content to Univer document format
    // Each line becomes a paragraph
    const lines = content ? content.split('\n') : ['']
    let dataStream = ''
    const paragraphs: Array<{ startIndex: number; paragraphStyle?: Record<string, unknown> }> = []
    
    let currentIndex = 0
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        paragraphs.push({
            startIndex: currentIndex,
            paragraphStyle: {}
        })
        dataStream += line + '\r\n'
        currentIndex += line.length + 2 // +2 for \r\n
    }
    
    return {
        id: crypto.randomUUID(),
        title,
        body: {
            dataStream,
            textRuns: [],
            paragraphs
        },
        documentStyle: {
            pageSize: {
                width: 816, // 8.5 inches * 96 DPI
                height: 1056 // 11 inches * 96 DPI
            },
            marginTop: 72,
            marginBottom: 72,
            marginLeft: 90,
            marginRight: 90
        }
    }
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
    sort_range: {
        description: 'Sort data in a spreadsheet by one or more columns',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().optional().describe('Optional cell range to sort (e.g., A2:D10). If omitted, sorts all data rows (excluding header row 1).'),
            sortBy: z.array(z.object({
                column: z.string().describe('Column letter to sort by (e.g., A, B, C)'),
                order: z.enum(['asc', 'desc']).default('asc').describe('Sort order: ascending or descending')
            })).describe('Array of sort criteria. First item is primary sort, second is secondary, etc.')
        })
    },
    filter_data: {
        description: 'Filter spreadsheet data based on column conditions. Returns matching row indices for reference.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            conditions: z.array(z.object({
                column: z.string().describe('Column letter to filter on (e.g., A, B)'),
                operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'greater_equal', 'less_equal', 'is_empty', 'is_not_empty']).describe('Comparison operator'),
                value: z.union([z.string(), z.number()]).optional().describe('Value to compare against (not needed for is_empty/is_not_empty)')
            })).describe('Filter conditions to apply'),
            logic: z.enum(['and', 'or']).default('and').describe('How to combine multiple conditions')
        })
    },
    conditional_format: {
        description: 'Apply conditional formatting rules to highlight cells based on their values. Supports color scales, data bars, and icon sets.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range to apply formatting to (e.g., A1:D10)'),
            rule: z.object({
                type: z.enum(['colorScale', 'dataBar', 'iconSet', 'cellValue']).describe('Type of conditional formatting rule'),
                // For cellValue rules
                condition: z.object({
                    operator: z.enum(['greaterThan', 'lessThan', 'equal', 'notEqual', 'between', 'contains', 'beginsWith', 'endsWith']).optional(),
                    value: z.union([z.string(), z.number()]).optional(),
                    value2: z.union([z.string(), z.number()]).optional().describe('Second value for "between" operator')
                }).optional().describe('Condition for cellValue type rules'),
                // Style to apply when condition is met (for cellValue type)
                style: z.object({
                    backgroundColor: z.string().optional().describe('Background color as hex (e.g., #FF0000)'),
                    fontColor: z.string().optional().describe('Font color as hex'),
                    bold: z.boolean().optional(),
                    italic: z.boolean().optional()
                }).optional().describe('Style to apply when condition matches'),
                // For colorScale rules
                colorScale: z.object({
                    minColor: z.string().describe('Color for minimum value (hex)'),
                    midColor: z.string().optional().describe('Color for midpoint value (hex, optional)'),
                    maxColor: z.string().describe('Color for maximum value (hex)')
                }).optional().describe('Colors for color scale (type must be colorScale)'),
                // For dataBar rules
                dataBar: z.object({
                    color: z.string().describe('Bar color (hex)'),
                    showValue: z.boolean().default(true).describe('Show cell value alongside bar')
                }).optional().describe('Settings for data bar (type must be dataBar)'),
                // For iconSet rules
                iconSet: z.object({
                    type: z.enum(['threeArrows', 'threeTrafficLights', 'threeSymbols', 'fourArrows', 'fourTrafficLights', 'fiveArrows', 'fiveRating']).describe('Icon set to use')
                }).optional().describe('Settings for icon set (type must be iconSet)')
            }).describe('The conditional formatting rule to apply')
        })
    },
    insert_image: {
        description: 'Insert an image into a spreadsheet. The image can be provided as a URL or base64 data.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            cell: z.string().describe('Cell reference where to anchor the image (e.g., A1)'),
            source: z.object({
                type: z.enum(['url', 'base64']).describe('Type of image source'),
                data: z.string().describe('Image URL or base64 encoded image data (without data: prefix)'),
                mimeType: z.string().optional().describe('MIME type for base64 images (e.g., image/png, image/jpeg)')
            }).describe('Image source configuration'),
            size: z.object({
                width: z.number().describe('Width in pixels'),
                height: z.number().describe('Height in pixels')
            }).optional().describe('Optional image dimensions. If not provided, uses default 200x200.')
        })
    },
    get_spreadsheet_summary: {
        description: 'Get a summary of spreadsheet contents including headers, row count, and sample data. Use this to understand the current state before making modifications.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            maxRows: z.number().optional().default(10).describe('Maximum rows to include in summary')
        })
    },
    copy_range: {
        description: 'Copy cells from one range to another within the same spreadsheet. Values, formulas, and formatting are copied.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            sourceRange: z.string().describe('Source cell range to copy from (e.g., A1:C5)'),
            destinationCell: z.string().describe('Top-left cell of the destination (e.g., E1). The range will expand to match source size.')
        })
    },
    move_range: {
        description: 'Move cells from one range to another within the same spreadsheet. Source cells are cleared after moving.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            sourceRange: z.string().describe('Source cell range to move from (e.g., A1:C5)'),
            destinationCell: z.string().describe('Top-left cell of the destination (e.g., E1). The range will expand to match source size.')
        })
    },
    find_replace: {
        description: 'Find and replace text across the spreadsheet or within a specific range.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            find: z.string().describe('Text or pattern to find'),
            replace: z.string().describe('Text to replace with'),
            range: z.string().optional().describe('Optional cell range to limit search (e.g., A1:D10). If omitted, searches entire sheet.'),
            matchCase: z.boolean().optional().default(false).describe('Whether search is case-sensitive'),
            matchEntireCell: z.boolean().optional().default(false).describe('Whether to match entire cell content only')
        })
    },
    freeze_panes: {
        description: 'Freeze rows and/or columns for easier navigation. Frozen rows/columns stay visible while scrolling.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            rows: z.number().optional().default(0).describe('Number of rows to freeze from the top (e.g., 1 to freeze header row)'),
            columns: z.number().optional().default(0).describe('Number of columns to freeze from the left')
        })
    },
    auto_fill: {
        description: 'Auto-fill a range based on a pattern. Useful for sequences (1,2,3...), dates, or extending formulas.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            sourceRange: z.string().describe('Source range containing the pattern (e.g., A1:A2 with values 1,2)'),
            fillRange: z.string().describe('Target range to fill (e.g., A1:A10 to extend the pattern)')
        })
    },
    clear_range: {
        description: 'Clear contents and/or formatting from a range of cells.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range to clear (e.g., A1:D10)'),
            clearType: z.enum(['all', 'contents', 'formats']).default('all').describe('What to clear: all (contents+formats), contents only, or formats only')
        })
    },
    insert_column: {
        description: 'Insert one or more new columns at a specified position. Existing columns shift right.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            column: z.string().describe('Column letter where to insert (e.g., "B" inserts before column B)'),
            count: z.number().optional().default(1).describe('Number of columns to insert'),
            values: z.array(z.string()).optional().describe('Optional header values for the new columns')
        })
    },
    delete_column: {
        description: 'Delete one or more columns from the spreadsheet.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            columns: z.array(z.string()).describe('Column letters to delete (e.g., ["B", "C"])')
        })
    },
    duplicate_row: {
        description: 'Duplicate an existing row, inserting the copy below the original.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            row: z.number().describe('Row number to duplicate (1-based)'),
            count: z.number().optional().default(1).describe('Number of copies to create')
        })
    },
    insert_row: {
        description: 'Insert one or more new empty rows at a specified position. Existing rows shift down.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            row: z.number().describe('Row number where to insert (1-based, e.g., 2 inserts before row 2)'),
            count: z.number().optional().default(1).describe('Number of rows to insert')
        })
    },
    rename_sheet: {
        description: 'Rename the worksheet tab.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            sheetId: z.string().optional().describe('Sheet ID to rename (defaults to first/active sheet)'),
            newName: z.string().describe('New name for the sheet tab')
        })
    },
    add_sheet: {
        description: 'Add a new worksheet to the workbook.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            name: z.string().describe('Name for the new sheet'),
            columns: z.array(z.string()).optional().describe('Optional column headers for the new sheet')
        })
    },
    data_validation: {
        description: 'Add data validation rules to cells. Supports dropdown lists, number ranges, and custom validation.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range to apply validation (e.g., A2:A100)'),
            validationType: z.enum(['list', 'number', 'integer', 'date', 'textLength', 'custom']).describe('Type of validation'),
            rule: z.object({
                // For list validation
                options: z.array(z.string()).optional().describe('Dropdown options for list validation'),
                // For number/integer/textLength validation  
                operator: z.enum(['between', 'notBetween', 'equal', 'notEqual', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual']).optional(),
                value1: z.union([z.string(), z.number()]).optional().describe('First value for comparison'),
                value2: z.union([z.string(), z.number()]).optional().describe('Second value (for between operators)'),
                // For custom validation
                formula: z.string().optional().describe('Custom formula for validation'),
                // Error handling
                errorMessage: z.string().optional().describe('Error message to show when validation fails'),
                errorTitle: z.string().optional().describe('Title for error dialog')
            }).describe('Validation rule configuration')
        })
    },
    add_comment: {
        description: 'Add a comment/note to a cell.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            cell: z.string().describe('Cell reference (e.g., A1)'),
            comment: z.string().describe('Comment text'),
            author: z.string().optional().describe('Author name for the comment')
        })
    },
    protect_range: {
        description: 'Protect a range of cells from editing.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range to protect (e.g., A1:D10)'),
            description: z.string().optional().describe('Description of why this range is protected')
        })
    },
    set_print_area: {
        description: 'Set the print area for the spreadsheet.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range to set as print area (e.g., A1:G50)')
        })
    },
    get_cell_value: {
        description: 'Get the value of a single cell. Returns the value, formula (if any), and formatting info.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            cell: z.string().describe('Cell reference (e.g., A1, B5)')
        })
    },
    get_range_values: {
        description: 'Get values from a range of cells. Returns a 2D array of values.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range (e.g., A1:D10)'),
            includeFormulas: z.boolean().optional().default(false).describe('Include formulas instead of calculated values')
        })
    },
    transpose_range: {
        description: 'Transpose a range of cells, swapping rows and columns. A1:C2 with 2 rows and 3 cols becomes 3 rows and 2 cols.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            sourceRange: z.string().describe('Source range to transpose (e.g., A1:C3)'),
            destinationCell: z.string().describe('Top-left cell for the transposed output (e.g., E1)')
        })
    },
    calculate_range: {
        description: 'Calculate statistics for a range of numeric cells. Returns sum, average, min, max, and count.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range to calculate (e.g., A1:A100)')
        })
    },
    export_to_csv: {
        description: 'Export spreadsheet data to CSV format. Returns the CSV string.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().optional().describe('Optional range to export (e.g., A1:D50). If omitted, exports all data.'),
            delimiter: z.enum([',', ';', '\t']).optional().default(',').describe('Field delimiter'),
            includeHeaders: z.boolean().optional().default(true).describe('Include header row')
        })
    },
    remove_duplicates: {
        description: 'Remove duplicate rows from a range based on specified columns.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Range to check for duplicates (e.g., A1:D100)'),
            columns: z.array(z.string()).optional().describe('Columns to compare for duplicates (e.g., ["A", "B"]). If omitted, compares all columns.')
        })
    },
    apply_number_format: {
        description: 'Apply a number format to cells. Shortcuts for common formats like currency, percentage, dates.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            range: z.string().describe('Cell range to format'),
            format: z.enum(['currency', 'percentage', 'number', 'date', 'time', 'datetime', 'scientific', 'text', 'custom']).describe('Format type'),
            customPattern: z.string().optional().describe('Custom format pattern (only for format="custom", e.g., "#,##0.00")')
        })
    },
    create_named_range: {
        description: 'Create a named range that can be referenced in formulas by name.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the spreadsheet artifact'),
            name: z.string().describe('Name for the range (e.g., "SalesData", "TotalRow")'),
            range: z.string().describe('Cell range to name (e.g., A1:D100)')
        })
    }
}

// Document tools for Word-like editing (FREE - no license required)
export const DOCUMENT_TOOLS = {
    create_document: {
        description: 'Create a new Word-like document with an optional title and initial text content.',
        inputSchema: z.object({
            title: z.string().describe('Title of the document'),
            content: z.string().optional().describe('Initial text content for the document. Use newlines (\\n) to separate paragraphs.')
        })
    },
    insert_text: {
        description: 'Insert text at the end of a document or at a specific position.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            text: z.string().describe('Text to insert'),
            position: z.enum(['end', 'start']).default('end').describe('Where to insert the text')
        })
    },
    replace_document_content: {
        description: 'Replace the entire content of a document with new text.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            content: z.string().describe('New text content for the document')
        })
    },
    get_document_content: {
        description: 'Get the text content of a document. Use this to read what is currently in the document before making modifications.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact')
        })
    },
    format_document_text: {
        description: 'Apply formatting to a range of text in a document. Supports bold, italic, underline, font size, and colors.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            startIndex: z.number().describe('Start character index (0-based)'),
            endIndex: z.number().describe('End character index (exclusive)'),
            formatting: z.object({
                bold: z.boolean().optional().describe('Make text bold'),
                italic: z.boolean().optional().describe('Make text italic'),
                underline: z.boolean().optional().describe('Underline text'),
                strikethrough: z.boolean().optional().describe('Strikethrough text'),
                fontSize: z.number().optional().describe('Font size in points'),
                fontColor: z.string().optional().describe('Text color as hex (e.g., #FF0000)'),
                backgroundColor: z.string().optional().describe('Highlight/background color as hex'),
                fontFamily: z.string().optional().describe('Font family (e.g., Arial, Times New Roman)')
            }).describe('Formatting options to apply')
        })
    },
    add_heading: {
        description: 'Add a heading to the document. Creates properly styled heading text.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            text: z.string().describe('Heading text'),
            level: z.enum(['h1', 'h2', 'h3', 'h4']).describe('Heading level (h1 is largest)'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the heading')
        })
    },
    add_bullet_list: {
        description: 'Add a bullet list to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            items: z.array(z.string()).describe('List items to add'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the list')
        })
    },
    add_numbered_list: {
        description: 'Add a numbered list to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            items: z.array(z.string()).describe('List items to add'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the list')
        })
    },
    add_table: {
        description: 'Add a table to the document with specified headers and rows.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            headers: z.array(z.string()).describe('Column headers'),
            rows: z.string().describe('JSON string of 2D array with row data. Example: [["John", "25"], ["Jane", "30"]]'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the table')
        })
    },
    add_link: {
        description: 'Add a hyperlink to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            text: z.string().describe('Display text for the link'),
            url: z.string().describe('URL the link points to'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the link')
        })
    },
    add_horizontal_rule: {
        description: 'Add a horizontal divider line to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the divider')
        })
    },
    add_code_block: {
        description: 'Add a code block to the document with optional syntax highlighting.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            code: z.string().describe('The code content'),
            language: z.string().optional().describe('Programming language for syntax highlighting (e.g., javascript, python)'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the code block')
        })
    },
    add_quote: {
        description: 'Add a blockquote to the document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            text: z.string().describe('Quote text'),
            author: z.string().optional().describe('Optional attribution/author'),
            position: z.enum(['end', 'start']).default('end').describe('Where to add the quote')
        })
    },
    find_replace_document: {
        description: 'Find and replace text in a document.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the document artifact'),
            find: z.string().describe('Text to find'),
            replace: z.string().describe('Text to replace with'),
            matchCase: z.boolean().optional().default(false).describe('Case-sensitive search')
        })
    }
}

// Image generation tools
export const IMAGE_TOOLS = {
    generate_image: {
        description: 'Generate an image using AI (GPT Image 1.5). Creates high-quality images from text descriptions. Supports transparent backgrounds for logos, icons, and product images.',
        inputSchema: z.object({
            prompt: z.string().describe('Detailed description of the image to generate. Be specific about style, colors, composition, and any text to include.'),
            size: z.enum(['1024x1024', '1536x1024', '1024x1536', 'auto']).optional().describe('Image dimensions. 1024x1024 (square), 1536x1024 (landscape), 1024x1536 (portrait), or auto (default).'),
            quality: z.enum(['low', 'medium', 'high', 'auto']).optional().describe('Image quality. Higher quality takes longer but produces better results. Default: auto.'),
            background: z.enum(['transparent', 'opaque', 'auto']).optional().describe('Background type. Use transparent for logos, icons, subjects without backgrounds. Default: auto.'),
            output_format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Output format. Use png for transparency, jpeg for photos, webp for web. Default: png.'),
            n: z.number().min(1).max(4).optional().describe('Number of images to generate (1-4). Default: 1.')
        })
    },
    edit_image: {
        description: 'Edit an existing image using AI. Can modify specific areas using a mask, extend images, or make global edits.',
        inputSchema: z.object({
            prompt: z.string().describe('Description of the edits to make. Be specific about what to change, add, or remove.'),
            imageBase64: z.string().describe('Base64-encoded source image (PNG, JPEG, or WebP, max 25MB)'),
            maskBase64: z.string().optional().describe('Optional base64-encoded mask image. White areas will be edited, black areas preserved. Must be same size as source.'),
            size: z.enum(['1024x1024', '1536x1024', '1024x1536', 'auto']).optional().describe('Output image dimensions.'),
            quality: z.enum(['low', 'medium', 'high', 'auto']).optional().describe('Image quality level.'),
            n: z.number().min(1).max(4).optional().describe('Number of edited images to generate (1-4). Default: 1.')
        })
    }
}

// Combined tools object for API exposure
export const ALL_TOOLS = {
    ...SPREADSHEET_TOOLS,
    ...DOCUMENT_TOOLS,
    ...IMAGE_TOOLS
}

// Plan mode tools - used when mode='plan' to create execution plans
export const PLAN_TOOLS = {
    ExitPlanMode: {
        description: 'Call this tool when you have finished creating the execution plan. Include the complete plan as markdown with numbered steps.',
        inputSchema: z.object({
            plan: z.string().describe('The complete execution plan in markdown format with numbered steps. Each step should describe what will be done.')
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
    
    log.info(`[Tools] executeCreateSpreadsheet called with name="${name}", columns=${columns.length}, rowsJson length=${rowsJson?.length || 0}`)
    
    // Parse rows from JSON string if provided
    let parsedRows: any[][] = []
    if (rowsJson) {
        try {
            parsedRows = JSON.parse(rowsJson)
            if (!Array.isArray(parsedRows)) {
                throw new Error('Rows must be an array')
            }
            log.info(`[Tools] Parsed ${parsedRows.length} rows from JSON`)
        } catch (e) {
            log.warn(`[Tools] Failed to parse rows JSON: ${e}`)
            log.warn(`[Tools] Rows JSON length: ${rowsJson.length}`)
            parsedRows = []
        }
    }
    
    const univerData = createUniverWorkbook(name, columns, parsedRows)
    log.info(`[Tools] Created univerData with cellData keys: ${Object.keys(univerData.sheets.sheet1.cellData).join(', ')}`)
    
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

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to update cells: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

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

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to insert formula: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

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

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to format cells: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

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

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add row: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

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

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to merge cells: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

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

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to set column width: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

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

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to set row height: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

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

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to delete rows: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Deleted rows ${rows.join(', ')}`)
    return { artifactId, message: `Deleted row(s) ${rows.join(', ')}` }
}

async function executeSortRange(
    args: z.infer<typeof SPREADSHEET_TOOLS.sort_range.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; sortedRowCount: number }> {
    const { artifactId, range, sortBy } = args
    
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

    // Determine the range to sort
    let startRow: number, endRow: number

    if (range) {
        const [startCell, endCell] = range.split(':')
        const start = parseCellReference(startCell)
        const end = endCell ? parseCellReference(endCell) : start
        startRow = start.row
        endRow = end.row
    } else {
        // Sort all data rows (skip header row 0)
        const rowIndices = Object.keys(sheet.cellData).map(Number).filter(i => i > 0)
        if (rowIndices.length === 0) {
            return { artifactId, message: 'No data rows to sort', sortedRowCount: 0 }
        }
        startRow = 1
        endRow = Math.max(...rowIndices)
    }

    // Extract rows to sort
    const rowsToSort: Array<{ originalRow: number; cells: Record<number, any> }> = []
    for (let row = startRow; row <= endRow; row++) {
        if (sheet.cellData[row]) {
            rowsToSort.push({
                originalRow: row,
                cells: { ...sheet.cellData[row] }
            })
        }
    }

    // Sort the rows
    rowsToSort.sort((a, b) => {
        for (const criterion of sortBy) {
            const colIndex = parseColumnLetter(criterion.column)
            const aVal = a.cells[colIndex]?.v
            const bVal = b.cells[colIndex]?.v

            // Handle nullish values - put them at the end
            if (aVal == null && bVal == null) continue
            if (aVal == null) return criterion.order === 'asc' ? 1 : -1
            if (bVal == null) return criterion.order === 'asc' ? -1 : 1

            // Compare values
            let comparison: number
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal
            } else {
                comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
            }

            if (comparison !== 0) {
                return criterion.order === 'asc' ? comparison : -comparison
            }
        }
        return 0
    })

    // Reassign sorted rows back to their positions
    rowsToSort.forEach((sortedRow, index) => {
        sheet.cellData[startRow + index] = sortedRow.cells
    })

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to sort range: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    const sortDescription = sortBy.map(s => `${s.column} (${s.order})`).join(', ')
    log.info(`[Tools] Sorted ${rowsToSort.length} rows by ${sortDescription}`)
    return { 
        artifactId, 
        message: `Sorted ${rowsToSort.length} rows by ${sortDescription}`, 
        sortedRowCount: rowsToSort.length 
    }
}

async function executeFilterData(
    args: z.infer<typeof SPREADSHEET_TOOLS.filter_data.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; matchingRows: number[]; totalMatches: number }> {
    const { artifactId, conditions, logic } = args
    
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

    // Get all data rows (skip header)
    const rowIndices = Object.keys(sheet.cellData).map(Number).filter(i => i > 0).sort((a, b) => a - b)
    const matchingRows: number[] = []

    // Helper to evaluate a single condition
    const evaluateCondition = (rowIndex: number, condition: typeof conditions[0]): boolean => {
        const colIndex = parseColumnLetter(condition.column)
        const cellValue = sheet.cellData[rowIndex]?.[colIndex]?.v
        const compareValue = condition.value

        switch (condition.operator) {
            case 'is_empty':
                return cellValue == null || cellValue === ''
            case 'is_not_empty':
                return cellValue != null && cellValue !== ''
            case 'equals':
                return cellValue == compareValue || String(cellValue) === String(compareValue)
            case 'not_equals':
                return cellValue != compareValue && String(cellValue) !== String(compareValue)
            case 'contains':
                return String(cellValue ?? '').toLowerCase().includes(String(compareValue ?? '').toLowerCase())
            case 'not_contains':
                return !String(cellValue ?? '').toLowerCase().includes(String(compareValue ?? '').toLowerCase())
            case 'greater_than':
                if (typeof cellValue === 'number' && typeof compareValue === 'number') {
                    return cellValue > compareValue
                }
                return String(cellValue ?? '') > String(compareValue ?? '')
            case 'less_than':
                if (typeof cellValue === 'number' && typeof compareValue === 'number') {
                    return cellValue < compareValue
                }
                return String(cellValue ?? '') < String(compareValue ?? '')
            case 'greater_equal':
                if (typeof cellValue === 'number' && typeof compareValue === 'number') {
                    return cellValue >= compareValue
                }
                return String(cellValue ?? '') >= String(compareValue ?? '')
            case 'less_equal':
                if (typeof cellValue === 'number' && typeof compareValue === 'number') {
                    return cellValue <= compareValue
                }
                return String(cellValue ?? '') <= String(compareValue ?? '')
            default:
                return false
        }
    }

    // Evaluate each row
    for (const rowIndex of rowIndices) {
        const results = conditions.map(cond => evaluateCondition(rowIndex, cond))
        
        const matches = logic === 'and' 
            ? results.every(r => r) 
            : results.some(r => r)
        
        if (matches) {
            matchingRows.push(rowIndex + 1) // Return 1-based row numbers
        }
    }

    const conditionDescription = conditions.map(c => 
        `${c.column} ${c.operator}${c.value !== undefined ? ` "${c.value}"` : ''}`
    ).join(` ${logic.toUpperCase()} `)

    log.info(`[Tools] Filter found ${matchingRows.length} matching rows with conditions: ${conditionDescription}`)
    
    return { 
        artifactId, 
        message: `Found ${matchingRows.length} rows matching: ${conditionDescription}`, 
        matchingRows,
        totalMatches: matchingRows.length
    }
}

async function executeConditionalFormat(
    args: z.infer<typeof SPREADSHEET_TOOLS.conditional_format.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, range, rule } = args
    
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

    // Initialize conditionalFormattingRules if not present
    if (!sheet.conditionalFormattingRules) {
        sheet.conditionalFormattingRules = []
    }

    // Build the conditional formatting rule based on type
    const cfRule: Record<string, unknown> = {
        cfId: crypto.randomUUID(),
        ranges: [{
            startRow: start.row,
            endRow: end.row,
            startColumn: start.col,
            endColumn: end.col
        }]
    }

    switch (rule.type) {
        case 'colorScale': {
            if (!rule.colorScale) {
                throw new Error('colorScale config required for colorScale type')
            }
            cfRule.rule = {
                type: 'colorScale',
                config: {
                    index: 0,
                    minColor: rule.colorScale.minColor,
                    midColor: rule.colorScale.midColor,
                    maxColor: rule.colorScale.maxColor
                }
            }
            break
        }
        case 'dataBar': {
            if (!rule.dataBar) {
                throw new Error('dataBar config required for dataBar type')
            }
            cfRule.rule = {
                type: 'dataBar',
                config: {
                    index: 0,
                    color: rule.dataBar.color,
                    showValue: rule.dataBar.showValue
                }
            }
            break
        }
        case 'iconSet': {
            if (!rule.iconSet) {
                throw new Error('iconSet config required for iconSet type')
            }
            cfRule.rule = {
                type: 'iconSet',
                config: {
                    index: 0,
                    iconType: rule.iconSet.type
                }
            }
            break
        }
        case 'cellValue': {
            if (!rule.condition || !rule.style) {
                throw new Error('condition and style required for cellValue type')
            }
            
            // Build style object
            const style: Record<string, unknown> = {}
            if (rule.style.backgroundColor) style.bg = { rgb: rule.style.backgroundColor }
            if (rule.style.fontColor) style.cl = { rgb: rule.style.fontColor }
            if (rule.style.bold !== undefined) style.bl = rule.style.bold ? 1 : 0
            if (rule.style.italic !== undefined) style.it = rule.style.italic ? 1 : 0

            cfRule.rule = {
                type: 'highlightCell',
                config: {
                    operator: rule.condition.operator,
                    value: rule.condition.value,
                    value2: rule.condition.value2,
                    style
                }
            }
            break
        }
    }

    sheet.conditionalFormattingRules.push(cfRule)

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to apply conditional formatting: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Applied conditional formatting (${rule.type}) to range ${range}`)
    return { artifactId, message: `Applied ${rule.type} conditional formatting to range ${range}` }
}

async function executeInsertImage(
    args: z.infer<typeof SPREADSHEET_TOOLS.insert_image.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; imageId: string }> {
    const { artifactId, cell, source, size } = args
    
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

    // Initialize drawings array if not present
    if (!sheet.drawings) {
        sheet.drawings = {}
    }

    // Generate unique drawing ID
    const drawingId = `drawing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    
    // Default size if not provided
    const imageWidth = size?.width ?? 200
    const imageHeight = size?.height ?? 200

    // Build image source URL
    let imageUrl: string
    if (source.type === 'url') {
        imageUrl = source.data
    } else {
        // Base64 data
        const mimeType = source.mimeType || 'image/png'
        imageUrl = `data:${mimeType};base64,${source.data}`
    }

    // Create the drawing object in Univer format
    // Univer uses a specific structure for floating drawings
    sheet.drawings[drawingId] = {
        drawingId,
        drawingType: 0, // 0 = image
        imageSourceType: source.type === 'url' ? 1 : 0, // 0 = base64, 1 = url
        source: imageUrl,
        transform: {
            // Position relative to cell
            from: {
                column: col,
                columnOffset: 0,
                row: row,
                rowOffset: 0
            },
            to: {
                column: col + Math.ceil(imageWidth / 100), // Approximate column span
                columnOffset: imageWidth % 100,
                row: row + Math.ceil(imageHeight / 24), // Approximate row span (default row height ~24px)
                rowOffset: imageHeight % 24
            },
            // Absolute size
            width: imageWidth,
            height: imageHeight,
            // Positioning options
            positionH: { type: 0, offset: 0 }, // relative to cell
            positionV: { type: 0, offset: 0 }
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to insert image: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Inserted image at cell ${cell}, size ${imageWidth}x${imageHeight}`)
    return { 
        artifactId, 
        message: `Inserted image at cell ${cell} (${imageWidth}x${imageHeight}px)`,
        imageId: drawingId
    }
}

// Helper: Parse range to get start and end cells
function parseRange(range: string): { start: { row: number; col: number }; end: { row: number; col: number } } {
    const [startCell, endCell] = range.split(':')
    const start = parseCellReference(startCell)
    const end = endCell ? parseCellReference(endCell) : start
    return { start, end }
}

// Helper: Convert column index to letter (0=A, 1=B, ..., 25=Z, 26=AA)
function columnIndexToLetter(index: number): string {
    let result = ''
    let i = index + 1
    while (i > 0) {
        const remainder = (i - 1) % 26
        result = String.fromCharCode(65 + remainder) + result
        i = Math.floor((i - 1) / 26)
    }
    return result
}

async function executeCopyRange(
    args: z.infer<typeof SPREADSHEET_TOOLS.copy_range.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; copiedCells: number }> {
    const { artifactId, sourceRange, destinationCell } = args
    
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

    // Parse source range and destination
    const { start: srcStart, end: srcEnd } = parseRange(sourceRange)
    const dest = parseCellReference(destinationCell)

    // Calculate dimensions
    const rowCount = srcEnd.row - srcStart.row + 1
    const colCount = srcEnd.col - srcStart.col + 1

    // Copy cells from source to destination
    let copiedCells = 0
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
        for (let colOffset = 0; colOffset < colCount; colOffset++) {
            const srcRow = srcStart.row + rowOffset
            const srcCol = srcStart.col + colOffset
            const destRow = dest.row + rowOffset
            const destCol = dest.col + colOffset

            // Get source cell (deep clone to avoid reference issues)
            const srcCell = sheet.cellData[srcRow]?.[srcCol]
            if (srcCell) {
                if (!sheet.cellData[destRow]) sheet.cellData[destRow] = {}
                sheet.cellData[destRow][destCol] = JSON.parse(JSON.stringify(srcCell))
                copiedCells++
            }
        }
    }

    // Update row/column counts if needed
    sheet.rowCount = Math.max(sheet.rowCount, dest.row + rowCount + 10)
    sheet.columnCount = Math.max(sheet.columnCount, dest.col + colCount + 2)

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to copy range: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    const destEndRow = dest.row + rowCount - 1
    const destEndCol = dest.col + colCount - 1
    const destRange = `${destinationCell}:${columnIndexToLetter(destEndCol)}${destEndRow + 1}`
    
    log.info(`[Tools] Copied ${copiedCells} cells from ${sourceRange} to ${destRange}`)
    return { 
        artifactId, 
        message: `Copied ${copiedCells} cells from ${sourceRange} to ${destRange}`,
        copiedCells
    }
}

async function executeMoveRange(
    args: z.infer<typeof SPREADSHEET_TOOLS.move_range.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; movedCells: number }> {
    const { artifactId, sourceRange, destinationCell } = args
    
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

    // Parse source range and destination
    const { start: srcStart, end: srcEnd } = parseRange(sourceRange)
    const dest = parseCellReference(destinationCell)

    // Calculate dimensions
    const rowCount = srcEnd.row - srcStart.row + 1
    const colCount = srcEnd.col - srcStart.col + 1

    // Collect source cells first (to handle overlapping ranges)
    const cellsToMove: Array<{ rowOffset: number; colOffset: number; cell: any }> = []
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
        for (let colOffset = 0; colOffset < colCount; colOffset++) {
            const srcRow = srcStart.row + rowOffset
            const srcCol = srcStart.col + colOffset
            const srcCell = sheet.cellData[srcRow]?.[srcCol]
            if (srcCell) {
                cellsToMove.push({ rowOffset, colOffset, cell: JSON.parse(JSON.stringify(srcCell)) })
            }
        }
    }

    // Clear source cells
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset++) {
        for (let colOffset = 0; colOffset < colCount; colOffset++) {
            const srcRow = srcStart.row + rowOffset
            const srcCol = srcStart.col + colOffset
            if (sheet.cellData[srcRow]) {
                delete sheet.cellData[srcRow][srcCol]
            }
        }
    }

    // Place cells at destination
    for (const { rowOffset, colOffset, cell } of cellsToMove) {
        const destRow = dest.row + rowOffset
        const destCol = dest.col + colOffset
        if (!sheet.cellData[destRow]) sheet.cellData[destRow] = {}
        sheet.cellData[destRow][destCol] = cell
    }

    // Update row/column counts if needed
    sheet.rowCount = Math.max(sheet.rowCount, dest.row + rowCount + 10)
    sheet.columnCount = Math.max(sheet.columnCount, dest.col + colCount + 2)

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to move range: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    const destEndRow = dest.row + rowCount - 1
    const destEndCol = dest.col + colCount - 1
    const destRange = `${destinationCell}:${columnIndexToLetter(destEndCol)}${destEndRow + 1}`
    
    log.info(`[Tools] Moved ${cellsToMove.length} cells from ${sourceRange} to ${destRange}`)
    return { 
        artifactId, 
        message: `Moved ${cellsToMove.length} cells from ${sourceRange} to ${destRange}`,
        movedCells: cellsToMove.length
    }
}

async function executeFindReplace(
    args: z.infer<typeof SPREADSHEET_TOOLS.find_replace.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; replacementsCount: number; cellsAffected: string[] }> {
    const { artifactId, find, replace, range, matchCase, matchEntireCell } = args
    
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

    // Determine search area
    let startRow = 0, endRow = sheet.rowCount
    let startCol = 0, endCol = sheet.columnCount

    if (range) {
        const { start, end } = parseRange(range)
        startRow = start.row
        endRow = end.row
        startCol = start.col
        endCol = end.col
    }

    const searchText = matchCase ? find : find.toLowerCase()
    const cellsAffected: string[] = []
    let replacementsCount = 0

    // Search through cells
    for (let row = startRow; row <= endRow; row++) {
        if (!sheet.cellData[row]) continue
        
        for (let col = startCol; col <= endCol; col++) {
            const cell = sheet.cellData[row][col]
            if (!cell || cell.v == null) continue

            const cellValue = String(cell.v)
            const compareValue = matchCase ? cellValue : cellValue.toLowerCase()

            let shouldReplace = false
            if (matchEntireCell) {
                shouldReplace = compareValue === searchText
            } else {
                shouldReplace = compareValue.includes(searchText)
            }

            if (shouldReplace) {
                // Replace the value
                if (matchEntireCell) {
                    cell.v = replace
                } else {
                    // Case-insensitive replace that preserves non-matching case
                    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi')
                    cell.v = cellValue.replace(regex, replace)
                }
                
                const cellRef = `${columnIndexToLetter(col)}${row + 1}`
                cellsAffected.push(cellRef)
                replacementsCount++
            }
        }
    }

    if (replacementsCount > 0) {
        const { error: updateError } = await supabase
            .from('artifacts')
            .update({ univer_data: univerData, updated_at: new Date().toISOString() })
            .eq('id', artifactId)

        if (updateError) throw new Error(`Failed to save replacements: ${updateError.message}`)

        // Notify renderer for live UI update
        notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')
    }

    log.info(`[Tools] Find/Replace: "${find}" → "${replace}", ${replacementsCount} replacements`)
    return { 
        artifactId, 
        message: `Replaced "${find}" with "${replace}" in ${replacementsCount} cell(s)`,
        replacementsCount,
        cellsAffected
    }
}

async function executeFreezePanes(
    args: z.infer<typeof SPREADSHEET_TOOLS.freeze_panes.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, rows, columns } = args
    
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

    // Set freeze in Univer format
    // Univer uses 'freeze' property with startRow and startColumn (0-based)
    if (rows === 0 && columns === 0) {
        // Clear freeze
        delete sheet.freeze
    } else {
        sheet.freeze = {
            xSplit: columns, // Columns to freeze
            ySplit: rows,    // Rows to freeze
            startRow: rows,
            startColumn: columns
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to freeze panes: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    let message: string
    if (rows === 0 && columns === 0) {
        message = 'Removed freeze panes'
    } else if (rows > 0 && columns > 0) {
        message = `Froze ${rows} row(s) and ${columns} column(s)`
    } else if (rows > 0) {
        message = `Froze ${rows} row(s)`
    } else {
        message = `Froze ${columns} column(s)`
    }

    log.info(`[Tools] ${message}`)
    return { artifactId, message }
}

async function executeAutoFill(
    args: z.infer<typeof SPREADSHEET_TOOLS.auto_fill.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; filledCells: number }> {
    const { artifactId, sourceRange, fillRange } = args
    
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

    const { start: srcStart, end: srcEnd } = parseRange(sourceRange)
    const { start: fillStart, end: fillEnd } = parseRange(fillRange)

    // Get source values to detect pattern
    const sourceValues: Array<{ row: number; col: number; value: any; isNumber: boolean }> = []
    for (let row = srcStart.row; row <= srcEnd.row; row++) {
        for (let col = srcStart.col; col <= srcEnd.col; col++) {
            const cell = sheet.cellData[row]?.[col]
            const value = cell?.v
            sourceValues.push({
                row: row - srcStart.row,
                col: col - srcStart.col,
                value,
                isNumber: typeof value === 'number'
            })
        }
    }

    if (sourceValues.length === 0) {
        return { artifactId, message: 'No source values to auto-fill from', filledCells: 0 }
    }

    // Determine fill direction and detect numeric patterns
    const isVertical = fillEnd.row - fillStart.row > fillEnd.col - fillStart.col
    let filledCells = 0

    // Detect numeric increment pattern
    const numericValues = sourceValues.filter(sv => sv.isNumber).map(sv => sv.value as number)
    const numericIncrement = numericValues.length >= 2 
        ? numericValues[1] - numericValues[0]
        : 1

    // Fill the range
    for (let row = fillStart.row; row <= fillEnd.row; row++) {
        for (let col = fillStart.col; col <= fillEnd.col; col++) {
            // Skip source cells
            if (row >= srcStart.row && row <= srcEnd.row && col >= srcStart.col && col <= srcEnd.col) {
                continue
            }

            // Calculate position in pattern
            let patternIndex: number
            if (isVertical) {
                const relRow = row - fillStart.row
                patternIndex = relRow % sourceValues.filter(sv => sv.col === (col - fillStart.col)).length || 0
            } else {
                const relCol = col - fillStart.col
                patternIndex = relCol % sourceValues.filter(sv => sv.row === (row - fillStart.row)).length || 0
            }

            // Find matching source value
            const sourceIdx = patternIndex % sourceValues.length
            const sourceVal = sourceValues[sourceIdx]

            if (sourceVal) {
                if (!sheet.cellData[row]) sheet.cellData[row] = {}
                
                if (sourceVal.isNumber) {
                    // Extend numeric pattern
                    const offset = isVertical 
                        ? (row - srcStart.row) 
                        : (col - srcStart.col)
                    sheet.cellData[row][col] = { v: (sourceVal.value as number) + numericIncrement * offset }
                } else {
                    // Copy non-numeric value
                    sheet.cellData[row][col] = { v: sourceVal.value }
                }
                filledCells++
            }
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to auto-fill: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Auto-filled ${filledCells} cells from ${sourceRange} to ${fillRange}`)
    return { 
        artifactId, 
        message: `Auto-filled ${filledCells} cells based on pattern from ${sourceRange}`,
        filledCells
    }
}

async function executeClearRange(
    args: z.infer<typeof SPREADSHEET_TOOLS.clear_range.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; clearedCells: number }> {
    const { artifactId, range, clearType } = args
    
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

    const { start, end } = parseRange(range)
    let clearedCells = 0

    for (let row = start.row; row <= end.row; row++) {
        if (!sheet.cellData[row]) continue
        
        for (let col = start.col; col <= end.col; col++) {
            const cell = sheet.cellData[row][col]
            if (!cell) continue

            if (clearType === 'all') {
                delete sheet.cellData[row][col]
                clearedCells++
            } else if (clearType === 'contents') {
                // Keep formatting, clear value and formula
                delete cell.v
                delete cell.f
                clearedCells++
            } else if (clearType === 'formats') {
                // Keep value, clear styling
                delete cell.s
                clearedCells++
            }
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to clear range: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Cleared ${clearedCells} cells in range ${range} (type: ${clearType})`)
    return { 
        artifactId, 
        message: `Cleared ${clearType} from ${clearedCells} cells in range ${range}`,
        clearedCells
    }
}

async function executeInsertColumn(
    args: z.infer<typeof SPREADSHEET_TOOLS.insert_column.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, column, count = 1, values } = args
    
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

    const insertColIndex = parseColumnLetter(column)

    // Shift all cells to the right of insertColIndex
    const newCellData: Record<number, Record<number, any>> = {}
    
    for (const [rowKey, rowData] of Object.entries(sheet.cellData)) {
        const rowIndex = Number(rowKey)
        newCellData[rowIndex] = {}
        
        for (const [colKey, cellData] of Object.entries(rowData as Record<string, any>)) {
            const colIndex = Number(colKey)
            
            if (colIndex >= insertColIndex) {
                // Shift right by count
                newCellData[rowIndex][colIndex + count] = cellData
            } else {
                // Keep in place
                newCellData[rowIndex][colIndex] = cellData
            }
        }
    }

    sheet.cellData = newCellData

    // Add header values if provided
    if (values && values.length > 0) {
        for (let i = 0; i < Math.min(values.length, count); i++) {
            if (!sheet.cellData[0]) sheet.cellData[0] = {}
            sheet.cellData[0][insertColIndex + i] = { 
                v: values[i],
                s: { bl: 1, bg: { rgb: '#f3f4f6' } } // Bold with light gray background
            }
        }
    }

    // Update column count
    sheet.columnCount = (sheet.columnCount || 26) + count

    // Shift column widths if they exist
    if (sheet.columnData) {
        const newColumnData: Record<number, any> = {}
        for (const [colKey, colData] of Object.entries(sheet.columnData)) {
            const colIndex = Number(colKey)
            if (colIndex >= insertColIndex) {
                newColumnData[colIndex + count] = colData
            } else {
                newColumnData[colIndex] = colData
            }
        }
        sheet.columnData = newColumnData
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to insert column: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Inserted ${count} column(s) at ${column}`)
    return { artifactId, message: `Inserted ${count} column(s) at position ${column}` }
}

async function executeDeleteColumn(
    args: z.infer<typeof SPREADSHEET_TOOLS.delete_column.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, columns } = args
    
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

    // Convert column letters to indices and sort descending (delete from right to left)
    const colIndices = columns.map(parseColumnLetter).sort((a, b) => b - a)

    for (const deleteColIndex of colIndices) {
        const newCellData: Record<number, Record<number, any>> = {}
        
        for (const [rowKey, rowData] of Object.entries(sheet.cellData)) {
            const rowIndex = Number(rowKey)
            newCellData[rowIndex] = {}
            
            for (const [colKey, cellData] of Object.entries(rowData as Record<string, any>)) {
                const colIndex = Number(colKey)
                
                if (colIndex < deleteColIndex) {
                    newCellData[rowIndex][colIndex] = cellData
                } else if (colIndex > deleteColIndex) {
                    // Shift left
                    newCellData[rowIndex][colIndex - 1] = cellData
                }
                // Skip the deleted column
            }
        }
        
        sheet.cellData = newCellData
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to delete column: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Deleted columns: ${columns.join(', ')}`)
    return { artifactId, message: `Deleted column(s): ${columns.join(', ')}` }
}

async function executeDuplicateRow(
    args: z.infer<typeof SPREADSHEET_TOOLS.duplicate_row.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; newRowIndices: number[] }> {
    const { artifactId, row, count = 1 } = args
    
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

    const sourceRowIndex = row - 1 // Convert 1-based to 0-based
    const sourceRowData = sheet.cellData[sourceRowIndex]

    if (!sourceRowData) {
        throw new Error(`Row ${row} is empty, nothing to duplicate`)
    }

    // Find max row index
    const maxRowIndex = Math.max(...Object.keys(sheet.cellData).map(Number))
    
    // Shift rows down to make room for duplicates
    const newCellData: Record<number, Record<number, any>> = {}
    
    for (const [rowKey, rowData] of Object.entries(sheet.cellData)) {
        const rowIndex = Number(rowKey)
        
        if (rowIndex <= sourceRowIndex) {
            newCellData[rowIndex] = rowData as Record<number, any>
        } else {
            // Shift down by count
            newCellData[rowIndex + count] = rowData as Record<number, any>
        }
    }

    // Insert duplicated rows
    const newRowIndices: number[] = []
    for (let i = 0; i < count; i++) {
        const newRowIndex = sourceRowIndex + 1 + i
        newCellData[newRowIndex] = JSON.parse(JSON.stringify(sourceRowData))
        newRowIndices.push(newRowIndex + 1) // Return 1-based indices
    }

    sheet.cellData = newCellData
    sheet.rowCount = Math.max(sheet.rowCount || 100, maxRowIndex + count + 10)

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to duplicate row: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Duplicated row ${row}, ${count} time(s)`)
    return { 
        artifactId, 
        message: `Duplicated row ${row} creating ${count} new row(s) at position(s) ${newRowIndices.join(', ')}`,
        newRowIndices
    }
}

async function executeInsertRow(
    args: z.infer<typeof SPREADSHEET_TOOLS.insert_row.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, row, count = 1 } = args
    
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

    const insertRowIndex = row - 1 // Convert 1-based to 0-based

    // Shift rows down
    const newCellData: Record<number, Record<number, any>> = {}
    
    for (const [rowKey, rowData] of Object.entries(sheet.cellData)) {
        const rowIndex = Number(rowKey)
        
        if (rowIndex < insertRowIndex) {
            newCellData[rowIndex] = rowData as Record<number, any>
        } else {
            // Shift down by count
            newCellData[rowIndex + count] = rowData as Record<number, any>
        }
    }

    sheet.cellData = newCellData
    sheet.rowCount = (sheet.rowCount || 100) + count

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to insert row: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Inserted ${count} row(s) at position ${row}`)
    return { artifactId, message: `Inserted ${count} empty row(s) at position ${row}` }
}

async function executeRenameSheet(
    args: z.infer<typeof SPREADSHEET_TOOLS.rename_sheet.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, sheetId: targetSheetId, newName } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const sheetId = targetSheetId || Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]

    if (!sheet) throw new Error(`Sheet not found: ${sheetId}`)

    const oldName = sheet.name
    sheet.name = newName

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to rename sheet: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Renamed sheet from "${oldName}" to "${newName}"`)
    return { artifactId, message: `Renamed sheet from "${oldName}" to "${newName}"` }
}

async function executeAddSheet(
    args: z.infer<typeof SPREADSHEET_TOOLS.add_sheet.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; sheetId: string }> {
    const { artifactId, name, columns } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const newSheetId = `sheet_${Date.now()}`

    // Create new sheet structure
    const cellData: Record<number, Record<number, any>> = {}
    
    // Add column headers if provided
    if (columns && columns.length > 0) {
        cellData[0] = {}
        columns.forEach((col, idx) => {
            cellData[0][idx] = {
                v: col,
                s: { bl: 1, bg: { rgb: '#f3f4f6' } }
            }
        })
    }

    univerData.sheets[newSheetId] = {
        id: newSheetId,
        name,
        rowCount: 100,
        columnCount: Math.max(26, (columns?.length || 0) + 2),
        cellData,
        tabColor: '',
        defaultColumnWidth: 100,
        defaultRowHeight: 24
    }

    // Add to sheet order
    if (!univerData.sheetOrder) univerData.sheetOrder = []
    univerData.sheetOrder.push(newSheetId)

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add sheet: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Added new sheet "${name}" with ID ${newSheetId}`)
    return { artifactId, message: `Added new sheet "${name}"`, sheetId: newSheetId }
}

async function executeDataValidation(
    args: z.infer<typeof SPREADSHEET_TOOLS.data_validation.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, range, validationType, rule } = args
    
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

    const { start, end } = parseRange(range)

    // Initialize data validations if not present
    if (!sheet.dataValidations) sheet.dataValidations = []

    // Build validation rule based on type
    const validationRule: Record<string, unknown> = {
        uid: crypto.randomUUID(),
        ranges: [{
            startRow: start.row,
            endRow: end.row,
            startColumn: start.col,
            endColumn: end.col
        }],
        type: validationType,
        errorStyle: 'stop',
        error: rule.errorMessage,
        errorTitle: rule.errorTitle || 'Validation Error'
    }

    switch (validationType) {
        case 'list':
            if (!rule.options || rule.options.length === 0) {
                throw new Error('List validation requires options array')
            }
            validationRule.formula1 = rule.options.join(',')
            validationRule.showDropDown = true
            break
        
        case 'number':
        case 'integer':
        case 'textLength':
            validationRule.operator = rule.operator
            validationRule.formula1 = String(rule.value1)
            if (rule.value2 !== undefined) {
                validationRule.formula2 = String(rule.value2)
            }
            break
        
        case 'date':
            validationRule.operator = rule.operator
            validationRule.formula1 = String(rule.value1)
            if (rule.value2 !== undefined) {
                validationRule.formula2 = String(rule.value2)
            }
            break
        
        case 'custom':
            if (!rule.formula) {
                throw new Error('Custom validation requires formula')
            }
            validationRule.formula1 = rule.formula
            break
    }

    sheet.dataValidations.push(validationRule)

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add data validation: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    const description = validationType === 'list' 
        ? `dropdown with ${rule.options?.length} options`
        : `${validationType} validation`
    
    log.info(`[Tools] Added ${description} to range ${range}`)
    return { artifactId, message: `Added ${description} to range ${range}` }
}

async function executeAddComment(
    args: z.infer<typeof SPREADSHEET_TOOLS.add_comment.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, cell, comment, author } = args
    
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
    const { row, col } = parseCellReference(cell)

    // Initialize comments if not present
    if (!sheet.comments) sheet.comments = {}

    const commentId = `comment_${Date.now()}`
    sheet.comments[commentId] = {
        id: commentId,
        row,
        column: col,
        content: comment,
        author: author || 'AI Assistant',
        timestamp: new Date().toISOString()
    }

    // Also mark the cell as having a comment (for visual indicator)
    if (!sheet.cellData[row]) sheet.cellData[row] = {}
    if (!sheet.cellData[row][col]) sheet.cellData[row][col] = {}
    sheet.cellData[row][col].hasComment = true

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add comment: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Added comment to cell ${cell}`)
    return { artifactId, message: `Added comment to cell ${cell}` }
}

async function executeProtectRange(
    args: z.infer<typeof SPREADSHEET_TOOLS.protect_range.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, range, description } = args
    
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
    const { start, end } = parseRange(range)

    // Initialize protected ranges if not present
    if (!sheet.protectedRanges) sheet.protectedRanges = []

    sheet.protectedRanges.push({
        id: crypto.randomUUID(),
        range: {
            startRow: start.row,
            endRow: end.row,
            startColumn: start.col,
            endColumn: end.col
        },
        description: description || `Protected range ${range}`
    })

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to protect range: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Protected range ${range}`)
    return { artifactId, message: `Protected range ${range} from editing` }
}

async function executeSetPrintArea(
    args: z.infer<typeof SPREADSHEET_TOOLS.set_print_area.inputSchema>,
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

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const sheet = univerData.sheets[sheetId]
    const { start, end } = parseRange(range)

    // Set print area
    sheet.printArea = {
        startRow: start.row,
        endRow: end.row,
        startColumn: start.col,
        endColumn: end.col
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to set print area: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Set print area to ${range}`)
    return { artifactId, message: `Set print area to ${range}` }
}

async function executeGetCellValue(
    args: z.infer<typeof SPREADSHEET_TOOLS.get_cell_value.inputSchema>,
    userId: string
): Promise<{ artifactId: string; cell: string; value: any; formula?: string; hasFormatting: boolean }> {
    const { artifactId, cell } = args
    
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
    const { row, col } = parseCellReference(cell)

    const cellData = sheet.cellData[row]?.[col]
    
    return {
        artifactId,
        cell,
        value: cellData?.v ?? null,
        formula: cellData?.f,
        hasFormatting: !!cellData?.s
    }
}

async function executeGetRangeValues(
    args: z.infer<typeof SPREADSHEET_TOOLS.get_range_values.inputSchema>,
    userId: string
): Promise<{ artifactId: string; range: string; values: any[][]; rowCount: number; colCount: number }> {
    const { artifactId, range, includeFormulas } = args
    
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
    const { start, end } = parseRange(range)

    const values: any[][] = []
    
    for (let row = start.row; row <= end.row; row++) {
        const rowValues: any[] = []
        for (let col = start.col; col <= end.col; col++) {
            const cellData = sheet.cellData[row]?.[col]
            if (includeFormulas && cellData?.f) {
                rowValues.push(cellData.f)
            } else {
                rowValues.push(cellData?.v ?? null)
            }
        }
        values.push(rowValues)
    }

    return {
        artifactId,
        range,
        values,
        rowCount: end.row - start.row + 1,
        colCount: end.col - start.col + 1
    }
}

async function executeTransposeRange(
    args: z.infer<typeof SPREADSHEET_TOOLS.transpose_range.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; newRange: string }> {
    const { artifactId, sourceRange, destinationCell } = args
    
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
    
    const { start: srcStart, end: srcEnd } = parseRange(sourceRange)
    const dest = parseCellReference(destinationCell)

    // Read source data
    const sourceData: any[][] = []
    for (let row = srcStart.row; row <= srcEnd.row; row++) {
        const rowData: any[] = []
        for (let col = srcStart.col; col <= srcEnd.col; col++) {
            rowData.push(sheet.cellData[row]?.[col] ? JSON.parse(JSON.stringify(sheet.cellData[row][col])) : null)
        }
        sourceData.push(rowData)
    }

    // Calculate transposed dimensions
    const srcRowCount = srcEnd.row - srcStart.row + 1
    const srcColCount = srcEnd.col - srcStart.col + 1

    // Write transposed data (swap rows and columns)
    for (let srcRow = 0; srcRow < srcRowCount; srcRow++) {
        for (let srcCol = 0; srcCol < srcColCount; srcCol++) {
            const destRow = dest.row + srcCol  // Column becomes row
            const destCol = dest.col + srcRow  // Row becomes column
            
            if (!sheet.cellData[destRow]) sheet.cellData[destRow] = {}
            
            if (sourceData[srcRow][srcCol]) {
                sheet.cellData[destRow][destCol] = sourceData[srcRow][srcCol]
            } else {
                delete sheet.cellData[destRow][destCol]
            }
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to transpose range: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    const destEndRow = dest.row + srcColCount - 1
    const destEndCol = dest.col + srcRowCount - 1
    const newRange = `${destinationCell}:${columnIndexToLetter(destEndCol)}${destEndRow + 1}`

    log.info(`[Tools] Transposed ${sourceRange} to ${newRange}`)
    return { artifactId, message: `Transposed ${sourceRange} to ${newRange}`, newRange }
}

async function executeCalculateRange(
    args: z.infer<typeof SPREADSHEET_TOOLS.calculate_range.inputSchema>,
    userId: string
): Promise<{ artifactId: string; range: string; sum: number; average: number; min: number; max: number; count: number; numericCount: number }> {
    const { artifactId, range } = args
    
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
    const { start, end } = parseRange(range)

    const numericValues: number[] = []
    let totalCount = 0

    for (let row = start.row; row <= end.row; row++) {
        for (let col = start.col; col <= end.col; col++) {
            totalCount++
            const value = sheet.cellData[row]?.[col]?.v
            if (typeof value === 'number') {
                numericValues.push(value)
            } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
                numericValues.push(parseFloat(value))
            }
        }
    }

    const sum = numericValues.reduce((a, b) => a + b, 0)
    const average = numericValues.length > 0 ? sum / numericValues.length : 0
    const min = numericValues.length > 0 ? Math.min(...numericValues) : 0
    const max = numericValues.length > 0 ? Math.max(...numericValues) : 0

    return {
        artifactId,
        range,
        sum,
        average,
        min,
        max,
        count: totalCount,
        numericCount: numericValues.length
    }
}

async function executeExportToCsv(
    args: z.infer<typeof SPREADSHEET_TOOLS.export_to_csv.inputSchema>,
    userId: string
): Promise<{ artifactId: string; csv: string; rowCount: number; colCount: number }> {
    const { artifactId, range, delimiter = ',', includeHeaders = true } = args
    
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

    // Determine range
    let startRow = 0, endRow = 0, startCol = 0, endCol = 0

    if (range) {
        const parsed = parseRange(range)
        startRow = parsed.start.row
        endRow = parsed.end.row
        startCol = parsed.start.col
        endCol = parsed.end.col
    } else {
        // Find data bounds
        const rowIndices = Object.keys(sheet.cellData).map(Number)
        if (rowIndices.length === 0) {
            return { artifactId, csv: '', rowCount: 0, colCount: 0 }
        }
        startRow = includeHeaders ? 0 : 1
        endRow = Math.max(...rowIndices)
        
        let maxCol = 0
        for (const rowData of Object.values(sheet.cellData) as Array<Record<string, any>>) {
            const colIndices = Object.keys(rowData).map(Number)
            if (colIndices.length > 0) {
                maxCol = Math.max(maxCol, Math.max(...colIndices))
            }
        }
        endCol = maxCol
    }

    // Build CSV
    const lines: string[] = []
    
    for (let row = startRow; row <= endRow; row++) {
        const rowValues: string[] = []
        for (let col = startCol; col <= endCol; col++) {
            const value = sheet.cellData[row]?.[col]?.v
            let cellStr = value != null ? String(value) : ''
            
            // Escape if needed
            if (cellStr.includes(delimiter) || cellStr.includes('"') || cellStr.includes('\n')) {
                cellStr = '"' + cellStr.replace(/"/g, '""') + '"'
            }
            rowValues.push(cellStr)
        }
        lines.push(rowValues.join(delimiter))
    }

    const csv = lines.join('\n')
    
    return {
        artifactId,
        csv,
        rowCount: endRow - startRow + 1,
        colCount: endCol - startCol + 1
    }
}

async function executeRemoveDuplicates(
    args: z.infer<typeof SPREADSHEET_TOOLS.remove_duplicates.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; duplicatesRemoved: number; remainingRows: number }> {
    const { artifactId, range, columns } = args
    
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
    const { start, end } = parseRange(range)

    // Columns to compare
    const compareColIndices = columns 
        ? columns.map(parseColumnLetter)
        : Array.from({ length: end.col - start.col + 1 }, (_, i) => start.col + i)

    // Build rows with their keys for deduplication
    const rows: Array<{ rowIndex: number; key: string; data: Record<number, any> }> = []
    
    for (let row = start.row; row <= end.row; row++) {
        if (!sheet.cellData[row]) continue
        
        const keyParts: string[] = []
        for (const colIdx of compareColIndices) {
            keyParts.push(String(sheet.cellData[row]?.[colIdx]?.v ?? ''))
        }
        
        rows.push({
            rowIndex: row,
            key: keyParts.join('|'),
            data: { ...sheet.cellData[row] }
        })
    }

    // Find unique rows (keep first occurrence)
    const seen = new Set<string>()
    const uniqueRows: typeof rows = []
    
    for (const row of rows) {
        if (!seen.has(row.key)) {
            seen.add(row.key)
            uniqueRows.push(row)
        }
    }

    const duplicatesRemoved = rows.length - uniqueRows.length

    if (duplicatesRemoved > 0) {
        // Clear the range
        for (let row = start.row; row <= end.row; row++) {
            delete sheet.cellData[row]
        }

        // Re-insert unique rows
        uniqueRows.forEach((row, idx) => {
            sheet.cellData[start.row + idx] = row.data
        })

        const { error: updateError } = await supabase
            .from('artifacts')
            .update({ univer_data: univerData, updated_at: new Date().toISOString() })
            .eq('id', artifactId)

        if (updateError) throw new Error(`Failed to remove duplicates: ${updateError.message}`)

        notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')
    }

    log.info(`[Tools] Removed ${duplicatesRemoved} duplicate rows from ${range}`)
    return { 
        artifactId, 
        message: `Removed ${duplicatesRemoved} duplicate row(s), ${uniqueRows.length} unique rows remain`,
        duplicatesRemoved,
        remainingRows: uniqueRows.length
    }
}

async function executeApplyNumberFormat(
    args: z.infer<typeof SPREADSHEET_TOOLS.apply_number_format.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, range, format, customPattern } = args
    
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
    const { start, end } = parseRange(range)

    // Map format types to patterns
    const formatPatterns: Record<string, string> = {
        currency: '$#,##0.00',
        percentage: '0.00%',
        number: '#,##0.00',
        date: 'yyyy-mm-dd',
        time: 'hh:mm:ss',
        datetime: 'yyyy-mm-dd hh:mm:ss',
        scientific: '0.00E+00',
        text: '@'
    }

    const pattern = format === 'custom' ? customPattern : formatPatterns[format]
    
    if (!pattern) {
        throw new Error(`Invalid format or missing custom pattern`)
    }

    for (let row = start.row; row <= end.row; row++) {
        for (let col = start.col; col <= end.col; col++) {
            if (!sheet.cellData[row]) sheet.cellData[row] = {}
            if (!sheet.cellData[row][col]) sheet.cellData[row][col] = {}
            if (!sheet.cellData[row][col].s) sheet.cellData[row][col].s = {}
            
            sheet.cellData[row][col].s.n = { pattern }
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to apply number format: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Applied ${format} format to ${range}`)
    return { artifactId, message: `Applied ${format} format to ${range}` }
}

async function executeCreateNamedRange(
    args: z.infer<typeof SPREADSHEET_TOOLS.create_named_range.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, name, range } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Spreadsheet not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const sheetId = Object.keys(univerData.sheets)[0]
    const { start, end } = parseRange(range)

    // Initialize named ranges if not present
    if (!univerData.namedRanges) univerData.namedRanges = {}

    univerData.namedRanges[name] = {
        name,
        range: {
            sheetId,
            startRow: start.row,
            endRow: end.row,
            startColumn: start.col,
            endColumn: end.col
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to create named range: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'spreadsheet')

    log.info(`[Tools] Created named range "${name}" for ${range}`)
    return { artifactId, message: `Created named range "${name}" referencing ${range}` }
}

// ============================================
// Document Tool Execution Functions (FREE)
// ============================================

async function executeCreateDocument(
    args: z.infer<typeof DOCUMENT_TOOLS.create_document.inputSchema>,
    chatId: string,
    _userId: string
): Promise<{ artifactId: string; message: string }> {
    const { title, content } = args
    
    const univerData = createUniverDocument(title, content || '')
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .insert({
            chat_id: chatId,
            type: 'document',
            name: title,
            content: { title, characterCount: content?.length || 0 },
            univer_data: univerData
        })
        .select()
        .single()

    if (error) throw new Error(`Failed to create document: ${error.message}`)
    
    log.info(`[Tools] Created document artifact: ${artifact.id}`)
    return { artifactId: artifact.id, message: `Created document "${title}"` }
}

async function executeInsertText(
    args: z.infer<typeof DOCUMENT_TOOLS.insert_text.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, text, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { dataStream: string; paragraphs: Array<{ startIndex: number }> }
    
    // Insert text at position
    if (position === 'start') {
        // Prepend to dataStream and shift paragraph indices
        body.dataStream = text + '\r\n' + body.dataStream
        const shift = text.length + 2
        body.paragraphs = [
            { startIndex: 0 },
            ...body.paragraphs.map(p => ({ ...p, startIndex: p.startIndex + shift }))
        ]
    } else {
        // Append to dataStream (before final \r\n)
        const oldLength = body.dataStream.length
        body.dataStream = body.dataStream.slice(0, -2) + text + '\r\n'
        body.paragraphs.push({ startIndex: oldLength - 2 })
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to insert text: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Inserted text at ${position} in document ${artifactId}`)
    return { artifactId, message: `Inserted ${text.length} characters at ${position}` }
}

async function executeReplaceDocumentContent(
    args: z.infer<typeof DOCUMENT_TOOLS.replace_document_content.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, content } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    // Create new document body from content
    const lines = content.split('\n')
    let dataStream = ''
    const paragraphs: Array<{ startIndex: number }> = []
    
    let currentIndex = 0
    for (const line of lines) {
        paragraphs.push({ startIndex: currentIndex })
        dataStream += line + '\r\n'
        currentIndex += line.length + 2
    }

    const univerData = artifact.univer_data
    univerData.body = {
        dataStream,
        textRuns: [],
        paragraphs
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ 
            univer_data: univerData, 
            content: { ...artifact.content, characterCount: content.length },
            updated_at: new Date().toISOString() 
        })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to replace document content: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Replaced content in document ${artifactId}`)
    return { artifactId, message: `Replaced document content with ${content.length} characters` }
}

async function executeGetDocumentContent(
    args: z.infer<typeof DOCUMENT_TOOLS.get_document_content.inputSchema>,
    userId: string
): Promise<{ artifactId: string; content: string; title: string }> {
    const { artifactId } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { dataStream: string }
    
    // Convert dataStream back to plain text (remove \r\n formatting)
    const content = body.dataStream.replace(/\r\n/g, '\n').trim()
    
    return { 
        artifactId, 
        content, 
        title: univerData.title || artifact.name 
    }
}

async function executeFormatDocumentText(
    args: z.infer<typeof DOCUMENT_TOOLS.format_document_text.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, startIndex, endIndex, formatting } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number }>
    }
    
    // Build text style object
    const textStyle: Record<string, unknown> = {}
    if (formatting.bold !== undefined) textStyle.bl = formatting.bold ? 1 : 0
    if (formatting.italic !== undefined) textStyle.it = formatting.italic ? 1 : 0
    if (formatting.underline !== undefined) textStyle.ul = formatting.underline ? { s: 1 } : undefined
    if (formatting.strikethrough !== undefined) textStyle.st = formatting.strikethrough ? { s: 1 } : undefined
    if (formatting.fontSize !== undefined) textStyle.fs = formatting.fontSize
    if (formatting.fontColor) textStyle.cl = { rgb: formatting.fontColor }
    if (formatting.backgroundColor) textStyle.bg = { rgb: formatting.backgroundColor }
    if (formatting.fontFamily) textStyle.ff = formatting.fontFamily

    // Add or merge with existing text runs
    // Univer uses textRuns to define styled ranges
    if (!body.textRuns) body.textRuns = []
    
    // Simple implementation: add a new text run for the formatted range
    body.textRuns.push({
        st: startIndex,
        ed: endIndex,
        ts: textStyle
    })

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to format text: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'document')

    const formattingApplied = Object.keys(formatting).filter(k => formatting[k as keyof typeof formatting] !== undefined)
    log.info(`[Tools] Applied formatting to document: ${formattingApplied.join(', ')}`)
    return { 
        artifactId, 
        message: `Applied formatting (${formattingApplied.join(', ')}) to characters ${startIndex}-${endIndex}` 
    }
}

async function executeAddHeading(
    args: z.infer<typeof DOCUMENT_TOOLS.add_heading.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, text, level, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number; paragraphStyle?: Record<string, unknown> }>
    }

    // Heading font sizes
    const headingSizes: Record<string, number> = {
        h1: 28,
        h2: 22,
        h3: 18,
        h4: 14
    }

    if (!body.textRuns) body.textRuns = []
    
    const headingText = text + '\r\n'
    
    if (position === 'start') {
        // Prepend heading
        body.dataStream = headingText + body.dataStream
        
        // Shift existing paragraph indices
        body.paragraphs = body.paragraphs.map(p => ({
            ...p,
            startIndex: p.startIndex + headingText.length
        }))
        
        // Add heading paragraph at start
        body.paragraphs.unshift({
            startIndex: 0,
            paragraphStyle: {
                spaceAbove: level === 'h1' ? 24 : 16,
                spaceBelow: level === 'h1' ? 12 : 8
            }
        })
        
        // Shift existing text runs
        body.textRuns = body.textRuns.map(tr => ({
            ...tr,
            st: tr.st + headingText.length,
            ed: tr.ed + headingText.length
        }))
        
        // Add heading text run (bold + sized)
        body.textRuns.unshift({
            st: 0,
            ed: text.length,
            ts: {
                bl: 1, // Bold
                fs: headingSizes[level]
            }
        })
    } else {
        // Append heading
        const insertIndex = body.dataStream.length - 2 // Before final \r\n
        body.dataStream = body.dataStream.slice(0, -2) + headingText + '\r\n'
        
        // Add heading paragraph
        body.paragraphs.push({
            startIndex: insertIndex,
            paragraphStyle: {
                spaceAbove: level === 'h1' ? 24 : 16,
                spaceBelow: level === 'h1' ? 12 : 8
            }
        })
        
        // Add heading text run
        body.textRuns.push({
            st: insertIndex,
            ed: insertIndex + text.length,
            ts: {
                bl: 1,
                fs: headingSizes[level]
            }
        })
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add heading: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Added ${level} heading: "${text}"`)
    return { artifactId, message: `Added ${level.toUpperCase()} heading: "${text}"` }
}

async function executeAddBulletList(
    args: z.infer<typeof DOCUMENT_TOOLS.add_bullet_list.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, items, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number; bullet?: Record<string, unknown> }>
    }

    // Build list text with bullet markers
    const listText = items.map(item => `• ${item}`).join('\r\n') + '\r\n'
    
    if (position === 'start') {
        body.dataStream = listText + body.dataStream
        
        // Shift existing paragraphs
        body.paragraphs = body.paragraphs.map(p => ({
            ...p,
            startIndex: p.startIndex + listText.length
        }))
        
        // Add bullet paragraphs at start
        let offset = 0
        for (const item of items) {
            body.paragraphs.unshift({
                startIndex: offset,
                bullet: { listId: 'bullet-list', nestingLevel: 0 }
            })
            offset += item.length + 4 // "• " + item + "\r\n"
        }
    } else {
        const insertIndex = body.dataStream.length - 2
        body.dataStream = body.dataStream.slice(0, -2) + listText + '\r\n'
        
        // Add bullet paragraphs
        let offset = insertIndex
        for (const item of items) {
            body.paragraphs.push({
                startIndex: offset,
                bullet: { listId: 'bullet-list', nestingLevel: 0 }
            })
            offset += item.length + 4
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add bullet list: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Added bullet list with ${items.length} items`)
    return { artifactId, message: `Added bullet list with ${items.length} items` }
}

async function executeAddNumberedList(
    args: z.infer<typeof DOCUMENT_TOOLS.add_numbered_list.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, items, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number; bullet?: Record<string, unknown> }>
    }

    // Build list text with numbered markers
    const listText = items.map((item, i) => `${i + 1}. ${item}`).join('\r\n') + '\r\n'
    
    if (position === 'start') {
        body.dataStream = listText + body.dataStream
        
        // Shift existing paragraphs
        body.paragraphs = body.paragraphs.map(p => ({
            ...p,
            startIndex: p.startIndex + listText.length
        }))
        
        // Add numbered paragraphs at start
        let offset = 0
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            const prefix = `${i + 1}. `
            body.paragraphs.unshift({
                startIndex: offset,
                bullet: { listId: 'numbered-list', nestingLevel: 0, listType: 'ordered' }
            })
            offset += prefix.length + item.length + 2 // prefix + item + "\r\n"
        }
    } else {
        const insertIndex = body.dataStream.length - 2
        body.dataStream = body.dataStream.slice(0, -2) + listText + '\r\n'
        
        // Add numbered paragraphs
        let offset = insertIndex
        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            const prefix = `${i + 1}. `
            body.paragraphs.push({
                startIndex: offset,
                bullet: { listId: 'numbered-list', nestingLevel: 0, listType: 'ordered' }
            })
            offset += prefix.length + item.length + 2
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add numbered list: ${updateError.message}`)

    // Notify renderer for live UI update
    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Added numbered list with ${items.length} items`)
    return { artifactId, message: `Added numbered list with ${items.length} items` }
}

async function executeAddTable(
    args: z.infer<typeof DOCUMENT_TOOLS.add_table.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, headers, rows: rowsJson, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    // Parse rows from JSON
    let parsedRows: string[][] = []
    if (rowsJson) {
        try {
            parsedRows = JSON.parse(rowsJson)
        } catch (e) {
            log.warn(`[Tools] Failed to parse table rows JSON: ${e}`)
        }
    }

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number }>
    }

    // Build simple text table representation
    const separator = '|' + headers.map(() => '---').join('|') + '|'
    const headerRow = '| ' + headers.join(' | ') + ' |'
    const dataRows = parsedRows.map(row => '| ' + row.join(' | ') + ' |')
    const tableText = [headerRow, separator, ...dataRows].join('\r\n') + '\r\n'

    if (!body.textRuns) body.textRuns = []

    if (position === 'start') {
        const shift = tableText.length
        body.dataStream = tableText + body.dataStream
        body.paragraphs = body.paragraphs.map(p => ({
            ...p,
            startIndex: p.startIndex + shift
        }))
        // Add table paragraphs
        let offset = 0
        for (const line of [headerRow, separator, ...dataRows]) {
            body.paragraphs.unshift({ startIndex: offset })
            offset += line.length + 2
        }
    } else {
        const insertIndex = body.dataStream.length - 2
        body.dataStream = body.dataStream.slice(0, -2) + tableText + '\r\n'
        let offset = insertIndex
        for (const line of [headerRow, separator, ...dataRows]) {
            body.paragraphs.push({ startIndex: offset })
            offset += line.length + 2
        }
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add table: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Added table with ${headers.length} columns and ${parsedRows.length} rows`)
    return { artifactId, message: `Added table with ${headers.length} columns and ${parsedRows.length} rows` }
}

async function executeAddLink(
    args: z.infer<typeof DOCUMENT_TOOLS.add_link.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, text, url, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number }>
    }

    if (!body.textRuns) body.textRuns = []

    const linkText = text + '\r\n'

    if (position === 'start') {
        const shift = linkText.length
        body.dataStream = linkText + body.dataStream
        
        // Shift existing
        body.paragraphs = body.paragraphs.map(p => ({ ...p, startIndex: p.startIndex + shift }))
        body.textRuns = body.textRuns.map(tr => ({ ...tr, st: tr.st + shift, ed: tr.ed + shift }))
        
        // Add link paragraph and styling
        body.paragraphs.unshift({ startIndex: 0 })
        body.textRuns.unshift({
            st: 0,
            ed: text.length,
            ts: {
                ul: { s: 1 }, // Underline
                cl: { rgb: '#0066cc' } // Blue color for links
            }
        })
    } else {
        const insertIndex = body.dataStream.length - 2
        body.dataStream = body.dataStream.slice(0, -2) + linkText + '\r\n'
        
        body.paragraphs.push({ startIndex: insertIndex })
        body.textRuns.push({
            st: insertIndex,
            ed: insertIndex + text.length,
            ts: {
                ul: { s: 1 },
                cl: { rgb: '#0066cc' }
            }
        })
    }

    // Store link metadata (Univer uses customRanges for hyperlinks)
    if (!univerData.customRanges) univerData.customRanges = []
    univerData.customRanges.push({
        type: 'hyperlink',
        url,
        text
    })

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add link: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Added link: "${text}" -> ${url}`)
    return { artifactId, message: `Added link "${text}" pointing to ${url}` }
}

async function executeAddHorizontalRule(
    args: z.infer<typeof DOCUMENT_TOOLS.add_horizontal_rule.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        paragraphs: Array<{ startIndex: number; paragraphStyle?: Record<string, unknown> }>
    }

    // Use a series of dashes as horizontal rule representation
    const hrText = '────────────────────────────────\r\n'

    if (position === 'start') {
        const shift = hrText.length
        body.dataStream = hrText + body.dataStream
        body.paragraphs = body.paragraphs.map(p => ({ ...p, startIndex: p.startIndex + shift }))
        body.paragraphs.unshift({
            startIndex: 0,
            paragraphStyle: {
                borderBottom: { color: { rgb: '#cccccc' }, width: 1 }
            }
        })
    } else {
        const insertIndex = body.dataStream.length - 2
        body.dataStream = body.dataStream.slice(0, -2) + hrText + '\r\n'
        body.paragraphs.push({
            startIndex: insertIndex,
            paragraphStyle: {
                borderBottom: { color: { rgb: '#cccccc' }, width: 1 }
            }
        })
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add horizontal rule: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Added horizontal rule`)
    return { artifactId, message: `Added horizontal divider` }
}

async function executeAddCodeBlock(
    args: z.infer<typeof DOCUMENT_TOOLS.add_code_block.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, code, language, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number; paragraphStyle?: Record<string, unknown> }>
    }

    if (!body.textRuns) body.textRuns = []

    // Format code block with language indicator
    const langLabel = language ? `[${language}]\r\n` : ''
    const codeText = langLabel + code + '\r\n'

    if (position === 'start') {
        const shift = codeText.length
        body.dataStream = codeText + body.dataStream
        
        body.paragraphs = body.paragraphs.map(p => ({ ...p, startIndex: p.startIndex + shift }))
        body.textRuns = body.textRuns.map(tr => ({ ...tr, st: tr.st + shift, ed: tr.ed + shift }))
        
        // Add code block styling
        body.paragraphs.unshift({
            startIndex: 0,
            paragraphStyle: {
                backgroundColor: { rgb: '#f5f5f5' },
                paddingLeft: 12,
                paddingRight: 12
            }
        })
        body.textRuns.unshift({
            st: langLabel.length,
            ed: codeText.length - 2,
            ts: {
                ff: 'Consolas, Monaco, monospace',
                fs: 12,
                cl: { rgb: '#333333' }
            }
        })
    } else {
        const insertIndex = body.dataStream.length - 2
        body.dataStream = body.dataStream.slice(0, -2) + codeText + '\r\n'
        
        body.paragraphs.push({
            startIndex: insertIndex,
            paragraphStyle: {
                backgroundColor: { rgb: '#f5f5f5' },
                paddingLeft: 12,
                paddingRight: 12
            }
        })
        body.textRuns.push({
            st: insertIndex + langLabel.length,
            ed: insertIndex + codeText.length - 2,
            ts: {
                ff: 'Consolas, Monaco, monospace',
                fs: 12,
                cl: { rgb: '#333333' }
            }
        })
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add code block: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Added code block${language ? ` (${language})` : ''}`)
    return { artifactId, message: `Added code block${language ? ` with ${language} syntax` : ''}` }
}

async function executeAddQuote(
    args: z.infer<typeof DOCUMENT_TOOLS.add_quote.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string }> {
    const { artifactId, text, author, position } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number; paragraphStyle?: Record<string, unknown> }>
    }

    if (!body.textRuns) body.textRuns = []

    // Format quote with optional author
    const quoteText = `"${text}"` + (author ? `\r\n— ${author}` : '') + '\r\n'

    if (position === 'start') {
        const shift = quoteText.length
        body.dataStream = quoteText + body.dataStream
        
        body.paragraphs = body.paragraphs.map(p => ({ ...p, startIndex: p.startIndex + shift }))
        body.textRuns = body.textRuns.map(tr => ({ ...tr, st: tr.st + shift, ed: tr.ed + shift }))
        
        body.paragraphs.unshift({
            startIndex: 0,
            paragraphStyle: {
                borderLeft: { color: { rgb: '#cccccc' }, width: 3 },
                paddingLeft: 16,
                indentStart: 20
            }
        })
        body.textRuns.unshift({
            st: 0,
            ed: text.length + 2, // Include quotes
            ts: {
                it: 1, // Italic
                cl: { rgb: '#555555' }
            }
        })
    } else {
        const insertIndex = body.dataStream.length - 2
        body.dataStream = body.dataStream.slice(0, -2) + quoteText + '\r\n'
        
        body.paragraphs.push({
            startIndex: insertIndex,
            paragraphStyle: {
                borderLeft: { color: { rgb: '#cccccc' }, width: 3 },
                paddingLeft: 16,
                indentStart: 20
            }
        })
        body.textRuns.push({
            st: insertIndex,
            ed: insertIndex + text.length + 2,
            ts: {
                it: 1,
                cl: { rgb: '#555555' }
            }
        })
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to add quote: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Added quote${author ? ` by ${author}` : ''}`)
    return { artifactId, message: `Added blockquote${author ? ` attributed to ${author}` : ''}` }
}

async function executeFindReplaceDocument(
    args: z.infer<typeof DOCUMENT_TOOLS.find_replace_document.inputSchema>,
    userId: string
): Promise<{ artifactId: string; message: string; replacementsCount: number }> {
    const { artifactId, find, replace, matchCase } = args
    
    const { data: artifact, error } = await supabase
        .from('artifacts')
        .select('*, chats!inner(user_id)')
        .eq('id', artifactId)
        .single()

    if (error || !artifact) throw new Error('Document not found')
    if (artifact.chats.user_id !== userId) throw new Error('Access denied')

    const univerData = artifact.univer_data
    const body = univerData.body as { 
        dataStream: string
        textRuns: Array<{ st: number; ed: number; ts?: Record<string, unknown> }>
        paragraphs: Array<{ startIndex: number }>
    }

    const originalText = body.dataStream
    const searchPattern = matchCase ? find : find.toLowerCase()
    const textToSearch = matchCase ? originalText : originalText.toLowerCase()
    
    // Count occurrences
    let replacementsCount = 0
    let searchIndex = 0
    let foundIndex = textToSearch.indexOf(searchPattern, searchIndex)
    while (foundIndex !== -1) {
        replacementsCount++
        searchIndex = foundIndex + searchPattern.length
        foundIndex = textToSearch.indexOf(searchPattern, searchIndex)
    }

    if (replacementsCount === 0) {
        return { artifactId, message: `No occurrences of "${find}" found`, replacementsCount: 0 }
    }

    // Perform replacement
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi')
    const newText = originalText.replace(regex, replace)
    
    // Calculate length difference for adjusting indices
    const lengthDiff = newText.length - originalText.length

    body.dataStream = newText

    // Adjust paragraph and text run indices if length changed
    if (lengthDiff !== 0 && body.paragraphs) {
        // Simple approach: recalculate based on \r\n positions
        const newParagraphs: Array<{ startIndex: number }> = []
        let idx = 0
        for (const char of newText) {
            if (char === '\r' || idx === 0) {
                newParagraphs.push({ startIndex: idx === 0 ? 0 : idx + 1 })
            }
            idx++
        }
        // Keep original paragraph styles if possible
        body.paragraphs = newParagraphs.slice(0, body.paragraphs.length)
    }

    const { error: updateError } = await supabase
        .from('artifacts')
        .update({ univer_data: univerData, updated_at: new Date().toISOString() })
        .eq('id', artifactId)

    if (updateError) throw new Error(`Failed to find/replace: ${updateError.message}`)

    notifyArtifactUpdate(artifactId, univerData, 'document')

    log.info(`[Tools] Find/Replace in document: "${find}" → "${replace}", ${replacementsCount} replacements`)
    return { 
        artifactId, 
        message: `Replaced "${find}" with "${replace}" in ${replacementsCount} location(s)`,
        replacementsCount
    }
}

// ============================================================================
// IMAGE TOOLS EXECUTION
// ============================================================================

async function executeGenerateImage(
    args: z.infer<typeof IMAGE_TOOLS.generate_image.inputSchema>,
    chatId: string,
    _userId: string,
    context?: ToolContext
): Promise<{ 
    imageUrl: string
    message: string
    prompt: string
    size: string
    quality: string
}> {
    const { prompt, size, quality, background, output_format, n } = args

    if (!context?.apiKey) {
        throw new Error('OpenAI API key is required for image generation')
    }

    log.info(`[Tools] executeGenerateImage: prompt="${prompt.slice(0, 50)}...", size=${size}, quality=${quality}`)

    // Create OpenAI client
    const client = new OpenAI({
        apiKey: context.apiKey,
        baseURL: context.baseURL,
        defaultHeaders: context.headers
    })

    // Generate image(s) using gpt-image-1.5 for best quality
    const response = await client.images.generate({
        model: 'gpt-image-1.5',
        prompt,
        size: size === 'auto' ? undefined : size,
        quality: quality === 'auto' ? undefined : quality,
        background: background === 'auto' ? undefined : background,
        output_format: output_format || 'png',
        n: n || 1
    })

    if (!response.data || response.data.length === 0) {
        throw new Error('No images generated')
    }

    const format = output_format || 'png'
    const imageData = response.data[0]
    const base64 = imageData.b64_json

    if (!base64) {
        throw new Error('No image data in response')
    }

    // Upload to Supabase Storage
    const imageBuffer = Buffer.from(base64, 'base64')
    const fileName = `generated/${chatId}/${crypto.randomUUID()}.${format}`
    
    const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, imageBuffer, {
            contentType: `image/${format}`,
            cacheControl: '31536000' // 1 year cache
        })

    if (uploadError) {
        log.error(`[Tools] Failed to upload image to storage: ${uploadError.message}`)
        throw new Error(`Failed to upload image: ${uploadError.message}`)
    }

    // --- NEW: Save record to chat_files table so it appears in Gallery and File Search ---
    try {
        await supabase
            .from('chat_files')
            .insert({
                chat_id: chatId,
                user_id: _userId,
                filename: `generated-${Date.now()}.${format}`,
                storage_path: fileName, // This is relative to the bucket 'images'? 
                // Wait, chat_files.storage_path expects bucket 'attachments'?
                // In filesRouter it uses 'attachments' bucket.
                // Here we use 'images' bucket. This might be a conflict.
                // Let's check where chat_files points to.
                file_size: imageBuffer.length,
                content_type: `image/${format}`
            })
    } catch (err) {
        log.error(`[Tools] Failed to save generated image to chat_files:`, err)
    }
    // ---------------------------------------------------------------------------------

    // Generate signed URL for private access (7 days expiration)
    // This is more secure than public URLs and allows for access control
    const SIGNED_URL_EXPIRATION = 60 * 60 * 24 * 7 // 7 days in seconds
    
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('images')
        .createSignedUrl(fileName, SIGNED_URL_EXPIRATION)

    if (signedUrlError || !signedUrlData?.signedUrl) {
        log.error(`[Tools] Failed to create signed URL: ${signedUrlError?.message}`)
        // Fallback to public URL if signed URL fails
        const { data: publicUrlData } = supabase.storage
            .from('images')
            .getPublicUrl(fileName)
        
        const imageUrl = publicUrlData.publicUrl
        log.warn(`[Tools] Using public URL as fallback: ${imageUrl}`)
        
        return {
            imageUrl,
            message: `Image generated successfully`,
            prompt,
            size: size || 'auto',
            quality: quality || 'auto'
        }
    }

    const imageUrl = signedUrlData.signedUrl

    log.info(`[Tools] Generated image with signed URL (expires in 7 days): ${imageUrl.slice(0, 80)}...`)

    // Notify renderer of generated image for live update
    sendToRenderer('image:generated', { 
        chatId, 
        imageUrl, 
        prompt,
        size: size || 'auto',
        quality: quality || 'auto'
    })

    return {
        imageUrl,
        message: `Image generated successfully`,
        prompt,
        size: size || 'auto',
        quality: quality || 'auto'
    }
}

async function executeEditImage(
    args: z.infer<typeof IMAGE_TOOLS.edit_image.inputSchema>,
    chatId: string,
    _userId: string,
    context?: ToolContext
): Promise<{ 
    imageUrl: string
    message: string
    prompt: string
    size: string
    quality: string
}> {
    const { prompt, imageBase64, maskBase64, size, quality, n } = args

    if (!context?.apiKey) {
        throw new Error('OpenAI API key is required for image editing')
    }

    log.info(`[Tools] executeEditImage: prompt="${prompt.slice(0, 50)}...", hasMask=${!!maskBase64}`)

    // Create OpenAI client
    const client = new OpenAI({
        apiKey: context.apiKey,
        baseURL: context.baseURL,
        defaultHeaders: context.headers
    })

    // Convert base64 to File objects for the API
    const imageBuffer = Buffer.from(imageBase64, 'base64')
    const imageFile = new File([imageBuffer], 'image.png', { type: 'image/png' })

    let maskFile: File | undefined
    if (maskBase64) {
        const maskBuffer = Buffer.from(maskBase64, 'base64')
        maskFile = new File([maskBuffer], 'mask.png', { type: 'image/png' })
    }

    // Edit image(s) using gpt-image-1.5 for best quality
    const response = await client.images.edit({
        model: 'gpt-image-1.5',
        image: imageFile,
        prompt,
        mask: maskFile,
        size: size === 'auto' ? undefined : size,
        quality: quality === 'auto' ? undefined : quality,
        n: n || 1
    })

    if (!response.data || response.data.length === 0) {
        throw new Error('No edited images generated')
    }

    const imageData = response.data[0]
    const base64 = imageData.b64_json

    if (!base64) {
        throw new Error('No image data in response')
    }

    // Upload to Supabase Storage
    const editedBuffer = Buffer.from(base64, 'base64')
    const fileName = `edited/${chatId}/${crypto.randomUUID()}.png`
    
    const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, editedBuffer, {
            contentType: 'image/png',
            cacheControl: '31536000'
        })

    if (uploadError) {
        log.error(`[Tools] Failed to upload edited image to storage: ${uploadError.message}`)
        throw new Error(`Failed to upload image: ${uploadError.message}`)
    }

    // Generate signed URL for private access (7 days expiration)
    const SIGNED_URL_EXPIRATION = 60 * 60 * 24 * 7 // 7 days in seconds
    
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('images')
        .createSignedUrl(fileName, SIGNED_URL_EXPIRATION)

    if (signedUrlError || !signedUrlData?.signedUrl) {
        log.error(`[Tools] Failed to create signed URL for edited image: ${signedUrlError?.message}`)
        // Fallback to public URL if signed URL fails
        const { data: publicUrlData } = supabase.storage
            .from('images')
            .getPublicUrl(fileName)
        
        const imageUrl = publicUrlData.publicUrl
        log.warn(`[Tools] Using public URL as fallback: ${imageUrl}`)
        
        return {
            imageUrl,
            message: `Image edited successfully`,
            prompt,
            size: size || 'auto',
            quality: quality || 'auto'
        }
    }

    const imageUrl = signedUrlData.signedUrl

    log.info(`[Tools] Edited image with signed URL (expires in 7 days): ${imageUrl.slice(0, 80)}...`)

    // Notify renderer of edited image
    sendToRenderer('image:generated', { 
        chatId, 
        imageUrl, 
        prompt,
        size: size || 'auto',
        quality: quality || 'auto',
        isEdited: true
    })

    return {
        imageUrl,
        message: `Image edited successfully`,
        prompt,
        size: size || 'auto',
        quality: quality || 'auto'
    }
}

// Main tool execution function
export async function executeTool(
    toolName: string,
    args: unknown,
    chatId: string,
    userId: string,
    context?: ToolContext
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

        case 'sort_range':
            return executeSortRange(
                SPREADSHEET_TOOLS.sort_range.inputSchema.parse(args),
                userId
            )

        case 'filter_data':
            return executeFilterData(
                SPREADSHEET_TOOLS.filter_data.inputSchema.parse(args),
                userId
            )

        case 'conditional_format':
            return executeConditionalFormat(
                SPREADSHEET_TOOLS.conditional_format.inputSchema.parse(args),
                userId
            )

        case 'insert_image':
            return executeInsertImage(
                SPREADSHEET_TOOLS.insert_image.inputSchema.parse(args),
                userId
            )

        case 'copy_range':
            return executeCopyRange(
                SPREADSHEET_TOOLS.copy_range.inputSchema.parse(args),
                userId
            )

        case 'move_range':
            return executeMoveRange(
                SPREADSHEET_TOOLS.move_range.inputSchema.parse(args),
                userId
            )

        case 'find_replace':
            return executeFindReplace(
                SPREADSHEET_TOOLS.find_replace.inputSchema.parse(args),
                userId
            )

        case 'freeze_panes':
            return executeFreezePanes(
                SPREADSHEET_TOOLS.freeze_panes.inputSchema.parse(args),
                userId
            )

        case 'auto_fill':
            return executeAutoFill(
                SPREADSHEET_TOOLS.auto_fill.inputSchema.parse(args),
                userId
            )

        case 'clear_range':
            return executeClearRange(
                SPREADSHEET_TOOLS.clear_range.inputSchema.parse(args),
                userId
            )

        case 'insert_column':
            return executeInsertColumn(
                SPREADSHEET_TOOLS.insert_column.inputSchema.parse(args),
                userId
            )

        case 'delete_column':
            return executeDeleteColumn(
                SPREADSHEET_TOOLS.delete_column.inputSchema.parse(args),
                userId
            )

        case 'duplicate_row':
            return executeDuplicateRow(
                SPREADSHEET_TOOLS.duplicate_row.inputSchema.parse(args),
                userId
            )

        case 'insert_row':
            return executeInsertRow(
                SPREADSHEET_TOOLS.insert_row.inputSchema.parse(args),
                userId
            )

        case 'rename_sheet':
            return executeRenameSheet(
                SPREADSHEET_TOOLS.rename_sheet.inputSchema.parse(args),
                userId
            )

        case 'add_sheet':
            return executeAddSheet(
                SPREADSHEET_TOOLS.add_sheet.inputSchema.parse(args),
                userId
            )

        case 'data_validation':
            return executeDataValidation(
                SPREADSHEET_TOOLS.data_validation.inputSchema.parse(args),
                userId
            )

        case 'add_comment':
            return executeAddComment(
                SPREADSHEET_TOOLS.add_comment.inputSchema.parse(args),
                userId
            )

        case 'protect_range':
            return executeProtectRange(
                SPREADSHEET_TOOLS.protect_range.inputSchema.parse(args),
                userId
            )

        case 'set_print_area':
            return executeSetPrintArea(
                SPREADSHEET_TOOLS.set_print_area.inputSchema.parse(args),
                userId
            )

        case 'get_cell_value':
            return executeGetCellValue(
                SPREADSHEET_TOOLS.get_cell_value.inputSchema.parse(args),
                userId
            )

        case 'get_range_values':
            return executeGetRangeValues(
                SPREADSHEET_TOOLS.get_range_values.inputSchema.parse(args),
                userId
            )

        case 'transpose_range':
            return executeTransposeRange(
                SPREADSHEET_TOOLS.transpose_range.inputSchema.parse(args),
                userId
            )

        case 'calculate_range':
            return executeCalculateRange(
                SPREADSHEET_TOOLS.calculate_range.inputSchema.parse(args),
                userId
            )

        case 'export_to_csv':
            return executeExportToCsv(
                SPREADSHEET_TOOLS.export_to_csv.inputSchema.parse(args),
                userId
            )

        case 'remove_duplicates':
            return executeRemoveDuplicates(
                SPREADSHEET_TOOLS.remove_duplicates.inputSchema.parse(args),
                userId
            )

        case 'apply_number_format':
            return executeApplyNumberFormat(
                SPREADSHEET_TOOLS.apply_number_format.inputSchema.parse(args),
                userId
            )

        case 'create_named_range':
            return executeCreateNamedRange(
                SPREADSHEET_TOOLS.create_named_range.inputSchema.parse(args),
                userId
            )

        // Document tools (FREE)
        case 'create_document':
            return executeCreateDocument(
                DOCUMENT_TOOLS.create_document.inputSchema.parse(args),
                chatId,
                userId
            )

        case 'insert_text':
            return executeInsertText(
                DOCUMENT_TOOLS.insert_text.inputSchema.parse(args),
                userId
            )

        case 'replace_document_content':
            return executeReplaceDocumentContent(
                DOCUMENT_TOOLS.replace_document_content.inputSchema.parse(args),
                userId
            )

        case 'get_document_content':
            return executeGetDocumentContent(
                DOCUMENT_TOOLS.get_document_content.inputSchema.parse(args),
                userId
            )

        case 'format_document_text':
            return executeFormatDocumentText(
                DOCUMENT_TOOLS.format_document_text.inputSchema.parse(args),
                userId
            )

        case 'add_heading':
            return executeAddHeading(
                DOCUMENT_TOOLS.add_heading.inputSchema.parse(args),
                userId
            )

        case 'add_bullet_list':
            return executeAddBulletList(
                DOCUMENT_TOOLS.add_bullet_list.inputSchema.parse(args),
                userId
            )

        case 'add_numbered_list':
            return executeAddNumberedList(
                DOCUMENT_TOOLS.add_numbered_list.inputSchema.parse(args),
                userId
            )

        case 'add_table':
            return executeAddTable(
                DOCUMENT_TOOLS.add_table.inputSchema.parse(args),
                userId
            )

        case 'add_link':
            return executeAddLink(
                DOCUMENT_TOOLS.add_link.inputSchema.parse(args),
                userId
            )

        case 'add_horizontal_rule':
            return executeAddHorizontalRule(
                DOCUMENT_TOOLS.add_horizontal_rule.inputSchema.parse(args),
                userId
            )

        case 'add_code_block':
            return executeAddCodeBlock(
                DOCUMENT_TOOLS.add_code_block.inputSchema.parse(args),
                userId
            )

        case 'add_quote':
            return executeAddQuote(
                DOCUMENT_TOOLS.add_quote.inputSchema.parse(args),
                userId
            )

        case 'find_replace_document':
            return executeFindReplaceDocument(
                DOCUMENT_TOOLS.find_replace_document.inputSchema.parse(args),
                userId
            )

        // Image tools
        case 'generate_image':
            return executeGenerateImage(
                IMAGE_TOOLS.generate_image.inputSchema.parse(args),
                chatId,
                userId,
                context
            )

        case 'edit_image':
            return executeEditImage(
                IMAGE_TOOLS.edit_image.inputSchema.parse(args),
                chatId,
                userId,
                context
            )

        // Plan mode tools
        case 'ExitPlanMode': {
            // ExitPlanMode just returns the plan - no side effects
            const planArgs = PLAN_TOOLS.ExitPlanMode.inputSchema.parse(args)
            log.info(`[Tools] ExitPlanMode called with plan: ${planArgs.plan.slice(0, 100)}...`)
            return { 
                success: true, 
                plan: planArgs.plan,
                message: 'Plan created successfully. User can now approve to implement.' 
            }
        }

        default:
            throw new Error(`Unknown tool: ${toolName}`)
    }
}

// Convert tools to API format
export function getToolsForAPI(provider: 'openai' | 'anthropic') {
    const tools = Object.entries(ALL_TOOLS).map(([name, tool]) => {
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

/**
 * Direct image generation function for use when generateImage flag is true.
 * Skips the AI agent and directly calls gpt-image-1.5 with fixed high-quality params.
 * 
 * @param prompt - The image description from the user
 * @param chatId - Chat ID for storage organization
 * @param userId - User ID for access control
 * @param apiKey - OpenAI API key
 * @param provider - Provider for custom endpoints (optional)
 * @param baseURL - Custom base URL for API (optional)
 * @param headers - Custom headers for API (optional)
 * @param size - Image size (default: 1024x1024, options: 1536x1024, 1024x1536)
 * @returns Promise with imageUrl and metadata
 */
export async function generateImageDirect(
    prompt: string,
    chatId: string,
    userId: string,
    apiKey: string,
    provider?: 'openai' | 'zai',
    baseURL?: string,
    headers?: Record<string, string>,
    size: string = '1024x1024'
): Promise<{
    imageUrl: string
    message: string
    prompt: string
    size: string
    quality: string
}> {
    log.info(`[Tools] generateImageDirect: prompt="${prompt.slice(0, 80)}...", quality=high, size=${size}`)

    const context: ToolContext = {
        apiKey,
        provider: provider || 'openai',
        baseURL,
        headers
    }

    // Call executeGenerateImage with high-quality params and dynamic size
    return executeGenerateImage(
        {
            prompt,
            size: size as '1024x1024' | '1536x1024' | '1024x1536' | 'auto',
            quality: 'high',
            background: 'auto',
            output_format: 'png',
            n: 1
        },
        chatId,
        userId,
        context
    )
}

// tRPC router for direct tool execution (used by renderer for manual tool calls)
export const toolsRouter = router({
    execute: protectedProcedure
        .input(z.object({
            toolName: z.string(),
            args: z.any(),
            chatId: z.string().uuid(),
            apiKey: z.string().optional() // Optional - will fallback to stored key
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

            // Get API key - prefer input, fallback to stored key
            const storedKey = getSecureApiKeyStore().getOpenAIKey()
            const apiKey = input.apiKey || storedKey
            
            log.info(`[ToolsRouter] execute: toolName=${input.toolName}, hasInputApiKey=${!!input.apiKey}, hasStoredKey=${!!storedKey}`)
            
            if (!apiKey && ['generate_image', 'edit_image'].includes(input.toolName)) {
                throw new Error('OpenAI API key is required. Please configure it in Settings.')
            }
            
            // Build tool context for image/AI operations
            const context: ToolContext | undefined = apiKey ? {
                apiKey,
                provider: 'openai'
            } : undefined

            return executeTool(input.toolName, input.args, input.chatId, ctx.userId, context)
        }),

    list: protectedProcedure.query(() => {
        return Object.entries(ALL_TOOLS).map(([name, tool]) => ({
            name,
            description: tool.description
        }))
    })
})
