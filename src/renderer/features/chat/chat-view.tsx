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
    const selectedChatId = useAtomValue(selectedChatIdAtom)
    const [input, setInput] = useAtom(chatInputAtom)
    const [isStreaming, setIsStreaming] = useAtom(isStreamingAtom)
    const provider = useAtomValue(currentProviderAtom)
    const mode = useAtomValue(chatModeAtom)
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    
    // Streaming state
    const [streamingText, setStreamingText] = useAtom(streamingTextAtom)
    const [streamingToolCalls, setStreamingToolCalls] = useAtom(streamingToolCallsAtom)
    const setStreamingError = useSetAtom(streamingErrorAtom)
    
    // Artifact state
    const setSelectedArtifact = useSetAtom(selectedArtifactAtom)
    const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom)
    
    // Abort controller ref
    const abortRef = useRef<(() => void) | null>(null)

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
    const createArtifact = trpc.artifacts.create.useMutation()
    const utils = trpc.useUtils()

    // Build cell data for Univer
    const buildCellData = useCallback((columns: string[], rows: unknown[][]) => {
        const cellData: Record<number, Record<number, { v: unknown }>> = {}
        
        // Header row
        cellData[0] = {}
        columns.forEach((col, idx) => {
            cellData[0][idx] = { v: col }
        })
        
        // Data rows
        rows.forEach((row, rowIdx) => {
            cellData[rowIdx + 1] = {}
            row.forEach((cell, colIdx) => {
                cellData[rowIdx + 1][colIdx] = { v: cell }
            })
        })
        
        return cellData
    }, [])

    // Execute tool calls (create spreadsheet, etc.)
    const executeToolCall = useCallback(async (toolName: string, args: unknown) => {
        if (!selectedChatId) return null
        
        if (toolName === 'create_spreadsheet') {
            const typedArgs = args as { name: string; columns: string[]; rows?: unknown[][] }
            
            // Build Univer data structure
            const univerData = {
                id: crypto.randomUUID(),
                name: typedArgs.name,
                sheetOrder: ['sheet1'],
                sheets: {
                    sheet1: {
                        id: 'sheet1',
                        name: typedArgs.name,
                        rowCount: Math.max(100, (typedArgs.rows?.length || 0) + 10),
                        columnCount: Math.max(26, typedArgs.columns.length + 5),
                        cellData: buildCellData(typedArgs.columns, typedArgs.rows || [])
                    }
                }
            }
            
            try {
                const artifact = await createArtifact.mutateAsync({
                    chatId: selectedChatId,
                    type: 'spreadsheet',
                    name: typedArgs.name,
                    content: { columns: typedArgs.columns, rows: typedArgs.rows },
                    univerData
                })
                
                // Show the artifact panel
                setSelectedArtifact(artifact as any)
                setArtifactPanelOpen(true)
                
                return { success: true, artifactId: artifact.id, message: `Created spreadsheet "${typedArgs.name}"` }
            } catch (error) {
                return { success: false, error: String(error) }
            }
        }
        
        // TODO: Handle other tools (update_cells, insert_formula)
        return { success: false, error: `Unknown tool: ${toolName}` }
    }, [selectedChatId, createArtifact, setSelectedArtifact, setArtifactPanelOpen, buildCellData])

    // Handle send message
    const handleSend = async () => {
        if (!input.trim() || !selectedChatId || isStreaming) return

        const userMessage = input.trim()
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

            // Get conversation history for context
            const messageHistory = (messages || [])
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: typeof m.content === 'string' ? m.content : m.content?.text || ''
                }))

            // Variables to track streaming response
            let fullText = ''
            const toolCalls: Map<string, { id: string; name: string; args: string }> = new Map()

            // Subscribe to streaming
            const subscription = trpcClient.claude.chat.subscribe({
                chatId: selectedChatId,
                prompt: userMessage,
                mode,
                provider,
                apiKey: apiKeyResult.key,
                messages: messageHistory
            }, {
                onData: async (event) => {
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
                            
                            const result = await executeToolCall(event.toolName, event.args)
                            
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
                                            args: tc.args ? JSON.parse(tc.args) : null
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
                            break
                    }
                },
                onError: (error) => {
                    console.error('Streaming error:', error)
                    setStreamingError(error.message)
                    setIsStreaming(false)
                },
                onComplete: () => {
                    setIsStreaming(false)
                }
            })

            // Store abort function
            abortRef.current = () => {
                subscription.unsubscribe()
            }

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
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages area */}
            <ScrollArea className="flex-1">
                <div className="max-w-3xl mx-auto py-4">
                    <MessageList 
                        messages={messages || []} 
                        isLoading={isStreaming}
                        streamingText={streamingText}
                        streamingToolCalls={streamingToolCalls}
                    />
                </div>
            </ScrollArea>

            {/* Input area */}
            <div className="border-t border-border">
                <div className="max-w-3xl mx-auto p-4">
                    {!isConfigured ? (
                        <Button
                            className="w-full"
                            variant="outline"
                            onClick={() => setSettingsOpen(true)}
                        >
                            Configure API Key to start chatting
                        </Button>
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
