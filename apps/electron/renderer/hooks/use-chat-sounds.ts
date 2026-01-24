import { useCallback, useEffect, useRef } from 'react'

let sharedAudioContext: AudioContext | null = null
let sharedResumePromise: Promise<void> | null = null

function getSharedAudioContext(): AudioContext {
    if (!sharedAudioContext) {
        sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return sharedAudioContext
}

function ensureAudioResumed(ctx: AudioContext): Promise<void> {
    if (ctx.state === 'running') return Promise.resolve()
    if (sharedResumePromise) return sharedResumePromise
    sharedResumePromise = ctx.resume().catch(() => {}).then(() => {
        sharedResumePromise = null
    })
    return sharedResumePromise
}

/**
 * Sound types available for chat events
 */
export type ChatSoundType =
    | 'thinking'       // Agent is thinking/processing
    | 'chat-start'     // New chat started
    | 'response-done'  // Response completed
    | 'tool-use'       // Tool is being executed
    | 'artifact-created' // Artifact created
    | 'error'          // Generic error (API error, streaming error)
    | 'tool-error'     // Error executing a tool
    | 'agent-error'    // Agent error
    | 'click'          // UI click sound

/**
 * Sound configuration - volume, pitch, duration for each sound type
 */
interface SoundConfig {
    frequency: number
    duration: number
    volume: number
    type: OscillatorType
}

const SOUND_CONFIGS: Record<ChatSoundType, SoundConfig> = {
    thinking: {
        frequency: 880,
        duration: 0.25,
        volume: 0.2,
        type: 'sine'
    },
    'chat-start': {
        frequency: 523.25,
        duration: 0.2,
        volume: 0.25,
        type: 'sine'
    },
    'response-done': {
        frequency: 783.99,
        duration: 0.3,
        volume: 0.2,
        type: 'sine'
    },
    'tool-use': {
        frequency: 1046.5,
        duration: 0.12,
        volume: 0.15,
        type: 'square'
    },
    'artifact-created': {
        frequency: 659.25,
        duration: 0.35,
        volume: 0.25,
        type: 'sine'
    },
    'error': {
        frequency: 220,
        duration: 0.3,
        volume: 0.25,
        type: 'sawtooth'
    },
    'tool-error': {
        frequency: 196,
        duration: 0.25,
        volume: 0.2,
        type: 'sawtooth'
    },
    'agent-error': {
        frequency: 174.61,
        duration: 0.4,
        volume: 0.3,
        type: 'sawtooth'
    },
    click: {
        frequency: 1200,
        duration: 0.02,
        volume: 0.05,
        type: 'sine'
    }
}

/**
 * Hook for managing chat sound effects using Web Audio API
 * All sounds are generated synthetically - no external files needed
 */
export function useChatSounds(enabled: boolean = true) {
    const thinkIntervalRef = useRef<NodeJS.Timeout | null>(null)

    /**
     * Get or create AudioContext
     * Must be created after user interaction due to browser policies
     */
    const getAudioContext = useCallback((): AudioContext => {
        return getSharedAudioContext()
    }, [])

    /**
     * Play a single sound tone
     */
    const playTone = useCallback((
        config: SoundConfig,
        fadeIn: boolean = false,
        fadeOut: boolean = false
    ): void => {
        if (!enabled) return

        try {
            const ctx = getAudioContext()

            ensureAudioResumed(ctx).then(() => {
                const oscillator = ctx.createOscillator()
                const gainNode = ctx.createGain()

                oscillator.type = config.type
                oscillator.frequency.setValueAtTime(config.frequency, ctx.currentTime)

                const startTime = ctx.currentTime + 0.001
                const attackTime = fadeIn ? 0.05 : 0
                const releaseTime = fadeOut ? 0.1 : 0
                const sustainTime = config.duration - attackTime - releaseTime

                gainNode.gain.setValueAtTime(0, startTime)

                if (attackTime > 0) {
                    gainNode.gain.linearRampToValueAtTime(config.volume, startTime + attackTime)
                } else {
                    gainNode.gain.setValueAtTime(config.volume, startTime)
                }

                if (sustainTime > 0) {
                    gainNode.gain.setValueAtTime(config.volume, startTime + attackTime + sustainTime)
                }

                if (releaseTime > 0) {
                    gainNode.gain.linearRampToValueAtTime(0, startTime + attackTime + sustainTime + releaseTime)
                }

                oscillator.connect(gainNode)
                gainNode.connect(ctx.destination)

                oscillator.start(startTime)
                oscillator.stop(startTime + config.duration)
            })
        } catch (error) {
            console.error('[useChatSounds] Failed to play sound:', error)
        }
    }, [enabled, getAudioContext])

    /**
     * Play thinking sound - can be called repeatedly or start/stop loop
     */
    const playThinking = useCallback((loop: boolean = false): () => void => {
        if (!enabled) return () => {}

        const stopThinking = () => {
            if (thinkIntervalRef.current) {
                clearInterval(thinkIntervalRef.current)
                thinkIntervalRef.current = null
            }
        }

        if (loop) {
            // Play repeating thinking sound
            stopThinking()
            thinkIntervalRef.current = setInterval(() => {
                playTone(SOUND_CONFIGS.thinking, true, true)
            }, 1200)

            return stopThinking
        } else {
            // Play single thinking sound
            playTone(SOUND_CONFIGS.thinking, true, true)
            return () => {}
        }
    }, [enabled, playTone])

    /**
     * Play chat start sound - ascending tones
     */
    const playChatStart = useCallback((): void => {
        if (!enabled) return

        const config = SOUND_CONFIGS['chat-start']
        const ctx = getAudioContext()
        ensureAudioResumed(ctx)

        // Play a simple ascending arpeggio: C5, E5, G5
        const frequencies = [523.25, 659.25, 783.99]
        frequencies.forEach((freq, i) => {
            setTimeout(() => {
                playTone({ ...config, frequency: freq }, true, true)
            }, i * 80)
        })
    }, [enabled, getAudioContext, playTone])

    /**
     * Play response done sound - positive completion
     */
    const playResponseDone = useCallback((): void => {
        if (!enabled) return

        const config = SOUND_CONFIGS['response-done']
        const ctx = getAudioContext()
        ensureAudioResumed(ctx)

        // Play a pleasant two-tone: G5 -> C6
        playTone({ ...config, frequency: 783.99 }, true, true)
        setTimeout(() => {
            playTone({ ...config, frequency: 1046.5, volume: 0.08 }, true, true)
        }, 100)
    }, [enabled, getAudioContext, playTone])

    /**
     * Play tool use sound - brief action indicator
     */
    const playToolUse = useCallback((): void => {
        if (!enabled) return

        const config = SOUND_CONFIGS['tool-use']
        const ctx = getAudioContext()
        ensureAudioResumed(ctx)

        // Short, sharp sound
        playTone(config, false, false)
    }, [enabled, getAudioContext, playTone])

    /**
     * Play artifact created sound - distinct notification
     */
    const playArtifactCreated = useCallback((): void => {
        if (!enabled) return

        const config = SOUND_CONFIGS['artifact-created']
        const ctx = getAudioContext()
        ensureAudioResumed(ctx)

        // Play a chord: E5, G#5, B5
        const frequencies = [659.25, 830.61, 987.77]
        frequencies.forEach((freq, i) => {
            setTimeout(() => {
                playTone({ ...config, frequency: freq, volume: 0.12 }, true, true)
            }, i * 50)
        })
    }, [enabled, getAudioContext, playTone])

    /**
     * Play error sound - generic error indicator
     */
    const playError = useCallback((): void => {
        if (!enabled) return

        const config = SOUND_CONFIGS['error']
        const ctx = getAudioContext()
        ensureAudioResumed(ctx)

        // Play a descending two-tone: A3 -> E3
        playTone({ ...config, frequency: 220 }, true, true)
        setTimeout(() => {
            playTone({ ...config, frequency: 164.81, volume: 0.15 }, true, true)
        }, 150)
    }, [enabled, getAudioContext, playTone])

    /**
     * Play tool error sound - tool execution failed
     */
    const playToolError = useCallback((): void => {
        if (!enabled) return

        const config = SOUND_CONFIGS['tool-error']
        const ctx = getAudioContext()
        ensureAudioResumed(ctx)

        // Play a single low tone
        playTone(config, true, true)
    }, [enabled, getAudioContext, playTone])

    /**
     * Play agent error sound - agent failed
     */
    const playAgentError = useCallback((): void => {
        if (!enabled) return

        const config = SOUND_CONFIGS['agent-error']
        const ctx = getAudioContext()
        ensureAudioResumed(ctx)

        // Play a three-tone descending pattern: F3 -> D3 -> A2
        playTone({ ...config, frequency: 174.61 }, true, true)
        setTimeout(() => {
            playTone({ ...config, frequency: 146.83, volume: 0.2 }, true, true)
        }, 150)
        setTimeout(() => {
            playTone({ ...config, frequency: 110, volume: 0.15 }, true, true)
        }, 300)
    }, [enabled, getAudioContext, playTone])

    /**
     * Play click sound - UI click interaction
     */
    const playClick = useCallback((): void => {
        if (!enabled) return

        const config = SOUND_CONFIGS['click']
        const ctx = getAudioContext()
        ensureAudioResumed(ctx)

        // Play immediate click sound without fade
        playTone(config, false, false)
    }, [enabled, getAudioContext, playTone])

    /**
     * Export current sound to WAV file (for reuse)
     */
    const exportSoundToWav = useCallback(async (soundType: ChatSoundType): Promise<Blob | null> => {
        const config = SOUND_CONFIGS[soundType]
        const sampleRate = 44100
        const numSamples = Math.floor(config.duration * sampleRate)
        const buffer = new Float32Array(numSamples)

        // Generate the waveform
        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate
            const phase = 2 * Math.PI * config.frequency * t
            
            let amplitude = 0
            if (config.type === 'sine') {
                amplitude = Math.sin(phase)
            } else if (config.type === 'square') {
                amplitude = Math.sin(phase) >= 0 ? 1 : -1
            } else if (config.type === 'triangle') {
                amplitude = 2 * Math.abs(2 * (t * config.frequency - Math.floor(t * config.frequency + 0.5))) - 1
            } else if (config.type === 'sawtooth') {
                amplitude = 2 * (t * config.frequency - Math.floor(t * config.frequency + 0.5))
            }

            // Apply envelope
            const attackTime = 0.05
            const releaseTime = 0.1
            const sustainTime = config.duration - attackTime - releaseTime
            
            let envelope = 0
            if (t < attackTime) {
                envelope = t / attackTime
            } else if (t < attackTime + sustainTime) {
                envelope = 1
            } else {
                envelope = Math.max(0, 1 - (t - attackTime - sustainTime) / releaseTime)
            }

            buffer[i] = amplitude * config.volume * envelope
        }

        // Convert to WAV format
        const wavBuffer = encodeWAV(buffer, sampleRate, 1, 16)
        return new Blob([wavBuffer], { type: 'audio/wav' })
    }, [])

    /**
     * Export all sounds to a ZIP file
     */
    const exportAllSounds = useCallback(async (): Promise<Blob | null> => {
        const soundTypes: ChatSoundType[] = ['thinking', 'chat-start', 'response-done', 'tool-use', 'artifact-created']
        const sounds = await Promise.all(
            soundTypes.map(async (type) => ({
                type,
                blob: await exportSoundToWav(type)
            }))
        )

        // Simple ZIP-like concatenation for now (each WAV separated)
        // For a proper ZIP, you'd use a library like JSZip
        const concatenatedSize = sounds.reduce((acc, s) => acc + (s.blob?.size || 0), 0)
        const concatenatedBuffer = new Uint8Array(concatenatedSize)
        let offset = 0

        for (const sound of sounds) {
            if (sound.blob) {
                const arrayBuffer = await sound.blob.arrayBuffer()
                concatenatedBuffer.set(new Uint8Array(arrayBuffer), offset)
                offset += sound.blob.size
            }
        }

        return new Blob([concatenatedBuffer], { type: 'audio/wav' })
    }, [exportSoundToWav])

    /**
     * Download sound as WAV file
     */
    const downloadSound = useCallback(async (soundType: ChatSoundType, filename?: string): Promise<void> => {
        const blob = await exportSoundToWav(soundType)
        if (!blob) return

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || `chat-sound-${soundType}.wav`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [exportSoundToWav])

    // Cleanup on unmount
    useEffect(() => {
        if (!enabled) return

        const ctx = getAudioContext()
        const warmup = () => {
            ensureAudioResumed(ctx)
        }

        window.addEventListener('pointerdown', warmup, { once: true, passive: true })
        window.addEventListener('keydown', warmup, { once: true, passive: true })

        return () => {
            if (thinkIntervalRef.current) {
                clearInterval(thinkIntervalRef.current)
            }
            window.removeEventListener('pointerdown', warmup)
            window.removeEventListener('keydown', warmup)
        }
    }, [enabled, getAudioContext])

    return {
        playThinking,
        playChatStart,
        playResponseDone,
        playToolUse,
        playArtifactCreated,
        playError,
        playToolError,
        playAgentError,
        playClick,
        exportSoundToWav,
        exportAllSounds,
        downloadSound
    }
}

/**
 * Encode audio buffer to WAV format
 */
function encodeWAV(samples: Float32Array, sampleRate: number, numChannels: number, bitsPerSample: number): BlobPart {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    // WAV header
    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeString(view, 8, 'WAVE')
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true)
    view.setUint16(32, numChannels * bitsPerSample / 8, true)
    view.setUint16(34, bitsPerSample, true)
    writeString(view, 36, 'data')
    view.setUint32(40, samples.length * 2, true)

    // Write samples
    let offset = 44
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const sample = Math.max(-1, Math.min(1, samples[i]))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
    }

    return buffer
}

function writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
    }
}
