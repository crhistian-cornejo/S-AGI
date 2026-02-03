import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase, isSupabaseConfigured } from '../../supabase/client'
import { ArtifactTypeSchema } from '@s-agi/core/types'
import { getStorageAdapter, getStorageMode } from '../../storage'
import log from 'electron-log'

/**
 * Check if we should use local storage mode
 * Defaults to local - cloud sync is a future premium feature
 */
function isLocalMode(): boolean {
    const mode = getStorageMode()
    if (mode === 'local') {
        return true
    }
    return !isSupabaseConfigured()
}

/**
 * Map local artifact (camelCase) to Supabase format (snake_case)
 */
function mapLocalArtifactToSnakeCase(artifact: any) {
    return {
        id: artifact.id,
        chat_id: artifact.chatId,
        user_id: artifact.userId,
        message_id: artifact.messageId,
        type: artifact.type,
        name: artifact.name,
        content: artifact.content,
        univer_data: artifact.univerData,
        created_at: artifact.createdAt?.toISOString?.() || artifact.createdAt,
        updated_at: artifact.updatedAt?.toISOString?.() || artifact.updatedAt,
    }
}

export const artifactsRouter = router({
    // List artifacts for a chat
    list: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid()
        }))
        .query(async ({ ctx, input }) => {
            // Use local storage in local mode
            if (isLocalMode()) {
                log.debug('[Artifacts] Local mode - listing artifacts for chatId:', input.chatId)
                const adapter = await getStorageAdapter()
                const artifacts = await adapter.artifacts.list(input.chatId, 'local-user')
                return artifacts.map(mapLocalArtifactToSnakeCase)
            }

            // Cloud mode: Verify chat ownership
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
                .select('id, chat_id, type, name, content, created_at, updated_at')
                .eq('chat_id', input.chatId)
                .order('created_at', { ascending: false })

            if (error) throw new Error(error.message)
            return data
        }),

    // List standalone artifacts (not associated with any chat)
    listStandalone: protectedProcedure
        .input(z.object({
            type: ArtifactTypeSchema.optional()
        }).optional())
        .query(async ({ ctx, input }) => {
            // Use local storage in local mode
            if (isLocalMode()) {
                log.debug('[Artifacts] Local mode - listing standalone artifacts')
                const adapter = await getStorageAdapter()
                const artifacts = await adapter.artifacts.listStandalone('local-user')
                // Filter by type if specified
                const filtered = input?.type
                    ? artifacts.filter(a => a.type === input.type)
                    : artifacts
                return filtered.map(mapLocalArtifactToSnakeCase)
            }

            let query = supabase
                .from('artifacts')
                .select('id, chat_id, user_id, type, name, content, created_at, updated_at')
                .eq('user_id', ctx.userId)
                .is('chat_id', null)
                .order('updated_at', { ascending: false })

            if (input?.type) {
                query = query.eq('type', input.type)
            }

            const { data, error } = await query

            if (error) throw new Error(error.message)
            return data
        }),

    // List all user artifacts (both chat-associated and standalone)
    listAll: protectedProcedure
        .input(z.object({
            type: ArtifactTypeSchema.optional(),
            limit: z.number().min(1).max(100).optional()
        }).optional())
        .query(async ({ ctx, input }) => {
            // Use local storage in local mode
            if (isLocalMode()) {
                log.debug('[Artifacts] Local mode - listing all artifacts')
                const adapter = await getStorageAdapter()
                let artifacts = await adapter.artifacts.listAll('local-user')
                // Filter by type if specified
                if (input?.type) {
                    artifacts = artifacts.filter(a => a.type === input.type)
                }
                // Apply limit
                if (input?.limit) {
                    artifacts = artifacts.slice(0, input.limit)
                }
                return artifacts.map(mapLocalArtifactToSnakeCase)
            }

            let query = supabase
                .from('artifacts')
                .select('id, chat_id, user_id, type, name, content, created_at, updated_at')
                .or(`user_id.eq.${ctx.userId},chat_id.in.(select id from chats where user_id = '${ctx.userId}')`)
                .order('updated_at', { ascending: false })

            if (input?.type) {
                query = query.eq('type', input.type)
            }

            if (input?.limit) {
                query = query.limit(input.limit)
            }

            const { data, error } = await query

            if (error) throw new Error(error.message)
            return data
        }),

    // Get a single artifact
    get: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Use local storage in local mode
            if (isLocalMode()) {
                log.debug('[Artifacts] Local mode - getting artifact:', input.id)
                const adapter = await getStorageAdapter()
                const artifact = await adapter.artifacts.get(input.id, 'local-user')
                if (!artifact) throw new Error('Artifact not found')
                return mapLocalArtifactToSnakeCase(artifact)
            }

            // First try to get artifact with chat join
            const { data: artifact, error } = await supabase
                .from('artifacts')
                .select('*, chats(user_id)')
                .eq('id', input.id)
                .single()

            if (error) throw new Error(error.message)

            // Check ownership: direct user_id or via chat
            const hasDirectOwnership = artifact.user_id === ctx.userId
            const chatData = Array.isArray(artifact.chats) ? artifact.chats[0] : artifact.chats
            const hasChatOwnership = chatData?.user_id === ctx.userId

            if (!hasDirectOwnership && !hasChatOwnership) {
                throw new Error('Access denied')
            }

            return artifact
        }),

    // Create an artifact (with or without chat association)
    create: protectedProcedure
        .input(z.object({
            chatId: z.string().uuid().optional(), // Now optional!
            messageId: z.string().uuid().optional(),
            type: ArtifactTypeSchema,
            name: z.string(),
            content: z.any().default({}),
            univerData: z.any().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            // Use local storage in local mode
            if (isLocalMode()) {
                log.debug('[Artifacts] Local mode - creating artifact:', input.name)
                const adapter = await getStorageAdapter()
                const artifact = await adapter.artifacts.create({
                    chatId: input.chatId || undefined,
                    userId: 'local-user',
                    messageId: input.messageId,
                    type: input.type as any, // Type union mismatch between zod and storage types
                    name: input.name,
                    content: input.content,
                    univerData: input.univerData
                })
                return mapLocalArtifactToSnakeCase(artifact)
            }

            // If chatId provided, verify chat ownership
            if (input.chatId) {
                const { data: chat } = await supabase
                    .from('chats')
                    .select('id')
                    .eq('id', input.chatId)
                    .eq('user_id', ctx.userId)
                    .single()

                if (!chat) {
                    throw new Error('Chat not found or access denied')
                }
            }

            const { data, error } = await supabase
                .from('artifacts')
                .insert({
                    chat_id: input.chatId || null,
                    user_id: ctx.userId, // Always set user_id for direct ownership
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
            // Use local storage in local mode
            if (isLocalMode()) {
                log.debug('[Artifacts] Local mode - updating artifact:', input.id)
                const adapter = await getStorageAdapter()
                const { id, ...updates } = input
                const artifact = await adapter.artifacts.update(id, 'local-user', updates)
                return mapLocalArtifactToSnakeCase(artifact)
            }

            // Verify ownership (direct or via chat)
            const { data: artifact } = await supabase
                .from('artifacts')
                .select('id, chat_id, user_id, chats(user_id)')
                .eq('id', input.id)
                .single()

            if (!artifact) {
                throw new Error('Artifact not found')
            }

            // Check ownership: direct user_id or via chat
            const hasDirectOwnership = artifact.user_id === ctx.userId
            const chatData = Array.isArray(artifact.chats) ? artifact.chats[0] : artifact.chats
            const hasChatOwnership = chatData?.user_id === ctx.userId

            if (!hasDirectOwnership && !hasChatOwnership) {
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
            // Use local storage in local mode
            if (isLocalMode()) {
                log.debug('[Artifacts] Local mode - deleting artifact:', input.id)
                const adapter = await getStorageAdapter()
                await adapter.artifacts.delete(input.id, 'local-user')
                return { success: true }
            }

            // Verify ownership (direct or via chat)
            const { data: artifact } = await supabase
                .from('artifacts')
                .select('id, chat_id, user_id, chats(user_id)')
                .eq('id', input.id)
                .single()

            if (!artifact) {
                throw new Error('Artifact not found')
            }

            // Check ownership: direct user_id or via chat
            const hasDirectOwnership = artifact.user_id === ctx.userId
            const chatData = Array.isArray(artifact.chats) ? artifact.chats[0] : artifact.chats
            const hasChatOwnership = chatData?.user_id === ctx.userId

            if (!hasDirectOwnership && !hasChatOwnership) {
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
            // Use local storage in local mode
            if (isLocalMode()) {
                log.debug('[Artifacts] Local mode - saving Univer snapshot:', input.id)
                const adapter = await getStorageAdapter()
                const artifact = await adapter.artifacts.update(input.id, 'local-user', {
                    univerData: input.univerData
                })
                return mapLocalArtifactToSnakeCase(artifact)
            }

            // Verify ownership (direct or via chat)
            const { data: artifact } = await supabase
                .from('artifacts')
                .select('id, chat_id, user_id, chats(user_id)')
                .eq('id', input.id)
                .single()

            if (!artifact) {
                throw new Error('Artifact not found')
            }

            // Check ownership: direct user_id or via chat
            const hasDirectOwnership = artifact.user_id === ctx.userId
            const chatData = Array.isArray(artifact.chats) ? artifact.chats[0] : artifact.chats
            const hasChatOwnership = chatData?.user_id === ctx.userId

            if (!hasDirectOwnership && !hasChatOwnership) {
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
