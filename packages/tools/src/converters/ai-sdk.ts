/**
 * AI SDK Converter
 * Converts tool definitions to AI SDK v5 format
 */

import { tool } from 'ai'
import type { ToolDefinition, ToolHandler } from '../types'

/**
 * Convert tool definitions to AI SDK ToolSet format
 *
 * This creates tools compatible with AI SDK's streamText and generateText:
 * ```typescript
 * const tools = createAISDKTools(definitions, handlers)
 * await streamText({ model, tools, ... })
 * ```
 */
export function createAISDKTools(
    definitions: Map<string, ToolDefinition>,
    handlers: Map<string, ToolHandler>
): Record<string, ReturnType<typeof tool>> {
    const tools: Record<string, ReturnType<typeof tool>> = {}

    for (const [name, def] of definitions) {
        const handler = handlers.get(name)

        const baseConfig = {
            description: def.description,
            parameters: def.inputSchema,
        }
        const config = handler
            ? {
                ...baseConfig,
                execute: async (args: unknown) => handler(args as any),
            }
            : baseConfig
        tools[name] = tool(config as any) as ReturnType<typeof tool>
    }

    return tools
}

/**
 * Convert a single tool definition to AI SDK format
 */
export function toAISDKTool(
    name: string,
    definition: ToolDefinition,
    handler?: ToolHandler
): { name: string; tool: ReturnType<typeof tool> } {
    const config = handler
        ? {
            description: definition.description,
            parameters: definition.inputSchema,
            execute: async (args: unknown) => handler(args as any),
        }
        : {
            description: definition.description,
            parameters: definition.inputSchema,
        }
    return {
        name,
        tool: tool(config as any) as ReturnType<typeof tool>
    }
}
