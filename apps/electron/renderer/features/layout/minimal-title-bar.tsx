import { useState, useEffect } from "react";
import {
  IconMinus,
  IconSquare,
  IconX,
  IconArrowsDiagonalMinimize2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { cn, isMacOS, isElectron } from "@/lib/utils";

export function MinimalTitleBar() {
  const handleMinimize = () => window.desktopApi?.minimize();
  const handleMaximize = () => window.desktopApi?.maximize();
  const handleClose = () => window.desktopApi?.close();

  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    const api = window.desktopApi;
    if (!api?.isMaximized || !api?.onMaximizeChange) return;
    api.isMaximized().then(setIsMaximized);
    return api.onMaximizeChange(setIsMaximized);
  }, []);

  const isMac = isMacOS();

  return (
    <div
      className={cn(
        "h-10 flex items-center bg-transparent drag-region shrink-0 absolute top-0 left-0 right-0 z-50",
        isMac ? "pl-20 pr-4" : "pl-0 pr-0",
      )}
    >
      {/* Windows: Logo on Left */}
      {!isMac && (
        <div className="flex items-center gap-2 no-drag ml-4 shrink-0 opacity-80 text-white">
          <Logo size={20} className="text-white" />
          <span className="text-sm font-semibold tracking-tight">S-AGI</span>
        </div>
      )}

      <div className="flex-1" />

      {/* macOS: Logo on Right */}
      {isMac && (
        <div className="flex items-center gap-2 no-drag shrink-0 opacity-80 text-white">
          <span className="text-sm font-semibold tracking-tight">S-AGI</span>
          <Logo size={20} className="text-white" />
        </div>
      )}

      {/* Window Controls (Windows/Linux) */}
      {isElectron() && !isMac && (
        <div className="flex items-center no-drag h-full">
          <Button
            variant="ghost"
            className="h-10 w-12 rounded-none hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            onClick={handleMinimize}
          >
            <IconMinus size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-12 rounded-none hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            onClick={handleMaximize}
          >
            {isMaximized ? (
              <IconArrowsDiagonalMinimize2 size={14} />
            ) : (
              <IconSquare size={14} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-12 rounded-none hover:bg-destructive hover:text-white text-white/80 transition-colors"
            onClick={handleClose}
          >
            <IconX size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
