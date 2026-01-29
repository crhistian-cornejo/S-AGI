/**
 * Univer Sheets core - dedicated instance for spreadsheets.
 * 
 * With conditional rendering, each tab mount creates a fresh instance
 * and unmount disposes it completely. No need for complex workbook switching logic.
 */

import {
    LocaleType,
    LogLevel,
    merge,
    Univer,
    UniverInstanceType,
    ThemeService,
    IConfigService,
} from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import { UniverDocsPlugin } from '@univerjs/docs'
import {
    createCustomTheme,
    createDarkTheme,
    isDarkModeActive,
    createThemeFromVSCodeColors,
    type VSCodeThemeColors,
} from './univer-theme'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui'
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt'
import { UniverSheetsNumfmtUIPlugin } from '@univerjs/sheets-numfmt-ui'
import { BuiltInUIPart, UI_PLUGIN_CONFIG_KEY, UniverUIPlugin } from '@univerjs/ui'

// Drawing plugins for image support
import { UniverDrawingPlugin } from '@univerjs/drawing'
import { UniverDrawingUIPlugin } from '@univerjs/drawing-ui'
import { UniverSheetsDrawingPlugin } from '@univerjs/sheets-drawing'
import { UniverSheetsDrawingUIPlugin } from '@univerjs/sheets-drawing-ui'

// Hyperlink plugins
import { UniverSheetsHyperLinkPlugin } from '@univerjs/sheets-hyper-link'
import { UniverSheetsHyperLinkUIPlugin } from '@univerjs/sheets-hyper-link-ui'

// Find & Replace plugins
import { UniverFindReplacePlugin } from '@univerjs/find-replace'
import { UniverSheetsFindReplacePlugin } from '@univerjs/sheets-find-replace'

// Sort & Filter plugins
import { UniverSheetsSortPlugin } from '@univerjs/sheets-sort'
import { UniverSheetsFilterPlugin } from '@univerjs/sheets-filter'
import { UniverSheetsFilterUIPlugin } from '@univerjs/sheets-filter-ui'

// Conditional Formatting plugins
import { UniverSheetsConditionalFormattingPlugin } from '@univerjs/sheets-conditional-formatting'
import { UniverSheetsConditionalFormattingUIPlugin } from '@univerjs/sheets-conditional-formatting-ui'

// Data Validation plugins
import { UniverSheetsDataValidationPlugin } from '@univerjs/sheets-data-validation'
import { UniverSheetsDataValidationUIPlugin } from '@univerjs/sheets-data-validation-ui'

// Note plugins - Excel native-style notes (cell comments)
import { UniverSheetsNotePlugin } from '@univerjs/sheets-note'
import { UniverSheetsNoteUIPlugin } from '@univerjs/sheets-note-ui'

// Thread Comment plugins - DISABLED
// These plugins require Univer Server infrastructure (IThreadCommentDataSourceService)
// Without the server, DI fails with: "Cannot find 'w15'/'z' registered by any injector"
// import { UniverSheetsThreadCommentUIPlugin } from '@univerjs/sheets-thread-comment-ui'

// Import facade extensions - ORDER MATTERS!
// These extend the FUniver API with methods for each plugin
import '@univerjs/ui/facade'
import '@univerjs/engine-formula/facade'
import '@univerjs/sheets/facade'
import '@univerjs/sheets-ui/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/sheets-formula-ui/facade'
import '@univerjs/docs-ui/facade'
import '@univerjs/sheets-numfmt/facade'
import '@univerjs/sheets-hyper-link-ui/facade'
import '@univerjs/sheets-find-replace/facade'
import '@univerjs/sheets-sort/facade'
import '@univerjs/sheets-filter/facade'
import '@univerjs/sheets-conditional-formatting/facade'
import '@univerjs/sheets-data-validation/facade'
import '@univerjs/sheets-note/facade'
import '@univerjs/sheets-drawing-ui/facade'
// Note: thread-comment facade imports not available in this version
// Comments work via the plugin UI without facade API

