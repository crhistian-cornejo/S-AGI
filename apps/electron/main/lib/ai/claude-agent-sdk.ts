import { existsSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'
import { sendToRenderer } from '../window-manager'
import type { AIStreamEvent } from '@s-agi/core/types/ai'

/**
 * Craft-style SDK options: pathToClaudeCodeExecutable, executableArgs (--env-file=/dev/null),
 * executable. Prevents subprocess from loading .env and overriding OAuth with API key.
 */
function getClaudeSdkDefaults(): {
    pathToClaudeCodeExecutable?: string
    executable: 'bun' | 'node'
    executableArgs: string[]
    cwd: string
} {
    // Import app at runtime to avoid "app is undefined" during module init
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron')
    const isPackaged = app?.isPackaged ?? false

    const basePath = isPackaged ? app.getAppPath() : process.cwd()
    const cliPath = join(basePath, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js')
    const hasCli = existsSync(cliPath)

    // Disable .env loading in subprocess so OAuth token isn't overridden by user's .env
    // /dev/null exists on darwin/linux only; skip on Windows
    const executableArgs =
        process.platform !== 'win32' ? ['--env-file=/dev/null'] : []

    // Windows dev: use node (Craft does this); elsewhere use bun
    const executable = process.platform === 'win32' && !isPackaged ? 'node' : 'bun'

    // cwd for session storage
    const cwd = isPackaged ? app.getPath('userData') : process.cwd()

    return {
        ...(hasCli ? { pathToClaudeCodeExecutable: cliPath } : {}),
        executable,
        executableArgs,
        cwd
    }
}

type ClaudeSdkMessage = {
    type?: string
    [key: string]: unknown
}

export interface ClaudeStreamingOptions {
    chatId: string
    prompt: string
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    images?: Array<{ type: 'image'; data: string; mediaType: string }>
    modelId: string
    systemPrompt: string
    signal?: AbortSignal
    authToken?: string
    apiKey?: string
    reasoning?: {
        effort: 'low' | 'medium' | 'high' | 'none'
    }
}

function emit(event: AIStreamEvent): void {
    sendToRenderer('ai:stream', event)
}

function buildPrompt(
    prompt: string,
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    images?: Array<{ type: 'image'; data: string; mediaType: string }>
): string {
    const history = messages?.length
        ? messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
        : ''

    const imageNote =
        images && images.length > 0
            ? '\n\nNOTE: The user attached images. If you need details, ask the user to describe them.'
            : ''

    if (!history) return `${prompt}${imageNote}`
    return `${history}\n\nUSER: ${prompt}${imageNote}`
}

async function loadClaudeSdk() {
    return import('@anthropic-ai/claude-agent-sdk')
}

/**
 * Simple Claude streaming - just chat with native Claude tools (web search, etc.)
 * No custom MCP servers, no LSP, no plugins.
 */
/**
 * Craft-style dynamic thinking level detection from prompt content
 * Analyzes the prompt for trigger phrases and returns appropriate token budget
 *
 * Levels (from Craft/Claude Code):
 * - ultrathink: ~32K tokens - complex architecture, deep analysis
 * - megathink: ~10K tokens - debugging, feature design
 * - think: ~4K tokens - quick planning, simple tasks
 */
function detectThinkingLevelFromPrompt(prompt: string): number | undefined {
    const lowerPrompt = prompt.toLowerCase()

    // Ultrathink triggers (~32K tokens) - highest priority, check first
    const ultrathinkPatterns = [
        'ultrathink',
        'think harder',
        'think intensely',
        'think longer',
        'think really hard',
        'think super hard',
        'think very hard',
        'deeply analyze',
        'thorough analysis',
        'comprehensive analysis'
    ]
    if (ultrathinkPatterns.some(p => lowerPrompt.includes(p))) {
        return 31999
    }

    // Megathink triggers (~10K tokens)
    const megathinkPatterns = [
        'megathink',
        'think hard',
        'think deeply',
        'think more',
        'think about it',
        'think a lot',
        'step by step',
        'carefully consider',
        'analyze this'
    ]
    if (megathinkPatterns.some(p => lowerPrompt.includes(p))) {
        return 10000
    }

    // Basic think trigger (~4K tokens)
    // Use word boundary check to avoid false positives like "rethink" in middle of words
    if (/\bthink\b/.test(lowerPrompt)) {
        return 4000
    }

    // No thinking trigger detected
    return undefined
}

/**
 * Get maxThinkingTokens - combines explicit effort setting with automatic detection
 *
 * Priority:
 * 1. Explicit effort level from UI (low/medium/high) takes precedence
 * 2. Automatic detection from prompt content (Craft-style)
 *
 * Token budgets:
 * - low: 5K (think)
 * - medium: 10K (megathink/think hard)
 * - high: 50K (ultrathink/think harder)
 * - auto-detected: 4K/10K/32K based on prompt patterns
 */
function getMaxThinkingTokens(
    effort: 'low' | 'medium' | 'high' | 'none' | undefined,
    prompt?: string
): number | undefined {
    // 1. Explicit effort setting takes priority
    if (effort && effort !== 'none') {
        switch (effort) {
            case 'low':
                return 5000 // ~5K tokens - "think" level
            case 'medium':
                return 10000 // ~10K tokens - "think hard" level
            case 'high':
                return 50000 // ~50K tokens - "think harder" level
            default:
                return undefined
        }
    }

    // 2. Automatic detection from prompt (Craft-style)
    if (prompt) {
        return detectThinkingLevelFromPrompt(prompt)
    }

    return undefined
}

export async function streamWithClaudeAgentSDK(options: ClaudeStreamingOptions): Promise<{
    text: string
    sessionId?: string
}> {
    const {
        prompt,
        messages,
        images,
        modelId,
        systemPrompt,
        signal,
        authToken,
        apiKey,
        reasoning
    } = options

        const finalPrompt = buildPrompt(prompt, messages, images)
        let fullText = ''
        let fullReasoningText = ''
        let stepCount = 0
        let sessionId: string | undefined
        let finishEmitted = false
        let toolCounter = 0
        const lastToolIdByName = new Map<string, string>()

    try {
        // Build env for subprocess: spread process.env, then set auth explicitly.
        const env: Record<string, string | undefined> = { ...process.env }
        if (authToken) {
            env.CLAUDE_CODE_OAUTH_TOKEN = authToken
            delete env.ANTHROPIC_API_KEY
        } else if (apiKey) {
            env.ANTHROPIC_API_KEY = apiKey
            delete env.CLAUDE_CODE_OAUTH_TOKEN
        }

        const sdkDefaults = getClaudeSdkDefaults()
        log.info('[Claude SDK] Options:', {
            pathToClaudeCodeExecutable: sdkDefaults.pathToClaudeCodeExecutable || '(default)',
            executable: sdkDefaults.executable,
            executableArgs: sdkDefaults.executableArgs,
            hasOAuthToken: !!authToken,
            hasApiKey: !!apiKey
        })

        const { query, AbortError } = await loadClaudeSdk()
        log.info('[Claude SDK] Starting query with prompt length:', finalPrompt.length)
        
        // Map reasoning effort to maxThinkingTokens (explicit or auto-detected from prompt)
        const maxThinkingTokens = getMaxThinkingTokens(reasoning?.effort, finalPrompt)
        if (maxThinkingTokens) {
            const source = reasoning?.effort ? `explicit (${reasoning.effort})` : 'auto-detected from prompt'
            log.info(`[Claude SDK] Thinking enabled: ${maxThinkingTokens} tokens (${source})`)
        }
        
        // Enhance system prompt with explicit no-emoji instruction for Claude
        const enhancedSystemPrompt = `${systemPrompt}

================================================================================
RESPONSE STYLE FOR CLAUDE
================================================================================

- NEVER use emojis in your responses
- Keep responses professional and text-only
- Use clear, concise language without emoji decorations
`

        const response = query({
            prompt: finalPrompt,
            options: {
                ...sdkDefaults,
                model: modelId,
                systemPrompt: enhancedSystemPrompt,
                permissionMode: 'bypassPermissions',
                allowDangerouslySkipPermissions: true,
                // Enable native Claude tools for web search and fetching
                allowedTools: ['WebSearch', 'WebFetch'],
                // CRITICAL: Enable real-time token-by-token streaming
                // Without this, responses come as a block instead of streaming
                // See: https://github.com/cline/cline/issues/6997
                includePartialMessages: true,
                // No custom MCP servers - just use Claude's native capabilities
                mcpServers: {},
                // Don't persist SDK sessions to disk - we handle our own chat persistence
                persistSession: false,
                env,
                // Set maxThinkingTokens based on reasoning effort
                // Based on Craft/Claude thinking levels: low=5K, medium=10K, high=50K
                ...(maxThinkingTokens !== undefined && { maxThinkingTokens }),
                // Log all stderr output during debugging
                stderr: (data: string) => {
                    const trimmed = data.trim()
                    if (trimmed) {
                        log.info('[Claude SDK stderr]', trimmed)
                    }
                }
            }
        })

        log.info('[Claude SDK] Query initiated, waiting for messages...')

        for await (const message of response as AsyncIterable<ClaudeSdkMessage>) {
            if (signal?.aborted) {
                throw new AbortError('Aborted')
            }

            if (!message || typeof message !== 'object') {
                log.debug('[Claude SDK] Received non-object message:', message)
                continue
            }

            // Log all messages with more detail for debugging tool calls
            if (message.type === 'tool_call' || message.type === 'tool_result' || message.type === 'stream_event') {
                log.info('[Claude SDK] Message:', message.type, JSON.stringify(message).slice(0, 500))
            } else {
                log.debug('[Claude SDK] Message received:', message.type, JSON.stringify(message).slice(0, 200))
            }

            switch (message.type) {
                // Handle streaming events (partial text deltas)
                case 'stream_event': {
                    const event = message.event as {
                        type?: string
                        index?: number
                        delta?: { type?: string; text?: string; thinking?: string }
                        content_block?: { type?: string; text?: string; thinking?: string }
                    }

                    // Handle content_block_delta events (text and thinking)
                    if (event?.type === 'content_block_delta') {
                        // Thinking delta - Claude's extended thinking/reasoning
                        // Format: {"type": "content_block_delta", "delta": {"type": "thinking_delta", "thinking": "..."}}
                        if (event.delta?.type === 'thinking_delta') {
                            const thinkingText = event.delta.thinking || ''
                            if (thinkingText) {
                                fullReasoningText += thinkingText
                                emit({
                                    type: 'reasoning-summary-delta',
                                    delta: thinkingText,
                                    summaryIndex: 0
                                })
                                log.debug('[Claude SDK] Thinking delta:', thinkingText.slice(0, 50))
                            }
                        }
                        // Text delta - regular response text
                        // Format: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "..."}}
                        else if (event.delta?.type === 'text_delta') {
                            const text = event.delta.text || ''
                            if (text) {
                                fullText += text
                                // CRITICAL: Emit immediately without buffering
                                // Each token is sent to renderer as soon as it arrives
                                emit({ type: 'text-delta', delta: text })
                            }
                        }
                        // Input JSON delta for tool arguments (accumulate but don't emit yet)
                        else if (event.delta?.type === 'input_json_delta') {
                            log.debug('[Claude SDK] Tool input delta:', (event.delta as { partial_json?: string }).partial_json?.slice(0, 100))
                        }
                    }
                    // Handle content_block_start events
                    else if (event?.type === 'content_block_start') {
                        const contentBlock = event.content_block as {
                            type?: string
                            text?: string
                            thinking?: string
                            id?: string
                            name?: string
                            input?: Record<string, unknown>
                        } | undefined

                        // Thinking block started
                        if (contentBlock?.type === 'thinking') {
                            fullReasoningText = ''
                            log.info('[Claude SDK] Thinking block started')
                            // Some initial thinking text might be included
                            if (contentBlock.thinking) {
                                fullReasoningText += contentBlock.thinking
                                emit({
                                    type: 'reasoning-summary-delta',
                                    delta: contentBlock.thinking,
                                    summaryIndex: 0
                                })
                            }
                        }
                        // Text block started
                        else if (contentBlock?.type === 'text') {
                            const text = contentBlock.text || ''
                            if (text) {
                                fullText += text
                                emit({ type: 'text-delta', delta: text })
                            }
                        }
                        // Tool use block started - handle WebSearch/WebFetch
                        else if (contentBlock?.type === 'tool_use') {
                            const toolName = contentBlock.name || 'unknown_tool'
                            const toolCallId = contentBlock.id || `${toolName}-${++toolCounter}`
                            lastToolIdByName.set(toolName, toolCallId)

                            log.info(`[Claude SDK] Tool use block started: ${toolName}, id: ${toolCallId}`)

                            // SDK may use WebSearch, web_search, WebFetch, or web_fetch
                            const isWebSearchStream = toolName === 'WebSearch' || toolName === 'web_search'
                            const isWebFetchStream = toolName === 'WebFetch' || toolName === 'web_fetch'
                            if (isWebSearchStream || isWebFetchStream) {
                                log.info(`[Claude SDK] WebSearch/WebFetch started via stream_event! Tool: ${toolName}`)
                                const input = contentBlock.input as { query?: string; url?: string } | undefined
                                emit({
                                    type: 'web-search-start',
                                    searchId: toolCallId,
                                    action: isWebSearchStream ? 'search' : 'open_page',
                                    query: input?.query,
                                    url: input?.url
                                })
                                emit({
                                    type: 'web-search-searching',
                                    searchId: toolCallId,
                                    action: isWebSearchStream ? 'search' : 'open_page',
                                    query: input?.query,
                                    url: input?.url
                                })
                            } else {
                                emit({ type: 'tool-call-start', toolCallId, toolName, args: contentBlock.input as Record<string, unknown> })
                            }
                        }
                    }
                    // Handle content_block_stop for thinking blocks
                    else if (event?.type === 'content_block_stop') {
                        // If we have reasoning text, emit the done event
                        // Note: We track which block stopped by index, but for now just check if we have text
                        if (fullReasoningText) {
                            log.info('[Claude SDK] Thinking block completed, length:', fullReasoningText.length)
                        }
                    }
                    break
                }
                
                // Handle complete assistant message (non-streaming)
                case 'assistant': {
                    // Extract text from BetaMessage structure: message.message.content[]
                    const betaMessage = message.message as {
                        content?: Array<{ type?: string; text?: string }>
                    } | undefined
                    
                    log.info('[Claude SDK] Processing assistant message, betaMessage:', !!betaMessage, 'content:', !!betaMessage?.content)
                    
                    if (betaMessage?.content && Array.isArray(betaMessage.content)) {
                        for (const block of betaMessage.content) {
                            log.info('[Claude SDK] Content block:', block?.type, 'text length:', block?.text?.length || 0)
                            if (block?.type === 'text' && block.text) {
                                // Only skip if we already have this exact text (from streaming)
                                if (fullText.length === 0 || !fullText.endsWith(block.text)) {
                                    fullText += block.text
                                    emit({ type: 'text-delta', delta: block.text })
                                    log.info('[Claude SDK] Emitted text-delta, fullText length now:', fullText.length)
                                }
                            }
                        }
                    }
                    break
                }
                
                // Handle result message (success or error)
                case 'result': {
                    if (message.subtype === 'success') {
                        // If we didn't get text from streaming or assistant message, use result.result
                        const resultText = typeof message.result === 'string' ? message.result : ''
                        log.info('[Claude SDK] Result success, fullText length:', fullText.length, 'resultText length:', resultText.length)
                        
                        if (fullText.length === 0 && resultText) {
                            // Fallback: use the result text directly
                            fullText = resultText
                            emit({ type: 'text-delta', delta: resultText })
                            log.info('[Claude SDK] Used result fallback, emitted text-delta')
                        }
                        
                        // Extract usage information from the result
                        // modelUsage contains per-model usage stats with inputTokens, outputTokens
                        const modelUsage = message.modelUsage as Record<string, {
                            inputTokens?: number
                            outputTokens?: number
                            costUSD?: number
                        }> | undefined
                        
                        // Get the first (and usually only) model's usage
                        const modelUsageEntry = modelUsage ? Object.values(modelUsage)[0] : undefined
                        const inputTokens = modelUsageEntry?.inputTokens || 0
                        const outputTokens = modelUsageEntry?.outputTokens || 0
                        const totalCostUSD = typeof message.total_cost_usd === 'number' ? message.total_cost_usd : 0
                        
                        log.info('[Claude SDK] Usage stats:', {
                            inputTokens,
                            outputTokens,
                            totalCostUSD,
                            durationMs: message.duration_ms
                        })
                        
                        // Emit reasoning summary done if we have reasoning text
                        if (fullReasoningText) {
                            emit({
                                type: 'reasoning-summary-done',
                                text: fullReasoningText,
                                summaryIndex: 0
                            })
                        }

                        // Parse markdown links from response text and emit as annotations
                        // Claude often includes "Sources:" or "Fuentes:" sections with [title](url) links
                        const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
                        const linkMatches = fullText.matchAll(markdownLinkRegex)
                        const extractedLinks: Array<{ title: string; url: string }> = []
                        for (const match of linkMatches) {
                            extractedLinks.push({ title: match[1], url: match[2] })
                        }

                        if (extractedLinks.length > 0) {
                            log.info(`[Claude SDK] Extracted ${extractedLinks.length} markdown links from response text`)

                            // Deduplicate by URL
                            const uniqueLinks = extractedLinks.filter((link, index, self) =>
                                index === self.findIndex(l => l.url === link.url)
                            )

                            const annotations = uniqueLinks.map((link, index) => ({
                                type: 'url_citation' as const,
                                url: link.url,
                                title: link.title,
                                startIndex: index * 100,
                                endIndex: (index + 1) * 100
                            }))

                            log.info(`[Claude SDK] Emitting annotations event with ${annotations.length} url_citations from markdown links`)
                            emit({
                                type: 'annotations',
                                annotations
                            })
                        }

                        finishEmitted = true
                        emit({ type: 'text-done', text: fullText })
                        emit({
                            type: 'finish',
                            usage: {
                                promptTokens: inputTokens,
                                completionTokens: outputTokens
                            },
                            totalSteps: stepCount,
                            responseId: sessionId
                        })
                    } else if (message.subtype === 'error') {
                        const errorText = typeof message.result === 'string' 
                            ? message.result 
                            : 'Unknown error'
                        emit({ type: 'error', error: errorText })
                    }
                    break
                }
                
                case 'tool_call': {
                    const toolName =
                        typeof message.tool_name === 'string'
                            ? message.tool_name
                            : 'unknown_tool'
                    const toolCallId =
                        (typeof message.tool_call_id === 'string' && message.tool_call_id) ||
                        (typeof message.tool_use_id === 'string' && message.tool_use_id) ||
                        `${toolName}-${++toolCounter}`
                    lastToolIdByName.set(toolName, toolCallId)

                    log.info(`[Claude SDK] Tool call received: ${toolName}, id: ${toolCallId}, input:`, JSON.stringify(message.input).slice(0, 200))

                    // Handle WebSearch and WebFetch with specialized UI events
                    // SDK may use WebSearch, web_search, WebFetch, or web_fetch
                    const isWebSearch = toolName === 'WebSearch' || toolName === 'web_search'
                    const isWebFetch = toolName === 'WebFetch' || toolName === 'web_fetch'
                    if (isWebSearch || isWebFetch) {
                        log.info(`[Claude SDK] WebSearch/WebFetch detected! Tool: ${toolName}, emitting web-search-start event`)
                        const input = message.input as { query?: string; url?: string } | undefined
                        emit({
                            type: 'web-search-start',
                            searchId: toolCallId,
                            action: isWebSearch ? 'search' : 'open_page',
                            query: input?.query,
                            url: input?.url
                        })
                        emit({
                            type: 'web-search-searching',
                            searchId: toolCallId,
                            action: isWebSearch ? 'search' : 'open_page',
                            query: input?.query,
                            url: input?.url
                        })
                    } else {
                        emit({ type: 'tool-call-start', toolCallId, toolName, args: message.input as Record<string, unknown> })
                        emit({
                            type: 'tool-call-done',
                            toolCallId,
                            toolName,
                            args: message.input
                        })
                    }
                    break
                }

                case 'tool_result': {
                    const toolName =
                        typeof message.tool_name === 'string'
                            ? message.tool_name
                            : 'unknown_tool'
                    const toolCallId =
                        (typeof message.tool_call_id === 'string' && message.tool_call_id) ||
                        (typeof message.tool_use_id === 'string' && message.tool_use_id) ||
                        lastToolIdByName.get(toolName) ||
                        `${toolName}-${++toolCounter}`

                    const result = message.result
                    const success = !message.is_error

                    log.info(`[Claude SDK] Tool result received: ${toolName}, id: ${toolCallId}, success: ${success}`)

                    // Handle WebSearch and WebFetch with specialized UI events
                    // SDK may use WebSearch, web_search, WebFetch, or web_fetch
                    const isWebSearchResult = toolName === 'WebSearch' || toolName === 'web_search'
                    const isWebFetchResult = toolName === 'WebFetch' || toolName === 'web_fetch'
                    if (isWebSearchResult || isWebFetchResult) {
                        log.info(`[Claude SDK] WebSearch/WebFetch result! Tool: ${toolName}, result structure:`, JSON.stringify(result).slice(0, 1000))

                        // Parse result - Claude SDK may return different structures
                        // Try to extract URLs/sources from various possible formats
                        type WebSearchSource = { url?: string; title?: string; snippet?: string }
                        const resultData = result as {
                            sources?: WebSearchSource[]
                            results?: WebSearchSource[]
                            url?: string
                            title?: string
                            content?: string
                        } | string | undefined

                        // Collect all URLs from the result
                        const urlSources: WebSearchSource[] = []

                        if (typeof resultData === 'object' && resultData !== null) {
                            // Try sources array
                            if (Array.isArray(resultData.sources)) {
                                urlSources.push(...resultData.sources.filter(s => s.url))
                            }
                            // Try results array
                            if (Array.isArray(resultData.results)) {
                                urlSources.push(...resultData.results.filter(s => s.url))
                            }
                            // Single URL (WebFetch)
                            if (resultData.url) {
                                urlSources.push({ url: resultData.url, title: resultData.title })
                            }
                            // Try to extract URLs from content text if no structured sources
                            if (urlSources.length === 0 && resultData.content) {
                                const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g
                                const matches = resultData.content.match(urlRegex) || []
                                const uniqueUrls = [...new Set(matches)]
                                uniqueUrls.forEach(url => {
                                    try {
                                        const hostname = new URL(url).hostname
                                        urlSources.push({ url, title: hostname })
                                    } catch { /* invalid url */ }
                                })
                            }
                        }

                        // If result is a string, try to extract URLs from it
                        if (typeof result === 'string' && urlSources.length === 0) {
                            const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g
                            const matches = result.match(urlRegex) || []
                            const uniqueUrls = [...new Set(matches)]
                            uniqueUrls.forEach(url => {
                                try {
                                    const hostname = new URL(url).hostname
                                    urlSources.push({ url, title: hostname })
                                } catch { /* invalid url */ }
                            })
                        }

                        log.info(`[Claude SDK] Extracted ${urlSources.length} sources from web search result`)

                        // Extract domains for web-search-done event
                        const domains = urlSources.map(s => {
                            try {
                                return new URL(s.url || '').hostname
                            } catch {
                                return s.url || ''
                            }
                        }).filter(Boolean) as string[]

                        emit({
                            type: 'web-search-done',
                            searchId: toolCallId,
                            action: isWebSearchResult ? 'search' : 'open_page',
                            domains,
                            url: typeof resultData === 'object' ? resultData?.url : undefined
                        })

                        // Emit annotations event for SourcesIndicator UI
                        if (urlSources.length > 0) {
                            const annotations = urlSources.map((source, index) => ({
                                type: 'url_citation' as const,
                                url: source.url || '',
                                title: source.title || source.snippet?.slice(0, 100) || undefined,
                                startIndex: index * 100, // Placeholder indices
                                endIndex: (index + 1) * 100
                            }))

                            log.info(`[Claude SDK] Emitting annotations event with ${annotations.length} url_citations`)
                            emit({
                                type: 'annotations',
                                annotations
                            })
                        }
                    } else {
                        emit({
                            type: 'tool-result',
                            toolCallId,
                            toolName,
                            result,
                            success
                        })
                    }

                    stepCount += 1
                    emit({
                        type: 'step-complete',
                        stepNumber: stepCount,
                        hasMoreSteps: true
                    })
                    break
                }
                
                case 'tool_progress': {
                    // Tool is still running, just log for now
                    log.debug('[Claude SDK] Tool progress:', message.tool_name)
                    break
                }
                
                case 'error': {
                    const errorText =
                        message.error && typeof message.error === 'object'
                            ? JSON.stringify(message.error)
                            : String(message.error || 'Unknown error')
                    emit({ type: 'error', error: errorText })
                    break
                }
                
                case 'system': {
                    if (message.subtype === 'init' && message.session_id) {
                        sessionId = message.session_id as string
                        log.info('[Claude SDK] Session initialized:', sessionId)
                    }
                    if (message.subtype === 'status') {
                        log.debug('[Claude SDK] Status:', message.status)
                    }
                    break
                }
                
                case 'user':
                case 'auth_status':
                case 'tool_use_summary':
                    // These are informational, just log them
                    log.debug('[Claude SDK] Info message:', message.type)
                    break
                    
                default:
                    // Log unknown message types with full content for debugging
                    log.info('[Claude SDK] Unknown message type:', message.type, JSON.stringify(message).slice(0, 500))
                    break
            }
        }

        log.info('[Claude SDK] Message loop completed, finishEmitted:', finishEmitted, 'fullText length:', fullText.length)

        // Parse markdown links from response and emit annotations for SourcesIndicator UI
        // This captures links from "Fuentes:" or "Sources:" sections that Claude includes
        const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
        const linkMatches = [...fullText.matchAll(markdownLinkRegex)]
        const extractedLinks = linkMatches.map(match => ({ title: match[1], url: match[2] }))

        // Deduplicate by URL
        const uniqueLinks = extractedLinks.filter((link, index, self) =>
            index === self.findIndex(l => l.url === link.url)
        )

        if (uniqueLinks.length > 0) {
            log.info(`[Claude SDK] Found ${uniqueLinks.length} markdown links in final text`)

            // Emit annotations for SourcesIndicator UI (shows favicons in action bar)
            const annotations = uniqueLinks.map((link, index) => ({
                type: 'url_citation' as const,
                url: link.url,
                title: link.title,
                startIndex: index * 100,
                endIndex: (index + 1) * 100
            }))

            log.info(`[Claude SDK] Emitting annotations event with ${annotations.length} url_citations`)
            emit({
                type: 'annotations',
                annotations
            })
        }

        if (!finishEmitted) {
            if (fullText) {
                emit({ type: 'text-done', text: fullText })
            }
            emit({
                type: 'finish',
                totalSteps: stepCount,
                responseId: sessionId
            })
        }

        log.info('[Claude SDK] Returning result, text length:', fullText.length, 'sessionId:', sessionId)
        return { text: fullText, sessionId }
    } catch (error) {
        log.error('[Claude SDK] Error caught:', error)
        
        const { AbortError } = await loadClaudeSdk()
        if (error instanceof AbortError || signal?.aborted) {
            log.info('[Claude SDK] Stream aborted')
            emit({ type: 'finish', totalSteps: stepCount, responseId: sessionId })
            return { text: fullText, sessionId }
        }

        const message = error instanceof Error ? error.message : 'Unknown error'
        log.error('[Claude SDK] Emitting error:', message)
        emit({ type: 'error', error: message })
        throw error
    }
}

/**
 * MCP Tool Definition (matches sdk.d.ts SdkMcpToolDefinition)
 */
export interface McpToolDef {
    name: string
    description: string
    inputSchema: unknown
    handler: (args: unknown, extra: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
}

/**
 * Agent Panel specific streaming options
 */
export interface AgentPanelClaudeOptions {
    sessionId: string
    prompt: string
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    modelId: string
    systemPrompt: string
    signal?: AbortSignal
    authToken?: string
    apiKey?: string
    emitEvent: (event: AgentPanelStreamEvent) => void
    /** Custom MCP tools for Excel, PDF, Docs, etc. */
    mcpTools?: McpToolDef[]
}

const MCP_SERVER_NAME = 's-agi-tools'
const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`

/**
 * Build a tool handler map for direct execution fallback
 */
function buildToolHandlerMap(mcpTools?: McpToolDef[]): Map<string, McpToolDef['handler']> {
    const map = new Map<string, McpToolDef['handler']>()
    if (!mcpTools) return map

    for (const tool of mcpTools) {
        map.set(tool.name, tool.handler)
        // Also map with mcp__ prefix in case SDK uses that format
        map.set(`${MCP_TOOL_PREFIX}${tool.name}`, tool.handler)
    }

    return map
}

function extractToolResult(result: unknown): unknown {
    if (!result || typeof result !== 'object') return result

    const content = (result as { content?: Array<{ type?: string; text?: string }> }).content
    const text = content?.[0]?.text
    if (!text) return result

    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

/**
 * Agent Panel stream event types (matches agent-panel.ts types)
 */
export type AgentPanelStreamEvent =
    | { type: 'text-delta'; delta: string }
    | { type: 'text-done'; text: string }
    | { type: 'tool-call-start'; toolName: string; toolCallId: string; args?: Record<string, unknown> }
    | { type: 'tool-call-done'; toolName: string; toolCallId: string; result: unknown }
    | { type: 'error'; error: string }
    | { type: 'finish'; usage?: { promptTokens: number; completionTokens: number } }

/**
 * Stream Claude responses for Agent Panel using Claude Agent SDK with OAuth
 * This allows the Agent Panel to use Claude Pro/Max subscription
 */
export async function streamClaudeForAgentPanel(options: AgentPanelClaudeOptions): Promise<{
    text: string
    sessionId?: string
}> {
    const {
        sessionId,
        prompt,
        messages,
        modelId,
        systemPrompt,
        signal,
        authToken,
        apiKey,
        emitEvent,
        mcpTools
    } = options

    const finalPrompt = buildPrompt(prompt, messages)
    let fullText = ''
    let claudeSessionId: string | undefined
    let finishEmitted = false

    try {
        // Build env for subprocess
        const env: Record<string, string | undefined> = { ...process.env }
        if (authToken) {
            env.CLAUDE_CODE_OAUTH_TOKEN = authToken
            delete env.ANTHROPIC_API_KEY
        } else if (apiKey) {
            env.ANTHROPIC_API_KEY = apiKey
            delete env.CLAUDE_CODE_OAUTH_TOKEN
        }

        const sdkDefaults = getClaudeSdkDefaults()
        log.info('[Claude SDK AgentPanel] Options:', {
            sessionId,
            modelId,
            hasOAuthToken: !!authToken,
            hasApiKey: !!apiKey,
            mcpToolsCount: mcpTools?.length || 0
        })

        const sdk = await loadClaudeSdk()
        const { query, AbortError, createSdkMcpServer } = sdk

        const mcpServerName = MCP_SERVER_NAME
        const mcpToolPrefix = MCP_TOOL_PREFIX
        const allowedToolsSet = new Set<string>(['WebSearch', 'WebFetch'])
        const mcpToolNames = new Set<string>()
        const useMcpServer = !!(mcpTools && mcpTools.length > 0)
        const toolHandlers = useMcpServer ? new Map<string, McpToolDef['handler']>() : buildToolHandlerMap(mcpTools)

        // Add our tool names to allowed tools (Claude will see them as available)
        if (useMcpServer && mcpTools) {
            log.info('[Claude SDK AgentPanel] Registering MCP tools:', mcpTools.map(t => t.name))
            for (const tool of mcpTools) {
                const namespacedName = `${mcpToolPrefix}${tool.name}`
                allowedToolsSet.add(tool.name)
                allowedToolsSet.add(namespacedName)
                mcpToolNames.add(tool.name)
                mcpToolNames.add(namespacedName)
            }
        }

        const allowedTools = Array.from(allowedToolsSet)
        const normalizeToolName = (toolName: string) =>
            toolName.startsWith(mcpToolPrefix) ? toolName.slice(mcpToolPrefix.length) : toolName
        const shouldEmitToolEvents = (toolName: string) => mcpToolNames.has(toolName)

        log.info('[Claude SDK AgentPanel] Starting query with prompt length:', finalPrompt.length)
        log.info('[Claude SDK AgentPanel] Allowed tools:', allowedTools)
        log.info('[Claude SDK AgentPanel] Tool handlers registered:', [...toolHandlers.keys()])

        const response = query({
            prompt: finalPrompt,
            options: {
                ...sdkDefaults,
                model: modelId,
                systemPrompt,
                permissionMode: 'bypassPermissions',
                allowDangerouslySkipPermissions: true,
                allowedTools,
                includePartialMessages: true,
                mcpServers: useMcpServer && mcpTools
                    ? { [mcpServerName]: createSdkMcpServer({ name: mcpServerName, tools: mcpTools }) }
                    : {},
                hooks: useMcpServer
                    ? {
                        PreToolUse: [{
                            hooks: [async (input) => {
                                const toolName = (input as { tool_name?: string }).tool_name
                                const toolCallId = (input as { tool_use_id?: string }).tool_use_id
                                const toolInput = (input as { input?: Record<string, unknown> }).input
                                if (toolName && toolCallId && shouldEmitToolEvents(toolName)) {
                                    emitEvent({
                                        type: 'tool-call-start',
                                        toolName: normalizeToolName(toolName),
                                        toolCallId,
                                        args: toolInput
                                    })
                                }
                                return { continue: true }
                            }]
                        }],
                        PostToolUse: [{
                            hooks: [async (input) => {
                                const toolName = (input as { tool_name?: string }).tool_name
                                const toolCallId = (input as { tool_use_id?: string }).tool_use_id
                                const toolResponse = (input as { tool_response?: unknown }).tool_response
                                if (toolName && toolCallId && shouldEmitToolEvents(toolName)) {
                                    emitEvent({
                                        type: 'tool-call-done',
                                        toolName: normalizeToolName(toolName),
                                        toolCallId,
                                        result: extractToolResult(toolResponse)
                                    })
                                }
                                return { continue: true }
                            }]
                        }],
                        PostToolUseFailure: [{
                            hooks: [async (input) => {
                                const toolName = (input as { tool_name?: string }).tool_name
                                const toolCallId = (input as { tool_use_id?: string }).tool_use_id
                                const error = (input as { error?: string }).error
                                if (toolName && toolCallId && shouldEmitToolEvents(toolName)) {
                                    emitEvent({
                                        type: 'tool-call-done',
                                        toolName: normalizeToolName(toolName),
                                        toolCallId,
                                        result: { success: false, error: error || 'Tool execution failed' }
                                    })
                                }
                                return { continue: true }
                            }]
                        }]
                    }
                    : undefined,
                persistSession: false,
                env,
                stderr: (data: string) => {
                    const trimmed = data.trim()
                    if (trimmed) {
                        log.info('[Claude SDK AgentPanel stderr]', trimmed)
                    }
                }
            }
        })

        log.info('[Claude SDK AgentPanel] Query initiated...')

        for await (const message of response as AsyncIterable<ClaudeSdkMessage>) {
            if (signal?.aborted) {
                throw new AbortError('Aborted')
            }

            if (!message || typeof message !== 'object') continue

            log.debug('[Claude SDK AgentPanel] Message:', message.type)

            switch (message.type) {
                case 'stream_event': {
                    const event = message.event as {
                        type?: string
                        delta?: { type?: string; text?: string }
                        content_block?: { type?: string; text?: string }
                    }

                    if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                        const text = event.delta.text || ''
                        if (text) {
                            fullText += text
                            emitEvent({ type: 'text-delta', delta: text })
                        }
                    } else if (event?.type === 'content_block_start' && event.content_block?.type === 'text') {
                        const text = event.content_block.text || ''
                        if (text) {
                            fullText += text
                            emitEvent({ type: 'text-delta', delta: text })
                        }
                    }
                    break
                }

                case 'assistant': {
                    const betaMessage = message.message as {
                        content?: Array<{ type?: string; text?: string }>
                    } | undefined

                    if (betaMessage?.content && Array.isArray(betaMessage.content)) {
                        for (const block of betaMessage.content) {
                            if (block?.type === 'text' && block.text) {
                                if (fullText.length === 0 || !fullText.endsWith(block.text)) {
                                    fullText += block.text
                                    emitEvent({ type: 'text-delta', delta: block.text })
                                }
                            }
                        }
                    }
                    break
                }

                case 'result': {
                    if (message.subtype === 'success') {
                        const resultText = typeof message.result === 'string' ? message.result : ''
                        if (fullText.length === 0 && resultText) {
                            fullText = resultText
                            emitEvent({ type: 'text-delta', delta: resultText })
                        }

                        const modelUsage = message.modelUsage as Record<string, {
                            inputTokens?: number
                            outputTokens?: number
                        }> | undefined
                        const modelUsageEntry = modelUsage ? Object.values(modelUsage)[0] : undefined

                        finishEmitted = true
                        emitEvent({ type: 'text-done', text: fullText })
                        emitEvent({
                            type: 'finish',
                            usage: {
                                promptTokens: modelUsageEntry?.inputTokens || 0,
                                completionTokens: modelUsageEntry?.outputTokens || 0
                            }
                        })
                    } else if (message.subtype === 'error') {
                        const errorText = typeof message.result === 'string' ? message.result : 'Unknown error'
                        emitEvent({ type: 'error', error: errorText })
                    }
                    break
                }

                case 'tool_call': {
                    if (useMcpServer) {
                        break
                    }
                    const toolName = typeof message.tool_name === 'string' ? message.tool_name : 'unknown'
                    const toolCallId = typeof message.tool_call_id === 'string' ? message.tool_call_id : `tool-${Date.now()}`
                    const toolInput = message.input as Record<string, unknown> | undefined

                    log.info(`[Claude SDK AgentPanel] Tool call: ${toolName}`, {
                        toolCallId,
                        input: JSON.stringify(toolInput).slice(0, 500)
                    })

                    emitEvent({ type: 'tool-call-start', toolName, toolCallId, args: toolInput })

                    // Direct tool execution fallback when MCP server is disabled
                    const handler = toolHandlers.get(toolName)
                    if (handler && toolInput) {
                        log.info(`[Claude SDK AgentPanel] Executing tool directly: ${toolName}`)
                        try {
                            const result = await handler(toolInput, {})
                            log.info(`[Claude SDK AgentPanel] Tool ${toolName} completed:`, JSON.stringify(result).slice(0, 300))
                            emitEvent({
                                type: 'tool-call-done',
                                toolName,
                                toolCallId,
                                result: extractToolResult(result)
                            })
                        } catch (toolError) {
                            const errorMsg = toolError instanceof Error ? toolError.message : 'Tool execution failed'
                            log.error(`[Claude SDK AgentPanel] Tool ${toolName} error:`, errorMsg)
                            emitEvent({
                                type: 'tool-call-done',
                                toolName,
                                toolCallId,
                                result: { success: false, error: errorMsg }
                            })
                        }
                    } else if (!handler) {
                        log.warn(`[Claude SDK AgentPanel] No handler for tool: ${toolName}`)
                    }
                    break
                }

                case 'tool_result': {
                    if (useMcpServer) {
                        break
                    }
                    const toolName = typeof message.tool_name === 'string' ? message.tool_name : 'unknown'
                    const toolCallId = typeof message.tool_call_id === 'string' ? message.tool_call_id : `tool-${Date.now()}`
                    emitEvent({ type: 'tool-call-done', toolName, toolCallId, result: message.result })
                    break
                }

                case 'error': {
                    const errorText = message.error && typeof message.error === 'object'
                        ? JSON.stringify(message.error)
                        : String(message.error || 'Unknown error')
                    emitEvent({ type: 'error', error: errorText })
                    break
                }

                case 'system': {
                    if (message.subtype === 'init' && message.session_id) {
                        claudeSessionId = message.session_id as string
                    }
                    break
                }
            }
        }

        if (!finishEmitted) {
            if (fullText) {
                emitEvent({ type: 'text-done', text: fullText })
            }
            emitEvent({ type: 'finish' })
        }

        log.info('[Claude SDK AgentPanel] Completed, text length:', fullText.length)
        return { text: fullText, sessionId: claudeSessionId }

    } catch (error) {
        log.error('[Claude SDK AgentPanel] Error:', error)

        const { AbortError } = await loadClaudeSdk()
        if (error instanceof AbortError || signal?.aborted) {
            log.info('[Claude SDK AgentPanel] Aborted')
            emitEvent({ type: 'finish' })
            return { text: fullText, sessionId: claudeSessionId }
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        emitEvent({ type: 'error', error: errorMessage })
        throw error
    }
}
