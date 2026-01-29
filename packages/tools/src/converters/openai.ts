/**
 * OpenAI Converter
 * Converts tool definitions to OpenAI function calling format
 */

import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ToolDefinition, OpenAIToolDefinition } from '../types'

/**
 * Convert tool definitions to OpenAI function calling format
 *
 * Compatible with OpenAI's Chat Completions API:
 * ```typescript
 * const tools = createOpenAITools(definitions)
 * await openai.chat.completions.create({ model, tools, ... })
 * ```
 */
export function createOpenAITools(
    definitions: Map<string, ToolDefinition>
): OpenAIToolDefinition[] {
    const tools: OpenAIToolDefinition[] = []

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
            type: 'function',
            function: {
                name,
                description: def.description,
                parameters: {
                    type: 'object',
                    properties: schemaObj.properties || {},
                    required: schemaObj.required
                }
            }
        })
    }

    return tools
}

/**
 * Convert a single tool definition to OpenAI format
 */
export function toOpenAITool(
    name: string,
    definition: ToolDefinition
): OpenAIToolDefinition {
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
        type: 'function',
        function: {
            name,
            description: definition.description,
            parameters: {
                type: 'object',
                properties: schemaObj.properties || {},
                required: schemaObj.required
            }
        }
    }
}

/**
 * Convert OpenAI tool call response to standard format
 */
export function parseOpenAIToolCall(toolCall: {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}): { id: string; name: string; args: unknown } {
    return {
        id: toolCall.id,
        name: toolCall.function.name,
        args: JSON.parse(toolCall.function.arguments)
    }
}