// Import styles
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'
import '@univerjs/drawing-ui/lib/index.css'
import '@univerjs/sheets-drawing-ui/lib/index.css'
import '@univerjs/sheets-hyper-link-ui/lib/index.css'
import '@univerjs/find-replace/lib/index.css'
import '@univerjs/sheets-filter-ui/lib/index.css'
import '@univerjs/sheets-conditional-formatting-ui/lib/index.css'
import '@univerjs/sheets-data-validation-ui/lib/index.css'
// Note UI CSS - Excel native-style notes
import '@univerjs/sheets-note-ui/lib/index.css'
// Thread comment CSS - DISABLED (requires Univer Server)
// import '@univerjs/thread-comment-ui/lib/index.css'
// import '@univerjs/sheets-thread-comment-ui/lib/index.css'
// Custom theme overrides - must be imported AFTER Univer styles
import './univer-theme-overrides.css'

// Import locales
import DesignEnUS from '@univerjs/design/locale/en-US'
import UIEnUS from '@univerjs/ui/locale/en-US'
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US'
import SheetsEnUS from '@univerjs/sheets/locale/en-US'
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US'
import SheetsDrawingUIEnUS from '@univerjs/sheets-drawing-ui/locale/en-US'
import SheetsHyperLinkUIEnUS from '@univerjs/sheets-hyper-link-ui/locale/en-US'
import FindReplaceEnUS from '@univerjs/find-replace/locale/en-US'
import SheetsFindReplaceEnUS from '@univerjs/sheets-find-replace/locale/en-US'
import SheetsSortEnUS from '@univerjs/sheets-sort/locale/en-US'
import SheetsFilterUIEnUS from '@univerjs/sheets-filter-ui/locale/en-US'
import SheetsConditionalFormattingUIEnUS from '@univerjs/sheets-conditional-formatting-ui/locale/en-US'
import SheetsDataValidationUIEnUS from '@univerjs/sheets-data-validation-ui/locale/en-US'
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US'
import SheetsNumfmtUIEnUS from '@univerjs/sheets-numfmt-ui/locale/en-US'
import SheetsNoteUIEnUS from '@univerjs/sheets-note-ui/locale/en-US'
// Thread comment locales - DISABLED (requires Univer Server)
// import ThreadCommentUIEnUS from '@univerjs/thread-comment-ui/locale/en-US'
// import SheetsThreadCommentUIEnUS from '@univerjs/sheets-thread-comment-ui/locale/en-US'

// Thread comments are registered and provide "Add Comment" in context menu
// Comments work locally without server - stored in memory during session

export interface UniverSheetsInstance {
    univer: Univer
    api: FUniver
    version: number
}

let sheetsInstance: UniverSheetsInstance | null = null
let instanceVersion = 0
let currentWorkbookId: string | null = null

/**
 * Initialize the Sheets Univer instance
 */
