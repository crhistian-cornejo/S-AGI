/**
 * Agent Panel - Premium AI assistant panel for Excel, Docs, and PDF tabs
 *
 * Features:
 * - Model selector with provider grouping
 * - Multimodal input (text + images)
 * - Streaming responses with tool calls
 * - Context-aware based on active document
 * - Minimalist Ramp-style UI with floating action icons
 */

import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import { nanoid } from "nanoid";
import {
  IconSend,
  IconSparkles,
  IconLoader2,
  IconTrash,
  IconX,
  IconPhoto,
  IconCloudUpload,
  IconHistory,
  IconRefresh,
  IconUser,
  IconTable,
  IconChartBar,
  IconMathFunction,
  IconFileSpreadsheet,
  IconFileText,
  IconFileDescription,
  IconSearch,
  IconBookmark,
  IconHighlight,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
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
import { AgentToolCallsGroup } from "./agent-tool-calls-group";
import {
  agentPanelOpenAtom,
  agentPanelMessagesAtom,
  agentPanelConfigAtom,
  agentPanelStreamingAtom,
  agentPanelStreamingTextAtom,
  agentPanelImagesAtom,
  activeTabAtom,
  selectedArtifactAtom,
  selectedPdfAtom,
  type AgentPanelMessage,
  type AgentPanelImageAttachment,
  // New file system atoms
  currentExcelFileIdAtom,
  currentExcelFileAtom,
  currentDocFileIdAtom,
  currentDocFileAtom,
} from "@/lib/atoms";
import { AI_MODELS, getModelsByProvider } from "@s-agi/core/types/ai";
import type { AIProvider } from "@s-agi/core/types/ai";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Suggested prompts for each agent type
const SUGGESTED_PROMPTS = {
  excel: [
    {
      icon: IconTable,
      text: "Crear una tabla de análisis financiero con totales",
    },
    {
      icon: IconMathFunction,
      text: "Generar fórmulas para calcular promedios y sumas",
    },
    {
      icon: IconChartBar,
      text: "Formatear estos datos como un dashboard ejecutivo",
    },
  ],
  doc: [
    {
      icon: IconFileText,
      text: "Redactar un resumen ejecutivo de este documento",
    },
    {
      icon: IconHighlight,
      text: "Mejorar la redacción y corregir errores",
    },
    {
      icon: IconFileDescription,
      text: "Crear una tabla de contenidos estructurada",
    },
  ],
  pdf: [
    {
      icon: IconSearch,
      text: "Buscar información específica en el documento",
    },
    {
      icon: IconBookmark,
      text: "Resumir los puntos clave del PDF",
    },
    {
      icon: IconHighlight,
      text: "Extraer datos importantes en formato tabla",
    },
  ],
} as const;

// Agent context configurations
const AGENT_CONTEXTS = {
  excel: {
    icon: IconFileSpreadsheet,
    title: "Excel Agent",
    subtitle: "Spreadsheet Assistant",
    placeholder: "Analiza datos, crea fórmulas, formatea celdas...",
    color: "emerald",
  },
  doc: {
    icon: IconFileText,
    title: "Docs Agent",
    subtitle: "Document Assistant",
    placeholder: "Escribe contenido, edita texto, formatea documento...",
    color: "blue",
  },
  pdf: {
    icon: IconFileDescription,
    title: "PDF Agent",
    subtitle: "Document Analyst",
    placeholder: "Busca, resume, pregunta sobre el PDF...",
    color: "amber",
  },
} as const;

type AgentTab = keyof typeof AGENT_CONTEXTS;

function isAgentTab(tab: string): tab is AgentTab {
  return tab in AGENT_CONTEXTS;
}

// Message component with tool calls support - Minimalist style
const AgentMessage = memo(function AgentMessage({
  message,
}: {
  message: AgentPanelMessage;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
          <IconSparkles size={14} className="text-primary" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%]",
          isUser
            ? "bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2.5"
            : "bg-transparent",
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
                className="h-16 w-16 object-cover rounded-lg border border-border/30"
              />
            ))}
          </div>
        )}

        {/* Tool calls - Rich visualization with grouping */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2">
            <AgentToolCallsGroup
              toolCalls={message.toolCalls.map((tc) => ({
                id: tc.toolCallId,
                name: tc.toolName,
                args: tc.args ? JSON.stringify(tc.args) : undefined,
                result: tc.result,
                status: tc.status === "executing" ? "streaming" : tc.status === "done" ? "complete" : tc.status,
              }))}
              isStreaming={message.toolCalls.some((tc) => tc.status === "executing")}
            />
          </div>
        )}

        {/* Content */}
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div className="text-sm text-foreground">
            <ChatMarkdownRenderer content={message.content} size="sm" />
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center mt-0.5">
          <IconUser size={14} className="text-muted-foreground" />
        </div>
      )}
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

