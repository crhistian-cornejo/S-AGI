import { z } from 'zod'
import log from 'electron-log'

// ============================================================================
// Web Search Tool Schemas
// ============================================================================

export const WEB_SEARCH_TOOLS = {
    web_search: {
        description: `Search the web for current information using Tavily API. 
Use this tool when you need to find up-to-date information, news, facts, or any data that might have changed since your training cutoff.
Returns relevant search results with titles, URLs, and content snippets.`,
        inputSchema: z.object({
            query: z.string().describe('The search query to look up'),
            maxResults: z.number().min(1).max(10).optional().default(5).describe('Maximum number of results to return (1-10)'),
            searchDepth: z.enum(['basic', 'advanced']).optional().default('basic').describe('Search depth: basic for quick results, advanced for more thorough search'),
            includeAnswer: z.boolean().optional().default(true).describe('Whether to include an AI-generated answer summary')
        })
    },

    fetch_url: {
        description: `Fetch and extract content from a specific URL.
Use this when you need to read the content of a specific webpage.
Returns the main text content of the page.`,
        inputSchema: z.object({
            url: z.string().url().describe('The URL to fetch'),
            maxLength: z.number().optional().default(10000).describe('Maximum length of content to return')
        })
    }
} as const

// ============================================================================
// Tool Types
// ============================================================================

export type WebSearchInput = z.infer<typeof WEB_SEARCH_TOOLS.web_search.inputSchema>
export type FetchUrlInput = z.infer<typeof WEB_SEARCH_TOOLS.fetch_url.inputSchema>

export interface WebSearchResult {
    title: string
    url: string
    content: string
    score?: number
}

export interface WebSearchResponse {
    query: string
    answer?: string
    results: WebSearchResult[]
    responseTime?: number
}

export interface FetchUrlResponse {
    url: string
    title?: string
    content: string
    success: boolean
    error?: string
}

// ============================================================================
// Tavily API Client
// ============================================================================

interface TavilySearchResponse {
    query: string
    answer?: string
    results: Array<{
        title: string
        url: string
        content: string
        score: number
    }>
    response_time: number
}

/**
 * Execute web search using Tavily API
 */
async function tavilySearch(
    query: string,
    apiKey: string,
    options: { maxResults?: number; searchDepth?: 'basic' | 'advanced'; includeAnswer?: boolean } = {}
): Promise<WebSearchResponse> {
    const { maxResults = 5, searchDepth = 'basic', includeAnswer = true } = options

    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: searchDepth,
            include_answer: includeAnswer,
            max_results: maxResults
        })
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Tavily API error: ${response.status} - ${errorText}`)
    }

    const data = (await response.json()) as TavilySearchResponse

    return {
        query: data.query,
        answer: data.answer,
        results: data.results.map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score
        })),
        responseTime: data.response_time
    }
}

/**
 * Fetch and extract content from a URL
 * Uses a simple fetch with HTML to text conversion
 */
async function fetchUrlContent(url: string, maxLength: number = 10000): Promise<FetchUrlResponse> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; S-AGI/1.0; +https://s-agi.app)',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const html = await response.text()

        // Simple HTML to text conversion
        // Remove scripts, styles, and HTML tags
        let text = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

        // Extract title from HTML
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        const title = titleMatch ? titleMatch[1].trim() : undefined

        // Truncate if needed
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...'
        }

        return {
            url,
            title,
            content: text,
            success: true
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return {
            url,
            content: '',
            success: false,
            error: errorMessage
        }
    }
}

// ============================================================================
// Tool Executor
// ============================================================================

/**
 * Execute a web tool by name
 */
export async function executeWebTool(
    toolName: string,
    args: unknown,
    tavilyApiKey?: string
): Promise<unknown> {
    log.info(`[WebTools] Executing tool: ${toolName}`, args)

    switch (toolName) {
        case 'web_search': {
            if (!tavilyApiKey) {
                throw new Error('Tavily API key is required for web search')
            }

            const input = WEB_SEARCH_TOOLS.web_search.inputSchema.parse(args)
            const result = await tavilySearch(input.query, tavilyApiKey, {
                maxResults: input.maxResults,
                searchDepth: input.searchDepth,
                includeAnswer: input.includeAnswer
            })

            log.info(`[WebTools] Web search completed: ${result.results.length} results`)
            return result
        }

        case 'fetch_url': {
            const input = WEB_SEARCH_TOOLS.fetch_url.inputSchema.parse(args)
            const result = await fetchUrlContent(input.url, input.maxLength)

            log.info(`[WebTools] Fetch URL completed: ${result.success ? 'success' : 'failed'}`)
            return result
        }

        default:
            throw new Error(`Unknown web tool: ${toolName}`)
    }
}

/**
 * Create web tools for AI SDK
 */
export function createWebTools(tavilyApiKey?: string) {
    const createToolDef = <T extends z.ZodType>(name: string, description: string, schema: T) => ({
        description,
        inputSchema: schema,
        execute: async (args: z.infer<T>) => {
            try {
                return await executeWebTool(name, args, tavilyApiKey)
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                log.error(`[WebTools] Tool ${name} failed:`, error)
                return { error: errorMessage, success: false }
            }
        }
    })

    return {
        web_search: createToolDef(
            'web_search',
            WEB_SEARCH_TOOLS.web_search.description,
            WEB_SEARCH_TOOLS.web_search.inputSchema
        ),
        fetch_url: createToolDef(
            'fetch_url',
            WEB_SEARCH_TOOLS.fetch_url.description,
            WEB_SEARCH_TOOLS.fetch_url.inputSchema
        )
    }
}
