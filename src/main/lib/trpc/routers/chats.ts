import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import log from 'electron-log'

export const chatsRouter = router({
    // List all chats for current user
    list: protectedProcedure
        .input(z.object({
            includeArchived: z.boolean().optional().default(false)
        }).optional())
        .query(async ({ ctx, input }) => {
            try {
                let query = supabase
                    .from('chats')
                    .select('*')
                    .eq('user_id', ctx.userId)
                    .order('updated_at', { ascending: false })

                if (!input?.includeArchived) {
                    query = query.eq('archived', false)
                }

                const { data, error } = await query

                if (error) {
                    log.error('[Chats] List error:', error)
                    throw new Error(error.message)
                }
                return data || []
            } catch (err) {
                log.error('[Chats] List exception:', err)
                return []
            }
        }),

    // Get a single chat by ID
    get: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('chats')
                .select('*')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .maybeSingle()

            if (error) throw new Error(error.message)
            return data
        }),

    // Create a new chat
    create: protectedProcedure
        .input(z.object({
            title: z.string().optional().default('New Chat')
        }))
        .mutation(async ({ ctx, input }) => {
            log.info('[Chats] Creating chat with title:', input.title, 'for user:', ctx.userId)
            
            const { data, error } = await supabase
                .from('chats')
                .insert({
                    title: input.title,
                    user_id: ctx.userId,
                    archived: false
                })
                .select()
                .single()

            if (error) {
                log.error('[Chats] Create error:', error)
                throw new Error(error.message)
            }
            
            log.info('[Chats] Created chat:', data.id)
            return data
        }),

    // Update chat title
    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            title: z.string().optional(),
            archived: z.boolean().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, ...updates } = input
            const { data, error } = await supabase
                .from('chats')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        }),

    // Archive a chat
    archive: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('chats')
                .update({
                    archived: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            return data
        }),

    // Delete a chat permanently
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { error } = await supabase
                .from('chats')
                .delete()
                .eq('id', input.id)
                .eq('user_id', ctx.userId)

            if (error) throw new Error(error.message)
            return { success: true }
        })
})
