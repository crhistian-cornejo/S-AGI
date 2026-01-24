/**
 * AI Provider and Model Definitions
 *
 * Shared AI configuration for S-AGI.
 * Keep synchronized with apps/electron/shared/ai-types.ts
 */

export type AIProvider = 'openai' | 'chatgpt-plus' | 'zai'
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'
export type ResponseMode = 'instant' | 'thinking' | 'auto'
export type ReasoningSummary = 'auto' | 'concise' | 'detailed'

export interface ModelDefinition {
    id: string
    provider: AIProvider
    name: string
    description?: string
    contextWindow?: number
    supportsImages?: boolean
    supportsTools?: boolean
    supportsNativeWebSearch?: boolean
    supportsCodeInterpreter?: boolean
    supportsFileSearch?: boolean
    supportsReasoning?: boolean
    defaultReasoningEffort?: ReasoningEffort
    includedInSubscription?: boolean
    modelIdForApi?: string
    supportsResponseMode?: boolean
}

export const AI_MODELS: Record<string, ModelDefinition> = {
    // GPT-5 Family
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

    // ChatGPT Plus Models
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
        includedInSubscription: true,
        supportsResponseMode: true
    },

    // Z.AI GLM Models
    'GLM-4.7': {
        id: 'GLM-4.7',
        provider: 'zai',
        name: 'GLM-4.7',
        description: 'Z.AI main model with thinking mode support',
        contextWindow: 128000,
        supportsImages: true,
        supportsTools: true,
        supportsReasoning: true,
        defaultReasoningEffort: 'medium'
    },
    'GLM-4.7-Flash': {
        id: 'GLM-4.7-Flash',
        provider: 'zai',
        name: 'GLM-4.7 Flash',
        description: 'Fast Z.AI model for quick tasks',
        contextWindow: 128000,
        supportsImages: true,
        supportsTools: true,
        supportsReasoning: false,
        includedInSubscription: true
    }
} as const

export const DEFAULT_MODELS: Record<AIProvider, string> = {
    openai: 'gpt-5',
    'chatgpt-plus': 'gpt-5.2',
    zai: 'GLM-4.7-Flash'
}

export function getModelsByProvider(provider: AIProvider): ModelDefinition[] {
    return Object.values(AI_MODELS).filter((m) => m.provider === provider)
}

export function getModelById(modelId: string): ModelDefinition | undefined {
    return AI_MODELS[modelId]
}
