import { useState, useCallback } from 'react'
import { useAtomValue } from 'jotai'
import { IconLoader2, IconWand, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { trpc } from '@/lib/trpc'
import { selectedChatIdAtom } from '@/lib/atoms'

interface ImageEditDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    imageUrl: string
    originalPrompt: string
    onEditComplete?: (newImageUrl: string, editPrompt: string) => void
}

/**
 * Dialog for editing an existing image using AI.
 * Shows the original image preview and lets user describe the edits they want.
 */
export function ImageEditDialog({
    open,
    onOpenChange,
    imageUrl,
    originalPrompt,
    onEditComplete
}: ImageEditDialogProps) {
    const chatId = useAtomValue(selectedChatIdAtom)
    const [editPrompt, setEditPrompt] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null)

    // Get API key from secure storage
    const { data: apiKeyData } = trpc.settings.getOpenAIKey.useQuery()

    // tRPC mutation for executing the edit_image tool
    const executeToolMutation = trpc.tools.execute.useMutation()

    const handleEdit = useCallback(async () => {
        if (!editPrompt.trim() || !chatId) {
            toast.error('Please enter a description of the edits you want')
            return
        }

        if (!apiKeyData?.key) {
            toast.error('OpenAI API key is required. Please configure it in Settings.')
            return
        }

        setIsEditing(true)
        setEditedImageUrl(null)

        try {
            // First, fetch the image and convert to base64
            const response = await fetch(imageUrl)
            if (!response.ok) {
                throw new Error('Failed to fetch original image')
            }
            
            const blob = await response.blob()
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => {
                    const result = reader.result as string
                    // Remove data URL prefix to get pure base64
                    const base64Data = result.split(',')[1]
                    resolve(base64Data)
                }
                reader.onerror = reject
                reader.readAsDataURL(blob)
            })

            // Call the edit_image tool with API key
            const result = await executeToolMutation.mutateAsync({
                toolName: 'edit_image',
                chatId,
                apiKey: apiKeyData.key,
                args: {
                    prompt: editPrompt,
                    imageBase64: base64,
                    quality: 'high'
                }
            })

            // Type assertion - the tool returns { imageUrl, message, prompt, size, quality }
            const editResult = result as { imageUrl: string; message: string }
            
            if (editResult.imageUrl) {
                setEditedImageUrl(editResult.imageUrl)
                toast.success('Image edited successfully!')
                onEditComplete?.(editResult.imageUrl, editPrompt)
            } else {
                throw new Error('No image URL in response')
            }
        } catch (error) {
            console.error('Failed to edit image:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to edit image')
        } finally {
            setIsEditing(false)
        }
    }, [editPrompt, chatId, imageUrl, executeToolMutation, onEditComplete, apiKeyData?.key])

    const handleClose = useCallback(() => {
        setEditPrompt('')
        setEditedImageUrl(null)
        onOpenChange(false)
    }, [onOpenChange])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isEditing) {
            e.preventDefault()
            handleEdit()
        }
    }, [handleEdit, isEditing])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <IconWand size={20} />
                        Edit Image
                    </DialogTitle>
                    <DialogDescription>
                        Describe the changes you want to make to this image.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    {/* Image Preview */}
                    <div className="relative rounded-lg overflow-hidden bg-muted/30 border">
                        <div className="grid grid-cols-2 gap-2 p-2">
                            {/* Original Image */}
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Original</Label>
                                <img
                                    src={imageUrl}
                                    alt="Original"
                                    className="w-full aspect-square object-contain rounded-md bg-muted/50"
                                />
                            </div>
                            
                            {/* Edited Image or Placeholder */}
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">
                                    {editedImageUrl ? 'Edited' : 'Preview'}
                                </Label>
                                {editedImageUrl ? (
                                    <img
                                        src={editedImageUrl}
                                        alt="Edited"
                                        className="w-full aspect-square object-contain rounded-md bg-muted/50"
                                    />
                                ) : (
                                    <div className="w-full aspect-square rounded-md bg-muted/30 flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
                                        {isEditing ? (
                                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                <IconLoader2 size={24} className="animate-spin" />
                                                <span className="text-xs">Editing...</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground/50">
                                                Edited result will appear here
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Original prompt info */}
                        <div className="px-3 py-2 bg-muted/20 border-t">
                            <p className="text-xs text-muted-foreground line-clamp-2" title={originalPrompt}>
                                <span className="font-medium">Original: </span>
                                {originalPrompt}
                            </p>
                        </div>
                    </div>

                    {/* Edit Prompt Input */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-prompt">Describe your edits</Label>
                        <Textarea
                            id="edit-prompt"
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g., Add a sunset background, change the color to blue, remove the person on the left..."
                            className="min-h-[80px] resize-none"
                            disabled={isEditing}
                        />
                        <p className="text-xs text-muted-foreground">
                            Be specific about what to change, add, or remove. Press Cmd/Ctrl+Enter to submit.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleClose}
                        disabled={isEditing}
                    >
                        <IconX size={16} className="mr-1.5" />
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleEdit}
                        disabled={isEditing || !editPrompt.trim()}
                    >
                        {isEditing ? (
                            <>
                                <IconLoader2 size={16} className="mr-1.5 animate-spin" />
                                Editing...
                            </>
                        ) : (
                            <>
                                <IconWand size={16} className="mr-1.5" />
                                Apply Edits
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
