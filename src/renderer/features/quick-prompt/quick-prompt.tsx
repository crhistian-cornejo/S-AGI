import { useState, useRef, useEffect } from 'react'
import { IconSend, IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import './quick-prompt.css'

export function QuickPrompt() {
    const [message, setMessage] = useState('')
    const [isSending, setIsSending] = useState(false)
    const inputRef = useRef<HTMLTextAreaElement>(null)

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
                    <IconSparkles size={16} />
                </div>
                <textarea
                    ref={inputRef}
                    className="quick-prompt-input"
                    placeholder="Ask anything..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={isSending}
                />
                <Button
                    size="icon"
                    className="quick-prompt-send"
                    onClick={handleSubmit}
                    disabled={!message.trim() || isSending}
                >
                    <IconSend size={14} />
                </Button>
            </div>
        </div>
    )
}
