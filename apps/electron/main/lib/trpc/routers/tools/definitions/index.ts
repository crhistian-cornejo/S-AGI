/**
 * Tool Definitions Index
 * Aggregates all tool definitions and exports combined ALL_TOOLS
 */

export { SPREADSHEET_TOOLS, CellValueSchema, type SpreadsheetToolName } from './spreadsheet'
export { DOCUMENT_TOOLS, type DocumentToolName } from './document'
export { IMAGE_TOOLS, type ImageToolName } from './image'
export { CHART_TOOLS, type ChartToolName } from './chart'
export { UI_NAVIGATION_TOOLS, type UIToolName } from './ui'
export { PLAN_TOOLS, type PlanToolName } from './plan'

// Re-import for aggregation
import { SPREADSHEET_TOOLS } from './spreadsheet'
import { DOCUMENT_TOOLS } from './document'
import { IMAGE_TOOLS } from './image'
import { CHART_TOOLS } from './chart'
import { UI_NAVIGATION_TOOLS } from './ui'

/**
 * Combined tools object for API exposure
 * Includes all tool categories except PLAN_TOOLS (handled separately)
 */
export const ALL_TOOLS = {
    ...SPREADSHEET_TOOLS,
    ...DOCUMENT_TOOLS,
    ...IMAGE_TOOLS,
    ...CHART_TOOLS,
    ...UI_NAVIGATION_TOOLS
} as const

export type ToolName = keyof typeof ALL_TOOLS
