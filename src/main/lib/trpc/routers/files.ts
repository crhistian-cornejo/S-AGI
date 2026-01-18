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
                const service = new OpenAIFileService({ apiKey: input.apiKey })
                
                // 1. Get or create vector store
                const vectorStoreId = await service.getOrCreateVectorStore(input.chatId, ctx.userId)
                
                // 2. Decode file
                const buffer = Buffer.from(input.fileBase64, 'base64')
                
                // 3. Upload to OpenAI and attach
                const fileId = await service.uploadAndAttachFile(vectorStoreId, buffer, input.fileName)
                
                log.info('[FilesRouter] File uploaded successfully:', { fileId, vectorStoreId, fileName: input.fileName })
                
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
            const { data: chat, error } = await supabase
                .from('chats')
                .select('openai_vector_store_id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()
            
            if (error || !chat?.openai_vector_store_id) {
                return { vectorStoreId: null, files: [] }
            }

            const service = new OpenAIFileService({ apiKey: input.apiKey })
            const files = await service.listVectorStoreFiles(chat.openai_vector_store_id)
            
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

            const service = new OpenAIFileService({ apiKey: input.apiKey })
            await service.deleteFile(chat.openai_vector_store_id, input.fileId)
            
            log.info('[FilesRouter] File deleted:', input.fileId)
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
        }))
})
