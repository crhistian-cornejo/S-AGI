/**
 * Tools Module Index
 *
 * This module re-exports from the legacy tools.ts file and the new
 * modular definitions. The goal is to provide a clean import path
 * while maintaining backward compatibility.
 *
 * Migration Status:
 * - [x] definitions/ - Tool schemas extracted to separate files
 * - [ ] executors/ - Still in legacy tools.ts (TODO)
 * - [x] helpers.ts - Common utilities extracted
 *
 * Import from this module for new code:
 *   import { toolsRouter, ALL_TOOLS } from './tools'
 *
 * The definitions can also be imported directly:
 *   import { SPREADSHEET_TOOLS } from './tools/definitions'
 */

// Re-export definitions from new modular structure
export {
    SPREADSHEET_TOOLS,
    DOCUMENT_TOOLS,
    IMAGE_TOOLS,
    CHART_TOOLS,
    UI_NAVIGATION_TOOLS,
    PLAN_TOOLS,
    ALL_TOOLS,
    CellValueSchema,
    type SpreadsheetToolName,
    type DocumentToolName,
    type ImageToolName,
    type ChartToolName,
    type UIToolName,
    type PlanToolName,
    type ToolName
} from './definitions'

// Re-export helpers
export {
    type ToolContext,
    notifyArtifactUpdate,
    getArtifactWithOwnership,
    createUniverWorkbook,
    parseCellReference,
    createUniverDocument,
    getHorizontalAlign,
    getVerticalAlign,
    getBorderStyle,
    columnToLetter,
    supabase
} from './helpers'

// Re-export router, executor, and utilities from legacy file
// These will be migrated to this module in future refactors
export {
    toolsRouter,
    executeTool,
    getToolsForAPI,
    generateImageDirect
} from '../tools'
