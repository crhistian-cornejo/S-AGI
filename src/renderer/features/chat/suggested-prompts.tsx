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
  const [showTopShadow, setShowTopShadow] = useState(false);
  const [showBottomShadow, setShowBottomShadow] = useState(false);

  const checkScroll = React.useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowTopShadow(scrollTop > 10);
    setShowBottomShadow(scrollTop < scrollHeight - clientHeight - 10);
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
      <div className="relative group/prompts">
        {/* Shadow gradients for vertical scroll */}
        <AnimatePresence>
          {showTopShadow && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-background/90 via-background/40 to-transparent z-10 pointer-events-none"
            />
          )}
          {showBottomShadow && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background/90 via-background/40 to-transparent z-10 pointer-events-none"
            />
          )}
        </AnimatePresence>

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex flex-col gap-0.5 overflow-y-auto max-h-[180px] py-1 px-1 scrollbar-none hover:scrollbar-thin scrollbar-thumb-border/40 scrollbar-track-transparent pr-1"
        >
          {suggestions.map((suggestion, index) => (
            <motion.div
              key={suggestion}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: index * 0.015,
                duration: 0.12,
                ease: "easeOut",
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelect(suggestion)}
                className="w-full justify-start text-left text-[11px] h-6 px-2.5 bg-background/20 border border-transparent hover:bg-accent/40 hover:border-border/20 hover:text-accent-foreground transition-all duration-150 truncate font-medium text-muted-foreground/70 hover:text-muted-foreground shadow-none rounded-md"
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
