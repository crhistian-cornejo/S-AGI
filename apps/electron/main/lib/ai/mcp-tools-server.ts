/**
 * MCP Tools Server - Custom tools for Claude Agent SDK
 *
 * Converts our AI SDK tools to MCP format so Claude can use them
 * with OAuth authentication (no API key required).
 *
 * @see https://modelcontextprotocol.io/
 */

import { z } from 'zod'
import log from 'electron-log'
import { sendToRenderer } from '../window-manager'
import type { ExcelContext, PDFContext, DocsContext } from '../agents/types'

/**
 * MCP Tool Definition compatible with Claude SDK
 */
interface McpToolDefinition<T extends z.ZodRawShape = z.ZodRawShape> {
    name: string
    description: string
    inputSchema: z.ZodObject<T>
    handler: (args: z.infer<z.ZodObject<T>>, extra: unknown) => Promise<McpToolResult>
}

/**
 * MCP Tool Result format
 */
interface McpToolResult {
    content: Array<{ type: 'text'; text: string }>
    isError?: boolean
}

/**
 * Create MCP-compatible Excel tools
 */
export function createExcelMcpTools(context: ExcelContext): McpToolDefinition[] {
    return [
        {
            name: 'create_spreadsheet',
            description: 'Crea una nueva hoja de calculo con datos iniciales. Usalo para crear tablas, reportes o analisis.',
            inputSchema: z.object({
                title: z.string().describe('Titulo de la hoja de calculo'),
                headers: z.array(z.string()).describe('Encabezados de las columnas'),
                data: z.array(z.array(z.union([z.string(), z.number(), z.null()])))
                    .optional()
                    .describe('Filas de datos (array de arrays)'),
                columnWidths: z.array(z.number())
                    .optional()
                    .describe('Anchos de columna en pixeles')
            }),
            handler: async ({ title, headers, data, columnWidths }) => {
                log.info(`[MCP ExcelTool] Creating spreadsheet: ${title}`)

                const artifactId = crypto.randomUUID()

                // Build cell data
                const cellData: Record<string, Record<string, { v: string | number; s?: unknown }>> = {}

                // Add headers (row 0)
                headers.forEach((header, col) => {
                    if (!cellData['0']) cellData['0'] = {}
                    cellData['0'][String(col)] = {
                        v: header,
                        s: { bl: 1 } // Bold
                    }
                })

                // Add data rows
                if (data) {
                    data.forEach((row, rowIndex) => {
                        const rowKey = String(rowIndex + 1)
                        if (!cellData[rowKey]) cellData[rowKey] = {}
                        row.forEach((cell, col) => {
                            if (cell !== null && cell !== undefined) {
                                cellData[rowKey][String(col)] = { v: cell }
                            }
                        })
                    })
                }

                // Build workbook structure
                const workbookData = {
                    id: artifactId,
                    name: title,
                    sheetOrder: ['sheet1'],
                    sheets: {
                        sheet1: {
                            id: 'sheet1',
                            name: 'Sheet1',
                            rowCount: Math.max(100, (data?.length || 0) + 10),
                            columnCount: Math.max(26, headers.length + 5),
                            cellData,
                            defaultColumnWidth: 100,
                            defaultRowHeight: 24,
                            columnData: columnWidths
                                ? Object.fromEntries(columnWidths.map((w, i) => [String(i), { w }]))
                                : undefined
                        }
                    }
                }

                // Send to renderer
                sendToRenderer('artifact:created', {
                    type: 'spreadsheet',
                    id: artifactId,
                    title,
                    data: workbookData,
                    chatId: context.chatId,
                    userId: context.userId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            artifactId,
                            title,
                            rowCount: (data?.length || 0) + 1,
                            columnCount: headers.length,
                            message: `Hoja de calculo "${title}" creada con ${headers.length} columnas y ${(data?.length || 0) + 1} filas.`
                        })
                    }]
                }
            }
        },
        {
            name: 'update_cells',
            description: 'Actualiza celdas especificas en la hoja de calculo activa.',
            inputSchema: z.object({
                updates: z.array(z.object({
                    cell: z.string().describe('Referencia de celda (ej: A1, B2)'),
                    value: z.union([z.string(), z.number()]).describe('Nuevo valor'),
                    formula: z.string().optional().describe('Formula (ej: =SUM(A1:A10))')
                })).describe('Lista de actualizaciones de celdas')
            }),
            handler: async ({ updates }) => {
                log.info(`[MCP ExcelTool] Updating ${updates.length} cells`)

                // Send updates to renderer
                sendToRenderer('excel:update-cells', {
                    artifactId: context.artifactId,
                    updates: updates.map((u) => ({
                        cell: u.cell,
                        value: u.formula || u.value
                    })),
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            updatedCells: updates.length,
                            message: `${updates.length} celda(s) actualizada(s).`
                        })
                    }]
                }
            }
        },
        {
            name: 'format_cells',
            description: 'Aplica formato a un rango de celdas.',
            inputSchema: z.object({
                range: z.string().describe('Rango de celdas (ej: A1:D10)'),
                format: z.object({
                    bold: z.boolean().optional(),
                    italic: z.boolean().optional(),
                    backgroundColor: z.string().optional().describe('Color hex (ej: #FFFF00)'),
                    textColor: z.string().optional().describe('Color hex'),
                    fontSize: z.number().optional(),
                    alignment: z.enum(['left', 'center', 'right']).optional(),
                    numberFormat: z.string().optional().describe('Formato numerico (ej: #,##0.00)')
                }).describe('Opciones de formato')
            }),
            handler: async ({ range, format }) => {
                log.info(`[MCP ExcelTool] Formatting range: ${range}`)

                sendToRenderer('excel:format-cells', {
                    artifactId: context.artifactId,
                    range,
                    format,
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            range,
                            message: `Formato aplicado al rango ${range}.`
                        })
                    }]
                }
            }
        },
        {
            name: 'insert_formula',
            description: 'Inserta una formula en una celda.',
            inputSchema: z.object({
                cell: z.string().describe('Referencia de celda (ej: E5)'),
                formula: z.string().describe('Formula Excel (ej: =SUM(A1:A10), =AVERAGE(B1:B5))')
            }),
            handler: async ({ cell, formula }) => {
                log.info(`[MCP ExcelTool] Inserting formula in ${cell}: ${formula}`)

                sendToRenderer('excel:update-cells', {
                    artifactId: context.artifactId,
                    updates: [{ cell, value: formula }],
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            cell,
                            formula,
                            message: `Formula "${formula}" insertada en ${cell}.`
                        })
                    }]
                }
            }
        },
        {
            name: 'add_conditional_formatting',
            description: 'Aplica formato condicional a un rango.',
            inputSchema: z.object({
                range: z.string().describe('Rango de celdas'),
                rules: z.array(z.object({
                    type: z.enum(['greaterThan', 'lessThan', 'equals', 'between', 'text_contains']),
                    value: z.union([z.string(), z.number()]),
                    value2: z.union([z.string(), z.number()]).optional(),
                    format: z.object({
                        backgroundColor: z.string().optional(),
                        textColor: z.string().optional(),
                        bold: z.boolean().optional()
                    })
                })).describe('Reglas de formato condicional')
            }),
            handler: async ({ range, rules }) => {
                log.info(`[MCP ExcelTool] Adding conditional formatting to ${range}`)

                sendToRenderer('excel:conditional-format', {
                    artifactId: context.artifactId,
                    range,
                    rules,
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            range,
                            rulesCount: rules.length,
                            message: `${rules.length} regla(s) de formato condicional aplicada(s) a ${range}.`
                        })
                    }]
                }
            }
        },
        {
            name: 'sort_data',
            description: 'Ordena datos en un rango.',
            inputSchema: z.object({
                range: z.string().describe('Rango de datos a ordenar'),
                sortColumn: z.string().describe('Columna por la cual ordenar (ej: A, B)'),
                ascending: z.boolean().default(true).describe('Orden ascendente (true) o descendente (false)'),
                hasHeaders: z.boolean().default(true).describe('Si la primera fila son encabezados')
            }),
            handler: async ({ range, sortColumn, ascending, hasHeaders }) => {
                log.info(`[MCP ExcelTool] Sorting ${range} by ${sortColumn}`)

                sendToRenderer('excel:sort-data', {
                    artifactId: context.artifactId,
                    range,
                    sortColumn,
                    ascending,
                    hasHeaders,
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            range,
                            sortColumn,
                            ascending,
                            message: `Datos ordenados por columna ${sortColumn} en orden ${ascending ? 'ascendente' : 'descendente'}.`
                        })
                    }]
                }
            }
        },
        {
            name: 'analyze_data',
            description: 'Analiza datos y genera estadisticas basicas.',
            inputSchema: z.object({
                range: z.string().describe('Rango de datos a analizar'),
                analysisType: z.enum(['summary', 'distribution', 'trends']).describe('Tipo de analisis')
            }),
            handler: async ({ range, analysisType }) => {
                log.info(`[MCP ExcelTool] Analyzing ${range} with ${analysisType}`)

                // This would trigger analysis in renderer and return results
                sendToRenderer('excel:analyze-data', {
                    artifactId: context.artifactId,
                    range,
                    analysisType,
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            range,
                            analysisType,
                            message: `Analisis "${analysisType}" iniciado para el rango ${range}. Los resultados se mostraran en la hoja.`
                        })
                    }]
                }
            }
        },
        {
            name: 'export_to_csv',
            description: 'Exporta los datos a formato CSV.',
            inputSchema: z.object({
                range: z.string().optional().describe('Rango a exportar (omitir para toda la hoja)'),
                filename: z.string().optional().describe('Nombre del archivo')
            }),
            handler: async ({ range, filename }) => {
                log.info(`[MCP ExcelTool] Exporting to CSV: ${filename || 'spreadsheet.csv'}`)

                sendToRenderer('excel:export-csv', {
                    artifactId: context.artifactId,
                    range,
                    filename,
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            filename: filename || 'spreadsheet.csv',
                            message: `Exportando a ${filename || 'spreadsheet.csv'}...`
                        })
                    }]
                }
            }
        }
    ]
}