export async function initSheetsUniver(container: HTMLElement): Promise<UniverSheetsInstance> {
    // Always create a fresh instance on mount to avoid DI conflicts and stale state
    // Reuse caused intermittent bugs when switching tabs rapidly
    
    // Increment version - any pending dispose with old version will be cancelled
    instanceVersion++
    const currentVersion = instanceVersion
    
    // Capture old instance for deferred disposal
    const oldInstance = sheetsInstance
    sheetsInstance = null
    
    // Defer dispose to next tick to avoid "synchronously unmount during render" error
    // This happens when React unmounts one component and mounts another in the same render cycle
    if (oldInstance) {
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                try {
                    oldInstance.univer.dispose()
                } catch (e) {
                    console.warn('[UniverSheets] Error disposing old instance:', e)
                }
                resolve()
            }, 0)
        })
    }

    // Clear container content
    container.innerHTML = ''
    
    // Deep merge locales
    const mergedLocale = merge(
        {},
        DesignEnUS,
        UIEnUS,
        DocsUIEnUS,
        SheetsEnUS,
        SheetsUIEnUS,
        SheetsDrawingUIEnUS,
        SheetsHyperLinkUIEnUS,
        FindReplaceEnUS,
        SheetsFindReplaceEnUS,
        SheetsSortEnUS,
        SheetsFilterUIEnUS,
        SheetsConditionalFormattingUIEnUS,
        SheetsDataValidationUIEnUS,
        SheetsFormulaUIEnUS,
        SheetsNumfmtUIEnUS,
        SheetsNoteUIEnUS,
        // Thread comment locales disabled - requires Univer Server
    )
    
    // Create theme based on current CSS variables and dark mode
    const isDark = isDarkModeActive()
    const customTheme = isDark ? createDarkTheme() : createCustomTheme()
    
    const univer = new Univer({
        theme: customTheme,
        darkMode: isDark,
        locale: LocaleType.EN_US,
        locales: {
            [LocaleType.EN_US]: mergedLocale
        },
        logLevel: LogLevel.WARN,
    })
    
    // Suppress non-critical DI errors during plugin initialization
    // These errors occur when plugins have optional dependencies that aren't available
    const originalConsoleError = console.error
    const originalConsoleWarn = console.warn
    const originalWindowError = window.onerror
    const originalUnhandledRejection = window.onunhandledrejection
    
    const suppressDIErrors = () => {
        // Suppress console.warn messages about duplicate identifiers
        // These occur when Univer plugins register identifiers multiple times (harmless)
        console.warn = (...args: any[]) => {
            const message = args[0]?.toString() || ''
            // Suppress "Identifier X already exists. Returning the cached identifier decorator."
            if (message.includes('already exists') && message.includes('Returning the cached identifier decorator')) {
                // Silently ignore - these are harmless DI identifier cache warnings
                return
            }
            originalConsoleWarn.apply(console, args)
        }
        
        // Suppress console.error DI messages
        console.error = (...args: any[]) => {
            const message = args[0]?.toString() || ''
            // Suppress DI dependency errors - they're non-critical and handled gracefully
            if (message.includes('Cannot find') && 
                (message.includes('registered by any injector') || 
                 message.includes('DependencyNotFoundForModuleError'))) {
                // Only log as warning, not error
                console.warn('[UniverSheets] DI dependency warning (non-critical):', ...args.slice(1))
                return
            }
            originalConsoleError.apply(console, args)
        }
        
        // Suppress uncaught errors related to DI
        window.onerror = (message, source, lineno, colno, error) => {
            const errorMessage = String(message)
            if (errorMessage.includes('Cannot find') && 
                (errorMessage.includes('registered by any injector') ||
                 errorMessage.includes('DependencyNotFoundForModuleError'))) {
                console.warn('[UniverSheets] Uncaught DI error (non-critical):', message)
                return true // Prevent default error handling
            }
            if (originalWindowError) {
                return originalWindowError(message, source, lineno, colno, error)
            }
            return false
        }
        
        // Suppress unhandled promise rejections related to DI
        window.onunhandledrejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason
            const errorMessage = reason?.message || String(reason)
            if (errorMessage.includes('Cannot find') && 
                (errorMessage.includes('registered by any injector') ||
                 errorMessage.includes('DependencyNotFoundForModuleError'))) {
                console.warn('[UniverSheets] Unhandled DI rejection (non-critical):', reason)
                event.preventDefault() // Prevent default error handling
                return
            }
            if (originalUnhandledRejection) {
                originalUnhandledRejection(event)
            }
        }
    }
    
    const restoreConsoleError = () => {
        console.error = originalConsoleError
        console.warn = originalConsoleWarn
        window.onerror = originalWindowError
        window.onunhandledrejection = originalUnhandledRejection
    }
    
    // Suppress errors during plugin registration and API creation
    suppressDIErrors()
    
    // Register plugins in order - Matching @univerjs/preset-sheets-core
    // This order is critical for correct input handling and initialization
    
    // 1. Docs plugins (Must be first for correct input handling in cells)
    univer.registerPlugin(UniverDocsPlugin, {
        hasScroll: false,
    })
    
    // 2. Render engine
    univer.registerPlugin(UniverRenderEnginePlugin)
    
    // 3. UI plugin with container
    univer.registerPlugin(UniverUIPlugin, {
        container,
        ribbonType: container.clientWidth >= 1200 ? 'classic' : 'default',
    })

    // 4. Docs UI
    univer.registerPlugin(UniverDocsUIPlugin)
    
    // 5. Formula Engine (before Sheets to ensure engine is ready)
    univer.registerPlugin(UniverFormulaEnginePlugin)

    // 6. Sheets core
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin)
    
    // 7. Sheets Numfmt
    univer.registerPlugin(UniverSheetsNumfmtPlugin)
    univer.registerPlugin(UniverSheetsNumfmtUIPlugin)
    
    // 8. Sheets Formula
    univer.registerPlugin(UniverSheetsFormulaPlugin)
    univer.registerPlugin(UniverSheetsFormulaUIPlugin)
    
    // 9. Additional plugins
    // Drawing plugins for image support
    univer.registerPlugin(UniverDrawingPlugin)
    univer.registerPlugin(UniverDrawingUIPlugin)
    univer.registerPlugin(UniverSheetsDrawingPlugin)
    univer.registerPlugin(UniverSheetsDrawingUIPlugin)
    
    // Hyperlink plugins
    univer.registerPlugin(UniverSheetsHyperLinkPlugin)
    univer.registerPlugin(UniverSheetsHyperLinkUIPlugin)
    
    // Find & Replace plugins
    univer.registerPlugin(UniverFindReplacePlugin)
    univer.registerPlugin(UniverSheetsFindReplacePlugin)
    
    // Sort plugin (headless - no UI, sorting is done via facade API)
    univer.registerPlugin(UniverSheetsSortPlugin)
    
    // Filter plugins (enables auto-filter dropdowns on columns)
    univer.registerPlugin(UniverSheetsFilterPlugin)
    univer.registerPlugin(UniverSheetsFilterUIPlugin)
    
    // Conditional Formatting plugins (color scales, data bars, icon sets)
    univer.registerPlugin(UniverSheetsConditionalFormattingPlugin)
    univer.registerPlugin(UniverSheetsConditionalFormattingUIPlugin)
    
    // Data Validation plugins (dropdowns, input validation rules)
    univer.registerPlugin(UniverSheetsDataValidationPlugin)
    univer.registerPlugin(UniverSheetsDataValidationUIPlugin)

    // Note plugins - Excel native-style notes (cell comments)
    // Register these last to ensure all dependencies are available
    // Some Note UI components may have optional dependencies that can fail
    try {
        univer.registerPlugin(UniverSheetsNotePlugin)
        univer.registerPlugin(UniverSheetsNoteUIPlugin)
    } catch (error) {
        console.warn('[UniverSheets] Failed to register Note plugins (non-critical):', error)
        // Continue without notes - they're optional features
    }

    // Thread Comment plugins - DISABLED
    // These require Univer Server infrastructure (IThreadCommentDataSourceService)
    // Without server, DI fails with: "Cannot find 'w15'/'z' registered by any injector"
    // univer.registerPlugin(UniverSheetsThreadCommentUIPlugin)
    
    // Create API with error handling for DI issues
    // Some plugins may have optional dependencies that fail during initialization
    let api: FUniver
    try {
        api = FUniver.newAPI(univer)
    } catch (error: any) {
        // If error is related to missing DI dependencies, log and try to continue
        // These are often non-critical optional dependencies
        const errorMessage = error?.message || String(error)
        if (errorMessage.includes('Cannot find') || 
            errorMessage.includes('registered by any injector') ||
            errorMessage.includes('DependencyNotFoundForModuleError')) {
            console.warn('[UniverSheets] DI error during API creation (non-critical):', errorMessage)
            // Try to get API anyway - it may have been partially created
            try {
                api = FUniver.newAPI(univer)
            } catch (retryError) {
                console.error('[UniverSheets] Failed to create API after DI error:', retryError)
                // Restore error handlers before throwing
                restoreConsoleError()
                throw retryError
            }
        } else {
            // Restore error handlers before throwing critical errors
            restoreConsoleError()
            throw error
        }
    }
    
    // Keep error suppression active for a short time after API creation
    // Some plugins initialize asynchronously and may trigger DI errors
    setTimeout(() => {
        restoreConsoleError()
    }, 1000) // Restore after 1 second to allow async plugin initialization

    // Ensure header/toolbar UI parts are visible (required for drawing/image buttons)
    try {
        api.setUIVisible(BuiltInUIPart.HEADER, true)
        api.setUIVisible(BuiltInUIPart.TOOLBAR, true)
    } catch (e) {
        console.warn('[UniverSheets] Failed to force toolbar visibility:', e)
    }

    // Responsive ribbon: classic >= 1200px, compact below
    try {
        const configService = univer.__getInjector().get(IConfigService)
        const updateRibbonType = () => {
            const ribbonType = container.clientWidth >= 1200 ? 'classic' : 'default'
            configService.setConfig(UI_PLUGIN_CONFIG_KEY, { ribbonType }, { merge: true })
        }
        updateRibbonType()
        const resizeObserver = new ResizeObserver(() => updateRibbonType())
        resizeObserver.observe(container)
        univer.onDispose(() => resizeObserver.disconnect())
    } catch (e) {
        console.warn('[UniverSheets] Failed to enable responsive ribbon:', e)
    }

    // Thread comments UI plugin adds "Add Comment" to context menu automatically
    
    // Dark mode is already set via darkMode option in constructor
    // But we also toggle via API for UI components
    if (isDark) {
        try {
            (api as any).toggleDarkMode(true)
        } catch (e) {
            // Ignore - API may not support this method
        }
    }
    
    sheetsInstance = { univer, api, version: currentVersion }

    return sheetsInstance
}

