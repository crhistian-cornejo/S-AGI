import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { OpenAIFileService } from '../../ai/openai-files'
import log from 'electron-log'
import { supabase } from '../../supabase/client'

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
            apiKey: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            try {
                log.info('[FilesRouter] uploadForChat called:', { 
                    chatId: input.chatId, 
                    fileName: input.fileName,
                    apiKeyLength: input.apiKey?.length || 0,
                    userId: ctx.userId 
                })
                
                if (!input.apiKey) {
                    throw new Error('OpenAI API key is required for file upload')
                }
                
                // Calculate file size for duplicate check
                const buffer = Buffer.from(input.fileBase64, 'base64')
                const fileSize = buffer.length
                
                // CHECK FOR DUPLICATES: Same filename AND same size in this chat
                const { data: existingFile } = await supabase
                    .from('chat_files')
                    .select('id, openai_file_id, openai_vector_store_file_id, filename')
                    .eq('chat_id', input.chatId)
                    .eq('filename', input.fileName)
                    .eq('file_size', fileSize)
                    .single()
                
                if (existingFile) {
                    const existingVectorStoreFileId = existingFile.openai_vector_store_file_id || existingFile.openai_file_id
                    log.info('[FilesRouter] Duplicate file detected, skipping upload:', {
                        fileName: input.fileName,
                        existingFileId: existingVectorStoreFileId
                    })
                    // Return existing file info instead of uploading again
                    return { 
                        success: true, 
                        fileId: existingVectorStoreFileId, 
                        openaiFileId: existingFile.openai_file_id,
                        vectorStoreId: null, // Will be fetched if needed
                        skipped: true,
                        reason: 'duplicate'
                    }
                }
                
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                
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
                
                // 6. Save metadata to chat_files table (fileSize already calculated above)
                const { error: dbError } = await supabase
                    .from('chat_files')
                    .insert({
                        chat_id: input.chatId,
                        user_id: ctx.userId,
                        filename: input.fileName,
                        storage_path: storagePath,
                        file_size: fileSize,
                        openai_file_id: uploaded.fileId,
                        openai_vector_store_file_id: uploaded.vectorStoreFileId,
                        content_type: contentType
                    })

                if (dbError) {
                    log.error('[FilesRouter] DB insert failed:', dbError)
                    // consistency issue: file is in storage and openai but not db. 
                    // Should theoretically rollup/cleanup but for now logging.
                }

                log.info('[FilesRouter] File uploaded and persisted successfully:', { fileId: uploaded.fileId, vectorStoreFileId: uploaded.vectorStoreFileId, vectorStoreId, fileName: input.fileName, storagePath })
                
                // Return vector store file id for operations, include OpenAI file id for reference
                return { success: true, fileId: uploaded.vectorStoreFileId, vectorStoreId, openaiFileId: uploaded.fileId }
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
            apiKey: z.string()
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
                    const service = new OpenAIFileService({ apiKey: input.apiKey })
                    files = await service.listVectorStoreFiles(chat.openai_vector_store_id)
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
            apiKey: z.string()
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

            // 2. Delete from OpenAI
            try {
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                await service.deleteFile(chat.openai_vector_store_id, vectorStoreFileId, openaiFileId)
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
        })
})
