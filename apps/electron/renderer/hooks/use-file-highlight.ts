/**
 * Hook for highlighting changes in Univer
 *
 * Integrates diff visualization with Univer spreadsheet
 */

import { useCallback, useEffect, useRef } from "react";
import {
  highlightChanges,
  clearHighlights,
  type HighlightOptions,
} from "@/utils/univer-highlight";
import type { WorkbookDiff } from "@/utils/univer-diff";

export function useFileHighlight() {
  const cleanupRef = useRef<(() => void) | null>(null);

  // Highlight changes from diff
  const highlightDiff = useCallback(
    (diff: WorkbookDiff, options?: HighlightOptions) => {
      // Clear previous highlights
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      // Apply new highlights
      const cleanup = highlightChanges(diff, options);
      cleanupRef.current = cleanup;

      return cleanup;
    },
    [],
  );

  // Clear all highlights
  const clearAll = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  // Auto-clear on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  return {
    highlightDiff,
    clearAll,
  };
}