/**
 * Dispose the Sheets instance.
 * Pass a version to only dispose if it matches (for deferred cleanup).
 */
export function disposeSheetsUniver(version?: number): void {
    // If version provided, only dispose if it matches current instance
    if (version !== undefined && sheetsInstance?.version !== version) {
        return
    }

    if (sheetsInstance) {
        try {
            sheetsInstance.univer.dispose()
        } catch (e) {
            console.warn('[UniverSheets] Error during dispose:', e)
        }
        sheetsInstance = null
        currentWorkbookId = null
    }
}

/**
 * Get the current instance version (for deferred cleanup)
 */
export function getSheetsInstanceVersion(): number {
    return sheetsInstance?.version ?? -1
}

/**
 * Normalize workbook data to ensure it has required structures for all plugins
 * This prevents errors when plugins try to access data that might be undefined
 */
function normalizeWorkbookData(data: any, workbookId: string): any {
    const workbookData = data || {
        id: workbookId,
        name: 'Workbook',
        sheetOrder: ['sheet1'],
        sheets: {
            sheet1: {
                id: 'sheet1',
                name: 'Sheet1',
                rowCount: 100,
                columnCount: 26,
                cellData: {},
                defaultColumnWidth: 100,
                defaultRowHeight: 24,
            },
        },
    }
    
    // Ensure resources array exists
    if (!workbookData.resources) {
        workbookData.resources = []
    }
    
    // Ensure SHEET_DRAWING_PLUGIN resource exists with valid structure
    // This prevents "Cannot convert undefined or null to object" error in drawing UI
    const drawingResourceIndex = workbookData.resources.findIndex(
        (r: any) => r.name === 'SHEET_DRAWING_PLUGIN' || r.name?.includes('drawing')
    )
    
    if (drawingResourceIndex === -1) {
        // Add empty drawing resource
        workbookData.resources.push({
            name: 'SHEET_DRAWING_PLUGIN',
            data: JSON.stringify({}) // Empty object, not undefined
        })
    } else {
        // Ensure existing drawing resource has valid data
        const drawingResource = workbookData.resources[drawingResourceIndex]
        try {
            // Validate that data is a valid JSON object
            if (!drawingResource.data) {
                drawingResource.data = JSON.stringify({})
            } else {
                const parsed = JSON.parse(drawingResource.data)
                // Ensure it's an object (not null, not array)
                if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                    drawingResource.data = JSON.stringify({})
                }
            }
        } catch (e) {
            // If parsing fails, set to empty object
            console.warn('[UniverSheets] Invalid drawing resource data, resetting to empty object:', e)
            drawingResource.data = JSON.stringify({})
        }
    }
    
    return workbookData
}

