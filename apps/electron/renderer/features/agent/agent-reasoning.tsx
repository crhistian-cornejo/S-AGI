import { useState, useMemo, useRef, useLayoutEffect, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
  IconBrain,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconPaperclip,
  IconTool,
} from "@tabler/icons-react";
import {
  CustomTerminalIcon,
  FileSearchIcon,
  GlobeIcon,
  IconSpinner,
} from "./icons";
import { getModelById } from "@s-agi/core/types/ai";
import {
  OpenAIIcon,
  ZaiIcon,
  ClaudeIcon,
} from "@/components/icons/model-icons";
import { AgentToolCallFlat, type ToolCall } from "./agent-tool-call-flat";
import { ConsolidatedWebSearchTimeline } from "./agent-web-search";
import { CompactMarkdownRenderer } from "@/components/chat-markdown-renderer";

/** Strip markdown bold from title so **text** renders as plain bold text */
function stripTitleMarkdown(title: string): string {
  return title
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .trim();
}

/** Parse reasoning content into structured format with title and bullets */
function parseReasoningContent(content: string): {
  title: string;
  bullets: string[];
  showMore: boolean;
} {
  if (!content || content.trim().length === 0) {
    return { title: "", bullets: [], showMore: false };
  }

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // First line is the title/summary
  const title = lines[0] || "";

  // Count remaining lines for "show more"
  const remainingLines = lines.slice(1);
  const showMore = remainingLines.length > 10;

  return { title, bullets: [], showMore };
}

export interface AgentReasoningAction {
  type:
    | "attachments"
    | "web-search"
    | "file-search"
    | "code-interpreter"
    | "tool"
    | "model";
  count?: number;
  label?: string;
  modelId?: string;
  modelName?: string;
  toolCall?: ToolCall;
}

/** Web search info with query and sources */
export interface WebSearchData {
  searchId: string;
  query?: string;
  status: "searching" | "done";
  action?: "search" | "open_page" | "find_in_page";
  domains?: string[];
  sources?: Array<{ url: string; title?: string }>;
}

/** URL citation from the response */
export interface UrlCitationData {
  type: "url_citation";
  url: string;
  title?: string;
  startIndex: number;
  endIndex: number;
}

/** File citation from file_search */
export interface FileCitationData {
  type: "file_citation";
  fileId: string;
  filename: string;
  index: number;
}

export type CitationData = UrlCitationData | FileCitationData;

/** Code interpreter execution with code and output */
export interface CodeInterpreterExecData {
  executionId: string;
  status: "running" | "interpreting" | "done";
  code: string;
  output: string;
  images?: Array<{ mimeType: string; data: string }>;
}

export interface AgentReasoningProps {
  /** The reasoning content (thinking process) */
  content: string;
  /** Whether the reasoning is still in progress */
  isStreaming?: boolean;
  /** Optional summary of the reasoning */
  summary?: string;
  /** Start collapsed (default: false for streaming, true for completed) */
  defaultCollapsed?: boolean;
  /** Custom className */
  className?: string;
  /** Total thinking time in milliseconds */
  durationMs?: number;
  /** Context actions used during reasoning */
  actions?: AgentReasoningAction[];
  /** Web searches with detailed info (query, sources) */
  webSearches?: WebSearchData[];
  /** Citations collected from the response (URL and file citations) */
  annotations?: CitationData[];
  /** Code interpreter executions with code and output */
  codeInterpreterExecs?: CodeInterpreterExecData[];
  /** Model ID used for this response */
  modelId?: string;
  /** Model name used for this response */
  modelName?: string;
}

/**
 * Compact component to display AI reasoning/thinking process
 * Collapsible toggle similar to ChatGPT's "Show thinking"
 */

function getActionLabel(action: AgentReasoningAction) {
  if (action.label) return action.label;
  if (action.type === "model")
    return action.modelName || action.modelId || "Model";
  const count = action.count ?? 1;
  switch (action.type) {
    case "attachments":
      return `Read ${count} attachment${count === 1 ? "" : "s"}`;
    case "web-search":
      return count > 1 ? `Searched the web (${count}x)` : "Searched the web";
    case "file-search":
      return count > 1
        ? `Searched Knowledge Base (${count}x)`
        : "Searched Knowledge Base";
    case "code-interpreter":
      return count > 1 ? `Ran code (${count}x)` : "Ran code";
    case "tool":
      return count > 1 ? `Ran ${count} tools` : "Ran 1 tool";
    default:
      return "Action";
  }
}

function getActionIcon(action: AgentReasoningAction) {
  switch (action.type) {
    case "attachments":
      return IconPaperclip;
    case "web-search":
      return GlobeIcon;
    case "file-search":
      return FileSearchIcon;
    case "code-interpreter":
      return CustomTerminalIcon;
    case "tool":
      return IconTool;
    case "model": {
      const p = getModelById(action.modelId || "")?.provider;
      if (p === "zai") return ZaiIcon;
      if (p === "claude") return ClaudeIcon;
      return OpenAIIcon;
    }
    default:
      return IconTool;
  }
}

