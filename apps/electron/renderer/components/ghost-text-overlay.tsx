/**
 * Ghost Text Overlay Component
 *
 * Implements the "mirror element" technique for showing inline ghost text
 * suggestions in a textarea, similar to VS Code or Gmail Smart Compose.
 *
 * Based on: https://dev.to/phuocng/provide-a-preview-of-the-suggestion-as-users-type-in-a-text-area-18bk
 */

import { memo, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface AutocompleteData {
  original: string
  completion: string
  remainingText: string
  startIndex: number
  endIndex: number
}

interface GhostTextOverlayProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  autocomplete: AutocompleteData | null
  className?: string
}

/**
 * CSS properties that need to be synced between textarea and mirror
 * for accurate positioning of ghost text
 */
const MIRROR_STYLE_PROPERTIES = [
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'boxSizing',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'textDecoration',
  'textIndent',
  'textTransform',
  'whiteSpace',
  'wordSpacing',
  'wordWrap',
  'wordBreak',
  'overflowWrap',
  'textRendering',
  'textAlign',
  'direction',
] as const

export const GhostTextOverlay = memo(function GhostTextOverlay({
  textareaRef,
  value,
  autocomplete,
  className,
}: GhostTextOverlayProps) {
  const mirrorRef = useRef<HTMLDivElement>(null)

  // Sync computed styles from textarea to mirror element
  const syncStyles = useCallback(() => {
    const textarea = textareaRef.current
    const mirror = mirrorRef.current
    if (!textarea || !mirror) return

    const computed = window.getComputedStyle(textarea)

    for (const prop of MIRROR_STYLE_PROPERTIES) {
      const cssValue = computed.getPropertyValue(
        prop.replace(/([A-Z])/g, '-$1').toLowerCase()
      )
      mirror.style.setProperty(
        prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
        cssValue
      )
    }

    // Match dimensions exactly
    mirror.style.width = `${textarea.offsetWidth}px`
    mirror.style.height = `${textarea.offsetHeight}px`
  }, [textareaRef])

  // Sync scroll position from textarea to mirror
  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current
    const mirror = mirrorRef.current
    if (!textarea || !mirror) return

    mirror.scrollTop = textarea.scrollTop
    mirror.scrollLeft = textarea.scrollLeft
  }, [textareaRef])

  // Initial style sync and set up observers
  useEffect(() => {
    syncStyles()
    syncScroll()

    const textarea = textareaRef.current
    if (!textarea) return

    // Sync on scroll
    textarea.addEventListener('scroll', syncScroll)

    // Sync on resize using ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      syncStyles()
    })
    resizeObserver.observe(textarea)

    return () => {
      textarea.removeEventListener('scroll', syncScroll)
      resizeObserver.disconnect()
    }
  }, [textareaRef, syncStyles, syncScroll])

  // Re-sync styles when value changes (textarea may resize)
  // biome-ignore lint/correctness/useExhaustiveDependencies: value/autocomplete trigger re-sync intentionally
  useEffect(() => {
    syncStyles()
    syncScroll()
  }, [value, autocomplete, syncStyles, syncScroll])

  // Don't render if no autocomplete suggestion
  if (!autocomplete) {
    return null
  }

  // Build content: transparent text before cursor + ghost suggestion
  const textBeforeAutocomplete = value.slice(0, autocomplete.startIndex)
  const currentWord = autocomplete.original
  const ghostText = autocomplete.remainingText

  return (
    <div
      ref={mirrorRef}
      className={cn(
        "absolute inset-0 pointer-events-none",
        className
      )}
      style={{
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        background: 'transparent',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        wordBreak: 'break-word',
      }}
      aria-hidden="true"
    >
      {/* Text before the autocomplete position - invisible */}
      <span style={{ color: 'transparent' }}>{textBeforeAutocomplete}</span>
      {/* Current word being typed - invisible */}
      <span style={{ color: 'transparent' }}>{currentWord}</span>
      {/* Ghost text suggestion - visible in muted gray */}
      <span className="text-muted-foreground/50 select-none">{ghostText}</span>
    </div>
  )
})

/**
 * Tab hint badge shown when autocomplete is available
 */
interface TabHintProps {
  hasAutocomplete: boolean
  className?: string
}

export const TabHint = memo(function TabHint({
  hasAutocomplete,
  className,
}: TabHintProps) {
  if (!hasAutocomplete) return null

  return (
    <div className={cn(
      "absolute right-3 top-2 flex items-center gap-1.5 pointer-events-none z-30",
      className
    )}>
      <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded font-medium">
        Tab completar
      </span>
    </div>
  )
})
