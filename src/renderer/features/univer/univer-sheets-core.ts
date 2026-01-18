/**
 * Univer Sheets core - dedicated instance for spreadsheets.
 * 
 * With conditional rendering, each tab mount creates a fresh instance
 * and unmount disposes it completely. No need for complex workbook switching logic.
 */

import { Univer, LocaleType, LogLevel, merge, UniverInstanceType } from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import { UniverDocsPlugin } from '@univerjs/docs'
import { createCustomTheme, createDarkTheme, isDarkModeActive } from './univer-theme'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt'
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

// Import facade extensions - ORDER MATTERS!
// These extend the FUniver API with methods for each plugin
import '@univerjs/ui/facade'
import '@univerjs/engine-formula/facade'
import '@univerjs/sheets/facade'
import '@univerjs/sheets-ui/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/docs-ui/facade'
import '@univerjs/sheets-hyper-link-ui/facade'
import '@univerjs/sheets-find-replace/facade'

// Import styles
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'
import '@univerjs/drawing-ui/lib/index.css'
import '@univerjs/sheets-drawing-ui/lib/index.css'
import '@univerjs/sheets-hyper-link-ui/lib/index.css'
import '@univerjs/find-replace/lib/index.css'

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

export interface UniverSheetsInstance {
    univer: Univer
    api: FUniver
    version: number
}

let sheetsInstance: UniverSheetsInstance | null = null
let instanceVersion = 0

/**
 * Initialize the Sheets Univer instance
 */
export async function initSheetsUniver(container: HTMLElement): Promise<UniverSheetsInstance> {
    // Increment version - any pending dispose with old version will be cancelled
    instanceVersion++
    const currentVersion = instanceVersion
    
    // Dispose any existing instance synchronously (safe here because we're not in React render)
    if (sheetsInstance) {
        console.log('[UniverSheets] Disposing existing instance before creating new one')
        try {
            sheetsInstance.univer.dispose()
        } catch (e) {
            console.warn('[UniverSheets] Error disposing old instance:', e)
        }
        sheetsInstance = null
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
    
    // Register plugins in order - Following Teable's working configuration
    // https://github.com/teableio/teable/blob/develop/plugins/src/app/sheet-form-view/components/sheet/UniverSheet.tsx
    
    // 1. Render engine first
    univer.registerPlugin(UniverRenderEnginePlugin)
    
    // 2. UI plugin with container
    univer.registerPlugin(UniverUIPlugin, {
        container,
    })
    
    // 3. Docs plugins (required for cell editing)
    univer.registerPlugin(UniverDocsPlugin, {
        hasScroll: false,
    })
    univer.registerPlugin(UniverDocsUIPlugin)
    
    // 4. Sheets core
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin)
    
    // 5. Formula plugins (after sheets)
    univer.registerPlugin(UniverFormulaEnginePlugin)
    univer.registerPlugin(UniverSheetsFormulaPlugin)
    
    // 6. Additional plugins
    univer.registerPlugin(UniverSheetsNumfmtPlugin)
    
    // 7. Drawing plugins for image support
    univer.registerPlugin(UniverDrawingPlugin)
    univer.registerPlugin(UniverDrawingUIPlugin)
    univer.registerPlugin(UniverSheetsDrawingPlugin)
    univer.registerPlugin(UniverSheetsDrawingUIPlugin)
    
    // 8. Hyperlink plugins
    univer.registerPlugin(UniverSheetsHyperLinkPlugin)
    univer.registerPlugin(UniverSheetsHyperLinkUIPlugin)
    
    // 9. Find & Replace plugins
    univer.registerPlugin(UniverFindReplacePlugin)
    univer.registerPlugin(UniverSheetsFindReplacePlugin)
    
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
 */
export function createWorkbook(univer: Univer, api: FUniver, data?: any, id?: string): any {
    const workbookId = data?.id || id || `workbook-${Date.now()}`
    
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
 * Toggle dark mode for the Sheets instance
 */
export function setSheetsTheme(isDark: boolean): void {
    if (sheetsInstance?.api) {
        try {
            (sheetsInstance.api as any).toggleDarkMode(isDark)
            console.log('[UniverSheets] Dark mode toggled:', isDark)
        } catch (e) {
            console.warn('[UniverSheets] Failed to toggle dark mode:', e)
        }
    }
}
