import { memo, useState, useEffect, useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { IconDownload, IconZoomIn, IconX, IconPhoto, IconShare, IconPencil } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { imageEditDialogAtom } from '@/lib/atoms'
import { toast } from 'sonner'

interface AgentImageGenerationProps {
    prompt: string
    imageUrl?: string
    size?: string
    quality?: string
    status: 'generating' | 'complete' | 'error'
    error?: string
    className?: string
}

/**
 * Dedicated component for AI image generation with:
 * - Shimmer effect while generating
 * - Reveal animation when complete
 * - Fullscreen lightbox zoom
 * - Download functionality
 * - Edit button (opens ImageEditDialog via atom)
 */
export const AgentImageGeneration = memo(function AgentImageGeneration({
    prompt,
    imageUrl,
    size = '1024x1024',
    quality = 'high',
    status,
    error,
    className
}: AgentImageGenerationProps) {
    const setImageEditDialog = useSetAtom(imageEditDialogAtom)
    const [isLoaded, setIsLoaded] = useState(false)
    const [isRevealed, setIsRevealed] = useState(false)
    const [loadError, setLoadError] = useState(false)
    const [isLightboxOpen, setIsLightboxOpen] = useState(false)

    // Trigger reveal animation after image loads
    useEffect(() => {
        if (isLoaded && !isRevealed) {
            const timer = setTimeout(() => setIsRevealed(true), 50)
            return () => clearTimeout(timer)
        }
    }, [isLoaded, isRevealed])

    // Handle escape key to close lightbox
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isLightboxOpen) {
                setIsLightboxOpen(false)
            }
        }
        if (isLightboxOpen) {
            document.addEventListener('keydown', handleEscape)
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.removeEventListener('keydown', handleEscape)
            document.body.style.overflow = ''
        }
    }, [isLightboxOpen])

    const handleDownload = useCallback(async () => {
        if (!imageUrl) return
        try {
            const response = await fetch(imageUrl)
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `generated-image-${Date.now()}.png`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            toast.success('Image downloaded')
        } catch (err) {
            console.error('Failed to download image:', err)
            toast.error('Failed to download image')
        }
    }, [imageUrl])

    const handleShare = useCallback(async () => {
        if (!imageUrl) return
        try {
            await navigator.clipboard.writeText(imageUrl)
            toast.success('Image URL copied to clipboard')
        } catch (err) {
            console.error('Failed to copy URL:', err)
            toast.error('Failed to copy URL')
        }
    }, [imageUrl])

    const handleEdit = useCallback(() => {
        if (!imageUrl) return
        setImageEditDialog({
            isOpen: true,
            imageUrl,
            originalPrompt: prompt
        })
    }, [imageUrl, prompt, setImageEditDialog])

    // Error state
    if (status === 'error' || loadError) {
        return (
            <div className={cn(
                "rounded-xl border border-destructive/30 bg-destructive/5 p-4",
                "flex items-start gap-3",
                className
            )}>
                <IconPhoto size={24} className="text-destructive/60 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-medium text-destructive">Failed to generate image</span>
                    <span className="text-xs text-muted-foreground">{error || 'Image failed to load'}</span>
                    <span className="text-xs text-muted-foreground/70 truncate mt-1" title={prompt}>
                        {prompt}
                    </span>
                </div>
            </div>
        )
    }

    // Generating state with shimmer
    if (status === 'generating') {
        return (
            <div className={cn(
                "rounded-xl border border-border/50 overflow-hidden relative",
                className
            )}>
                {/* Full card shimmer background */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
                </div>
                
                {/* Header */}
                <div className="relative flex items-center gap-3 px-4 py-3 bg-muted/20">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center animate-pulse">
                        <IconPhoto size={20} className="text-violet-400" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <TextShimmer as="span" duration={1.5} className="text-sm font-medium">
                            Generating image...
                        </TextShimmer>
                        <span className="text-xs text-muted-foreground/70 truncate" title={prompt}>
                            {prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt}
                        </span>
                    </div>
                </div>
                
                {/* Shimmer skeleton for image */}
                <div className="relative aspect-square max-w-lg mx-auto bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40">
                    {/* Secondary shimmer layer on image area */}
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite_0.3s] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                    {/* Grid pattern for visual interest */}
                    <div className="absolute inset-0 opacity-[0.03]">
                        <div className="w-full h-full" style={{
                            backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
                            backgroundSize: '24px 24px'
                        }} />
                    </div>
                    {/* Centered icon with glow */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative">
                            <div className="absolute inset-0 w-20 h-20 rounded-full bg-violet-500/10 blur-xl animate-pulse" />
                            <div className="relative w-16 h-16 rounded-full bg-muted/60 backdrop-blur-sm flex items-center justify-center border border-border/30">
                                <IconPhoto size={28} className="text-muted-foreground/40 animate-pulse" />
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Footer info */}
                <div className="relative flex items-center justify-between px-4 py-2 bg-muted/10 text-xs text-muted-foreground/60">
                    <span>gpt-image-1.5</span>
                    <span>{size} · {quality}</span>
                </div>
            </div>
        )
    }

    // Complete state with image
    return (
        <>
            <div className={cn(
                "inline-block w-fit max-w-full rounded-xl border border-border/50 overflow-hidden group mx-auto",
                className
            )}>
                {/* Image container with reveal animation */}
                <div className="relative bg-muted/20 inline-block">
                    {/* Loading shimmer overlay */}
                    {!isLoaded && (
                        <div className="absolute inset-0 aspect-square max-w-lg mx-auto bg-muted/30 overflow-hidden">
                            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center animate-pulse">
                                    <IconPhoto size={32} className="text-muted-foreground/30" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* The actual image */}
                    <div className={cn(
                        "overflow-hidden transition-all duration-700 ease-out",
                        !isRevealed && "max-h-0 opacity-0",
                        isRevealed && "max-h-[600px] opacity-100"
                    )}>
                        <button
                            type="button"
                            onClick={() => setIsLightboxOpen(true)}
                            className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <img
                                src={imageUrl}
                                alt={prompt}
                                onLoad={() => setIsLoaded(true)}
                                onError={() => setLoadError(true)}
                                className={cn(
                                    "w-auto max-w-lg mx-auto object-contain cursor-zoom-in",
                                    "transition-transform duration-200 hover:scale-[1.02]"
                                )}
                            />
                        </button>
                    </div>

                    {/* Action buttons overlay */}
                    {isRevealed && (
                        <div className={cn(
                            "absolute top-2 right-2 flex items-center gap-1",
                            "opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        )}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                                        onClick={() => setIsLightboxOpen(true)}
                                    >
                                        <IconZoomIn size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>View fullscreen</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                                        onClick={handleDownload}
                                    >
                                        <IconDownload size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                                        onClick={handleShare}
                                    >
                                        <IconShare size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy URL</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                                        onClick={handleEdit}
                                    >
                                        <IconPencil size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit image</TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                </div>
                
                {/* Footer with prompt and info */}
                {isRevealed && (
                    <div className="px-4 py-2.5 bg-muted/10 border-t border-border/30">
                        <div className="flex items-start justify-between gap-4">
                            <p className="text-xs text-muted-foreground/80 line-clamp-2" title={prompt}>
                                {prompt}
                            </p>
                            <span className="text-[10px] text-muted-foreground/50 shrink-0 mt-0.5">
                                {size}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Lightbox overlay */}
            {isLightboxOpen && imageUrl && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
                    onClick={() => setIsLightboxOpen(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsLightboxOpen(false)
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Image lightbox"
                >
                    {/* Close button */}
                    <button
                        type="button"
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        onClick={() => setIsLightboxOpen(false)}
                    >
                        <IconX size={24} className="text-white" />
                    </button>

                    {/* Download button in lightbox */}
                    <button
                        type="button"
                        className="absolute top-4 left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2"
                        onClick={(e) => {
                            e.stopPropagation()
                            handleDownload()
                        }}
                    >
                        <IconDownload size={20} className="text-white" />
                        <span className="text-white text-sm">Download</span>
                    </button>

                    {/* Full size image - onClick only prevents event bubbling */}
                    <img
                        src={imageUrl}
                        alt={prompt}
                        className="max-w-[90vw] max-h-[90vh] object-contain"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    />

                    {/* Prompt at bottom */}
                    <div className="absolute bottom-4 left-4 right-4 text-center">
                        <p className="text-sm text-white/70 line-clamp-2 max-w-2xl mx-auto">
                            {prompt}
                        </p>
                    </div>
                </div>
            )}
        </>
    )
})
