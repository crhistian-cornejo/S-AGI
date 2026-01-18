import { useState } from 'react'
import { 
    IconFile, 
    IconPhoto, 
    IconDownload, 
    IconX, 
    IconZoomIn,
    IconFileTypePdf,
    IconFileTypeDoc,
    IconFileTypeTxt,
    IconFileCode,
    IconTable,
    IconFileZip
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

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
    const [lightboxImage, setLightboxImage] = useState<string | null>(null)
    const [lightboxName, setLightboxName] = useState<string>('')

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

    const getFileIconConfig = (attachment: MessageAttachment) => {
        const ext = attachment.name.split('.').pop()?.toLowerCase() || ''
        const type = attachment.type

        if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            return { Icon: IconPhoto, color: 'text-purple-500', bg: 'bg-purple-500/10' }
        }

        if (type === 'application/pdf' || ext === 'pdf') {
            return { Icon: IconFileTypePdf, color: 'text-red-500', bg: 'bg-red-500/10' }
        }

        if (['doc', 'docx'].includes(ext) || type.includes('msword') || type.includes('wordprocessingml')) {
            return { Icon: IconFileTypeDoc, color: 'text-blue-500', bg: 'bg-blue-500/10' }
        }

        if (['xls', 'xlsx', 'csv'].includes(ext) || type.includes('spreadsheet') || type.includes('excel')) {
            return { Icon: IconTable, color: 'text-green-500', bg: 'bg-green-500/10' }
        }

        if (['txt', 'md', 'markdown'].includes(ext) || type.startsWith('text/')) {
            return { Icon: IconFileTypeTxt, color: 'text-slate-500', bg: 'bg-slate-500/10' }
        }
        
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || type.includes('compressed') || type.includes('archive') || type.includes('zip')) {
            return { Icon: IconFileZip, color: 'text-yellow-500', bg: 'bg-yellow-500/10' }
        }

        if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'go', 'java', 'c', 'cpp'].includes(ext)) {
            return { Icon: IconFileCode, color: 'text-orange-500', bg: 'bg-orange-500/10' }
        }

        return { Icon: IconFile, color: 'text-muted-foreground', bg: 'bg-muted/50' }
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

    const openLightbox = (url: string, name: string) => {
        setLightboxImage(url)
        setLightboxName(name)
    }

    const closeLightbox = () => {
        setLightboxImage(null)
        setLightboxName('')
    }

    // Separate images from other files
    const imageAttachments = attachments.filter(a => a.type.startsWith('image/'))
    const otherAttachments = attachments.filter(a => !a.type.startsWith('image/'))

    return (
        <>
            <div className={cn("space-y-3", className)}>
                {/* Image Grid - Show images prominently */}
                {imageAttachments.length > 0 && (
                    <div className={cn(
                        "grid gap-2",
                        imageAttachments.length === 1 && "grid-cols-1",
                        imageAttachments.length === 2 && "grid-cols-2",
                        imageAttachments.length >= 3 && "grid-cols-2 sm:grid-cols-3"
                    )}>
                        {imageAttachments.map((attachment) => {
                            const imageUrl = attachment.preview || attachment.url
                            
                            return (
                                // biome-ignore lint/a11y/useSemanticElements: interactive div needed for complex layout
                                <div
                                    key={attachment.id}
                                    className="relative group rounded-lg overflow-hidden border border-border/50 bg-muted/30 cursor-pointer hover:border-border transition-colors"
                                    onClick={() => imageUrl && openLightbox(imageUrl, attachment.name)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            imageUrl && openLightbox(imageUrl, attachment.name)
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`View ${attachment.name}`}
                                >
                                    {imageUrl ? (
                                        <img
                                            src={imageUrl}
                                            alt={attachment.name}
                                            className="w-full h-auto max-h-64 object-contain bg-background"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-32 flex items-center justify-center">
                                            <IconPhoto size={32} className="text-muted-foreground" />
                                        </div>
                                    )}
                                    
                                    {/* Overlay with actions */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <div className="flex gap-2">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="h-8 px-3"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    imageUrl && openLightbox(imageUrl, attachment.name)
                                                }}
                                            >
                                                <IconZoomIn size={16} className="mr-1" />
                                                View
                                            </Button>
                                            {attachment.url && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="h-8 px-3"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDownload(attachment)
                                                    }}
                                                >
                                                    <IconDownload size={16} className="mr-1" />
                                                    Download
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* File info overlay at bottom */}
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-xs text-white truncate">{attachment.name}</p>
                                        <p className="text-xs text-white/70">{formatFileSize(attachment.size)}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Other files - compact list */}
                {otherAttachments.length > 0 && (
                    <div className="space-y-2">
                        {otherAttachments.map((attachment) => {
                            const { Icon, color, bg } = getFileIconConfig(attachment)
                            
                            return (
                                <div
                                    key={attachment.id}
                                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border/50 hover:border-border transition-colors group"
                                >
                                    {/* Icon */}
                                    <div className={cn("w-10 h-10 rounded flex items-center justify-center flex-shrink-0 transition-colors", bg, color)}>
                                        <Icon size={18} stroke={1.5} />
                                    </div>

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
                )}
            </div>

            {/* Lightbox Dialog */}
            <Dialog open={!!lightboxImage} onOpenChange={() => closeLightbox()}>
                <DialogContent showCloseButton={false} className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-black/95 border-none">
                    <VisuallyHidden>
                        <DialogTitle>{lightboxName}</DialogTitle>
                    </VisuallyHidden>
                    
                    {/* Close button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
                        onClick={closeLightbox}
                    >
                        <IconX size={20} />
                    </Button>

                    {/* Image */}
                    {lightboxImage && (
                        <div className="flex items-center justify-center w-full h-full min-h-[50vh]">
                            <img
                                src={lightboxImage}
                                alt={lightboxName}
                                className="max-w-full max-h-[85vh] object-contain"
                            />
                        </div>
                    )}

                    {/* Image name at bottom */}
                    <div className="absolute bottom-4 left-4 right-4 text-center">
                        <p className="text-sm text-white/80">{lightboxName}</p>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
