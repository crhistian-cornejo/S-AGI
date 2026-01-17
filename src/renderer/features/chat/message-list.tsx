import { IconUser, IconTable, IconLoader2, IconCheck, IconTool, IconExternalLink } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ChatMarkdownRenderer } from '@/components/chat-markdown-renderer'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'

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
    onViewArtifact?: (artifactId: string) => void
}

export function MessageList({ messages, isLoading, streamingText, streamingToolCalls, onViewArtifact }: MessageListProps) {
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
            {isLoading && (streamingText || (streamingToolCalls && streamingToolCalls.length > 0)) && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex items-start gap-4">
                        <AssistantAvatar />
                        <div className="flex-1 min-w-0 space-y-4 pt-0.5">
                            {streamingText && (
                                <div className="prose-container relative">
                                    <ChatMarkdownRenderer content={streamingText} size="md" />
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
            {isLoading && !streamingText && (!streamingToolCalls || streamingToolCalls.length === 0) && (
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
}



function AssistantAvatar() {
    return (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
            <Logo size={32} />
        </div>
    )
}

function MessageItem({ message, onViewArtifact }: { message: Message; onViewArtifact?: (id: string) => void }) {
    const isUser = message.role === 'user'
    let content = ''

    // Helper to safely parse JSON content
    const parseContent = (c: any): string => {
        if (typeof c === 'string') {
            // Check if it's the specific JSON object we want to hide or parse
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
            return c.map((item: any) => item.text || '').join('')
        }
        if (typeof c === 'object' && c !== null) {
            return ('text' in c) ? c.text : JSON.stringify(c)
        }
        return String(c)
    }

    content = parseContent(message.content)

    if (isUser) {
        return (
            <div className="flex flex-col items-end gap-2 group">
                <div className="max-w-[100%] bg-primary text-primary-foreground rounded-[24px] px-5 py-3 transition-all hover:bg-primary/90 shadow-sm">
                    <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{content}</p>
                </div>
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

                {message.tool_calls && message.tool_calls.length > 0 && (
                    <div className="space-y-3">
                        {message.tool_calls.map((tc: any) => (
                            <ToolCallCard
                                key={tc.id}
                                toolCall={{ ...tc, status: 'complete' }}
                                onViewArtifact={onViewArtifact}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function ToolCallCard({ toolCall, onViewArtifact }: { toolCall: ToolCall; onViewArtifact?: (id: string) => void }) {
    const isComplete = toolCall.status === 'complete'
    const isExecuting = toolCall.status === 'executing'

    // Check if we have an artifact ID in the result
    const artifactId = isComplete && toolCall.result && typeof toolCall.result === 'object' && 'artifactId' in toolCall.result
        ? (toolCall.result as any).artifactId
        : null

    const getToolIcon = () => {
        switch (toolCall.name) {
            case 'create_spreadsheet':
                return <IconTable size={18} />
            default:
                return <IconTool size={18} />
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
                <div className="shrink-0 pr-1">
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

            {/* Action Buttons for Artifacts */}
            {artifactId && (
                <div className="pl-[3.5rem] animate-in slide-in-from-top-2 fade-in duration-300">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs bg-background/50 hover:bg-background border-emerald-500/20 hover:border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                        onClick={() => onViewArtifact?.(artifactId)}
                    >
                        <IconTable size={14} className="mr-2" />
                        View Spreadsheet
                    </Button>
                </div>
            )}
        </div>
    )
}
