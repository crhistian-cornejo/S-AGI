import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconSend,
    IconSparkles,
    IconFileText,
    IconLoader2,
    IconX,
    IconMessageCircle,
    IconUser,
    IconRobot
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    pdfChatMessagesAtom,
    pdfChatStreamingAtom,
    selectedPdfAtom,
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

interface PdfChatPanelProps {
    source: PdfSource
    onClose?: () => void
    className?: string
}

/**
 * AI Chat Panel for PDF Q&A
 *
 * Features:
 * - Ask questions about the current PDF
 * - Quick actions (Summarize, Explain selection)
 * - Uses document context from extracted pages
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
    const scrollRef = useRef<HTMLDivElement>(null)
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
            timestamp: Date.now()
        }

        setMessages(prev => [...prev, userMessage])
        setInput('')
        setIsStreaming(true)

        try {
            // Get AI response
            const result = await queryPdf.mutateAsync({
                pdfId: source.id,
                sourceType: source.type,
                query: text,
                context: {
                    currentPage,
                    selectedText: selectedText || undefined,
                    pageCount: source.pageCount || undefined
                }
            })

            // Add AI response
            const aiMessage: PdfChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: result.answer,
                timestamp: Date.now(),
                citations: result.citations
            }

            setMessages(prev => [...prev, aiMessage])
        } catch (error) {
            // Add error message
            const errorMessage: PdfChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: 'Sorry, I encountered an error while processing your question. Please try again.',
                timestamp: Date.now()
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

    const handleQuickAction = useCallback((action: 'summarize' | 'explain' | 'key-points') => {
        let prompt: string
        switch (action) {
            case 'summarize':
                prompt = `Please provide a concise summary of this PDF document "${source.name}".`
                break
            case 'explain':
                if (selectedText) {
                    prompt = `Please explain the following text from page ${currentPage}:\n\n"${selectedText}"`
                } else {
                    prompt = `Please explain the main concepts in this PDF document.`
                }
                break
            case 'key-points':
                prompt = `What are the key points and main takeaways from this PDF document?`
                break
        }
        handleSendMessage(prompt)
    }, [source.name, selectedText, currentPage, handleSendMessage])

    const handleClearChat = useCallback(() => {
        setMessages([])
    }, [setMessages])

    const hasExtractedContent = source.type === 'chat_file' && source.pages && source.pages.length > 0

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                    <IconMessageCircle size={16} className="text-primary" />
                    <span className="text-sm font-semibold">Ask AI</span>
                </div>
                <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handleClearChat}
                        >
                            Clear
                        </Button>
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
            <ScrollArea ref={scrollRef} className="flex-1">
                <div className="p-3 space-y-4">
                    {messages.length === 0 ? (
                        <div className="text-center py-8">
                            <IconSparkles size={32} className="mx-auto mb-3 text-primary/50" />
                            <h4 className="text-sm font-medium mb-2">Ask about this PDF</h4>
                            <p className="text-xs text-muted-foreground mb-4">
                                Get AI-powered insights, summaries, and answers from your document.
                            </p>

                            {/* Quick Actions */}
                            <div className="flex flex-col gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start text-xs h-8"
                                    onClick={() => handleQuickAction('summarize')}
                                    disabled={isStreaming}
                                >
                                    <IconFileText size={14} className="mr-2" />
                                    Summarize document
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start text-xs h-8"
                                    onClick={() => handleQuickAction('key-points')}
                                    disabled={isStreaming}
                                >
                                    <IconSparkles size={14} className="mr-2" />
                                    Extract key points
                                </Button>
                                {selectedText && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-start text-xs h-8"
                                        onClick={() => handleQuickAction('explain')}
                                        disabled={isStreaming}
                                    >
                                        <IconMessageCircle size={14} className="mr-2" />
                                        Explain selection
                                    </Button>
                                )}
                            </div>

                            {!hasExtractedContent && (
                                <p className="text-[10px] text-amber-500/80 mt-4">
                                    Note: This PDF hasn't been processed yet. AI responses may be limited.
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "flex gap-2",
                                        message.role === 'user' ? "justify-end" : "justify-start"
                                    )}
                                >
                                    {message.role === 'assistant' && (
                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                            <IconRobot size={14} className="text-primary" />
                                        </div>
                                    )}
                                    <div
                                        className={cn(
                                            "max-w-[85%] rounded-lg px-3 py-2",
                                            message.role === 'user'
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted"
                                        )}
                                    >
                                        {message.role === 'user' ? (
                                            <p className="text-sm">{message.content}</p>
                                        ) : (
                                            <ChatMarkdownRenderer
                                                content={message.content}
                                                size="sm"
                                            />
                                        )}
                                    </div>
                                    {message.role === 'user' && (
                                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                            <IconUser size={14} className="text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isStreaming && (
                                <div className="flex gap-2 justify-start">
                                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <IconRobot size={14} className="text-primary" />
                                    </div>
                                    <div className="bg-muted rounded-lg px-3 py-2">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <IconLoader2 size={14} className="animate-spin" />
                                            Thinking...
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
                    <div className="mb-2 p-2 bg-muted/50 rounded-lg text-xs">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-muted-foreground font-medium">Selected text:</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4"
                                onClick={() => {/* Clear selection would go here */}}
                            >
                                <IconX size={10} />
                            </Button>
                        </div>
                        <p className="line-clamp-2 italic">"{selectedText}"</p>
                    </div>
                )}

                <div className="relative">
                    <Textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question about this PDF..."
                        className="min-h-[60px] max-h-[120px] pr-10 resize-none text-sm"
                        disabled={isStreaming}
                    />
                    <Button
                        size="icon"
                        className="absolute right-2 bottom-2 h-7 w-7"
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
