import { useState, useEffect, useCallback } from 'react'
import { IconX, IconLoader2, IconPhotoOff, IconChevronLeft, IconChevronRight, IconPhoto } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { CursorTooltip } from './ui/cursor-tooltip'

interface ImageData {
  id: string
  filename: string
  url: string
}

interface ImageAttachmentItemProps {
  id: string
  filename: string
  url: string
  isLoading?: boolean
  onRemove?: () => void
  /** All images in the group for gallery navigation */
  allImages?: ImageData[]
  /** Index of this image in the group */
  imageIndex?: number
  /** Original file size in bytes */
  originalSize?: number
  /** Compressed file size in bytes */
  compressedSize?: number
  /** Compression ratio (e.g., 5.2 means 5.2x smaller) */
  compressionRatio?: number
  /** Upload status */
  status?: 'pending' | 'compressing' | 'ready' | 'error'
}

/** Format bytes to human readable string */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ImageAttachmentItem({
  id,
  filename,
  url,
  isLoading = false,
  onRemove,
  allImages,
  imageIndex = 0,
  originalSize,
  compressedSize,
  compressionRatio,
  status = 'ready',
}: ImageAttachmentItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(imageIndex)

  // Use allImages if provided, otherwise create single-image array
  const images = allImages || [{ id, filename, url }]
  const hasMultipleImages = images.length > 1
  const currentImage = images[currentIndex] || images[0]

  const handleImageError = () => {
    console.warn('[ImageAttachmentItem] Failed to load image:', filename, url)
    setHasError(true)
  }

  const openFullscreen = () => {
    setCurrentIndex(imageIndex)
    setIsFullscreen(true)
  }

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false)
  }, [])

  const goToPrevious = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }, [images.length])

  const goToNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }, [images.length])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          closeFullscreen()
          break
        case 'ArrowLeft':
          if (hasMultipleImages) goToPrevious()
          break
        case 'ArrowRight':
          if (hasMultipleImages) goToNext()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, hasMultipleImages, closeFullscreen, goToPrevious, goToNext])

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: hover state container */}
      <span
        role="img"
        aria-label={filename}
        className="relative inline-block group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Compressing status */}
        {status === 'compressing' || isLoading ? (
          <span className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent/50 border border-border/50">
            <span className="size-10 flex items-center justify-center bg-muted rounded overflow-hidden">
              {url ? (
                <img src={url} alt="" className="size-10 object-cover opacity-50" />
              ) : (
                <IconPhoto size={18} className="text-muted-foreground/50" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                <IconLoader2 size={16} className="text-white animate-spin" />
              </span>
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-xs font-medium truncate max-w-[100px]">{filename}</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="animate-pulse">Compressing...</span>
                {originalSize && <span className="text-muted-foreground/60">{formatBytes(originalSize)}</span>}
              </span>
            </span>
          </span>
        ) : status === 'error' || hasError ? (
          <span 
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20" 
            title="Failed to process image"
          >
            <span className="size-10 flex items-center justify-center bg-muted/50 rounded">
              <IconPhotoOff size={18} className="text-destructive/50" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-xs font-medium truncate max-w-[100px] text-destructive">{filename}</span>
              <span className="text-[10px] text-destructive/70">Failed to process</span>
            </span>
          </span>
         ) : url ? (
           <CursorTooltip
             content={
               <div className="space-y-2">
                 <div className="flex items-start justify-between gap-4">
                   <div className="space-y-1 flex-1 min-w-0">
                     <p className="font-medium text-foreground break-all">{filename}</p>
                     <p className="text-xs text-muted-foreground">{filename.split('.').pop()?.toUpperCase()} Image</p>
                   </div>
                   {hasMultipleImages && (
                     <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                       {imageIndex + 1} / {allImages?.length || 1}
                     </span>
                   )}
                 </div>
                 {(compressedSize || originalSize) && (
                   <div className="pt-1 border-t border-border/50 space-y-1">
                     {originalSize && (
                       <div className="flex items-center justify-between text-xs">
                         <span className="text-muted-foreground">Original:</span>
                         <span className="text-foreground">{formatBytes(originalSize)}</span>
                       </div>
                     )}
                     {compressedSize && (
                       <div className="flex items-center justify-between text-xs">
                         <span className="text-muted-foreground">Optimized:</span>
                         <span className="text-green-600 font-medium">{formatBytes(compressedSize)}</span>
                       </div>
                     )}
                      {originalSize && compressedSize && compressionRatio && compressionRatio > 1.1 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Saved:</span>
                          <span className="text-green-600 font-medium">
                            {formatBytes(originalSize - compressedSize)} ({((1 - compressedSize / originalSize) * 100).toFixed(0)}%)
                          </span>
                        </div>
                      )}
                   </div>
                 )}
               </div>
             }
           >
             <button
               type="button"
               onClick={openFullscreen}
               className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent/50 border border-border/50 hover:border-primary/50 hover:bg-accent transition-all cursor-pointer"
               aria-label={`View ${filename}`}
             >
               <span className="size-10 flex items-center justify-center bg-muted rounded overflow-hidden shrink-0">
                 <img
                   src={url}
                   alt={filename}
                   className="size-10 object-cover"
                   onError={handleImageError}
                 />
               </span>
               <span className="flex flex-col gap-0.5 min-w-0">
                 <span className="text-xs font-medium truncate max-w-[100px]">{filename}</span>
                 {compressedSize && originalSize && compressionRatio && compressionRatio > 1.1 ? (
                   <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                     <span className="line-through opacity-50">{formatBytes(originalSize)}</span>
                     <span className="text-green-500 font-medium">→ {formatBytes(compressedSize)}</span>
                     <span className="text-green-500/70 text-[9px]">({compressionRatio.toFixed(1)}x)</span>
                   </span>
                 ) : compressedSize ? (
                   <span className="text-[10px] text-muted-foreground">{formatBytes(compressedSize)}</span>
                 ) : null}
               </span>
             </button>
           </CursorTooltip>
        ) : (
          <span className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent/50 border border-border/50">
            <span className="size-10 bg-muted rounded flex items-center justify-center">
              <IconLoader2 size={16} className="text-muted-foreground animate-spin" />
            </span>
            <span className="text-xs text-muted-foreground">Loading...</span>
          </span>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className={cn(
              'absolute -top-1.5 -right-1.5 size-4 rounded-full bg-background border border-border',
              'flex items-center justify-center transition-all duration-150 z-10',
              'text-muted-foreground hover:text-foreground hover:bg-muted',
              isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
            )}
          >
            <IconX size={10} />
          </button>
        )}
      </span>

      {/* Fullscreen overlay with gallery navigation */}
      {isFullscreen && currentImage?.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image gallery"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
        >
          {/* Backdrop button for closing */}
          <button
            type="button"
            onClick={closeFullscreen}
            className="absolute inset-0 w-full h-full bg-transparent border-0 cursor-default"
            aria-label="Close gallery"
          />

          {/* Close button */}
          <button
            type="button"
            onClick={closeFullscreen}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
            aria-label="Close fullscreen (Esc)"
          >
            <IconX size={24} />
          </button>

          {/* Previous button */}
          {hasMultipleImages && (
            <button
              type="button"
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
              aria-label="Previous image"
            >
              <IconChevronLeft size={32} />
            </button>
          )}

          {/* Image */}
          <img
            src={currentImage.url}
            alt={currentImage.filename}
            className="max-w-[90vw] max-h-[85vh] object-contain relative z-[5]"
          />

          {/* Next button */}
          {hasMultipleImages && (
            <button
              type="button"
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white z-10"
              aria-label="Next image"
            >
              <IconChevronRight size={32} />
            </button>
          )}

          {/* Image counter and dots */}
          {hasMultipleImages && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10">
              {/* Dots indicator */}
              <div className="flex gap-2">
                {images.map((img, idx) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCurrentIndex(idx)
                    }}
                    className={cn(
                      'size-2 rounded-full transition-all',
                      idx === currentIndex
                        ? 'bg-white scale-125'
                        : 'bg-white/40 hover:bg-white/60'
                    )}
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
              {/* Counter text */}
              <span className="text-white/70 text-sm">
                {currentIndex + 1} / {images.length}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  )
}
