import { tool, type ToolSet } from 'ai'
import log from 'electron-log'
import { z } from 'zod'
import {
    SPREADSHEET_TOOLS,
    DOCUMENT_TOOLS,
    IMAGE_TOOLS,
    CHART_TOOLS,
    PLAN_TOOLS,
    executeTool,
    type ToolContext,
} from '../trpc/routers/tools'
import type { AIProvider } from '@s-agi/core/types/ai'
import { canUseImageTools, getModelCapabilities, groqSupportsBrowserSearch } from './capabilities'
import { getClaudeProvider, getGroqProvider } from './providers'
import {
    MINIMAL_SPREADSHEET_TOOLS,
    MINIMAL_DOCUMENT_TOOLS,
    MINIMAL_CHART_TOOLS,
} from '../trpc/routers/ai/constants'
import {
    DEFAULT_WORKING_MEMORY_SCOPE,
    getWorkingMemoryProvider,
} from '../shared/working-memory'

const UPDATE_WORKING_MEMORY_TOOL_NAME = 'updateWorkingMemory'
const UPDATE_WORKING_MEMORY_SCHEMA = z.object({
    content: z
        .string()
        .min(1)
        .max(12000)
        .describe(
            'Updated working memory in markdown. Include stable user facts and preferences worth remembering.'
        ),
})

/**
 * Convert a Zod-based tool definition into an AI SDK v6 tool.
 */
function adaptTool(
    name: string,
    def: { description: string; inputSchema: any },
    chatId: string,
    userId: string,
    context?: ToolContext,
) {
    return tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (args: any) => {
            log.info(`[AI SDK Tools] Executing: ${name}`)
            return executeTool(name, args, chatId, userId, context)
        },
    })
}

/**
 * Options for building an AI SDK ToolSet.
 */
export interface ToolSetOptions {
    chatId: string
    userId: string
    provider: AIProvider
    modelId: string
    activeTab?: string
    hasImages?: boolean
    mode?: 'normal' | 'plan' | 'minimal'
    toolContext?: ToolContext
    /** Enable native web search tools (Anthropic webSearch, Groq browserSearch) */
    webSearchEnabled?: boolean
}

/**
 * Build an AI SDK v6 ToolSet from existing tool definitions.
 * Applies context-aware filtering based on active tab, provider, and mode.
 */
export function buildAISDKToolSet(options: ToolSetOptions): ToolSet {
    const { chatId, userId, provider, activeTab, hasImages, mode, toolContext, webSearchEnabled } = options
    const tools: ToolSet = {}

    // Plan mode: only plan tools
    if (mode === 'plan') {
        for (const [name, def] of Object.entries(PLAN_TOOLS)) {
            tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
        return tools
    }

    // Minimal mode (for image processing): only creation tools
    if (mode === 'minimal' || hasImages) {
        for (const name of MINIMAL_SPREADSHEET_TOOLS) {
            const def = SPREADSHEET_TOOLS[name]
            if (def) tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
        for (const name of MINIMAL_DOCUMENT_TOOLS) {
            const def = DOCUMENT_TOOLS[name]
            if (def) tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
        for (const name of MINIMAL_CHART_TOOLS) {
            const def = CHART_TOOLS[name]
            if (def) tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
        // Still include image tools in minimal mode
        if (canUseImageTools(provider, "")) {
            for (const [name, def] of Object.entries(IMAGE_TOOLS)) {
                tools[name] = adaptTool(name, def, chatId, userId, toolContext)
            }
        }
        if (userId) {
            addWorkingMemoryTool(tools, chatId, userId)
        }
        return tools
    }

    // Normal mode: context-aware tool selection based on active tab
    const includeAllSpreadsheet = activeTab === 'excel'
    const includeAllDocument = activeTab === 'doc'

    // Spreadsheet tools
    if (includeAllSpreadsheet) {
        for (const [name, def] of Object.entries(SPREADSHEET_TOOLS)) {
            tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
    } else {
        for (const name of MINIMAL_SPREADSHEET_TOOLS) {
            const def = SPREADSHEET_TOOLS[name]
            if (def) tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
    }

    // Document tools
    if (includeAllDocument) {
        for (const [name, def] of Object.entries(DOCUMENT_TOOLS)) {
            tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
    } else {
        for (const name of MINIMAL_DOCUMENT_TOOLS) {
            const def = DOCUMENT_TOOLS[name]
            if (def) tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
    }

    // Image tools - only for providers with OpenAI Images API access
    if (canUseImageTools(provider, "")) {
        for (const [name, def] of Object.entries(IMAGE_TOOLS)) {
            tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
    }

    // Chart tools
    if (includeAllSpreadsheet) {
        for (const [name, def] of Object.entries(CHART_TOOLS)) {
            tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
    } else {
        for (const name of MINIMAL_CHART_TOOLS) {
            const def = CHART_TOOLS[name]
            if (def) tools[name] = adaptTool(name, def, chatId, userId, toolContext)
        }
    }

    // Native web search tools (provider-specific)
    if (webSearchEnabled) {
        addNativeWebSearchTools(tools, provider, options.modelId)
    }

    if (userId) {
        addWorkingMemoryTool(tools, chatId, userId)
    }

    return tools
}

/**
 * Add provider-native web search tools to the ToolSet.
 * - Anthropic: webSearch_20250305 (server-side web search)
 * - Groq: browserSearch (for gpt-oss models)
 */
function addNativeWebSearchTools(tools: ToolSet, provider: AIProvider, modelId: string): void {
    const caps = getModelCapabilities(provider, modelId)
    if (!caps.supportsNativeWebSearch) return

    try {
        if (provider === 'claude') {
            const anthropic = getClaudeProvider()
            tools['web_search'] = anthropic.tools.webSearch_20250305({
                maxUses: 5,
            })
            log.info('[AI SDK Tools] Added Anthropic native webSearch tool')
        }

        if (provider === 'groq' && groqSupportsBrowserSearch(modelId)) {
            const groq = getGroqProvider()
            tools['browser_search'] = (groq as any).tools.browserSearch({})
            log.info('[AI SDK Tools] Added Groq native browserSearch tool')
        }
    } catch (err) {
        log.warn(`[AI SDK Tools] Failed to add native web search for ${provider}:`, err)
    }
}

function addWorkingMemoryTool(tools: ToolSet, chatId: string, userId: string): void {
    const workingMemoryProvider = getWorkingMemoryProvider()
    tools[UPDATE_WORKING_MEMORY_TOOL_NAME] = tool({
        description:
            'Save user preferences and durable facts to persistent working memory for future conversations.',
        inputSchema: UPDATE_WORKING_MEMORY_SCHEMA,
        execute: async ({ content }) => {
            try {
                await workingMemoryProvider.updateWorkingMemory({
                    chatId,
                    userId,
                    scope: DEFAULT_WORKING_MEMORY_SCOPE,
                    content,
                })

                return {
                    success: true,
                    scope: DEFAULT_WORKING_MEMORY_SCOPE,
                    storedCharacters: content.length,
                }
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Failed to update working memory'
                return {
                    success: false,
                    error: message,
                }
            }
        },
    })
}
