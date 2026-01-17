import { useState, useRef, useCallback, useEffect } from 'react'

interface UseSmoothStreamOptions {
    /** Delay between releasing chunks in ms (default: 15) */
    delayMs?: number
    /** Chunking mode: 'word' splits on spaces, 'char' streams character by character */
    chunking?: 'word' | 'char'
    /** Initial delay before starting to display text (allows shimmer to show) */
    initialDelayMs?: number
}

/**
 * Hook that buffers incoming text and releases it smoothly
 * for a more natural streaming experience
 */
export function useSmoothStream(options: UseSmoothStreamOptions = {}) {
    const { delayMs = 8, chunking = 'word', initialDelayMs = 100 } = options
    
    const [displayText, setDisplayText] = useState('')
    const bufferRef = useRef('')
    const displayedRef = useRef('')
    const isStreamingRef = useRef(false)
    const rafRef = useRef<number | null>(null)
    const lastUpdateRef = useRef(0)
    const streamStartTimeRef = useRef(0)

    // Add text to the buffer
    const appendToBuffer = useCallback((delta: string) => {
        bufferRef.current += delta
    }, [])

    // Process buffer and release text gradually
    const processBuffer = useCallback(() => {
        const now = performance.now()
        
        // Wait for initial delay before showing any text (allows shimmer to display)
        if (now - streamStartTimeRef.current < initialDelayMs) {
            if (isStreamingRef.current) {
                rafRef.current = requestAnimationFrame(processBuffer)
            }
            return
        }
        
        // Check if enough time has passed since last update
        if (now - lastUpdateRef.current < delayMs) {
            if (isStreamingRef.current) {
                rafRef.current = requestAnimationFrame(processBuffer)
            }
            return
        }
        
        const buffer = bufferRef.current
        const displayed = displayedRef.current
        
        // Nothing new to display
        if (buffer.length <= displayed.length) {
            if (isStreamingRef.current) {
                rafRef.current = requestAnimationFrame(processBuffer)
            }
            return
        }
        
        // Get remaining text to display
        const remaining = buffer.slice(displayed.length)
        
        let chunkToAdd = ''
        
        if (chunking === 'word') {
            // Find next word boundary (space, newline, or end)
            const spaceIndex = remaining.search(/[\s\n]/)
            if (spaceIndex === -1) {
                // No space found - if we have a lot buffered, release some
                if (remaining.length > 20) {
                    chunkToAdd = remaining.slice(0, 10)
                }
                // Otherwise wait for more content (might be mid-word)
            } else {
                // Include the space/newline
                chunkToAdd = remaining.slice(0, spaceIndex + 1)
            }
        } else {
            // Character by character
            chunkToAdd = remaining.slice(0, 3) // Release 3 chars at a time
        }
        
        if (chunkToAdd) {
            displayedRef.current += chunkToAdd
            setDisplayText(displayedRef.current)
            lastUpdateRef.current = now
        }
        
        // Continue processing if streaming
        if (isStreamingRef.current || bufferRef.current.length > displayedRef.current.length) {
            rafRef.current = requestAnimationFrame(processBuffer)
        }
    }, [delayMs, chunking, initialDelayMs])

    // Start streaming
    const startStream = useCallback(() => {
        isStreamingRef.current = true
        bufferRef.current = ''
        displayedRef.current = ''
        setDisplayText('')
        lastUpdateRef.current = 0
        streamStartTimeRef.current = performance.now()
        
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current)
        }
        rafRef.current = requestAnimationFrame(processBuffer)
    }, [processBuffer])

    // Stop streaming (flush remaining)
    const stopStream = useCallback(() => {
        isStreamingRef.current = false
        
        // Flush any remaining buffer
        if (bufferRef.current.length > displayedRef.current.length) {
            displayedRef.current = bufferRef.current
            setDisplayText(bufferRef.current)
        }
        
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [])

    // Reset completely
    const reset = useCallback(() => {
        isStreamingRef.current = false
        bufferRef.current = ''
        displayedRef.current = ''
        setDisplayText('')
        
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current)
            }
        }
    }, [])

    return {
        displayText,
        appendToBuffer,
        startStream,
        stopStream,
        reset,
        /** Get the full buffered text (for saving) */
        getFullText: () => bufferRef.current
    }
}
