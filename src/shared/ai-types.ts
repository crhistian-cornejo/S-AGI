import { z } from 'zod'

// ============================================================================
// AI Provider & Model Definitions
// ============================================================================

export type AIProvider = 'openai'

/** Reasoning effort levels for GPT-5 and o-series models */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export interface ModelDefinition {
    id: string
    provider: AIProvider
    name: string
    description?: string
    contextWindow?: number
    supportsImages?: boolean
    supportsTools?: boolean
    /** Whether the model supports OpenAI's native web search via Responses API */
    supportsNativeWebSearch?: boolean
    /** Whether the model supports code interpreter */
    supportsCodeInterpreter?: boolean
    /** Whether the model supports file search */
    supportsFileSearch?: boolean
    /** Whether the model supports reasoning/thinking with configurable effort */
    supportsReasoning?: boolean
    /** Default reasoning effort for this model */
    defaultReasoningEffort?: ReasoningEffort
}

/**
 * All available AI models with metadata
 * GPT-5 family with full Responses API support
 */
export const AI_MODELS: Record<string, ModelDefinition> = {
    // ========================================================================
    // GPT-5 Family - Full flagship models with all capabilities
    // ========================================================================
    'gpt-5': {
        id: 'gpt-5',
        provider: 'openai',
        name: 'GPT-5',
        description: 'Most capable GPT-5 model with full reasoning',
        contextWindow: 256000,
        supportsImages: true,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'medium'
    },
    'gpt-5-mini': {
        id: 'gpt-5-mini',
        provider: 'openai',
        name: 'GPT-5 Mini',
        description: 'Fast and efficient GPT-5 variant',
        contextWindow: 256000,
        supportsImages: true,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'low'
    },
    'gpt-5-nano': {
        id: 'gpt-5-nano',
        provider: 'openai',
        name: 'GPT-5 Nano',
        description: 'Ultra-fast lightweight GPT-5 for quick tasks',
        contextWindow: 128000,
        supportsImages: true,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: false,
        supportsReasoning: false,
        defaultReasoningEffort: 'none'
    },

} as const

/**
 * Default models per provider
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
    openai: 'gpt-5-mini'
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: AIProvider): ModelDefinition[] {
    return Object.values(AI_MODELS).filter((m) => m.provider === provider)
}

/**
 * Get model definition by ID
 */
export function getModelById(modelId: string): ModelDefinition | undefined {
    return AI_MODELS[modelId]
}

/**
 * Get models that support reasoning
 */
export function getReasoningModels(): ModelDefinition[] {
    return Object.values(AI_MODELS).filter(m => m.supportsReasoning)
}

// ============================================================================
// AI Streaming Event Types
// ============================================================================

/**
 * Events emitted during AI streaming to the renderer
 * Extended for Responses API with reasoning and native tools
 */
export type AIStreamEvent =
    // Text streaming
    | { type: 'text-delta'; delta: string }
    | { type: 'text-done'; text: string }
    
    // Reasoning/Thinking (for o-series and GPT-5 with reasoning)
    | { type: 'reasoning-delta'; delta: string }
    | { type: 'reasoning-done'; text: string; summary?: string }
    
    // Function tool calls (custom tools like spreadsheet operations)
    | { type: 'tool-call-start'; toolCallId: string; toolName: string }
    | { type: 'tool-call-delta'; toolCallId: string; argsDelta: string }
    | { type: 'tool-call-done'; toolCallId: string; toolName: string; args: unknown }
    | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown; success: boolean }
    
    // Native tool events (web search, code interpreter, file search)
    | { type: 'web-search-start'; searchId: string }
    | { type: 'web-search-done'; searchId: string; results?: unknown }
    | { type: 'code-interpreter-start'; executionId: string }
    | { type: 'code-interpreter-delta'; executionId: string; code?: string; output?: string }
    | { type: 'code-interpreter-done'; executionId: string; output: string }
    | { type: 'file-search-start'; searchId: string }
    | { type: 'file-search-done'; searchId: string; results?: unknown }
    
    // Approval flow (for human-in-the-loop)
    | { type: 'tool-approval-request'; toolCallId: string; toolName: string; args: unknown }
    | { type: 'tool-approval-response'; toolCallId: string; approved: boolean; message?: string }
    
    // Step and completion events
    | { type: 'step-complete'; stepNumber: number; hasMoreSteps: boolean }
    | { type: 'finish'; usage?: { promptTokens: number; completionTokens: number; reasoningTokens?: number }; totalSteps: number }
    | { type: 'error'; error: string }

