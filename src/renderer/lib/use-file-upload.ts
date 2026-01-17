// File upload hook for desktop app with base64 conversion for Claude API
// Local-only approach - no Supabase storage needed
import { useState, useCallback } from 'react'

export interface UploadedImage {
  id: string
  filename: string
  url: string // blob URL for preview
  base64Data?: string // base64 encoded data for API
  isLoading: boolean
  mediaType?: string // MIME type e.g. "image/png", "image/jpeg"
}

export interface UploadedFile {
  id: string
  filename: string
  url: string
  isLoading: boolean
  size?: number
  type?: string
}

/**
 * Convert a File to base64 data
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
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export function useFileUpload() {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const handleAddAttachments = useCallback(async (inputFiles: File[]) => {
    if (images.length >= MAX_FILES) return
    
    setIsUploading(true)

    const imageFiles = inputFiles.filter((f) => f.type.startsWith('image/'))
    const otherFiles = inputFiles.filter((f) => !f.type.startsWith('image/'))

    // Limit total images
    const availableSlots = MAX_FILES - images.length
    const filesToProcess = imageFiles.slice(0, availableSlots)

    // Process images with base64 conversion
    const newImages = await Promise.all(
      filesToProcess.map(async (file): Promise<UploadedImage | null> => {
        // Validate file size
        if (file.size > MAX_SIZE) {
          console.warn(`[useFileUpload] File ${file.name} exceeds ${MAX_SIZE / 1024 / 1024}MB limit`)
          return null
        }

        const id = crypto.randomUUID()
        const filename = file.name || `screenshot-${Date.now()}.png`
        const mediaType = file.type || 'image/png'
        const url = URL.createObjectURL(file)
        
        // Convert to base64 for API
        let base64Data: string | undefined
        try {
          base64Data = await fileToBase64(file)
        } catch (err) {
          console.error('[useFileUpload] Failed to convert image to base64:', err)
        }

        return {
          id,
          filename,
          url,
          base64Data,
          isLoading: false,
          mediaType,
        }
      })
    )

    // Filter out null entries (failed validations)
    const validImages = newImages.filter((img): img is UploadedImage => img !== null)

    const newFiles: UploadedFile[] = otherFiles.map((file) => ({
      id: crypto.randomUUID(),
      filename: file.name,
      url: URL.createObjectURL(file),
      isLoading: false,
      size: file.size,
      type: file.type,
    }))

    setImages((prev) => [...prev, ...validImages])
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
    maxFiles: MAX_FILES,
    maxSize: MAX_SIZE,
  }
}
