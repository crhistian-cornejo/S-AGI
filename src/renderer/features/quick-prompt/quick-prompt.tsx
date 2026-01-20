import { useState, useRef, useEffect } from 'react'
import { IconSparkles } from '@tabler/icons-react'
import './quick-prompt.css'

export function QuickPrompt() {
    const [message, setMessage] = useState('')
    const [isSending, setIsSending] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setTimeout(() => {
            inputRef.current?.focus()
        }, 100)
    }, [])

    const handleSubmit = async () => {
        if (!message.trim() || isSending) return

        setIsSending(true)
        try {
            await window.desktopApi?.quickPrompt.sendMessage(message.trim())
            window.close()
        } catch (error) {
            console.error('Failed to send quick prompt:', error)
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

    return (
        <div className="quick-prompt-container">
            <div className="quick-prompt-content">
                <div className="quick-prompt-icon">
                    <IconSparkles size={18} stroke={2} />
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
