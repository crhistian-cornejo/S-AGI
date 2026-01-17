import { useRef, useEffect } from 'react'
import { useAtom } from 'jotai'
import {
    IconSend,
    IconTable,
    IconChartBar,
    IconPlayerStop
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { chatModeAtom } from '@/lib/atoms'
import { cn } from '@/lib/utils'

interface ChatInputProps {
    value: string
    onChange: (value: string) => void
    onSend: () => void
    onStop?: () => void
    isLoading: boolean
}

export function ChatInput({ value, onChange, onSend, onStop, isLoading }: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [mode, setMode] = useAtom(chatModeAtom)

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.style.height = 'auto'
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
        }
    }, [value])

    // Focus textarea on mount
    useEffect(() => {
        textareaRef.current?.focus()
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!isLoading && value.trim()) {
                onSend()
            }
        }
    }

    const insertCommand = (text: string) => {
        onChange(value + text)
        textareaRef.current?.focus()
    }

    const canSend = value.trim().length > 0 && !isLoading

    return (
        <div className="space-y-2">
            {/* Quick action buttons */}
            <div className="flex items-center gap-1 flex-wrap">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                            onClick={() => insertCommand('Create a spreadsheet with ')}
                        >
                            <IconTable size={14} />
                            Spreadsheet
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create a new spreadsheet</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                            onClick={() => insertCommand('Create a chart showing ')}
                        >
                            <IconChartBar size={14} />
                            Chart
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create a chart</TooltipContent>
                </Tooltip>

                {/* Mode toggle */}
                <div className="ml-auto flex items-center gap-1">
                    <button
                        onClick={() => setMode('agent')}
                        className={cn(
                            'px-2 py-1 text-xs rounded-md transition-colors',
                            mode === 'agent'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                    >
                        Agent
                    </button>
                    <button
                        onClick={() => setMode('plan')}
                        className={cn(
                            'px-2 py-1 text-xs rounded-md transition-colors',
                            mode === 'plan'
                                ? 'bg-orange-500 text-white'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                    >
                        Plan
                    </button>
                </div>
            </div>

            {/* Input area */}
            <div className="relative flex items-end gap-2 bg-muted/50 rounded-xl border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        mode === 'plan'
                            ? 'Describe what you want to plan...'
                            : 'Describe the spreadsheet you want to create...'
                    }
                    className="flex-1 bg-transparent resize-none outline-none text-sm min-h-[52px] max-h-[200px] py-3.5 px-4 placeholder:text-muted-foreground/60"
                    rows={1}
                    disabled={isLoading}
                />

                {/* Send/Stop button */}
                <div className="p-2">
                    {isLoading ? (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive"
                            onClick={onStop}
                        >
                            <IconPlayerStop size={18} />
                        </Button>
                    ) : (
                        <Button
                            size="icon"
                            className={cn(
                                'h-9 w-9 rounded-lg transition-all',
                                canSend
                                    ? 'bg-primary hover:bg-primary/90 shadow-md shadow-primary/25'
                                    : 'bg-muted text-muted-foreground'
                            )}
                            onClick={onSend}
                            disabled={!canSend}
                        >
                            <IconSend size={18} />
                        </Button>
                    )}
                </div>
            </div>

            {/* Hint */}
            <p className="text-[11px] text-muted-foreground/60 text-center">
                Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> to send,{' '}
                <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Shift+Enter</kbd> for new line
            </p>
        </div>
    )
}
