import { memo, useState } from 'react'
import { IconFileCode, IconChevronDown, IconChevronUp, IconCheck, IconLoader2, IconPlus, IconMinus } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export interface EditResult {
    success: boolean
    filePath: string
    linesAdded?: number
    linesRemoved?: number
    error?: string
}

export interface AgentEditProps {
    toolCallId: string
    args: {
        filePath: string
        oldString?: string
        newString?: string
        replaceAll?: boolean
    }
    result?: EditResult
    status: 'pending' | 'executing' | 'complete' | 'error'
    className?: string
}

function AgentEditBase({ args, result, status, className }: AgentEditProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    const isComplete = status === 'complete'
    const isError = status === 'error' || (result && !result.success)
    const isExecuting = status === 'executing'

    const getStatusIcon = () => {
        if (isExecuting) return <IconLoader2 size={14} className="animate-spin text-orange-500" />
        if (isError) return <IconMinus size={14} className="text-red-500" />
        if (isComplete) return <IconCheck size={14} className="text-emerald-500" />
        return <IconLoader2 size={14} className="animate-pulse text-muted-foreground" />
    }

    // Get filename from path
    const fileName = args.filePath.split('/').pop() || args.filePath

    return (
        <div className={cn(
            'rounded-xl border overflow-hidden transition-all duration-200',
            isError 
                ? 'bg-red-500/5 border-red-500/20' 
                : isComplete 
                    ? 'bg-orange-500/5 border-orange-500/20'
                    : 'bg-muted/30 border-border/50',
            className
        )}>
            {/* Header */}
            <button 
                type="button"
                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-muted/30 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    isError ? 'bg-red-500/10' : isComplete ? 'bg-orange-500/10' : 'bg-muted'
                )}>
                    <IconFileCode size={16} className={cn(
                        isError ? 'text-red-500' : isComplete ? 'text-orange-600' : 'text-muted-foreground'
                    )} />
                </div>
                
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                            Editing file
                        </span>
                        {getStatusIcon()}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono truncate block mt-0.5">
                        {fileName}
                    </span>
                </div>

                {/* Change stats */}
                {isComplete && (result?.linesAdded || result?.linesRemoved) && (
                    <div className="flex items-center gap-2 shrink-0 text-xs font-mono">
                        {result.linesAdded && result.linesAdded > 0 && (
                            <span className="text-emerald-600 flex items-center gap-0.5">
                                <IconPlus size={12} />
                                {result.linesAdded}
                            </span>
                        )}
                        {result.linesRemoved && result.linesRemoved > 0 && (
                            <span className="text-red-500 flex items-center gap-0.5">
                                <IconMinus size={12} />
                                {result.linesRemoved}
                            </span>
                        )}
                    </div>
                )}

                <div className="shrink-0">
                    {isExpanded ? (
                        <IconChevronUp size={16} className="text-muted-foreground" />
                    ) : (
                        <IconChevronDown size={16} className="text-muted-foreground" />
                    )}
                </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t border-border/50 bg-background/50">
                    {/* File path */}
                    <div className="px-4 py-2 border-b border-border/30">
                        <span className="text-xs text-muted-foreground font-mono break-all">
                            {args.filePath}
                        </span>
                    </div>

                    {/* Diff view */}
                    {(args.oldString || args.newString) && (
                        <div className="divide-y divide-border/30">
                            {/* Old string */}
                            {args.oldString && (
                                <div className="bg-red-500/5">
                                    <div className="px-4 py-1 text-[10px] text-red-500 font-medium border-b border-red-500/10">
                                        REMOVED
                                    </div>
                                    <pre className="px-4 py-3 text-xs font-mono text-red-700 dark:text-red-400 overflow-x-auto whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                                        {args.oldString}
                                    </pre>
                                </div>
                            )}
                            
                            {/* New string */}
                            {args.newString && (
                                <div className="bg-emerald-500/5">
                                    <div className="px-4 py-1 text-[10px] text-emerald-500 font-medium border-b border-emerald-500/10">
                                        ADDED
                                    </div>
                                    <pre className="px-4 py-3 text-xs font-mono text-emerald-700 dark:text-emerald-400 overflow-x-auto whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                                        {args.newString}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Replace all indicator */}
                    {args.replaceAll && (
                        <div className="px-4 py-2 border-t border-border/30">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 font-medium">
                                Replace All
                            </span>
                        </div>
                    )}

                    {/* Error */}
                    {result?.error && (
                        <div className="p-4 bg-red-500/5 border-t border-red-500/10">
                            <p className="text-xs text-red-500">{result.error}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export const AgentEdit = memo(AgentEditBase)
