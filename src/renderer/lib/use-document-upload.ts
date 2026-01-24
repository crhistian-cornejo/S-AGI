/**
 * Hook for uploading documents to OpenAI Vector Store for file search
 * Handles PDF, Word, text files and code files
 */
import { useState, useCallback } from 'react'
import { trpc } from './trpc'

export interface UploadedDocument {
    id: string
    filename: string
    status: 'uploading' | 'processing' | 'completed' | 'failed'
    bytes?: number
    createdAt?: number
    error?: string
}

export interface VectorStoreFile {
    id: string
    fileId?: string
    filename: string
    status: string
    bytes: number
    createdAt: number
}

// Supported file extensions for OpenAI file search
const SUPPORTED_EXTENSIONS = [
    '.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.json',
    '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.py', '.java',
    '.c', '.cpp', '.cs', '.go', '.rb', '.php', '.sh', '.tex', '.pptx'
]

// Max file size: 512MB (OpenAI limit)
const MAX_FILE_SIZE = 512 * 1024 * 1024

// Concurrency limit for faster uploads without overwhelming the API
const MAX_CONCURRENT_UPLOADS = 2

/**
 * Convert a File to base64 data
 */
async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
            const result = reader.result as string
            // Remove the data:xxx;base64, prefix
            const base64 = result.split(',')[1]
            resolve(base64 || '')
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

/**
 * Check if a file is supported for file search
 */
export function isDocumentSupported(file: File): boolean {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()
    return SUPPORTED_EXTENSIONS.includes(extension)
}

/**
 * Get the accept string for file input
 */
export function getDocumentAcceptTypes(): string {
    return SUPPORTED_EXTENSIONS.join(',')
}

interface UseDocumentUploadOptions {
    chatId: string | null
}

