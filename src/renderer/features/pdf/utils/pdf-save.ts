import { supabase } from '@/lib/supabase'
import type { PdfSource } from '@/lib/atoms'
import { isElectron } from '@/lib/utils'

/**
 * Save PDF with annotations
 * Handles both local files and cloud files (Supabase storage)
 */
export async function savePdfWithAnnotations(
  pdfArrayBuffer: ArrayBuffer,
  source: PdfSource
): Promise<{ success: boolean; error?: string }> {
  try {
    if (source.type === 'local' && source.metadata?.localPath) {
      // Save to local file system via Electron IPC
      return await saveToLocalFile(pdfArrayBuffer, source.metadata.localPath)
    } else if (source.type === 'chat_file' || source.type === 'artifact') {
      // Save to Supabase storage
      return await saveToSupabase(pdfArrayBuffer, source)
    } else {
      return {
        success: false,
        error: 'External PDFs cannot be saved with annotations'
      }
    }
  } catch (error) {
    console.error('[PDF Save] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Save to local file system (Electron only)
 */
async function saveToLocalFile(
  pdfArrayBuffer: ArrayBuffer,
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  if (!isElectron()) {
    return { success: false, error: 'Not running in Electron' }
  }

  try {
    // Convert ArrayBuffer to Uint8Array
    const uint8Array = new Uint8Array(pdfArrayBuffer)

    // Use Electron IPC to write file
    // @ts-expect-error - Electron IPC API
    const result = await window.electron.writeFile(filePath, uint8Array)

    if (result.success) {
      console.log('[PDF Save] Saved to local file:', filePath)
      return { success: true }
    } else {
      return { success: false, error: result.error || 'Failed to write file' }
    }
  } catch (error) {
    console.error('[PDF Save] Local save error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save file'
    }
  }
}

/**
 * Save to Supabase storage
 */
async function saveToSupabase(
  pdfArrayBuffer: ArrayBuffer,
  source: PdfSource
): Promise<{ success: boolean; error?: string }> {
  try {
    // Determine storage path and bucket
    let storagePath: string
    let bucket: string

    if (source.type === 'chat_file') {
      // Chat files are stored in 'chat-files' bucket
      bucket = 'chat-files'
      // Extract path from URL or use chat_id/filename pattern
      storagePath = source.id // Assuming ID is the storage path
    } else if (source.type === 'artifact') {
      // Artifacts are stored in 'artifacts' bucket
      bucket = 'artifacts'
      storagePath = `${source.id}.pdf`
    } else {
      return { success: false, error: 'Invalid source type for Supabase storage' }
    }

    // Convert ArrayBuffer to Blob
    const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })

    // Upload to Supabase storage (will overwrite existing file)
    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, blob, {
        cacheControl: '3600',
        upsert: true // Overwrite if exists
      })

    if (error) {
      console.error('[PDF Save] Supabase upload error:', error)
      return { success: false, error: error.message }
    }

    console.log('[PDF Save] Saved to Supabase:', bucket, storagePath)
    return { success: true }
  } catch (error) {
    console.error('[PDF Save] Supabase save error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload to storage'
    }
  }
}

/**
 * Export PDF with annotations as download
 */
export function downloadPdf(pdfArrayBuffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
