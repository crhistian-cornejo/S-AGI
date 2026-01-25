import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import log from 'electron-log'

export const panelMessagesRouter = router({
    // List messages for a panel
    list: protectedProcedure
        .input(z.object({
            panelType: z.enum(['pdf_chat', 'agent_panel']),
            sourceId: z.string(),
            tabType: z.enum(['excel', 'doc', 'pdf']).optional()
        }))
        .query(async ({ ctx, input }) => {
            let query = supabase
                .from('panel_messages')
                .select('*')
                .eq('user_id', ctx.userId)
                .eq('panel_type', input.panelType)
                .eq('source_id', input.sourceId)
                .order('created_at', { ascending: true })

            // For agent_panel, filter by tab_type
            if (input.panelType === 'agent_panel' && input.tabType) {
                query = query.eq('tab_type', input.tabType)
            }

            const { data, error } = await query

            if (error) {
                log.error('[PanelMessagesRouter] Error fetching messages:', error)
                throw new Error(error.message)
            }

            return data || []
        }),

    // Add a message to a panel
    add: protectedProcedure
        .input(z.object({
            panelType: z.enum(['pdf_chat', 'agent_panel']),
            sourceId: z.string(),
            tabType: z.enum(['excel', 'doc', 'pdf']).optional(),
            role: z.enum(['user', 'assistant']),
            content: z.string(),
            metadata: z.any().optional(),
            modelId: z.string().optional(),
            modelName: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            const insertPayload: Record<string, unknown> = {
                user_id: ctx.userId,
                panel_type: input.panelType,
                source_id: input.sourceId,
                role: input.role,
                content: input.content,
                metadata: input.metadata || {}
            }

            // Set tab_type only for agent_panel
            if (input.panelType === 'agent_panel' && input.tabType) {
                insertPayload.tab_type = input.tabType
            }

            if (input.modelId) insertPayload.model_id = input.modelId
            if (input.modelName) insertPayload.model_name = input.modelName

            const { data, error } = await supabase
                .from('panel_messages')
                .insert(insertPayload)
                .select()
                .single()

            if (error) {
                log.error('[PanelMessagesRouter] Error inserting message:', error)
                throw new Error(error.message)
            }

            return data
        }),

    // Update a message
    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            content: z.string().optional(),
            metadata: z.any().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership
            const { data: message } = await supabase
                .from('panel_messages')
                .select('id')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .maybeSingle()

            if (!message) {
                throw new Error('Message not found or access denied')
            }

            const updateData: Record<string, unknown> = {}

            if (input.content !== undefined) updateData.content = input.content
            if (input.metadata !== undefined) updateData.metadata = input.metadata

            const { data, error } = await supabase
                .from('panel_messages')
                .update(updateData)
                .eq('id', input.id)
                .select()
                .single()

            if (error) {
                log.error('[PanelMessagesRouter] Error updating message:', error)
                throw new Error(error.message)
            }

            return data
        }),

    // Delete a message
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership
            const { data: message } = await supabase
                .from('panel_messages')
                .select('id')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .maybeSingle()

            if (!message) {
                throw new Error('Message not found or access denied')
            }

            const { error } = await supabase
                .from('panel_messages')
                .delete()
                .eq('id', input.id)

            if (error) {
                log.error('[PanelMessagesRouter] Error deleting message:', error)
                throw new Error(error.message)
            }

            return { success: true }
        }),

    // Clear all messages for a panel
    clear: protectedProcedure
        .input(z.object({
            panelType: z.enum(['pdf_chat', 'agent_panel']),
            sourceId: z.string(),
            tabType: z.enum(['excel', 'doc', 'pdf']).optional()
        }))
        .mutation(async ({ ctx, input }) => {
            let query = supabase
                .from('panel_messages')
                .delete()
                .eq('user_id', ctx.userId)
                .eq('panel_type', input.panelType)
                .eq('source_id', input.sourceId)

            // For agent_panel, filter by tab_type
            if (input.panelType === 'agent_panel' && input.tabType) {
                query = query.eq('tab_type', input.tabType)
            }

            const { error } = await query

            if (error) {
                log.error('[PanelMessagesRouter] Error clearing messages:', error)
                throw new Error(error.message)
            }

            return { success: true }
        })
})
