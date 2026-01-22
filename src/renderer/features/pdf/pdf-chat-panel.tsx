import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
    IconSend,
    IconSparkles,
    IconFileText,
    IconLoader2,
    IconX,
    IconMessageCircle,
    IconUser,
    IconRobot,
    IconListDetails,
    IconTrash,
    IconWand
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    pdfChatMessagesAtom,
    pdfChatStreamingAtom,
    pdfSelectedTextAtom,
    pdfCurrentPageAtom,
    type PdfChatMessage,
    type PdfSource
} from '@/lib/atoms'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMarkdownRenderer } from '@/components/chat-markdown-renderer'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface PdfChatPanelProps {
    source: PdfSource
    onClose?: () => void
    className?: string
}

const QUICK_ACTIONS = [
    { id: 'summarize', label: 'Summarize', icon: IconFileText, prompt: (name: string) => `Please provide a concise summary of this PDF document "${name}".` },
    { id: 'key-points', label: 'Key Points', icon: IconListDetails, prompt: (_name: string) => `What are the key points and main takeaways from this document?` },
    { id: 'explain', label: 'Explain', icon: IconWand, prompt: (_name: string, text?: string, page?: number) => text ? `Please explain the following text from page ${page}:\n\n"${text}"` : `Please explain the main concepts in this document.` },
] as const

/**
 * AI Chat Panel for PDF Q&A
 *
 * Features:
 * - Ask questions about the current PDF
 * - Quick actions (Summarize, Key Points, Explain)
 * - Selected text context
 * - Clean, professional design
 */
