import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { formatShortcutForDisplay, buildAccelerator, isMacOS } from '@/lib/hotkey-utils'

interface ShortcutInputProps {
    value: string
    onChange: (value: string) => void
    onValidate?: (value: string) => Promise<{ valid: boolean; error?: string; warning?: string }>
    disabled?: boolean
    className?: string
}

export function ShortcutInput({
    value,
    onChange,
    onValidate,
    disabled = false,
    className
}: ShortcutInputProps) {
    const [isRecording, setIsRecording] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [warning, setWarning] = useState<string | null>(null)
    const [pendingValue, setPendingValue] = useState<string | null>(null)
    const inputRef = useRef<HTMLButtonElement>(null)

    // Format shortcut for display
    const displayParts = formatShortcutForDisplay(pendingValue || value)

    // Handle starting recording
    const startRecording = useCallback(() => {
        if (disabled) return
        setIsRecording(true)
        setError(null)
        setWarning(null)
        setPendingValue(null)
    }, [disabled])

    // Handle canceling recording
    const cancelRecording = useCallback(() => {
        setIsRecording(false)
        setPendingValue(null)
        setError(null)
        setWarning(null)
    }, [])

    // Handle keyboard events during recording
    const handleKeyDown = useCallback(async (event: KeyboardEvent) => {
        if (!isRecording) return

        event.preventDefault()
        event.stopPropagation()

        // Escape cancels recording
        if (event.key === 'Escape') {
            cancelRecording()
            return
        }

        // Build accelerator from the event
        const accelerator = buildAccelerator(event)

        if (!accelerator) {
            // Just modifiers pressed, wait for more input
            return
        }

        // We have a complete shortcut
        setPendingValue(accelerator)

        // Validate if validator provided
        if (onValidate) {
            try {
                const result = await onValidate(accelerator)
                if (!result.valid) {
                    setError(result.error || 'Invalid shortcut')
                    setWarning(null)
                    return
                }
                if (result.warning) {
                    setWarning(result.warning)
                }
            } catch (e) {
                setError('Validation failed')
                return
            }
        }

        // Accept the shortcut
        setError(null)
        onChange(accelerator)
        setIsRecording(false)
        setPendingValue(null)
    }, [isRecording, cancelRecording, onValidate, onChange])

    // Set up keyboard listener when recording
    useEffect(() => {
        if (!isRecording) return

        window.addEventListener('keydown', handleKeyDown, true)
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true)
        }
    }, [isRecording, handleKeyDown])

    // Handle blur - cancel recording
    useEffect(() => {
        if (!isRecording) return

        const handleBlur = () => {
            // Small delay to allow click events to process
            setTimeout(() => {
                if (isRecording) {
                    cancelRecording()
                }
            }, 100)
        }

        window.addEventListener('blur', handleBlur)
        return () => {
            window.removeEventListener('blur', handleBlur)
        }
    }, [isRecording, cancelRecording])

    return (
        <div className={cn('relative', className)}>
            <button
                ref={inputRef}
                type="button"
                onClick={isRecording ? cancelRecording : startRecording}
                disabled={disabled}
                className={cn(
                    'flex items-center justify-center gap-1 min-w-[100px] h-8 px-3 py-1.5',
                    'rounded-md border text-sm transition-all',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    disabled && 'opacity-50 cursor-not-allowed',
                    isRecording
                        ? 'border-primary bg-primary/5 animate-pulse'
                        : error
                            ? 'border-destructive bg-destructive/5'
                            : warning
                                ? 'border-yellow-500 bg-yellow-500/5'
                                : 'border-input bg-background hover:bg-accent/50'
                )}
            >
                {isRecording ? (
                    <span className="text-xs text-muted-foreground">Press keys...</span>
                ) : displayParts.length > 0 ? (
                    displayParts.map((part, i) => (
                        <kbd
                            key={i}
                            className={cn(
                                'inline-flex items-center justify-center',
                                'px-1.5 py-0.5 min-w-[24px]',
                                'rounded text-xs font-medium',
                                'bg-muted border border-border/50',
                                isMacOS() ? 'font-sans' : 'font-mono'
                            )}
                        >
                            {part}
                        </kbd>
                    ))
                ) : (
                    <span className="text-xs text-muted-foreground">Click to set</span>
                )}
            </button>

            {/* Error message */}
            {error && (
                <p className="absolute top-full left-0 mt-1 text-xs text-destructive whitespace-nowrap">
                    {error}
                </p>
            )}

            {/* Warning message */}
            {warning && !error && (
                <p className="absolute top-full left-0 mt-1 text-xs text-yellow-600 dark:text-yellow-500 whitespace-nowrap">
                    {warning}
                </p>
            )}
        </div>
    )
}
