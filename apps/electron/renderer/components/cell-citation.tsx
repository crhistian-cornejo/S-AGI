/**
 * Cell Citation Component - Claude for Excel Style
 *
 * Clickable cell references that navigate to specific cells in spreadsheets.
 * Based on Claude for Excel patterns for inline citations.
 */

import { memo } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { IconTable, IconExternalLink } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface CellCitationData {
  type: "cell";
  cell: string; // e.g., "A1", "B2:D5"
  value?: string | number;
  sheet?: string;
  fileId?: string;
  artifactId?: string;
}

interface CellCitationProps {
  citation: CellCitationData;
  className?: string;
  /** Callback when citation is clicked (navigate to cell) */
  onNavigate?: (citation: CellCitationData) => void;
}

/**
 * Parse cell reference to get column and row
 */
function parseCellRef(cell: string): { col: string; row: number } | null {
  const match = cell.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return { col: match[1].toUpperCase(), row: parseInt(match[2], 10) };
}

/**
 * Check if reference is a range
 */
function isRange(cell: string): boolean {
  return cell.includes(":");
}

/**
 * Single cell citation badge - Claude for Excel style
 * Shows as a colored chip with cell reference
 */
export const CellCitation = memo(function CellCitation({
  citation,
  className,
  onNavigate,
}: CellCitationProps) {
  const isClickable = !!onNavigate;
  const cellRef = parseCellRef(citation.cell.split(":")[0]);
  const range = isRange(citation.cell);

  const handleClick = (e: React.MouseEvent) => {
    if (isClickable) {
      e.preventDefault();
      e.stopPropagation();
      onNavigate(citation);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isClickable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      onNavigate(citation);
    }
  };

  return (
    <HoverCard.Root openDelay={100} closeDelay={150}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            "inline-flex items-center gap-1",
            "h-5 px-1.5 mx-0.5",
            "text-[11px] font-mono font-medium",
            "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
            "border border-emerald-500/30",
            "rounded-md",
            "align-baseline",
            "transition-all duration-150",
            isClickable && [
              "cursor-pointer",
              "hover:bg-emerald-500/25",
              "hover:border-emerald-500/50",
              "hover:scale-105",
              "active:scale-100",
            ],
            className,
          )}
          title={isClickable ? `Ir a celda ${citation.cell}` : undefined}
          aria-label={`Celda ${citation.cell}${citation.value !== undefined ? `: ${citation.value}` : ""}`}
        >
          <IconTable size={12} className="opacity-70" />
          <span>{citation.cell}</span>
          {isClickable && (
            <IconExternalLink size={10} className="opacity-50 -mr-0.5" />
          )}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="center"
          sideOffset={6}
          className="z-50 w-56 rounded-xl border border-border bg-popover/95 p-3 shadow-xl backdrop-blur animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 shrink-0">
              <IconTable size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-semibold text-foreground">
                {citation.cell}
              </p>
              {citation.sheet && (
                <p className="text-xs text-muted-foreground">
                  Hoja: {citation.sheet}
                </p>
              )}
            </div>
          </div>

          {/* Value preview */}
          {citation.value !== undefined && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-[10px] uppercase text-muted-foreground/60 mb-1">
                {range ? "Rango" : "Valor"}
              </p>
              <p className="text-sm font-mono bg-muted/50 rounded px-2 py-1 truncate">
                {String(citation.value)}
              </p>
            </div>
          )}

          {/* Click hint */}
          {isClickable && (
            <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">
              Click para navegar
            </p>
          )}

          <HoverCard.Arrow className="fill-border" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
});

/**
 * Cell citations footer for agent panel messages
 */
interface CellCitationsFooterProps {
  citations: CellCitationData[];
  className?: string;
  onNavigate?: (citation: CellCitationData) => void;
}

export const CellCitationsFooter = memo(function CellCitationsFooter({
  citations,
  className,
  onNavigate,
}: CellCitationsFooterProps) {
  if (!citations || citations.length === 0) return null;

  // Group by sheet
  const bySheet = new Map<string, CellCitationData[]>();
  for (const c of citations) {
    const sheet = c.sheet || "Sheet1";
    const existing = bySheet.get(sheet) || [];
    existing.push(c);
    bySheet.set(sheet, existing);
  }

  return (
    <div className={cn("mt-3 pt-2 border-t border-border/30", className)}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground/50">Celdas referenciadas:</span>
        {citations.slice(0, 8).map((citation, i) => (
          <CellCitation
            key={`${citation.cell}-${i}`}
            citation={citation}
            onNavigate={onNavigate}
          />
        ))}
        {citations.length > 8 && (
          <span className="text-[10px] text-muted-foreground">
            +{citations.length - 8} más
          </span>
        )}
      </div>
    </div>
  );
});

/**
 * Parse cell citation markers from AI response text
 * Format: [[cell:A1]] or [[cell:A1:B5|value]] or [[cell:Sheet1!A1]]
 */
export function parseCellCitations(content: string): {
  processedContent: string;
  citations: CellCitationData[];
} {
  const citations: CellCitationData[] = [];
  const seen = new Set<string>();

  // Pattern: [[cell:REF]] or [[cell:REF|VALUE]]
  const pattern = /\[\[cell:([A-Z]+\d+(?::[A-Z]+\d+)?|[^|!\]]+![A-Z]+\d+(?::[A-Z]+\d+)?)(?:\|([^\]]+))?\]\]/gi;

  const processedContent = content.replace(pattern, (_match, ref, value) => {
    let sheet: string | undefined;
    let cell = ref;

    // Handle Sheet!Cell format
    if (ref.includes("!")) {
      const parts = ref.split("!");
      sheet = parts[0];
      cell = parts[1];
    }

    const key = `${sheet || ""}:${cell}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push({
        type: "cell",
        cell: cell.toUpperCase(),
        sheet,
        value: value?.trim(),
      });
    }

    // Return placeholder for React rendering
    return `{{CELL:${cell.toUpperCase()}}}`;
  });

  return { processedContent, citations };
}

/**
 * Check if content contains cell citations
 */
export function hasCellCitations(content: string): boolean {
  return /\[\[cell:[A-Z]/i.test(content);
}
