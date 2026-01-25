/**
 * Agent Panel - Premium AI assistant panel for Excel, Docs, and PDF tabs
 *
 * Features:
 * - Model selector with provider grouping
 * - Multimodal input (text + images)
 * - Streaming responses with tool calls
 * - Context-aware based on active document
 * - Premium UI matching chat-input design language
 */

import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import { nanoid } from "nanoid";
import {
  IconSend,
  IconSparkles,
  IconLoader2,
  IconTrash,
  IconChevronRight,
  IconX,
  IconPhoto,
  IconCheck,
  IconAlertCircle,
  IconCloudUpload,
  IconHistory,
  IconRefresh,
  IconUser,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMarkdownRenderer } from "@/components/chat-markdown-renderer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ModelIcon } from "@/components/icons/model-icons";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
  agentPanelOpenAtom,
  agentPanelMessagesAtom,
  agentPanelConfigAtom,
  agentPanelStreamingAtom,
  agentPanelStreamingTextAtom,
  agentPanelImagesAtom,
  activeTabAtom,
  selectedPdfAtom,
  type AgentPanelMessage,
  type AgentPanelImageAttachment,
} from "@/lib/atoms";
import { AI_MODELS, getModelsByProvider } from "@s-agi/core/types/ai";
import type { AIProvider } from "@s-agi/core/types/ai";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Agent context configurations
const AGENT_CONTEXTS = {
  excel: {
    icon: "📊",
    title: "Excel Agent",
    subtitle: "Spreadsheet Assistant",
    placeholder: "Analyze data, create formulas, format cells...",
    color: "emerald",
  },
  doc: {
    icon: "📝",
    title: "Docs Agent",
    subtitle: "Document Assistant",
    placeholder: "Write content, edit text, format document...",
    color: "blue",
  },
  pdf: {
    icon: "📄",
    title: "PDF Agent",
    subtitle: "Document Analyst",
    placeholder: "Search, summarize, ask questions about the PDF...",
    color: "amber",
  },
} as const;

type AgentTab = keyof typeof AGENT_CONTEXTS;

function isAgentTab(tab: string): tab is AgentTab {
  return tab in AGENT_CONTEXTS;
}

// Tool call status component
const ToolCallStatus = memo(function ToolCallStatus({
  toolName,
  status,
}: {
  toolName: string;
  status: "executing" | "done" | "error";
}) {
  const formatToolName = (name: string) =>
    name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg",
        status === "executing" && "bg-primary/10 text-primary",
        status === "done" &&
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        status === "error" && "bg-destructive/10 text-destructive",
      )}
    >
      {status === "executing" && (
        <IconLoader2 size={12} className="animate-spin" />
      )}
      {status === "done" && <IconCheck size={12} />}
      {status === "error" && <IconAlertCircle size={12} />}
      <span className="font-medium">{formatToolName(toolName)}</span>
    </div>
  );
});

// Message component with tool calls support
const AgentMessage = memo(function AgentMessage({
  message,
}: {
  message: AgentPanelMessage;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-2",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[90%] rounded-2xl",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md px-4 py-2.5"
            : "bg-muted/60 rounded-bl-md px-4 py-3",
        )}
      >
        {/* Images if any */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.images.map((img, i) => (
              <img
                key={i}
                src={`data:${img.mediaType};base64,${img.data}`}
                alt={img.filename || "Attached image"}
                className="h-16 w-16 object-cover rounded-lg border border-border/50"
              />
            ))}
          </div>
        )}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.toolCalls.map((tc) => (
              <ToolCallStatus
                key={tc.toolCallId}
                toolName={tc.toolName}
                status={tc.status}
              />
            ))}
          </div>
        )}

        {/* Content */}
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <ChatMarkdownRenderer content={message.content} size="sm" />
        )}
      </div>
    </div>
  );
});

// Image attachment preview
const ImagePreview = memo(function ImagePreview({
  image,
  onRemove,
}: {
  image: AgentPanelImageAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="relative group">
      <img
        src={image.url || `data:${image.mediaType};base64,${image.data}`}
        alt={image.filename}
        className={cn(
          "h-14 w-14 object-cover rounded-lg border border-border/50",
          image.isLoading && "opacity-50",
        )}
      />
      {image.isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <IconLoader2 size={16} className="animate-spin text-primary" />
        </div>
      ) : (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
        >
          <IconX size={12} />
        </button>
      )}
    </div>
  );
});