/**
 * Create a new workbook with optional data
 * Uses univer.createUnit() as per official examples
 * Returns existing workbook if it matches the requested ID (avoids duplicates)
 */
export function createWorkbook(univer: Univer, api: FUniver, data?: any, id?: string): any {
    const workbookId = data?.id || id || `workbook-${Date.now()}`
    
    // If we already have a workbook with this ID, reuse it
    // This prevents duplicate workbooks during StrictMode double-mounting
    if (currentWorkbookId === workbookId) {
        const existingWorkbook = api.getActiveWorkbook()
        if (existingWorkbook) {
            return existingWorkbook
        }
    }

    // Normalize workbook data to ensure all required structures exist
    const workbookData = normalizeWorkbookData(data, workbookId)
    
    // Use createUnit instead of api.createWorkbook - this is the official way
    // Wrap in try-catch to handle DI errors gracefully
    try {
        univer.createUnit(UniverInstanceType.UNIVER_SHEET, workbookData)
    } catch (error: any) {
        // If error is related to missing dependencies, log and continue
        // Some plugins may have optional dependencies that fail during initialization
        if (error?.message?.includes('Cannot find') || error?.message?.includes('registered by any injector')) {
            console.warn('[UniverSheets] DI error during workbook creation (non-critical):', error.message)
            // Try to continue - the workbook may still be created
        } else {
            // Re-throw critical errors
            throw error
        }
    }
    
    // Get the workbook via API
    const workbook = api.getActiveWorkbook()
    
    // Track workbook ID to prevent duplicates
    currentWorkbookId = workbookId

    return workbook
}

