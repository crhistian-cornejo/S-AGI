import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useAtom, useAtomValue } from 'jotai'
import {
    IconSend,
    IconArrowUp,
    IconSparkles,
    IconFileText,
    IconX,
    IconMessageCircle,
    IconUser,
    IconRobot,
    IconListDetails,
    IconTrash,
    IconWand,
    IconHistory,
    IconRefresh
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
import { useMessageQueueStore } from './stores/message-queue-store'
import { useStreamingStatusStore } from './stores/streaming-status-store'
import { generateQueueId, createQueueItem, type PdfQueueItem } from './lib/queue-utils'
import { PdfQueueIndicator } from './ui/pdf-queue-indicator'
import { Kbd } from '@/components/ui/kbd'

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

    // Queue and streaming state
    const queue = useMessageQueueStore(state => state.getQueue(source.id))
    const addToQueue = useMessageQueueStore(state => state.addToQueue)
    const removeFromQueue = useMessageQueueStore(state => state.removeFromQueue)
    const streamingStatus = useStreamingStatusStore(state => state.getStatus(source.id))

    const [input, setInput] = useState('')
    const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Keep input focused after sending (controlled component loses focus on value change)
    useEffect(() => {
        if (!input && inputRef.current) {
            inputRef.current.focus()
        }
    }, [input])

    // Query PDF mutation for AI answers
    const queryPdf = trpc.pdf.queryPdf.useMutation()
    
    // Panel messages mutations
    const addMessage = trpc.panelMessages.add.useMutation()
    const clearMessages = trpc.panelMessages.clear.useMutation()
    const utils = trpc.useUtils()

    // Load messages from Supabase when source changes
    const { data: savedMessages, refetch: refetchMessages, isLoading: isLoadingHistory } = trpc.panelMessages.list.useQuery(
        {
            panelType: 'pdf_chat',
            sourceId: source.id
        },
        {
            enabled: source.type === 'artifact' || source.type === 'chat_file', // Only for cloud PDFs
            refetchOnWindowFocus: false
        }
    )

    const hasSavedHistory = savedMessages && savedMessages.length > 0
    const historyCount = savedMessages?.length || 0

    // Sync saved messages to local state
    useEffect(() => {
        if (savedMessages && savedMessages.length > 0) {
            const syncedMessages: PdfChatMessage[] = savedMessages.map((msg: { id: string; role: string; content: string; created_at: string; metadata?: { citations?: unknown } }) => ({
                id: msg.id,
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
                createdAt: new Date(msg.created_at),
                citations: msg.metadata?.citations as PdfChatMessage['citations']
            }))
            setMessages(syncedMessages)
        } else if (savedMessages && savedMessages.length === 0 && messages.length > 0) {
            // If no saved messages but we have local messages, clear local state
            // This happens when switching to a different PDF
            setMessages([])
        }
    }, [savedMessages, setMessages, messages])

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleSendMessage = useCallback(async (messageText?: string, skipQueue = false) => {
        const text = messageText || input.trim()
        if (!text) return

        // Skip queue flag: Alt+Enter sends immediately even when streaming
        if (skipQueue || (!isStreaming && streamingStatus !== 'processing')) {
            // Send immediately
            const userMessage: PdfChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'user',
                content: text,
                createdAt: new Date()
            }

            setMessages(prev => [...prev, userMessage])
            setInput('')
            setIsStreaming(true)
            useStreamingStatusStore.getState().setStatus(source.id, 'processing')

            // Save user message to Supabase (only for cloud PDFs)
            if (source.type === 'artifact' || source.type === 'chat_file') {
                try {
                    await addMessage.mutateAsync({
                        panelType: 'pdf_chat',
                        sourceId: source.id,
                        role: 'user',
                        content: text
                    })
                    await utils.panelMessages.list.invalidate({ panelType: 'pdf_chat', sourceId: source.id })
                } catch (err) {
                    console.error('Failed to save user message:', err)
                }
            }

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

                    // Save assistant message to Supabase
                    try {
                        await addMessage.mutateAsync({
                            panelType: 'pdf_chat',
                            sourceId: source.id,
                            role: 'assistant',
                            content: result.answer,
                            metadata: citations ? { citations } : undefined
                        })
                        await utils.panelMessages.list.invalidate({ panelType: 'pdf_chat', sourceId: source.id })
                    } catch (err) {
                        console.error('Failed to save assistant message:', err)
                    }
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
                useStreamingStatusStore.getState().setStatus(source.id, 'ready')
            }
        } else {
            // Add to queue (when streaming)
            const queueItem: PdfQueueItem = createQueueItem(
                generateQueueId(),
                source.id,
                text,
                selectedText || undefined,
                currentPage
            )
            addToQueue(source.id, queueItem)
            setInput('')
        }
    }, [input, isStreaming, streamingStatus, source, currentPage, selectedText, setMessages, setIsStreaming, queryPdf, addToQueue, addMessage, utils])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // Alt+Enter: send immediately (skip queue)
            if (e.altKey) {
                e.preventDefault()
                handleSendMessage(undefined, true)
            } else {
                e.preventDefault()
                handleSendMessage()
            }
        }
    }, [handleSendMessage])

    const handleQuickAction = useCallback((action: typeof QUICK_ACTIONS[number]) => {
        const prompt = action.prompt(source.name, selectedText?.text, selectedText?.pageNumber)
        handleSendMessage(prompt)
    }, [source.name, selectedText, handleSendMessage])

    const handleClearChat = useCallback(async () => {
        setMessages([])
        // Clear messages from Supabase (only for cloud PDFs)
        if (source.type === 'artifact' || source.type === 'chat_file') {
            try {
                await clearMessages.mutateAsync({
                    panelType: 'pdf_chat',
                    sourceId: source.id
                })
                await utils.panelMessages.list.invalidate({ panelType: 'pdf_chat', sourceId: source.id })
            } catch (err) {
                console.error('Failed to clear messages:', err)
            }
        }
    }, [setMessages, source, clearMessages, utils])

    const handleRemoveQueuedItem = useCallback((itemId: string) => {
        removeFromQueue(source.id, itemId)
    }, [source.id, removeFromQueue])

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
                <div className="flex items-center gap-1.5">
                    {/* History button - more visible */}
                    {(source.type === 'artifact' || source.type === 'chat_file') && hasSavedHistory && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-xs gap-1.5"
                                    onClick={() => setHistoryDialogOpen(true)}
                                >
                                    <IconHistory size={13} className="text-primary" />
                                    <span className="font-medium">Historial</span>
                                    {historyCount > 0 && (
                                        <span className="h-4 w-4 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
                                            {historyCount > 9 ? '9+' : historyCount}
                                        </span>
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                Ver {historyCount} mensaje{historyCount !== 1 ? 's' : ''} guardado{historyCount !== 1 ? 's' : ''}
                            </TooltipContent>
                        </Tooltip>
                    )}
                    {/* Refresh button (only when no history) */}
                    {(source.type === 'artifact' || source.type === 'chat_file') && !hasSavedHistory && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                        refetchMessages()
                                        utils.panelMessages.list.invalidate({ panelType: 'pdf_chat', sourceId: source.id })
                                    }}
                                    disabled={isLoadingHistory}
                                >
                                    <IconRefresh size={14} className={cn("text-muted-foreground", isLoadingHistory && "animate-spin")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Recargar historial</TooltipContent>
                        </Tooltip>
                    )}
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
                            <TooltipContent side="bottom">Limpiar chat actual</TooltipContent>
                        </Tooltip>
                    )}
                    {onClose && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={onClose}
                                >
                                    <IconX size={14} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Cerrar panel</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </div>

            {/* Queue Indicator */}
            <PdfQueueIndicator
                queue={queue}
                onRemoveItem={handleRemoveQueuedItem}
            />

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

            {/* History Dialog */}
            <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>Historial de Conversación</DialogTitle>
                        <DialogDescription>
                            {historyCount} mensaje{historyCount !== 1 ? 's' : ''} guardado{historyCount !== 1 ? 's' : ''} para este documento
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh] pr-4">
                        <div className="space-y-3">
                            {savedMessages && savedMessages.length > 0 ? (
                                savedMessages.map((msg: { id: string; role: string; content: string; created_at: string; metadata?: { citations?: unknown } }) => (
                                    <div key={msg.id} className={cn("flex gap-2", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                        {msg.role === 'assistant' && (
                                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <IconRobot size={14} className="text-primary" />
                                            </div>
                                        )}
                                        <div
                                            className={cn(
                                                "max-w-[85%] rounded-xl px-3 py-2.5",
                                                msg.role === 'user'
                                                    ? "bg-primary text-primary-foreground rounded-br-sm"
                                                    : "bg-muted rounded-bl-sm"
                                            )}
                                        >
                                            {msg.role === 'user' ? (
                                                <p className="text-sm leading-relaxed">{msg.content}</p>
                                            ) : (
                                                <ChatMarkdownRenderer content={msg.content} size="sm" />
                                            )}
                                        </div>
                                        {msg.role === 'user' && (
                                            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                                <IconUser size={14} className="text-muted-foreground" />
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    No hay mensajes guardados
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

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
                        placeholder={
                            isLocalPdf
                                ? "AI features require cloud upload..."
                                : (isStreaming || streamingStatus === 'processing')
                                    ? "Add to queue..."
                                    : "Ask about this document..."
                        }
                        className="min-h-[56px] max-h-[120px] pr-10 resize-none text-sm rounded-xl"
                    />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="icon"
                                className="absolute right-2 bottom-2 h-7 w-7 rounded-lg"
                                onClick={() => handleSendMessage()}
                                disabled={!input.trim()}
                            >
                                {isStreaming || streamingStatus === 'processing' ? (
                                    <IconArrowUp size={14} />
                                ) : (
                                    <IconSend size={14} />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            {(isStreaming || streamingStatus === 'processing') ? (
                                <span className="flex items-center gap-1">
                                    Add to queue
                                    <Kbd className="ms-0.5">
                                        <div className="flex items-center gap-0.5">
                                            <span className="text-[10px]">⌘</span>
                                            <span className="text-[10px]">↵</span>
                                        </div>
                                    </Kbd>
                                    <span className="text-muted-foreground/60 mx-1">or</span>
                                    Send now
                                    <Kbd className="ms-0.5">
                                        <div className="flex items-center gap-0.5">
                                            <span className="text-[10px]">⌥</span>
                                            <span className="text-[10px]">↵</span>
                                        </div>
                                    </Kbd>
                                </span>
                            ) : (
                                <span className="flex items-center gap-1">
                                    Send
                                    <Kbd className="ms-0.5">
                                        <div className="flex items-center gap-0.5">
                                            <span className="text-[10px]">⌘</span>
                                            <span className="text-[10px]">↵</span>
                                        </div>
                                    </Kbd>
                                </span>
                            )}
                        </TooltipContent>
                    </Tooltip>
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
