import log from 'electron-log'
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'

export const chatsRouter = router({
    // List all non-archived chats for current user (pinned first, then by updated_at)
    list: protectedProcedure
        .input(z.object({
            includeArchived: z.boolean().optional().default(false)
        }).optional())
        .query(async ({ ctx, input }) => {
            try {
                // Intentar query con pinned primero
                let query = supabase
                    .from('chats')
                    .select('*')
                    .eq('user_id', ctx.userId)

                if (!input?.includeArchived) {
                    query = query.eq('archived', false)
                }

                // Intentamos ordenar por pinned, pero si la columna no existe, esto fallará
                const { data, error } = await query
                    .order('pinned', { ascending: false, nullsFirst: false })
                    .order('updated_at', { ascending: false })

                if (error) {
                    // Si el error es por la columna 'pinned', intentamos sin ella
                    if (error.message.includes('column') && error.message.includes('pinned')) {
                        log.warn('[Chats] Column "pinned" not found, falling back to normal ordering. PLEASE RUN MIGRATION.')
                        const fallbackQuery = supabase
                            .from('chats')
                            .select('*')
                            .eq('user_id', ctx.userId)
                            .order('updated_at', { ascending: false })
                        
                        const { data: fbData, error: fbError } = await (input?.includeArchived ? fallbackQuery : fallbackQuery.eq('archived', false))
                        if (fbError) throw new Error(fbError.message)
                        return fbData || []
                    }
                    
                    log.error('[Chats] List error:', error)
                    throw new Error(error.message)
                }
                return data || []
            } catch (err) {
                log.error('[Chats] List exception:', err)
                return []
            }
        }),

    // List archived chats only
    listArchived: protectedProcedure
        .query(async ({ ctx }) => {
            try {
                const { data, error } = await supabase
                    .from('chats')
                    .select('*')
                    .eq('user_id', ctx.userId)
                    .eq('archived', true)
                    .order('updated_at', { ascending: false })

                if (error) {
                    log.error('[Chats] List archived error:', error)
                    throw new Error(error.message)
                }
                return data || []
            } catch (err) {
                log.error('[Chats] List archived exception:', err)
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
                    archived: false,
                    pinned: false
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

    // Update chat (title, archived status)
    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            title: z.string().optional(),
            archived: z.boolean().optional(),
            pinned: z.boolean().optional()
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

    // Toggle pin status of a chat
    togglePin: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // First get current pin status
            const { data: current, error: getError } = await supabase
                .from('chats')
                .select('pinned')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .single()

            if (getError) throw new Error(getError.message)

            // Toggle the pin status
            const { data, error } = await supabase
                .from('chats')
                .update({
                    pinned: !current.pinned,
                    updated_at: new Date().toISOString()
                })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            log.info('[Chats] Toggled pin for chat:', input.id, '→', !current.pinned)
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
                    pinned: false, // Unpin when archiving
                    updated_at: new Date().toISOString()
                })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            log.info('[Chats] Archived chat:', input.id)
            return data
        }),

    // Restore an archived chat
    restore: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('chats')
                .update({
                    archived: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            log.info('[Chats] Restored chat:', input.id)
            return data
        }),

    // Delete a chat permanently
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Get chat data first for undo capability
            const { data: chatData } = await supabase
                .from('chats')
                .select('*')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .single()

            const { error } = await supabase
                .from('chats')
                .delete()
                .eq('id', input.id)
                .eq('user_id', ctx.userId)

            if (error) throw new Error(error.message)
            log.info('[Chats] Deleted chat:', input.id)
            return { success: true, deletedChat: chatData }
        })
})