/**
 * Get the current instance if exists
 */
export function getSheetsInstance(): UniverSheetsInstance | null {
    return sheetsInstance
}

/**
 * Update theme for the Sheets instance with full VSCode theme colors
 */
export function setSheetsTheme(isDark: boolean, themeColors?: VSCodeThemeColors | null): void {
    if (sheetsInstance) {
        try {
            // Create theme from VSCode colors if available, otherwise use defaults
            const nextTheme = themeColors
                ? createThemeFromVSCodeColors(themeColors, isDark)
                : isDark
                    ? createDarkTheme()
                    : createCustomTheme()

            const themeService = sheetsInstance.univer.__getInjector().get(ThemeService)
            themeService.setTheme(nextTheme)
            themeService.setDarkMode(isDark)
            ;(sheetsInstance.api as any).toggleDarkMode(isDark)
        } catch (e) {
            console.warn('[UniverSheets] Failed to update theme:', e)
        }
    }
}

// ============================================================================
// SPREADSHEET CONTEXT - For AI Agent access to current workbook data
// ============================================================================

export interface SheetInfo {
    id: string
    name: string
    rowCount: number
    columnCount: number
    /** First N rows of data as 2D array (for AI context) */
    preview: Array<Array<string | number | null>>
    /** Total cells with data */
    cellCount: number
}

export interface SpreadsheetContext {
    workbookId: string
    workbookName: string
    activeSheetId: string
    activeSheetName: string
    sheets: SheetInfo[]
    /** Current selection range in A1 notation */
    selection?: string
    /** Summary of all data for AI */
    summary: string
}

/**
 * Get comprehensive context about the current spreadsheet for AI agents.
 * Returns structured data that can be sent to the AI for context.
 *
 * @param maxPreviewRows - Maximum rows to include in sheet previews (default 20)
 * @param maxPreviewCols - Maximum columns to include in previews (default 10)
 */
