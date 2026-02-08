import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTheme } from "next-themes";
import {
  IconSparkles,
  IconBrandOpenai,
  IconBrain,
  IconArrowDown,
  IconBolt,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  selectedChatIdAtom,
  chatInputAtom,
  isStreamingAtom,
  currentProviderAtom,
  chatModeAtom,
  isPlanModeAtom,
  isImageGenerationModeAtom,
  imageAspectRatioAtom,
  ASPECT_RATIO_TO_SIZE,
  selectedModelAtom,
  responseModeAtom,
  streamingToolCallsAtom,
  streamingErrorAtom,
  selectedArtifactAtom,
  artifactPanelOpenAtom,
  activeTabAtom,
  streamingReasoningAtom,
  isReasoningAtom,
  reasoningEffortAtom,
  lastReasoningAtom,
  streamingWebSearchesAtom,
  streamingAnnotationsAtom,
  streamingFileSearchesAtom,
  streamingDocumentCitationsAtom,
  streamingSuggestionsAtom,
  streamingCodeInterpreterExecsAtom,
  imageEditDialogAtom,
  pendingQuickPromptMessageAtom,
  chatSoundsEnabledAtom,
  zenModeAtom,
  type WebSearchInfo,
  type FileSearchInfo,
  type UrlCitation,
  type FileCitation,
  type Annotation,
  type DocumentCitation,
  type CodeInterpreterExec,
} from "@/lib/atoms";
import { trpc, trpcClient } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Logo } from "@/components/ui/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageList } from "./message-list";
import { MessageTableOfContents } from "./message-table-of-contents";
import { ChatInput } from "./chat-input";
import { SuggestedPrompts } from "./suggested-prompts";
import { ChatFilesPanel } from "./chat-files-panel";
import { ImageEditDialog } from "@/features/agent/image-edit-dialog";
import { useSmoothStream, useDocumentUpload, useChatSounds } from "@/hooks";
import { AI_MODELS } from "@s-agi/core/types/ai";
import { useMessageQueueStore } from "./stores/message-queue-store";
import { useStreamingStatusStore } from "./stores/streaming-status-store";
import { useSendCallbackStore } from "./stores/send-callback-store";
import { generateQueueId, createQueueItem } from "./lib/queue-utils";
import { useOpenSettingsPage } from "@/features/settings/use-open-settings-page";
import zenBackgroundDarkUrl from "@/assets/zen-background.png";
import zenBackgroundLightUrl from "@/assets/zen-background-light.svg";

