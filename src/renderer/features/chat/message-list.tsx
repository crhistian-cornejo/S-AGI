import { memo, useEffect, useRef, useState, useMemo } from 'react'
import { IconCheck, IconCopy, IconLoader2, IconPlayerPlay, IconPlayerStop, IconExternalLink, IconWorld, IconFile, IconAlertCircle, IconChartBar } from '@tabler/icons-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAtomValue, useSetAtom } from 'jotai'
import { cn } from '@/lib/utils'
import { trpc, trpcClient } from '@/lib/trpc'
import { selectedModelAtom, selectedArtifactAtom, artifactPanelOpenAtom } from '@/lib/atoms'
import { getModelById } from '@shared/ai-types'
import { ModelIcon } from '@/components/icons/model-icons'
import { ChatMarkdownRenderer } from '@/components/chat-markdown-renderer'
import { CitationsFooter } from '@/components/inline-citation'
import { MessageAttachments } from '@/components/message-attachments'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
    AgentBash,
    AgentEdit,
    AgentPlan,
    AgentReasoning,
    AgentTask,
    AgentToolCall,
    AgentToolRegistry,
    AgentToolCallsGroup,
    AgentWebFetch,
    AgentWebSearch,
    ConsolidatedWebSearch,
    AgentFileSearch,
    AgentTodoTool,
    AgentExitPlanModeTool,
    AgentImageGeneration,
    getToolStatus,
    type PlanStep,
    type ToolPart
} from '@/features/agent'

// Default context window for calculations (256k for GPT-5)
const DEFAULT_CONTEXT_WINDOW = 256000

// Pricing per 1M tokens (USD) — from official APIs
// OpenAI: https://platform.openai.com/docs/pricing | https://openai.com/api/pricing/
// Z.AI: https://docs.z.ai/guides/overview/pricing
// ChatGPT Plus/Codex: included in subscription, no per-token charge
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    // OpenAI API (Standard $/1M: platform.openai.com/docs/pricing)
    'gpt-5': { input: 1.25, output: 10 },
    'gpt-5-mini': { input: 0.25, output: 2 },
    'gpt-5-nano': { input: 0.05, output: 0.4 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-5.2-openai': { input: 1.75, output: 14 },
    // ChatGPT Plus / Codex (included in subscription)
    'gpt-5.1-codex-max': { input: 0, output: 0 },
    'gpt-5.1-codex-mini': { input: 0, output: 0 },
    'gpt-5.2': { input: 0, output: 0 },
    'gpt-5.2-codex': { input: 0, output: 0 },
    // Z.AI (GLM)
    'GLM-4.7': { input: 0.6, output: 2.2 },
    'GLM-4.7-FlashX': { input: 0.07, output: 0.4 },
    'GLM-4.7-Flash': { input: 0, output: 0 }
}

/** Calculate cost based on tokens and model. Reasoning tokens are billed as output. */
function calculateCost(modelId: string, inputTokens: number, outputTokens: number, reasoningTokens?: number): number {
    const pricing = MODEL_PRICING[modelId]
    if (!pricing) return 0
    const inputCost = (inputTokens / 1_000_000) * pricing.input
    const effOutput = (outputTokens || 0) + (reasoningTokens || 0)
    const outputCost = (effOutput / 1_000_000) * pricing.output
    return inputCost + outputCost
}

/** Format cost as currency string */
function formatCost(cost: number): string {
    if (cost === 0) return 'Free'
    if (cost < 0.001) return '<$0.001'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(3)}`
}

/** Context usage ring indicator - shows percentage of context used */
const ContextUsageRing = memo(function ContextUsageRing({ 
    used, 
    total = DEFAULT_CONTEXT_WINDOW,
    size = 16
}: { 
    used: number
    total?: number
    size?: number 
}) {
    const percentage = Math.min((used / total) * 100, 100)
    const strokeWidth = 2.5
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (percentage / 100) * circumference
    
    // Color based on usage
    const getColor = () => {
        if (percentage < 50) return 'stroke-emerald-500'
        if (percentage < 80) return 'stroke-amber-500'
        return 'stroke-rose-500'
    }
    
    return (
        <svg width={size} height={size} className="-rotate-90" aria-label="Context usage indicator" role="img">
            {/* Background circle */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                className="stroke-muted-foreground/20"
            />
            {/* Progress circle */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={cn("transition-all duration-500", getColor())}
            />
        </svg>
    )
})

// ============================================================================
// Helper Functions - Extracted for performance (no recreation on re-render)
// ============================================================================

/** Parse message content to extract text safely */
function parseContent(c: unknown): string {
    if (typeof c === 'string') {
        // Check if it's the specific JSON object we want to parse
        if (c.trim().startsWith('{') && c.includes('"type":"text"')) {
            try {
                const parsed = JSON.parse(c)
                return parsed.text || ''
            } catch {
                return c
            }
        }
        return c
    }
    if (Array.isArray(c)) {
        return c.map((item: unknown) => (item as { text?: string }).text || '').join('')
    }
    if (typeof c === 'object' && c !== null) {
        return ('text' in c) ? (c as { text: string }).text : JSON.stringify(c)
    }
    return String(c)
}

function formatTokens(tokens: number): string {
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}k`
    }
    return tokens.toString()
}

