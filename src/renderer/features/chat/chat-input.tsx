import { useRef, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { AnimatedLogo } from './animated-logo'
import {
    IconArrowUp,
    IconPlayerStop,
    IconInfinity,
    IconAt,
    IconPaperclip,
    IconBrightness
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    chatModeAtom,
    currentProviderAtom,
    selectedModelAtom
} from '@/lib/atoms'
import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

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
    const [_provider, setProvider] = useAtom(currentProviderAtom)
    const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom)

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.style.height = 'auto'
            textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`
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

    const canSend = value.trim().length > 0 && !isLoading

    const handleModelChange = (modelId: string) => {
        setSelectedModel(modelId)
        // Check which provider this model belongs to
        if (modelId.startsWith('gpt') || modelId.startsWith('o1')) {
            setProvider('openai')
        } else {
            setProvider('anthropic')
        }
    }

    const [phraseIndex, setPhraseIndex] = useState(0)
    const phrases = ['Pensando', 'Analizando', 'Generando', 'Refinando']

    useEffect(() => {
        if (isLoading) {
            const interval = setInterval(() => {
                setPhraseIndex((prev: number) => (prev + 1) % phrases.length)
            }, 2000)
            return () => clearInterval(interval)
        }
    }, [isLoading])

    return (
        <div className="relative flex flex-col gap-2 w-full max-w-3xl mx-auto px-4 pb-4">
            {/* Status Indicator - Unified Animated Tab */}
            <div className={cn(
                "absolute -top-[30px] left-8 z-30 transition-all duration-700 ease-in-out",
                isLoading ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
            )}>
                <div className="flex items-center gap-3 px-4 py-1.5 rounded-t-2xl bg-background/90 backdrop-blur-3xl border border-border border-b-transparent shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.5)] min-w-[140px]">
                    <AnimatedLogo className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black tracking-[0.25em] uppercase text-primary animate-pulse italic drop-shadow-[0_0_10px_rgba(var(--primary),0.4)]">
                        {phrases[phraseIndex]}<span className="animate-bounce inline-block">...</span>
                    </span>
                </div>
            </div>

            {/* Main Input Container */}
            <div className={cn(
                "relative flex flex-col bg-background/50 backdrop-blur-xl rounded-[24px] border border-border shadow-2xl transition-all duration-300 group px-2 pt-2 pb-2",
                "focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/5",
                isLoading && "pb-3" // Remove opacity-80 to keep it clear
            )}>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Plan, @ for context, / for commands"
                    className="w-full bg-transparent resize-none outline-none text-[15px] leading-relaxed min-h-[60px] max-h-[400px] pt-2 pb-2 px-3 placeholder:text-muted-foreground/40 transition-all font-normal"
                    rows={1}
                    disabled={isLoading}
                />

                {/* Bottom Bar Controls */}
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-0.5">
                        {/* Agent/Plan Selector */}
                        <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                            <SelectTrigger className="h-8 w-auto min-w-[80px] px-2.5 bg-transparent border-none shadow-none hover:bg-accent/50 gap-1.5 rounded-xl text-xs font-semibold">
                                <IconInfinity size={15} className="text-primary" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl shadow-xl border-border/50">
                                <SelectItem value="agent" className="rounded-lg">Agent</SelectItem>
                                <SelectItem value="plan" className="rounded-lg">Plan</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="w-px h-3.5 bg-border/40 mx-1" />

                        {/* Model Selector */}
                        <Select value={selectedModel} onValueChange={handleModelChange}>
                            <SelectTrigger className="h-8 w-auto px-2.5 bg-transparent border-none shadow-none hover:bg-accent/50 gap-1.5 rounded-xl text-xs font-semibold">
                                <IconBrightness size={15} className="text-muted-foreground" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl shadow-xl border-border/50 min-w-[180px]">
                                <div className="text-[10px] font-bold uppercase text-muted-foreground/50 px-3 py-2">Anthropic</div>
                                <SelectItem value="claude-3-5-sonnet-20240620" className="rounded-lg">Claude 3.5 Sonnet</SelectItem>
                                <SelectItem value="claude-3-opus-20240229" className="rounded-lg">Claude 3 Opus</SelectItem>

                                <div className="text-[10px] font-bold uppercase text-muted-foreground/50 px-3 py-2 border-t mt-1">OpenAI</div>
                                <SelectItem value="gpt-4o" className="rounded-lg">GPT-4o</SelectItem>
                                <SelectItem value="gpt-4o-mini" className="rounded-lg">GPT-4o Mini</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1">
                        <TooltipProvider delayDuration={0}>
                            <div className="flex items-center gap-0.5 mr-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 rounded-xl">
                                            <IconPaperclip size={18} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Attach file</p>
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-foreground hover:bg-accent/50 rounded-xl">
                                            <IconAt size={18} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Mention context</p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </TooltipProvider>

                        {isLoading ? (
                            <Button
                                size="icon"
                                className="h-8 w-8 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all shrink-0"
                                onClick={onStop}
                            >
                                <IconPlayerStop size={14} fill="currentColor" />
                            </Button>
                        ) : (
                            <Button
                                size="icon"
                                className={cn(
                                    "h-8 w-8 rounded-full transition-all shrink-0",
                                    canSend
                                        ? "bg-foreground text-background hover:bg-foreground/90 shadow-lg shadow-foreground/10"
                                        : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                                )}
                                onClick={onSend}
                                disabled={!canSend}
                            >
                                <IconArrowUp size={18} strokeWidth={2.5} />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

