import { useState, useRef, useEffect } from 'react'
import { Logo } from '@/components/ui/logo'
import { useChatSounds } from '@/lib/use-chat-sounds'
import { useAtomValue } from 'jotai'
import { chatSoundsEnabledAtom } from '@/lib/atoms'
import './quick-prompt.css'

export function QuickPrompt() {
    const [message, setMessage] = useState('')
    const [isSending, setIsSending] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Sound effects
    const soundsEnabled = useAtomValue(chatSoundsEnabledAtom)
    const chatSounds = useChatSounds(soundsEnabled)

    useEffect(() => {
        setTimeout(() => {
            inputRef.current?.focus()
        }, 100)

        // Play sound when quick prompt opens (only once on mount)
        chatSounds.playChatStart()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSubmit = async () => {
        if (!message.trim() || isSending) return

        setIsSending(true)

        // Play thinking sound when sending
        chatSounds.playThinking(false)

        try {
            await window.desktopApi?.quickPrompt.sendMessage(message.trim())
            window.close()
        } catch (error) {
            console.error('Failed to send quick prompt:', error)
            chatSounds.playError()
            setIsSending(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
        if (e.key === 'Escape') {
            window.close()
        }
    }

    const isWindows = window.desktopApi?.platform === 'win32'

    return (
        <div className={`quick-prompt-container ${isWindows ? 'platform-windows' : ''}`}>
            <div className="quick-prompt-content">
                <div className="quick-prompt-icon">
                    <Logo size={22} />
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    className="quick-prompt-input"
                    placeholder="¿En qué puedo ayudarte hoy?"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                />
            </div>
        </div>
    )
}
