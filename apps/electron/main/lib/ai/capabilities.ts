import type { AIProvider, ProviderCapabilities, ReasoningEffort } from '@s-agi/core/types/ai'
import { getModelById } from '@s-agi/core/types/ai'

/**
 * Default capabilities per provider.
 * These are merged with model-specific flags to produce the final capability set.
 */
const PROVIDER_DEFAULTS: Record<AIProvider, Partial<ProviderCapabilities>> = {
    openai: {
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: true,
        supportsReasoning: true,
        supportsImages: true,
        supportsImageGeneration: true,
        streamingApi: 'responses-api',
        authType: 'api-key',
    },
    'chatgpt-plus': {
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: true,
        supportsFileSearch: true,
        supportsReasoning: true,
        supportsImages: true,
        supportsImageGeneration: true,
        streamingApi: 'responses-api',
        authType: 'oauth',
    },
    zai: {
        supportsTools: true,
        supportsNativeWebSearch: false,
        supportsServerWebSearch: false,
        supportsCodeInterpreter: false,
        supportsFileSearch: false,
        supportsReasoning: true,
        supportsImages: true,
        supportsImageGeneration: false,
        reasoningParamFormat: 'zai-thinking',
        streamingApi: 'chat-completions',
        authType: 'api-key',
    },
    claude: {
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsCodeInterpreter: false,
        supportsFileSearch: false,
        supportsReasoning: true,
        supportsImages: true,
        supportsImageGeneration: false,
        streamingApi: 'ai-sdk',
        authType: 'api-key',
    },
    cerebras: {
        supportsTools: true,
        supportsNativeWebSearch: false,
        supportsServerWebSearch: false,
        supportsCodeInterpreter: false,
        supportsFileSearch: false,
        supportsReasoning: false,
        supportsImages: false,
        supportsImageGeneration: false,
        reasoningParamFormat: 'cerebras',
        streamingApi: 'chat-completions',
        authType: 'api-key',
    },
    groq: {
        supportsTools: true,
        supportsNativeWebSearch: true,
        supportsServerWebSearch: false,
        supportsCodeInterpreter: false,
        supportsFileSearch: false,
        supportsReasoning: false,
        supportsImages: false,
        supportsImageGeneration: false,
        streamingApi: 'chat-completions',
        authType: 'api-key',
    },
    ollama: {
        // Tools/images/reasoning default to false; overridden per-model
        // by capabilities detected from Ollama API metadata.
        // Sending tools to models that don't support function calling
        // causes errors or hallucinated tool calls.
        supportsTools: false,
        supportsNativeWebSearch: false,
        supportsServerWebSearch: false,
        supportsCodeInterpreter: false,
        supportsFileSearch: false,
        supportsReasoning: false,
        supportsImages: false,
        supportsImageGeneration: false,
        streamingApi: 'chat-completions',
        authType: 'none',
    },
}

/**
 * Resolve full capabilities for a model, merging provider defaults with model-specific flags.
 * This is the single source of truth that replaces scattered if/else branches.
 */
export function getModelCapabilities(provider: AIProvider, modelId: string): ProviderCapabilities {
    const model = getModelById(modelId)
    const defaults = PROVIDER_DEFAULTS[provider]

    // Determine reasoning param format (varies by model family within a provider)
    let reasoningParamFormat = defaults.reasoningParamFormat
    if (provider === 'groq' && model?.supportsReasoning) {
        const apiModel = model.modelIdForApi || modelId
        if (apiModel.startsWith('openai/gpt-oss')) {
            reasoningParamFormat = 'groq-gpt-oss'
        } else if (apiModel.startsWith('qwen/')) {
            reasoningParamFormat = 'groq-qwen'
        }
    }
    // Cerebras: gpt-oss-120b uses reasoningEffort, but qwen-3-32b and zai-glm-4.7 use disable_reasoning toggle
    if (provider === 'cerebras' && model?.supportsReasoning) {
        const apiModel = model.modelIdForApi || modelId
        if (apiModel === 'qwen-3-32b' || apiModel === 'zai-glm-4.7') {
            reasoningParamFormat = 'cerebras-toggle'
        }
    }

    return {
        supportsTools: model?.supportsTools ?? defaults.supportsTools ?? false,
        supportsNativeWebSearch: model?.supportsNativeWebSearch ?? defaults.supportsNativeWebSearch ?? false,
        supportsServerWebSearch: model?.supportsServerWebSearch ?? defaults.supportsServerWebSearch ?? false,
        supportsCodeInterpreter: model?.supportsCodeInterpreter ?? defaults.supportsCodeInterpreter ?? false,
        supportsFileSearch: model?.supportsFileSearch ?? defaults.supportsFileSearch ?? false,
        supportsReasoning: model?.supportsReasoning ?? defaults.supportsReasoning ?? false,
        supportsImages: model?.supportsImages ?? defaults.supportsImages ?? false,
        supportsImageGeneration: defaults.supportsImageGeneration ?? false,
        reasoningParamFormat,
        streamingApi: defaults.streamingApi ?? 'chat-completions',
        authType: defaults.authType ?? 'api-key',
    }
}