// Model selector component
const ModelSelector = memo(function ModelSelector({
  modelId,
  onProviderChange,
  onModelChange,
}: {
  modelId: string;
  onProviderChange: (provider: AIProvider) => void;
  onModelChange: (modelId: string) => void;
}) {
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();
  const currentModel = AI_MODELS[modelId];

  // Group models by provider
  const modelGroups = useMemo(
    () => ({
      openai: getModelsByProvider("openai"),
      "chatgpt-plus": getModelsByProvider("chatgpt-plus"),
      zai: getModelsByProvider("zai"),
      claude: getModelsByProvider("claude"),
    }),
    [],
  );

  const handleModelChange = (newModelId: string) => {
    const model = AI_MODELS[newModelId];
    if (model) {
      onProviderChange(model.provider);
      onModelChange(newModelId);
    }
  };

  return (
    <Select value={modelId} onValueChange={handleModelChange}>
      <SelectTrigger
        className="h-7 w-auto max-w-[140px] px-2 bg-transparent border-none shadow-none hover:bg-accent/50 gap-1.5 rounded-lg text-[10px] font-semibold"
        title={currentModel?.description}
      >
        <ModelIcon
          provider={currentModel?.provider || "openai"}
          size={12}
          className="shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 truncate">
          <SelectValue>{currentModel?.name || modelId}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent className="rounded-xl shadow-xl border-border/50 min-w-[180px]">
        {/* ChatGPT Plus models */}
        {keyStatus?.hasChatGPTPlus &&
          modelGroups["chatgpt-plus"].length > 0 && (
            <>
              <div className="text-[9px] font-bold uppercase text-muted-foreground/50 px-2.5 py-1.5 flex items-center gap-1.5">
                <ModelIcon provider="chatgpt-plus" size={10} />
                ChatGPT Plus
              </div>
              {modelGroups["chatgpt-plus"].map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  className="rounded-lg text-xs"
                >
                  {model.name}
                </SelectItem>
              ))}
              <div className="h-px bg-border/40 my-1 mx-2" />
            </>
          )}

        {/* OpenAI API models */}
        {keyStatus?.hasOpenAI && modelGroups.openai.length > 0 && (
          <>
            <div className="text-[9px] font-bold uppercase text-muted-foreground/50 px-2.5 py-1.5 flex items-center gap-1.5">
              <ModelIcon provider="openai" size={10} />
              OpenAI API
            </div>
            {modelGroups.openai.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                className="rounded-lg text-xs"
              >
                {model.name}
              </SelectItem>
            ))}
          </>
        )}

        {/* Z.AI models */}
        {keyStatus?.hasZai && modelGroups.zai.length > 0 && (
          <>
            <div className="h-px bg-border/40 my-1 mx-2" />
            <div className="text-[9px] font-bold uppercase text-muted-foreground/50 px-2.5 py-1.5 flex items-center gap-1.5">
              <ModelIcon provider="zai" size={10} />
              Z.AI
            </div>
            {modelGroups.zai.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                className="rounded-lg text-xs"
              >
                {model.name}
              </SelectItem>
            ))}
          </>
        )}

        {/* Claude models */}
        {keyStatus?.hasClaudeCode && modelGroups.claude?.length > 0 && (
          <>
            <div className="h-px bg-border/40 my-1 mx-2" />
            <div className="text-[9px] font-bold uppercase text-muted-foreground/50 px-2.5 py-1.5 flex items-center gap-1.5">
              <ModelIcon provider="claude" size={10} />
              Claude Pro/Max
            </div>
            {modelGroups.claude.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                className="rounded-lg text-xs"
              >
                {model.name}
              </SelectItem>
            ))}
          </>
        )}

        {/* No providers configured */}
        {!keyStatus?.hasOpenAI &&
          !keyStatus?.hasZai &&
          !keyStatus?.hasChatGPTPlus &&
          !keyStatus?.hasClaudeCode && (
            <div className="text-xs text-muted-foreground px-3 py-3 text-center">
              No API keys configured
            </div>
          )}
      </SelectContent>
    </Select>
  );
});