/**
 * Create MCP-compatible PDF tools
 */
export function createPdfMcpTools(context: PDFContext): McpToolDefinition[] {
    return [
        {
            name: 'search_pdf',
            description: 'Busca texto en el documento PDF cargado.',
            inputSchema: z.object({
                query: z.string().describe('Texto a buscar'),
                caseSensitive: z.boolean().default(false).optional()
            }),
            handler: async ({ query, caseSensitive }) => {
                log.info(`[MCP PdfTool] Searching PDF for: ${query}`)

                if (!context.pages || context.pages.length === 0) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ error: 'No hay PDF cargado.' }) }],
                        isError: true
                    }
                }

                const results: Array<{ page: number; snippet: string }> = []
                const searchQuery = caseSensitive ? query : query.toLowerCase()

                for (const page of context.pages) {
                    const content = caseSensitive ? page.content : page.content.toLowerCase()
                    if (content.includes(searchQuery)) {
                        // Extract snippet around match
                        const index = content.indexOf(searchQuery)
                        const start = Math.max(0, index - 50)
                        const end = Math.min(page.content.length, index + query.length + 50)
                        const snippet = page.content.substring(start, end)

                        results.push({
                            page: page.pageNumber,
                            snippet: `...${snippet}...`
                        })
                    }
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            query,
                            resultsCount: results.length,
                            results: results.slice(0, 10),
                            message: results.length > 0
                                ? `Encontrado "${query}" en ${results.length} pagina(s).`
                                : `No se encontro "${query}" en el documento.`
                        })
                    }]
                }
            }
        },
        {
            name: 'get_page_content',
            description: 'Obtiene el contenido de una pagina especifica.',
            inputSchema: z.object({
                pageNumber: z.number().describe('Numero de pagina (empezando en 1)')
            }),
            handler: async ({ pageNumber }) => {
                log.info(`[MCP PdfTool] Getting page ${pageNumber}`)

                if (!context.pages || context.pages.length === 0) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ error: 'No hay PDF cargado.' }) }],
                        isError: true
                    }
                }

                const page = context.pages.find((p) => p.pageNumber === pageNumber)
                if (!page) {
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                error: `Pagina ${pageNumber} no encontrada. El documento tiene ${context.pages.length} paginas.`
                            })
                        }],
                        isError: true
                    }
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            pageNumber,
                            wordCount: page.wordCount,
                            content: page.content
                        })
                    }]
                }
            }
        },
        {
            name: 'summarize_pdf',
            description: 'Resume el contenido del PDF o una seccion especifica.',
            inputSchema: z.object({
                startPage: z.number().optional().describe('Pagina inicial'),
                endPage: z.number().optional().describe('Pagina final')
            }),
            handler: async ({ startPage, endPage }) => {
                log.info(`[MCP PdfTool] Summarizing pages ${startPage || 1} to ${endPage || 'end'}`)

                if (!context.pages || context.pages.length === 0) {
                    return {
                        content: [{ type: 'text', text: JSON.stringify({ error: 'No hay PDF cargado.' }) }],
                        isError: true
                    }
                }

                const start = startPage || 1
                const end = endPage || context.pages.length
                const selectedPages = context.pages.filter(
                    (p) => p.pageNumber >= start && p.pageNumber <= end
                )

                const combinedContent = selectedPages.map((p) => p.content).join('\n\n')
                const totalWords = selectedPages.reduce((sum, p) => sum + p.wordCount, 0)

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            pagesIncluded: selectedPages.length,
                            totalWords,
                            content: combinedContent.substring(0, 5000), // Limit to 5000 chars
                            truncated: combinedContent.length > 5000
                        })
                    }]
                }
            }
        }
    ]
}

