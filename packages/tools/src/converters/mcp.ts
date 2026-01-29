/**
 * MCP Converter
 * Converts tool definitions to Model Context Protocol format
 */

import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ToolDefinition, McpToolDefinition } from '../types'

/**
 * Convert tool definitions to MCP format
 *
 * MCP tools are used by Claude Agent SDK and MCP servers.
 * The format matches the MCP tool specification.
 */
export function createMCPTools(
    definitions: Map<string, ToolDefinition>
): McpToolDefinition[] {
    const tools: McpToolDefinition[] = []

    for (const [name, def] of definitions) {
        const jsonSchema = zodToJsonSchema(def.inputSchema, {
            name: name,
            $refStrategy: 'none'
        })

        // Extract properties from the JSON schema
        const schemaObj = jsonSchema as {
            type?: string
            properties?: Record<string, unknown>
            required?: string[]
        }

        tools.push({
            name,
            description: def.description,
            inputSchema: {
                type: 'object',
                properties: schemaObj.properties || {},
                required: schemaObj.required
            }
        })
    }

    return tools
}

/**
 * Convert a single tool definition to MCP format
 */
export function toMCPTool(
    name: string,
    definition: ToolDefinition
): McpToolDefinition {
    const jsonSchema = zodToJsonSchema(definition.inputSchema, {
        name: name,
        $refStrategy: 'none'
    })

    const schemaObj = jsonSchema as {
        type?: string
        properties?: Record<string, unknown>
        required?: string[]
    }

    return {
        name,
        description: definition.description,
        inputSchema: {
            type: 'object',
            properties: schemaObj.properties || {},
            required: schemaObj.required
        }
    }
}

/**
 * Create MCP tools with a name prefix
 * Useful for namespacing tools (e.g., "mcp__myserver__toolname")
 */
export function createMCPToolsWithPrefix(
    definitions: Map<string, ToolDefinition>,
    prefix: string
): McpToolDefinition[] {
    const tools: McpToolDefinition[] = []

    for (const [name, def] of definitions) {
        const jsonSchema = zodToJsonSchema(def.inputSchema, {
            name: name,
            $refStrategy: 'none'
        })

        const schemaObj = jsonSchema as {
            type?: string
            properties?: Record<string, unknown>
            required?: string[]
        }

        tools.push({
            name: `${prefix}${name}`,
            description: def.description,
            inputSchema: {
                type: 'object',
                properties: schemaObj.properties || {},
                required: schemaObj.required
            }
        })
    }

    return tools
}
