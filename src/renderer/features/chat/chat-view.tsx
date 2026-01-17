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
    streamingTextAtom,
    streamingToolCallsAtom,
    streamingErrorAtom,
    selectedArtifactAtom,
    artifactPanelOpenAtom
} from '@/lib/atoms'
import { trpc, trpcClient } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageList } from './message-list'
import { ChatInput } from './chat-input'

export function ChatView() {
    // Force rebuild
    const selectedChatId = useAtomValue(selectedChatIdAtom)
    const [input, setInput] = useAtom(chatInputAtom)
    const [isStreaming, setIsStreaming] = useAtom(isStreamingAtom)
    const provider = useAtomValue(currentProviderAtom)
    const mode = useAtomValue(chatModeAtom)
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const selectedModel = useAtomValue(selectedModelAtom)

    // Streaming state
    const [streamingText, setStreamingText] = useAtom(streamingTextAtom)
    const [streamingToolCalls, setStreamingToolCalls] = useAtom(streamingToolCallsAtom)
    const setStreamingError = useSetAtom(streamingErrorAtom)

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
    const { data: messages, refetch: refetchMessages } = trpc.messages.list.useQuery(
        { chatId: selectedChatId! },
        { enabled: !!selectedChatId }
    )

    // Mutations
    const addMessage = trpc.messages.add.useMutation()
    const chatMutation = trpc.ai.chat.useMutation() // Added mutation
    const utils = trpc.useUtils()

    // Handle send message
    const handleSend = async () => {
        if (!input.trim() || !selectedChatId || isStreaming) return

        const userMessage = input.trim()
        const isFirstMessage = messages?.length === 0

        setInput('')
        setIsStreaming(true)
        setStreamingText('')
        setStreamingToolCalls([])
        setStreamingError(null)

        try {
            // Add user message to database
            await addMessage.mutateAsync({
                chatId: selectedChatId,
                role: 'user',
                content: { type: 'text', text: userMessage }
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
            // @ts-ignore - desktopApi type extended in preload
            const cleanupListener = window.desktopApi.onAIStreamEvent(async (event: any) => {
                switch (event.type) {
                    case 'text-delta':
                        fullText += event.delta
                        setStreamingText(fullText)
                        break

                    case 'tool-call-start':
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

                    case 'tool-call-delta':
                        const tc = toolCalls.get(event.toolCallId)
                        if (tc) {
                            tc.args += event.argsDelta
                            setStreamingToolCalls(Array.from(toolCalls.values()).map(t => ({
                                ...t,
                                status: 'streaming' as const
                            })))
                        }
                        break

                    case 'tool-call-done':
                        // Execute the tool
                        setStreamingToolCalls(prev => prev.map(t =>
                            t.id === event.toolCallId
                                ? { ...t, status: 'executing' as const, args: JSON.stringify(event.args) }
                                : t
                        ))

                        const result = executeToolCall(event.toolName, event.args)

                        // Update local map with result for persistence
                        const existingTc = toolCalls.get(event.toolCallId)
                        if (existingTc) {
                            toolCalls.set(event.toolCallId, { ...existingTc, result })
                        }

                        setStreamingToolCalls(prev => prev.map(t =>
                            t.id === event.toolCallId
                                ? { ...t, status: 'complete' as const, result }
                                : t
                        ))
                        break

                    case 'error':
                        setStreamingError(event.error)
                        break

                    case 'finish':
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

                            await addMessage.mutateAsync({
                                chatId: selectedChatId,
                                role: 'assistant',
                                content: { type: 'text', text: fullText },
                                toolCalls: toolCallsArray.length > 0 ? toolCallsArray : undefined
                            })

                            await refetchMessages()
                        }

                        setIsStreaming(false)
                        setStreamingText('')
                        setStreamingToolCalls([])
                        cleanupListener() // Clean up listener when done
                        abortRef.current = null
                        break
                }
            })

            // Store abort function to remove listener and cancel stream
            abortRef.current = () => {
                cleanupListener()
                // Also call cancel mutation
                trpcClient.ai.cancel.mutate({ chatId: selectedChatId })
            }

            // Start the stream via mutation
            await chatMutation.mutateAsync({
                chatId: selectedChatId,
                prompt: userMessage,
                mode,
                provider,
                apiKey: apiKeyResult.key,
                model: selectedModel,
                messages: messageHistory
            })

        } catch (error) {
            console.error('Failed to send message:', error)
            setStreamingError(error instanceof Error ? error.message : 'Unknown error')
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

    // Invalidate queries when chat changes
    useEffect(() => {
        if (selectedChatId) {
            utils.messages.list.invalidate({ chatId: selectedChatId })
        }
    }, [selectedChatId, utils])

    // Auto-scroll to bottom
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
    }, [])

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
                            onViewArtifact={async (artifactId) => {
                                try {
                                    // Try to fetch artifact details
                                    const artifact = await trpcClient.artifacts.get.query({ id: artifactId })
                                    if (artifact) {
                                        setSelectedArtifact(artifact as any)
                                        setArtifactPanelOpen(true)
                                    }
                                } catch (error) {
                                    console.error('Failed to open artifact:', error)
                                    // Fallback if get query fails or doesn't exist, try to find in current messages? 
                                    // Unlikely to help if it's not loaded.
                                }
                            }}
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
function executeToolCall(_toolName: any, _args: any) {
    throw new Error('Function not implemented.')
}

function generateAutoTitle(_selectedChatId: string, _userMessage: string, _key: string, _provider: string, _selectedModel: string) {
    throw new Error('Function not implemented.')
}

