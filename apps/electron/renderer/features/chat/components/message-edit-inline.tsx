import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface MessageEditInlineProps {
  initialContent: string;
  onSave: (newContent: string) => void;
  onCancel: () => void;
}

/**
 * Inline edit textarea that replaces a user message bubble during editing.
 * Enter (without Shift) = save, Escape = cancel.
 */
export const MessageEditInline = memo(function MessageEditInline({
  initialContent,
  onSave,
  onCancel,
}: MessageEditInlineProps) {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus and select all on mount
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [content]);

  const handleSave = useCallback(() => {
    const trimmed = content.trim();
    if (trimmed && trimmed !== initialContent.trim()) {
      onSave(trimmed);
    } else {
      onCancel();
    }
  }, [content, initialContent, onSave, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSave, onCancel]
  );

  return (
    <div className="flex flex-col gap-2 w-full">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px] max-h-[300px] overflow-y-auto"
        placeholder="Edit your message..."
      />
      <div className="flex items-center gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-7 px-3 text-xs"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!content.trim() || content.trim() === initialContent.trim()}
          className="h-7 px-3 text-xs"
        >
          Save & Submit
        </Button>
      </div>
    </div>
  );
});
