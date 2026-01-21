/**
 * Univer Sheets core - dedicated instance for spreadsheets.
 * 
 * With conditional rendering, each tab mount creates a fresh instance
 * and unmount disposes it completely. No need for complex workbook switching logic.
 */

import { Univer, LocaleType, LogLevel, merge, UniverInstanceType, ThemeService } from '@univerjs/core'
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
import { UniverUIPlugin } from '@univerjs/ui'

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
import SheetsNumfmtUIEnUS from '@univerjs/sheets-numfmt-ui/locale/en-US'

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
        console.log('[UniverSheets] Scheduling deferred dispose of old instance before creating new one')
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                try {
                    console.log('[UniverSheets] Executing deferred dispose')
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
    
    console.log('[UniverSheets] Creating new instance (version:', currentVersion, ')')
    
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
        SheetsNumfmtUIEnUS,
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
    
    const api = FUniver.newAPI(univer)
    
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
    console.log('[UniverSheets] Instance created successfully (version:', currentVersion, ')')
    
    return sheetsInstance
}

/**
 * Dispose the Sheets instance.
 * Pass a version to only dispose if it matches (for deferred cleanup).
 */
export function disposeSheetsUniver(version?: number): void {
    // If version provided, only dispose if it matches current instance
    if (version !== undefined && sheetsInstance?.version !== version) {
        console.log('[UniverSheets] Skipping dispose - version mismatch (requested:', version, ', current:', sheetsInstance?.version, ')')
        return
    }
    
    if (sheetsInstance) {
        console.log('[UniverSheets] Disposing instance (version:', sheetsInstance.version, ')')
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
            console.log('[UniverSheets] Reusing existing workbook with same ID:', workbookId)
            return existingWorkbook
        }
    }
    
    console.log('[UniverSheets] createWorkbook:', {
        hasData: !!data,
        dataId: data?.id,
        workbookId,
        sheetsKeys: data?.sheets ? Object.keys(data.sheets) : [],
    })
    
    // Build workbook data
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
    
    // Use createUnit instead of api.createWorkbook - this is the official way
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, workbookData)
    
    // Get the workbook via API
    const workbook = api.getActiveWorkbook()
    
    // Track workbook ID to prevent duplicates
    currentWorkbookId = workbookId

    console.log('[UniverSheets] Workbook created with ID:', workbook?.getId?.() || workbookId)
    
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

            console.log('[UniverSheets] Theme updated:', {
                isDark,
                hasVSCodeColors: !!themeColors,
                primary: nextTheme.primary?.[500],
                background: nextTheme.white,
                foreground: nextTheme.black,
            })
        } catch (e) {
            console.warn('[UniverSheets] Failed to update theme:', e)
        }
    }
}