// Main Agent Panel
export function AgentPanel() {
  const [isOpen, setIsOpen] = useAtom(agentPanelOpenAtom);
  const [allMessages, setAllMessages] = useAtom(agentPanelMessagesAtom);
  const [config, setConfig] = useAtom(agentPanelConfigAtom);
  const [isStreaming, setIsStreaming] = useAtom(agentPanelStreamingAtom);
  const [streamingText, setStreamingText] = useAtom(
    agentPanelStreamingTextAtom,
  );
  const [images, setImages] = useAtom(agentPanelImagesAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const selectedPdf = useAtomValue(selectedPdfAtom);

  const [input, setInput] = useState("");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get agent context
  const agentContext = isAgentTab(activeTab) ? AGENT_CONTEXTS[activeTab] : null;

  // Check if PDF is local (not cloud-synced with extracted pages)
  const isLocalPdf = activeTab === "pdf" && selectedPdf?.type === "local";
  const isPdfWithoutPages = activeTab === "pdf" && !!selectedPdf && !selectedPdf.pages?.length;

  // Get messages for current tab
  const messages = allMessages[activeTab] ?? [];
  const setMessages = useCallback(
    (
      newMessagesOrUpdater:
        | AgentPanelMessage[]
        | ((prev: AgentPanelMessage[]) => AgentPanelMessage[]),
    ) => {
      setAllMessages((prev) => {
        const currentMessages = prev[activeTab] ?? [];
        const newMessages =
          typeof newMessagesOrUpdater === "function"
            ? newMessagesOrUpdater(currentMessages)
            : newMessagesOrUpdater;
        return { ...prev, [activeTab]: newMessages };
      });
    },
    [activeTab, setAllMessages],
  );

  // Session ID for streaming (combine tab + artifact id)
  const sessionId = useMemo(() => {
    if (activeTab === "pdf" && selectedPdf) {
      return `${activeTab}-${selectedPdf.id}`;
    }
    return `${activeTab}-default`;
  }, [activeTab, selectedPdf]);

  // tRPC mutations
  const chatMutation = trpc.agentPanel.chat.useMutation();
  const stopMutation = trpc.agentPanel.stop.useMutation();
  const addPanelMessage = trpc.panelMessages.add.useMutation();
  const clearPanelMessages = trpc.panelMessages.clear.useMutation();
  const utils = trpc.useUtils();

  // Load messages from Supabase when session changes
  const { data: savedMessages, refetch: refetchMessages, isLoading: isLoadingHistory } = trpc.panelMessages.list.useQuery(
    {
      panelType: 'agent_panel',
      sourceId: sessionId,
      tabType: isAgentTab(activeTab) ? activeTab : undefined
    },
    {
      enabled: isAgentTab(activeTab),
      refetchOnWindowFocus: false
    }
  );

  const hasSavedHistory = savedMessages && savedMessages.length > 0;
  const historyCount = savedMessages?.length || 0;

  // Sync saved messages to local state
  // Note: We intentionally exclude 'messages' from deps to avoid infinite loop
  // The effect only needs to run when savedMessages or activeTab changes
  useEffect(() => {
    if (savedMessages && savedMessages.length > 0 && isAgentTab(activeTab)) {
      const syncedMessages: AgentPanelMessage[] = savedMessages.map((msg: { id: string; role: string; content: string; created_at: string; metadata?: { images?: unknown; toolCalls?: unknown } }) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at).getTime(),
        images: msg.metadata?.images as AgentPanelMessage['images'],
        toolCalls: msg.metadata?.toolCalls as AgentPanelMessage['toolCalls']
      }));
      setMessages(syncedMessages);
    } else if (savedMessages && savedMessages.length === 0) {
      // Clear local state when switching to a session with no saved messages
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedMessages, activeTab, setMessages]);

  // Listen to streaming events
  useEffect(() => {
    // Note: The preload bridge passes a single event object, not (ipcEvent, data)
    const handleStream = (event: {
      sessionId: string;
      type: string;
      delta?: string;
      text?: string;
      error?: string;
      toolName?: string;
      toolCallId?: string;
      result?: unknown;
    }) => {
      console.log("[AgentPanel] Stream event received:", event);
      if (!event || event.sessionId !== sessionId) {
        console.log("[AgentPanel] Ignoring event - session mismatch:", {
          eventSessionId: event?.sessionId,
          expectedSessionId: sessionId,
        });
        return;
      }

      switch (event.type) {
        case "text-delta":
          setStreamingText((prev) => prev + (event.delta || ""));
          break;

        case "text-done":
          // Finalize the message
          break;

        case "tool-call-start":
          // Update last message with tool call
          setMessages((prev: AgentPanelMessage[]) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && event.toolName && event.toolCallId) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  toolCalls: [
                    ...(last.toolCalls || []),
                    {
                      toolName: event.toolName,
                      toolCallId: event.toolCallId,
                      status: "executing" as const,
                    },
                  ],
                },
              ];
            }
            return prev;
          });
          break;

        case "tool-call-done":
          setMessages((prev: AgentPanelMessage[]) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.toolCalls) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  toolCalls: last.toolCalls.map(
                    (tc: {
                      toolName: string;
                      toolCallId: string;
                      status: "executing" | "done" | "error";
                      result?: unknown;
                    }) =>
                      tc.toolCallId === event.toolCallId
                        ? {
                            ...tc,
                            status: "done" as const,
                            result: event.result,
                          }
                        : tc,
                  ),
                },
              ];
            }
            return prev;
          });
          break;

        case "error":
          setStreamingText("");
          setIsStreaming(false);
          // Add error message
          setMessages((prev: AgentPanelMessage[]) => [
            ...prev,
            {
              id: nanoid(),
              role: "assistant",
              content: `Error: ${event.error}`,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "finish":
          // Add final message
          if (streamingText) {
            const finalContent = streamingText;
            setMessages((prev: AgentPanelMessage[]) => {
              // Update the last assistant message or add new one
              // Use reverse + findIndex for ES2015 compatibility
              const reversedIdx = [...prev].reverse().findIndex(
                (m: AgentPanelMessage) => m.role === "assistant",
              );
              const lastIdx = reversedIdx >= 0 ? prev.length - 1 - reversedIdx : -1;
              let updatedMessages: AgentPanelMessage[];
              if (lastIdx >= 0) {
                updatedMessages = [
                  ...prev.slice(0, lastIdx),
                  { ...prev[lastIdx], content: finalContent },
                  ...prev.slice(lastIdx + 1),
                ];
              } else {
                updatedMessages = [
                  ...prev,
                  {
                    id: nanoid(),
                    role: "assistant",
                    content: finalContent,
                    timestamp: Date.now(),
                  },
                ];
              }
              
              // Save assistant message to Supabase
              if (isAgentTab(activeTab)) {
                const lastMessage = updatedMessages[updatedMessages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  addPanelMessage.mutateAsync({
                    panelType: 'agent_panel',
                    sourceId: sessionId,
                    tabType: activeTab,
                    role: 'assistant',
                    content: finalContent,
                    metadata: lastMessage.toolCalls ? { toolCalls: lastMessage.toolCalls } : undefined
                  }).then(() => {
                    utils.panelMessages.list.invalidate({
                      panelType: 'agent_panel',
                      sourceId: sessionId,
                      tabType: activeTab
                    });
                  }).catch((err: unknown) => {
                    console.error('Failed to save assistant message:', err);
                  });
                }
              }
              
              return updatedMessages;
            });
          }
          setStreamingText("");
          setIsStreaming(false);
          break;
      }
    };

    // @ts-expect-error - desktopApi type extended in preload
    const cleanup = window.desktopApi?.onAgentPanelStream?.(handleStream);
    console.log(
      "[AgentPanel] Stream listener registered for session:",
      sessionId,
    );
    return () => {
      console.log(
        "[AgentPanel] Stream listener cleanup for session:",
        sessionId,
      );
      cleanup?.();
    };
  }, [sessionId, streamingText, setStreamingText, setIsStreaming, setMessages, activeTab]);

  // Auto-scroll
  useEffect(() => {
    if (messages.length || streamingText) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!input.trim() && images.length === 0) return;
    if (isStreaming || !agentContext) return;

    const userMessage: AgentPanelMessage = {
      id: nanoid(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
      images:
        images.length > 0
          ? images.map((img) => ({
              data: img.data,
              mediaType: img.mediaType,
              filename: img.filename,
            }))
          : undefined,
    };

    // Add user message and placeholder assistant message
    setMessages([
      ...messages,
      userMessage,
      {
        id: nanoid(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      },
    ]);

    // Save user message to Supabase
    if (isAgentTab(activeTab)) {
      try {
        await addPanelMessage.mutateAsync({
          panelType: 'agent_panel',
          sourceId: sessionId,
          tabType: activeTab,
          role: 'user',
          content: userMessage.content,
          metadata: userMessage.images ? { images: userMessage.images } : undefined
        });
        await utils.panelMessages.list.invalidate({
          panelType: 'agent_panel',
          sourceId: sessionId,
          tabType: activeTab
        });
      } catch (err) {
        console.error('Failed to save user message:', err);
      }
    }

    setInput("");
    setImages([]);
    setIsStreaming(true);
    setStreamingText("");

    try {
      // Build context for PDF tab
      const pdfContext =
        activeTab === "pdf" && selectedPdf
          ? {
              // For local PDFs, pass the local path
              pdfPath: selectedPdf.metadata?.localPath,
              // For display/identification
              pdfName: selectedPdf.name,
              // For remote PDFs with pre-extracted content, pass the pages directly
              pdfPages: selectedPdf.pages?.map((p) => ({
                pageNumber: p.pageNumber,
                content: p.content,
                wordCount: p.wordCount || p.content.split(/\s+/).length,
              })),
            }
          : undefined;

      // Debug logging
      console.log("[AgentPanel] Sending to backend:", {
        sessionId,
        tabType: activeTab,
        selectedPdfType: selectedPdf?.type,
        selectedPdfId: selectedPdf?.id,
        selectedPdfName: selectedPdf?.name,
        hasLocalPath: !!selectedPdf?.metadata?.localPath,
        localPath: selectedPdf?.metadata?.localPath,
        hasPages: !!selectedPdf?.pages,
        pagesCount: selectedPdf?.pages?.length ?? 0,
        contextPdfPath: pdfContext?.pdfPath,
        contextPdfPagesCount: pdfContext?.pdfPages?.length ?? 0,
      });

      await chatMutation.mutateAsync({
        sessionId,
        tabType: activeTab as "excel" | "doc" | "pdf",
        prompt: userMessage.content,
        provider: config.provider,
        modelId: config.modelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        images: userMessage.images?.map((img) => ({
          data: img.data,
          mediaType: img.mediaType,
        })),
        context: pdfContext,
      });
    } catch (error) {
      console.error("Agent chat error:", error);
      setIsStreaming(false);
    }
  }, [
    input,
    images,
    isStreaming,
    agentContext,
    messages,
    setMessages,
    sessionId,
    activeTab,
    config,
    selectedPdf,
    chatMutation,
    setImages,
    setIsStreaming,
    setStreamingText,
  ]);

  // Handle stop
  const handleStop = useCallback(async () => {
    await stopMutation.mutateAsync({ sessionId });
    setIsStreaming(false);
  }, [sessionId, stopMutation, setIsStreaming]);

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Handle image paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleImageFile(file);
        }
      }
    }
  }, []);

  // Handle image file
  const handleImageFile = useCallback(
    async (file: File) => {
      const id = nanoid();
      const reader = new FileReader();

      // Add loading state
      setImages((prev) => [
        ...prev,
        {
          id,
          data: "",
          mediaType: file.type,
          filename: file.name,
          isLoading: true,
        },
      ]);

      reader.onload = (e) => {
        const base64 = (e.target?.result as string)?.split(",")[1] || "";
        setImages((prev) =>
          prev.map((img) =>
            img.id === id
              ? {
                  ...img,
                  data: base64,
                  url: e.target?.result as string,
                  isLoading: false,
                }
              : img,
          ),
        );
      };

      reader.readAsDataURL(file);
    },
    [setImages],
  );

  // Handle file select
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        Array.from(files).forEach(handleImageFile);
      }
      e.target.value = "";
    },
    [handleImageFile],
  );

  // Clear messages
  const handleClear = useCallback(async () => {
    setMessages([]);
    setStreamingText("");
    // Clear messages from Supabase
    if (isAgentTab(activeTab)) {
      try {
        await clearPanelMessages.mutateAsync({
          panelType: 'agent_panel',
          sourceId: sessionId,
          tabType: activeTab
        });
        await utils.panelMessages.list.invalidate({
          panelType: 'agent_panel',
          sourceId: sessionId,
          tabType: activeTab
        });
      } catch (err) {
        console.error('Failed to clear messages:', err);
      }
    }
  }, [setMessages, setStreamingText, activeTab, sessionId, clearPanelMessages, utils]);

  // Provider/model change handlers
  const handleProviderChange = useCallback(
    (provider: AIProvider) => {
      setConfig((prev) => ({ ...prev, provider }));
    },
    [setConfig],
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      setConfig((prev) => ({ ...prev, modelId }));
    },
    [setConfig],
  );

  if (!agentContext) return null;

  // Disable sending for local PDFs without extracted content
  const isAgentDisabled = isLocalPdf || isPdfWithoutPages;
  const canSend =
    (input.trim().length > 0 || images.length > 0) && !isStreaming && !isAgentDisabled;

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur-sm border-t border-border/50">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header */}
      <div
        className={cn(
          "flex flex-col border-b border-border/50 bg-background/80 shrink-0",
          activeTab === "pdf" ? "h-[88px]" : "h-12",
        )}
      >
        {/* PDF context bar */}
        {activeTab === "pdf" && (
          <div className="h-10 border-b border-border/30 flex items-center px-4 bg-amber-500/5">
            <span className="text-[9px] text-amber-600 dark:text-amber-400 uppercase tracking-[0.2em] font-bold">
              Document Context Active
            </span>
          </div>
        )}

        <div className="flex-1 flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center text-base",
                "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20",
              )}
            >
              {agentContext.icon}
            </div>
            <div>
              <h3 className="text-xs font-bold text-foreground leading-tight tracking-tight">
                {agentContext.title}
              </h3>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest">
                {agentContext.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* History button - more visible */}
            {isAgentTab(activeTab) && hasSavedHistory && (
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
            {isAgentTab(activeTab) && !hasSavedHistory && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => {
                      refetchMessages();
                      utils.panelMessages.list.invalidate({
                        panelType: 'agent_panel',
                        sourceId: sessionId,
                        tabType: activeTab
                      });
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
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={handleClear}
                  >
                    <IconTrash size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Limpiar conversación actual</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => setIsOpen(false)}
                >
                  <IconChevronRight size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Cerrar panel</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Messages with fade scroll effect */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top fade gradient */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background/95 to-transparent z-10 pointer-events-none" />
        {/* Bottom fade gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background/95 to-transparent z-10 pointer-events-none" />

        <ScrollArea className="h-full px-3">
          <div className="py-4 space-y-3">
            {/* Show message for local PDFs without extracted content */}
            {(isLocalPdf || isPdfWithoutPages) && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center mb-4",
                    "bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent",
                    "border border-amber-500/20 shadow-lg shadow-amber-500/5",
                  )}
                >
                  <IconCloudUpload size={26} className="text-amber-500" />
                </div>
                <h4 className="text-sm font-bold text-foreground mb-1">
                  PDF Local Detectado
                </h4>
                <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed mb-3">
                  Para usar el asistente AI, sube este PDF a la nube desde el chat para extraer su contenido.
                </p>
                <p className="text-[10px] text-muted-foreground/60 max-w-[200px]">
                  Los PDFs en la nube tienen texto extraído y búsqueda semántica.
                </p>
              </div>
            ) : messages.length === 0 && !streamingText ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center mb-4",
                    "bg-gradient-to-br from-primary/20 via-primary/10 to-transparent",
                    "border border-primary/20 shadow-lg shadow-primary/5",
                  )}
                >
                  <IconSparkles size={26} className="text-primary" />
                </div>
                <h4 className="text-sm font-bold text-foreground mb-1">
                  {agentContext.title}
                </h4>
                <p className="text-xs text-muted-foreground max-w-[200px] leading-relaxed">
                  {agentContext.placeholder}
                </p>
              </div>
            ) : (
              <>
                {messages
                  .filter((m) => m.content || m.toolCalls?.length)
                  .map((msg) => (
                    <AgentMessage key={msg.id} message={msg} />
                  ))}

                {/* Streaming message */}
                {streamingText && (
                  <AgentMessage
                    message={{
                      id: "streaming",
                      role: "assistant",
                      content: streamingText,
                      timestamp: Date.now(),
                    }}
                  />
                )}

                {/* Loading indicator */}
                {isStreaming && !streamingText && (
                  <div className="flex justify-start">
                    <div className="bg-muted/60 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2">
                        <IconLoader2
                          size={14}
                          className="animate-spin text-primary"
                        />
                        <TextShimmer
                          as="span"
                          className="text-xs font-medium"
                          duration={1.5}
                        >
                          Thinking...
                        </TextShimmer>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input - no border divider */}
      <div className="p-3">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {images.map((img) => (
              <ImagePreview
                key={img.id}
                image={img}
                onRemove={() =>
                  setImages((prev) => prev.filter((i) => i.id !== img.id))
                }
              />
            ))}
          </div>
        )}

        <div
          className={cn(
            "flex flex-col bg-muted/30 rounded-2xl border border-border/50",
            "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10",
            "transition-all duration-200",
          )}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isAgentDisabled ? "Sube el PDF a la nube para usar el agente..." : agentContext.placeholder}
            disabled={isStreaming || isAgentDisabled}
            rows={1}
            className={cn(
              "flex-1 bg-transparent text-sm text-foreground resize-none outline-none",
              "placeholder:text-muted-foreground/50 min-h-[44px] max-h-[100px] py-3 px-4",
            )}
            style={{ height: "auto", overflow: "hidden" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
            }}
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              {/* Model selector */}
              <ModelSelector
                modelId={config.modelId}
                onProviderChange={handleProviderChange}
                onModelChange={handleModelChange}
              />

              <div className="w-px h-3.5 bg-border/40 mx-0.5" />

              {/* Image attach */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 text-muted-foreground/50 hover:text-foreground rounded-lg",
                      images.length > 0 && "text-primary",
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                  >
                    <IconPhoto size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach image</TooltipContent>
              </Tooltip>
            </div>

            {/* Send/Stop button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className={cn(
                    "h-7 w-7 rounded-lg transition-all",
                    isStreaming
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : canSend
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                        : "bg-muted text-muted-foreground/40",
                  )}
                  onClick={isStreaming ? handleStop : handleSend}
                  disabled={!isStreaming && !canSend}
                >
                  {isStreaming ? (
                    <IconLoader2 size={14} className="animate-spin" />
                  ) : (
                    <IconSend size={14} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isStreaming ? "Stop" : "Send message"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Historial de Conversación</DialogTitle>
            <DialogDescription>
              {historyCount} mensaje{historyCount !== 1 ? 's' : ''} guardado{historyCount !== 1 ? 's' : ''} para {agentContext?.title || 'este documento'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-3">
              {savedMessages && savedMessages.length > 0 ? (
                savedMessages.map((msg: { id: string; role: string; content: string; created_at: string; metadata?: { images?: unknown; toolCalls?: unknown } }) => (
                  <div key={msg.id} className={cn("flex gap-2", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <IconSparkles size={14} className="text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[90%] rounded-2xl",
                        msg.role === 'user'
                          ? "bg-primary text-primary-foreground rounded-br-md px-4 py-2.5"
                          : "bg-muted/60 rounded-bl-md px-4 py-3"
                      )}
                    >
                      {msg.role === 'user' ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
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
    </div>
  );
}

// Toggle button for the titlebar logo
export function AgentPanelToggle({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useAtom(agentPanelOpenAtom);
  const activeTab = useAtomValue(activeTabAtom);

  // Only show for agent-enabled tabs
  const isAgentEnabled = isAgentTab(activeTab);

  if (!isAgentEnabled) return null;

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex items-center gap-2 transition-all duration-200",
        "hover:opacity-80 active:scale-95",
        isOpen && "text-primary",
        className,
      )}
      title={isOpen ? "Close Agent Panel" : "Open Agent Panel"}
    >
      <div
        className={cn(
          "relative",
          isOpen &&
            "after:absolute after:-bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
        )}
      >
        {/* This will wrap the Logo component in titlebar */}
      </div>
    </button>
  );
}

export default AgentPanel;
