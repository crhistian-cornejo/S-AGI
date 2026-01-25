import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import path from 'path'
import { processBase64Image, isProcessableImage, getExtensionForFormat } from '../../ai'
import log from 'electron-log'

// Signed URL TTL for attachments (24 hours - long enough for sessions, short enough for security)
const ATTACHMENT_SIGNED_URL_TTL = 60 * 60 * 24

// Attachment schema with storagePath for URL regeneration
const attachmentSchema = z.object({
    id: z.string(),
    name: z.string(),
    size: z.number(),
    type: z.string(),
    url: z.string().optional(),
    preview: z.string().optional(),
    storagePath: z.string().optional() // Required for URL regeneration
})

/**
 * Regenerate signed URLs for attachments that have storagePath
 * This ensures URLs are always fresh and valid for the current session
 */
async function regenerateAttachmentUrls(attachments: any[]): Promise<any[]> {
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
        return attachments
    }

    const regenerated = await Promise.all(
        attachments.map(async (attachment) => {
            // Only regenerate if we have a storagePath
            if (!attachment.storagePath) {
                return attachment
            }

            try {
                const { data: signedUrlData, error } = await supabase.storage
                    .from('attachments')
                    .createSignedUrl(attachment.storagePath, ATTACHMENT_SIGNED_URL_TTL)

                if (error) {
                    log.warn('[MessagesRouter] Failed to regenerate signed URL:', {
                        storagePath: attachment.storagePath,
                        error: error.message
                    })
                    return attachment
                }

                return {
                    ...attachment,
                    url: signedUrlData.signedUrl
                }
            } catch (err) {
                log.error('[MessagesRouter] Error regenerating URL:', err)
                return attachment
            }
        })
    )

    return regenerated
}

