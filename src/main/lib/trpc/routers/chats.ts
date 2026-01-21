import log from 'electron-log'
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'

async function cleanupChatFiles(chatId: string, userId: string): Promise<void> {
    log.info('[Chats] Starting cleanup for chat:', chatId)
    
    try {
        const deletedFiles: string[] = []
        const failedFiles: string[] = []

        const { data: chatFiles, error: fetchError } = await supabase
            .from('chat_files')
            .select('id, storage_path, openai_file_id, openai_vector_store_file_id, filename')
            .eq('chat_id', chatId)
            .eq('user_id', userId)

        if (fetchError) {
            log.error('[Chats] Failed to fetch chat_files for cleanup:', fetchError)
            return
        }

        if (!chatFiles || chatFiles.length === 0) {
            log.info('[Chats] No chat_files to clean up for chat:', chatId)
        } else {
            log.info('[Chats] Found', chatFiles.length, 'chat_files to clean up')

            const storagePaths: string[] = []
            for (const file of chatFiles) {
                if (file.storage_path) {
                    storagePaths.push(file.storage_path)
                }
            }

            if (storagePaths.length > 0) {
                const { error: deleteError } = await supabase.storage
                    .from('attachments')
                    .remove(storagePaths)

                if (deleteError) {
                    log.error('[Chats] Failed to delete files from storage:', deleteError)
                    failedFiles.push(...storagePaths)
                } else {
                    deletedFiles.push(...storagePaths)
                    log.info('[Chats] Deleted', deletedFiles.length, 'files from storage')
                }
            }

            const { error: dbDeleteError } = await supabase
                .from('chat_files')
                .delete()
                .eq('chat_id', chatId)
                .eq('user_id', userId)

            if (dbDeleteError) {
                log.error('[Chats] Failed to delete chat_files from DB:', dbDeleteError)
            } else {
                log.info('[Chats] Deleted chat_files records from DB')
            }
        }

        const { data: messages, error: messagesError } = await supabase
            .from('chat_messages')
            .select('id, attachments')
            .eq('chat_id', chatId)
            .eq('user_id', userId)

        if (messagesError) {
            log.error('[Chats] Failed to fetch messages for cleanup:', messagesError)
        } else if (messages && messages.length > 0) {
            log.info('[Chats] Found', messages.length, 'messages to clean up')

            const attachmentPaths: string[] = []
            for (const msg of messages) {
                if (msg.attachments && Array.isArray(msg.attachments)) {
                    for (const attachment of msg.attachments) {
                        if (attachment.storagePath && attachment.storagePath.startsWith(`${userId}/`)) {
                            attachmentPaths.push(attachment.storagePath)
                        }
                    }
                }
            }

            if (attachmentPaths.length > 0) {
                const { error: storageError } = await supabase.storage
                    .from('attachments')
                    .remove(attachmentPaths)

                if (storageError) {
                    log.error('[Chats] Failed to delete message attachments from storage:', storageError)
                } else {
                    log.info('[Chats] Deleted', attachmentPaths.length, 'message attachments from storage')
                }
            }

            const { error: messagesDeleteError } = await supabase
                .from('chat_messages')
                .delete()
                .eq('chat_id', chatId)
                .eq('user_id', userId)

            if (messagesDeleteError) {
                log.error('[Chats] Failed to delete messages from DB:', messagesDeleteError)
            } else {
                log.info('[Chats] Deleted', messages.length, 'messages from DB')
            }
        }

        log.info('[Chats] Cleanup completed for chat:', chatId, {
            deletedFilesCount: deletedFiles.length,
            failedFilesCount: failedFiles.length
        })
    } catch (err) {
        log.error('[Chats] Error during cleanup for chat:', chatId, err)
    }
}

async function enrichWithMeta<T extends { id: string }>(
    chats: T[]
): Promise<(T & { meta: { spreadsheets: number; documents: number; hasCode: boolean; hasImages: boolean } })[]> {
    if (!chats.length) return chats as (T & { meta: { spreadsheets: number; documents: number; hasCode: boolean; hasImages: boolean } })[]
    const ids = chats.map((c) => c.id)

    const [artifactsRes, codeRes, messagesRes] = await Promise.all([
        supabase.from('artifacts').select('chat_id, type').in('chat_id', ids),
        supabase.from('chat_messages').select('chat_id').in('chat_id', ids).ilike('content', '%```%'),
        supabase.from('chat_messages').select('chat_id, metadata').in('chat_id', ids).limit(2000)
    ])

    const artMap: Record<string, { spreadsheets: number; documents: number }> = {}
    for (const id of ids) artMap[id] = { spreadsheets: 0, documents: 0 }
    for (const row of artifactsRes.data || []) {
        const cur = artMap[row.chat_id]
        if (cur) {
            if (row.type === 'spreadsheet') cur.spreadsheets += 1
            else if (row.type === 'document') cur.documents += 1
        }
    }

    const codeSet = new Set<string>()
    for (const row of codeRes.data || []) codeSet.add(row.chat_id)

    const imageSet = new Set<string>()
    for (const row of messagesRes.data || []) {
        try {
            const tc = (row.metadata as { tool_calls?: { name?: string }[] })?.tool_calls || []
            if (tc.some((t) => t?.name === 'generate_image' || t?.name === 'edit_image')) imageSet.add(row.chat_id)
        } catch {
            /* ignore */
        }
    }

    return chats.map((c) => ({
        ...c,
        meta: {
            spreadsheets: artMap[c.id]?.spreadsheets ?? 0,
            documents: artMap[c.id]?.documents ?? 0,
            hasCode: codeSet.has(c.id),
            hasImages: imageSet.has(c.id)
        }
    }))
}

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
                    .is('deleted_at', null)

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
                            .is('deleted_at', null)
                            .order('updated_at', { ascending: false })
                        
                        const { data: fbData, error: fbError } = await (input?.includeArchived ? fallbackQuery : fallbackQuery.eq('archived', false))
                        if (fbError) throw new Error(fbError.message)
                        return enrichWithMeta(fbData || [])
                    }
                    
                    log.error('[Chats] List error:', error)
                    throw new Error(error.message)
                }
                return enrichWithMeta(data || [])
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
                    .is('deleted_at', null)
                    .order('updated_at', { ascending: false })

                if (error) {
                    log.error('[Chats] List archived error:', error)
                    throw new Error(error.message)
                }
                return enrichWithMeta(data || [])
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
                .is('deleted_at', null)
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

    // Soft delete a chat (allow undo)
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Get chat data first for undo capability
            const { data: chatData, error: fetchError } = await supabase
                .from('chats')
                .select('*')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .single()

            if (fetchError) throw new Error(fetchError.message)

            // Clean up files BEFORE soft delete
            await cleanupChatFiles(input.id, ctx.userId)

            const { data, error } = await supabase
                .from('chats')
                .update({
                    deleted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            log.info('[Chats] Soft deleted chat:', input.id)
            return { success: true, deletedChat: data ?? chatData }
        }),

    // Restore a soft-deleted chat
    restoreDeleted: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('chats')
                .update({
                    deleted_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) throw new Error(error.message)
            log.info('[Chats] Restored deleted chat:', input.id)
            return data
        })
})
