import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { OpenAIFileService } from '../../ai'
import log from 'electron-log'
import { supabase } from '../../supabase/client'
import { quickHash, hashBuffer } from '../../security/encryption'
import {
    processDocument,
    isProcessableDocument,
    searchWithCitations,
    formatCitation,
    type ProcessingStatus,
    type DocumentMetadata,
    type PageContent
} from '../../documents/document-processor'
import { getCredentialManager } from '../../shared/credentials'

// Supported file types for OpenAI file search
const SUPPORTED_FILE_TYPES = [
    '.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.json',
    '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.py', '.java',
    '.c', '.cpp', '.cs', '.go', '.rb', '.php', '.sh', '.tex', '.pptx'
]

const SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/css',
    'text/javascript',
    'application/json',
    'application/typescript',
    'text/x-python',
    'text/x-java',
    'text/x-c',
    'text/x-c++',
    'text/x-csharp',
    'text/x-golang',
    'text/x-ruby',
    'text/x-php',
    'application/x-sh',
    'text/x-tex'
]

// Processing status type for tracking file processing state
type FileProcessingStatus = ProcessingStatus

export const filesRouter = router({
    /**
     * Upload a file to OpenAI and attach it to the chat's vector store
     * Includes duplicate detection to prevent uploading the same file multiple times
     */
    uploadForChat: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            fileName: z.string(),
            fileBase64: z.string(), // Send file as base64 from renderer
            apiKey: z.string().optional() // SECURITY: Now fetched from credential manager if not provided
        }))
        .mutation(async ({ ctx, input }) => {
            try {
                // SECURITY: Get API key from credential manager if not provided
                let apiKey: string | undefined = input.apiKey
                if (!apiKey) {
                    const credentialManager = getCredentialManager()
                    const storedKey = await credentialManager.getOpenAIKey()
                    apiKey = storedKey ?? undefined
                }

                log.info('[FilesRouter] uploadForChat called:', {
                    chatId: input.chatId,
                    fileName: input.fileName,
                    apiKeyLength: apiKey?.length || 0,
                    userId: ctx.userId,
                    apiKeySource: input.apiKey ? 'provided' : 'credential_manager'
                })

                if (!apiKey) {
                    throw new Error('OpenAI API key is required for file upload')
                }
                
                // Calculate file size and hash for duplicate check
                const buffer = Buffer.from(input.fileBase64, 'base64')
                const fileSize = buffer.length

                // Generate content hash for true deduplication (Midday-style)
                // Use quickHash for large files, full hash for small files
                const fileHash = fileSize > 1024 * 1024
                    ? quickHash(buffer)
                    : hashBuffer(buffer)

                log.info('[FilesRouter] File hash generated:', {
                    fileName: input.fileName,
                    fileSize,
                    hashMethod: fileSize > 1024 * 1024 ? 'quick' : 'full',
                    hash: fileHash.substring(0, 16) + '...'
                })

                // CHECK FOR DUPLICATES: Using content hash (more accurate than filename + size)
                const { data: existingByHash } = await supabase
                    .from('chat_files')
                    .select('id, openai_file_id, openai_vector_store_file_id, filename, file_hash')
                    .eq('chat_id', input.chatId)
                    .eq('file_hash', fileHash)
                    .single()

                if (existingByHash) {
                    const existingVectorStoreFileId = existingByHash.openai_vector_store_file_id || existingByHash.openai_file_id
                    log.info('[FilesRouter] Duplicate file detected by hash, skipping upload:', {
                        fileName: input.fileName,
                        existingFileName: existingByHash.filename,
                        existingFileId: existingVectorStoreFileId
                    })
                    return {
                        success: true,
                        fileId: existingVectorStoreFileId,
                        openaiFileId: existingByHash.openai_file_id,
                        vectorStoreId: null,
                        skipped: true,
                        reason: 'duplicate_hash'
                    }
                }

                // Fallback: Check by filename + size for backwards compatibility
                const { data: existingFile } = await supabase
                    .from('chat_files')
                    .select('id, openai_file_id, openai_vector_store_file_id, filename')
                    .eq('chat_id', input.chatId)
                    .eq('filename', input.fileName)
                    .eq('file_size', fileSize)
                    .single()

                if (existingFile) {
                    const existingVectorStoreFileId = existingFile.openai_vector_store_file_id || existingFile.openai_file_id
                    log.info('[FilesRouter] Duplicate file detected by name+size, skipping upload:', {
                        fileName: input.fileName,
                        existingFileId: existingVectorStoreFileId
                    })
                    return {
                        success: true,
                        fileId: existingVectorStoreFileId,
                        openaiFileId: existingFile.openai_file_id,
                        vectorStoreId: null,
                        skipped: true,
                        reason: 'duplicate'
                    }
                }
                
                const service = new OpenAIFileService({ apiKey })

                // 1. Get or create vector store
                log.info('[FilesRouter] Getting or creating vector store...')
                const vectorStoreId = await service.getOrCreateVectorStore(input.chatId, ctx.userId)
                log.info('[FilesRouter] Vector store ID:', vectorStoreId)
                
                // Note: buffer already decoded above for duplicate check

                // 3. Determine content type from file extension
                const ext = input.fileName.split('.').pop()?.toLowerCase() || ''
                const mimeTypes: Record<string, string> = {
                    'pdf': 'application/pdf',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'txt': 'text/plain',
                    'md': 'text/markdown',
                    'csv': 'text/csv',
                    'json': 'application/json',
                    'html': 'text/html',
                    'css': 'text/css',
                    'js': 'text/javascript',
                    'ts': 'text/typescript',
                    'tsx': 'text/typescript',
                    'jsx': 'text/javascript',
                    'py': 'text/x-python',
                    'java': 'text/x-java',
                    'c': 'text/x-c',
                    'cpp': 'text/x-c++',
                    'cs': 'text/x-csharp',
                    'go': 'text/x-go',
                    'rb': 'text/x-ruby',
                    'php': 'text/x-php',
                    'sh': 'application/x-sh',
                    'tex': 'text/x-tex'
                }
                const contentType = mimeTypes[ext] || 'application/octet-stream'
                log.info('[FilesRouter] File content type:', { fileName: input.fileName, ext, contentType })

                // 4. Upload to Supabase Storage (Persistence)
                // Sanitize filename for storage path (remove special characters, spaces, etc.)
                const sanitizeForPath = (name: string): string => {
                    return name
                        .normalize('NFD') // Decompose accented characters
                        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
                        .replace(/[°º]/g, '') // Remove degree symbols
                        .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace other special chars with underscore
                        .replace(/_+/g, '_') // Collapse multiple underscores
                        .replace(/^_|_$/g, '') // Trim underscores
                }
                
                const timestamp = Date.now()
                const randomId = Math.random().toString(36).substring(2, 15)
                const sanitizedFileName = sanitizeForPath(input.fileName)
                const storagePath = `${ctx.userId}/chat-files/${timestamp}-${randomId}-${sanitizedFileName}`
                
                log.info('[FilesRouter] Storage path:', { original: input.fileName, sanitized: sanitizedFileName, path: storagePath })

                const { error: uploadError } = await supabase.storage
                    .from('attachments')
                    .upload(storagePath, buffer, {
                        contentType,
                        upsert: false
                    })

                if (uploadError) {
                    log.error('[FilesRouter] Storage upload failed:', uploadError)
                    throw new Error(`Failed to persist file: ${uploadError.message}`)
                }
                
                log.info('[FilesRouter] File persisted to storage:', storagePath)
                
                // 5. Upload to OpenAI and attach
                const uploaded = await service.uploadAndAttachFile(vectorStoreId, buffer, input.fileName)
                log.info('[FilesRouter] File uploaded to OpenAI:', uploaded)
                
                // 6. Process document for text extraction (Midday-style)
                let processingStatus: FileProcessingStatus = 'pending'
                let extractedContent: string | null = null
                let documentMetadata: DocumentMetadata | Record<string, unknown> = {}
                let documentPages: Array<{ pageNumber: number; content: string; wordCount: number }> | null = null

                // Process documents that support text extraction
                if (isProcessableDocument(contentType)) {
                    try {
                        processingStatus = 'processing'
                        log.info('[FilesRouter] Processing document for text extraction...')

                        const processed = await processDocument(buffer, input.fileName, contentType)

                        if (processed.success && processed.content) {
                            extractedContent = processed.content
                            documentMetadata = processed.metadata
                            documentPages = processed.pages || null
                            processingStatus = 'completed'
                            log.info('[FilesRouter] Document processed successfully:', {
                                wordCount: processed.metadata.wordCount,
                                language: processed.metadata.language,
                                pageCount: processed.pages?.length || 0
                            })
                        } else {
                            processingStatus = 'failed'
                            documentMetadata = { error: processed.error }
                            log.warn('[FilesRouter] Document processing failed:', processed.error)
                        }
                    } catch (procError) {
                        processingStatus = 'failed'
                        documentMetadata = { error: procError instanceof Error ? procError.message : 'Unknown error' }
                        log.error('[FilesRouter] Document processing error:', procError)
                    }
                } else {
                    // Non-processable files are marked as completed immediately
                    processingStatus = 'completed'
                }

                // 7. Save metadata to chat_files table with new fields
                const { error: dbError } = await supabase
                    .from('chat_files')
                    .insert({
                        chat_id: input.chatId,
                        user_id: ctx.userId,
                        filename: input.fileName,
                        storage_path: storagePath,
                        file_size: fileSize,
                        file_hash: fileHash,
                        openai_file_id: uploaded.fileId,
                        openai_vector_store_file_id: uploaded.vectorStoreFileId,
                        content_type: contentType,
                        processing_status: processingStatus,
                        extracted_content: extractedContent,
                        metadata: documentMetadata,
                        pages: documentPages
                    })

                if (dbError) {
                    log.error('[FilesRouter] DB insert failed:', dbError)
                    // consistency issue: file is in storage and openai but not db.
                    // Should theoretically rollup/cleanup but for now logging.
                }

                log.info('[FilesRouter] File uploaded and persisted successfully:', {
                    fileId: uploaded.fileId,
                    vectorStoreFileId: uploaded.vectorStoreFileId,
                    vectorStoreId,
                    fileName: input.fileName,
                    storagePath,
                    processingStatus,
                    hasExtractedContent: !!extractedContent
                })

                // Return vector store file id for operations, include OpenAI file id for reference
                return {
                    success: true,
                    fileId: uploaded.vectorStoreFileId,
                    vectorStoreId,
                    openaiFileId: uploaded.fileId,
                    processingStatus,
                    hasExtractedContent: !!extractedContent
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                log.error('[FilesRouter] uploadForChat error:', error)
                throw new Error(errorMessage || 'Failed to upload file to OpenAI')
            }
        }),

    /**
     * List files in a chat's vector store
     */
    listForChat: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            apiKey: z.string().optional() // SECURITY: Now optional - fetched from credential manager if needed
        }))
        .query(async ({ ctx, input }) => {
            // Get the vector store ID for context
            const { data: chat, error: chatError } = await supabase
                .from('chats')
                .select('openai_vector_store_id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()
            
            if (chatError || !chat?.openai_vector_store_id) {
                return { vectorStoreId: null, files: [] }
            }

            // Query local chat_files table for persistence
            const { data: dbFiles, error: dbError } = await supabase
                .from('chat_files')
                .select('*')
                .eq('chat_id', input.chatId)
                .order('created_at', { ascending: false })

            if (dbError) {
                log.error('[FilesRouter] Error fetching chat_files:', dbError)
                return { vectorStoreId: chat.openai_vector_store_id, files: [] }
            }

            // Map DB files to the expected format
            // If DB is empty, should we fallback to OpenAI list?
            // This might happen for old chats before this migration.
            let files: {
                id: string
                fileId?: string
                filename: string
                status: string
                bytes: number
                createdAt: number
                dbId?: string
            }[] = []
            
            if (dbFiles && dbFiles.length > 0) {
                files = dbFiles.map(f => ({
                    id: f.openai_vector_store_file_id || f.openai_file_id || f.id,
                    fileId: f.openai_file_id || undefined,
                    dbId: f.id,
                    filename: f.filename,
                    status: 'completed',
                    bytes: f.file_size || 0,
                    createdAt: new Date(f.created_at).getTime() / 1000
                }))
            } else {
                // Fallback: fetch from OpenAI if no local files found (migration/legacy support)
                try {
                    // Get API key from credential manager if not provided
                    let apiKey = input.apiKey
                    if (!apiKey) {
                        const credentialManager = getCredentialManager()
                        apiKey = await credentialManager.getOpenAIKey() ?? undefined
                    }
                    if (apiKey) {
                        const service = new OpenAIFileService({ apiKey })
                        files = await service.listVectorStoreFiles(chat.openai_vector_store_id)
                    }
                } catch (e) {
                    log.warn('[FilesRouter] Fallback to OpenAI list failed:', e)
                }
            }
            
            return { 
                vectorStoreId: chat.openai_vector_store_id,
                files
            }
        }),

    /**
     * Delete a file from a chat's vector store
     */
    deleteFile: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            fileId: z.string(),
            apiKey: z.string().optional() // SECURITY: Now optional - fetched from credential manager if needed
        }))
        .mutation(async ({ ctx, input }) => {
            const { data: chat, error } = await supabase
                .from('chats')
                .select('openai_vector_store_id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()
            
            if (error || !chat?.openai_vector_store_id) {
                throw new Error('Chat or vector store not found')
            }

            // 1. Find file in DB to get storage path + OpenAI IDs
            const { data: fileData } = await supabase
                .from('chat_files')
                .select('storage_path, openai_file_id, openai_vector_store_file_id')
                .eq('chat_id', input.chatId)
                .or(`openai_vector_store_file_id.eq.${input.fileId},openai_file_id.eq.${input.fileId}`)
                .single()

            const vectorStoreFileId = fileData?.openai_vector_store_file_id || input.fileId
            const openaiFileId = fileData?.openai_file_id || undefined

            // 2. Delete from OpenAI - get API key from credential manager if not provided
            try {
                let apiKey = input.apiKey
                if (!apiKey) {
                    const credentialManager = getCredentialManager()
                    apiKey = await credentialManager.getOpenAIKey() ?? undefined
                }
                if (apiKey) {
                    const service = new OpenAIFileService({ apiKey })
                    await service.deleteFile(chat.openai_vector_store_id, vectorStoreFileId, openaiFileId)
                } else {
                    log.warn('[FilesRouter] No OpenAI API key available for delete operation')
                }
            } catch (err) {
                log.warn('[FilesRouter] Failed to delete from OpenAI, proceeding to local delete:', err)
            }

            // 3. Delete from Storage
            if (fileData?.storage_path) {
                const { error: storageError } = await supabase.storage
                    .from('attachments')
                    .remove([fileData.storage_path])
                
                if (storageError) log.error('[FilesRouter] Failed to delete from storage:', storageError)
            }

            // 4. Delete from DB
            const { error: delError } = await supabase
                .from('chat_files')
                .delete()
                .eq('chat_id', input.chatId)
                .or(`openai_vector_store_file_id.eq.${input.fileId},openai_file_id.eq.${input.fileId}`)

            if (delError) {
                log.error('[FilesRouter] Failed to delete from DB:', delError)
            }
            
            log.info('[FilesRouter] File delete process completed:', input.fileId)
            return { success: true }
        }),

    /**
     * Get file processing status
     */
    getFileStatus: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            fileId: z.string(),
            apiKey: z.string()
        }))
        .query(async ({ ctx, input }) => {
            const { data: chat, error } = await supabase
                .from('chats')
                .select('openai_vector_store_id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()
            
            if (error || !chat?.openai_vector_store_id) {
                return { status: 'unknown' }
            }

            const { data: fileData } = await supabase
                .from('chat_files')
                .select('openai_file_id, openai_vector_store_file_id')
                .eq('chat_id', input.chatId)
                .or(`openai_vector_store_file_id.eq.${input.fileId},openai_file_id.eq.${input.fileId}`)
                .single()

            const vectorStoreFileId = fileData?.openai_vector_store_file_id || input.fileId
            const openaiFileId = fileData?.openai_file_id
            
            const service = new OpenAIFileService({ apiKey: input.apiKey })
            const status = await service.getFileStatus(chat.openai_vector_store_id, vectorStoreFileId, openaiFileId)
            
            return { status }
        }),

    /**
     * Get supported file types for file search
     */
    getSupportedTypes: protectedProcedure
        .query(() => ({
            extensions: SUPPORTED_FILE_TYPES,
            mimeTypes: SUPPORTED_MIME_TYPES
        })),

    /**
     * Debug: Get full vector store status including file processing status from OpenAI
     */
    debugVectorStore: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            apiKey: z.string()
        }))
        .query(async ({ ctx, input }) => {
            log.info('[FilesRouter] debugVectorStore called for chat:', input.chatId)
            
            // Get chat data
            const { data: chat, error: chatError } = await supabase
                .from('chats')
                .select('id, title, openai_vector_store_id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()
            
            if (chatError || !chat) {
                return { error: 'Chat not found', chat: null, vectorStore: null, files: [] }
            }

            if (!chat.openai_vector_store_id) {
                return { 
                    error: 'No vector store associated with this chat',
                    chat,
                    vectorStore: null,
                    files: []
                }
            }

            try {
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                
                // Get files from OpenAI vector store with their actual status
                const openaiFiles = await service.listVectorStoreFiles(chat.openai_vector_store_id)
                
                // Get file statuses individually for more detail
                const filesWithStatus = await Promise.all(
                    openaiFiles.map(async (file) => {
                        const status = await service.getFileStatus(chat.openai_vector_store_id, file.id, file.fileId)
                        return { ...file, openaiStatus: status }
                    })
                )
                
                // Get local DB files
                const { data: dbFiles } = await supabase
                    .from('chat_files')
                    .select('*')
                    .eq('chat_id', input.chatId)
                
                return {
                    error: null,
                    chat,
                    vectorStore: {
                        id: chat.openai_vector_store_id,
                        fileCount: openaiFiles.length
                    },
                    openaiFiles: filesWithStatus,
                    dbFiles: dbFiles || []
                }
            } catch (err) {
                log.error('[FilesRouter] debugVectorStore error:', err)
                return {
                    error: err instanceof Error ? err.message : 'Unknown error',
                    chat,
                    vectorStore: { id: chat.openai_vector_store_id },
                    openaiFiles: [],
                    dbFiles: []
                }
            }
        }),

    /**
     * Verify vector store health and return detailed status
     * Use this to check if files are properly indexed for search
     */
    verifyVectorStoreHealth: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            apiKey: z.string()
        }))
        .query(async ({ ctx, input }) => {
            log.info('[FilesRouter] verifyVectorStoreHealth called for chat:', input.chatId)
            
            const { data: chat, error: chatError } = await supabase
                .from('chats')
                .select('openai_vector_store_id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()
            
            if (chatError || !chat?.openai_vector_store_id) {
                return { 
                    healthy: false, 
                    error: 'No vector store found for this chat',
                    totalFiles: 0,
                    completedFiles: 0,
                    failedFiles: 0,
                    inProgressFiles: 0,
                    files: []
                }
            }

            try {
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                const health = await service.verifyVectorStoreHealth(chat.openai_vector_store_id)
                return { ...health, error: null }
            } catch (err) {
                log.error('[FilesRouter] verifyVectorStoreHealth error:', err)
                return {
                    healthy: false,
                    error: err instanceof Error ? err.message : 'Unknown error',
                    totalFiles: 0,
                    completedFiles: 0,
                    failedFiles: 0,
                    inProgressFiles: 0,
                    files: []
                }
            }
        }),

    /**
     * Reprocess a failed file in the vector store
     */
    reprocessFile: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            fileId: z.string(),
            apiKey: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            log.info('[FilesRouter] reprocessFile called:', { chatId: input.chatId, fileId: input.fileId })
            
            const { data: chat, error: chatError } = await supabase
                .from('chats')
                .select('openai_vector_store_id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()
            
            if (chatError || !chat?.openai_vector_store_id) {
                throw new Error('Chat or vector store not found')
            }

            try {
                const { data: fileData } = await supabase
                    .from('chat_files')
                    .select('openai_file_id, openai_vector_store_file_id')
                    .eq('chat_id', input.chatId)
                    .or(`openai_vector_store_file_id.eq.${input.fileId},openai_file_id.eq.${input.fileId}`)
                    .single()

                const vectorStoreFileId = fileData?.openai_vector_store_file_id || input.fileId
                const openaiFileId = fileData?.openai_file_id
                
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                const success = await service.reprocessFile(chat.openai_vector_store_id, vectorStoreFileId, openaiFileId)
                return { success }
            } catch (err) {
                log.error('[FilesRouter] reprocessFile error:', err)
                throw new Error(err instanceof Error ? err.message : 'Failed to reprocess file')
            }
        }),

    /**
     * Clean up duplicate files in the vector store
     * Keeps only the most recent version of each unique filename
     */
    cleanupDuplicates: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            apiKey: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            log.info('[FilesRouter] cleanupDuplicates called for chat:', input.chatId)
            
            const { data: chat, error: chatError } = await supabase
                .from('chats')
                .select('openai_vector_store_id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()
            
            if (chatError || !chat?.openai_vector_store_id) {
                throw new Error('Chat or vector store not found')
            }

            try {
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                
                // Get all files from OpenAI vector store
                const files = await service.listVectorStoreFiles(chat.openai_vector_store_id)
                
                // Group by filename
                const filesByName: Record<string, typeof files> = {}
                for (const file of files) {
                    if (!filesByName[file.filename]) {
                        filesByName[file.filename] = []
                    }
                    filesByName[file.filename].push(file)
                }
                
                // Find duplicates (files with same name)
                const duplicates: Array<{ vectorStoreFileId: string; openaiFileId?: string }> = []
                for (const [filename, fileGroup] of Object.entries(filesByName)) {
                    if (fileGroup.length > 1) {
                        log.info(`[FilesRouter] Found ${fileGroup.length} copies of "${filename}"`)
                        // Sort by createdAt descending (newest first)
                        fileGroup.sort((a, b) => b.createdAt - a.createdAt)
                        // Keep the first one (newest), mark rest as duplicates
                        for (let i = 1; i < fileGroup.length; i++) {
                            duplicates.push({
                                vectorStoreFileId: fileGroup[i].id,
                                openaiFileId: fileGroup[i].fileId
                            })
                        }
                    }
                }
                
                log.info(`[FilesRouter] Found ${duplicates.length} duplicate files to remove`)
                
                // Delete duplicates from OpenAI
                let deleted = 0
                for (const file of duplicates) {
                    try {
                        await service.deleteFile(chat.openai_vector_store_id, file.vectorStoreFileId, file.openaiFileId)
                        deleted++
                        log.info(`[FilesRouter] Deleted duplicate file: ${file.vectorStoreFileId}`)
                    } catch (err) {
                        log.error(`[FilesRouter] Failed to delete duplicate file ${file.vectorStoreFileId}:`, err)
                    }
                }

                
                // Also clean up duplicate entries in chat_files table
                const { data: dbFiles } = await supabase
                    .from('chat_files')
                    .select('id, filename, created_at')
                    .eq('chat_id', input.chatId)
                    .order('created_at', { ascending: false })
                
                if (dbFiles) {
                    const seenFilenames = new Set<string>()
                    const duplicateDbIds: string[] = []
                    
                    for (const file of dbFiles) {
                        if (seenFilenames.has(file.filename)) {
                            duplicateDbIds.push(file.id)
                        } else {
                            seenFilenames.add(file.filename)
                        }
                    }
                    
                    if (duplicateDbIds.length > 0) {
                        await supabase
                            .from('chat_files')
                            .delete()
                            .in('id', duplicateDbIds)
                        log.info(`[FilesRouter] Deleted ${duplicateDbIds.length} duplicate DB entries`)
                    }
                }
                
                return {
                    success: true,
                    duplicatesFound: duplicates.length,
                    deleted
                }
            } catch (err) {
                log.error('[FilesRouter] cleanupDuplicates error:', err)
                throw new Error(err instanceof Error ? err.message : 'Failed to cleanup duplicates')
            }
        }),

    // ========================================================================
    // New Midday-style endpoints
    // ========================================================================

    /**
     * Search documents by extracted text content (full-text search)
     */
    searchDocuments: protectedProcedure
        .input(z.object({
            query: z.string().min(1),
            chatId: z.string().uuid().optional(),
            limit: z.number().min(1).max(50).default(20)
        }))
        .query(async ({ ctx, input }) => {
            log.info('[FilesRouter] searchDocuments:', { query: input.query, chatId: input.chatId })

            try {
                // Build the full-text search query
                const searchQuery = input.query
                    .split(' ')
                    .filter(word => word.length > 0)
                    .join(' & ')

                let query = supabase
                    .from('chat_files')
                    .select(`
                        id,
                        filename,
                        content_type,
                        file_size,
                        processing_status,
                        metadata,
                        chat_id,
                        created_at
                    `)
                    .eq('user_id', ctx.userId)
                    .not('extracted_content', 'is', null)
                    .textSearch('fts', searchQuery)
                    .limit(input.limit)
                    .order('created_at', { ascending: false })

                // Filter by chat if specified
                if (input.chatId) {
                    query = query.eq('chat_id', input.chatId)
                }

                const { data, error } = await query

                if (error) {
                    log.error('[FilesRouter] Search error:', error)
                    throw new Error('Search failed')
                }

                return {
                    results: data || [],
                    query: input.query,
                    count: data?.length || 0
                }
            } catch (err) {
                log.error('[FilesRouter] searchDocuments error:', err)
                throw err
            }
        }),

    /**
     * Get document details including extracted content
     */
    getDocumentDetails: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid()
        }))
        .query(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('chat_files')
                .select(`
                    id,
                    filename,
                    content_type,
                    file_size,
                    file_hash,
                    processing_status,
                    extracted_content,
                    metadata,
                    chat_id,
                    storage_path,
                    openai_file_id,
                    openai_vector_store_file_id,
                    created_at
                `)
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (error) {
                log.error('[FilesRouter] getDocumentDetails error:', error)
                throw new Error('Document not found')
            }

            return data
        }),

    /**
     * Reprocess a document for text extraction
     */
    reprocessDocument: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid()
        }))
        .mutation(async ({ ctx, input }) => {
            log.info('[FilesRouter] reprocessDocument:', input.fileId)

            // Get file info
            const { data: file, error: fileError } = await supabase
                .from('chat_files')
                .select('id, filename, storage_path, content_type')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (fileError || !file) {
                throw new Error('File not found')
            }

            // Update status to processing
            await supabase
                .from('chat_files')
                .update({ processing_status: 'processing' })
                .eq('id', input.fileId)

            try {
                // Download file from storage
                const { data: fileData, error: downloadError } = await supabase.storage
                    .from('attachments')
                    .download(file.storage_path)

                if (downloadError || !fileData) {
                    throw new Error('Failed to download file')
                }

                const buffer = Buffer.from(await fileData.arrayBuffer())

                // Process document
                const processed = await processDocument(buffer, file.filename, file.content_type || 'application/octet-stream')

                // Update database
                const { error: updateError } = await supabase
                    .from('chat_files')
                    .update({
                        processing_status: processed.processingStatus,
                        extracted_content: processed.content,
                        metadata: processed.metadata
                    })
                    .eq('id', input.fileId)

                if (updateError) {
                    throw new Error('Failed to update document')
                }

                log.info('[FilesRouter] Document reprocessed:', {
                    fileId: input.fileId,
                    status: processed.processingStatus,
                    hasContent: !!processed.content
                })

                return {
                    success: true,
                    processingStatus: processed.processingStatus,
                    hasContent: !!processed.content,
                    metadata: processed.metadata
                }
            } catch (err) {
                // Mark as failed
                await supabase
                    .from('chat_files')
                    .update({
                        processing_status: 'failed',
                        metadata: { error: err instanceof Error ? err.message : 'Unknown error' }
                    })
                    .eq('id', input.fileId)

                throw err
            }
        }),

    /**
     * Get files by processing status
     */
    getFilesByStatus: protectedProcedure
        .input(z.object({
            status: z.enum(['pending', 'processing', 'completed', 'failed']),
            chatId: z.string().uuid().optional(),
            limit: z.number().min(1).max(100).default(50)
        }))
        .query(async ({ ctx, input }) => {
            let query = supabase
                .from('chat_files')
                .select(`
                    id,
                    filename,
                    content_type,
                    file_size,
                    processing_status,
                    metadata,
                    chat_id,
                    created_at
                `)
                .eq('user_id', ctx.userId)
                .eq('processing_status', input.status)
                .limit(input.limit)
                .order('created_at', { ascending: false })

            if (input.chatId) {
                query = query.eq('chat_id', input.chatId)
            }

            const { data, error } = await query

            if (error) {
                log.error('[FilesRouter] getFilesByStatus error:', error)
                throw new Error('Failed to fetch files')
            }

            return data || []
        }),

    /**
     * Get document statistics for user
     */
    getDocumentStats: protectedProcedure
        .query(async ({ ctx }) => {
            const { data, error } = await supabase
                .from('chat_files')
                .select('processing_status, file_size')
                .eq('user_id', ctx.userId)

            if (error) {
                log.error('[FilesRouter] getDocumentStats error:', error)
                throw new Error('Failed to fetch stats')
            }

            const stats = {
                total: data?.length || 0,
                pending: 0,
                processing: 0,
                completed: 0,
                failed: 0,
                totalSize: 0
            }

            for (const file of data || []) {
                stats[file.processing_status as keyof typeof stats]++
                stats.totalSize += file.file_size || 0
            }

            return stats
        }),

    /**
     * Search within a document with page citations
     */
    searchInDocument: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid(),
            query: z.string().min(1),
            maxResults: z.number().min(1).max(20).default(5)
        }))
        .query(async ({ ctx, input }) => {
            log.info('[FilesRouter] searchInDocument:', { fileId: input.fileId, query: input.query })

            // Get document with pages
            const { data: file, error } = await supabase
                .from('chat_files')
                .select('id, filename, pages, extracted_content')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (error || !file) {
                throw new Error('Document not found')
            }

            if (!file.pages || !Array.isArray(file.pages)) {
                // Fallback: search in extracted_content without page numbers
                if (file.extracted_content) {
                    const lowerContent = file.extracted_content.toLowerCase()
                    const lowerQuery = input.query.toLowerCase()
                    const index = lowerContent.indexOf(lowerQuery)

                    if (index !== -1) {
                        const start = Math.max(0, index - 100)
                        const end = Math.min(file.extracted_content.length, index + input.query.length + 100)
                        let snippet = file.extracted_content.substring(start, end)
                        if (start > 0) snippet = '...' + snippet
                        if (end < file.extracted_content.length) snippet += '...'

                        return {
                            results: [{
                                text: snippet,
                                pageNumber: null,
                                citation: `[${file.filename}]`
                            }],
                            totalMatches: 1
                        }
                    }
                }

                return { results: [], totalMatches: 0 }
            }

            // Search with citations
            const pages = file.pages as PageContent[]
            const citations = searchWithCitations(input.query, pages, input.maxResults)

            return {
                results: citations.map(c => ({
                    text: c.text,
                    pageNumber: c.pageNumber,
                    citation: formatCitation(file.filename, c.pageNumber, 'bracket')
                })),
                totalMatches: citations.length
            }
        }),

    /**
     * Get document pages for a file
     */
    getDocumentPages: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid()
        }))
        .query(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('chat_files')
                .select('id, filename, pages, metadata')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (error || !data) {
                throw new Error('Document not found')
            }

            const pages = (data.pages as PageContent[] | null) || []
            const metadata = data.metadata as Record<string, unknown> || {}

            return {
                filename: data.filename,
                pageCount: pages.length,
                pages: pages.map(p => ({
                    pageNumber: p.pageNumber,
                    wordCount: p.wordCount,
                    preview: p.content.substring(0, 200) + (p.content.length > 200 ? '...' : '')
                })),
                metadata
            }
        }),

    /**
     * Get specific page content
     */
    getPageContent: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid(),
            pageNumber: z.number().min(1)
        }))
        .query(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('chat_files')
                .select('id, filename, pages')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (error || !data) {
                throw new Error('Document not found')
            }

            const pages = (data.pages as PageContent[] | null) || []
            const page = pages.find(p => p.pageNumber === input.pageNumber)

            if (!page) {
                throw new Error(`Page ${input.pageNumber} not found`)
            }

            return {
                filename: data.filename,
                pageNumber: page.pageNumber,
                content: page.content,
                wordCount: page.wordCount,
                citation: formatCitation(data.filename, page.pageNumber, 'bracket')
            }
        })
})
