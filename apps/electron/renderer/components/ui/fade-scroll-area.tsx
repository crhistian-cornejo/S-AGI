import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface FadeScrollAreaProps {
  children: ReactNode;
  className?: string;
  scrollViewportClassName?: string;
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
}

export function FadeScrollArea({
  children,
  className,
  scrollViewportClassName,
  scrollRef,
}: FadeScrollAreaProps) {
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const targetScrollRef = scrollRef ?? internalScrollRef;
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = targetScrollRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollUp(scrollTop > 0);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1);
  }, [targetScrollRef]);

  useEffect(() => {
    const el = targetScrollRef.current;
    if (!el) return;

    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });

    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll, targetScrollRef]);

  return (
    <div className={cn("relative flex-1 overflow-hidden w-full", className)}>
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-b from-sidebar to-transparent",
          canScrollUp ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={targetScrollRef}
        className={cn(
          "h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent w-full",
          scrollViewportClassName,
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-t from-sidebar to-transparent",
          canScrollDown ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