export const messagesRouter = router({
    // List messages for a chat
    list: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            limit: z.number().min(1).max(200).optional().default(100)
        }))
        .query(async ({ ctx, input }) => {
            // Server-side clamp for safety
            const safeLimit = Math.min(input.limit, 200)
            // First verify the chat belongs to the user
            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .maybeSingle()

            if (!chat) {
                throw new Error('Chat not found or access denied')
            }

            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('chat_id', input.chatId)
                .order('created_at', { ascending: true })
                .limit(safeLimit)

            if (error) throw new Error(error.message)

            // Process each message: regenerate attachment URLs and map tool_calls
            const messagesWithFreshUrls = await Promise.all(
                data.map(async (msg: any) => {
                    // Regenerate signed URLs for attachments
                    const freshAttachments = await regenerateAttachmentUrls(msg.attachments)

                    return {
                        ...msg,
                        attachments: freshAttachments,
                        tool_calls: msg.metadata?.tool_calls || msg.tool_calls || []
                    }
                })
            )

            return messagesWithFreshUrls
        }),

    // Add a message to a chat
    add: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            role: z.enum(['user', 'assistant', 'system', 'tool']),
            content: z.any(),
            toolCalls: z.any().optional(),
            metadata: z.any().optional(),
            /** Model used for this message (assistant only). For cost calculation and actions. */
            modelId: z.string().optional(),
            /** Display name of the model (e.g. GPT-5.2, GLM-4.7). */
            modelName: z.string().optional(),
            attachments: z.array(attachmentSchema).optional()
        }))
        .mutation(async ({ ctx, input }) => {
            console.log('[MessagesRouter] add message, userId:', ctx.userId, 'chatId:', input.chatId);

            // Verify chat ownership
            const { data: chat, error: chatError } = await supabase
                .from('chats')
                .select('id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .maybeSingle()

            console.log('[MessagesRouter] Chat lookup result:', { chat, chatError });

            if (!chat) {
                console.error('[MessagesRouter] Chat not found or access denied for user:', ctx.userId, 'chatId:', input.chatId);
                throw new Error('Chat not found or access denied')
            }

            // Map content to string if it is an object (renderer sends {type: 'text', text: '...'})
            let contentText = ''
            if (typeof input.content === 'object') {
                contentText = input.content.text || JSON.stringify(input.content)
            } else {
                contentText = String(input.content)
            }

            const metadataPayload = {
                ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
                ...(input.toolCalls ? { tool_calls: input.toolCalls } : {})
            }

            const insertPayload: Record<string, unknown> = {
                chat_id: input.chatId,
                user_id: ctx.userId,
                role: input.role,
                content: contentText,
                attachments: input.attachments || [],
                metadata: Object.keys(metadataPayload).length > 0 ? metadataPayload : undefined
            }
            if (input.modelId != null) insertPayload.model_id = input.modelId
            if (input.modelName != null) insertPayload.model_name = input.modelName

            const { data, error } = await supabase
                .from('chat_messages')
                .insert(insertPayload)
                .select()
                .maybeSingle()

            if (error) {
                console.error('[MessagesRouter] Error inserting message:', error);
                throw new Error(error.message);
            }

            // Update chat's updated_at timestamp
            await supabase
                .from('chats')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', input.chatId)

            return data
        }),

    // Update a message
    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            content: z.any().optional(),
            toolCalls: z.any().optional(),
            attachments: z.array(attachmentSchema).optional()
        }))
        .mutation(async ({ ctx, input }) => {
            // First get the message to verify ownership through chat
            const { data: message } = await supabase
                .from('chat_messages')
                .select('id, chat_id')
                .eq('id', input.id)
                .maybeSingle()

            if (!message) {
                throw new Error('Message not found')
            }

            // Verify chat ownership
            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', message.chat_id)
                .eq('user_id', ctx.userId)
                .maybeSingle()

            if (!chat) {
                throw new Error('Access denied')
            }

            const { id, ...updates } = input
            const updateData: Record<string, unknown> = {}

            if (updates.content !== undefined) updateData.content = updates.content
            if (updates.toolCalls !== undefined) updateData.tool_calls = updates.toolCalls
            if (updates.attachments !== undefined) updateData.attachments = updates.attachments

            const { data, error } = await supabase
                .from('chat_messages')
                .update(updateData)
                .eq('id', id)
                .select()
                .maybeSingle()

            if (error) throw new Error(error.message)
            return data
        }),

    // Delete a message
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // First get the message to verify ownership through chat
            const { data: message } = await supabase
                .from('chat_messages')
                .select('id, chat_id')
                .eq('id', input.id)
                .maybeSingle()

            if (!message) {
                throw new Error('Message not found')
            }

            // Verify chat ownership
            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', message.chat_id)
                .eq('user_id', ctx.userId)
                .maybeSingle()

            if (!chat) {
                throw new Error('Access denied')
            }

            const { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('id', input.id)

            if (error) throw new Error(error.message)
            return { success: true }
        }),

    // Upload file attachment with automatic image optimization
    uploadFile: protectedProcedure
        .input(z.object({
            fileName: z.string(),
            fileSize: z.number().max(20 * 1024 * 1024, 'File size must be less than 20MB'),
            fileType: z.string(),
            fileData: z.string(), // Base64 encoded file data
            // Image optimization options
            optimize: z.boolean().optional().default(true),
            maxWidth: z.number().optional().default(1920),
            maxHeight: z.number().optional().default(1920),
            quality: z.number().min(1).max(100).optional().default(75)
        }))
        .mutation(async ({ ctx, input }) => {
            const startTime = Date.now()
            console.log('[MessagesRouter] Upload file:', input.fileName, 'for user:', ctx.userId);

            // Verify session is active for storage RLS
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()
            if (sessionError || !session) {
                console.error('[MessagesRouter] No active session for storage upload:', sessionError);
                throw new Error('Authentication required for file upload. Please sign in again.')
            }

            let finalBuffer: Buffer
            let finalFileName = input.fileName
            let finalMimeType = input.fileType
            let finalSize = input.fileSize
            let compressionInfo: { originalSize: number; processedSize: number; ratio: number } | null = null

            // Process images for optimization
            if (input.optimize && isProcessableImage(input.fileType)) {
                try {
                    console.log('[MessagesRouter] Optimizing image...')
                    const processed = await processBase64Image(input.fileData, {
                        format: 'webp',
                        quality: input.quality,
                        maxWidth: input.maxWidth,
                        maxHeight: input.maxHeight,
                        stripMetadata: true
                    })

                    finalBuffer = Buffer.from(processed.base64, 'base64')
                    finalMimeType = processed.mimeType
                    finalSize = processed.stats.processedSize
                    
                    // Update filename to .webp
                    const baseName = path.basename(input.fileName, path.extname(input.fileName))
                    finalFileName = `${baseName}${getExtensionForFormat('webp')}`

                    compressionInfo = {
                        originalSize: processed.stats.originalSize,
                        processedSize: processed.stats.processedSize,
                        ratio: processed.stats.compressionRatio
                    }

                    console.log(`[MessagesRouter] Image optimized: ${(compressionInfo.originalSize / 1024).toFixed(0)}KB → ${(compressionInfo.processedSize / 1024).toFixed(0)}KB (${compressionInfo.ratio.toFixed(1)}x smaller)`)
                } catch (err) {
                    console.warn('[MessagesRouter] Image optimization failed, uploading original:', err)
                    finalBuffer = Buffer.from(input.fileData, 'base64')
                }
            } else {
                finalBuffer = Buffer.from(input.fileData, 'base64')
            }

            // Generate unique file path
            const fileExt = path.extname(finalFileName)
            const fileNameWithoutExt = path.basename(finalFileName, fileExt)
            const timestamp = Date.now()
            const randomId = Math.random().toString(36).substring(2, 15)
            const storagePath = `${ctx.userId}/${timestamp}-${randomId}-${fileNameWithoutExt}${fileExt}`

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('attachments')
                .upload(storagePath, finalBuffer, {
                    contentType: finalMimeType,
                    upsert: false
                })

            if (uploadError) {
                console.error('[MessagesRouter] Upload error:', uploadError);
                throw new Error(`Upload failed: ${uploadError.message}`)
            }

            // Generate signed URL (bucket is private, URLs expire in 1 hour)
            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                .from('attachments')
                .createSignedUrl(storagePath, 60 * 60) // 1 hour TTL

            if (signedUrlError) {
                console.error('[MessagesRouter] Signed URL error:', signedUrlError);
                throw new Error(`Failed to generate signed URL: ${signedUrlError.message}`)
            }

            const totalTime = Date.now() - startTime
            console.log(`[MessagesRouter] Upload complete in ${totalTime}ms`)

            return {
                id: randomId,
                name: finalFileName,
                size: finalSize,
                type: finalMimeType,
                url: signedUrlData.signedUrl,
                storagePath: storagePath,
                // Include compression info for UI feedback
                compression: compressionInfo
            }
        }),

    /**
     * Get a fresh signed URL for a storage path
     * Used for on-demand URL regeneration when cached URLs expire
     */
    getSignedUrl: protectedProcedure
        .input(z.object({
            storagePath: z.string(),
            bucket: z.enum(['attachments', 'images']).optional().default('attachments')
        }))
        .query(async ({ ctx, input }) => {
            // Security: Verify the path belongs to the user
            // Storage paths are formatted as: {userId}/...
            if (!input.storagePath.startsWith(`${ctx.userId}/`)) {
                log.warn('[MessagesRouter] Unauthorized access attempt to storage path:', {
                    storagePath: input.storagePath,
                    userId: ctx.userId
                })
                throw new Error('Access denied')
            }

            const { data: signedUrlData, error } = await supabase.storage
                .from(input.bucket)
                .createSignedUrl(input.storagePath, ATTACHMENT_SIGNED_URL_TTL)

            if (error) {
                log.error('[MessagesRouter] Failed to generate signed URL:', error)
                throw new Error(`Failed to generate signed URL: ${error.message}`)
            }

            return {
                url: signedUrlData.signedUrl,
                expiresIn: ATTACHMENT_SIGNED_URL_TTL
            }
        }),

    /**
     * Batch get signed URLs for multiple storage paths
     * More efficient than multiple single calls
     */
    getSignedUrls: protectedProcedure
        .input(z.object({
            storagePaths: z.array(z.string()),
            bucket: z.enum(['attachments', 'images']).optional().default('attachments')
        }))
        .query(async ({ ctx, input }) => {
            // Filter to only paths belonging to this user
            const validPaths = input.storagePaths.filter(p => p.startsWith(`${ctx.userId}/`))

            if (validPaths.length === 0) {
                return { urls: {} }
            }

            const { data, error } = await supabase.storage
                .from(input.bucket)
                .createSignedUrls(validPaths, ATTACHMENT_SIGNED_URL_TTL)

            if (error) {
                log.error('[MessagesRouter] Failed to generate batch signed URLs:', error)
                throw new Error(`Failed to generate signed URLs: ${error.message}`)
            }

            // Map paths to URLs
            const urls: Record<string, string> = {}
            for (const item of data || []) {
                if (item.signedUrl && item.path) {
                    urls[item.path] = item.signedUrl
                }
            }

            return {
                urls,
                expiresIn: ATTACHMENT_SIGNED_URL_TTL
            }
        })
})
