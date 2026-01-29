/**
 * Tool Registry
 * Unified tool registration with provider-agnostic conversions
 *
 * Inspired by Midday's architecture - single source of truth for tool definitions
 * with converters for AI SDK, MCP, and OpenAI formats.
 */

import type { z } from 'zod'
import type {
    ToolDefinition,
    ToolHandler,
    RegisteredTool,
    ToolRegistryOptions,
    ToolExecutionContext
} from './types'
import { createAISDKTools } from './converters/ai-sdk'
import { createMCPTools } from './converters/mcp'
import { createOpenAITools } from './converters/openai'

/**
 * ToolRegistry - Central registry for all tool definitions
 *
 * Usage:
 * ```typescript
 * const registry = new ToolRegistry()
 *
 * // Register from existing definitions
 * registry.registerFromObject(SPREADSHEET_TOOLS)
 * registry.registerFromObject(DOCUMENT_TOOLS)
 *
 * // Register with handler
 * registry.register('my_tool', myToolDefinition, myToolHandler)
 *
 * // Convert to provider format
 * const aiSdkTools = registry.toAISDKTools()
 * const mcpTools = registry.toMCPTools()
 * const openaiTools = registry.toOpenAITools()
 * ```
 */
export class ToolRegistry {
    private definitions: Map<string, ToolDefinition> = new Map()
    private handlers: Map<string, ToolHandler> = new Map()
    private options: ToolRegistryOptions

    constructor(options: ToolRegistryOptions = {}) {
        this.options = options
    }

    /**
     * Register a single tool
     */
    register<T extends z.ZodTypeAny>(
        name: string,
        definition: ToolDefinition<T>,
        handler?: ToolHandler<z.infer<T>>
    ): this {
        const fullName = this.options.namePrefix ? `${this.options.namePrefix}${name}` : name
        this.definitions.set(fullName, definition)
        if (handler) {
            this.handlers.set(fullName, handler as ToolHandler)
        }
        return this
    }

    /**
     * Register multiple tools from an object (like SPREADSHEET_TOOLS)
     */
    registerFromObject(
        tools: Record<string, ToolDefinition>,
        handlers?: Record<string, ToolHandler>
    ): this {
        for (const [name, definition] of Object.entries(tools)) {
            this.register(name, definition, handlers?.[name])
        }
        return this
    }

    /**
     * Set handler for an existing tool
     */
    setHandler(name: string, handler: ToolHandler): this {
        const fullName = this.options.namePrefix ? `${this.options.namePrefix}${name}` : name
        if (!this.definitions.has(fullName)) {
            throw new Error(`Tool "${fullName}" not registered`)
        }
        this.handlers.set(fullName, handler)
        return this
    }

    /**
     * Get a tool definition by name
     */
    get(name: string): RegisteredTool | undefined {
        const definition = this.definitions.get(name)
        if (!definition) return undefined
        return {
            name,
            definition,
            handler: this.handlers.get(name)
        }
    }

    /**
     * Check if a tool is registered
     */
    has(name: string): boolean {
        return this.definitions.has(name)
    }

    /**
     * Get all registered tool names
     */
    getNames(): string[] {
        return Array.from(this.definitions.keys())
    }

    /**
     * Get count of registered tools
     */
    get size(): number {
        return this.definitions.size
    }

    /**
     * Execute a tool by name
     */
    async execute<TResult = unknown>(
        name: string,
        args: unknown,
        context?: ToolExecutionContext
    ): Promise<TResult> {
        const handler = this.handlers.get(name)
        if (!handler) {
            throw new Error(`No handler registered for tool "${name}"`)
        }
        return handler(args, context) as Promise<TResult>
    }

    // ─────────────────────────────────────────────────────────────
    // Provider-specific conversions
    // ─────────────────────────────────────────────────────────────

    /**
     * Convert to AI SDK v5 tools format
     * Returns a ToolSet compatible with AI SDK's streamText/generateText
     */
    toAISDKTools() {
        return createAISDKTools(this.definitions, this.handlers)
    }

    /**
     * Convert to MCP (Model Context Protocol) format
     * Compatible with Claude Agent SDK and MCP servers
     */
    toMCPTools() {
        return createMCPTools(this.definitions)
    }

    /**
     * Convert to OpenAI function calling format
     * Compatible with OpenAI's Chat Completions API
     */
    toOpenAITools() {
        return createOpenAITools(this.definitions)
    }

    /**
     * Get definitions map (for custom conversions)
     */
    getDefinitions(): Map<string, ToolDefinition> {
        return new Map(this.definitions)
    }

    /**
     * Get handlers map (for custom conversions)
     */
    getHandlers(): Map<string, ToolHandler> {
        return new Map(this.handlers)
    }

    /**
     * Create a new registry with a subset of tools
     */
    subset(names: string[]): ToolRegistry {
        const newRegistry = new ToolRegistry(this.options)
        for (const name of names) {
            const def = this.definitions.get(name)
            const handler = this.handlers.get(name)
            if (def) {
                newRegistry.definitions.set(name, def)
                if (handler) {
                    newRegistry.handlers.set(name, handler)
                }
            }
        }
        return newRegistry
    }

    /**
     * Merge another registry into this one
     */
    merge(other: ToolRegistry): this {
        for (const [name, def] of other.definitions) {
            this.definitions.set(name, def)
        }
        for (const [name, handler] of other.handlers) {
            this.handlers.set(name, handler)
        }
        return this
    }
}

/**
 * Create a new tool registry
 */
export function createToolRegistry(options?: ToolRegistryOptions): ToolRegistry {
    return new ToolRegistry(options)
}

/**
 * Create a registry pre-populated with all standard tools
 */
export function createStandardToolRegistry(): ToolRegistry {
    const { ALL_TOOLS } = require('./definitions')
    return new ToolRegistry().registerFromObject(ALL_TOOLS)
}
