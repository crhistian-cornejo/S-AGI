/**
 * Tool Definitions Index
 * Re-exports from @s-agi/tools package for backwards compatibility
 *
 * NOTE: All tool definitions are now maintained in packages/tools/
 * This file provides seamless backwards compatibility for existing imports.
 */

// Re-export everything from @s-agi/tools/definitions
export {
    // Spreadsheet tools
    SPREADSHEET_TOOLS,
    CellValueSchema,
    type SpreadsheetToolName,
    // Document tools
    DOCUMENT_TOOLS,
    type DocumentToolName,
    // Image tools
    IMAGE_TOOLS,
    type ImageToolName,
    // Chart tools
    CHART_TOOLS,
    type ChartToolName,
    // UI tools
    UI_NAVIGATION_TOOLS,
    type UIToolName,
    // Plan tools
    PLAN_TOOLS,
    type PlanToolName,
    // Combined tools
    ALL_TOOLS,
    type ToolName
} from '@s-agi/tools/definitions'
