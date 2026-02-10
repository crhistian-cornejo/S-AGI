import { memo } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface BranchNavigatorProps {
  currentIndex: number;
  totalSiblings: number;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
}

/**
 * Compact `< 1/3 >` arrow navigation for branch points.
 * Only renders when there are multiple siblings (i.e., an actual branch).
 */
export const BranchNavigator = memo(function BranchNavigator({
  currentIndex,
  totalSiblings,
  onPrevious,
  onNext,
  disabled = false,
}: BranchNavigatorProps) {
  if (totalSiblings <= 1) return null;

  return (
    <div className="inline-flex items-center gap-0.5 text-xs text-muted-foreground select-none">
      <button
        onClick={onPrevious}
        disabled={disabled || currentIndex === 0}
        className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors"
        aria-label="Previous branch"
      >
        <IconChevronLeft size={14} />
      </button>
      <span className="font-mono tabular-nums min-w-[2.5ch] text-center">
        {currentIndex + 1}/{totalSiblings}
      </span>
      <button
        onClick={onNext}
        disabled={disabled || currentIndex === totalSiblings - 1}
        className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors"
        aria-label="Next branch"
      >
        <IconChevronRight size={14} />
      </button>
    </div>
  );
});
