// File upload hook for desktop app with base64 conversion for Claude API
// Local-only approach - no Supabase storage needed
import { useState, useCallback } from 'react'

export type UploadStatus = 'pending' | 'compressing' | 'ready' | 'error'

export interface UploadedImage {
  id: string
  filename: string
  url: string // blob URL for preview
  base64Data?: string // base64 encoded data for API
  isLoading: boolean
  mediaType?: string // MIME type e.g. "image/png", "image/jpeg"
  originalSize?: number // Original file size in bytes
  compressedSize?: number // Compressed size in bytes
  status?: UploadStatus // Upload status for progress tracking
  compressionRatio?: number // e.g., 5.2 means 5.2x smaller
}

export interface UploadedFile {
  id: string
  filename: string
  url: string
  isLoading: boolean
  size?: number
  type?: string
  base64Data?: string
}

// Image compression settings
const COMPRESSION_CONFIG = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.75, // 0.0 to 1.0
  outputType: 'image/webp' as const // WebP for best compression
}

/**
 * Compress an image using Canvas API
 * This runs in the browser and reduces file size before sending to main process
 */
async function compressImage(file: File): Promise<{ base64: string; mimeType: string; originalSize: number; compressedSize: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    img.onload = () => {
      URL.revokeObjectURL(url)
      
      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img
      const { maxWidth, maxHeight } = COMPRESSION_CONFIG
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      
      // Create canvas and draw resized image
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }
      
      // Use high quality image smoothing
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)
      
      // Convert to WebP with compression
      const dataUrl = canvas.toDataURL(COMPRESSION_CONFIG.outputType, COMPRESSION_CONFIG.quality)
      const base64 = dataUrl.split(',')[1]
      const compressedSize = Math.round((base64.length * 3) / 4)
      
      console.log(`[useFileUpload] Compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressedSize / 1024).toFixed(0)}KB (${(file.size / compressedSize).toFixed(1)}x smaller)`)
      
      resolve({
        base64,
        mimeType: COMPRESSION_CONFIG.outputType,
        originalSize: file.size,
        compressedSize
      })
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    
    img.src = url
  })
}

/**
 * Convert a File to base64 data (for non-image files)
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove the data:image/xxx;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64 || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const MAX_FILES = 5
const MAX_SIZE = 20 * 1024 * 1024 // 20MB (we compress anyway)

export function useFileUpload() {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [compressionStats, setCompressionStats] = useState<{
    totalOriginal: number
    totalCompressed: number
    filesProcessed: number
  } | null>(null)

  const handleAddAttachments = useCallback(async (inputFiles: File[]) => {
    if (images.length >= MAX_FILES) return
    
    setIsUploading(true)
    setCompressionStats(null)

    const imageFiles = inputFiles.filter((f) => f.type.startsWith('image/'))
    const otherFiles = inputFiles.filter((f) => !f.type.startsWith('image/'))

    // Limit total images
    const availableSlots = MAX_FILES - images.length
    const filesToProcess = imageFiles.slice(0, availableSlots)

    // Add placeholder images immediately with 'compressing' status
    const placeholders: UploadedImage[] = filesToProcess.map((file) => ({
      id: crypto.randomUUID(),
      filename: file.name,
      url: URL.createObjectURL(file),
      isLoading: true,
      status: 'compressing' as UploadStatus,
      originalSize: file.size,
    }))
    
    setImages((prev) => [...prev, ...placeholders])

    // Process images with compression (update each as it completes)
    let totalOriginal = 0
    let totalCompressed = 0
    
    await Promise.all(
      filesToProcess.map(async (file, index): Promise<void> => {
        const placeholderId = placeholders[index].id
        
        // Validate file size
        if (file.size > MAX_SIZE) {
          console.warn(`[useFileUpload] File ${file.name} exceeds ${MAX_SIZE / 1024 / 1024}MB limit`)
          setImages((prev) => prev.map((img) => 
            img.id === placeholderId 
              ? { ...img, isLoading: false, status: 'error' as UploadStatus }
              : img
          ))
          return
        }

        // Compress image in browser before sending to main process
        let base64Data: string | undefined
        let mediaType = file.type || 'image/png'
        let filename = file.name || `screenshot-${Date.now()}.png`
        let originalSize = file.size
        let compressedSize = file.size
        let compressionRatio = 1
        
        try {
          const compressed = await compressImage(file)
          base64Data = compressed.base64
          mediaType = compressed.mimeType
          originalSize = compressed.originalSize
          compressedSize = compressed.compressedSize
          compressionRatio = originalSize / compressedSize
          
          // Track stats
          totalOriginal += originalSize
          totalCompressed += compressedSize
          
          // Update filename extension to .webp
          const baseName = filename.replace(/\.[^/.]+$/, '')
          filename = `${baseName}.webp`
        } catch (err) {
          console.warn('[useFileUpload] Compression failed, using original:', err)
          // Fallback to original file
          try {
            base64Data = await fileToBase64(file)
            totalOriginal += file.size
            totalCompressed += file.size
          } catch (err2) {
            console.error('[useFileUpload] Failed to convert image to base64:', err2)
            setImages((prev) => prev.map((img) => 
              img.id === placeholderId 
                ? { ...img, isLoading: false, status: 'error' as UploadStatus }
                : img
            ))
            return
          }
        }

        // Update the placeholder with the processed image
        setImages((prev) => prev.map((img) => 
          img.id === placeholderId 
            ? {
                ...img,
                filename,
                base64Data,
                isLoading: false,
                mediaType,
                originalSize,
                compressedSize,
                status: 'ready' as UploadStatus,
                compressionRatio,
              }
            : img
        ))
      })
    )
    
    // Set final compression stats
    if (totalOriginal > 0) {
      setCompressionStats({
        totalOriginal,
        totalCompressed,
        filesProcessed: filesToProcess.length,
      })
    }

    const newFiles: UploadedFile[] = await Promise.all(
      otherFiles.map(async (file): Promise<UploadedFile> => {
        let base64Data: string | undefined
        try {
          base64Data = await fileToBase64(file)
        } catch (err) {
          console.error('[useFileUpload] Failed to convert file to base64:', err)
        }

        return {
          id: crypto.randomUUID(),
          filename: file.name,
          url: URL.createObjectURL(file),
          isLoading: false,
          size: file.size,
          type: file.type,
          base64Data,
        }
      })
    )

    setFiles((prev) => [...prev, ...newFiles])
    setIsUploading(false)
  }, [images.length])

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find(i => i.id === id)
      if (img?.url) {
        URL.revokeObjectURL(img.url) // Clean up blob URL
      }
      return prev.filter((img) => img.id !== id)
    })
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find(f => f.id === id)
      if (file?.url) {
        URL.revokeObjectURL(file.url)
      }
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  const clearImages = useCallback(() => {
    // Clean up all blob URLs
    images.forEach(img => {
      if (img.url) URL.revokeObjectURL(img.url)
    })
    setImages([])
  }, [images])

  const clearFiles = useCallback(() => {
    files.forEach(file => {
      if (file.url) URL.revokeObjectURL(file.url)
    })
    setFiles([])
  }, [files])

  const clearAll = useCallback(() => {
    clearImages()
    clearFiles()
  }, [clearImages, clearFiles])

  return {
    images,
    files,
    handleAddAttachments,
    removeImage,
    removeFile,
    clearImages,
    clearFiles,
    clearAll,
    isUploading,
    compressionStats,
    maxFiles: MAX_FILES,
    maxSize: MAX_SIZE,
  }
}
