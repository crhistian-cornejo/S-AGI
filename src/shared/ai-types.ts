import { z } from 'zod'

// ============================================================================
// AI Provider & Model Definitions
// ============================================================================

/**
 * Available AI Providers
 * - 'openai': Standard OpenAI API (requires API key)
 * - 'chatgpt-plus': ChatGPT Plus/Pro via Codex OAuth (uses subscription)
 * - 'zai': Z.AI Coding Plan (GLM models via OpenAI-compatible endpoint)
 */
export type AIProvider = 'openai' | 'chatgpt-plus' | 'zai'

/**
 * - 'low': Low reasoning effort (default)
 * - 'medium': Medium reasoning effort
 * - 'high': High reasoning effort
 */
export type ReasoningEffort = 'low' | 'medium' | 'high'

/** Reasoning summary levels */
export type ReasoningSummary = 'auto' | 'concise' | 'detailed'

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
    /** Whether this model is included with subscription (no per-token cost) */
    includedInSubscription?: boolean
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
        supportsFileSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'low'
    },

    // ========================================================================
    // ChatGPT Plus/Pro Models (via Codex OAuth - included in subscription)
    // These models use the ChatGPT subscription, no per-token cost
    // ========================================================================
    'gpt-5.1-codex-max': {
        id: 'gpt-5.1-codex-max',
        provider: 'chatgpt-plus',
        name: 'GPT-5.1 Codex Max',
        description: 'Maximum capability Codex model (ChatGPT Plus)',
        contextWindow: 256000,
        supportsImages: true,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'high',
        includedInSubscription: true
    },
    'gpt-5.1-codex-mini': {
        id: 'gpt-5.1-codex-mini',
        provider: 'chatgpt-plus',
        name: 'GPT-5.1 Codex Mini',
        description: 'Efficient Codex model (ChatGPT Plus)',
        contextWindow: 256000,
        supportsImages: true,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'low',
        includedInSubscription: true
    },
    'gpt-5.2': {
        id: 'gpt-5.2',
        provider: 'chatgpt-plus',
        name: 'GPT-5.2',
        description: 'Latest GPT model (ChatGPT Plus)',
        contextWindow: 256000,
        supportsImages: true,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'medium',
        includedInSubscription: true
    },
    'gpt-5.2-codex': {
        id: 'gpt-5.2-codex',
        provider: 'chatgpt-plus',
        name: 'GPT-5.2 Codex',
        description: 'GPT-5.2 with Codex capabilities (ChatGPT Plus)',
        contextWindow: 256000,
        supportsImages: true,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'medium',
        includedInSubscription: true
    },

    // ========================================================================
    // Z.AI GLM Models (OpenAI-compatible Coding Plan)
    // ========================================================================
    'GLM-4.7': {
        id: 'GLM-4.7',
        provider: 'zai',
        name: 'GLM-4.7',
        description: 'Z.AI flagship coding model with deep reasoning',
        contextWindow: 128000,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'medium'
    },
    'GLM-4.5-air': {
        id: 'GLM-4.5-air',
        provider: 'zai',
        name: 'GLM-4.5 Air',
        description: 'Fast Z.AI model for rapid coding tasks',
        contextWindow: 128000,
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'low',
        includedInSubscription: true
    }
} as const

/**
 * Default models per provider
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
    openai: 'gpt-5',
    'chatgpt-plus': 'gpt-5.1-codex-max',
    zai: 'GLM-4.7'
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
    const direct = AI_MODELS[modelId]
    if (direct) return direct

    const normalized = modelId.trim()
    if (normalized.toLowerCase() === 'glm-4.7') {
        return AI_MODELS['GLM-4.7']
    }
    if (normalized.toLowerCase() === 'glm-4.5-air') {
        return AI_MODELS['GLM-4.5-air']
    }

    return undefined
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

// Annotation types for web search and file search results
export interface UrlCitationAnnotation {
    type: 'url_citation'
    url: string
    title?: string
    startIndex: number
    endIndex: number
}

export interface FileCitationAnnotation {
    type: 'file_citation'
    fileId: string
    filename: string
    index: number
}

export type Annotation = UrlCitationAnnotation | FileCitationAnnotation

/**
 * Events emitted during AI streaming to the renderer
 * Extended for Responses API with reasoning and native tools
 * Types aligned with OpenAI SDK ResponseStreamEvent
 */