// ============================================================================
// Tool Approval Types
// ============================================================================

export type ToolApprovalBehavior = 'auto' | 'manual' | 'ask'

export interface ToolApprovalConfig {
    /** Default behavior for tools not in the list */
    defaultBehavior: ToolApprovalBehavior
    /** Per-tool behavior overrides */
    toolBehaviors: Record<string, ToolApprovalBehavior>
}

export const DEFAULT_TOOL_APPROVAL_CONFIG: ToolApprovalConfig = {
    defaultBehavior: 'auto',
    toolBehaviors: {
        // Spreadsheet tools - auto approve
        create_spreadsheet: 'auto',
        update_cells: 'auto',
        insert_formula: 'auto',
        format_cells: 'auto',
        merge_cells: 'auto',
        set_column_width: 'auto',
        set_row_height: 'auto',
        add_row: 'auto',
        delete_row: 'auto',
        get_spreadsheet_summary: 'auto',
        // Native tools - auto approve
        web_search: 'auto',
        code_interpreter: 'auto',
        file_search: 'auto',
        // Legacy web tools
        fetch_url: 'auto',
        // Document tools
        create_document: 'auto',
        update_document: 'auto',
        get_document_content: 'auto'
    }
}

// ============================================================================
// Reasoning Configuration
// ============================================================================

export interface ReasoningConfig {
    /** Reasoning effort level */
    effort: ReasoningEffort
    /** Whether to stream reasoning tokens (shows thinking process) */
    streamReasoning?: boolean
    /** Maximum reasoning tokens (for cost control) */
    maxReasoningTokens?: number
}

export const DEFAULT_REASONING_CONFIG: ReasoningConfig = {
    effort: 'medium',
    streamReasoning: true
}

// ============================================================================
// Native Tool Configuration
// ============================================================================

export interface NativeToolsConfig {
    /** Enable web search tool */
    webSearch?: boolean | { searchContextSize?: 'low' | 'medium' | 'high' }
    /** Enable code interpreter */
    codeInterpreter?: boolean | { containerType?: 'auto' | 'python' | 'javascript' }
    /** Enable file search */
    fileSearch?: boolean | { vectorStoreIds?: string[]; maxResults?: number }
}

export const DEFAULT_NATIVE_TOOLS_CONFIG: NativeToolsConfig = {
    webSearch: { searchContextSize: 'medium' },
    codeInterpreter: false,
    fileSearch: false
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const AIProviderSchema = z.enum(['openai'])

export const ReasoningEffortSchema = z.enum(['none', 'low', 'medium', 'high'])

export const ModelIdSchema = z.string().refine(
    (id) => id in AI_MODELS,
    { message: 'Invalid model ID' }
)

export const ChatMessageSchema = z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
})

export const ImageAttachmentSchema = z.object({
    type: z.literal('image'),
    data: z.string(),
    mediaType: z.string()
})

export const ReasoningConfigSchema = z.object({
    effort: ReasoningEffortSchema,
    streamReasoning: z.boolean().optional(),
    maxReasoningTokens: z.number().optional()
})

export const NativeToolsConfigSchema = z.object({
    webSearch: z.union([
        z.boolean(),
        z.object({ searchContextSize: z.enum(['low', 'medium', 'high']).optional() })
    ]).optional(),
    codeInterpreter: z.union([
        z.boolean(),
        z.object({ containerType: z.enum(['auto', 'python', 'javascript']).optional() })
    ]).optional(),
    fileSearch: z.union([
        z.boolean(),
        z.object({ 
            vectorStoreIds: z.array(z.string()).optional(),
            maxResults: z.number().optional()
        })
    ]).optional()
})

export const AIChatInputSchema = z.object({
    chatId: z.string().uuid(),
    prompt: z.string(),
    mode: z.enum(['plan', 'agent']).default('agent'),
    provider: AIProviderSchema.default('openai'),
    apiKey: z.string(),
    tavilyApiKey: z.string().optional(),
    model: z.string().optional(),
    messages: z.array(ChatMessageSchema).optional(),
    images: z.array(ImageAttachmentSchema).optional(),
    // New fields for Responses API
    reasoning: ReasoningConfigSchema.optional(),
    nativeTools: NativeToolsConfigSchema.optional(),
    previousResponseId: z.string().optional()
})

export type AIChatInput = z.infer<typeof AIChatInputSchema>
