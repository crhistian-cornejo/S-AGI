/**
 * Univer Sheets core - dedicated instance for spreadsheets.
 * 
 * With conditional rendering, each tab mount creates a fresh instance
 * and unmount disposes it completely. No need for complex workbook switching logic.
 */

import { Univer, LocaleType, LogLevel, merge } from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import { defaultTheme } from '@univerjs/design'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt'
import { UniverUIPlugin } from '@univerjs/ui'

// Import facade extensions - ORDER MATTERS!
import '@univerjs/sheets/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/sheets-ui/facade'
import '@univerjs/docs-ui/facade'

// Import styles
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'

// Import locales
import DesignEnUS from '@univerjs/design/locale/en-US'
import UIEnUS from '@univerjs/ui/locale/en-US'
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US'
import SheetsEnUS from '@univerjs/sheets/locale/en-US'
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US'

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
    )
    
    const univer = new Univer({
        theme: defaultTheme,
        locale: LocaleType.EN_US,
        locales: {
            [LocaleType.EN_US]: mergedLocale
        },
        logLevel: LogLevel.WARN,
    })
    
    // Register plugins in order
    univer.registerPlugin(UniverRenderEnginePlugin)
    univer.registerPlugin(UniverFormulaEnginePlugin)
    
    univer.registerPlugin(UniverUIPlugin, {
        container,
    })
    
    // Docs plugins for cell editing
    univer.registerPlugin(UniverDocsPlugin)
    univer.registerPlugin(UniverDocsUIPlugin)
    
    // Sheets plugins
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin)
    univer.registerPlugin(UniverSheetsFormulaPlugin)
    univer.registerPlugin(UniverSheetsNumfmtPlugin)
    
    const api = FUniver.newAPI(univer)
    
    // Apply initial dark mode based on document class
    const isDark = document.documentElement.classList.contains('dark')
    if (isDark) {
        try {
            (api as any).toggleDarkMode(true)
        } catch (e) {
            // Ignore
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
 */
export function createWorkbook(api: FUniver, data?: any, id?: string): any {
    const workbookId = data?.id || id || `workbook-${Date.now()}`
    const extendedApi = api as any
    
    console.log('[UniverSheets] createWorkbook:', {
        hasData: !!data,
        dataId: data?.id,
        workbookId,
        sheetsKeys: data?.sheets ? Object.keys(data.sheets) : [],
    })
    
    let workbook: any
    
    if (data) {
        console.log('[UniverSheets] Creating workbook with provided data')
        workbook = extendedApi.createWorkbook(data)
    } else {
        console.log('[UniverSheets] Creating empty workbook')
        workbook = extendedApi.createWorkbook({
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
        })
    }
    
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
