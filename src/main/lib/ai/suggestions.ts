import OpenAI from 'openai'
import log from 'electron-log'

/**
 * Generates follow-up suggestions based on the last message and chat history.
 */
export async function generateSuggestions(
    lastMessage: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    apiKey: string,
    baseURL?: string
): Promise<string[]> {
    try {
        const client = new OpenAI({ 
            apiKey,
            baseURL: baseURL || undefined
        })

        // Choose a fast/cheap model based on the provider
        // If baseURL is Z.AI, use GLM-4.7-Flash
        // Otherwise use gpt-4o-mini
        const model = (baseURL && baseURL.includes('z.ai')) 
        ? 'GLM-4.7-Flash' 
        : 'gpt-4o-mini'

    log.info(`[AI] Generating suggestions with model: ${model}, baseURL: ${baseURL || 'default'}`)

    // Limit history to last 5 messages for context
    const contextHistory = history.slice(-5)
    
    // Z.AI models (GLM) sometimes struggle with response_format: json_object
    // and require explicit instructions in the system prompt.
    const isZai = baseURL && baseURL.includes('z.ai')
    
    const response = await client.chat.completions.create({
        model,
        messages: [
            {
                role: 'system',
                content: `You are a helpful assistant for S-AGI, a spreadsheet and document creation tool.
Generate 5 brief follow-up suggestions (2-3 words each, max 5 words) based on the last assistant response.
The suggestions should be contextual, actionable, and help the user explore the data or features further.

<suggestion_guidelines>
After showing data/metrics in a spreadsheet:
- Compare periods or categories
- Show related metrics
- Visualize trends (charts/graphs)
- Drill into details
- Analyze patterns

General rules:
- Keep them very short (2-3 words preferred).
- Do NOT use generic ones like "Tell me more" or "What else?".
- Return ONLY a JSON array of strings in a "suggestions" field.${isZai ? '\n- Ensure the response is a valid JSON object: {"suggestions": ["...", "..."]}' : ''}
</suggestion_guidelines>

Assistant's last response:
${lastMessage}`
            },
            ...contextHistory
        ],
        // Only use response_format for OpenAI, for Z.AI rely on prompt
        ...(isZai ? {} : { response_format: { type: 'json_object' } }),
        max_tokens: 150,
        temperature: 0.7
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
        log.warn('[AI] Suggestions response content is empty')
        return []
    }

    log.info(`[AI] Suggestions raw content: ${content}`)

    try {
        const parsed = JSON.parse(content)
        const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : Object.values(parsed)[0]
        
        if (Array.isArray(suggestions)) {
            const filtered = suggestions.slice(0, 4)
            log.info(`[AI] Generated ${filtered.length} suggestions: ${filtered.join(', ')}`)
            return filtered
        }
    } catch (parseError) {
        log.error('[AI] Failed to parse suggestions JSON:', content, parseError)
    }

    return []
    } catch (error) {
        log.error('[AI] Error generating suggestions:', error)
        return []
    }
}