export function ChatView() {
  // Sound effects preference
  const soundsEnabled = useAtomValue(chatSoundsEnabledAtom);
  // Sound effects hook
  const chatSounds = useChatSounds(soundsEnabled);
  // Zen mode
  const zenMode = useAtomValue(zenModeAtom);
  const { resolvedTheme } = useTheme();
  const zenBackgroundUrl =
    resolvedTheme === "dark" ? zenBackgroundDarkUrl : zenBackgroundLightUrl;

  // Force rebuild - useAtomValue for read-only, useSetAtom for write-only
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const [input, setInput] = useAtom(chatInputAtom);
  const isStreaming = useAtomValue(isStreamingAtom);
  const setIsStreaming = useSetAtom(isStreamingAtom);
  const provider = useAtomValue(currentProviderAtom);
  const mode = useAtomValue(chatModeAtom);
  const openSettingsPage = useOpenSettingsPage();
  const selectedModel = useAtomValue(selectedModelAtom);

  // Smooth streaming for text (show immediately as received)
  const smoothStream = useSmoothStream({ delayMs: 0, chunking: "word" });
  const streamingText = smoothStream.displayText;

  // Streaming state - separate read and write atoms
  const streamingToolCalls = useAtomValue(streamingToolCallsAtom);
  const setStreamingToolCalls = useSetAtom(streamingToolCallsAtom);
  const streamingError = useAtomValue(streamingErrorAtom);
  const setStreamingError = useSetAtom(streamingErrorAtom);

  // Reasoning state (for GPT-5 with reasoning enabled)
  const streamingReasoning = useAtomValue(streamingReasoningAtom);
  const setStreamingReasoning = useSetAtom(streamingReasoningAtom);
  const isReasoning = useAtomValue(isReasoningAtom);
  const setIsReasoning = useSetAtom(isReasoningAtom);
  const lastReasoning = useAtomValue(lastReasoningAtom);
  const setLastReasoning = useSetAtom(lastReasoningAtom);
  const reasoningEffort = useAtomValue(reasoningEffortAtom);
  const responseMode = useAtomValue(responseModeAtom);

  // Web search state (for OpenAI native web search)
  const streamingWebSearches = useAtomValue(streamingWebSearchesAtom);
  const setStreamingWebSearches = useSetAtom(streamingWebSearchesAtom);
  // File search state (for OpenAI file_search tool)
  const streamingFileSearches = useAtomValue(streamingFileSearchesAtom);
  const setStreamingFileSearches = useSetAtom(streamingFileSearchesAtom);
  const streamingAnnotations = useAtomValue(streamingAnnotationsAtom);
  const setStreamingAnnotations = useSetAtom(streamingAnnotationsAtom);
  // Document citations state (for local RAG with non-OpenAI providers)
  const streamingDocumentCitations = useAtomValue(
    streamingDocumentCitationsAtom
  );
  const setStreamingDocumentCitations = useSetAtom(
    streamingDocumentCitationsAtom
  );
  const [streamingSuggestions, setStreamingSuggestions] = useAtom(
    streamingSuggestionsAtom
  );
  // Code interpreter state (for OpenAI code_interpreter)
  const streamingCodeInterpreterExecs = useAtomValue(streamingCodeInterpreterExecsAtom);
  const setStreamingCodeInterpreterExecs = useSetAtom(streamingCodeInterpreterExecsAtom);

  // Settings state
  const setSelectedArtifact = useSetAtom(selectedArtifactAtom);
  const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  // Image edit dialog state
  const imageEditDialog = useAtomValue(imageEditDialogAtom);
  const setImageEditDialog = useSetAtom(imageEditDialogAtom);

  // Document upload for file search
  const documentUpload = useDocumentUpload({ chatId: selectedChatId });

  // Zustand stores for queue system
  const addToQueue = useMessageQueueStore((state) => state.addToQueue);
  const getQueue = useMessageQueueStore((state) => state.getQueue);
  const registerCallback = useSendCallbackStore(
    (state) => state.registerCallback
  );
  const unregisterCallback = useSendCallbackStore(
    (state) => state.unregisterCallback
  );
  const setStreamingStatus = useStreamingStatusStore(
    (state) => state.setStatus
  );

  // Get current queue for this chat
  const currentQueue = selectedChatId ? getQueue(selectedChatId) : [];

  // Abort controller and scroll refs
  const abortRef = useRef<(() => void) | null>(null);
  const handleSendRef = useRef<typeof handleSend | null>(null);
  const stopThinkingRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Refs for batching streaming state updates (OPT 6)
  const webSearchesRef = useRef<WebSearchInfo[]>([]);
  const annotationsRef = useRef<Annotation[]>([]);
  const codeInterpreterRef = useRef<CodeInterpreterExec[]>([]);
  const wsFlushScheduled = useRef(false);
  const annFlushScheduled = useRef(false);
  const ciFlushScheduled = useRef(false);

  const flushWebSearches = useCallback(() => {
    if (!wsFlushScheduled.current) {
      wsFlushScheduled.current = true;
      requestAnimationFrame(() => {
        setStreamingWebSearches([...webSearchesRef.current]);
        wsFlushScheduled.current = false;
      });
    }
  }, [setStreamingWebSearches]);

  const flushAnnotations = useCallback(() => {
    if (!annFlushScheduled.current) {
      annFlushScheduled.current = true;
      requestAnimationFrame(() => {
        setStreamingAnnotations([...annotationsRef.current]);
        annFlushScheduled.current = false;
      });
    }
  }, [setStreamingAnnotations]);

  const flushCodeInterpreter = useCallback(() => {
    if (!ciFlushScheduled.current) {
      ciFlushScheduled.current = true;
      requestAnimationFrame(() => {
        setStreamingCodeInterpreterExecs([...codeInterpreterRef.current]);
        ciFlushScheduled.current = false;
      });
    }
  }, [setStreamingCodeInterpreterExecs]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  // Reset streaming state when chat changes
  useEffect(() => {
    // Clear all streaming-related state when switching to a new chat
    setLastReasoning("");
    setStreamingReasoning("");
    setIsReasoning(false);
    setStreamingToolCalls([]);
    setStreamingError(null);
    setStreamingWebSearches([]);
    webSearchesRef.current = [];
    setStreamingFileSearches([]);
    setStreamingAnnotations([]);
    annotationsRef.current = [];
    setStreamingDocumentCitations([]);
    setStreamingSuggestions([]);
    setStreamingCodeInterpreterExecs([]);
    codeInterpreterRef.current = [];
    smoothStream.reset();
  }, [selectedChatId]);

  // Get key status from main process (persisted in safeStorage)
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();

  // Check if API key is configured based on tRPC query
  const isConfigured =
    provider === "openai"
      ? keyStatus?.hasOpenAI
      : provider === "chatgpt-plus"
      ? keyStatus?.hasChatGPTPlus
      : provider === "zai"
      ? keyStatus?.hasZai
      : provider === "claude"
      ? keyStatus?.hasClaudeCode
      : keyStatus?.hasAnthropic;

  // Fetch messages for selected chat
  const {
    data: messages,
    refetch: refetchMessages,
    error: messagesError,
  } = trpc.messages.list.useQuery(
    { chatId: selectedChatId! },
    {
      enabled: !!selectedChatId,
      retry: false,
      staleTime: 15_000,
      gcTime: 1000 * 60 * 30,
    }
  );

  // Plan mode state - only use write atom
  const setIsPlanMode = useSetAtom(isPlanModeAtom);

  // Image generation mode state - separate read and write atoms
  const isImageMode = useAtomValue(isImageGenerationModeAtom);
  const setIsImageMode = useSetAtom(isImageGenerationModeAtom);
  const imageAspectRatio = useAtomValue(imageAspectRatioAtom);

  // Detect unapproved plan - look for ExitPlanMode tool without subsequent "Implement plan" user message
  const hasUnapprovedPlan = useMemo(() => {
    if (!messages || messages.length === 0) return false;

    // Traverse messages from end to find unapproved ExitPlanMode
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // If user message says "Implement plan", plan is already approved
      if (msg.role === "user") {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : (msg.content as any)?.text || "";
        if (text.trim().toLowerCase() === "implement plan") {
          return false;
        }
      }

      // If assistant message with ExitPlanMode tool call, we found an unapproved plan
      if (msg.role === "assistant" && msg.tool_calls) {
        const exitPlanCall = msg.tool_calls.find(
          (tc: any) => tc.name === "ExitPlanMode" || tc.name === "exitplanmode"
        );
        if (exitPlanCall?.result?.plan) {
          return true;
        }
      }
    }
    return false;
  }, [messages]);

  // Mutations
  const addMessage = trpc.messages.add.useMutation();
  const chatMutation = trpc.ai.chat.useMutation();
  const createChat = trpc.chats.create.useMutation();

  const utils = trpc.useUtils();
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);

  // Clear invalid chat selection (e.g., from stale localStorage)
  useEffect(() => {
    if (messagesError && selectedChatId) {
      const errorMsg = messagesError.message || "";
      if (
        errorMsg.includes("not found") ||
        errorMsg.includes("access denied")
      ) {
        console.warn(
          "[ChatView] Chat not found or access denied, clearing stale selection:",
          selectedChatId
        );
        setSelectedChatId(null);
      }
    }
  }, [messagesError, selectedChatId, setSelectedChatId]);

  const isChatAccessError = (message: string) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("not found") || normalized.includes("access denied")
    );
  };

  const createFallbackChat = async () => {
    const chat = await createChat.mutateAsync({ title: "New Chat" });
    utils.chats.list.invalidate();
    utils.chats.get.invalidate({ id: chat.id });
    setSelectedChatId(chat.id);
    setSelectedArtifact(null);
    setArtifactPanelOpen(false);
    return chat;
  };

  // Handle send message
  const handleSend = async (
    images?: Array<{ base64Data: string; mediaType: string; filename: string }>,
    documents?: File[],
    targetDocument?: { id: string; filename: string } | null,
    messageOverride?: string,
    options?: { generateImage?: boolean; imageSize?: string }
  ) => {
    const messageToSend = messageOverride ?? input.trim();
    if ((!messageToSend && !images?.length) || !selectedChatId) return;

    // Capture chatId for type narrowing
    const chatId = selectedChatId;

    const shouldGenerateImage = options?.generateImage ?? isImageMode;
    const imageSize =
      options?.imageSize ??
      (shouldGenerateImage
        ? ASPECT_RATIO_TO_SIZE[imageAspectRatio]
        : undefined);

    if (isStreaming) {
      // Queue the message using Zustand store
      const queuedItem = createQueueItem(
        generateQueueId(),
        chatId,
        messageToSend,
        {
          images: images?.map((img) => ({
            id: crypto.randomUUID(),
            base64Data: img.base64Data,
            mediaType: img.mediaType,
            filename: img.filename,
          })),
          documents: documents?.map((doc) => ({
            id: crypto.randomUUID(),
            file: doc,
          })),
          targetDocument: targetDocument
            ? {
                id: crypto.randomUUID(),
                filename: targetDocument.filename,
              }
            : undefined,
          generateImage: shouldGenerateImage,
          imageSize,
        }
      );
      addToQueue(chatId, queuedItem);
      setInput("");
      setIsImageMode(false);
      return;
    }

    const userMessage = messageToSend;
    const existingMessages = messages;

    // Store target document for file search filtering
    const targetDocumentForSearch = targetDocument || null;

    setInput("");
    setIsStreaming(true);
    setStreamingStatus(chatId, "streaming"); // Sync with Zustand
    setIsImageMode(false); // Reset image mode after capturing its value
    smoothStream.startStream();
    setStreamingToolCalls([]);
    setStreamingReasoning("");
    setLastReasoning(""); // Clear previous reasoning when starting new message
    setIsReasoning(false);
    setStreamingError(null);
    setStreamingWebSearches([]); // Clear previous web searches
    webSearchesRef.current = [];
    setStreamingFileSearches([]); // Clear previous file searches
    setStreamingAnnotations([]); // Clear previous annotations
    annotationsRef.current = [];
    setStreamingDocumentCitations([]); // Clear previous citations
    setStreamingSuggestions([]); // Clear previous suggestions
    setStreamingCodeInterpreterExecs([]); // Clear previous code interpreter execs
    codeInterpreterRef.current = [];

    // Play thinking sound (single, not loop)
    stopThinkingRef.current = chatSounds.playThinking(false);

    const documentUploadPromise =
      documents && documents.length > 0
        ? (async () => {
            console.log(
              "[ChatView] Uploading",
              documents.length,
              "documents to OpenAI Vector Store..."
            );
            try {
              await documentUpload.uploadDocuments(documents);
              console.log("[ChatView] Documents uploaded successfully");
            } catch (docError) {
              const errorMessage =
                docError instanceof Error
                  ? docError.message
                  : "Failed to upload documents";
              console.error("[ChatView] Failed to upload documents:", docError);

              if (
                errorMessage.includes("API key") ||
                errorMessage.includes("not configured")
              ) {
                toast.error(errorMessage);
                throw new Error(errorMessage);
              }
              toast.warning(
                "Some documents failed to upload. Continuing without them."
              );
            }
          })()
        : null;

    const imageUploadPromise =
      images && images.length > 0
        ? (async () => {
            console.log(
              "[ChatView] Uploading",
              images.length,
              "images to storage..."
            );
            const uploadedAttachments: Array<{
              id: string;
              name: string;
              size: number;
              type: string;
              url?: string;
              preview?: string;
              storagePath?: string; // Required for URL regeneration on login
            }> = [];

            for (const img of images) {
              try {
                const sizeInBytes = Math.round((img.base64Data.length * 3) / 4);

                const uploaded = await trpcClient.messages.uploadFile.mutate({
                  fileName: img.filename,
                  fileSize: sizeInBytes,
                  fileType: img.mediaType,
                  fileData: img.base64Data,
                });

                uploadedAttachments.push({
                  id: uploaded.id,
                  name: uploaded.name,
                  size: uploaded.size,
                  type: uploaded.type,
                  url: uploaded.url,
                  storagePath: uploaded.storagePath, // Store path for URL regeneration
                });

                console.log(
                  "[ChatView] Uploaded image:",
                  uploaded.name,
                  "→",
                  uploaded.storagePath
                );
              } catch (uploadError) {
                console.error(
                  "[ChatView] Failed to upload image:",
                  img.filename,
                  uploadError
                );
              }
            }

            return uploadedAttachments;
          })()
        : null;

    const sendWithChatId = async (
      chatId: string,
      historySource: typeof messages | undefined
    ) => {
      const chatIdForStream = chatId;
      const isFirstMessage = !historySource || historySource.length === 0;

      await addMessage.mutateAsync({
        chatId: chatIdForStream,
        role: "user",
        content: { type: "text", text: userMessage },
      });

      if (chatIdForStream === selectedChatId) {
        await refetchMessages();
      } else {
        utils.messages.list.invalidate({ chatId: chatIdForStream });
      }

      // Get API key from main process (only needed for API-key providers, not chatgpt-plus)
      // ChatGPT Plus uses OAuth - backend handles auth, we just verify connection
      let apiKey: string | undefined = undefined;

      if (provider === "chatgpt-plus") {
        // ChatGPT Plus uses OAuth - no API key needed, backend handles auth
        // Check if connected via status query
        const chatGPTStatus = await trpcClient.auth.getChatGPTStatus.query();
        if (!chatGPTStatus.isConnected) {
          setStreamingError(
            "ChatGPT Plus not connected. Please connect in Settings."
          );
          setIsStreaming(false);
          setStreamingStatus(chatId, "error");
          return;
        }
        // No API key needed - backend uses OAuth token directly
        apiKey = undefined;

        // NOTE: gemini-advanced disabled - OAuth token incompatible with API endpoint
        // } else if (provider === 'gemini-advanced') {
        //     const geminiStatus = await trpcClient.auth.getGeminiStatus.query()
        //     if (!geminiStatus.isConnected) {
        //         setStreamingError('Gemini Advanced not connected. Please connect in Settings.')
        //         setIsStreaming(false)
        //         return
        //     }
        //     apiKey = undefined
      } else if (provider === "zai") {
        // SECURITY: Credentials are managed in main process only
        // We just check status here - backend fetches keys directly
        const status = await trpcClient.settings.getApiKeyStatus.query();
        if (!status.hasZai) {
          setStreamingError("Z.AI API key not configured");
          setIsStreaming(false);
          setStreamingStatus(chatId, "error");
          chatSounds.playError();
          return;
        }
        // API key is fetched by main process
        apiKey = undefined;
      } else if (provider === "openai") {
        // SECURITY: Credentials are managed in main process only
        const status = await trpcClient.settings.getApiKeyStatus.query();
        if (!status.hasOpenAI) {
          setStreamingError("OpenAI API key not configured");
          setIsStreaming(false);
          setStreamingStatus(chatId, "error");
          chatSounds.playError();
          return;
        }
        // API key is fetched by main process
        apiKey = undefined;
      } else if (provider === "claude") {
        // Claude Code uses OAuth - backend handles auth
        const status = await trpcClient.settings.getApiKeyStatus.query();
        if (!status.hasClaudeCode) {
          setStreamingError(
            "Claude Code not connected. Please connect in Settings."
          );
          setIsStreaming(false);
          setStreamingStatus(chatId, "error");
          chatSounds.playError();
          return;
        }
        apiKey = undefined;
      } else {
        // Anthropic or other providers
        // SECURITY: Credentials are managed in main process only
        const status = await trpcClient.settings.getApiKeyStatus.query();
        if (!status.hasAnthropic) {
          setStreamingError("API key not configured");
          setIsStreaming(false);
          setStreamingStatus(chatId, "error");
          chatSounds.playError();
          return;
        }
        // API key is fetched by main process
        apiKey = undefined;
      }

      // Auto-generate title for first message (backend handles API key)
      if (isFirstMessage) {
        generateAutoTitle(chatIdForStream, userMessage, provider);
      }

      // Get conversation history for context (including images from attachments)
      // Note: Historical images are included as base64 in the messages array
      // The backend will handle image context limits (max 10 historical images)
      const messageHistory = (historySource || [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const content =
            typeof m.content === "string" ? m.content : m.content?.text || "";

          // Extract image attachments with preview data (already base64)
          // Only include if the attachment has preview data (base64)
          const imageAttachments = (m.attachments || [])
            .filter((att: any) => att.type?.startsWith("image/") && att.preview)
            .map((att: any) => ({
              type: "image" as const,
              data: att.preview.replace(/^data:image\/[^;]+;base64,/, ""), // Remove data URI prefix if present
              mediaType: att.type,
            }));

          return {
            role: m.role as "user" | "assistant",
            content,
            images: imageAttachments.length > 0 ? imageAttachments : undefined,
          };
        });

      // Check if there are files in vector store or uploading for file search
      // Also check if we just uploaded documents in this send action
      const hasFilesInVectorStore =
        (documentUpload.files && documentUpload.files.length > 0) ||
        (documentUpload.uploadingDocuments &&
          documentUpload.uploadingDocuments.length > 0) ||
        (documents && documents.length > 0);

      // Variables to track streaming response
      let fullText = "";
      let fullReasoning = "";
      const toolCalls: Map<
        string,
        { id: string; name: string; args: string; result?: unknown }
      > = new Map();
      let cleanupListener: (() => void) | null = null;
      const actionCounts = {
        webSearch: 0,
        fileSearch: 0,
        codeInterpreter: 0,
        attachments: images?.length || 0,
      };
      // Collect annotations in local variable to persist them
      let collectedAnnotations: Annotation[] = [];
      // Collect document citations for local RAG
      let collectedDocumentCitations: DocumentCitation[] = [];
      // Collect suggestions to persist them with the message
      let collectedSuggestions: string[] = [];
      // Collect web searches to persist them with the message
      let collectedWebSearches: Array<{
        searchId: string;
        query?: string;
        status: 'searching' | 'done';
        action?: 'search' | 'open_page' | 'find_in_page';
        domains?: string[];
        url?: string;
        sources?: Array<{ url: string; title?: string }>;
      }> = [];
      // Collect code interpreter executions to persist them
      let collectedCodeInterpreterExecs: CodeInterpreterExec[] = [];

      try {
        const streamStartedAt = Date.now();

        // Setup IPC listener for streaming events
        // Tools are executed in main process - we just display results here
        // @ts-ignore - desktopApi type extended in preload
        cleanupListener = window.desktopApi.onAIStreamEvent(
          async (event: any) => {
            switch (event.type) {
              case "text-delta": {
                fullText += event.delta;
                smoothStream.appendToBuffer(event.delta);
                break;
              }

              case "reasoning-summary-delta": {
                fullReasoning += event.delta;
                setStreamingReasoning((prev) => prev + event.delta);
                setIsReasoning(true);
                break;
              }

              case "reasoning-summary-done": {
                // Add newline separator so next summary starts on a new line
                // This prevents titles from concatenating into one long string
                fullReasoning += "\n";
                setStreamingReasoning((prev) => prev + "\n");
                setIsReasoning(false);
                break;
              }

              case "web-search-start": {
                // Deduplicate by searchId - don't add if already exists
                const alreadyExists = collectedWebSearches.some(ws => ws.searchId === event.searchId);
                if (alreadyExists) {
                  break;
                }
                actionCounts.webSearch += 1;
                const newSearch: WebSearchInfo = {
                  searchId: event.searchId,
                  query: event.query,
                  status: "searching",
                  action: event.action,
                  domains: event.domains,
                  url: event.url,
                  sources: event.sources,
                };
                // Accumulate in ref, flush via rAF
                if (!webSearchesRef.current.some(ws => ws.searchId === event.searchId)) {
                  webSearchesRef.current = [...webSearchesRef.current, newSearch];
                  flushWebSearches();
                }
                // Also collect for persistence
                collectedWebSearches.push(newSearch);
                break;
              }

              case "web-search-searching": {
                webSearchesRef.current = webSearchesRef.current.map((ws) =>
                  ws.searchId === event.searchId
                    ? {
                        ...ws,
                        status: "searching" as const,
                        action: event.action ?? ws.action,
                        query: event.query || ws.query,
                        domains: event.domains ?? ws.domains,
                        url: event.url ?? ws.url,
                      }
                    : ws
                );
                flushWebSearches();
                break;
              }

              case "web-search-done": {
                webSearchesRef.current = webSearchesRef.current.map((ws) =>
                  ws.searchId === event.searchId
                    ? {
                        ...ws,
                        status: "done" as const,
                        action: event.action ?? ws.action,
                        query: event.query || ws.query,
                        domains: event.domains ?? ws.domains,
                        url: event.url ?? ws.url,
                        sources: event.sources ?? ws.sources,
                      }
                    : ws
                );
                flushWebSearches();

                // Also update collected web searches for persistence
                const existingIdx = collectedWebSearches.findIndex(ws => ws.searchId === event.searchId);
                if (existingIdx >= 0) {
                  collectedWebSearches[existingIdx] = {
                    ...collectedWebSearches[existingIdx],
                    status: "done",
                    action: event.action ?? collectedWebSearches[existingIdx].action,
                    query: event.query || collectedWebSearches[existingIdx].query,
                    domains: event.domains ?? collectedWebSearches[existingIdx].domains,
                    url: event.url ?? collectedWebSearches[existingIdx].url,
                    sources: event.sources ?? collectedWebSearches[existingIdx].sources,
                  };
                }

                // If we got sources with titles, also emit them as annotations for display
                if (event.sources && event.sources.length > 0) {
                  const sourcesAsAnnotations = event.sources.map((s: any, idx: number) => ({
                    type: "url_citation" as const,
                    url: s.url,
                    title: s.title,
                    startIndex: idx,
                    endIndex: idx + 1,
                  }));
                  annotationsRef.current = [...annotationsRef.current, ...sourcesAsAnnotations];
                  flushAnnotations();
                  // Also collect annotations for persistence
                  collectedAnnotations = [...collectedAnnotations, ...sourcesAsAnnotations];
                }
                break;
              }

              case "annotations": {

                const urlCitations = (event.annotations || [])
                  .filter((a: any) => a.type === "url_citation")
                  .map(
                    (a: any): UrlCitation => ({
                      type: "url_citation",
                      url: a.url,
                      title: a.title,
                      startIndex: a.startIndex,
                      endIndex: a.endIndex,
                    })
                  );

                const fileCitations = (event.annotations || [])
                  .filter((a: any) => a.type === "file_citation")
                  .map(
                    (a: any): FileCitation => ({
                      type: "file_citation",
                      fileId: a.fileId,
                      filename: a.filename,
                      index: a.index,
                    })
                  );

                const allCitations: Annotation[] = [
                  ...urlCitations,
                  ...fileCitations,
                ];
                if (allCitations.length > 0) {
                  // Accumulate in local variable for persistence
                  collectedAnnotations = [
                    ...collectedAnnotations,
                    ...allCitations,
                  ];
                  // Accumulate in ref and flush via rAF
                  annotationsRef.current = [...annotationsRef.current, ...allCitations];
                  flushAnnotations();
                }

                // Convert file_citations to DocumentCitation format for inline badges
                // OpenAI file_citations don't have text, so we use a placeholder
                if (fileCitations.length > 0) {
                  const docCitationsFromFiles: DocumentCitation[] =
                    fileCitations.map((fc: FileCitation, idx: number) => ({
                      id: idx + 1,
                      filename: fc.filename || "Documento",
                      pageNumber: null, // OpenAI doesn't provide page numbers
                      text: "Fuente citada del documento", // Placeholder since OpenAI doesn't provide the text
                    }));

                  // Merge with any existing document citations
                  collectedDocumentCitations = [
                    ...collectedDocumentCitations,
                    ...docCitationsFromFiles,
                  ];
                  setStreamingDocumentCitations(collectedDocumentCitations);
                }
                break;
              }

              case "suggestions": {
                if (event.suggestions && Array.isArray(event.suggestions)) {
                  // Store in local variable for persistence
                  collectedSuggestions = event.suggestions;
                  // Update UI state
                  setStreamingSuggestions(event.suggestions);
                }
                break;
              }

              case "file-search-start": {
                actionCounts.fileSearch += 1;
                const newFileSearch: FileSearchInfo = {
                  searchId: event.searchId,
                  status: "searching",
                };
                setStreamingFileSearches((prev) => [...prev, newFileSearch]);
                break;
              }

              case "file-search-searching": {
                setStreamingFileSearches((prev) =>
                  prev.map((fs) =>
                    fs.searchId === event.searchId
                      ? { ...fs, status: "searching" as const }
                      : fs
                  )
                );
                break;
              }

              case "file-search-done": {
                setStreamingFileSearches((prev) =>
                  prev.map((fs) =>
                    fs.searchId === event.searchId
                      ? { ...fs, status: "done" as const }
                      : fs
                  )
                );
                break;
              }

              case "document_citations": {
                if (event.citations && event.citations.length > 0) {
                  collectedDocumentCitations = event.citations.map(
                    (c: any) => ({
                      id: c.id,
                      filename: c.filename,
                      pageNumber: c.pageNumber,
                      text: c.text,
                      marker: c.marker,
                    })
                  );
                  setStreamingDocumentCitations(collectedDocumentCitations);
                }
                break;
              }

              case "code-interpreter-start": {
                actionCounts.codeInterpreter += 1;
                const newExec: CodeInterpreterExec = {
                  executionId: event.executionId || `ci-${Date.now()}`,
                  status: 'running',
                  code: '',
                  output: '',
                };
                codeInterpreterRef.current = [...codeInterpreterRef.current, newExec];
                collectedCodeInterpreterExecs.push(newExec);
                flushCodeInterpreter();
                break;
              }

              case "code-interpreter-interpreting": {
                codeInterpreterRef.current = codeInterpreterRef.current.map((ci) =>
                  ci.executionId === event.executionId
                    ? { ...ci, status: 'interpreting' as const }
                    : ci
                );
                flushCodeInterpreter();
                break;
              }

              case "code-interpreter-code-delta": {
                codeInterpreterRef.current = codeInterpreterRef.current.map((ci) =>
                  ci.executionId === event.executionId
                    ? { ...ci, code: ci.code + (event.delta || '') }
                    : ci
                );
                flushCodeInterpreter();
                break;
              }

              case "code-interpreter-code-done": {
                codeInterpreterRef.current = codeInterpreterRef.current.map((ci) =>
                  ci.executionId === event.executionId
                    ? { ...ci, code: event.code || ci.code }
                    : ci
                );
                // Update collected for persistence
                collectedCodeInterpreterExecs = collectedCodeInterpreterExecs.map((ci) =>
                  ci.executionId === event.executionId
                    ? { ...ci, code: event.code || ci.code }
                    : ci
                );
                flushCodeInterpreter();
                break;
              }

              case "code-interpreter-done": {
                const doneUpdate = {
                  status: 'done' as const,
                  output: event.output || '',
                  images: event.images || undefined,
                };
                codeInterpreterRef.current = codeInterpreterRef.current.map((ci) =>
                  ci.executionId === event.executionId
                    ? { ...ci, ...doneUpdate }
                    : ci
                );
                // Update collected for persistence
                collectedCodeInterpreterExecs = collectedCodeInterpreterExecs.map((ci) =>
                  ci.executionId === event.executionId
                    ? { ...ci, ...doneUpdate }
                    : ci
                );
                flushCodeInterpreter();
                break;
              }

              case "code-interpreter-container-images": {
                // Images downloaded from container file citations
                // Append to the last code interpreter exec's images
                const containerImages = event.images as Array<{
                  mimeType: string;
                  data: string;
                  filename: string;
                }>;
                if (containerImages && containerImages.length > 0) {
                  const lastExecIdx =
                    codeInterpreterRef.current.length - 1;
                  if (lastExecIdx >= 0) {
                    const lastExec =
                      codeInterpreterRef.current[lastExecIdx];
                    const existingImages = lastExec.images || [];
                    const updatedImages = [
                      ...existingImages,
                      ...containerImages,
                    ];
                    codeInterpreterRef.current =
                      codeInterpreterRef.current.map((ci, idx) =>
                        idx === lastExecIdx
                          ? { ...ci, images: updatedImages }
                          : ci
                      );
                    collectedCodeInterpreterExecs =
                      collectedCodeInterpreterExecs.map((ci, idx) =>
                        idx ===
                        collectedCodeInterpreterExecs.length - 1
                          ? { ...ci, images: updatedImages }
                          : ci
                      );
                  } else {
                    // No code interpreter execs yet, create one
                    const newExec: CodeInterpreterExec = {
                      executionId: `container-images-${Date.now()}`,
                      status: "done",
                      code: "",
                      output: "",
                      images: containerImages,
                    };
                    codeInterpreterRef.current = [
                      ...codeInterpreterRef.current,
                      newExec,
                    ];
                    collectedCodeInterpreterExecs = [
                      ...collectedCodeInterpreterExecs,
                      newExec,
                    ];
                  }
                  flushCodeInterpreter();
                }
                break;
              }

              case "tool-call-start": {
                // Play tool use sound
                chatSounds.playToolUse();
                toolCalls.set(event.toolCallId, {
                  id: event.toolCallId,
                  name: event.toolName,
                  args: "",
                });
                setStreamingToolCalls(
                  Array.from(toolCalls.values()).map((tc) => ({
                    ...tc,
                    status: "streaming" as const,
                  }))
                );
                break;
              }

              case "tool-call-delta": {
                const tc = toolCalls.get(event.toolCallId);
                if (tc) {
                  tc.args += event.argsDelta;
                  setStreamingToolCalls(
                    Array.from(toolCalls.values()).map((t) => ({
                      ...t,
                      status: "streaming" as const,
                    }))
                  );
                }
                break;
              }

              case "tool-call-done": {
                // Tool is being executed in main process
                // Just update status to "executing"
                const existingTc = toolCalls.get(event.toolCallId);
                if (existingTc) {
                  toolCalls.set(event.toolCallId, {
                    ...existingTc,
                    args: JSON.stringify(event.args),
                  });
                }
                setStreamingToolCalls((prev) =>
                  prev.map((t) =>
                    t.id === event.toolCallId
                      ? {
                          ...t,
                          status: "executing" as const,
                          args: JSON.stringify(event.args),
                        }
                      : t
                  )
                );
                break;
              }

              case "tool-result": {
                // Tool was executed in main process, update with result
                const existingTc = toolCalls.get(event.toolCallId);
                if (existingTc) {
                  toolCalls.set(event.toolCallId, {
                    ...existingTc,
                    result: event.result,
                  });
                }

                setStreamingToolCalls((prev) =>
                  prev.map((t) =>
                    t.id === event.toolCallId
                      ? {
                          ...t,
                          status: event.success
                            ? ("complete" as const)
                            : ("error" as const),
                          result: event.result,
                        }
                      : t
                  )
                );

                // Play tool error sound if tool failed
                if (!event.success) {
                  chatSounds.playToolError();
                }

                // Auto-navigate to EXCEL/DOCS tab when spreadsheet/document is created
                // This provides a "computer use" experience - AI controls the UI directly
                const isSpreadsheetCreation =
                  event.toolName === "create_spreadsheet";
                const isDocumentCreation = event.toolName === "create_document";
                const isArtifactCreation =
                  isSpreadsheetCreation || isDocumentCreation;

                if (
                  isArtifactCreation &&
                  event.success &&
                  event.result?.artifactId
                ) {
                  // Play artifact created sound
                  chatSounds.playArtifactCreated();

                  // Invalidate artifacts query
                  utils.artifacts.list.invalidate({ chatId: chatIdForStream });

                  // Navigate directly to the appropriate tab (no panel, no lag)
                  try {
                    const artifact = await trpcClient.artifacts.get.query({
                      id: event.result.artifactId,
                    });
                    console.log("[ChatView] Navigating to artifact tab:", {
                      id: artifact?.id,
                      name: artifact?.name,
                      type: artifact?.type,
                      hasUniverData: !!artifact?.univer_data,
                    });
                    if (artifact) {
                      setSelectedArtifact(artifact as any);
                      // Go directly to EXCEL or DOCS tab - no panel!
                      setActiveTab(isSpreadsheetCreation ? "excel" : "doc");
                      setArtifactPanelOpen(false); // Ensure panel is closed
                    }
                  } catch (err) {
                    console.warn(
                      "[ChatView] Failed to navigate to artifact:",
                      err
                    );
                  }
                }
                break;
              }

              case "error": {
                setStreamingError(event.error);
                // Play error sound for streaming/API errors
                chatSounds.playError();
                // Reset streaming state (same as finish, but without saving message)
                setIsStreaming(false);
                setStreamingStatus(chatIdForStream, "error"); // Sync with Zustand
                smoothStream.stopStream();
                setStreamingToolCalls([]);
                if (fullReasoning) {
                  setLastReasoning(fullReasoning);
                }
                setStreamingReasoning("");
                setIsReasoning(false);
                setStreamingWebSearches([]);
                webSearchesRef.current = [];
                setStreamingFileSearches([]);
                setStreamingAnnotations([]);
                annotationsRef.current = [];
                setStreamingDocumentCitations([]);
                setStreamingCodeInterpreterExecs([]);
                codeInterpreterRef.current = [];
                cleanupListener?.();
                abortRef.current = null;
                break;
              }

              case "finish": {
                const durationMs = Date.now() - streamStartedAt;
                const rawUsage = event.usage;
                const usage = {
                  inputTokens: rawUsage?.promptTokens || 0,
                  outputTokens: rawUsage?.completionTokens || 0,
                  reasoningTokens: rawUsage?.reasoningTokens || 0,
                  totalTokens:
                    (rawUsage?.promptTokens || 0) +
                    (rawUsage?.completionTokens || 0) +
                    (rawUsage?.reasoningTokens || 0),
                };
                const contextWindow = AI_MODELS[selectedModel]?.contextWindow;

                // Save assistant message to database
                if (fullText || toolCalls.size > 0) {
                  const toolCallsArray = Array.from(toolCalls.values()).map(
                    (tc) => {
                      try {
                        return {
                          id: tc.id,
                          name: tc.name,
                          args: tc.args ? JSON.parse(tc.args) : null,
                          result: tc.result,
                        };
                      } catch {
                        return {
                          id: tc.id,
                          name: tc.name,
                          args: null,
                        };
                      }
                    }
                  );

                  const modelName =
                    AI_MODELS[selectedModel]?.name ?? selectedModel;
                  const actions = [
                    actionCounts.attachments > 0
                      ? {
                          type: "attachments" as const,
                          count: actionCounts.attachments,
                        }
                      : null,
                    actionCounts.webSearch > 0
                      ? {
                          type: "web-search" as const,
                          count: actionCounts.webSearch,
                        }
                      : null,
                    actionCounts.fileSearch > 0
                      ? {
                          type: "file-search" as const,
                          count: actionCounts.fileSearch,
                        }
                      : null,
                    actionCounts.codeInterpreter > 0
                      ? {
                          type: "code-interpreter" as const,
                          count: actionCounts.codeInterpreter,
                        }
                      : null,
                    toolCallsArray.length > 0
                      ? { type: "tool" as const, count: toolCallsArray.length }
                      : null,
                    {
                      type: "model" as const,
                      modelId: selectedModel,
                      modelName,
                    },
                  ].filter(Boolean) as Array<
                    | {
                        type:
                          | "attachments"
                          | "web-search"
                          | "file-search"
                          | "code-interpreter"
                          | "tool";
                        count: number;
                      }
                    | { type: "model"; modelId: string; modelName: string }
                  >;

                  console.log(
                    "[ChatView] Saving message with tool calls:",
                    JSON.stringify(toolCallsArray, null, 2)
                  );
                  console.log("[ChatView] Saving message with reasoning:", fullReasoning?.length || 0, "chars");

                  await addMessage.mutateAsync({
                    chatId: chatIdForStream,
                    role: "assistant",
                    content: { type: "text", text: fullText },
                    toolCalls:
                      toolCallsArray.length > 0 ? toolCallsArray : undefined,
                    modelId: selectedModel,
                    modelName,
                    metadata: {
                      usage,
                      contextWindow: contextWindow || undefined,
                      durationMs,
                      reasoning: fullReasoning || undefined,
                      actions: actions.length > 0 ? actions : undefined,
                      annotations:
                        collectedAnnotations.length > 0
                          ? collectedAnnotations
                          : undefined,
                      documentCitations:
                        collectedDocumentCitations.length > 0
                          ? collectedDocumentCitations
                          : undefined,
                      // Persist web searches for display in reasoning
                      webSearches:
                        collectedWebSearches.length > 0
                          ? collectedWebSearches
                          : undefined,
                      // Persist suggestions for later retrieval
                      suggestions:
                        collectedSuggestions.length > 0
                          ? collectedSuggestions
                          : undefined,
                      // Persist code interpreter executions
                      codeInterpreterExecs:
                        collectedCodeInterpreterExecs.length > 0
                          ? collectedCodeInterpreterExecs
                          : undefined,
                      ...(event.responseId && {
                        openaiResponseId: event.responseId,
                      }),
                      // Fallback por si las columnas model_id/model_name no existen o fallan
                      ...(selectedModel && { model_id: selectedModel }),
                      ...(modelName && { model_name: modelName }),
                    },
                  });

                  if (chatIdForStream === selectedChatId) {
                    await refetchMessages();
                  } else {
                    utils.messages.list.invalidate({ chatId: chatIdForStream });
                  }

                  // Refresh artifacts list after message is saved
                  utils.artifacts.list.invalidate({ chatId: chatIdForStream });
                }

                setIsStreaming(false);
                setStreamingStatus(chatIdForStream, "ready"); // Sync with Zustand - ready for next message
                smoothStream.stopStream();
                setStreamingToolCalls([]);
                // Save reasoning from local variable before clearing
                if (fullReasoning) {
                  setLastReasoning(fullReasoning);
                }
                setStreamingReasoning("");
                setIsReasoning(false);
                // Clear search states (already saved in message metadata)
                setStreamingWebSearches([]);
                webSearchesRef.current = [];
                setStreamingFileSearches([]);
                setStreamingAnnotations([]);
                annotationsRef.current = [];
                setStreamingDocumentCitations([]);
                setStreamingCodeInterpreterExecs([]);
                codeInterpreterRef.current = [];

                // Stop thinking sound and play response done sound
                stopThinkingRef.current?.();
                chatSounds.playResponseDone();

                cleanupListener?.(); // Clean up listener when done
                abortRef.current = null;
                break;
              }
            }
          }
        );

        // Store abort function to remove listener and cancel stream
        abortRef.current = () => {
          cleanupListener?.();
          // Also call cancel mutation
          trpcClient.ai.cancel.mutate({ chatId: chatIdForStream });
        };

        // Start the stream via mutation
        // Build images array for Claude vision API
        const imageContent = images?.map((img) => ({
          type: "image" as const,
          data: img.base64Data,
          mediaType: img.mediaType,
        }));

        // Responses API (OpenAI, ChatGPT Plus): pass last response id to chain context (store: true + previous_response_id)
        const lastAssistant = [...(historySource || [])]
          .reverse()
          .find((m: { role: string }) => m.role === "assistant") as
          | { metadata?: { openaiResponseId?: string } }
          | undefined;
        const previousResponseId =
          (provider === "openai" || provider === "chatgpt-plus") &&
          lastAssistant?.metadata?.openaiResponseId
            ? lastAssistant.metadata.openaiResponseId
            : undefined;

        // If user selected a specific document via @mention, prepend context to prompt
        const promptWithDocContext = targetDocumentForSearch
          ? `[Focus on document: "${targetDocumentForSearch.filename}"]\n\n${userMessage}`
          : userMessage;

        // Get user's timezone for accurate date/time context
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        await chatMutation.mutateAsync({
          chatId: chatIdForStream,
          prompt: promptWithDocContext,
          mode,
          provider,
          apiKey,
          model: selectedModel,
          messages: messageHistory,
          images:
            imageContent && imageContent.length > 0 ? imageContent : undefined,
          previousResponseId,
          /** Instant / Thinking / Auto (solo GPT-5.2) — el backend ignora si el modelo no lo soporta */
          responseMode,
          // Always pass reasoning configuration
          reasoning: {
            effort: reasoningEffort,
            summary: "concise", // Always generate reasoning summaries
          },
          // Enable file search if there are files in vector store OR if targeting a specific document
          // Enable code interpreter for models that support it
          nativeTools: {
            ...(hasFilesInVectorStore || targetDocumentForSearch ? { fileSearch: true } : {}),
            ...(AI_MODELS[selectedModel]?.supportsCodeInterpreter ? { codeInterpreter: true } : {}),
          },
          // Image generation mode - forces use of generate_image tool with gpt-image-1.5
          generateImage: shouldGenerateImage,
          // Image size based on selected aspect ratio
          imageSize,
          // Target document for focused file search
          targetDocument: targetDocumentForSearch || undefined,
          // User's timezone for accurate date/time in AI responses
          timezone: userTimezone,
        });
      } catch (error) {
        cleanupListener?.();
        throw error;
      }
    };

    try {
      await sendWithChatId(chatId, existingMessages);

      const uploadedAttachments = imageUploadPromise
        ? await imageUploadPromise
        : [];
      if (uploadedAttachments.length > 0) {
        const latestMessages = await trpcClient.messages.list.query({
          chatId: chatId,
        });
        const lastUserMessage = [...latestMessages]
          .reverse()
          .find((msg) => msg.role === "user");

        if (lastUserMessage?.id) {
          await trpcClient.messages.update.mutate({
            id: lastUserMessage.id,
            attachments: uploadedAttachments,
          });

          await refetchMessages();
        }
      }

      if (documentUploadPromise) {
        await documentUploadPromise;
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Play error sound for send failures
      chatSounds.playError();

      if (isChatAccessError(errorMessage)) {
        console.warn(
          "[ChatView] Chat not found, creating a new chat and retrying"
        );

        try {
          const newChat = await createFallbackChat();
          toast.info("Chat anterior no existía. Se creó uno nuevo.");
          await sendWithChatId(newChat.id, []);
          return;
        } catch (retryError) {
          console.error(
            "[ChatView] Failed to recover from chat access error:",
            retryError
          );
          setSelectedChatId(null);
          setStreamingError("Chat not found. Please create a new chat.");
          setIsStreaming(false);
          if (chatId) {
            setStreamingStatus(chatId, "error");
          }
          return;
        }
      }

      setStreamingError(errorMessage);
      setIsStreaming(false);
      if (chatId) {
        setStreamingStatus(chatId, "error");
      }
    }
  };

  // Keep ref updated for use in callbacks
  handleSendRef.current = handleSend;

  // Register send callback for queue processor
  useEffect(() => {
    if (!selectedChatId) return;

    // Create a wrapper that converts ChatQueueItem to handleSend parameters
    const sendCallback = async (item: any) => {
      const images = item.images?.map((img: any) => ({
        base64Data: img.base64Data,
        mediaType: img.mediaType,
        filename: img.filename,
      }));
      const documents = item.documents?.map((doc: any) => doc.file);
      const targetDocument = item.targetDocument
        ? { id: item.targetDocument.id, filename: item.targetDocument.filename }
        : null;

      await handleSendRef.current?.(
        images,
        documents,
        targetDocument,
        item.message,
        {
          generateImage: item.generateImage,
          imageSize: item.imageSize,
        }
      );
    };

    registerCallback(selectedChatId, sendCallback);

    return () => {
      unregisterCallback(selectedChatId);
    };
  }, [selectedChatId, registerCallback, unregisterCallback]);

  // === QUICK PROMPT AUTO-SEND ===
  // Watch for pending messages from Quick Prompt and auto-send them
  const [pendingMessage, setPendingMessage] = useAtom(
    pendingQuickPromptMessageAtom
  );

  useEffect(() => {
    if (pendingMessage && selectedChatId && handleSendRef.current) {
      console.log(
        "[ChatView] Auto-sending pending Quick Prompt message:",
        pendingMessage.substring(0, 50) + "..."
      );

      // Clear the pending message first to prevent re-triggering
      setPendingMessage(null);

      // Call handleSend with the message override (4th param)
      handleSendRef.current(undefined, undefined, null, pendingMessage);
    }
  }, [pendingMessage, selectedChatId, setPendingMessage]);

  // Handle plan approval - sends "Implement plan" message and switches to agent mode
  const handleApprovePlan = useCallback(() => {
    // Switch to agent mode
    setIsPlanMode(false);

    // Send "Implement plan" message using ref to avoid stale closure (4th param)
    handleSendRef.current?.(undefined, undefined, null, "Implement plan");
  }, [setIsPlanMode]);

  // Keyboard shortcut: Cmd/Ctrl+Enter to approve plan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        hasUnapprovedPlan &&
        !isStreaming
      ) {
        e.preventDefault();
        handleApprovePlan();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasUnapprovedPlan, isStreaming, handleApprovePlan]);

  // Handle stop streaming
  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setIsStreaming(false);
    if (selectedChatId) {
      setStreamingStatus(selectedChatId, "ready");
    }
  };

  // Invalidate queries when chat changes and clear artifact selection
  useEffect(() => {
    if (selectedChatId) {
      utils.messages.list.invalidate({ chatId: selectedChatId });
    }
    // Clear artifact selection when chat changes
    // The new chat may have different artifacts
    setSelectedArtifact(null);
    setArtifactPanelOpen(false);
  }, [selectedChatId, utils, setSelectedArtifact, setArtifactPanelOpen]);

  const getScrollViewport = useCallback(() => {
    const root = scrollContainerRef.current;
    if (!root) return null;
    return root.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
    setShowScrollToBottom(false);
  }, []);

  const updateScrollButton = useCallback(() => {
    const viewport = getScrollViewport();
    if (!viewport) return;
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 120);
  }, [getScrollViewport]);

  const handleScrollToMessage = useCallback((id: string) => {
    document
      .getElementById(`msg-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Memoized handler for viewing artifacts
  const handleViewArtifact = useCallback(
    async (artifactId: string) => {
      try {
        const artifact = await trpcClient.artifacts.get.query({
          id: artifactId,
        });
        if (artifact) {
          setSelectedArtifact(artifact as any);
          setArtifactPanelOpen(true);
        }
      } catch (error) {
        console.error("Failed to open artifact:", error);
      }
    },
    [setSelectedArtifact, setArtifactPanelOpen]
  );

  useEffect(() => {
    // Scroll on new messages or streaming updates (only if user is at bottom)
    if (
      !showScrollToBottom &&
      (messages?.length || streamingText || streamingToolCalls.length)
    ) {
      scrollToBottom("smooth");
    }
    updateScrollButton();
  }, [
    messages?.length,
    streamingText,
    streamingToolCalls.length,
    scrollToBottom,
    updateScrollButton,
    showScrollToBottom,
  ]);

  // Scroll immediately on send (only if user is at bottom)
  useEffect(() => {
    if (isStreaming && !showScrollToBottom) {
      scrollToBottom("auto");
    }
  }, [isStreaming, scrollToBottom, showScrollToBottom]);

  useEffect(() => {
    const viewport = getScrollViewport();
    if (!viewport) return;
    updateScrollButton();

    const handleScroll = () => updateScrollButton();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [getScrollViewport, updateScrollButton]);

  // Intersection Observer to track active user message for ToC
  useEffect(() => {
    const viewport = getScrollViewport();
    if (!viewport || !messages?.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace("msg-", "");
            setActiveMessageId(id);
          }
        });
      },
      {
        root: viewport,
        threshold: 0.1,
        rootMargin: "-10% 0px -70% 0px", // Detect near top
      }
    );

    const userMessages = messages.filter((m) => m.role === "user");
    userMessages.forEach((m) => {
      const el = document.getElementById(`msg-${m.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [messages, getScrollViewport]);

  // Load suggestions from the last assistant message when chat history is loaded
  // This ensures suggestions persist across page refreshes and chat switches
  useEffect(() => {
    // Don't load suggestions while streaming (we're generating new ones)
    if (isStreaming || !messages || messages.length === 0) return;

    // Find the last assistant message
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");

    if (lastAssistantMessage?.metadata?.suggestions) {
      const savedSuggestions = lastAssistantMessage.metadata.suggestions;
      if (Array.isArray(savedSuggestions) && savedSuggestions.length > 0) {
        console.log(
          "[ChatView] Loading suggestions from last message:",
          savedSuggestions
        );
        setStreamingSuggestions(savedSuggestions);
      }
    } else {
      // Clear suggestions if no saved suggestions found
      setStreamingSuggestions([]);
    }
  }, [messages, isStreaming, setStreamingSuggestions]);

  // Error state - chat not found (stale localStorage)
  if (messagesError && selectedChatId) {
    const isNotFound =
      messagesError.message?.includes("not found") ||
      messagesError.message?.includes("access denied");
    if (isNotFound) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[hsl(var(--chat-background))]">
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
      );
    }
  }

  // Empty state - no chat selected
  if (!selectedChatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[hsl(var(--chat-background))]">
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
                Configure your{" "}
                {provider === "openai"
                  ? "OpenAI"
                  : provider === "zai"
                  ? "Z.AI"
                  : "Anthropic"}{" "}
                API key to start chatting
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => openSettingsPage()}
              >
                {provider === "openai" ? (
                  <IconBrandOpenai size={16} className="mr-2" />
                ) : provider === "zai" ? (
                  <IconBolt size={16} className="mr-2" />
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
    );
  }

  // Check if this is an empty chat (no messages and not streaming)
  const isEmptyChat =
    (!messages || messages.length === 0) && !isStreaming && !lastReasoning;
  const showZenEmptyBackground = zenMode && isEmptyChat;

  // Empty chat state - centered welcome + input
  if (isEmptyChat) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center overflow-hidden relative px-4 bg-[hsl(var(--chat-background))]"
        style={
          showZenEmptyBackground
            ? {
                backgroundImage: `linear-gradient(to bottom, hsl(var(--zen-empty-overlay) / var(--zen-empty-overlay-top-alpha)), hsl(var(--zen-empty-overlay) / var(--zen-empty-overlay-bottom-alpha))), url(${zenBackgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }
            : undefined
        }
      >
        <div className="w-full max-w-[740px] flex flex-col items-center">
          {/* Welcome message */}
          <div className="flex flex-col items-center text-muted-foreground mb-8 animate-in fade-in duration-700">
            <div className="mb-6">
              <Logo size={64} />
            </div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              How can I help you today?
            </h1>
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
                onClick={() => openSettingsPage()}
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
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative bg-[hsl(var(--chat-background))]">
      {/* Messages area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top Fade Overlay */}
        <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-[hsl(var(--chat-background))] via-[hsl(var(--chat-background)/0.8)] to-transparent pointer-events-none z-10" />

        <ScrollArea className="h-full w-full" ref={scrollContainerRef}>
          <div className="pb-16 w-full overflow-hidden">
            {/* Safe area is now handled by MainLayout */}
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
              streamingDocumentCitations={streamingDocumentCitations}
              streamingCodeInterpreterExecs={streamingCodeInterpreterExecs}
              streamingError={streamingError}
            />
            <div ref={messagesEndRef} className="h-px" />
          </div>
        </ScrollArea>

        {showScrollToBottom && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-full bg-background/95 border border-border shadow-lg backdrop-blur-sm">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-9 w-9 rounded-full hover:bg-accent"
                    onClick={() => scrollToBottom("smooth")}
                    aria-label="Ir al final"
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
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[hsl(var(--chat-background))] to-transparent pointer-events-none z-10" />

        {/* Floating ToC - right side, horizontal lines, length by prompt (hidden in Zen Mode) */}
        {!zenMode && (
          <div className="absolute right-2 top-10 bottom-16 w-12 flex flex-col items-end justify-start pt-2 z-[8] pointer-events-none overflow-hidden">
            <div className="pointer-events-auto max-h-full overflow-y-auto py-1 pr-1 scrollbar-none">
              <MessageTableOfContents
                messages={messages || []}
                activeId={activeMessageId}
                onScrollToMessage={handleScrollToMessage}
                tooltipSide="left"
              />
            </div>
          </div>
        )}
      </div>

      {/* Queue indicator - shows when messages are queued - MOVED OUTSIDE INPUT AREA */}
      {currentQueue.length > 0 && (
        <div className="absolute bottom-[calc(100%-4rem)] left-1/2 -translate-x-1/2 z-30 w-full max-w-[740px] px-4 pointer-events-none">
          <div className="flex items-center justify-center gap-2 text-sm text-foreground bg-blue-500/90 backdrop-blur-sm rounded-lg px-4 py-2.5 shadow-lg border border-blue-400/50 pointer-events-auto">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
              <span className="font-semibold text-white">
                {currentQueue.length}{" "}
                {currentQueue.length === 1
                  ? "mensaje en cola"
                  : "mensajes en cola"}
              </span>
            </div>
            <span className="text-xs text-white/90 hidden sm:inline">
              · Se enviarán cuando termine el streaming
            </span>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="relative z-20">
        <div className="max-w-[740px] mx-auto">
          {!isConfigured ? (
            <div className="px-4 pb-4">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => openSettingsPage()}
              >
                Configure API Key to start chatting
              </Button>
            </div>
          ) : (
            <>
              {/* Files panel - shows uploaded documents */}
              {documentUpload.files.length > 0 && (
                <ChatFilesPanel className="px-4 pb-2 max-w-[740px] mx-auto" />
              )}

              {/* Suggestions panel */}
              {!isStreaming && streamingSuggestions.length > 0 && (
                <div className="px-4 pb-2 max-w-[740px] mx-auto w-full">
                  <SuggestedPrompts
                    suggestions={streamingSuggestions}
                    onSelect={(suggestion) => {
                      handleSend(undefined, undefined, null, suggestion);
                    }}
                  />
                </div>
              )}

              {/* Show "Implement Plan" button when there's an unapproved plan and input is empty */}
              {hasUnapprovedPlan && !input.trim() && !isStreaming ? (
                <div className="px-4 pb-4 max-w-[740px] mx-auto w-full">
                  <Button
                    type="button"
                    onClick={handleApprovePlan}
                    className="w-full flex items-center justify-center gap-3 h-12 px-6 rounded-xl bg-[hsl(var(--plan-mode))] text-[hsl(var(--plan-mode-foreground))] text-base font-medium hover:bg-[hsl(var(--plan-mode))]/90 transition-all shadow-lg shadow-[hsl(var(--plan-mode))]/20"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="none"
                      aria-hidden="true"
                    >
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

      {/* Image Edit Dialog - controlled by imageEditDialogAtom */}
      <ImageEditDialog
        open={imageEditDialog.isOpen}
        onOpenChange={(open) =>
          setImageEditDialog((prev) => ({ ...prev, isOpen: open }))
        }
        imageUrl={imageEditDialog.imageUrl}
        originalPrompt={imageEditDialog.originalPrompt}
        onEditComplete={() => {
          // Close dialog after successful edit
          setImageEditDialog({
            isOpen: false,
            imageUrl: "",
            originalPrompt: "",
          });
          // Refetch messages to show the new edited image in the chat
          refetchMessages();
        }}
      />
    </div>
  );
}

// Generate auto title for new chats
const autoTitleRetryDelays = [0, 3_000, 5_000, 5_000];
const autoTitleModel = "gpt-5-nano";

function getFallbackTitle(userMessage: string) {
  const trimmed = userMessage.trim();
  if (!trimmed) return "New Chat";
  if (trimmed.length <= 25) return trimmed;
  return `${trimmed.slice(0, 25)}...`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateAutoTitle(
  chatId: string,
  userMessage: string,
  provider: string
) {
  try {
    const result = await trpcClient.ai.generateTitle.mutate({
      prompt: userMessage,
      provider: provider as
        | "openai"
        | "anthropic"
        | "zai"
        | "chatgpt-plus"
        | undefined,
      model: autoTitleModel,
    });

    const resolvedTitle =
      result.title && result.title !== "New Chat"
        ? result.title
        : getFallbackTitle(userMessage);

    if (!resolvedTitle || resolvedTitle === "New Chat") {
      return;
    }

    for (let attempt = 0; attempt < autoTitleRetryDelays.length; attempt += 1) {
      if (attempt > 0) {
        await sleep(autoTitleRetryDelays[attempt]);
      }

      try {
        await trpcClient.chats.update.mutate({
          id: chatId,
          title: resolvedTitle,
        });
        return;
      } catch (error) {
        if (attempt === autoTitleRetryDelays.length - 1) {
          console.error(
            "[ChatView] Failed to apply auto title after retries:",
            error
          );
        }
      }
    }
  } catch (error) {
    console.error("[ChatView] Failed to generate auto title:", error);
  }
}
