import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'

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
                .single()

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
            toolCalls: z.any().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            console.log('[MessagesRouter] add message, userId:', ctx.userId);

            // Verify chat ownership
            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', input.chatId)
                .eq('user_id', ctx.userId)
                .single()

            if (!chat) {
                console.error('[MessagesRouter] Chat not found or access denied for user:', ctx.userId);
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
                    metadata: input.toolCalls ? { tool_calls: input.toolCalls } : undefined
                })
                .select()
                .single()

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
                .single()

            if (!message) {
                throw new Error('Message not found')
            }

            // Verify chat ownership
            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', message.chat_id)
                .eq('user_id', ctx.userId)
                .single()

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
                .single()

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
                .single()

            if (!message) {
                throw new Error('Message not found')
            }

            // Verify chat ownership
            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', message.chat_id)
                .eq('user_id', ctx.userId)
                .single()

            if (!chat) {
                throw new Error('Access denied')
            }

            const { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('id', input.id)

            if (error) throw new Error(error.message)
            return { success: true }
        })
})
