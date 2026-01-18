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
                
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                
                // 1. Get or create vector store
                log.info('[FilesRouter] Getting or creating vector store...')
                const vectorStoreId = await service.getOrCreateVectorStore(input.chatId, ctx.userId)
                log.info('[FilesRouter] Vector store ID:', vectorStoreId)
                
                // 2. Decode file
                const buffer = Buffer.from(input.fileBase64, 'base64')

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
                const fileId = await service.uploadAndAttachFile(vectorStoreId, buffer, input.fileName)
                log.info('[FilesRouter] File uploaded to OpenAI:', fileId)
                
                // 6. Determine file size
                const fileSize = buffer.length
                
                // 7. Save metadata to chat_files table
                const { error: dbError } = await supabase
                    .from('chat_files')
                    .insert({
                        chat_id: input.chatId,
                        user_id: ctx.userId,
                        filename: input.fileName,
                        storage_path: storagePath,
                        file_size: fileSize,
                        openai_file_id: fileId,
                        content_type: 'application/octet-stream' // You might want to infer this real type if possible
                    })

                if (dbError) {
                    log.error('[FilesRouter] DB insert failed:', dbError)
                    // consistency issue: file is in storage and openai but not db. 
                    // Should theoretically rollup/cleanup but for now logging.
                }

                log.info('[FilesRouter] File uploaded and persisted successfully:', { fileId, vectorStoreId, fileName: input.fileName, storagePath })
                
                // Return 'id' as the openai_file_id for backward compatibility with frontend if it expects that
                // Or prefer the local DB id if we change the frontend.
                // For now, let's assume usage of openai id for operations, 
                // but we should eventually switch.
                return { success: true, fileId, vectorStoreId }
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
                filename: string
                status: string
                bytes: number
                createdAt: number
                dbId?: string
            }[] = []
            
            if (dbFiles && dbFiles.length > 0) {
                files = dbFiles.map(f => ({
                    id: f.openai_file_id, // Use OpenAI ID as the primary ID for current tool compatibility
                    dbId: f.id,
                    filename: f.filename,
                    status: 'available', // derived
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

            // 1. Delete from OpenAI
            try {
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                await service.deleteFile(chat.openai_vector_store_id, input.fileId)
            } catch (err) {
                log.warn('[FilesRouter] Failed to delete from OpenAI, proceeding to local delete:', err)
            }

            // 2. Find file in DB to get storage path
            const { data: fileData } = await supabase
                .from('chat_files')
                .select('storage_path')
                .eq('chat_id', input.chatId)
                .eq('openai_file_id', input.fileId) // Assuming input.fileId is OpenAI ID
                .single()

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
                .eq('openai_file_id', input.fileId)

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

            const service = new OpenAIFileService({ apiKey: input.apiKey })
            const status = await service.getFileStatus(chat.openai_vector_store_id, input.fileId)
            
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
                        const status = await service.getFileStatus(chat.openai_vector_store_id, file.id)
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
        })
})
