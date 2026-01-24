import { useState, useRef, useEffect } from "react";
import { Logo } from "@/components/ui/logo";
import { useChatSounds } from "@/hooks";
import { useAtomValue } from "jotai";
import { chatSoundsEnabledAtom } from "@/lib/atoms";
import { cn } from "@/lib/utils";

export function QuickPrompt() {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sound effects
  const soundsEnabled = useAtomValue(chatSoundsEnabledAtom);
  const chatSounds = useChatSounds(soundsEnabled);

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    // Play sound when quick prompt opens (only once on mount)
    chatSounds.playChatStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!message.trim() || isSending) return;

    setIsSending(true);

    // Play thinking sound when sending
    chatSounds.playThinking(false);

    try {
      await window.desktopApi?.quickPrompt.sendMessage(message.trim());
      window.close();
    } catch (error) {
      console.error("Failed to send quick prompt:", error);
      chatSounds.playError();
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      window.close();
    }
  };

  const isWindows = window.desktopApi?.platform === "win32";

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-transparent pointer-events-none p-4">
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-2xl pointer-events-auto w-full max-w-[580px] transition-all duration-300 border",
          isWindows
            ? "bg-[#161618] border-white/10"
            : "bg-[#161618]/80 border-white/15 backdrop-blur-3xl saturate-[150%]",
          "focus-within:border-blue-500/40 focus-within:bg-[#1a1a1c] focus-within:ring-4 focus-within:ring-blue-500/10",
        )}
      >
        <div className="flex items-center justify-center shrink-0 opacity-80 group-focus-within:opacity-100 transition-opacity">
          <Logo size={24} />
        </div>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-[#ffffff] text-[16px] font-normal leading-relaxed placeholder:text-white/30 disabled:opacity-50 min-w-0"
          placeholder="¿En qué puedo ayudarte hoy?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
        />
        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[10px] font-medium text-white/30 tracking-wider">
          {isWindows ? "Enter" : "↵"}
        </div>
      </div>
    </div>
  );
}
