/**
 * Univer Docs core - dedicated instance for documents.
 * 
 * With conditional rendering, each tab mount creates a fresh instance
 * and unmount disposes it completely. No need for complex document switching logic.
 */

import { Univer, LocaleType, LogLevel, merge } from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import { defaultTheme } from '@univerjs/design'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverUIPlugin } from '@univerjs/ui'

// Import facade extensions
import '@univerjs/docs-ui/facade'

// Import styles (shared, but safe to import multiple times)
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'

// Import locales
import DesignEnUS from '@univerjs/design/locale/en-US'
import UIEnUS from '@univerjs/ui/locale/en-US'
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US'

export interface UniverDocsInstance {
    univer: Univer
    api: FUniver
    version: number
}

let docsInstance: UniverDocsInstance | null = null
let instanceVersion = 0

/**
 * Initialize the Docs Univer instance
 */
export async function initDocsUniver(container: HTMLElement): Promise<UniverDocsInstance> {
    // Increment version - any pending dispose with old version will be cancelled
    instanceVersion++
    const currentVersion = instanceVersion
    
    // Dispose any existing instance synchronously
    if (docsInstance) {
        console.log('[UniverDocs] Disposing existing instance before creating new one')
        try {
            docsInstance.univer.dispose()
        } catch (e) {
            console.warn('[UniverDocs] Error disposing old instance:', e)
        }
        docsInstance = null
    }
    
    // Clear container content
    container.innerHTML = ''
    
    console.log('[UniverDocs] Creating new instance (version:', currentVersion, ')')
    
    // Deep merge locales
    const mergedLocale = merge(
        {},
        DesignEnUS,
        UIEnUS,
        DocsUIEnUS,
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
    
    // Main UI plugin
    univer.registerPlugin(UniverUIPlugin, {
        container,
    })
    
    // Docs plugins
    univer.registerPlugin(UniverDocsPlugin)
    univer.registerPlugin(UniverDocsUIPlugin, {
        layout: {
            docContainerConfig: {
                innerLeft: true,
            },
        },
    })
    
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
    
    docsInstance = { univer, api, version: currentVersion }
    console.log('[UniverDocs] Instance created successfully (version:', currentVersion, ')')
    
    return docsInstance
}

/**
 * Dispose the Docs instance.
 * Pass a version to only dispose if it matches (for deferred cleanup).
 */
export function disposeDocsUniver(version?: number): void {
    // If version provided, only dispose if it matches current instance
    if (version !== undefined && docsInstance?.version !== version) {
        console.log('[UniverDocs] Skipping dispose - version mismatch (requested:', version, ', current:', docsInstance?.version, ')')
        return
    }
    
    if (docsInstance) {
        console.log('[UniverDocs] Disposing instance (version:', docsInstance.version, ')')
        try {
            docsInstance.univer.dispose()
        } catch (e) {
            console.warn('[UniverDocs] Error during dispose:', e)
        }
        docsInstance = null
    }
}

/**
 * Get the current instance version (for deferred cleanup)
 */
export function getDocsInstanceVersion(): number {
    return docsInstance?.version ?? -1
}

/**
 * Create a new document with optional data
 */
export function createDocument(api: FUniver, data?: any, id?: string): any {
    const docId = data?.id || id || `doc-${Date.now()}`
    const extendedApi = api as any
    
    console.log('[UniverDocs] createDocument:', {
        hasData: !!data,
        dataId: data?.id,
        docId,
        bodyLength: data?.body?.dataStream?.length,
    })
    
    let doc: any
    
    if (data) {
        console.log('[UniverDocs] Creating doc with provided data')
        // Ensure the doc is created in Page mode
        const docData = {
            ...data,
            renderConfig: {
                ...(data.renderConfig || {}),
                pageRenderMode: 1
            }
        }
        doc = extendedApi.createUniverDoc(docData)
    } else {
        console.log('[UniverDocs] Creating empty doc')
        doc = extendedApi.createUniverDoc({
            id: docId,
            title: 'Untitled Document',
            body: {
                dataStream: '\r\n',
                textRuns: [],
                paragraphs: [
                    {
                        startIndex: 0,
                        paragraphStyle: {}
                    }
                ]
            },
            documentStyle: {
                pageSize: {
                    width: 595,   // A4 width in points (210mm)
                    height: 842   // A4 height in points (297mm)
                },
                marginTop: 72,    // ~1 inch (25.4mm)
                marginBottom: 72,
                marginLeft: 72,
                marginRight: 72
            },
            renderConfig: {
                pageRenderMode: 1 // 1 = PAGE mode
            }
        })
    }
    
    console.log('[UniverDocs] Document created with ID:', doc?.getId?.() || docId)
    
    return doc
}

/**
 * Get the current instance if exists
 */
export function getDocsInstance(): UniverDocsInstance | null {
    return docsInstance
}

/**
 * Toggle dark mode for the Docs instance
 */
export function setDocsTheme(isDark: boolean): void {
    if (docsInstance?.api) {
        try {
            (docsInstance.api as any).toggleDarkMode(isDark)
            console.log('[UniverDocs] Dark mode toggled:', isDark)
        } catch (e) {
            console.warn('[UniverDocs] Failed to toggle dark mode:', e)
        }
    }
}