/**
 * Create MCP-compatible Docs tools
 */
export function createDocsMcpTools(context: DocsContext): McpToolDefinition[] {
    return [
        {
            name: 'insert_text',
            description: 'Inserta texto en el documento.',
            inputSchema: z.object({
                text: z.string().describe('Texto a insertar'),
                position: z.enum(['start', 'end', 'cursor']).default('cursor'),
                formatting: z.object({
                    bold: z.boolean().optional(),
                    italic: z.boolean().optional(),
                    heading: z.enum(['h1', 'h2', 'h3']).optional()
                }).optional()
            }),
            handler: async ({ text, position, formatting }) => {
                log.info(`[MCP DocsTool] Inserting text at ${position}`)

                sendToRenderer('docs:insert-text', {
                    documentId: context.documentId,
                    text,
                    position,
                    formatting,
                    chatId: context.chatId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            position,
                            charCount: text.length,
                            message: `Texto insertado (${text.length} caracteres).`
                        })
                    }]
                }
            }
        },
        {
            name: 'create_document',
            description: 'Crea un nuevo documento con contenido estructurado.',
            inputSchema: z.object({
                title: z.string().describe('Titulo del documento'),
                content: z.array(z.object({
                    type: z.enum(['heading', 'paragraph', 'list', 'table']),
                    level: z.number().optional().describe('Nivel para headings (1-3)'),
                    text: z.string().optional(),
                    items: z.array(z.string()).optional().describe('Items para listas'),
                    rows: z.array(z.array(z.string())).optional().describe('Filas para tablas')
                })).describe('Bloques de contenido')
            }),
            handler: async ({ title, content }) => {
                log.info(`[MCP DocsTool] Creating document: ${title}`)

                const artifactId = crypto.randomUUID()

                sendToRenderer('artifact:created', {
                    type: 'document',
                    id: artifactId,
                    title,
                    data: { title, content },
                    chatId: context.chatId,
                    userId: context.userId
                })

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            artifactId,
                            title,
                            blockCount: content.length,
                            message: `Documento "${title}" creado con ${content.length} bloques.`
                        })
                    }]
                }
            }
        }
    ]
}

/**
 * Type for creating SDK MCP server (imported dynamically)
 */
export type { McpToolDefinition }
