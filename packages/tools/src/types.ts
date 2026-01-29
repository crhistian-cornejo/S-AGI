/**
 * Tool Types
 * Core types for the tool registry and converters
 */

import type { z } from 'zod'

/**
 * Tool definition with Zod schema
 */
export interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
    description: string
    inputSchema: T
}

/**
 * Tool handler function type
 */
export type ToolHandler<TInput = unknown, TResult = unknown> = (
    args: TInput,
    context?: ToolExecutionContext
) => Promise<TResult> | TResult

/**
 * Context passed to tool handlers during execution
 */
export interface ToolExecutionContext {
    userId?: string
    artifactId?: string
    fileId?: string
    sessionId?: string
    [key: string]: unknown
}

/**
 * MCP (Model Context Protocol) tool format
 */
export interface McpToolDefinition {
    name: string
    description: string
    inputSchema: {
        type: 'object'
        properties: Record<string, unknown>
        required?: string[]
    }
}

/**
 * OpenAI tool format (for function calling)
 */
export interface OpenAIToolDefinition {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: {
            type: 'object'
            properties: Record<string, unknown>
            required?: string[]
        }
    }
}

/**
 * Registered tool with definition and optional handler
 */
export interface RegisteredTool {
    name: string
    definition: ToolDefinition
    handler?: ToolHandler
}

/**
 * Tool registry options
 */
export interface ToolRegistryOptions {
    /** Prefix for tool names (e.g., "mcp__myserver__") */
    namePrefix?: string
}
