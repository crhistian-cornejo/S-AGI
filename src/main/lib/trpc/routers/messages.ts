import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import path from 'path'

export const messagesRouter = router({
    // List messages for a chat
    list: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            limit: z.number().optional().default(100)
        }))
        .query(async ({ ctx, input }) => {
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
                .limit(input.limit)

            if (error) throw new Error(error.message)

            // Map metadata.tool_calls to top-level tool_calls consistency
            return data.map((msg: any) => ({
                ...msg,
                tool_calls: msg.metadata?.tool_calls || msg.tool_calls || []
            }))
        }),

    // Add a message to a chat
    add: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            role: z.enum(['user', 'assistant', 'system', 'tool']),
            content: z.any(),
            toolCalls: z.any().optional(),
            attachments: z.array(z.object({
                id: z.string(),
                name: z.string(),
                size: z.number(),
                type: z.string(),
                url: z.string().optional(),
                preview: z.string().optional()
            })).optional()
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

            const { data, error } = await supabase
                .from('chat_messages')
                .insert({
                    chat_id: input.chatId,
                    user_id: ctx.userId,
                    role: input.role,
                    content: contentText,
                    attachments: input.attachments || [],
                    metadata: input.toolCalls ? { tool_calls: input.toolCalls } : undefined
                })
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
            toolCalls: z.any().optional()
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

    // Upload file attachment
    uploadFile: protectedProcedure
        .input(z.object({
            fileName: z.string(),
            fileSize: z.number(),
            fileType: z.string(),
            fileData: z.string() // Base64 encoded file data
        }))
        .mutation(async ({ ctx, input }) => {
            console.log('[MessagesRouter] Upload file:', input.fileName, 'for user:', ctx.userId);

            // Generate unique file path
            const fileExt = path.extname(input.fileName)
            const fileNameWithoutExt = path.basename(input.fileName, fileExt)
            const timestamp = Date.now()
            const randomId = Math.random().toString(36).substring(2, 15)
            const storagePath = `attachments/${ctx.userId}/${timestamp}-${randomId}-${fileNameWithoutExt}${fileExt}`

            // Convert base64 to buffer
            const buffer = Buffer.from(input.fileData, 'base64')

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('attachments')
                .upload(storagePath, buffer, {
                    contentType: input.fileType,
                    upsert: false
                })

            if (uploadError) {
                console.error('[MessagesRouter] Upload error:', uploadError);
                throw new Error(`Upload failed: ${uploadError.message}`)
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('attachments')
                .getPublicUrl(storagePath)

            return {
                id: randomId,
                name: input.fileName,
                size: input.fileSize,
                type: input.fileType,
                url: urlData.publicUrl,
                storagePath: storagePath
            }
        })
})