export const PdfChatPanel = memo(function PdfChatPanel({
    source,
    onClose,
    className
}: PdfChatPanelProps) {
    const [messages, setMessages] = useAtom(pdfChatMessagesAtom)
    const [isStreaming, setIsStreaming] = useAtom(pdfChatStreamingAtom)
    const selectedText = useAtomValue(pdfSelectedTextAtom)
    const currentPage = useAtomValue(pdfCurrentPageAtom)

    const [input, setInput] = useState('')
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Query PDF mutation for AI answers
    const queryPdf = trpc.pdf.queryPdf.useMutation()

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleSendMessage = useCallback(async (messageText?: string) => {
        const text = messageText || input.trim()
        if (!text || isStreaming) return

        // Add user message
        const userMessage: PdfChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'user',
            content: text,
            createdAt: new Date()
        }

        setMessages(prev => [...prev, userMessage])
        setInput('')
        setIsStreaming(true)

        try {
            // Only call AI for artifact or chat_file sources
            if (source.type === 'artifact' || source.type === 'chat_file') {
                const result = await queryPdf.mutateAsync({
                    pdfId: source.id,
                    sourceType: source.type,
                    query: text,
                    context: {
                        currentPage,
                        selectedText: selectedText?.text,
                        pageCount: source.pageCount || undefined
                    }
                })

                // Transform backend citations to CitationData format
                const citations = result.citations?.map((c: { pageNumber: number; text: string }, idx: number) => ({
                    id: idx + 1,
                    filename: source.name,
                    pageNumber: c.pageNumber,
                    text: c.text
                })) || undefined

                // Add AI response
                const aiMessage: PdfChatMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: result.answer,
                    createdAt: new Date(),
                    citations
                }

                setMessages(prev => [...prev, aiMessage])
            } else {
                // For local PDFs, show a note about limitations
                const aiMessage: PdfChatMessage = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant',
                    content: 'This is a local PDF that hasn\'t been uploaded to the cloud. AI features require the document to be processed first. Upload it to your chats to enable AI-powered Q&A.',
                    createdAt: new Date()
                }
                setMessages(prev => [...prev, aiMessage])
            }
        } catch (error) {
            console.error('PDF query error:', error)
            const errorMessage: PdfChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: 'Sorry, I encountered an error while processing your question. Please try again.',
                createdAt: new Date()
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsStreaming(false)
        }
    }, [input, isStreaming, source, currentPage, selectedText, setMessages, setIsStreaming, queryPdf])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }, [handleSendMessage])

    const handleQuickAction = useCallback((action: typeof QUICK_ACTIONS[number]) => {
        const prompt = action.prompt(source.name, selectedText?.text, selectedText?.pageNumber)
        handleSendMessage(prompt)
    }, [source.name, selectedText, handleSendMessage])

    const handleClearChat = useCallback(() => {
        setMessages([])
    }, [setMessages])

    const hasExtractedContent = source.type === 'chat_file' && source.pages && source.pages.length > 0
    const isLocalPdf = source.type === 'local'

    return (
        <div className={cn("flex flex-col h-full bg-background", className)}>
            {/* Header */}
            <div className="flex items-center justify-between h-11 px-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                        <IconSparkles size={14} className="text-primary" />
                    </div>
                    <span className="text-sm font-semibold">Ask AI</span>
                </div>
                <div className="flex items-center gap-0.5">
                    {messages.length > 0 && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={handleClearChat}
                                >
                                    <IconTrash size={14} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Clear chat</TooltipContent>
                        </Tooltip>
                    )}
                    {onClose && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={onClose}
                        >
                            <IconX size={14} />
                        </Button>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                    {messages.length === 0 ? (
                        <EmptyState
                            hasExtractedContent={hasExtractedContent ?? false}
                            isLocalPdf={isLocalPdf}
                            selectedText={selectedText}
                            isStreaming={isStreaming}
                            onQuickAction={handleQuickAction}
                        />
                    ) : (
                        <>
                            {messages.map((message) => (
                                <MessageBubble key={message.id} message={message} />
                            ))}

                            {isStreaming && (
                                <div className="flex gap-2 justify-start">
                                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <IconRobot size={14} className="text-primary" />
                                    </div>
                                    <div className="bg-muted rounded-xl px-3 py-2.5">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <div className="flex gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span>Thinking...</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-3 border-t border-border shrink-0">
                {selectedText && (
                    <div className="mb-2 p-2.5 bg-muted/50 rounded-xl text-xs border border-border/50">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-muted-foreground font-medium flex items-center gap-1">
                                <IconMessageCircle size={12} />
                                Selected from page {selectedText.pageNumber}
                            </span>
                        </div>
                        <p className="line-clamp-2 italic text-foreground/80">
                            "{selectedText.text}"
                        </p>
                    </div>
                )}

                <div className="relative">
                    <Textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isLocalPdf ? "AI features require cloud upload..." : "Ask about this document..."}
                        className="min-h-[56px] max-h-[120px] pr-10 resize-none text-sm rounded-xl"
                        disabled={isStreaming}
                    />
                    <Button
                        size="icon"
                        className="absolute right-2 bottom-2 h-7 w-7 rounded-lg"
                        onClick={() => handleSendMessage()}
                        disabled={!input.trim() || isStreaming}
                    >
                        {isStreaming ? (
                            <IconLoader2 size={14} className="animate-spin" />
                        ) : (
                            <IconSend size={14} />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
})

/** Empty state with quick actions */
const EmptyState = memo(function EmptyState({
    hasExtractedContent,
    isLocalPdf,
    selectedText,
    isStreaming,
    onQuickAction
}: {
    hasExtractedContent: boolean
    isLocalPdf: boolean
    selectedText: { text: string; pageNumber: number } | null
    isStreaming: boolean
    onQuickAction: (action: typeof QUICK_ACTIONS[number]) => void
}) {
    return (
        <div className="text-center py-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <IconSparkles size={24} className="text-primary" />
            </div>
            <h4 className="text-sm font-semibold mb-1">Ask about this document</h4>
            <p className="text-xs text-muted-foreground mb-5 px-4">
                Get AI-powered insights, summaries, and answers.
            </p>

            {/* Quick Actions */}
            {!isLocalPdf && (
                <div className="flex flex-col gap-1.5 px-2">
                    {QUICK_ACTIONS.map((action) => {
                        // Only show "Explain" if there's selected text
                        if (action.id === 'explain' && !selectedText) return null

                        return (
                            <Button
                                key={action.id}
                                variant="outline"
                                size="sm"
                                className="w-full justify-start text-xs h-9 rounded-lg"
                                onClick={() => onQuickAction(action)}
                                disabled={isStreaming}
                            >
                                <action.icon size={14} className="mr-2 text-primary" />
                                {action.id === 'explain' && selectedText 
                                    ? 'Explain selection' 
                                    : action.label
                                }
                            </Button>
                        )
                    })}
                </div>
            )}

            {/* Status Messages */}
            {isLocalPdf && (
                <div className="mt-4 px-4">
                    <p className="text-[11px] text-amber-500 bg-amber-500/10 rounded-lg py-2 px-3">
                        Local PDFs require cloud upload for AI features
                    </p>
                </div>
            )}

            {!isLocalPdf && !hasExtractedContent && (
                <p className="text-[11px] text-muted-foreground/70 mt-4 px-4">
                    Document is being processed. Some features may be limited.
                </p>
            )}
        </div>
    )
})

/** Individual message bubble */
const MessageBubble = memo(function MessageBubble({ message }: { message: PdfChatMessage }) {
    const isUser = message.role === 'user'

    return (
        <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
            {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <IconRobot size={14} className="text-primary" />
                </div>
            )}
            <div
                className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2.5",
                    isUser
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted rounded-bl-sm"
                )}
            >
                {isUser ? (
                    <p className="text-sm leading-relaxed">{message.content}</p>
                ) : (
                    <ChatMarkdownRenderer content={message.content} size="sm" />
                )}
            </div>
            {isUser && (
                <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <IconUser size={14} className="text-muted-foreground" />
                </div>
            )}
        </div>
    )
})
