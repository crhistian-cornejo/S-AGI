import { useState, useMemo, useRef, useLayoutEffect, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
  IconBookmark,
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

/** Simple markdown to HTML parser for reasoning content */
function parseMarkdownToHtml(text: string): string {
  if (!text) return "";

  let html = text
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // Italic: *text* or _text_ (but not inside words)
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "<em>$1</em>")
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "<em>$1</em>")
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  // Wrap in paragraph
  html = `<p>${html}</p>`;

  // Process bullet lists (- or * at start of line)
  html = html.replace(/<br\/>[-*•]\s+/g, "</li><li>");
  if (html.includes("</li><li>")) {
    html = html.replace(/<p>[-*•]\s+/, "<ul><li>");
    html = html.replace(/<\/li><li>([^<]*)<\/p>/, "</li><li>$1</li></ul>");
    // Fix remaining list items
    html = html.replace(/<\/p>$/, "</li></ul>");
  }

  return html;
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
  modelId,
  modelName,
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

  // If title is extracted from content, remove it from display text to avoid duplication
  const displayText = summary || content;
  const lines = displayText.split("\n").map((l) => l.trim());
  const hasTitleInContent =
    parsedReasoning.title &&
    lines.length > 0 &&
    lines[0] === parsedReasoning.title.trim();
  const contentWithoutTitle = hasTitleInContent
    ? lines.slice(1).join("\n").trim()
    : displayText;
  const hasContent = contentWithoutTitle.length > 0;
  const hasActions = actions.length > 0;
  const hasWebSearches = webSearches.length > 0;
  const hasAnnotations = annotations.length > 0;
  const canToggle =
    hasContent || hasActions || hasWebSearches || hasAnnotations;

  if (!canToggle && !isStreaming) return null;

  // Use parsed title as header, or fallback to default
  const headerLabel =
    parsedReasoning.title || (isStreaming ? "Pensando..." : "Razonamiento");

  const urlSet = new Set<string>();
  const fileSet = new Set<string>();
  annotations.forEach((annotation) => {
    if (annotation.type === "url_citation") {
      urlSet.add(annotation.url);
    }
    if (annotation.type === "file_citation") {
      fileSet.add(annotation.fileId);
    }
  });
  const uniqueUrlCount = urlSet.size;
  const uniqueFileCount = fileSet.size;

  const totalSources = uniqueUrlCount + uniqueFileCount;

  const normalizedActions = hasWebSearches
    ? actions.filter((a) => a.type !== "web-search")
    : actions;
  // Do not show "model" as a step in thought/reasoning
  const actionsWithoutModel = normalizedActions.filter(
    (a) => a.type !== "model"
  );

  const sequenceItems: Array<{
    key: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    badge?: string;
    isActive?: boolean;
    toolCall?: ToolCall;
  }> = [
    ...actionsWithoutModel.map((action, index) => ({
      key: `${action.type}-${index}`,
      icon: getActionIcon(action),
      label: getActionLabel(action),
      isActive: false,
      toolCall: action.toolCall,
    })),
    ...webSearches.map((ws) => ({
      key: `web-${ws.searchId}`,
      icon: GlobeIcon,
      label:
        ws.status === "searching" ? "Searching the web" : "Searched the web",
      badge: ws.query ? `"${ws.query}"` : undefined,
      isActive: ws.status === "searching",
    })),
    ...(totalSources > 0
      ? [
          {
            key: "sources",
            icon: IconBookmark,
            label: "Sources",
            badge: String(totalSources),
            isActive: false,
          },
        ]
      : []),
  ];

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
                    "prose prose-sm prose-invert max-w-none",
                    "[&_strong]:text-muted-foreground [&_strong]:font-semibold",
                    "[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1.5 [&_ul]:my-2",
                    "[&_li]:text-muted-foreground/80",
                    "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                    "[&_br]:block [&_br]:content-[''] [&_br]:mt-1.5",
                    isExpanded
                      ? "max-h-64 overflow-y-auto pr-2"
                      : "max-h-20 overflow-hidden"
                  )}
                  dangerouslySetInnerHTML={{
                    __html: parseMarkdownToHtml(contentWithoutTitle),
                  }}
                />
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
                            isStreaming={
                              item.toolCall.status === "executing" ||
                              item.toolCall.status === "streaming"
                            }
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                          <ItemIcon
                            className={cn(
                              "w-3.5 h-3.5 shrink-0",
                              item.isActive && "text-primary"
                            )}
                          />
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

            {/* "Listo" when done - check icon on timeline only */}
            {!isStreaming && hasContent && (
              <div className="relative flex items-center gap-1.5 text-[13px] text-green-600 dark:text-green-500">
                <IconCheck className="absolute -left-5 top-[3px] w-3.5 h-3.5 shrink-0 text-green-500" />
                <span className="font-medium">Listo</span>
              </div>
            )}

            {/* Sources badge */}
            {totalSources > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/50 text-[10px] text-muted-foreground">
                  <IconBookmark size={10} className="opacity-70" />
                  <span className="font-medium">{totalSources} fuentes</span>
                </div>
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