export function useDocumentUpload({ chatId }: UseDocumentUploadOptions) {
    const [documents, setDocuments] = useState<UploadedDocument[]>([])
    const [isUploading, setIsUploading] = useState(false)
    
    // SECURITY: Credentials are managed in main process only - just check status
    const { data: apiKeyStatus } = trpc.settings.getApiKeyStatus.useQuery()
    const hasApiKey = apiKeyStatus?.hasOpenAI || false

    // Query to list existing files in the vector store
    // API key is fetched by main process from credential manager
    const { data: filesData, refetch: refetchFiles } = trpc.files.listForChat.useQuery(
        { chatId: chatId! },
        { enabled: !!chatId && hasApiKey }
    )

    // Mutation to upload files
    const uploadMutation = trpc.files.uploadForChat.useMutation({
        onSuccess: () => {
            refetchFiles()
        }
    })

    // Mutation to delete files
    const deleteMutation = trpc.files.deleteFile.useMutation({
        onSuccess: () => {
            refetchFiles()
        }
    })

    /**
     * Upload multiple documents
     */
    const uploadDocuments = useCallback(async (files: File[]) => {
        if (!chatId) {
            console.error('[useDocumentUpload] Missing chatId')
            throw new Error('No chat selected. Please select or create a chat first.')
        }
        
        if (!hasApiKey) {
            console.error('[useDocumentUpload] Missing OpenAI API key')
            throw new Error('OpenAI API key not configured. Please add your API key in Settings to upload documents.')
        }

        setIsUploading(true)

        const runWithConcurrency = async <T,>(items: T[], limit: number, worker: (item: T) => Promise<void>) => {
            const queue = [...items]
            const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
                while (queue.length > 0) {
                    const item = queue.shift()
                    if (!item) return
                    await worker(item)
                }
            })
            await Promise.all(workers)
        }

        const processFile = async (file: File) => {
            // Validate file
            if (!isDocumentSupported(file)) {
                const ext = '.' + file.name.split('.').pop()?.toLowerCase()
                console.warn(`[useDocumentUpload] Unsupported file type: ${ext}`)
                setDocuments(prev => [...prev, {
                    id: crypto.randomUUID(),
                    filename: file.name,
                    status: 'failed',
                    error: `Unsupported file type: ${ext}`
                }])
                return
            }

            if (file.size > MAX_FILE_SIZE) {
                console.warn(`[useDocumentUpload] File too large: ${file.name}`)
                setDocuments(prev => [...prev, {
                    id: crypto.randomUUID(),
                    filename: file.name,
                    status: 'failed',
                    error: 'File exceeds 512MB limit'
                }])
                return
            }

            // Add to local state as uploading
            const docId = crypto.randomUUID()
            const doc: UploadedDocument = {
                id: docId,
                filename: file.name,
                status: 'uploading',
                bytes: file.size
            }
            setDocuments(prev => [...prev, doc])

            try {
                // Convert to base64
                const base64Data = await fileToBase64(file)

                // Upload via tRPC - API key is fetched by main process from credential manager
                const result = await uploadMutation.mutateAsync({
                    chatId,
                    fileName: file.name,
                    fileBase64: base64Data
                })

                // Update status to processing
                setDocuments(prev => prev.map(d => 
                    d.id === docId 
                        ? { ...d, id: result.fileId, status: 'processing' as const }
                        : d
                ))

                console.log('[useDocumentUpload] File uploaded, processing:', result.fileId)

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Upload failed'
                console.error('[useDocumentUpload] Upload error:', error)
                setDocuments(prev => prev.map(d => 
                    d.id === docId 
                        ? { ...d, status: 'failed' as const, error: errorMessage }
                        : d
                ))
            }
        }

        await runWithConcurrency(files, MAX_CONCURRENT_UPLOADS, processFile)
        setIsUploading(false)
    }, [chatId, hasApiKey, uploadMutation])

    /**
     * Delete a document from the vector store
     */
    const deleteDocument = useCallback(async (fileId: string) => {
        if (!chatId || !hasApiKey) return

        try {
            // API key is fetched by main process from credential manager
            await deleteMutation.mutateAsync({
                chatId,
                fileId
            })
            
            // Remove from local state
            setDocuments(prev => prev.filter(d => d.id !== fileId))
        } catch (error) {
            console.error('[useDocumentUpload] Delete error:', error)
        }
    }, [chatId, hasApiKey, deleteMutation])

    /**
     * Clear local document state
     */
    const clearDocuments = useCallback(() => {
        setDocuments([])
    }, [])

    // Merge local uploading documents with server files
    const allFiles: VectorStoreFile[] = filesData?.files || []

    // Filter out documents that are already in the server response
    // Also check if the document is now in the server files (by filename match)
    const serverFilenames = new Set(allFiles.map(f => f.filename))
    const uploadingDocs = documents.filter(d => {
        // Keep failed documents
        if (d.status === 'failed') return true
        // Keep uploading documents
        if (d.status === 'uploading') return true
        // For processing documents, only keep if NOT yet in server
        if (d.status === 'processing') {
            return !serverFilenames.has(d.filename)
        }
        return false
    })

    // Check if any documents are still processing (for UI blocking)
    const hasProcessingDocuments = uploadingDocs.some(d =>
        d.status === 'uploading' || d.status === 'processing'
    )

    return {
        // Server files from vector store
        files: allFiles,
        vectorStoreId: filesData?.vectorStoreId,
        
        // Local uploading documents
        uploadingDocuments: uploadingDocs,
        
        // Actions
        uploadDocuments,
        deleteDocument,
        clearDocuments,
        refetchFiles,
        
        // State
        isUploading: isUploading || uploadMutation.isPending,
        isDeleting: deleteMutation.isPending,
        hasProcessingDocuments, // True if any docs still uploading/processing
        
        // Helpers
        isSupported: isDocumentSupported,
        acceptTypes: getDocumentAcceptTypes(),
        maxFileSize: MAX_FILE_SIZE,
        supportedExtensions: SUPPORTED_EXTENSIONS
    }
}
