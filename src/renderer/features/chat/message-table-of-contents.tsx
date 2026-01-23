import { memo, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { overlayContent, overlayItem } from '@/lib/overlay-styles'

const LINE_WIDTH_MIN = 8
const LINE_WIDTH_MAX = 32
const LINE_WIDTH_SCALE = 24
const LEN_DIVISOR = 300

function getPromptText(c: unknown): string {
  if (typeof c === 'string') {
    if (c.trim().startsWith('{') && c.includes('"type":"text"')) {
      try {
        const p = JSON.parse(c) as { text?: string }
        return p.text || c
      } catch {
        return c
      }
    }
    return c
  }
  if (Array.isArray(c)) {
    return c.map((i: unknown) => (i as { text?: string })?.text || '').join('')
  }
  if (typeof c === 'object' && c !== null && 'text' in c) {
    return String((c as { text: unknown }).text ?? '')
  }
  return String(c ?? '')
}

function lineWidthPx(promptLength: number): number {
  return Math.round(
    Math.min(LINE_WIDTH_MAX, Math.max(LINE_WIDTH_MIN, LINE_WIDTH_MIN + (promptLength / LEN_DIVISOR) * LINE_WIDTH_SCALE))
  )
}

interface MessageTableOfContentsProps {
  messages: Array<{ id: string; role: string; content: unknown }>
  activeId?: string | null
  onScrollToMessage?: (id: string) => void
  className?: string
  tooltipSide?: 'top' | 'left' | 'right' | 'bottom'
}

/**
 * Notion-style floating ToC: horizontal lines, length scales with prompt.
 * Hover = full prompt; click = scroll to message. Right-aligned for floating on the right.
 */
export const MessageTableOfContents = memo(function MessageTableOfContents({
  messages,
  activeId,
  onScrollToMessage,
  className,
  tooltipSide = 'left',
}: MessageTableOfContentsProps) {
  const entries = messages
    .filter((m) => m.role === 'user')
    .map((m) => ({ id: m.id, prompt: getPromptText(m.content) }))
    .filter((e) => e.prompt.length > 0)

  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setOpen(true)
  }

  const handleMouseLeave = () => {
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 150)
  }

  if (entries.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <nav
          aria-label="Table of contents"
          className={cn('flex flex-col items-end gap-y-1.5 animate-in fade-in duration-300', className)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {entries.map(({ id, prompt }) => {
            const isActive = activeId === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onScrollToMessage?.(id)
                  setOpen(false)
                }}
                className={cn(
                  'group w-full flex justify-end py-0.5 rounded-sm transition-all',
                  isActive ? 'opacity-100 scale-x-110 translate-x-[-2px]' : 'opacity-40 hover:opacity-100',
                  onScrollToMessage && 'cursor-pointer'
                )}
              >
                <span
                  className={cn(
                    "h-[3px] rounded-full transition-all shrink-0",
                    isActive 
                      ? "bg-primary w-[36px] shadow-[0_0_8px_rgba(var(--primary),0.5)]" 
                      : "bg-muted-foreground/30 group-hover:bg-foreground/50"
                  )}
                  style={{ width: isActive ? undefined : lineWidthPx(prompt.length) }}
                  aria-hidden
                />
              </button>
            )
          })}
        </nav>
      </PopoverAnchor>
      <PopoverContent
        side={tooltipSide}
        align="start"
        sideOffset={8}
        className={cn(overlayContent, 'w-[280px] p-1')}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="py-1">
          {entries.map(({ id, prompt }) => (
            <button
              key={id}
              type="button"
              className={cn(overlayItem, 'w-full text-left')}
              onClick={() => {
                onScrollToMessage?.(id)
                setOpen(false)
              }}
            >
              <span className="truncate">{prompt}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
})
