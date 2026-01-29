/**
 * Agent Tool Call Flat - Google Sheets AI style tool visualization
 *
 * Flat, clean design without tree lines.
 * Shows tool actions with rich badges for context.
 */

import { memo, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  IconCheck,
  IconLoader2,
  IconX,
  IconChevronDown,
  IconChevronRight,
  IconTable,
  IconArrowRight,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { AgentToolRegistry, getToolStatus, type ToolPart } from "./agent-tool-registry";
import { AgentGeneratedImage } from "./agent-generated-image";
import { AgentGeneratedChart } from "./agent-generated-chart";

// ============================================================================
// TYPES
// ============================================================================

interface ToolCall {
  id: string;
  name: string;
  args?: string | Record<string, unknown>;
  result?: unknown;
  status?: "streaming" | "done" | "executing" | "complete" | "error";
}

interface AgentToolCallFlatProps {
  toolCalls: ToolCall[];
  chatStatus?: string;
  onViewArtifact?: (id: string) => void;
  isStreaming?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const parsedArgsCache = new WeakMap<ToolCall, Record<string, unknown>>();

function parseArgs(tc: ToolCall): Record<string, unknown> {
  if (parsedArgsCache.has(tc)) {
    return parsedArgsCache.get(tc)!;
  }

  let parsed: Record<string, unknown> = {};
  try {
    if (tc.args) {
      parsed = typeof tc.args === "string" ? JSON.parse(tc.args) : tc.args;
      parsedArgsCache.set(tc, parsed);
    }
  } catch {
    /* ignore */
  }
  return parsed;
}

function toToolPart(tc: ToolCall): ToolPart {
  const parsedInput = parseArgs(tc);
  let parsedOutput: Record<string, unknown> = {};

  if (tc.result && typeof tc.result === "object") {
    parsedOutput = tc.result as Record<string, unknown>;
  }

  const stateMap: Record<string, ToolPart["state"]> = {
    streaming: "input-streaming",
    done: "input-available",
    executing: "input-available",
    complete: "output-available",
    error: "output-error",
  };

  return {
    type: `tool-${tc.name}`,
    state: stateMap[tc.status || "complete"] || "output-available",
    input: parsedInput,
    output: parsedOutput,
  };
}

function getToolDisplayName(name: string, part: ToolPart): string {
  const toolType = `tool-${name}`;
  const meta = AgentToolRegistry[toolType];
  if (meta?.title) {
    return meta.title(part);
  }
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getToolIcon(name: string): React.ComponentType<{ className?: string }> | null {
  const toolType = `tool-${name}`;
  const meta = AgentToolRegistry[toolType];
  return meta?.icon || null;
}

function isImageTool(name: string): boolean {
  return name === "generate_image" || name === "edit_image";
}

function isChartTool(name: string): boolean {
  return name === "generate_chart";
}

function getImageData(tc: ToolCall): { imageUrl: string; prompt: string } | undefined {
  if (tc.result && typeof tc.result === "object" && "imageUrl" in tc.result) {
    const result = tc.result as { imageUrl?: unknown; prompt?: unknown };
    if (typeof result.imageUrl === "string") {
      return {
        imageUrl: result.imageUrl,
        prompt: typeof result.prompt === "string" ? result.prompt : "Generated image",
      };
    }
  }
  return undefined;
}

function getChartData(tc: ToolCall): { artifactId: string; chartConfig: unknown; title?: string } | undefined {
  if (tc.result && typeof tc.result === "object") {
    const result = tc.result as Record<string, unknown>;
    if (typeof result.artifactId === "string" && result.chartConfig) {
      return {
        artifactId: result.artifactId,
        chartConfig: result.chartConfig,
        title: typeof result.title === "string" ? result.title : undefined,
      };
    }
  }
  return undefined;
}

// ============================================================================
// BADGE EXTRACTORS - Rich context for each tool type
// ============================================================================

interface ToolBadge {
  type: "default" | "transform" | "range" | "info" | "formula" | "style";
  content: string;
  from?: string;
  to?: string;
}

// Operation type colors for Ramp Sheets style
const OPERATION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  insert: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
  format: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", border: "border-violet-500/20" },
  formula: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
  delete: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/20" },
  read: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", border: "border-sky-500/20" },
  create: { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/20" },
  chart: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", border: "border-pink-500/20" },
  default: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20" },
};

function getOperationType(toolName: string): keyof typeof OPERATION_COLORS {
  if (toolName.includes("insert") || toolName.includes("add") || toolName.includes("set_cell")) return "insert";
  if (toolName.includes("format") || toolName.includes("style") || toolName.includes("merge")) return "format";
  if (toolName.includes("formula")) return "formula";
  if (toolName.includes("delete") || toolName.includes("remove") || toolName.includes("clear")) return "delete";
  if (toolName.includes("get") || toolName.includes("read") || toolName.includes("context")) return "read";
  if (toolName.includes("create") || toolName.includes("new")) return "create";
  if (toolName.includes("chart") || toolName.includes("graph")) return "chart";
  return "default";
}

function extractBadges(tc: ToolCall): ToolBadge[] {
  const args = parseArgs(tc);
  // Result available for future badge extraction from tool outputs
  const _result = tc.result as Record<string, unknown> | undefined;
  void _result; // Silence unused variable warning
  const badges: ToolBadge[] = [];

  switch (tc.name) {
    case "rename_sheet":
    case "rename_worksheet": {
      const oldName = (args.oldName as string) || (args.old_name as string) || "Sheet1";
      const newName = (args.newName as string) || (args.new_name as string) || (args.name as string);
      if (newName) {
        badges.push({ type: "transform", content: "", from: oldName, to: newName });
      }
      break;
    }

    case "update_cells":
    case "insert_data":
    case "set_cell_values": {
      const range = (args.range as string) || (args.startCell as string);
      const sheetName = (args.sheetName as string) || (args.sheet_name as string);
      if (range) {
        const fullRange = sheetName ? `${sheetName}!${range}` : range;
        badges.push({ type: "range", content: fullRange });
      }
      break;
    }

    case "format_cells": {
      const range = (args.range as string);
      const formats = args.formats as unknown[];
      if (range) {
        badges.push({ type: "range", content: range });
      }
      if (formats && Array.isArray(formats)) {
        badges.push({ type: "info", content: `${formats.length} styles` });
      }
      break;
    }

    case "insert_formula": {
      const cell = (args.cell as string);
      const formula = (args.formula as string);
      if (cell) {
        badges.push({ type: "range", content: cell });
      }
      if (formula) {
        const shortFormula = formula.length > 20 ? formula.slice(0, 17) + "..." : formula;
        badges.push({ type: "info", content: shortFormula });
      }
      break;
    }

    case "merge_cells": {
      const range = (args.range as string);
      if (range) {
        badges.push({ type: "range", content: range });
      }
      break;
    }

    case "create_spreadsheet":
    case "create_document": {
      const name = (args.name as string) || (args.title as string);
      if (name) {
        badges.push({ type: "default", content: name });
      }
      break;
    }

    case "add_sheet":
    case "add_worksheet": {
      const name = (args.name as string) || (args.sheetName as string);
      if (name) {
        badges.push({ type: "default", content: name });
      }
      break;
    }

    case "set_column_width": {
      const col = (args.column as string) || (args.col as string);
      const width = args.width;
      if (col) {
        badges.push({ type: "info", content: `Column ${col}` });
      }
      if (width) {
        badges.push({ type: "info", content: `${width}px` });
      }
      break;
    }

    case "set_row_height": {
      const row = args.row;
      const height = args.height;
      if (row) {
        badges.push({ type: "info", content: `Row ${row}` });
      }
      if (height) {
        badges.push({ type: "info", content: `${height}px` });
      }
      break;
    }

    case "get_spreadsheet_summary":
    case "get_spreadsheet_context": {
      badges.push({ type: "info", content: "Reading context" });
      break;
    }

    default: {
      // Generic extraction for unknown tools
      const range = (args.range as string);
      const sheetName = (args.sheetName as string) || (args.sheet_name as string);
      if (range) {
        const fullRange = sheetName ? `${sheetName}!${range}` : range;
        badges.push({ type: "range", content: fullRange });
      }
    }
  }

  return badges;
}

// ============================================================================
// SINGLE TOOL CALL ITEM
// ============================================================================

const ToolCallItem = memo(function ToolCallItem({
  tc,
  chatStatus,
  onViewArtifact,
}: {
  tc: ToolCall;
  chatStatus?: string;
  onViewArtifact?: (id: string) => void;
}) {
  const part = toToolPart(tc);
  const { isPending, isError, isSuccess } = getToolStatus(part, chatStatus);
  const displayName = getToolDisplayName(tc.name, part);
  const Icon = getToolIcon(tc.name);
  const badges = extractBadges(tc);
  const opType = getOperationType(tc.name);
  const colors = OPERATION_COLORS[opType];

  const imageData = isImageTool(tc.name) && isSuccess ? getImageData(tc) : undefined;
  const chartData = isChartTool(tc.name) && isSuccess ? getChartData(tc) : undefined;

  // Handler for clicking cell references to highlight in spreadsheet
  const handleCellClick = useCallback((range: string) => {
    // Parse range to get sheet and cells
    // Format: "Sheet1!A1:B5" or just "A1:B5"
    const [sheetPart, cellPart] = range.includes("!")
      ? range.split("!")
      : [undefined, range];

    // Send IPC to highlight cells in spreadsheet
    // @ts-expect-error - desktopApi extended in preload
    window.desktopApi?.highlightCells?.({
      range: cellPart,
      sheetName: sheetPart,
    });
  }, []);

  return (
    <div className="py-1.5">
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* Icon with operation-specific color */}
        <div
          className={cn(
            "shrink-0 w-5 h-5 rounded flex items-center justify-center",
            isPending && "text-primary",
            isSuccess && colors.text,
            isError && "text-destructive"
          )}
        >
          {isPending ? (
            <IconLoader2 size={14} className="animate-spin" />
          ) : Icon ? (
            <Icon className="w-3.5 h-3.5" />
          ) : (
            <IconTable className="w-3.5 h-3.5" />
          )}
        </div>

        {/* Title */}
        <span
          className={cn(
            "text-sm",
            isPending && "text-foreground font-medium",
            isSuccess && "text-muted-foreground",
            isError && "text-destructive"
          )}
        >
          {isPending ? (
            <TextShimmer as="span" duration={1.2} className="text-sm">
              {displayName}
            </TextShimmer>
          ) : (
            displayName
          )}
        </span>

        {/* Status check for completed */}
        {isSuccess && !badges.length && (
          <IconCheck size={14} className="text-emerald-500 ml-auto shrink-0" />
        )}
      </div>

      {/* Badges row */}
      {badges.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5 ml-7 flex-wrap">
          {badges.map((badge, idx) => (
            <ToolBadgeDisplay key={idx} badge={badge} onCellClick={handleCellClick} toolName={tc.name} />
          ))}
          {isSuccess && (
            <IconCheck size={12} className="text-emerald-500 ml-auto shrink-0" />
          )}
        </div>
      )}

      {/* Image preview */}
      {imageData && (
        <div className="mt-2 ml-7">
          <AgentGeneratedImage
            imageUrl={imageData.imageUrl}
            prompt={imageData.prompt}
          />
        </div>
      )}

      {/* Chart preview */}
      {chartData && (
        <div className="mt-2 ml-7">
          <AgentGeneratedChart
            artifactId={chartData.artifactId}
            chartConfig={chartData.chartConfig as any}
            title={chartData.title}
            onViewInPanel={onViewArtifact}
          />
        </div>
      )}
    </div>
  );
});

// ============================================================================
// BADGE DISPLAY
// ============================================================================

const ToolBadgeDisplay = memo(function ToolBadgeDisplay({
  badge,
  onCellClick,
  toolName,
}: {
  badge: ToolBadge;
  onCellClick?: (range: string) => void;
  toolName?: string;
}) {
  // Get operation-specific colors
  const opType = toolName ? getOperationType(toolName) : "default";
  const colors = OPERATION_COLORS[opType];

  if (badge.type === "transform" && badge.from && badge.to) {
    return (
      <div className="flex items-center gap-1">
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-5 bg-muted/50 font-mono"
        >
          <IconTable size={10} className="mr-1 opacity-60" />
          {badge.from}
        </Badge>
        <IconArrowRight size={12} className="text-muted-foreground" />
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 h-5 font-mono",
            colors.bg, colors.text, colors.border
          )}
        >
          <IconTable size={10} className="mr-1 opacity-60" />
          {badge.to}
        </Badge>
      </div>
    );
  }

  if (badge.type === "range") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-5 font-mono",
          colors.bg, colors.text, colors.border,
          onCellClick && "cursor-pointer hover:opacity-80 transition-opacity"
        )}
        onClick={() => onCellClick?.(badge.content)}
      >
        <IconTable size={10} className="mr-1 opacity-60" />
        {badge.content}
      </Badge>
    );
  }

  if (badge.type === "formula") {
    const formulaColors = OPERATION_COLORS.formula;
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-5 font-mono",
          formulaColors.bg, formulaColors.text, formulaColors.border
        )}
      >
        {badge.content}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 h-5 bg-muted/50 font-normal"
    >
      {badge.content}
    </Badge>
  );
});

