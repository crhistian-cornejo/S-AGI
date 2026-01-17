import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { trpc } from '@/lib/trpc'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface RenameChatDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    chatId: string
    currentTitle: string
    onSuccess?: () => void
}

export function RenameChatDialog({
    open,
    onOpenChange,
    chatId,
    currentTitle,
    onSuccess
}: RenameChatDialogProps) {
    const [title, setTitle] = useState(currentTitle)

    // Update title when prop changes
    useEffect(() => {
        if (open) {
            setTitle(currentTitle)
        }
    }, [open, currentTitle])

    const updateChat = trpc.chats.update.useMutation({
        onSuccess: () => {
            onOpenChange(false)
            onSuccess?.()
        }
    })

    const handleSave = () => {
        if (!title.trim() || title === currentTitle) {
            onOpenChange(false)
            return
        }
        updateChat.mutate({ id: chatId, title: title.trim() })
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleSave()
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Rename Chat</DialogTitle>
                    <DialogDescription className="sr-only">
                        Enter a new name for your chat.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={updateChat.isPending}>
                        {updateChat.isPending ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
