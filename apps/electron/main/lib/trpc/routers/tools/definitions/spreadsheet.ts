/**
 * Spreadsheet Tool Definitions
 * Schema definitions for all spreadsheet-related tools
 */

import { z } from 'zod'

// Cell value schema - reusable across multiple tools
export const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const SPREADSHEET_TOOLS = {
    create_spreadsheet: {
        description: 'Create a new spreadsheet with column headers and optional initial data.',
        inputSchema: z.object({
            name: z.string().describe('Name of the spreadsheet'),
            columns: z.array(z.string()).describe('Column headers (array of strings)'),
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
                bold: z.boolean().optional().describe('Make text bold'),
                italic: z.boolean().optional().describe('Make text italic'),
                underline: z.boolean().optional().describe('Underline text'),
                strikethrough: z.boolean().optional().describe('Strikethrough text'),
                fontSize: z.number().optional().describe('Font size in points (e.g., 12, 14, 18)'),
                fontColor: z.string().optional().describe('Text color as hex (e.g., #FF0000 for red)'),
                fontFamily: z.string().optional().describe('Font family name (e.g., Arial, Times New Roman)'),
                backgroundColor: z.string().optional().describe('Background color as hex (e.g., #FFFF00 for yellow)'),
                horizontalAlign: z.enum(['left', 'center', 'right']).optional().describe('Horizontal text alignment'),
                verticalAlign: z.enum(['top', 'middle', 'bottom']).optional().describe('Vertical text alignment'),
                textWrap: z.boolean().optional().describe('Enable text wrapping in cells'),
                numberFormat: z.string().optional().describe('Number format pattern (e.g., #,##0.00 for thousands separator, 0.00% for percentage, $#,##0.00 for currency)'),
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
                condition: z.object({
                    operator: z.enum(['greaterThan', 'lessThan', 'equal', 'notEqual', 'between', 'contains', 'beginsWith', 'endsWith']).optional(),
                    value: z.union([z.string(), z.number()]).optional(),
                    value2: z.union([z.string(), z.number()]).optional().describe('Second value for "between" operator')
                }).optional().describe('Condition for cellValue type rules'),
                style: z.object({
                    backgroundColor: z.string().optional().describe('Background color as hex (e.g., #FF0000)'),
                    fontColor: z.string().optional().describe('Font color as hex'),
                    bold: z.boolean().optional(),
                    italic: z.boolean().optional()
                }).optional().describe('Style to apply when condition matches'),
                colorScale: z.object({
                    minColor: z.string().describe('Color for minimum value (hex)'),
                    midColor: z.string().optional().describe('Color for midpoint value (hex, optional)'),
                    maxColor: z.string().describe('Color for maximum value (hex)')
                }).optional().describe('Colors for color scale (type must be colorScale)'),
                dataBar: z.object({
                    color: z.string().describe('Bar color (hex)'),
                    showValue: z.boolean().default(true).describe('Show cell value alongside bar')
                }).optional().describe('Settings for data bar (type must be dataBar)'),
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
                options: z.array(z.string()).optional().describe('Dropdown options for list validation'),
                operator: z.enum(['between', 'notBetween', 'equal', 'notEqual', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual']).optional(),
                value1: z.union([z.string(), z.number()]).optional().describe('First value for comparison'),
                value2: z.union([z.string(), z.number()]).optional().describe('Second value (for between operators)'),
                formula: z.string().optional().describe('Custom formula for validation'),
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
} as const

export type SpreadsheetToolName = keyof typeof SPREADSHEET_TOOLS