/**
 * Check if a provider/model can use image generation tools (generate_image, edit_image).
 * Models without OpenAI Images API access hallucinate calls to these tools.
 */
export function canUseImageTools(provider: AIProvider, modelId: string): boolean {
    const caps = getModelCapabilities(provider, modelId)
    return caps.supportsImageGeneration
}

/**
 * Build reasoning providerOptions for AI SDK streamText/generateText.
 * Returns properly namespaced providerOptions (e.g. { groq: { ... } }),
 * or empty object if no reasoning.
 * @see https://github.com/vercel/ai — provider-specific options
 */
export function getReasoningParams(
    provider: AIProvider,
    modelId: string,
    reasoningConfig?: { effort: ReasoningEffort },
): Record<string, unknown> {
    const caps = getModelCapabilities(provider, modelId)
    if (!caps.supportsReasoning || !reasoningConfig) return {}

    const { effort } = reasoningConfig

    switch (caps.reasoningParamFormat) {
        case 'cerebras':
            // @ai-sdk/cerebras: providerOptions.cerebras.reasoningEffort
            if (effort === 'none') return {}
            return {
                cerebras: {
                    reasoningEffort: effort,
                },
            }

        case 'groq-gpt-oss':
            // @ai-sdk/groq: GPT-OSS models only support reasoningEffort (NOT reasoningFormat)
            if (effort === 'none') return {}
            return {
                groq: {
                    reasoningEffort: effort,
                },
            }

        case 'groq-qwen':
            // @ai-sdk/groq: Qwen 3 uses 'none'|'default' for reasoningEffort
            return {
                groq: {
                    reasoningFormat: effort === 'none' ? 'hidden' : 'parsed',
                    reasoningEffort: effort === 'none' ? 'none' : 'default',
                },
            }

        case 'cerebras-toggle':
            // Cerebras qwen-3-32b and zai-glm-4.7: reasoning enabled by default.
            // These models use `disable_reasoning: boolean` (not reasoningEffort).
            // @ai-sdk/cerebras uses openai-compatible under the hood, so unknown
            // provider options are forwarded to the request body.
            return {
                cerebras: {
                    disable_reasoning: effort === 'none',
                },
            }

        case 'zai-thinking':
            // Z.AI: pass thinking config via zai namespace.
            // Uses @ai-sdk/openai-compatible which passes unknown keys through to the API body.
            return {
                zai: {
                    thinking:
                        effort === 'none'
                            ? { type: 'disabled' }
                            : { type: 'enabled', clear_thinking: false },
                },
            }

        case 'ai-sdk':
        default:
            // Claude: handled separately via getClaudeThinkingOptions()
            return {}
    }
}

/**
 * Get the streaming API path for a provider/model combination.
 */
export function getStreamingPath(provider: AIProvider, modelId: string): 'ai-sdk' | 'responses-api' | 'chat-completions' {
    const caps = getModelCapabilities(provider, modelId)
    return caps.streamingApi
}

/**
 * Check if a model uses the Chat Completions API path (vs Responses API or AI SDK).
 */
export function usesChatCompletions(provider: AIProvider, _modelId?: string): boolean {
    return provider === 'zai' || provider === 'cerebras' || provider === 'groq' || provider === 'ollama'
}

/**
 * Check if a model uses the Responses API path.
 */
export function usesResponsesApi(provider: AIProvider, _modelId?: string): boolean {
    return provider === 'openai' || provider === 'chatgpt-plus'
}

/**
 * Build Anthropic providerOptions for Claude thinking (extended thinking).
 * Maps reasoning effort levels to budgetTokens.
 */
export function getClaudeThinkingOptions(
    reasoningConfig?: { effort: ReasoningEffort },
): Record<string, unknown> | undefined {
    if (!reasoningConfig || reasoningConfig.effort === 'none') return undefined

    const budgetMap: Record<string, number> = {
        low: 5000,
        medium: 10000,
        high: 50000,
    }
    const budgetTokens = budgetMap[reasoningConfig.effort] ?? 10000

    return {
        anthropic: {
            thinking: { type: 'enabled', budgetTokens },
        },
    }
}

/**
 * Check if a Groq model supports native browser search via @ai-sdk/groq.
 * Only gpt-oss models support browserSearch tool.
 */
export function groqSupportsBrowserSearch(modelId: string): boolean {
    const model = getModelById(modelId)
    const apiModel = model?.modelIdForApi || modelId
    return apiModel.startsWith('openai/gpt-oss')
}
