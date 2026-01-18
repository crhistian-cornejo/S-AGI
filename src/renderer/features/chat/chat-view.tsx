import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { IconSparkles, IconBrandOpenai, IconBrain, IconArrowDown } from '@tabler/icons-react'
import { toast } from 'sonner'
import {
    selectedChatIdAtom,
    chatInputAtom,
    isStreamingAtom,
    currentProviderAtom,
    settingsModalOpenAtom,
    chatModeAtom,
    isPlanModeAtom,
    selectedModelAtom,
    streamingToolCallsAtom,
    streamingErrorAtom,
    selectedArtifactAtom,
    artifactPanelOpenAtom,
    streamingReasoningAtom,
    isReasoningAtom,
    reasoningEffortAtom,
    lastReasoningAtom,
    streamingWebSearchesAtom,
    streamingAnnotationsAtom,
    streamingFileSearchesAtom,
    type WebSearchInfo,
    type FileSearchInfo,
    type UrlCitation,
    type FileCitation,
    type Annotation,
} from '@/lib/atoms'
import { trpc, trpcClient } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Logo } from '@/components/ui/logo'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MessageList } from './message-list'
import { ChatInput } from './chat-input'
import { ChatFilesPanel } from './chat-files-panel'
import { useSmoothStream } from '@/hooks/use-smooth-stream'
import { useDocumentUpload } from '@/lib/use-document-upload'

