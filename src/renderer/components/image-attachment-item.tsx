import { useState, useEffect, useCallback } from 'react'
import { IconX, IconLoader2, IconPhotoOff, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

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
}

export function ImageAttachmentItem({
  id,
  filename,
  url,
  isLoading = false,
  onRemove,
  allImages,
  imageIndex = 0,
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
        className="relative inline-block"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isLoading ? (
          <span className="size-8 flex items-center justify-center bg-muted rounded">
            <IconLoader2 size={16} className="text-muted-foreground animate-spin" />
          </span>
        ) : hasError ? (
          <span 
            className="size-8 flex items-center justify-center bg-muted/50 rounded border border-destructive/20" 
            title="Failed to load image"
          >
            <IconPhotoOff size={16} className="text-destructive/50" />
          </span>
        ) : url ? (
          <button
            type="button"
            onClick={openFullscreen}
            className="size-8 p-0 bg-transparent border-0 rounded cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
            aria-label={`View ${filename}`}
          >
            <img
              src={url}
              alt={filename}
              className="size-8 object-cover rounded"
              onError={handleImageError}
            />
          </button>
        ) : (
          <span className="size-8 bg-muted rounded flex items-center justify-center">
            <IconLoader2 size={16} className="text-muted-foreground animate-spin" />
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