// Suggested Prompt Card Component
const SuggestedPromptCard = memo(function SuggestedPromptCard({
  icon: Icon,
  text,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 w-full p-3 rounded-xl",
        "bg-background/60 border border-border/40",
        "hover:border-primary/30 hover:bg-primary/5",
        "transition-all duration-200 text-left",
      )}
    >
      <div className="shrink-0 w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
        <Icon size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <span className="text-sm text-muted-foreground group-hover:text-foreground leading-relaxed transition-colors">
        {text}
      </span>
    </button>
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
  const selectedArtifact = useAtomValue(selectedArtifactAtom);
  const selectedPdf = useAtomValue(selectedPdfAtom);

  // New file system state
  const currentExcelFileId = useAtomValue(currentExcelFileIdAtom);
  const currentExcelFile = useAtomValue(currentExcelFileAtom);
  const currentDocFileId = useAtomValue(currentDocFileIdAtom);
  const currentDocFile = useAtomValue(currentDocFileAtom);

  const [input, setInput] = useState("");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Track streaming text in ref for finish handler (avoids stale closure)
  const streamingTextRef = useRef<string>("");

  // Get agent context
  const agentContext = isAgentTab(activeTab) ? AGENT_CONTEXTS[activeTab] : null;
  const suggestedPrompts = isAgentTab(activeTab) ? SUGGESTED_PROMPTS[activeTab] : [];

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

  // Session ID for streaming (combine tab + file/artifact id)
  const sessionId = useMemo(() => {
    if (activeTab === "pdf" && selectedPdf) {
      return `${activeTab}-${selectedPdf.id}`;
    }
    // Use file ID for new file system, fall back to artifact ID
    if (activeTab === "excel" && currentExcelFileId) {
      return `${activeTab}-file-${currentExcelFileId}`;
    }
    if (activeTab === "doc" && currentDocFileId) {
      return `${activeTab}-file-${currentDocFileId}`;
    }
    if (selectedArtifact) {
      return `${activeTab}-${selectedArtifact.id}`;
    }
    return `${activeTab}-default`;
  }, [activeTab, selectedPdf, currentExcelFileId, currentDocFileId, selectedArtifact]);

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
          // Update both state (for UI) and ref (for finish handler)
          streamingTextRef.current += event.delta || "";
          setStreamingText((prev) => prev + (event.delta || ""));
          break;

        case "text-done":
          // Store the final text for finish handler
          // text-done provides the complete accumulated text (backup if deltas missed)
          if (event.text) {
            streamingTextRef.current = event.text;
          }
          break;

        case "tool-call-start":
          console.log("[AgentPanel] Processing tool-call-start:", {
            toolName: event.toolName,
            toolCallId: event.toolCallId,
          });
          // Update last message with tool call
          setMessages((prev: AgentPanelMessage[]) => {
            const last = prev[prev.length - 1];
            console.log("[AgentPanel] tool-call-start state check:", {
              hasLast: !!last,
              lastRole: last?.role,
              hasToolName: !!event.toolName,
              hasToolCallId: !!event.toolCallId,
              messageCount: prev.length,
            });
            if (last && last.role === "assistant" && event.toolName && event.toolCallId) {
              console.log("[AgentPanel] Adding tool call to message");
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
                      args: (event as { args?: Record<string, unknown> }).args,
                    },
                  ],
                },
              ];
            }
            console.log("[AgentPanel] Tool call condition not met, skipping");
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
          streamingTextRef.current = "";
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
          // Add final message using ref (avoids stale closure issue)
          if (streamingTextRef.current) {
            const finalContent = streamingTextRef.current;
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
          streamingTextRef.current = "";
          setStreamingText("");
          setIsStreaming(false);
          break;
      }
    };

    // @ts-expect-error - desktopApi type extended in preload
    const hasApi = !!window.desktopApi?.onAgentPanelStream;
    console.log("[AgentPanel] Registering stream listener:", {
      sessionId,
      hasDesktopApi: !!window.desktopApi,
      hasOnAgentPanelStream: hasApi,
    });
    const cleanup = window.desktopApi?.onAgentPanelStream?.(handleStream);
    if (!cleanup) {
      console.warn("[AgentPanel] Failed to register listener - onAgentPanelStream returned undefined");
    } else {
      console.log("[AgentPanel] Stream listener successfully registered for session:", sessionId);
    }
    return () => {
      console.log(
        "[AgentPanel] Stream listener cleanup for session:",
        sessionId,
      );
      cleanup?.();
    };
    // Note: streamingText intentionally excluded from deps to prevent re-registering
    // listener on every text-delta. The handler uses stable setStreamingText reference.
    // The 'finish' case uses streamingText from closure which may be stale, but that's
    // fine since we track full text in fullText variable inside the streaming handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, setStreamingText, setIsStreaming, setMessages, activeTab]);

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
      // Build context: Excel/Doc use current file (new) or artifact (legacy) so tools operate on the open spreadsheet/doc
      let context: {
        workbookId?: string;
        sheetId?: string;
        selectedRange?: string;
        documentId?: string;
        documentTitle?: string;
        pdfPath?: string;
        pdfName?: string;
        pdfPages?: { pageNumber: number; content: string; wordCount: number }[];
        fileId?: string;
        fileName?: string;
      } | undefined;

      if (activeTab === "excel") {
        // Prefer new file system, fall back to legacy artifact
        if (currentExcelFileId && currentExcelFile) {
          context = {
            workbookId: currentExcelFileId, // For backward compatibility with tools
            fileId: currentExcelFileId,
            fileName: currentExcelFile.name,
          };
        } else if (selectedArtifact?.type === "spreadsheet") {
          context = { workbookId: selectedArtifact.id };
        }
      } else if (activeTab === "doc") {
        // Prefer new file system, fall back to legacy artifact
        if (currentDocFileId && currentDocFile) {
          context = {
            documentId: currentDocFileId, // For backward compatibility with tools
            documentTitle: currentDocFile.name,
            fileId: currentDocFileId,
            fileName: currentDocFile.name,
          };
        } else if (selectedArtifact?.type === "document") {
          context = {
            documentId: selectedArtifact.id,
            documentTitle: selectedArtifact.name,
          };
        }
      } else if (activeTab === "pdf" && selectedPdf) {
        context = {
          pdfPath: selectedPdf.metadata?.localPath,
          pdfName: selectedPdf.name,
          pdfPages: selectedPdf.pages?.map((p) => ({
            pageNumber: p.pageNumber,
            content: p.content,
            wordCount: p.wordCount || p.content.split(/\s+/).length,
          })),
        };
      }

      console.log("[AgentPanel] Sending to backend:", {
        sessionId,
        tabType: activeTab,
        contextWorkbookId: context?.workbookId,
        contextDocumentId: context?.documentId,
        contextPdfPagesCount: context?.pdfPages?.length ?? 0,
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
        context,
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
    selectedArtifact,
    selectedPdf,
    currentExcelFileId,
    currentExcelFile,
    currentDocFileId,
    currentDocFile,
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

  // Get the icon component
  const AgentIcon = agentContext.icon;

  // Handle suggested prompt click
  const handlePromptClick = (promptText: string) => {
    setInput(promptText);
    inputRef.current?.focus();
  };

  // Check if we should show the welcome state
  const showWelcomeState = messages.length === 0 && !streamingText && !isLocalPdf && !isPdfWithoutPages;

  return (
    <div className="relative flex flex-col h-full bg-background">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Floating Action Icons - Top Right of Panel */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-0.5">
        {/* History button */}
        {isAgentTab(activeTab) && hasSavedHistory && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setHistoryDialogOpen(true)}
                className="relative h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-all"
              >
                <IconHistory size={15} />
                {historyCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-[8px] text-primary-foreground flex items-center justify-center font-bold">
                    {historyCount > 9 ? '9+' : historyCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Historial ({historyCount})</TooltipContent>
          </Tooltip>
        )}

        {/* Refresh button */}
        {isAgentTab(activeTab) && !hasSavedHistory && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  refetchMessages();
                  utils.panelMessages.list.invalidate({
                    panelType: 'agent_panel',
                    sourceId: sessionId,
                    tabType: activeTab
                  });
                }}
                disabled={isLoadingHistory}
                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-50"
              >
                <IconRefresh size={15} className={cn(isLoadingHistory && "animate-spin")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Recargar</TooltipContent>
          </Tooltip>
        )}

        {/* Clear button */}
        {messages.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleClear}
                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
              >
                <IconTrash size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Limpiar</TooltipContent>
          </Tooltip>
        )}

        {/* Close button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-all"
            >
              <IconX size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Cerrar</TooltipContent>
        </Tooltip>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        <ScrollArea className="h-full">
          <div className="min-h-full flex flex-col">
            {/* Welcome State - Centered */}
            {showWelcomeState ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
                {/* Welcome Header */}
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                    {agentContext.title}
                  </h1>
                  <div className="w-10 h-10 rounded-xl border border-border/60 flex items-center justify-center bg-background">
                    <AgentIcon size={20} className="text-foreground" />
                  </div>
                </div>

                {/* Subtitle */}
                <p className="text-sm text-muted-foreground mb-16">
                  {agentContext.subtitle}
                </p>

                {/* Spacer to push prompts down */}
                <div className="flex-1 min-h-[100px]" />

                {/* Suggested Prompts */}
                <div className="w-full max-w-md space-y-2">
                  {suggestedPrompts.map((prompt, idx) => (
                    <SuggestedPromptCard
                      key={idx}
                      icon={prompt.icon}
                      text={prompt.text}
                      onClick={() => handlePromptClick(prompt.text)}
                    />
                  ))}
                </div>
              </div>
            ) : (isLocalPdf || isPdfWithoutPages) && messages.length === 0 ? (
              /* PDF Upload Required State */
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
                <div
                  className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center mb-6",
                    "bg-amber-500/10 border border-amber-500/20",
                  )}
                >
                  <IconCloudUpload size={28} className="text-amber-500" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  PDF Local Detectado
                </h2>
                <p className="text-sm text-muted-foreground text-center max-w-[280px] leading-relaxed">
                  Para usar el asistente AI, sube este PDF a la nube desde el chat para extraer su contenido.
                </p>
              </div>
            ) : (
              /* Messages State */
              <div className="px-4 py-6 space-y-4">
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
                    <div className="bg-muted/40 rounded-2xl rounded-bl-md px-4 py-3">
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
                          Pensando...
                        </TextShimmer>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input - Original Style */}
      <div className="shrink-0 p-3">
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
                  <button
                    type="button"
                    className={cn(
                      "h-7 w-7 rounded-lg flex items-center justify-center",
                      "text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors",
                      images.length > 0 && "text-primary",
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                  >
                    <IconPhoto size={15} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Attach image</TooltipContent>
              </Tooltip>
            </div>

            {/* Send/Stop button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center transition-all",
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
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isStreaming ? "Stop" : "Send message"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* History Dialog - Minimalist Style */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-border/50">
            <DialogTitle className="text-lg font-semibold">Historial</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {historyCount} mensaje{historyCount !== 1 ? 's' : ''} en {agentContext?.title || 'este panel'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="p-4 space-y-4">
              {savedMessages && savedMessages.length > 0 ? (
                savedMessages.map((msg: { id: string; role: string; content: string; created_at: string; metadata?: { images?: unknown; toolCalls?: unknown } }) => (
                  <div key={msg.id} className={cn("flex gap-3", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    {msg.role === 'assistant' && (
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                        <IconSparkles size={14} className="text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%]",
                        msg.role === 'user'
                          ? "bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2.5"
                          : "bg-transparent"
                      )}
                    >
                      {msg.role === 'user' ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="text-sm text-foreground">
                          <ChatMarkdownRenderer content={msg.content} size="sm" />
                        </div>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center mt-0.5">
                        <IconUser size={14} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">
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
