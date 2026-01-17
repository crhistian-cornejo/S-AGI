import { memo } from 'react'
import { IconTable, IconLoader2, IconCheck, IconTool, IconFileText } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ChatMarkdownRenderer } from '@/components/chat-markdown-renderer'
import { MessageAttachments } from '@/components/message-attachments'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { AgentReasoning } from '@/features/agent'

// ============================================================================
// Constants - Tool name sets for O(1) lookups
// ============================================================================
const SPREADSHEET_TOOLS = new Set([
    'create_spreadsheet', 'update_cells', 'insert_formula',
    'format_cells', 'merge_cells', 'set_column_width', 'set_row_height',
    'add_row', 'delete_row', 'get_spreadsheet_summary'
])

const DOCUMENT_TOOLS = new Set([
    'create_document', 'update_document', 'get_document_content'
])

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

// ============================================================================
// Types
// ============================================================================

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: unknown
    tool_calls?: Array<{
        id: string
        name: string
        args: unknown
        result?: unknown
    }>
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

interface MessageListProps {
    messages: Message[]
    isLoading: boolean
    streamingText?: string
    streamingToolCalls?: ToolCall[]
    streamingReasoning?: string
    isReasoning?: boolean
    onViewArtifact?: (artifactId: string) => void
}

// ============================================================================
// Components
// ============================================================================

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
    isReasoning,
    onViewArtifact 
}: MessageListProps) {
    if (messages.length === 0 && !isLoading) {
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
        <div className="space-y-12 px-4 py-8 max-w-3xl mx-auto">
            {messages.map((message) => (
                <div key={message.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <MessageItem message={message} onViewArtifact={onViewArtifact} />
                </div>
            ))}

            {/* Streaming response */}
            {isLoading && (streamingText || streamingReasoning || (streamingToolCalls && streamingToolCalls.length > 0)) && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex items-start gap-4">
                        <AssistantAvatar />
                        <div className="flex-1 min-w-0 space-y-4 pt-0.5">
                            {/* Reasoning section - shows AI thinking process */}
                            {(isReasoning || streamingReasoning) && (
                                <AgentReasoning
                                    content={streamingReasoning || ''}
                                    isStreaming={isReasoning}
                                    className="mb-3"
                                />
                            )}

                            {streamingText && (
                                <div className="prose-container relative">
                                    <ChatMarkdownRenderer content={streamingText} size="md" isAnimating />
                                    <span className="inline-block w-1.5 h-4 bg-primary/40 animate-pulse ml-1 align-middle rounded-sm" />
                                </div>
                            )}

                            {streamingToolCalls && streamingToolCalls.length > 0 && (
                                <div className="space-y-3">
                                    {streamingToolCalls.map((tc) => (
                                        <ToolCallCard key={tc.id} toolCall={tc} onViewArtifact={onViewArtifact} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Initial Loading / Thinking State */}
            {isLoading && !streamingText && !streamingReasoning && (!streamingToolCalls || streamingToolCalls.length === 0) && (
                <div className="flex gap-4 animate-in fade-in duration-500">
                    <AssistantAvatar />
                    <div className="flex-1 space-y-3 pt-2">
                        <div className="h-4 w-[85%] rounded-lg animate-shimmer" />
                        <div className="h-4 w-[60%] rounded-lg animate-shimmer" />
                    </div>
                </div>
            )}
        </div>
    )
})

/** Individual message item - memoized */
const MessageItem = memo(function MessageItem({ 
    message, 
    onViewArtifact 
}: { 
    message: Message
    onViewArtifact?: (id: string) => void 
}) {
    const isUser = message.role === 'user'
    const content = parseContent(message.content)

    if (isUser) {
        return (
            <div className="flex flex-col items-end gap-2 group">
                <div className="max-w-[100%] bg-primary text-primary-foreground rounded-[24px] px-5 py-3 transition-all hover:bg-primary/90 shadow-sm">
                    <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{content}</p>
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
        <div className="flex items-start gap-4">
            <AssistantAvatar />
            <div className="flex-1 min-w-0 space-y-4 pt-0.5">
                {content && (
                    <div className="prose-container">
                        <ChatMarkdownRenderer content={content} size="md" />
                    </div>
                )}

                {/* Show attachments for assistant messages */}
                {message.attachments && message.attachments.length > 0 && (
                    <MessageAttachments 
                        attachments={message.attachments} 
                    />
                )}

                {message.tool_calls && message.tool_calls.length > 0 && (
                    <div className="space-y-3">
                        {message.tool_calls.map((tc) => (
                            <ToolCallCard
                                key={tc.id}
                                toolCall={{ ...tc, args: JSON.stringify(tc.args), status: 'complete' }}
                                onViewArtifact={onViewArtifact}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
})

/** Tool call card - memoized */
const ToolCallCard = memo(function ToolCallCard({ 
    toolCall, 
    onViewArtifact 
}: { 
    toolCall: ToolCall
    onViewArtifact?: (id: string) => void 
}) {
    const isComplete = toolCall.status === 'complete'
    const isExecuting = toolCall.status === 'executing'

    // Check if we have an artifact ID in the result
    const artifactId = toolCall.result && typeof toolCall.result === 'object' && 'artifactId' in toolCall.result
        ? (toolCall.result as { artifactId: string }).artifactId
        : null

    // Determine tool type using Set lookups (O(1))
    const isSpreadsheetTool = SPREADSHEET_TOOLS.has(toolCall.name)
    const isDocumentTool = DOCUMENT_TOOLS.has(toolCall.name)
    const hasArtifact = artifactId && (isSpreadsheetTool || isDocumentTool)

    const getToolIcon = () => {
        if (isSpreadsheetTool) return <IconTable size={18} />
        if (isDocumentTool) return <IconFileText size={18} />
        return <IconTool size={18} />
    }

    const getToolDisplayName = () => {
        const displayNames: Record<string, string> = {
            // Spreadsheet tools
            'create_spreadsheet': 'Creating Spreadsheet',
            'update_cells': 'Updating Cells',
            'insert_formula': 'Inserting Formula',
            'format_cells': 'Formatting Cells',
            'merge_cells': 'Merging Cells',
            'set_column_width': 'Setting Column Width',
            'set_row_height': 'Setting Row Height',
            'add_row': 'Adding Row',
            'delete_row': 'Deleting Row',
            'get_spreadsheet_summary': 'Reading Spreadsheet',
            // Document tools
            'create_document': 'Creating Document',
            'update_document': 'Updating Document',
            'get_document_content': 'Reading Document',
        }
        return displayNames[toolCall.name] || toolCall.name
    }

    const getStatusText = () => {
        if (isComplete && toolCall.result && typeof toolCall.result === 'object' && 'message' in toolCall.result) {
            return (toolCall.result as { message: string }).message
        }
        switch (toolCall.status) {
            case 'streaming': return 'Gathering data...'
            case 'done': return 'Ready'
            case 'executing': return 'Executing...'
            case 'complete': return 'Success'
            default: return ''
        }
    }

    return (
        <div className={cn(
            'flex flex-col gap-3 rounded-2xl p-4 border transition-all duration-300',
            isComplete
                ? 'bg-emerald-500/[0.03] border-emerald-500/20 shadow-sm'
                : 'bg-accent/20 border-border/50 shadow-none'
        )}>
            <div className="flex items-center gap-4">
                <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-colors',
                    isComplete ? 'bg-emerald-500/10 text-emerald-600' : 'bg-background border border-border/50 text-foreground/60'
                )}>
                    {getToolIcon()}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">{getToolDisplayName()}</p>
                    <p className="text-[13px] text-muted-foreground mt-0.5 truncate font-medium">{getStatusText()}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    {/* View Artifact Button - show for completed tools with artifactId */}
                    {isComplete && hasArtifact && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs bg-background/50 hover:bg-background border-emerald-500/20 hover:border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                            onClick={() => onViewArtifact?.(artifactId)}
                        >
                            {isSpreadsheetTool ? (
                                <IconTable size={14} className="mr-1.5" />
                            ) : (
                                <IconFileText size={14} className="mr-1.5" />
                            )}
                            View Artifact
                        </Button>
                    )}
                    {isComplete ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <IconCheck size={12} className="text-emerald-600" strokeWidth={3} />
                        </div>
                    ) : (
                        <IconLoader2 size={20} className={cn(
                            'text-foreground/20',
                            isExecuting ? 'animate-spin' : 'animate-pulse'
                        )} />
                    )}
                </div>
            </div>
        </div>
    )
})