export function ChatView() {
    // Force rebuild
    const selectedChatId = useAtomValue(selectedChatIdAtom)
    const [input, setInput] = useAtom(chatInputAtom)
    const [isStreaming, setIsStreaming] = useAtom(isStreamingAtom)
    const provider = useAtomValue(currentProviderAtom)
    const mode = useAtomValue(chatModeAtom)
    const setSettingsOpen = useSetAtom(settingsModalOpenAtom)
    const selectedModel = useAtomValue(selectedModelAtom)

    // Smooth streaming for text (show immediately as received)
    const smoothStream = useSmoothStream({ delayMs: 0, chunking: 'word' })
    const streamingText = smoothStream.displayText

    // Streaming state
    const [streamingToolCalls, setStreamingToolCalls] = useAtom(streamingToolCallsAtom)
    const setStreamingError = useSetAtom(streamingErrorAtom)

    // Reasoning state (for GPT-5 with reasoning enabled)
    const [streamingReasoning, setStreamingReasoning] = useAtom(streamingReasoningAtom)
    const [isReasoning, setIsReasoning] = useAtom(isReasoningAtom)
    const [lastReasoning, setLastReasoning] = useAtom(lastReasoningAtom)
    const reasoningEffort = useAtomValue(reasoningEffortAtom)

    // Web search state (for OpenAI native web search)
    const [streamingWebSearches, setStreamingWebSearches] = useAtom(streamingWebSearchesAtom)
    // File search state (for OpenAI file_search tool)
    const [streamingFileSearches, setStreamingFileSearches] = useAtom(streamingFileSearchesAtom)
    const [streamingAnnotations, setStreamingAnnotations] = useAtom(streamingAnnotationsAtom)

    // Artifact state
    const setSelectedArtifact = useSetAtom(selectedArtifactAtom)
    const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom)

    // Document upload for file search
    const documentUpload = useDocumentUpload({ chatId: selectedChatId })

    // Abort controller and scroll refs
    const abortRef = useRef<(() => void) | null>(null)
    const handleSendRef = useRef<typeof handleSend | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)

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

    // Plan mode state
    const setIsPlanMode = useSetAtom(isPlanModeAtom)

    // Detect unapproved plan - look for ExitPlanMode tool without subsequent "Implement plan" user message
    const hasUnapprovedPlan = useMemo(() => {
        if (!messages || messages.length === 0) return false
        
        // Traverse messages from end to find unapproved ExitPlanMode
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i]
            
            // If user message says "Implement plan", plan is already approved
            if (msg.role === 'user') {
                const text = typeof msg.content === 'string' 
                    ? msg.content 
                    : (msg.content as any)?.text || ''
                if (text.trim().toLowerCase() === 'implement plan') {
                    return false
                }
            }
            
            // If assistant message with ExitPlanMode tool call, we found an unapproved plan
            if (msg.role === 'assistant' && msg.tool_calls) {
                const exitPlanCall = msg.tool_calls.find(
                    (tc: any) => tc.name === 'ExitPlanMode' || tc.name === 'exitplanmode'
                )
                if (exitPlanCall?.result?.plan) {
                    return true
                }
            }
        }
        return false
    }, [messages])

    // Mutations
    const addMessage = trpc.messages.add.useMutation()
    const chatMutation = trpc.ai.chat.useMutation()
    const createChat = trpc.chats.create.useMutation()

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

    const isChatAccessError = (message: string) => {
        const normalized = message.toLowerCase()
        return normalized.includes('not found') || normalized.includes('access denied')
    }

    const createFallbackChat = async () => {
        const chat = await createChat.mutateAsync({ title: 'New Chat' })
        utils.chats.list.invalidate()
        utils.chats.get.invalidate({ id: chat.id })
        setSelectedChatId(chat.id)
        setSelectedArtifact(null)
        setArtifactPanelOpen(false)
        return chat
    }

    // Handle send message
    const handleSend = async (images?: Array<{ base64Data: string; mediaType: string; filename: string }>, documents?: File[], messageOverride?: string) => {
        const messageToSend = messageOverride ?? input.trim()
        if ((!messageToSend && !images?.length) || !selectedChatId || isStreaming) return

        const userMessage = messageToSend
        const existingMessages = messages

        setInput('')
        setIsStreaming(true)
        smoothStream.startStream()
        setStreamingToolCalls([])
        setStreamingReasoning('')
        setLastReasoning('') // Clear previous reasoning when starting new message
        setIsReasoning(false)
        setStreamingError(null)
        setStreamingWebSearches([]) // Clear previous web searches
        setStreamingFileSearches([]) // Clear previous file searches
        setStreamingAnnotations([]) // Clear previous annotations

        // Upload documents to OpenAI Vector Store for file search
        if (documents && documents.length > 0) {
            console.log('[ChatView] Uploading', documents.length, 'documents to OpenAI Vector Store...')
            try {
                await documentUpload.uploadDocuments(documents)
                console.log('[ChatView] Documents uploaded successfully')
            } catch (docError) {
                const errorMessage = docError instanceof Error ? docError.message : 'Failed to upload documents'
                console.error('[ChatView] Failed to upload documents:', docError)
                
                // If it's a configuration error, notify user and stop
                if (errorMessage.includes('API key') || errorMessage.includes('not configured')) {
                    toast.error(errorMessage)
                    setIsStreaming(false)
                    return
                }
                // For other errors, continue anyway - documents may still be processing
                toast.warning('Some documents failed to upload. Continuing without them.')
            }
        }

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

        const sendWithChatId = async (chatId: string, historySource: typeof messages | undefined) => {
            const chatIdForStream = chatId
            const isFirstMessage = !historySource || historySource.length === 0

            // Add user message to database with attachments
            await addMessage.mutateAsync({
                chatId: chatIdForStream,
                role: 'user',
                content: { type: 'text', text: userMessage },
                attachments: attachments.length > 0 ? attachments : undefined
            })

            if (chatIdForStream === selectedChatId) {
                await refetchMessages()
            } else {
                utils.messages.list.invalidate({ chatId: chatIdForStream })
            }

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
                generateAutoTitle(chatIdForStream, userMessage, apiKeyResult.key, provider)
            }

            // Get conversation history for context
            const messageHistory = (historySource || [])
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: typeof m.content === 'string' ? m.content : m.content?.text || ''
                }))

            // Check if there are files in vector store or uploading for file search
            // Also check if we just uploaded documents in this send action
            const hasFilesInVectorStore = (documentUpload.files && documentUpload.files.length > 0) ||
                (documentUpload.uploadingDocuments && documentUpload.uploadingDocuments.length > 0) ||
                (documents && documents.length > 0)

            // Variables to track streaming response
            let fullText = ''
            let fullReasoning = ''
            const toolCalls: Map<string, { id: string; name: string; args: string; result?: unknown }> = new Map()
            let cleanupListener: (() => void) | null = null
            const actionCounts = {
                webSearch: 0,
                fileSearch: 0,
                codeInterpreter: 0,
                attachments: images?.length || 0
            }
            // Collect annotations in local variable to persist them
            let collectedAnnotations: Annotation[] = []

            try {
                const streamStartedAt = Date.now()

                // Setup IPC listener for streaming events
                // Tools are executed in main process - we just display results here
                // @ts-ignore - desktopApi type extended in preload
                cleanupListener = window.desktopApi.onAIStreamEvent(async (event: any) => {
                    switch (event.type) {
                        case 'text-delta': {
                            fullText += event.delta
                            smoothStream.appendToBuffer(event.delta)
                            break
                        }

                        case 'reasoning-summary-delta': {
                            fullReasoning += event.delta
                            setStreamingReasoning(prev => prev + event.delta)
                            setIsReasoning(true)
                            break
                        }

                        case 'reasoning-summary-done': {
                            setIsReasoning(false)
                            break
                        }

                        case 'web-search-start': {
                            console.log('[ChatView] Web search start:', event)
                            actionCounts.webSearch += 1
                            const newSearch: WebSearchInfo = {
                                searchId: event.searchId,
                                query: event.query,
                                status: 'searching',
                                action: event.action,
                                domains: event.domains,
                                url: event.url
                            }
                            setStreamingWebSearches(prev => [...prev, newSearch])
                            break
                        }

                        case 'web-search-searching': {
                            console.log('[ChatView] Web search searching:', event)
                            setStreamingWebSearches(prev => prev.map(ws =>
                                ws.searchId === event.searchId
                                    ? {
                                        ...ws,
                                        status: 'searching' as const,
                                        action: event.action ?? ws.action,
                                        query: event.query || ws.query,
                                        domains: event.domains ?? ws.domains,
                                        url: event.url ?? ws.url
                                    }
                                    : ws
                            ))
                            break
                        }

                        case 'web-search-done': {
                            console.log('[ChatView] Web search done:', event)
                            setStreamingWebSearches(prev => prev.map(ws =>
                                ws.searchId === event.searchId
                                    ? {
                                        ...ws,
                                        status: 'done' as const,
                                        action: event.action ?? ws.action,
                                        query: event.query || ws.query,
                                        domains: event.domains ?? ws.domains,
                                        url: event.url ?? ws.url
                                    }
                                    : ws
                            ))
                            break
                        }

                        case 'annotations': {
                            // Collect URL and file citations from the response
                            console.log('[ChatView] Received annotations event:', event)
                            
                            const urlCitations = (event.annotations || [])
                                .filter((a: any) => a.type === 'url_citation')
                                .map((a: any): UrlCitation => ({
                                    type: 'url_citation',
                                    url: a.url,
                                    title: a.title,
                                    startIndex: a.startIndex,
                                    endIndex: a.endIndex
                                }))
                            
                            const fileCitations = (event.annotations || [])
                                .filter((a: any) => a.type === 'file_citation')
                                .map((a: any): FileCitation => ({
                                    type: 'file_citation',
                                    fileId: a.fileId,
                                    filename: a.filename,
                                    index: a.index
                                }))
                            
                            const allCitations: Annotation[] = [...urlCitations, ...fileCitations]
                            console.log('[ChatView] Parsed citations:', { urlCitations: urlCitations.length, fileCitations: fileCitations.length })
                            
                            if (allCitations.length > 0) {
                                // Accumulate in local variable for persistence
                                collectedAnnotations = [...collectedAnnotations, ...allCitations]
                                // Also update streaming state for live display
                                setStreamingAnnotations(prev => [...prev, ...allCitations])
                            }
                            break
                        }

                        case 'file-search-start': {
                            console.log('[ChatView] File search start:', event)
                            actionCounts.fileSearch += 1
                            const newFileSearch: FileSearchInfo = {
                                searchId: event.searchId,
                                status: 'searching'
                            }
                            setStreamingFileSearches(prev => [...prev, newFileSearch])
                            break
                        }

                        case 'file-search-searching': {
                            console.log('[ChatView] File search searching:', event)
                            setStreamingFileSearches(prev => prev.map(fs =>
                                fs.searchId === event.searchId
                                    ? { ...fs, status: 'searching' as const }
                                    : fs
                            ))
                            break
                        }

                        case 'file-search-done': {
                            console.log('[ChatView] File search done:', event)
                            setStreamingFileSearches(prev => prev.map(fs =>
                                fs.searchId === event.searchId
                                    ? { ...fs, status: 'done' as const }
                                    : fs
                            ))
                            break
                        }

                        case 'code-interpreter-start': {
                            actionCounts.codeInterpreter += 1
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
                                utils.artifacts.list.invalidate({ chatId: chatIdForStream })
                                
                                // Auto-open the newly created artifact
                                try {
                                    const artifact = await trpcClient.artifacts.get.query({ id: event.result.artifactId })
                                    console.log('[ChatView] Auto-opening artifact:', {
                                        id: artifact?.id,
                                        name: artifact?.name,
                                        hasUniverData: !!artifact?.univer_data,
                                        univerDataKeys: artifact?.univer_data ? Object.keys(artifact.univer_data) : [],
                                        cellDataRows: artifact?.univer_data?.sheets?.sheet1?.cellData ? Object.keys(artifact.univer_data.sheets.sheet1.cellData).length : 0
                                    })
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
                            const durationMs = Date.now() - streamStartedAt
                            const usage = event.usage
                                ? {
                                    inputTokens: event.usage.promptTokens || 0,
                                    outputTokens: event.usage.completionTokens || 0,
                                    reasoningTokens: event.usage.reasoningTokens || 0,
                                    totalTokens: (event.usage.promptTokens || 0) + (event.usage.completionTokens || 0)
                                }
                                : undefined

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

                                const actions = [
                                    actionCounts.attachments > 0 ? { type: 'attachments', count: actionCounts.attachments } : null,
                                    actionCounts.webSearch > 0 ? { type: 'web-search', count: actionCounts.webSearch } : null,
                                    actionCounts.fileSearch > 0 ? { type: 'file-search', count: actionCounts.fileSearch } : null,
                                    actionCounts.codeInterpreter > 0 ? { type: 'code-interpreter', count: actionCounts.codeInterpreter } : null,
                                    toolCallsArray.length > 0 ? { type: 'tool', count: toolCallsArray.length } : null
                                ].filter(Boolean) as Array<{ type: 'attachments' | 'web-search' | 'file-search' | 'code-interpreter' | 'tool'; count: number }>

                                console.log('[ChatView] Saving message with tool calls:', JSON.stringify(toolCallsArray, null, 2))

                                await addMessage.mutateAsync({
                                    chatId: chatIdForStream,
                                    role: 'assistant',
                                    content: { type: 'text', text: fullText },
                                    toolCalls: toolCallsArray.length > 0 ? toolCallsArray : undefined,
                                    metadata: {
                                        usage,
                                        durationMs,
                                        reasoning: fullReasoning || undefined,
                                        actions: actions.length > 0 ? actions : undefined,
                                        annotations: collectedAnnotations.length > 0 ? collectedAnnotations : undefined
                                    }
                                })

                                if (chatIdForStream === selectedChatId) {
                                    await refetchMessages()
                                } else {
                                    utils.messages.list.invalidate({ chatId: chatIdForStream })
                                }
                                
                                // Refresh artifacts list after message is saved
                                utils.artifacts.list.invalidate({ chatId: chatIdForStream })
                            }

                            setIsStreaming(false)
                            smoothStream.stopStream()
                            setStreamingToolCalls([])
                            // Save reasoning from local variable before clearing
                            if (fullReasoning) {
                                setLastReasoning(fullReasoning)
                            }
                            setStreamingReasoning('')
                            setIsReasoning(false)
                            // Clear search states (already saved in message metadata)
                            setStreamingWebSearches([])
                            setStreamingFileSearches([])
                            setStreamingAnnotations([])
                            cleanupListener?.() // Clean up listener when done
                            abortRef.current = null
                            break
                        }
                    }
                })

                // Store abort function to remove listener and cancel stream
                abortRef.current = () => {
                    cleanupListener?.()
                    // Also call cancel mutation
                    trpcClient.ai.cancel.mutate({ chatId: chatIdForStream })
                }

                // Start the stream via mutation
                // Build images array for Claude vision API
                const imageContent = images?.map(img => ({
                    type: 'image' as const,
                    data: img.base64Data,
                    mediaType: img.mediaType,
                }))

                await chatMutation.mutateAsync({
                    chatId: chatIdForStream,
                    prompt: userMessage,
                    mode,
                    provider,
                    apiKey: apiKeyResult.key,
                    tavilyApiKey: tavilyKeyResult.key || undefined,
                    model: selectedModel,
                    messages: messageHistory,
                    images: imageContent && imageContent.length > 0 ? imageContent : undefined,
                    // Always pass reasoning configuration
                    reasoning: {
                        effort: reasoningEffort,
                        summary: 'auto' // Required to receive reasoning summary events
                    },
                    // Enable file search if there are files in vector store
                    nativeTools: hasFilesInVectorStore ? { fileSearch: true } : undefined
                })
            } catch (error) {
                cleanupListener?.()
                throw error
            }
        }

        try {
            await sendWithChatId(selectedChatId, existingMessages)
        } catch (error) {
            console.error('Failed to send message:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'

            if (isChatAccessError(errorMessage)) {
                console.warn('[ChatView] Chat not found, creating a new chat and retrying')

                try {
                    const newChat = await createFallbackChat()
                    toast.info('Chat anterior no existía. Se creó uno nuevo.')
                    await sendWithChatId(newChat.id, [])
                    return
                } catch (retryError) {
                    console.error('[ChatView] Failed to recover from chat access error:', retryError)
                    setSelectedChatId(null)
                    setStreamingError('Chat not found. Please create a new chat.')
                    setIsStreaming(false)
                    return
                }
            }

            setStreamingError(errorMessage)
            setIsStreaming(false)
        }
    }

    // Keep ref updated for use in callbacks
    handleSendRef.current = handleSend

    // Handle plan approval - sends "Implement plan" message and switches to agent mode
    const handleApprovePlan = useCallback(() => {
        // Switch to agent mode
        setIsPlanMode(false)

        // Send "Implement plan" message using ref to avoid stale closure
        handleSendRef.current?.(undefined, undefined, 'Implement plan')
    }, [setIsPlanMode])

    // Keyboard shortcut: Cmd/Ctrl+Enter to approve plan
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                e.key === 'Enter' &&
                (e.metaKey || e.ctrlKey) &&
                !e.shiftKey &&
                hasUnapprovedPlan &&
                !isStreaming
            ) {
                e.preventDefault()
                handleApprovePlan()
            }
        }
        
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [hasUnapprovedPlan, isStreaming, handleApprovePlan])

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

    const getScrollViewport = useCallback(() => {
        const root = scrollContainerRef.current
        if (!root) return null
        return root.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
    }, [])

    // Auto-scroll to bottom
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
        setShowScrollToBottom(false)
    }, [])

    const updateScrollButton = useCallback(() => {
        const viewport = getScrollViewport()
        if (!viewport) return
        const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
        setShowScrollToBottom(distanceFromBottom > 120)
    }, [getScrollViewport])

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
        // Scroll on new messages or streaming updates (only if user is at bottom)
        if (!showScrollToBottom && (messages?.length || streamingText || streamingToolCalls.length)) {
            scrollToBottom('smooth')
        }
        updateScrollButton()
    }, [messages?.length, streamingText, streamingToolCalls.length, scrollToBottom, updateScrollButton, showScrollToBottom])

    // Scroll immediately on send (only if user is at bottom)
    useEffect(() => {
        if (isStreaming && !showScrollToBottom) {
            scrollToBottom('auto')
        }
    }, [isStreaming, scrollToBottom, showScrollToBottom])

    useEffect(() => {
        const viewport = getScrollViewport()
        if (!viewport) return
        updateScrollButton()

        const handleScroll = () => updateScrollButton()
        viewport.addEventListener('scroll', handleScroll, { passive: true })
        return () => viewport.removeEventListener('scroll', handleScroll)
    }, [getScrollViewport, updateScrollButton])

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

    // Check if this is an empty chat (no messages and not streaming)
    const isEmptyChat = (!messages || messages.length === 0) && !isStreaming && !lastReasoning

    // Empty chat state - centered welcome + input
    if (isEmptyChat) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative px-4">
                <div className="w-full max-w-3xl flex flex-col items-center">
                    {/* Welcome message */}
                    <div className="flex flex-col items-center text-muted-foreground mb-8 animate-in fade-in duration-700">
                        <div className="mb-6">
                            <Logo size={64} />
                        </div>
                        <h1 className="text-2xl font-semibold text-foreground tracking-tight">How can I help you today?</h1>
                        <p className="text-sm text-muted-foreground mt-2 max-w-[280px] text-center leading-relaxed">
                            Describe a spreadsheet or ask a question to get started.
                        </p>
                    </div>

                    {/* Centered input */}
                    <div className="w-full">
                        {!isConfigured ? (
                            <Button
                                className="w-full"
                                variant="outline"
                                onClick={() => setSettingsOpen(true)}
                            >
                                Configure API Key to start chatting
                            </Button>
                        ) : (
                            <>
                                {documentUpload.files.length > 0 && (
                                    <ChatFilesPanel className="pb-2" />
                                )}
                                <ChatInput
                                    value={input}
                                    onChange={setInput}
                                    onSend={handleSend}
                                    onStop={handleStop}
                                    isLoading={isStreaming}
                                    streamingText={streamingText}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Messages area */}
            <div className="flex-1 relative overflow-hidden">
                {/* Top Fade Overlay */}
                <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-background via-background/80 to-transparent pointer-events-none z-10" />

                <ScrollArea className="h-full" ref={scrollContainerRef}>
                    <div className="pt-2 pb-16"> {/* Safe area is now handled by MainLayout, keeping small padding for air */}
                        <MessageList
                            messages={messages || []}
                            isLoading={isStreaming}
                            streamingText={streamingText}
                            streamingToolCalls={streamingToolCalls}
                            streamingReasoning={streamingReasoning}
                            lastReasoning={lastReasoning}
                            isReasoning={isReasoning}
                            onViewArtifact={handleViewArtifact}
                            streamingWebSearches={streamingWebSearches}
                            streamingFileSearches={streamingFileSearches}
                            streamingAnnotations={streamingAnnotations}
                        />
                        <div ref={messagesEndRef} className="h-px" />
                    </div>
                </ScrollArea>

                {showScrollToBottom && (
                    <div className="absolute bottom-[20px] left-1/2 -translate-x-1/2 z-20">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="rounded-full bg-border/70 shadow-md">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="secondary"
                                        className="h-9 w-9 rounded-full"
                                        onClick={() => scrollToBottom('smooth')}
                                    >
                                        <IconArrowDown size={18} />
                                    </Button>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">Ir al final</TooltipContent>
                        </Tooltip>
                    </div>
                )}

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
                        <>
                            {/* Files panel - shows uploaded documents */}
                            {documentUpload.files.length > 0 && (
                                <ChatFilesPanel className="px-4 pb-2 max-w-3xl mx-auto" />
                            )}
                            
                            {/* Show "Implement Plan" button when there's an unapproved plan and input is empty */}
                            {hasUnapprovedPlan && !input.trim() && !isStreaming ? (
                                <div className="px-4 pb-4 max-w-3xl mx-auto w-full">
                                    <Button
                                        type="button"
                                        onClick={handleApprovePlan}
                                        className="w-full flex items-center justify-center gap-3 h-12 px-6 rounded-xl bg-[hsl(var(--plan-mode))] text-[hsl(var(--plan-mode-foreground))] text-base font-medium hover:bg-[hsl(var(--plan-mode))]/90 transition-all shadow-lg shadow-[hsl(var(--plan-mode))]/20"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                                            <polygon points="5 3 19 12 5 21 5 3" />
                                        </svg>
                                        Implement Plan
                                        <Kbd className="ml-1 text-[hsl(var(--plan-mode-foreground))]/70 border-[hsl(var(--plan-mode-foreground))]/20 bg-[hsl(var(--plan-mode-foreground))]/10">
                                            ⌘↵
                                        </Kbd>
                                    </Button>
                                </div>
                            ) : (
                                <ChatInput
                                    value={input}
                                    onChange={setInput}
                                    onSend={handleSend}
                                    onStop={handleStop}
                                    isLoading={isStreaming}
                                    streamingText={streamingText}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// Generate auto title for new chats
const autoTitleRetryDelays = [0, 3_000, 5_000, 5_000]
const autoTitleModel = 'gpt-5-nano'

function getFallbackTitle(userMessage: string) {
    const trimmed = userMessage.trim()
    if (!trimmed) return 'New Chat'
    if (trimmed.length <= 25) return trimmed
    return `${trimmed.slice(0, 25)}...`
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function generateAutoTitle(
    chatId: string,
    userMessage: string,
    apiKey: string,
    provider: string
) {
    try {
        const result = await trpcClient.ai.generateTitle.mutate({
            prompt: userMessage,
            provider: provider as 'openai',
            apiKey,
            model: autoTitleModel
        })

        const resolvedTitle = result.title && result.title !== 'New Chat'
            ? result.title
            : getFallbackTitle(userMessage)

        if (!resolvedTitle || resolvedTitle === 'New Chat') {
            return
        }

        for (let attempt = 0; attempt < autoTitleRetryDelays.length; attempt += 1) {
            if (attempt > 0) {
                await sleep(autoTitleRetryDelays[attempt])
            }

            try {
                await trpcClient.chats.update.mutate({
                    id: chatId,
                    title: resolvedTitle
                })
                return
            } catch (error) {
                if (attempt === autoTitleRetryDelays.length - 1) {
                    console.error('[ChatView] Failed to apply auto title after retries:', error)
                }
            }
        }
    } catch (error) {
        console.error('[ChatView] Failed to generate auto title:', error)
    }
}