export function getSpreadsheetContext(
    maxPreviewRows = 20,
    maxPreviewCols = 10
): SpreadsheetContext | null {
    if (!sheetsInstance?.api) {
        console.warn('[UniverSheets] getSpreadsheetContext: No active instance')
        return null
    }

    try {
        const workbook = sheetsInstance.api.getActiveWorkbook()
        if (!workbook) {
            console.warn('[UniverSheets] getSpreadsheetContext: No active workbook')
            return null
        }

        const workbookId = workbook.getId() || 'unknown'
        const workbookName = workbook.getName() || 'Untitled'
        const activeSheet = workbook.getActiveSheet()
        const activeSheetId = activeSheet?.getSheetId() || ''
        const activeSheetName = activeSheet?.getSheetName() || 'Sheet1'

        // Get all sheets info
        const allSheets = workbook.getSheets()
        const sheets: SheetInfo[] = []

        for (const sheet of allSheets) {
            const sheetId = sheet.getSheetId()
            const sheetName = sheet.getSheetName()

            // Get used range to determine actual data bounds
            let usedRange: { getLastRow: () => number; getLastColumn: () => number } | null = null
            try {
                usedRange = sheet.getUsedRange()
            } catch {
                // If getUsedRange fails, use a default range
                usedRange = null
            }

            let rowCount = 0
            let columnCount = 0
            let cellCount = 0
            const preview: Array<Array<string | number | null>> = []

            if (usedRange) {
                // Get the actual bounds of data
                const lastRow = usedRange.getLastRow()
                const lastCol = usedRange.getLastColumn()
                rowCount = lastRow + 1
                columnCount = lastCol + 1

                // Get preview data (first N rows and columns)
                const previewRows = Math.min(rowCount, maxPreviewRows)
                const previewCols = Math.min(columnCount, maxPreviewCols)

                if (previewRows > 0 && previewCols > 0) {
                    const previewRange = sheet.getRange(0, 0, previewRows, previewCols)
                    const values = previewRange.getValues() as Array<Array<unknown>>

                    for (const row of values) {
                        const cleanRow: Array<string | number | null> = []
                        for (const cell of row) {
                            if (cell === undefined || cell === '') {
                                cleanRow.push(null)
                            } else if (typeof cell === 'string' || typeof cell === 'number') {
                                cleanRow.push(cell)
                                cellCount++
                            } else {
                                cleanRow.push(String(cell))
                                cellCount++
                            }
                        }
                        preview.push(cleanRow)
                    }
                }
            }

            sheets.push({
                id: sheetId,
                name: sheetName,
                rowCount,
                columnCount,
                preview,
                cellCount,
            })
        }

        // Get current selection
        let selection: string | undefined
        try {
            const fSelection = activeSheet?.getSelection()
            const activeRange = fSelection?.getActiveRange()
            if (activeRange) {
                selection = activeRange.getA1Notation()
            }
        } catch {
            // Selection not available
        }

        // Build summary for AI
        const summaryParts: string[] = []
        summaryParts.push(`Workbook: "${workbookName}" with ${sheets.length} sheet(s)`)
        summaryParts.push(`Active sheet: "${activeSheetName}"`)

        for (const sheet of sheets) {
            if (sheet.cellCount > 0) {
                summaryParts.push(
                    `- "${sheet.name}": ${sheet.rowCount} rows × ${sheet.columnCount} cols (${sheet.cellCount} cells with data)`
                )

                // Add header row if available
                if (sheet.preview.length > 0) {
                    const headers = sheet.preview[0]
                        .filter((h) => h !== null)
                        .map((h) => String(h))
                    if (headers.length > 0) {
                        summaryParts.push(`  Headers: ${headers.join(', ')}`)
                    }
                }
            }
        }

        if (selection) {
            summaryParts.push(`Current selection: ${selection}`)
        }

        return {
            workbookId,
            workbookName,
            activeSheetId,
            activeSheetName,
            sheets,
            selection,
            summary: summaryParts.join('\n'),
        }
    } catch (err) {
        console.error('[UniverSheets] getSpreadsheetContext error:', err)
        return null
    }
}

/**
 * Get the data from a specific range as a formatted string for AI context.
 * Useful for getting data from user-selected ranges.
 *
 * @param rangeA1 - Range in A1 notation (e.g., "A1:D10" or "Sheet1!A1:D10")
 */
export function getRangeDataAsText(rangeA1: string): string | null {
    if (!sheetsInstance?.api) return null

    try {
        const workbook = sheetsInstance.api.getActiveWorkbook()
        if (!workbook) return null

        const activeSheet = workbook.getActiveSheet()
        if (!activeSheet) return null

        // Parse sheet name from range if present
        let sheetName: string | undefined
        let rangePart = rangeA1
        if (rangeA1.includes('!')) {
            const parts = rangeA1.split('!')
            sheetName = parts[0]
            rangePart = parts[1]
        }

        // Get the target sheet
        let targetSheet = activeSheet
        if (sheetName) {
            const sheets = workbook.getSheets()
            const found = sheets.find((s: { getSheetName: () => string }) => s.getSheetName() === sheetName)
            if (found) {
                targetSheet = found
            }
        }

        const range = targetSheet.getRange(rangePart)
        const values = range.getValues() as Array<Array<unknown>>

        // Format as tab-separated values
        const lines = values.map((row) =>
            row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))).join('\t')
        )

        return lines.join('\n')
    } catch (err) {
        console.error('[UniverSheets] getRangeDataAsText error:', err)
        return null
    }
}
