import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SuggestedPromptsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  className?: string;
}

export function SuggestedPrompts({
  suggestions,
  onSelect,
  className,
}: SuggestedPromptsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);

  const checkScroll = React.useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftShadow(scrollLeft > 0);
    setShowRightShadow(scrollLeft < scrollWidth - clientWidth - 5);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [checkScroll]);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      className={cn("w-full", className)}
    >
      <div className="relative">
        {/* Shadow gradients for horizontal scroll */}
        <AnimatePresence>
          {showLeftShadow && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background via-background/60 to-transparent z-10 pointer-events-none"
            />
          )}
          {showRightShadow && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background via-background/60 to-transparent z-10 pointer-events-none"
            />
          )}
        </AnimatePresence>

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-2 overflow-x-auto py-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {suggestions.map((suggestion, index) => (
            <motion.div
              key={suggestion}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ 
                delay: index * 0.03,
                duration: 0.2,
                ease: "easeOut"
              }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelect(suggestion)}
                className="rounded-full text-[13px] h-8 px-4 bg-background border-border/60 hover:bg-accent/50 hover:border-border hover:text-accent-foreground transition-all duration-200 whitespace-nowrap font-normal text-muted-foreground/90 shadow-sm"
              >
                {suggestion}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