/** Format duration in milliseconds to human-readable string */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/** Collapsible block showing code interpreter code + output */
function CodeInterpreterBlock({ exec }: { exec: CodeInterpreterExecData }) {
  const [isOpen, setIsOpen] = useState(exec.status !== "done");
  const isDone = exec.status === "done";

  return (
    <div className="relative">
      <CustomTerminalIcon
        className={cn(
          "absolute -left-5 top-[3px] w-3.5 h-3.5 shrink-0",
          isDone ? "text-muted-foreground/70" : "text-primary"
        )}
      />
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-foreground transition-colors"
      >
        {!isDone && <IconSpinner className="w-3 h-3 animate-spin text-primary" />}
        <span>
          {isDone
            ? "Ejecutó código"
            : exec.status === "interpreting"
              ? "Interpretando..."
              : "Ejecutando código..."}
        </span>
        <IconChevronDown
          size={12}
          className={cn(
            "opacity-60 transition-transform duration-200",
            !isOpen && "-rotate-90"
          )}
        />
      </button>
      {isOpen && exec.code && (
        <div className="mt-1.5 space-y-1.5">
          <pre className={cn(
            "text-[11px] leading-relaxed p-2.5 rounded-md overflow-x-auto",
            "bg-muted/50 border border-border/30",
            "text-muted-foreground font-mono",
            "max-h-60 overflow-y-auto"
          )}>
            <code>{exec.code}</code>
          </pre>
          {isDone && exec.output && (
            <div className={cn(
              "text-[11px] leading-relaxed p-2.5 rounded-md overflow-x-auto",
              "bg-green-500/5 border border-green-500/20",
              "text-muted-foreground font-mono",
              "max-h-40 overflow-y-auto"
            )}>
              <div className="text-[10px] text-green-600 dark:text-green-500 font-semibold mb-1">Output</div>
              <pre className="whitespace-pre-wrap">{exec.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentReasoning({
  content,
  isStreaming = false,
  summary,
  defaultCollapsed = false,
  className,
  durationMs,
  actions = [],
  webSearches = [],
  annotations = [],
  codeInterpreterExecs = [],
  modelId: _modelId,
  modelName: _modelName,
}: AgentReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
  const [showAllBullets, setShowAllBullets] = useState(false);

  // Animation refs and state
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>("0px");

  // Track content height for smooth animation
  const shouldAnimate = !isStreaming;
  const isOpen = isExpanded || isStreaming;

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (isOpen) {
        setMaxHeight(`${el.scrollHeight}px`);
      } else {
        setMaxHeight("0px");
      }
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);

    return () => observer.disconnect();
  }, [isOpen]);

  // Parse reasoning content into structured format
  const parsedReasoning = useMemo(() => {
    return parseReasoningContent(summary || content);
  }, [summary, content]);

  // Always show full reasoning content in the expanded area
  const displayText = (summary || content).trim();
  const hasContent = displayText.length > 0;
  const hasActions = actions.length > 0;
  const hasWebSearches = webSearches.length > 0;
  const hasAnnotations = annotations.length > 0;
  const hasCodeInterpreter = codeInterpreterExecs.length > 0;
  const canToggle =
    hasContent || hasActions || hasWebSearches || hasAnnotations || hasCodeInterpreter;

  // Check if all web searches are done (not still searching)
  const allSearchesDone = webSearches.every((ws) => ws.status === "done");
  // Check if all code interpreter executions are done
  const allCodeInterpreterDone = codeInterpreterExecs.every((ci) => ci.status === "done");

  if (!canToggle && !isStreaming) return null;

  // Use parsed title as header, or fallback to default
  // During streaming: show the LATEST reasoning step (progress indicator)
  // After streaming: show the first line as summary title
  const headerLabel = (() => {
    if (isStreaming) {
      const lines = (summary || content).split("\n").map(l => l.trim()).filter(l => l.length > 0);
      return lines[lines.length - 1] || "Pensando...";
    }
    return parsedReasoning.title || "Razonamiento";
  })();

  const normalizedActions = hasWebSearches
    ? actions.filter((a) => a.type !== "web-search")
    : actions;
  // Do not show "model" as a step in thought/reasoning
  const actionsWithoutModel = normalizedActions.filter(
    (a) => a.type !== "model"
  );

  // Sequence items for actions/tools (web searches rendered separately with ConsolidatedWebSearch)
  // Note: Sources are NOT added here - they are shown inside ConsolidatedWebSearch with favicons
  const sequenceItems: Array<{
    key: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    badge?: string;
    isActive?: boolean;
    toolCall?: ToolCall;
  }> = actionsWithoutModel.map((action, index) => ({
    key: `${action.type}-${index}`,
    icon: getActionIcon(action),
    label: getActionLabel(action),
    isActive: false,
    toolCall: action.toolCall,
  }));

  return (
    <div className={cn("", className)}>
      {/* Header row - title with time and chevron */}
      <button
        type="button"
        onClick={() => canToggle && setIsExpanded(!isExpanded)}
        className={cn(
          "inline-flex items-center gap-2 text-xs font-medium",
          isStreaming ? "text-foreground" : "text-muted-foreground",
          "hover:text-foreground transition-colors",
          canToggle ? "cursor-pointer" : "cursor-default"
        )}
        disabled={!canToggle}
      >
        {/* Brain icon when done, spinner when streaming */}
        {isStreaming ? (
          <IconSpinner className="w-3.5 h-3.5 text-primary animate-spin" />
        ) : (
          <IconBrain className="w-3.5 h-3.5 shrink-0" />
        )}

        {/* Title/Summary text - strip ** so it renders clean */}
        <span className="font-semibold">{stripTitleMarkdown(headerLabel)}</span>

        {/* Duration time next to title */}
        {!isStreaming && durationMs !== undefined && durationMs > 0 && (
          <span className="text-muted-foreground/60 font-normal">
            {formatDuration(durationMs)}
          </span>
        )}

        {/* Chevron icon for collapse/expand */}
        {canToggle && (
          <IconChevronDown
            size={14}
            className={cn(
              "ml-auto opacity-70 transition-transform duration-200",
              !isExpanded && "-rotate-90"
            )}
          />
        )}
      </button>

      {/* Expanded content - animated collapse/expand */}
      <div
        className={cn(
          "overflow-hidden will-change-[max-height,opacity]",
          shouldAnimate && "transition-[max-height,opacity] duration-200 ease-out",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        style={{ maxHeight: shouldAnimate ? maxHeight : isOpen ? "9999px" : "0px" }}
      >
        <div ref={contentRef} className="mt-2 pb-2 relative">
          {/* Vertical line connector */}
          <div className="absolute left-[5px] top-0 bottom-0 w-px bg-border/40" />

          <div className="pl-5 space-y-2">
            {/* Reasoning content with markdown - first step with clock icon */}
            {hasContent && (
              <div className="relative flex items-start gap-2">
                <IconClock className="absolute -left-5 top-[3px] w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
                <div
                  className={cn(
                    "text-[13px] text-muted-foreground/80 leading-[1.6]",
                    "[&_.prose]:text-muted-foreground/80",
                    "[&_strong]:text-muted-foreground [&_strong]:font-semibold",
                    "[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1.5 [&_ul]:my-2",
                    "[&_li]:text-muted-foreground/80",
                    "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                    isExpanded
                      ? "max-h-64 overflow-y-auto pr-2"
                      : "max-h-20 overflow-hidden"
                  )}
                >
                  <CompactMarkdownRenderer content={displayText} />
                </div>
              </div>
            )}

            {/* Show more button */}
            {parsedReasoning.showMore && !showAllBullets && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAllBullets(true);
                }}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                Mostrar más
              </button>
            )}

            {/* Sequence items (web searches, tools, etc.) - icons on line, no dots */}
            {sequenceItems.length > 0 && (
              <div className="space-y-1.5">
                {sequenceItems.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <div
                      key={item.key}
                      className="relative flex items-start gap-2"
                    >
                      <ItemIcon
                        className={cn(
                          "absolute -left-5 top-0.5 w-3.5 h-3.5 shrink-0",
                          item.isActive
                            ? "text-primary"
                            : "text-muted-foreground/70"
                        )}
                      />

                      {item.toolCall ? (
                        <div className="flex-1 min-w-0">
                          <AgentToolCallFlat
                            toolCalls={[item.toolCall]}
                            chatStatus={
                              item.toolCall.status === "executing" ||
                              item.toolCall.status === "streaming"
                                ? "streaming"
                                : "ready"
                            }
                            isStreaming={
                              item.toolCall.status === "executing" ||
                              item.toolCall.status === "streaming"
                            }
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                          <span>{item.label}</span>
                          {item.badge && (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Web searches - consolidated into ONE component with all sources */}
            {hasWebSearches && (
              <ConsolidatedWebSearchTimeline
                searches={webSearches}
                annotations={annotations?.filter(
                  (a): a is UrlCitationData => a.type === "url_citation"
                ) || []}
              />
            )}

            {/* Code interpreter executions */}
            {hasCodeInterpreter && (
              <div className="space-y-2">
                {codeInterpreterExecs.map((exec) => (
                  <CodeInterpreterBlock key={exec.executionId} exec={exec} />
                ))}
              </div>
            )}

            {/* "Listo" when done - only show when not streaming AND all async tasks are done */}
            {!isStreaming && hasContent && (!hasWebSearches || allSearchesDone) && (!hasCodeInterpreter || allCodeInterpreterDone) && (
              <div className="relative flex items-center gap-1.5 text-[13px] text-green-600 dark:text-green-500">
                <IconCheck className="absolute -left-5 top-[3px] w-3.5 h-3.5 shrink-0 text-green-500" />
                <span className="font-medium">Listo</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading dots when streaming but no content yet */}
      {isStreaming && !hasContent && sequenceItems.length === 0 && (
        <div className="mt-1 pl-5 flex items-center gap-1">
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse" />
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:150ms]" />
          <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:300ms]" />
        </div>
      )}
    </div>
  );
}
