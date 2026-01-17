import { IconFile, IconPhoto, IconFileText, IconDownload } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface MessageAttachment {
    id: string
    name: string
    size: number
    type: string
    url?: string
    preview?: string
}

interface MessageAttachmentsProps {
    attachments: MessageAttachment[]
    className?: string
}

export function MessageAttachments({ attachments, className }: MessageAttachmentsProps) {
    if (!attachments || attachments.length === 0) {
        return null
    }

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const getFileIcon = (type: string) => {
        if (type.startsWith('image/')) return IconPhoto
        if (type === 'application/pdf') return IconFileText
        return IconFile
    }

    const handleDownload = (attachment: MessageAttachment) => {
        if (attachment.url) {
            const link = document.createElement('a')
            link.href = attachment.url
            link.download = attachment.name
            link.target = '_blank'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        }
    }

    return (
        <div className={cn("space-y-2", className)}>
            {attachments.map((attachment) => {
                const Icon = getFileIcon(attachment.type)
                
                return (
                    <div
                        key={attachment.id}
                        className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border/50 hover:border-border transition-colors group"
                    >
                        {/* Preview or Icon */}
                        {attachment.preview ? (
                            <img
                                src={attachment.preview}
                                alt={attachment.name}
                                className="w-10 h-10 rounded object-cover flex-shrink-0"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded bg-background flex items-center justify-center flex-shrink-0">
                                <Icon size={18} className="text-muted-foreground" />
                            </div>
                        )}

                        {/* File Info */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{attachment.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatFileSize(attachment.size)}
                            </p>
                        </div>

                        {/* Download Button */}
                        {attachment.url && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(attachment)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <IconDownload size={16} />
                            </Button>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
