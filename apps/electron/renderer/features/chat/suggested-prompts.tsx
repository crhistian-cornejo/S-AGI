import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SuggestedPromptsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  className?: string;
}

// Max characters before truncating with tooltip
const MAX_VISIBLE_CHARS = 35;

export function SuggestedPrompts({
  suggestions,
  onSelect,
  className,
}: SuggestedPromptsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(false);

  // Check scroll position to show/hide gradients
  const checkScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const hasOverflow = scrollWidth > clientWidth;

    setShowLeftGradient(hasOverflow && scrollLeft > 0);
    setShowRightGradient(
      hasOverflow && scrollLeft < scrollWidth - clientWidth - 1
    );
  }, []);

  // Check scroll on mount and when suggestions change
  useEffect(() => {
    checkScroll();
    // Re-check after a short delay to account for animations
    const timer = setTimeout(checkScroll, 100);
    return () => clearTimeout(timer);
  }, [suggestions, checkScroll]);

  // Add resize observer to handle window resizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      checkScroll();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [checkScroll]);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="suggestions"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn("relative w-full", className)}
      >
        {/* Left gradient fade */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
            showLeftGradient ? "opacity-100" : "opacity-0"
          )}
        />

        {/* Scrollable container */}
        <div
          ref={containerRef}
          onScroll={checkScroll}
          className="flex flex-row gap-2 overflow-x-auto py-1 px-1 scrollbar-none"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {suggestions.map((suggestion, index) => {
            const isLong = suggestion.length > MAX_VISIBLE_CHARS;
            const displayText = isLong
              ? `${suggestion.slice(0, MAX_VISIBLE_CHARS)}…`
              : suggestion;

            const buttonContent = (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelect(suggestion)}
                className={cn(
                  "rounded-full h-auto min-h-7 py-1.5 px-3.5 text-[12px] font-medium",
                  "bg-background/60 backdrop-blur-sm",
                  "border-border/50",
                  "hover:bg-accent/50 hover:border-border/70 hover:text-accent-foreground",
                  "active:scale-[0.98]",
                  "transition-all duration-150",
                  // For long text: allow wrapping up to 2 lines, then truncate
                  isLong ? "max-w-[280px]" : "whitespace-nowrap"
                )}
              >
                <span
                  className={cn(
                    isLong && "line-clamp-2 text-left leading-tight"
                  )}
                >
                  {displayText}
                </span>
              </Button>
            );

            return (
              <motion.div
                key={`${suggestion}-${index}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: index * 0.03,
                  duration: 0.15,
                  ease: "easeOut",
                }}
                className="flex-shrink-0"
              >
                {isLong ? (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[300px] text-xs"
                    >
                      {suggestion}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  buttonContent
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Right gradient fade */}
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
            showRightGradient ? "opacity-100" : "opacity-0"
          )}
        />
      </motion.div>
    </AnimatePresence>
  );
}
