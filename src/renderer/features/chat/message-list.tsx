import { IconUser, IconTable, IconLoader2, IconCheck, IconTool, IconSparkles } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ChatMarkdownRenderer } from '@/components/chat-markdown-renderer'

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: any
    tool_calls?: any
    created_at: string
}

interface ToolCall {
    id: string
    name: string
    args: string
    status: 'streaming' | 'done' | 'executing' | 'complete'
    result?: unknown
}

interface MessageListProps {
    messages: Message[]
    isLoading: boolean
    streamingText?: string
    streamingToolCalls?: ToolCall[]
}

export function MessageList({ messages, isLoading, streamingText, streamingToolCalls }: MessageListProps) {
    if (messages.length === 0 && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <IconSparkles size={32} className="text-primary" />
                </div>
                <p className="text-base font-medium text-foreground">Start a conversation to create spreadsheets</p>
                <p className="text-sm text-muted-foreground mt-1">Describe what you want and AI will create it for you</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 px-4 py-6">
            {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
            ))}

            {/* Streaming response */}
            {isLoading && (streamingText || (streamingToolCalls && streamingToolCalls.length > 0)) && (
                <div className="flex gap-3">
                    <AssistantAvatar />
                    <div className="flex-1 min-w-0 space-y-3">
                        {/* Streaming text */}
                        {streamingText && (
                            <div className="prose-container">
                                <ChatMarkdownRenderer content={streamingText} size="md" />
                                <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-0.5 rounded-sm" />
                            </div>
                        )}
                        
                        {/* Tool calls */}
                        {streamingToolCalls && streamingToolCalls.length > 0 && (
                            <div className="space-y-2">
                                {streamingToolCalls.map((tc) => (
                                    <ToolCallCard key={tc.id} toolCall={tc} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Loading indicator when waiting for response */}
            {isLoading && !streamingText && (!streamingToolCalls || streamingToolCalls.length === 0) && (
                <div className="flex gap-3">
                    <AssistantAvatar />
                    <div className="flex items-center gap-1.5 py-2">
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                </div>
            )}
        </div>
    )
}

function AssistantAvatar() {
    return (
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 shadow-sm">
            <IconSparkles size={16} className="text-primary" />
        </div>
    )
}

function UserAvatar() {
    return (
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-sm">
            <IconUser size={16} className="text-primary-foreground" />
        </div>
    )
}

function MessageBubble({ message }: { message: Message }) {
    const isUser = message.role === 'user'
    const content = typeof message.content === 'string'
        ? message.content
        : message.content?.text || JSON.stringify(message.content)

    if (isUser) {
        return (
            <div className="flex gap-3 justify-end">
                <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-2.5 shadow-sm">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
                </div>
                <UserAvatar />
            </div>
        )
    }

    return (
        <div className="flex gap-3">
            <AssistantAvatar />
            <div className="flex-1 min-w-0 space-y-3">
                {/* Message content with markdown */}
                <div className="prose-container">
                    <ChatMarkdownRenderer content={content} size="md" />
                </div>
                
                {/* Tool calls from saved message */}
                {message.tool_calls && message.tool_calls.length > 0 && (
                    <div className="space-y-2">
                        {message.tool_calls.map((tc: any) => (
                            <ToolCallCard 
                                key={tc.id} 
                                toolCall={{ ...tc, status: 'complete' }} 
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
    const isComplete = toolCall.status === 'complete'
    const isExecuting = toolCall.status === 'executing'

    const getToolIcon = () => {
        switch (toolCall.name) {
            case 'create_spreadsheet':
                return <IconTable size={16} />
            default:
                return <IconTool size={16} />
        }
    }

    const getToolDisplayName = () => {
        switch (toolCall.name) {
            case 'create_spreadsheet':
                return 'Creating Spreadsheet'
            case 'update_cells':
                return 'Updating Cells'
            case 'insert_formula':
                return 'Inserting Formula'
            default:
                return toolCall.name
        }
    }

    const getStatusText = () => {
        if (isComplete && toolCall.result && typeof toolCall.result === 'object' && 'message' in toolCall.result) {
            return (toolCall.result as { message: string }).message
        }
        switch (toolCall.status) {
            case 'streaming':
                return 'Preparing...'
            case 'done':
                return 'Ready to execute'
            case 'executing':
                return 'Working...'
            case 'complete':
                return 'Completed'
            default:
                return ''
        }
    }

    return (
        <div className={cn(
            'flex items-center gap-3 rounded-xl p-3 border transition-colors',
            isComplete 
                ? 'bg-green-500/5 border-green-500/20' 
                : 'bg-muted/50 border-border/50'
        )}>
            <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                isComplete ? 'bg-green-500/10 text-green-600' : 'bg-primary/10 text-primary'
            )}>
                {getToolIcon()}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{getToolDisplayName()}</p>
                <p className="text-xs text-muted-foreground truncate">{getStatusText()}</p>
            </div>
            <div className="shrink-0">
                {isComplete ? (
                    <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                        <IconCheck size={14} className="text-green-600" />
                    </div>
                ) : (
                    <IconLoader2 size={18} className={cn(
                        'text-primary',
                        isExecuting ? 'animate-spin' : 'animate-pulse'
                    )} />
                )}
            </div>
        </div>
    )
}