function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`
    }
    const seconds = ms / 1000
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeToolType(toolName: string) {
    if (toolName.startsWith('tool-')) {
        return toolName
    }
    return `tool-${toolName}`
}

function parseToolArgs(args: unknown): Record<string, unknown> {
    if (isRecord(args)) {
        return args
    }
    if (typeof args === 'string' && args.trim().length > 0) {
        try {
            const parsed = JSON.parse(args)
            return isRecord(parsed) ? parsed : {}
        } catch {
            return {}
        }
    }
    return {}
}

function normalizePlanStatus(status?: string): PlanStep['status'] {
    switch (status) {
        case 'complete':
        case 'completed':
            return 'complete'
        case 'in_progress':
        case 'running':
            return 'in_progress'
        case 'skipped':
            return 'skipped'
        default:
            return 'pending'
    }
}

function normalizePlanSteps(steps: Array<Record<string, unknown>> = []): PlanStep[] {
    return steps.map((step, index) => ({
        id: String(step.id ?? index),
        title: String(step.title ?? step.name ?? `Step ${index + 1}`),
        description: typeof step.description === 'string' ? step.description : undefined,
        status: normalizePlanStatus(typeof step.status === 'string' ? step.status : undefined)
    }))
}

const TOOL_STATE_MAP: Record<ToolCall['status'], ToolPart['state']> = {
    streaming: 'input-streaming',
    done: 'input-available',
    executing: 'input-available',
    complete: 'output-available',
    error: 'output-error'
}

const LEGACY_STATUS_MAP: Record<ToolCall['status'], 'pending' | 'executing' | 'complete' | 'error'> = {
    streaming: 'pending',
    done: 'executing',
    executing: 'executing',
    complete: 'complete',
    error: 'error'
}

function toToolPart(toolCall: ToolCall): ToolPart {
    const input = parseToolArgs(toolCall.args)
    const output = isRecord(toolCall.result) ? toolCall.result : toolCall.result !== undefined ? { output: toolCall.result } : {}

    return {
        type: normalizeToolType(toolCall.name),
        state: TOOL_STATE_MAP[toolCall.status],
        input,
        output
    }
}

function toEditArgs(input: Record<string, unknown>) {
    return {
        filePath: String(input.filePath ?? input.file_path ?? ''),
        oldString: typeof input.oldString === 'string' ? input.oldString : typeof input.old_string === 'string' ? input.old_string : undefined,
        newString: typeof input.newString === 'string' ? input.newString : typeof input.new_string === 'string' ? input.new_string : undefined,
        replaceAll: Boolean(input.replaceAll ?? input.replace_all ?? false)
    }
}

function toFileSearchPart(search: StreamingFileSearch): ToolPart {
    return {
        type: 'tool-file_search',
        state: search.status === 'done' ? 'output-available' : 'input-available',
        input: {
            // If we have filename info, we could add it here
        },
        output: {
            // We don't have exact results during streaming usually, but we can indicate done
        }
    }
}

// Special tools that need their own dedicated components (not grouped)
const SPECIAL_TOOLS = new Set([
    'Bash', 'bash',
    'Edit', 'edit',
    'WebFetch', 'webfetch', 'web_fetch',
    'WebSearch', 'websearch', 'web_search',
    'FileSearch', 'filesearch', 'file_search',
    'Task', 'task',
    'PlanWrite', 'planwrite', 'plan_write',
    'TodoWrite', 'todowrite', 'todo_write',
    'ExitPlanMode', 'exitplanmode', 'exit_plan_mode',
    // Image generation tools - render with dedicated image component
    'generate_image', 'edit_image'
])

/** Check if a tool should be rendered individually with a dedicated component */
function isSpecialTool(toolName: string): boolean {
    return SPECIAL_TOOLS.has(toolName)
}

/** Separate tool calls into special (individual rendering) and simple (grouped) */
function separateToolCalls<T extends { name: string }>(toolCalls: T[]): { special: T[], simple: T[] } {
    const special: T[] = []
    const simple: T[] = []
    
    for (const tc of toolCalls) {
        if (isSpecialTool(tc.name)) {
            special.push(tc)
        } else {
            simple.push(tc)
        }
    }
    
    return { special, simple }
}

// ============================================================================
// Types
// ============================================================================

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: unknown
    /** Model id used for this message (assistant). For cost and model pill. */
    model_id?: string | null
    /** Display name of the model (e.g. GPT-5.2). */
    model_name?: string | null
    tool_calls?: Array<{
        id: string
        name: string
        args: unknown
        result?: unknown
    }>
    metadata?: {
        usage?: {
            inputTokens?: number
            outputTokens?: number
            totalTokens?: number
            reasoningTokens?: number
        }
        durationMs?: number
        reasoning?: string
        contextWindow?: number
        /** Legacy: model id/name may also be in metadata before model_id/model_name columns existed. */
        model_id?: string
        model_name?: string
        actions?: Array<{
            type: 'attachments' | 'web-search' | 'file-search' | 'code-interpreter' | 'tool' | 'model'
            count?: number
            label?: string
            modelId?: string
            modelName?: string
        }>
        annotations?: Array<
            | { type: 'url_citation'; url: string; title?: string; startIndex: number; endIndex: number }
            | { type: 'file_citation'; fileId: string; filename: string; index: number }
        >
        /** Document citations from local RAG (non-OpenAI providers) */
        documentCitations?: DocumentCitation[]
    }
    attachments?: Array<{
        id: string
        name: string
        size: number
        type: string
        url?: string
        preview?: string
    }>
    created_at: string
}

interface ToolCall {
    id: string
    name: string
    args: string
    status: 'streaming' | 'done' | 'executing' | 'complete' | 'error'
    result?: unknown
}

interface StreamingWebSearch {
    searchId: string
    query?: string
    status: 'searching' | 'done'
    action?: 'search' | 'open_page' | 'find_in_page'
    domains?: string[]
    url?: string
}

interface StreamingFileSearch {
    searchId: string
    status: 'searching' | 'done'
    filename?: string
}

/** Document citation from local RAG */
interface DocumentCitation {
    id: number
    filename: string
    pageNumber: number | null
    text: string
    marker?: string
}

interface MessageListProps {
    messages: Message[]
    isLoading: boolean
    streamingText?: string
    streamingToolCalls?: ToolCall[]
    streamingReasoning?: string
    lastReasoning?: string
    isReasoning?: boolean
    onViewArtifact?: (artifactId: string) => void
    /** Active web searches during streaming */
    streamingWebSearches?: StreamingWebSearch[]
    /** Active file searches during streaming */
    streamingFileSearches?: StreamingFileSearch[]
    /** Citations collected from the response (URL and file citations) */
    streamingAnnotations?: Array<
        | { type: 'url_citation'; url: string; title?: string; startIndex: number; endIndex: number }
        | { type: 'file_citation'; fileId: string; filename: string; index: number }
    >
    /** Document citations from local RAG (for non-OpenAI providers) */
    streamingDocumentCitations?: DocumentCitation[]
    /** Error message from streaming */
    streamingError?: string | null
}

// ============================================================================
// Components
// ============================================================================

/** Error notification component - shows error messages in the chat */
const ErrorNotification = memo(function ErrorNotification({ error }: { error: string }) {
    return (
        <div className="flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-red-500/10">
                <IconAlertCircle size={18} className="text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="prose-container">
                    <div className="text-sm text-foreground">
                        {error}
                    </div>
                </div>
            </div>
        </div>
    )
})

/** Memoized assistant avatar to prevent unnecessary re-renders */
const AssistantAvatar = memo(function AssistantAvatar() {
    return (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
            <Logo size={32} />
        </div>
    )
})

/** Main message list component - memoized for performance */
export const MessageList = memo(function MessageList({
    messages,
    isLoading,
    streamingText,
    streamingToolCalls,
    streamingReasoning,
    lastReasoning,
    isReasoning,
    onViewArtifact,
    streamingWebSearches,
    streamingFileSearches,
    streamingAnnotations,
    streamingDocumentCitations,
    streamingError
}: MessageListProps) {
    if (messages.length === 0 && !isLoading && !lastReasoning) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20 animate-in fade-in duration-700">
                <div className="mb-6">
                    <Logo size={64} />
                </div>
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">How can I help you today?</h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-[280px] text-center leading-relaxed">
                    Describe a spreadsheet or ask a question to get started.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6 px-4 py-4 max-w-3xl mx-auto">
            {messages.map((message, index) => (
                <div
                    key={message.id}
                    id={`msg-${message.id}`}
                    className="animate-in fade-in slide-in-from-bottom-2 duration-300 scroll-mt-4"
                >
                    <MessageItem 
                        message={message} 
                        onViewArtifact={onViewArtifact}
                        reasoning={!isLoading && message.role === 'assistant' && index === messages.length - 1
                            ? (lastReasoning || message.metadata?.reasoning)
                            : message.metadata?.reasoning}
                    />
                </div>
            ))}

            {/* Streaming response */}
            {isLoading && (streamingText || streamingReasoning || (streamingToolCalls && streamingToolCalls.length > 0) || (streamingWebSearches && streamingWebSearches.length > 0) || (streamingFileSearches && streamingFileSearches.length > 0)) && (
                <div className="animate-in fade-in duration-300">
                    <div className="flex items-start gap-4">
                        <AssistantAvatar />
                        <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                            {/* Reasoning section - shows ABOVE the text */}
                            {(isReasoning || streamingReasoning || (streamingAnnotations && streamingAnnotations.length > 0)) && (
                                <AgentReasoning
                                    content={streamingReasoning || ''}
                                    isStreaming={isReasoning}
                                    annotations={streamingAnnotations}
                                />
                            )}

                            {streamingText && (
                                <div className="prose-container relative">
                                    <ChatMarkdownRenderer
                                        content={streamingText}
                                        size="md"
                                        isAnimating
                                        documentCitations={streamingDocumentCitations}
                                    />
                                    <span className="inline-block w-1.5 h-4 bg-primary/40 animate-pulse ml-1 align-middle rounded-sm" />
                                </div>
                            )}

                            {streamingWebSearches && streamingWebSearches.length > 0 && (
                                <ConsolidatedWebSearch
                                    searches={streamingWebSearches}
                                    isNativeSearch
                                />
                            )}

                            {streamingFileSearches && streamingFileSearches.length > 0 && (
                                <div className="space-y-2">
                                    {streamingFileSearches.map((search) => (
                                        <AgentFileSearch
                                            key={search.searchId}
                                            part={toFileSearchPart(search)}
                                            chatStatus="streaming"
                                        />
                                    ))}
                                </div>
                            )}

                            {streamingToolCalls && streamingToolCalls.length > 0 && (
                                <ToolCallsRenderer
                                    toolCalls={streamingToolCalls}
                                    chatStatus="streaming"
                                    onViewArtifact={onViewArtifact}
                                    isStreaming
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Error notification - shows when there's a streaming error */}
            {streamingError && (
                <ErrorNotification error={streamingError} />
            )}

            {/* Initial Loading State - shows skeleton while waiting for first response chunk */}
            {isLoading && !streamingText && !streamingReasoning && (!streamingToolCalls || streamingToolCalls.length === 0) && (!streamingWebSearches || streamingWebSearches.length === 0) && (!streamingFileSearches || streamingFileSearches.length === 0) && (
                <div className="flex gap-4 animate-in fade-in duration-300">
                    <AssistantAvatar />
                    <div className="flex-1 pt-1 space-y-3">
                        {/* Skeleton lines mimicking text response */}
                        <Skeleton className="h-4 w-[85%]" />
                        <Skeleton className="h-4 w-[70%]" />
                        <Skeleton className="h-4 w-[60%]" />
                    </div>
                </div>
            )}
        </div>
    )
})

/** Individual message item - memoized */
const MessageItem = memo(function MessageItem({ 
    message, 
    onViewArtifact,
    reasoning
}: { 
    message: Message
    onViewArtifact?: (id: string) => void
    reasoning?: string
}) {
    const isUser = message.role === 'user'
    const content = parseContent(message.content)
    const [copied, setCopied] = useState(false)
    const [ttsState, setTtsState] = useState<'idle' | 'loading' | 'playing'>('idle')
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const textToSpeech = trpc.ai.textToSpeech.useMutation()
    const selectedModel = useAtomValue(selectedModelAtom)

    const usage = message.metadata?.usage
    const durationMs = message.metadata?.durationMs
    const inputTokens = usage?.inputTokens || 0
    const outputTokens = usage?.outputTokens || 0
    const reasoningTokens = usage?.reasoningTokens || 0
    const totalTokens = usage?.totalTokens ?? (inputTokens + outputTokens + reasoningTokens)
    const contextWindow = message.metadata?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
    const hasUsage = totalTokens > 0 || (durationMs !== undefined && durationMs > 0)
    /** Prefer stored model so cost does not change when user switches model. */
    const modelIdForCost = message.model_id ?? message.metadata?.model_id ?? selectedModel
    const cost = calculateCost(modelIdForCost, inputTokens, outputTokens, reasoningTokens)
    const modelId = message.model_id ?? message.metadata?.model_id
    const modelName = message.model_name ?? message.metadata?.model_name ?? modelId
    /** Solo dos providers: OpenAI (openai+chatgpt-plus) o Z.AI */
    const modelProvider = getModelById(modelId || '')?.provider === 'zai' ? 'zai' : 'openai'

    // Extract chart artifact IDs from tool calls (for "Ver Charts" button)
    const chartArtifactIds = useMemo(() => {
        if (!message.tool_calls) return []
        return message.tool_calls
            .filter(tc => tc.name === 'generate_chart')
            .map(tc => {
                const result = tc.result as Record<string, unknown> | undefined
                return result?.artifactId as string | undefined
            })
            .filter((id): id is string => !!id)
    }, [message.tool_calls])

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current = null
            }
        }
    }, [])

    const handleCopy = async () => {
        if (!content) return
        
        try {
            // Prefer desktop API if available (more reliable in Electron)
            if (window.desktopApi?.clipboard) {
                await window.desktopApi.clipboard.writeText(content)
            } else {
                await navigator.clipboard.writeText(content)
            }
            
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (error) {
            console.error('[MessageItem] Failed to copy:', error)
        }
    }

    const handleTts = async () => {
        if (!content || ttsState === 'loading') return

        if (ttsState === 'playing') {
            audioRef.current?.pause()
            audioRef.current = null
            setTtsState('idle')
            return
        }

        try {
            setTtsState('loading')
            const ttsText = content.length > 4000 ? content.slice(0, 4000) : content

            const response = await textToSpeech.mutateAsync({
                text: ttsText,
                model: 'gpt-4o-mini-tts',
                voice: 'alloy'
            })

            const byteCharacters = atob(response.audioBase64)
            const byteNumbers = new Array(byteCharacters.length)

            for (let i = 0; i < byteCharacters.length; i += 1) {
                byteNumbers[i] = byteCharacters.charCodeAt(i)
            }

            const blob = new Blob([new Uint8Array(byteNumbers)], { type: response.mimeType })
            const objectUrl = URL.createObjectURL(blob)

            const audio = new Audio(objectUrl)
            audioRef.current = audio

            audio.onended = () => {
                URL.revokeObjectURL(objectUrl)
                audioRef.current = null
                setTtsState('idle')
            }

            audio.onerror = () => {
                URL.revokeObjectURL(objectUrl)
                audioRef.current = null
                setTtsState('idle')
            }

            await audio.play()
            setTtsState('playing')
        } catch (error) {
            console.error('[ChatView] Failed to play TTS:', error)
            setTtsState('idle')
        }
    }

    if (isUser) {
        return (
            <div className="flex flex-col items-end gap-2 group">
                <div className="flex flex-col items-end gap-1 group/message w-full">
                    <div className="max-w-[100%] bg-primary text-primary-foreground rounded-[24px] rounded-br-[4px] px-5 py-3 transition-all hover:bg-primary/90 shadow-sm">
                        <p className="text-[15px] whitespace-pre-wrap leading-relaxed break-words">{content}</p>
                    </div>

                    {/* Copy button for user messages - below the bubble */}
                    <div className="flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="p-1.5 rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent text-muted-foreground active:scale-[0.97]"
                                    aria-label="Copy message"
                                >
                                    {copied ? (
                                        <IconCheck size={16} />
                                    ) : (
                                        <IconCopy size={16} />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Copy</TooltipContent>
                        </Tooltip>
                    </div>
                </div>
                
                {/* Show attachments for user messages */}
                {message.attachments && message.attachments.length > 0 && (
                    <MessageAttachments 
                        attachments={message.attachments} 
                        className="max-w-[100%]"
                    />
                )}
            </div>
        )
    }

    return (
        <div className="flex items-start gap-4 group">
            <AssistantAvatar />
            <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                {/* Reasoning shown above everything */}
                {reasoning && (
                    <AgentReasoning
                        content={reasoning}
                        isStreaming={false}
                        defaultCollapsed
                        durationMs={message.metadata?.durationMs}
                        actions={message.metadata?.actions}
                        annotations={message.metadata?.annotations}
                    />
                )}
                
                {/* Tool calls shown after reasoning, before content */}
                {message.tool_calls && message.tool_calls.length > 0 && (
                    <ToolCallsRenderer
                        toolCalls={message.tool_calls.map(tc => ({ 
                            ...tc, 
                            args: JSON.stringify(tc.args), 
                            status: 'complete' as const 
                        }))}
                        onViewArtifact={onViewArtifact}
                    />
                )}
                
                {/* Text content shown last */}
                {content && (
                    <div className="prose-container">
                        <ChatMarkdownRenderer
                            content={content}
                            size="md"
                            documentCitations={message.metadata?.documentCitations}
                        />
                        {/* Citations footer - shows all cited sources */}
                        {message.metadata?.documentCitations && message.metadata.documentCitations.length > 0 && (
                            <CitationsFooter citations={message.metadata.documentCitations} />
                        )}
                    </div>
                )}

                {/* Show attachments for assistant messages */}
                {message.attachments && message.attachments.length > 0 && (
                    <MessageAttachments 
                        attachments={message.attachments} 
                    />
                )}

                {/* View Charts button - shown when charts were created in this message */}
                {chartArtifactIds.length > 0 && (
                    <div className="mt-3">
                        <ViewChartsButton chartArtifactIds={chartArtifactIds} />
                    </div>
                )}

                {(content || hasUsage) && (
                    <div className="flex items-center justify-between text-muted-foreground mt-2">
                        <div className="flex items-center gap-1">
                            {content && (
                                <>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                onClick={handleCopy}
                                                className="p-1.5 rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97]"
                                                aria-label="Copy message"
                                            >
                                                {copied ? (
                                                    <IconCheck size={16} />
                                                ) : (
                                                    <IconCopy size={16} />
                                                )}
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">Copy</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                onClick={handleTts}
                                                className="p-1.5 rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97]"
                                                aria-label="Play message"
                                            >
                                                {ttsState === 'loading' ? (
                                                    <IconLoader2 size={16} className="animate-spin" />
                                                ) : ttsState === 'playing' ? (
                                                    <IconPlayerStop size={16} />
                                                ) : (
                                                    <IconPlayerPlay size={16} />
                                                )}
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                            {ttsState === 'playing' ? 'Stop' : 'Play'}
                                        </TooltipContent>
                                    </Tooltip>
                                </>
                            )}

                            {/* Sources indicator */}
                            {message.metadata?.annotations && message.metadata.annotations.length > 0 && (
                                <SourcesIndicator annotations={message.metadata.annotations} />
                            )}
                            {/* Model used for this response (OpenAI or Z.AI icon + name) — basis for cost calculation */}
                            {(modelId || modelName) && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span
                                            className="h-5 px-1.5 flex items-center gap-1.5 text-[10px] rounded-md text-muted-foreground/70 font-medium"
                                            aria-label={`Model: ${modelName}`}
                                        >
                                            <ModelIcon provider={modelProvider} size={12} className="shrink-0" />
                                            <span className="truncate max-w-[120px]">{modelName}</span>
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Model used: {modelName}</TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                        {hasUsage && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="h-5 px-1.5 flex items-center gap-1.5 text-[10px] rounded-md text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/50 transition-[background-color,transform] duration-150 ease-out"
                                    >
                                        <ContextUsageRing used={totalTokens} total={contextWindow} />
                                        <span className="font-mono">{formatTokens(totalTokens)}</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="end" className="text-xs">
                                    <div className="space-y-1">
                                        {(modelId || modelName) && (
                                            <div className="flex justify-between gap-4">
                                                <span className="text-muted-foreground">Model:</span>
                                                <span className="font-mono text-foreground">{modelName}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground">Tokens:</span>
                                            <span className="font-mono text-foreground">
                                                {totalTokens.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-muted-foreground">Context:</span>
                                            <span className="font-mono text-foreground">
                                                {((totalTokens / contextWindow) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        {durationMs !== undefined && durationMs > 0 && (
                                            <div className="flex justify-between gap-4">
                                                <span className="text-muted-foreground">Duration:</span>
                                                <span className="font-mono text-foreground">
                                                    {formatDuration(durationMs)}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between gap-4 pt-1 border-t border-border/50">
                                            <span className="text-muted-foreground">Cost:</span>
                                            <span className="font-mono text-foreground">
                                                {formatCost(cost)}
                                            </span>
                                        </div>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
})

/** Agent tool renderer - normalizes OpenAI tool calls */
const AgentToolRenderer = memo(function AgentToolRenderer({
    toolCall,
    chatStatus,
    onViewArtifact
}: {
    toolCall: ToolCall
    chatStatus?: string
    onViewArtifact?: (id: string) => void
}) {
    const part = toToolPart(toolCall)
    const toolType = part.type
    const input = part.input ?? {}
    const output = part.output ?? {}
    const isComplete = toolCall.status === 'complete'

    if (toolType === 'tool-Bash') {
        return <AgentBash part={part} chatStatus={chatStatus} />
    }

    if (toolType === 'tool-WebFetch') {
        return <AgentWebFetch part={part} chatStatus={chatStatus} />
    }

    if (toolType === 'tool-WebSearch' || toolType === 'tool-web_search') {
        return <AgentWebSearch part={part} chatStatus={chatStatus} isNativeSearch={toolType === 'tool-web_search'} />
    }

    if (toolType === 'tool-FileSearch' || toolType === 'tool-file_search') {
        return <AgentFileSearch part={part} chatStatus={chatStatus} />
    }

    if (toolType === 'tool-Task') {
        return <AgentTask part={part} chatStatus={chatStatus} />
    }

    if (toolType === 'tool-Edit') {
        return (
            <AgentEdit
                toolCallId={toolCall.id}
                args={toEditArgs(input)}
                result={isRecord(toolCall.result) ? (toolCall.result as any) : undefined}
                status={LEGACY_STATUS_MAP[toolCall.status]}
            />
        )
    }

    if (toolType === 'tool-PlanWrite') {
        const planPayload = (isRecord(output.plan) ? output.plan : isRecord(input.plan) ? input.plan : null) as Record<string, unknown> | null
        const steps = planPayload && Array.isArray(planPayload.steps)
            ? normalizePlanSteps(planPayload.steps as Array<Record<string, unknown>>)
            : []
        const currentStepIndex = typeof planPayload?.currentStepIndex === 'number'
            ? planPayload.currentStepIndex
            : typeof (planPayload as { current_step_index?: number })?.current_step_index === 'number'
                ? (planPayload as { current_step_index: number }).current_step_index
                : undefined
        const title = typeof planPayload?.title === 'string' ? planPayload.title : undefined

        if (steps.length > 0) {
            return (
                <AgentPlan
                    title={title}
                    steps={steps}
                    currentStepIndex={currentStepIndex}
                />
            )
        }
    }

    // TodoWrite - show todo list updates
    if (toolType === 'tool-TodoWrite' || toolType === 'tool-todowrite') {
        return (
            <AgentTodoTool
                part={{
                    ...part,
                    toolCallId: toolCall.id,
                    input: { todos: Array.isArray(input.todos) ? input.todos : [] },
                    output: {
                        oldTodos: Array.isArray(output.oldTodos) ? output.oldTodos : [],
                        newTodos: Array.isArray(output.newTodos) ? output.newTodos : Array.isArray(input.todos) ? input.todos : [],
                        success: output.success as boolean | undefined
                    }
                }}
                chatStatus={chatStatus}
            />
        )
    }

    // ExitPlanMode - show plan summary
    if (toolType === 'tool-ExitPlanMode' || toolType === 'tool-exitplanmode') {
        return (
            <AgentExitPlanModeTool
                part={{
                    ...part,
                    output: {
                        plan: typeof output.plan === 'string' ? output.plan : undefined,
                        success: output.success as boolean | undefined
                    }
                }}
                chatStatus={chatStatus}
            />
        )
    }

    // Image generation tools - use dedicated component with shimmer and lightbox
    if (toolType === 'tool-generate_image' || toolType === 'tool-edit_image') {
        const prompt = typeof input.prompt === 'string' ? input.prompt : 'Generated image'
        const imageUrl = isRecord(output) && typeof output.imageUrl === 'string' ? output.imageUrl : undefined
        const size = typeof input.size === 'string' ? input.size : '1024x1024'
        const quality = typeof input.quality === 'string' ? input.quality : 'high'
        const errorMsg = isRecord(output) && typeof output.error === 'string' ? output.error : undefined
        
        const status = isComplete && imageUrl 
            ? 'complete' 
            : isComplete && !imageUrl 
                ? 'error' 
                : 'generating'
        
        return (
            <AgentImageGeneration
                prompt={prompt}
                imageUrl={imageUrl}
                size={size}
                quality={quality}
                status={status}
                error={errorMsg}
            />
        )
    }

    const meta = AgentToolRegistry[toolType]
    const fallbackMeta = AgentToolRegistry['tool-Task']
    const { isPending, isError } = getToolStatus(part, chatStatus)

    const title = meta?.title ? meta.title(part) : toolCall.name
    const subtitle = meta?.subtitle ? meta.subtitle(part) : undefined
    const icon = meta?.icon ?? fallbackMeta?.icon

    const artifactId = isRecord(toolCall.result) && 'artifactId' in toolCall.result
        ? String(toolCall.result.artifactId)
        : null
    const hasArtifact = artifactId && (toolType === 'tool-create_spreadsheet' || toolType === 'tool-create_document')

    return (
        <div className="space-y-2">
            {icon && (
                <AgentToolCall
                    icon={icon}
                    title={title}
                    subtitle={subtitle}
                    isPending={isPending}
                    isError={isError}
                />
            )}
            {isComplete && hasArtifact && (
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-background/50 hover:bg-background border-border/60"
                    onClick={() => onViewArtifact?.(artifactId)}
                >
                    View Artifact
                </Button>
            )}
        </div>
    )
})

/** 
 * ToolCallsRenderer - Separates special tools (individual) from simple tools (grouped)
 * Special tools get their dedicated components, simple tools are grouped for compact display
 */
const ToolCallsRenderer = memo(function ToolCallsRenderer({
    toolCalls,
    chatStatus,
    onViewArtifact,
    isStreaming = false
}: {
    toolCalls: ToolCall[]
    chatStatus?: string
    onViewArtifact?: (id: string) => void
    isStreaming?: boolean
}) {
    const { special, simple } = separateToolCalls(toolCalls)
    
    return (
        <div className="space-y-2">
            {/* Special tools - render individually with dedicated components */}
            {special.map((tc) => (
                <AgentToolRenderer
                    key={tc.id}
                    toolCall={tc}
                    chatStatus={chatStatus}
                    onViewArtifact={onViewArtifact}
                />
            ))}
            
            {/* Simple tools - render grouped */}
            {simple.length > 0 && (
                <AgentToolCallsGroup
                    toolCalls={simple}
                    chatStatus={chatStatus}
                    onViewArtifact={onViewArtifact}
                    isStreaming={isStreaming}
                />
            )}
        </div>
    )
})

// ============================================================================
// Sources Indicator Component
// ============================================================================

interface UrlCitationData {
    type: 'url_citation'
    url: string
    title?: string
    startIndex: number
    endIndex: number
}

interface FileCitationData {
    type: 'file_citation'
    fileId: string
    filename: string
    index: number
}

type CitationData = UrlCitationData | FileCitationData

/** Get favicon URL from Google's favicon service */
function getFaviconUrl(url: string): string {
    try {
        const domain = new URL(url).hostname
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
    } catch {
        return ''
    }
}

/** Get domain from URL */
function getDomain(url: string): string {
    try {
        return new URL(url).hostname.replace('www.', '')
    } catch {
        return url
    }
}

/** Get file extension icon color */
function getFileExtensionColor(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    const colors: Record<string, string> = {
        pdf: 'text-red-500',
        doc: 'text-blue-500',
        docx: 'text-blue-500',
        txt: 'text-gray-500',
        md: 'text-purple-500',
        csv: 'text-green-500',
        xlsx: 'text-green-600',
        xls: 'text-green-600',
    }
    return colors[ext] || 'text-muted-foreground'
}

/** Sources indicator with stacked icons - shown in message action bar */
const SourcesIndicator = memo(function SourcesIndicator({ 
    annotations 
}: { 
    annotations: CitationData[] 
}) {
    const [isExpanded, setIsExpanded] = useState(false)
    
    // Separate URL and file citations
    const urlCitations = annotations.filter((a): a is UrlCitationData => a.type === 'url_citation')
    const fileCitations = annotations.filter((a): a is FileCitationData => a.type === 'file_citation')
    
    // Deduplicate URL citations by URL
    const uniqueUrlCitations = urlCitations.reduce((acc, annotation) => {
        if (!acc.some(a => a.url === annotation.url)) {
            acc.push(annotation)
        }
        return acc
    }, [] as UrlCitationData[])
    
    // Deduplicate file citations by fileId
    const uniqueFileCitations = fileCitations.reduce((acc, annotation) => {
        if (!acc.some(a => a.fileId === annotation.fileId)) {
            acc.push(annotation)
        }
        return acc
    }, [] as FileCitationData[])
    
    const totalSources = uniqueUrlCitations.length + uniqueFileCitations.length
    
    if (totalSources === 0) return null
    
    // Get unique domains for URL stacking (max 2 visible)
    const uniqueDomains = uniqueUrlCitations.reduce((acc, annotation) => {
        const domain = getDomain(annotation.url)
        if (!acc.some(a => getDomain(a.url) === domain)) {
            acc.push(annotation)
        }
        return acc
    }, [] as UrlCitationData[])
    
    const visibleUrlCount = Math.min(2, uniqueDomains.length)
    const visibleFilesCount = Math.min(2, uniqueFileCitations.length)
    const visibleUrls = uniqueDomains.slice(0, visibleUrlCount)
    const visibleFiles = uniqueFileCitations.slice(0, visibleFilesCount)
    
    return (
        <div className="relative">
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="h-6 px-2 flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/50 rounded-md transition-colors"
                    >
                        {/* Stacked icons */}
                        <div className="flex items-center">
                            {/* File icons first */}
                            {visibleFiles.map((file, index) => (
                                <div
                                    key={`file-${file.fileId}-${index}`}
                                    className="relative rounded-full bg-background border border-border overflow-hidden flex items-center justify-center"
                                    style={{ 
                                        marginLeft: index > 0 ? '-4px' : 0,
                                        zIndex: visibleFilesCount + visibleUrlCount - index,
                                        width: 16,
                                        height: 16
                                    }}
                                >
                                    <IconFile size={10} className={getFileExtensionColor(file.filename)} />
                                </div>
                            ))}
                            {/* URL favicons */}
                            {visibleUrls.map((annotation, index) => {
                                const faviconUrl = getFaviconUrl(annotation.url)
                                return (
                                    <div
                                        key={`url-${annotation.url}-${index}`}
                                        className="relative rounded-full bg-background border border-border overflow-hidden"
                                        style={{ 
                                            marginLeft: (index > 0 || visibleFiles.length > 0) ? '-4px' : 0,
                                            zIndex: visibleUrlCount - index,
                                            width: 16,
                                            height: 16
                                        }}
                                    >
                                        {faviconUrl ? (
                                            <img
                                                src={faviconUrl}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none'
                                                    const parent = e.currentTarget.parentElement
                                                    if (parent) {
                                                        parent.classList.add('flex', 'items-center', 'justify-center')
                                                        parent.innerHTML = '<span class="text-[8px]">🌐</span>'
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <IconWorld size={10} className="text-muted-foreground" />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        
                        {/* Source count */}
                        <span className="font-medium">
                            {totalSources} source{totalSources !== 1 ? 's' : ''}
                        </span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top">Click to view sources</TooltipContent>
            </Tooltip>
            
            {/* Expanded dropdown */}
            {isExpanded && (
                <>
                    {/* Backdrop to close on click outside */}
                    <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsExpanded(false)}
                        onKeyDown={(e) => e.key === 'Escape' && setIsExpanded(false)}
                        role="button"
                        tabIndex={-1}
                        aria-label="Close sources panel"
                    />
                    <div className="absolute bottom-full left-0 mb-1 z-50 w-80 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                        <div className="p-2 space-y-0.5">
                            {/* File citations section */}
                            {uniqueFileCitations.length > 0 && (
                                <>
                                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                        Documents
                                    </div>
                                    {uniqueFileCitations.map((file, index) => (
                                        <div
                                            key={`file-${file.fileId}-${index}`}
                                            className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors group"
                                        >
                                            <IconFile size={14} className={cn("shrink-0", getFileExtensionColor(file.filename))} />
                                            <span className="text-xs text-muted-foreground group-hover:text-foreground truncate flex-1">
                                                {file.filename}
                                            </span>
                                        </div>
                                    ))}
                                </>
                            )}
                            
                            {/* URL citations section */}
                            {uniqueUrlCitations.length > 0 && (
                                <>
                                    {uniqueFileCitations.length > 0 && (
                                        <div className="my-1 border-t border-border/50" />
                                    )}
                                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                        Web Sources
                                    </div>
                                    {uniqueUrlCitations.map((annotation, index) => (
                                        <a
                                            key={`url-${annotation.url}-${index}`}
                                            href={annotation.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors group"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <img
                                                src={getFaviconUrl(annotation.url)}
                                                alt=""
                                                className="w-4 h-4 rounded-sm shrink-0"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none'
                                                }}
                                            />
                                            <span className="text-xs text-muted-foreground group-hover:text-foreground truncate flex-1">
                                                {annotation.title || getDomain(annotation.url)}
                                            </span>
                                            <IconExternalLink size={12} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                                        </a>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
})

// ============================================================================
// Ver Charts Button - Opens artifact panel with charts
// ============================================================================

interface ViewChartsButtonProps {
    chartArtifactIds: string[]
}

/** Button to view charts - shown after messages that created charts */
const ViewChartsButton = memo(function ViewChartsButton({ chartArtifactIds }: ViewChartsButtonProps) {
    const setSelectedArtifact = useSetAtom(selectedArtifactAtom)
    const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom)
    const [isLoading, setIsLoading] = useState(false)

    if (chartArtifactIds.length === 0) return null

    const handleViewCharts = async () => {
        setIsLoading(true)
        try {
            // Fetch the first chart and open the panel
            const artifact = await trpcClient.artifacts.get.query({ id: chartArtifactIds[0] })
            if (artifact) {
                setSelectedArtifact(artifact)
                setArtifactPanelOpen(true)
            }
        } catch (error) {
            console.error('[ViewChartsButton] Failed to fetch chart:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const chartCount = chartArtifactIds.length
    const label = chartCount === 1 ? 'Ver Chart' : `Ver ${chartCount} Charts`

    return (
        <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 hover:border-primary/40 hover:bg-primary/15 transition-all"
            onClick={handleViewCharts}
            disabled={isLoading}
        >
            {isLoading ? (
                <IconLoader2 size={14} className="animate-spin" />
            ) : (
                <IconChartBar size={14} className="text-primary" />
            )}
            <span className="text-xs font-medium">{label}</span>
        </Button>
    )
})
