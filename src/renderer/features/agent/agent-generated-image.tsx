import { memo, useState, useEffect } from 'react'
import { IconDownload, IconExternalLink, IconPhoto, IconLoader2 } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface AgentGeneratedImageProps {
    imageUrl: string
    prompt: string
    size?: string
    quality?: string
    isGenerating?: boolean
    className?: string
}

/**
 * Renders an AI-generated image inline in the chat message
 * with a reveal animation similar to ChatGPT
 */
export const AgentGeneratedImage = memo(function AgentGeneratedImage({
    imageUrl,
    prompt,
    size,
    quality: _quality,
    isGenerating = false,
    className
}: AgentGeneratedImageProps) {
    // _quality is accepted for future use (e.g. showing HD badge)
    const [isLoaded, setIsLoaded] = useState(false)
    const [isRevealed, setIsRevealed] = useState(false)
    const [error, setError] = useState(false)

    // Trigger reveal animation after image loads
    useEffect(() => {
        if (isLoaded && !isRevealed) {
            // Small delay to ensure smooth animation
            const timer = setTimeout(() => setIsRevealed(true), 50)
            return () => clearTimeout(timer)
        }
    }, [isLoaded, isRevealed])

    const handleDownload = async () => {
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
        } catch (err) {
            console.error('Failed to download image:', err)
        }
    }

    const handleOpenExternal = () => {
        window.open(imageUrl, '_blank')
    }

    if (error) {
        return (
            <div className={cn(
                "rounded-xl border border-border/50 bg-muted/30 p-4",
                "flex items-center gap-3 text-muted-foreground",
                className
            )}>
                <IconPhoto size={24} className="text-muted-foreground/50" />
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Failed to load image</span>
                    <span className="text-xs text-muted-foreground/70">{prompt}</span>
                </div>
            </div>
        )
    }

    return (
        <div className={cn("relative group", className)}>
            {/* Image container with reveal animation */}
            <div className={cn(
                "relative overflow-hidden rounded-xl",
                "bg-gradient-to-br from-muted/50 to-muted/30",
                "border border-border/30",
                "transition-all duration-500 ease-out"
            )}>
                {/* Loading state with shimmer */}
                {(isGenerating || !isLoaded) && (
                    <div className={cn(
                        "absolute inset-0 flex items-center justify-center",
                        "bg-gradient-to-br from-muted/80 to-muted/50",
                        "animate-pulse",
                        isLoaded && "opacity-0 transition-opacity duration-500"
                    )}>
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <IconLoader2 size={32} className="animate-spin" />
                            <span className="text-sm font-medium">
                                {isGenerating ? 'Generating image...' : 'Loading...'}
                            </span>
                        </div>
                    </div>
                )}

                {/* The actual image with reveal mask */}
                <div className={cn(
                    "relative",
                    // Reveal animation: starts from top, reveals downward
                    "overflow-hidden",
                    !isRevealed && "max-h-0",
                    isRevealed && "max-h-[600px]",
                    "transition-[max-height] duration-1000 ease-out"
                )}>
                    <img
                        src={imageUrl}
                        alt={prompt}
                        onLoad={() => setIsLoaded(true)}
                        onError={() => setError(true)}
                        className={cn(
                            "w-full max-w-lg object-contain",
                            "transition-opacity duration-500",
                            isRevealed ? "opacity-100" : "opacity-0"
                        )}
                    />
                </div>

                {/* Reveal gradient overlay (during animation) */}
                {isLoaded && !isRevealed && (
                    <div className={cn(
                        "absolute inset-0",
                        "bg-gradient-to-b from-transparent via-transparent to-muted",
                        "pointer-events-none"
                    )} />
                )}
            </div>

            {/* Action buttons - shown on hover */}
            {isRevealed && (
                <div className={cn(
                    "absolute top-2 right-2",
                    "flex items-center gap-1",
                    "opacity-0 group-hover:opacity-100",
                    "transition-opacity duration-200"
                )}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-background/80 backdrop-blur-sm"
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
                                className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                                onClick={handleOpenExternal}
                            >
                                <IconExternalLink size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open in new tab</TooltipContent>
                    </Tooltip>
                </div>
            )}

            {/* Image info footer */}
            {isRevealed && (
                <div className={cn(
                    "mt-2 flex items-center justify-between",
                    "text-xs text-muted-foreground/70"
                )}>
                    <span className="truncate max-w-[80%]" title={prompt}>
                        {prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt}
                    </span>
                    <span className="shrink-0">
                        {size && size !== 'auto' ? size : '1024×1024'}
                    </span>
                </div>
            )}
        </div>
    )
})
