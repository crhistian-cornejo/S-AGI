/**
 * @s-agi/tools
 *
 * Unified tool definitions with provider-agnostic registry for S-AGI.
 * Inspired by Midday's architecture for maintainable, scalable tool management.
 *
 * @example
 * ```typescript
 * import { ToolRegistry, SPREADSHEET_TOOLS, DOCUMENT_TOOLS } from '@s-agi/tools'
 *
 * // Create registry and register tools
 * const registry = new ToolRegistry()
 * registry.registerFromObject(SPREADSHEET_TOOLS)
 * registry.registerFromObject(DOCUMENT_TOOLS)
 *
 * // Convert to provider-specific format
 * const aiSdkTools = registry.toAISDKTools()   // For AI SDK
 * const mcpTools = registry.toMCPTools()       // For Claude Agent SDK
 * const openaiTools = registry.toOpenAITools() // For OpenAI direct
 * ```
 */

// Core registry
export { ToolRegistry, createToolRegistry, createStandardToolRegistry } from './registry'

// Types
export type {
    ToolDefinition,
    ToolHandler,
    ToolExecutionContext,
    McpToolDefinition,
    OpenAIToolDefinition,
    RegisteredTool,
    ToolRegistryOptions
} from './types'

// Tool definitions
export {
    ALL_TOOLS,
    SPREADSHEET_TOOLS,
    DOCUMENT_TOOLS,
    IMAGE_TOOLS,
    CHART_TOOLS,
    UI_NAVIGATION_TOOLS,
    PLAN_TOOLS,
    CellValueSchema,
    type ToolName,
    type SpreadsheetToolName,
    type DocumentToolName,
    type ImageToolName,
    type ChartToolName,
    type UIToolName,
    type PlanToolName
} from './definitions'

// Converters
export {
    createAISDKTools,
    toAISDKTool,
    createMCPTools,
    toMCPTool,
    createMCPToolsWithPrefix,
    createOpenAITools,
    toOpenAITool,
    parseOpenAIToolCall
} from './converters'