// ============================================================================
// GROUPED TOOL CALLS (collapsible)
// ============================================================================

interface GroupedTools {
  name: string;
  displayName: string;
  count: number;
  calls: ToolCall[];
  allComplete: boolean;
  hasPending: boolean;
}

function groupSimilarTools(toolCalls: ToolCall[], chatStatus?: string): GroupedTools[] {
  const groups = new Map<string, GroupedTools>();

  for (const tc of toolCalls) {
    const part = toToolPart(tc);
    const displayName = getToolDisplayName(tc.name, part);
    const { isPending, isSuccess } = getToolStatus(part, chatStatus);

    if (!groups.has(tc.name)) {
      groups.set(tc.name, {
        name: tc.name,
        displayName,
        count: 0,
        calls: [],
        allComplete: true,
        hasPending: false,
      });
    }

    const group = groups.get(tc.name)!;
    group.count++;
    group.calls.push(tc);
    if (!isSuccess) group.allComplete = false;
    if (isPending) group.hasPending = true;
  }

  return Array.from(groups.values());
}

const ToolCallGroup = memo(function ToolCallGroup({
  group,
  chatStatus,
  onViewArtifact,
  defaultExpanded = false,
}: {
  group: GroupedTools;
  chatStatus?: string;
  onViewArtifact?: (id: string) => void;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const Icon = getToolIcon(group.name);

  // If only one item, render it directly
  if (group.count === 1) {
    return (
      <ToolCallItem
        tc={group.calls[0]}
        chatStatus={chatStatus}
        onViewArtifact={onViewArtifact}
      />
    );
  }

  return (
    <div className="py-1">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 py-1 hover:bg-muted/30 rounded-md transition-colors"
      >
        {/* Chevron */}
        <div className="shrink-0 w-5 h-5 flex items-center justify-center">
          {isExpanded ? (
            <IconChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <IconChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>

        {/* Icon */}
        {Icon && (
          <Icon
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              group.hasPending && "text-primary",
              group.allComplete && "text-emerald-600 dark:text-emerald-400"
            )}
          />
        )}

        {/* Title */}
        <span
          className={cn(
            "text-sm",
            group.hasPending && "text-foreground font-medium",
            group.allComplete && "text-muted-foreground"
          )}
        >
          {group.hasPending ? (
            <TextShimmer as="span" duration={1.2} className="text-sm">
              {group.displayName}
            </TextShimmer>
          ) : (
            group.displayName
          )}
        </span>

        {/* Count badge */}
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 h-4",
            group.allComplete
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : group.hasPending
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-muted"
          )}
        >
          {group.count}
        </Badge>

        {/* Status */}
        {group.allComplete && (
          <IconCheck size={14} className="text-emerald-500 ml-auto mr-1" />
        )}
        {group.hasPending && (
          <IconLoader2 size={14} className="text-primary animate-spin ml-auto mr-1" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-5 border-l border-border/50 pl-2 mt-1">
          {group.calls.map((tc) => (
            <ToolCallItem
              key={tc.id}
              tc={tc}
              chatStatus={chatStatus}
              onViewArtifact={onViewArtifact}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const AgentToolCallFlat = memo(function AgentToolCallFlat({
  toolCalls,
  chatStatus,
  onViewArtifact,
  isStreaming = false,
}: AgentToolCallFlatProps) {
  const groups = useMemo(
    () => groupSimilarTools(toolCalls, chatStatus),
    [toolCalls, chatStatus]
  );

  if (toolCalls.length === 0) return null;

  // Determine if we should group or show flat
  const shouldGroup = groups.some((g) => g.count > 1);

  return (
    <div className="space-y-0.5">
      {shouldGroup
        ? groups.map((group) => (
            <ToolCallGroup
              key={group.name}
              group={group}
              chatStatus={chatStatus}
              onViewArtifact={onViewArtifact}
              defaultExpanded={isStreaming}
            />
          ))
        : toolCalls.map((tc) => (
            <ToolCallItem
              key={tc.id}
              tc={tc}
              chatStatus={chatStatus}
              onViewArtifact={onViewArtifact}
            />
          ))}
    </div>
  );
});

export default AgentToolCallFlat;
