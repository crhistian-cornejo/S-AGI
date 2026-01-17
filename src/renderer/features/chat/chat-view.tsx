import { useEffect, useRef, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { IconSparkles, IconBrandOpenai, IconBrain } from '@tabler/icons-react'
import {
    selectedChatIdAtom,
    chatInputAtom,
    isStreamingAtom,
    currentProviderAtom,
    settingsModalOpenAtom,
    chatModeAtom,
    selectedModelAtom,
    streamingToolCallsAtom,
    streamingErrorAtom,
    selectedArtifactAtom,
    artifactPanelOpenAtom,
    streamingReasoningAtom,
    isReasoningAtom,
    reasoningEffortAtom,
} from '@/lib/atoms'
import { trpc, trpcClient } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageList } from './message-list'
import { ChatInput } from './chat-input'
import { useSmoothStream } from '@/hooks/use-smooth-stream'

export function ChatView() {
    // Force rebuild
    const selectedChatId = useAtomValue(selectedChatIdAtom)
    const [input, setInput] = useAtom(chatInputAtom)
    const [isStreaming, setIsStreaming] = useAtom(isStreamingAtom)
    const provider = useAtomValue(currentProviderAtom)
    const mode = useAtomValue(chatModeAtom)
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const selectedModel = useAtomValue(selectedModelAtom)

    // Smooth streaming for text (buffers and releases gradually)
    const smoothStream = useSmoothStream({ delayMs: 12, chunking: 'word' })
    const streamingText = smoothStream.displayText

    // Streaming state
    const [streamingToolCalls, setStreamingToolCalls] = useAtom(streamingToolCallsAtom)
    const setStreamingError = useSetAtom(streamingErrorAtom)

    // Reasoning state (for GPT-5 with reasoning enabled)
    const [streamingReasoning, setStreamingReasoning] = useAtom(streamingReasoningAtom)
    const [isReasoning, setIsReasoning] = useAtom(isReasoningAtom)
    const reasoningEffort = useAtomValue(reasoningEffortAtom)

    // Artifact state
    const setSelectedArtifact = useSetAtom(selectedArtifactAtom)
    const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom)

    // Abort controller and scroll refs
    const abortRef = useRef<(() => void) | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Get key status from main process (persisted in safeStorage)
    const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery()

    // Check if API key is configured based on tRPC query
    const isConfigured = provider === 'openai'
        ? keyStatus?.hasOpenAI
        : keyStatus?.hasAnthropic

    // Fetch messages for selected chat
    const { data: messages, refetch: refetchMessages, error: messagesError } = trpc.messages.list.useQuery(
        { chatId: selectedChatId! },
        { enabled: !!selectedChatId, retry: false }
    )

    // Mutations
    const addMessage = trpc.messages.add.useMutation()
    const chatMutation = trpc.ai.chat.useMutation()

    const utils = trpc.useUtils()
    const setSelectedChatId = useSetAtom(selectedChatIdAtom)

    // Clear invalid chat selection (e.g., from stale localStorage)
    useEffect(() => {
        if (messagesError && selectedChatId) {
            const errorMsg = messagesError.message || ''
            if (errorMsg.includes('not found') || errorMsg.includes('access denied')) {
                console.warn('[ChatView] Chat not found or access denied, clearing stale selection:', selectedChatId)
                setSelectedChatId(null)
            }
        }
    }, [messagesError, selectedChatId, setSelectedChatId])

    // Handle send message
    const handleSend = async (images?: Array<{ base64Data: string; mediaType: string; filename: string }>) => {
        if ((!input.trim() && !images?.length) || !selectedChatId || isStreaming) return

        const userMessage = input.trim()
        const isFirstMessage = messages?.length === 0

        setInput('')
        setIsStreaming(true)
        smoothStream.startStream()
        setStreamingToolCalls([])
        setStreamingReasoning('')
        setIsReasoning(false)
        setStreamingError(null)

        try {
            // Upload images to Supabase Storage and prepare attachments
            let attachments: Array<{
                id: string
                name: string
                size: number
                type: string
                url?: string
                preview?: string
            }> = []

            if (images && images.length > 0) {
                console.log('[ChatView] Uploading', images.length, 'images to storage...')
                
                for (const img of images) {
                    try {
                        // Calculate approximate size from base64
                        const sizeInBytes = Math.round((img.base64Data.length * 3) / 4)
                        
                        // Upload to Supabase Storage via tRPC
                        const uploaded = await trpcClient.messages.uploadFile.mutate({
                            fileName: img.filename,
                            fileSize: sizeInBytes,
                            fileType: img.mediaType,
                            fileData: img.base64Data
                        })
                        
                        attachments.push({
                            id: uploaded.id,
                            name: uploaded.name,
                            size: uploaded.size,
                            type: uploaded.type,
                            url: uploaded.url
                        })
                        
                        console.log('[ChatView] Uploaded image:', uploaded.name, '→', uploaded.url)
                    } catch (uploadError) {
                        console.error('[ChatView] Failed to upload image:', img.filename, uploadError)
                        // Continue with other images even if one fails
                    }
                }
            }

            // Add user message to database with attachments
            await addMessage.mutateAsync({
                chatId: selectedChatId,
                role: 'user',
                content: { type: 'text', text: userMessage },
                attachments: attachments.length > 0 ? attachments : undefined
            })
            await refetchMessages()

            // Get API key from main process
            const apiKeyResult = provider === 'openai'
                ? await trpcClient.settings.getOpenAIKey.query()
                : await trpcClient.settings.getAnthropicKey.query()

            if (!apiKeyResult.key) {
                setStreamingError('API key not configured')
                setIsStreaming(false)
                return
            }

            // Get Tavily key for web search (optional)
            const tavilyKeyResult = await trpcClient.settings.getTavilyKey.query()

            if (isFirstMessage) {
                generateAutoTitle(selectedChatId, userMessage, apiKeyResult.key, provider, selectedModel)
            }

            // Get conversation history for context
            const messageHistory = (messages || [])
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: typeof m.content === 'string' ? m.content : m.content?.text || ''
                }))

            // Variables to track streaming response
            let fullText = ''
            const toolCalls: Map<string, { id: string; name: string; args: string; result?: unknown }> = new Map()

            // Setup IPC listener for streaming events
            // Tools are executed in main process - we just display results here
            // @ts-ignore - desktopApi type extended in preload
            const cleanupListener = window.desktopApi.onAIStreamEvent(async (event: any) => {
                switch (event.type) {
                    case 'text-delta': {
                        fullText += event.delta
                        smoothStream.appendToBuffer(event.delta)
                        break
                    }

                    case 'reasoning-delta': {
                        setStreamingReasoning(prev => prev + event.delta)
                        setIsReasoning(true)
                        break
                    }

                    case 'reasoning-done': {
                        setIsReasoning(false)
                        break
                    }

                    case 'tool-call-start': {
                        toolCalls.set(event.toolCallId, {
                            id: event.toolCallId,
                            name: event.toolName,
                            args: ''
                        })
                        setStreamingToolCalls(Array.from(toolCalls.values()).map(tc => ({
                            ...tc,
                            status: 'streaming' as const
                        })))
                        break
                    }

                    case 'tool-call-delta': {
                        const tc = toolCalls.get(event.toolCallId)
                        if (tc) {
                            tc.args += event.argsDelta
                            setStreamingToolCalls(Array.from(toolCalls.values()).map(t => ({
                                ...t,
                                status: 'streaming' as const
                            })))
                        }
                        break
                    }

                    case 'tool-call-done': {
                        // Tool is being executed in main process
                        // Just update status to "executing"
                        const existingTc = toolCalls.get(event.toolCallId)
                        if (existingTc) {
                            toolCalls.set(event.toolCallId, { 
                                ...existingTc, 
                                args: JSON.stringify(event.args) 
                            })
                        }
                        setStreamingToolCalls(prev => prev.map(t =>
                            t.id === event.toolCallId
                                ? { ...t, status: 'executing' as const, args: JSON.stringify(event.args) }
                                : t
                        ))
                        break
                    }

                    case 'tool-result': {
                        // Tool was executed in main process, update with result
                        const existingTc = toolCalls.get(event.toolCallId)
                        if (existingTc) {
                            toolCalls.set(event.toolCallId, { 
                                ...existingTc, 
                                result: event.result 
                            })
                        }
                        
                        setStreamingToolCalls(prev => prev.map(t =>
                            t.id === event.toolCallId
                                ? { 
                                    ...t, 
                                    status: event.success ? 'complete' as const : 'error' as const, 
                                    result: event.result 
                                }
                                : t
                        ))

                        // Auto-open artifact panel when spreadsheet/document is created
                        const isArtifactCreation = event.toolName === 'create_spreadsheet' || event.toolName === 'create_document'
                        if (isArtifactCreation && event.success && event.result?.artifactId) {
                            // Invalidate artifacts query to show new artifact
                            utils.artifacts.list.invalidate({ chatId: selectedChatId })
                            
                            // Auto-open the newly created artifact
                            try {
                                const artifact = await trpcClient.artifacts.get.query({ id: event.result.artifactId })
                                if (artifact) {
                                    setSelectedArtifact(artifact as any)
                                    setArtifactPanelOpen(true)
                                }
                            } catch (err) {
                                console.warn('[ChatView] Failed to auto-open artifact:', err)
                            }
                        }
                        break
                    }

                    case 'error': {
                        setStreamingError(event.error)
                        break
                    }

                    case 'finish': {
                        // Save assistant message to database
                        if (fullText || toolCalls.size > 0) {
                            const toolCallsArray = Array.from(toolCalls.values()).map(tc => {
                                try {
                                    return {
                                        id: tc.id,
                                        name: tc.name,
                                        args: tc.args ? JSON.parse(tc.args) : null,
                                        result: tc.result
                                    }
                                } catch {
                                    return {
                                        id: tc.id,
                                        name: tc.name,
                                        args: null
                                    }
                                }
                            })

                            console.log('[ChatView] Saving message with tool calls:', JSON.stringify(toolCallsArray, null, 2))

                            await addMessage.mutateAsync({
                                chatId: selectedChatId,
                                role: 'assistant',
                                content: { type: 'text', text: fullText },
                                toolCalls: toolCallsArray.length > 0 ? toolCallsArray : undefined
                            })

                            await refetchMessages()
                            
                            // Refresh artifacts list after message is saved
                            utils.artifacts.list.invalidate({ chatId: selectedChatId })
                        }

                        setIsStreaming(false)
                        smoothStream.stopStream()
                        setStreamingToolCalls([])
                        setStreamingReasoning('')
                        setIsReasoning(false)
                        cleanupListener() // Clean up listener when done
                        abortRef.current = null
                        break
                    }
                }
            })

            // Store abort function to remove listener and cancel stream
            abortRef.current = () => {
                cleanupListener()
                // Also call cancel mutation
                trpcClient.ai.cancel.mutate({ chatId: selectedChatId })
            }

            // Start the stream via mutation
            // Build images array for Claude vision API
            const imageContent = images?.map(img => ({
                type: 'image' as const,
                data: img.base64Data,
                mediaType: img.mediaType,
            }))

            await chatMutation.mutateAsync({
                chatId: selectedChatId,
                prompt: userMessage,
                mode,
                provider,
                apiKey: apiKeyResult.key,
                tavilyApiKey: tavilyKeyResult.key || undefined,
                model: selectedModel,
                messages: messageHistory,
                images: imageContent && imageContent.length > 0 ? imageContent : undefined,
                // Pass reasoning configuration if not 'none'
                reasoning: reasoningEffort !== 'none' ? {
                    effort: reasoningEffort,
                    streamReasoning: true
                } : undefined
            })

        } catch (error) {
            console.error('Failed to send message:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'

            // If chat not found or access denied, clear selection
            if (errorMessage.includes('not found') || errorMessage.includes('access denied')) {
                console.warn('[ChatView] Chat not found, clearing selection')
                setSelectedChatId(null)
                setStreamingError('Chat not found. Please create a new chat.')
            } else {
                setStreamingError(errorMessage)
            }
            setIsStreaming(false)
        }
    }

    // Handle stop streaming
    const handleStop = () => {
        if (abortRef.current) {
            abortRef.current()
            abortRef.current = null
        }
        setIsStreaming(false)
    }

    // Invalidate queries when chat changes and clear artifact selection
    useEffect(() => {
        if (selectedChatId) {
            utils.messages.list.invalidate({ chatId: selectedChatId })
        }
        // Clear artifact selection when chat changes
        // The new chat may have different artifacts
        setSelectedArtifact(null)
        setArtifactPanelOpen(false)
    }, [selectedChatId, utils, setSelectedArtifact, setArtifactPanelOpen])

    // Auto-scroll to bottom
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
    }, [])

    // Memoized handler for viewing artifacts
    const handleViewArtifact = useCallback(async (artifactId: string) => {
        try {
            const artifact = await trpcClient.artifacts.get.query({ id: artifactId })
            if (artifact) {
                setSelectedArtifact(artifact as any)
                setArtifactPanelOpen(true)
            }
        } catch (error) {
            console.error('Failed to open artifact:', error)
        }
    }, [setSelectedArtifact, setArtifactPanelOpen])

    useEffect(() => {
        // Scroll on new messages or streaming updates
        if (messages?.length || streamingText || streamingToolCalls.length) {
            scrollToBottom('smooth')
        }
    }, [messages?.length, streamingText, streamingToolCalls.length, scrollToBottom])

    // Scroll immediately on send
    useEffect(() => {
        if (isStreaming) {
            scrollToBottom('auto')
        }
    }, [isStreaming, scrollToBottom])

    // Error state - chat not found (stale localStorage)
    if (messagesError && selectedChatId) {
        const isNotFound = messagesError.message?.includes('not found') || messagesError.message?.includes('access denied')
        if (isNotFound) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    <div className="max-w-md text-center space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
                            <IconSparkles size={32} className="text-red-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">Chat Not Found</h2>
                            <p className="text-muted-foreground mt-1">
                                This chat no longer exists or you don't have access to it.
                            </p>
                        </div>
                        <Button onClick={() => setSelectedChatId(null)}>
                            Create New Chat
                        </Button>
                    </div>
                </div>
            )
        }
    }

    // Empty state - no chat selected
    if (!selectedChatId) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="max-w-md text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                        <IconSparkles size={32} className="text-primary" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold">Welcome to S-AGI</h2>
                        <p className="text-muted-foreground mt-1">
                            Create spreadsheets with AI assistance
                        </p>
                    </div>

                    {!isConfigured && (
                        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4 text-sm">
                            <p className="text-yellow-600 dark:text-yellow-400 font-medium">
                                API Key Required
                            </p>
                            <p className="text-muted-foreground mt-1">
                                Configure your {provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key to start chatting
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-3"
                                onClick={() => setSettingsOpen(true)}
                            >
                                {provider === 'openai' ? (
                                    <IconBrandOpenai size={16} className="mr-2" />
                                ) : (
                                    <IconBrain size={16} className="mr-2" />
                                )}
                                Configure API Key
                            </Button>
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                        Select a chat from the sidebar or create a new one to get started
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Messages area */}
            <div className="flex-1 relative overflow-hidden">
                {/* Top Fade Overlay */}
                <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />

                <ScrollArea className="h-full" ref={scrollContainerRef}>
                    <div className="pt-10 pb-16"> {/* Subtle padding for fades */}
                        <MessageList
                            messages={messages || []}
                            isLoading={isStreaming}
                            streamingText={streamingText}
                            streamingToolCalls={streamingToolCalls}
                            streamingReasoning={streamingReasoning}
                            isReasoning={isReasoning}
                            onViewArtifact={handleViewArtifact}
                        />
                        <div ref={messagesEndRef} className="h-px" />
                    </div>
                </ScrollArea>

                {/* Bottom Fade Overlay */}
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
            </div>

            {/* Input area */}
            <div className="relative z-20">
                <div className="max-w-3xl mx-auto">
                    {!isConfigured ? (
                        <div className="px-4 pb-4">
                            <Button
                                className="w-full"
                                variant="outline"
                                onClick={() => setSettingsOpen(true)}
                            >
                                Configure API Key to start chatting
                            </Button>
                        </div>
                    ) : (
                        <ChatInput
                            value={input}
                            onChange={setInput}
                            onSend={handleSend}
                            onStop={handleStop}
                            isLoading={isStreaming}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

// Generate auto title for new chats
async function generateAutoTitle(
    chatId: string,
    userMessage: string,
    apiKey: string,
    provider: string,
    model: string
) {
    try {
        const result = await trpcClient.ai.generateTitle.mutate({
            prompt: userMessage,
            provider: provider as 'openai',
            apiKey,
            model
        })

        if (result.title && result.title !== 'New Chat') {
            await trpcClient.chats.update.mutate({
                id: chatId,
                title: result.title
            })
        }
    } catch (error) {
        console.error('[ChatView] Failed to generate auto title:', error)
    }
}

