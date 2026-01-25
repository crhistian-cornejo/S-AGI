import { memo, useMemo, useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  activeSourceHighlightsAtom,
  clearSourceHighlightsAtom,
  type SourceHighlight,
} from "@/lib/atoms";
import { cn } from "@/lib/utils";
import { IconX } from "@tabler/icons-react";

interface SourceHighlightLayerProps {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Color palette for citation highlights
 * Each citation ID gets a unique color
 */
const HIGHLIGHT_COLORS = [
  { bg: "rgba(59, 130, 246, 0.35)", border: "#3b82f6" }, // Blue
  { bg: "rgba(16, 185, 129, 0.35)", border: "#10b981" }, // Green
  { bg: "rgba(245, 158, 11, 0.35)", border: "#f59e0b" }, // Amber
  { bg: "rgba(239, 68, 68, 0.35)", border: "#ef4444" }, // Red
  { bg: "rgba(139, 92, 246, 0.35)", border: "#8b5cf6" }, // Purple
  { bg: "rgba(236, 72, 153, 0.35)", border: "#ec4899" }, // Pink
  { bg: "rgba(6, 182, 212, 0.35)", border: "#06b6d4" }, // Cyan
  { bg: "rgba(234, 88, 12, 0.35)", border: "#ea580c" }, // Orange
];

/**
 * Get color for a citation ID
 */
function getHighlightColor(citationId: number) {
  return HIGHLIGHT_COLORS[(citationId - 1) % HIGHLIGHT_COLORS.length];
}

/**
 * Source Highlight Layer Component
 *
 * Renders colored highlight boxes over text that the AI agent cited.
 * When a user clicks on a citation [1], [2], etc., this layer shows
 * the exact text location that was referenced.
 */
export const SourceHighlightLayer = memo(function SourceHighlightLayer({
  pageIndex,
  scale,
  pageWidth,
  pageHeight,
}: SourceHighlightLayerProps) {
  const highlights = useAtomValue(activeSourceHighlightsAtom);
  const clearHighlights = useSetAtom(clearSourceHighlightsAtom);

  // Filter highlights for this specific page (convert 1-indexed to 0-indexed)
  const pageHighlights = useMemo(() => {
    return highlights.filter((h) => h.pageNumber - 1 === pageIndex);
  }, [highlights, pageIndex]);

  // Auto-clear highlights after 10 seconds of inactivity
  useEffect(() => {
    if (highlights.length > 0) {
      const timer = setTimeout(() => {
        clearHighlights();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [highlights, clearHighlights]);

  if (pageHighlights.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        width: pageWidth * scale,
        height: pageHeight * scale,
      }}
    >
      {pageHighlights.map((highlight) => {
        const colors = getHighlightColor(highlight.citationId);

        // Calculate scaled coordinates
        // Convert from PDF coordinates to screen coordinates
        const scaleX = pageWidth / highlight.pageWidth;
        const scaleY = pageHeight / highlight.pageHeight;

        const x = highlight.boundingBox.x * scaleX * scale;
        const y = highlight.boundingBox.y * scaleY * scale;
        const width = highlight.boundingBox.width * scaleX * scale;
        const height = highlight.boundingBox.height * scaleY * scale;

        return (
          <div
            key={highlight.id}
            className={cn(
              "absolute rounded transition-all duration-300",
              "animate-in fade-in zoom-in-95",
            )}
            style={{
              left: x,
              top: y,
              width,
              height,
              backgroundColor: colors.bg,
              border: `2px solid ${colors.border}`,
              boxShadow: `0 0 12px ${colors.border}50`,
              zIndex: 20,
            }}
          >
            {/* Citation badge */}
            <div
              className="absolute -top-5 -left-1 pointer-events-auto"
              style={{
                backgroundColor: colors.border,
                color: "white",
                fontSize: "10px",
                fontWeight: 600,
                padding: "1px 4px",
                borderRadius: "3px",
                whiteSpace: "nowrap",
              }}
            >
              [{highlight.citationId}]
            </div>
          </div>
        );
      })}

      {/* Clear button - only show once per page if there are highlights */}
      {pageHighlights.length > 0 &&
        pageIndex === pageHighlights[0].pageNumber - 1 && (
          <button
            onClick={() => clearHighlights()}
            className={cn(
              "absolute top-2 right-2 pointer-events-auto",
              "p-1.5 rounded-full bg-background/90 border shadow-lg",
              "hover:bg-destructive hover:text-destructive-foreground",
              "transition-colors duration-200",
              "animate-in fade-in slide-in-from-top-2",
            )}
            title="Clear highlights"
          >
            <IconX size={14} />
          </button>
        )}
    </div>
  );
});

/**
 * Helper function to create a SourceHighlight from citation data
 */
export function createSourceHighlight(
  citationId: number,
  pageNumber: number,
  boundingBox: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number,
  text: string,
): SourceHighlight {
  const colors = getHighlightColor(citationId);
  return {
    id: `cite-${citationId}-${pageNumber}-${Date.now()}`,
    citationId,
    pageNumber,
    boundingBox,
    pageWidth,
    pageHeight,
    text,
    color: colors.border,
  };
}
