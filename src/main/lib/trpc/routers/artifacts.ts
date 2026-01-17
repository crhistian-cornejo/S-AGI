import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import { ArtifactTypeSchema } from '@shared/types'

export const artifactsRouter = router({
    // List artifacts for a chat
    list: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid()
        }))
        .query(async ({ ctx, input }) => {
            // Verify chat ownership
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
                .from('artifacts')
                .select('*')
                .eq('chat_id', input.chatId)
                .order('created_at', { ascending: false })

            if (error) throw new Error(error.message)
            return data
        }),

    // Get a single artifact
    get: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const { data: artifact, error } = await supabase
                .from('artifacts')
                .select('*, chats!inner(user_id)')
                .eq('id', input.id)
                .single()

            if (error) throw new Error(error.message)
            
            // Verify ownership through chat
            if (artifact.chats.user_id !== ctx.userId) {
                throw new Error('Access denied')
            }

            return artifact
        }),

    // Create an artifact
    create: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid(),
            messageId: z.string().uuid().optional(),
            type: ArtifactTypeSchema,
            name: z.string(),
            content: z.any().default({}),
            univerData: z.any().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify chat ownership
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
                .from('artifacts')
                .insert({
                    chat_id: input.chatId,
                    message_id: input.messageId,
                    type: input.type,
                    name: input.name,
                    content: input.content,
                    univer_data: input.univerData
                })
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        }),

    // Update an artifact
    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            name: z.string().optional(),
            content: z.any().optional(),
            univerData: z.any().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership through chat join
            const { data: artifact } = await supabase
                .from('artifacts')
                .select('id, chat_id')
                .eq('id', input.id)
                .single()

            if (!artifact) {
                throw new Error('Artifact not found')
            }

            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', artifact.chat_id)
                .eq('user_id', ctx.userId)
                .single()

            if (!chat) {
                throw new Error('Access denied')
            }

            const { id, ...updates } = input
            const updateData: Record<string, unknown> = {
                updated_at: new Date().toISOString()
            }

            if (updates.name !== undefined) updateData.name = updates.name
            if (updates.content !== undefined) updateData.content = updates.content
            if (updates.univerData !== undefined) updateData.univer_data = updates.univerData

            const { data, error } = await supabase
                .from('artifacts')
                .update(updateData)
                .eq('id', id)
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        }),

    // Delete an artifact
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership through chat join
            const { data: artifact } = await supabase
                .from('artifacts')
                .select('id, chat_id')
                .eq('id', input.id)
                .single()

            if (!artifact) {
                throw new Error('Artifact not found')
            }

            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', artifact.chat_id)
                .eq('user_id', ctx.userId)
                .single()

            if (!chat) {
                throw new Error('Access denied')
            }

            const { error } = await supabase
                .from('artifacts')
                .delete()
                .eq('id', input.id)

            if (error) throw new Error(error.message)
            return { success: true }
        }),

    // Save Univer workbook snapshot
    saveUniverSnapshot: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            univerData: z.any()
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership through chat join
            const { data: artifact } = await supabase
                .from('artifacts')
                .select('id, chat_id')
                .eq('id', input.id)
                .single()

            if (!artifact) {
                throw new Error('Artifact not found')
            }

            const { data: chat } = await supabase
                .from('chats')
                .select('id')
                .eq('id', artifact.chat_id)
                .eq('user_id', ctx.userId)
                .single()

            if (!chat) {
                throw new Error('Access denied')
            }

            const { data, error } = await supabase
                .from('artifacts')
                .update({
                    univer_data: input.univerData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', input.id)
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        })
})