export type AIStreamEvent =
    // Text streaming
    | { type: 'text-delta'; delta: string }
    | { type: 'text-done'; text: string }
    
    // Reasoning/Thinking (for o-series and GPT-5 with reasoning)
    // Note: OpenAI now uses reasoning_summary instead of raw reasoning
    | { type: 'reasoning-summary-delta'; delta: string; summaryIndex: number }
    | { type: 'reasoning-summary-done'; text: string; summaryIndex: number }
    
    // Function tool calls (custom tools like spreadsheet operations)
    | { type: 'tool-call-start'; toolCallId: string; toolName: string }
    | { type: 'tool-call-delta'; toolCallId: string; argsDelta: string }
    | { type: 'tool-call-done'; toolCallId: string; toolName: string; args: unknown }
    | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown; success: boolean }
    
    // Native tool events (web search, code interpreter, file search)
    | { type: 'web-search-start'; searchId: string; action?: 'search' | 'open_page' | 'find_in_page'; query?: string; domains?: string[]; url?: string }
    | { type: 'web-search-searching'; searchId: string; action?: 'search' | 'open_page' | 'find_in_page'; query?: string; domains?: string[]; url?: string }
    | { type: 'web-search-done'; searchId: string; action?: 'search' | 'open_page' | 'find_in_page'; query?: string; domains?: string[]; url?: string }
    | { type: 'annotations'; annotations: Annotation[] }
    | { type: 'code-interpreter-start'; executionId: string }
    | { type: 'code-interpreter-interpreting'; executionId: string }
    | { type: 'code-interpreter-code-delta'; executionId: string; delta: string }
    | { type: 'code-interpreter-code-done'; executionId: string; code: string }
    | { type: 'code-interpreter-done'; executionId: string; output: string }
    | { type: 'file-search-start'; searchId: string }
    | { type: 'file-search-searching'; searchId: string }
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
        insert_text: 'auto',
        replace_document_content: 'auto',
        get_document_content: 'auto'
    }
}

// ============================================================================
// Reasoning Configuration
// ============================================================================

export interface ReasoningConfig {
    /** Reasoning effort level */
    effort: ReasoningEffort
    /** Summary level for reasoning output */
    summary?: ReasoningSummary
    /** Maximum reasoning tokens (for cost control) */
    maxReasoningTokens?: number
}

export const DEFAULT_REASONING_CONFIG: ReasoningConfig = {
    effort: 'low',
    summary: 'auto'
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
// Cost Optimization Configuration
// ============================================================================

/**
 * Configuration for cost optimization strategies
 * @see https://platform.openai.com/docs/guides/cost-optimization
 */
export interface CostOptimizationConfig {
    /** 
     * Maximum output tokens (controls response length and cost)
     * Lower values = less output = lower cost
     */
    maxOutputTokens?: number
    
    /**
     * Use flex processing for 50% cost savings
     * Trade-off: Slower response times, may return 429 if busy
     * Best for: Non-urgent tasks, batch processing, evaluations
     * @see https://platform.openai.com/docs/guides/flex-processing
     */
    useFlex?: boolean
    
    /**
     * Truncation strategy for context window management
     * - 'auto': Automatically truncate oldest messages if context exceeds limit
     * - 'disabled': Return error if context exceeds limit
     */
    truncation?: {
        type: 'auto' | 'disabled'
    }

    /**
     * Prompt caching configuration (improves latency/cost on repeated prefixes)
     * @see https://platform.openai.com/docs/guides/prompt-caching
     */
    promptCacheKey?: string
    promptCacheRetention?: 'in_memory' | '24h'
}

export const DEFAULT_COST_OPTIMIZATION_CONFIG: CostOptimizationConfig = {
    maxOutputTokens: undefined, // No limit by default
    useFlex: false, // Standard processing by default
    truncation: { type: 'auto' }, // Auto-truncate for better UX
    promptCacheKey: undefined,
    promptCacheRetention: undefined
}

/**
 * Service tier options for OpenAI API
 * @see https://platform.openai.com/docs/guides/flex-processing
 */
export type ServiceTier = 'auto' | 'flex'

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const AIProviderSchema = z.enum(['openai', 'chatgpt-plus', 'zai'])

export const ReasoningEffortSchema = z.enum(['low', 'medium', 'high'])

export const ReasoningSummarySchema = z.enum(['auto', 'concise', 'detailed'])

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
    summary: ReasoningSummarySchema.optional(),
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
    previousResponseId: z.string().optional(),
    optimization: z.object({
        maxOutputTokens: z.number().optional(),
        useFlex: z.boolean().optional(),
        truncation: z.object({
            type: z.enum(['auto', 'disabled']).optional()
        }).optional(),
        promptCacheKey: z.string().optional(),
        promptCacheRetention: z.enum(['in_memory', '24h']).optional()
    }).optional()
})

export type AIChatInput = z.infer<typeof AIChatInputSchema>
