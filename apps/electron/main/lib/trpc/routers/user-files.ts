import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import log from 'electron-log'

// Schemas
const fileTypeSchema = z.enum(['excel', 'doc', 'note'])
const changeTypeSchema = z.enum([
    'created', 'auto_save', 'manual_save',
    'ai_edit', 'ai_create', 'restore', 'import'
])

export const userFilesRouter = router({
    // ==================== QUERIES ====================

    // List files by type
    list: protectedProcedure
        .input(z.object({
            type: fileTypeSchema,
            includeArchived: z.boolean().default(false),
            limit: z.number().min(1).max(100).default(50),
            offset: z.number().min(0).default(0)
        }))
        .query(async ({ ctx, input }) => {
            let query = supabase
                .from('user_files')
                .select('id, name, type, description, icon, color, is_pinned, version_count, total_edits, created_at, updated_at, last_opened_at')
                .eq('user_id', ctx.userId)
                .eq('type', input.type)
                .is('deleted_at', null)
                .order('is_pinned', { ascending: false })
                .order('last_opened_at', { ascending: false, nullsFirst: false })
                .range(input.offset, input.offset + input.limit - 1)

            if (!input.includeArchived) {
                query = query.eq('is_archived', false)
            }

            const { data, error } = await query
            if (error) {
                log.error('[UserFilesRouter] Error listing files:', error)
                throw new Error(error.message)
            }
            return data || []
        }),

    // Get file by ID (full data including univer_data)
    get: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('user_files')
                .select('*')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .is('deleted_at', null)
                .single()

            if (error) {
                log.error('[UserFilesRouter] Error getting file:', error)
                throw new Error(error.message)
            }
            return data
        }),

    // Get the most recently opened file by type
    getLastOpened: protectedProcedure
        .input(z.object({ type: fileTypeSchema }))
        .query(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('user_files')
                .select('*')
                .eq('user_id', ctx.userId)
                .eq('type', input.type)
                .is('deleted_at', null)
                .eq('is_archived', false)
                .order('last_opened_at', { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle()

            if (error) {
                log.error('[UserFilesRouter] Error getting last opened file:', error)
                throw new Error(error.message)
            }
            return data
        }),

    // ==================== MUTATIONS ====================

    // Create new file
    create: protectedProcedure
        .input(z.object({
            type: fileTypeSchema,
            name: z.string().min(1).max(255),
            univerData: z.any().optional(),
            content: z.string().optional(),
            description: z.string().optional(),
            aiModel: z.string().optional(),
            aiPrompt: z.string().optional()
        }))
        .mutation(async ({ ctx, input }) => {
            // Create file
            const { data: file, error: fileError } = await supabase
                .from('user_files')
                .insert({
                    user_id: ctx.userId,
                    type: input.type,
                    name: input.name,
                    univer_data: input.univerData,
                    content: input.content,
                    description: input.description,
                    last_opened_at: new Date().toISOString(),
                    version_count: 1,
                    total_edits: 0
                })
                .select()
                .single()

            if (fileError) {
                log.error('[UserFilesRouter] Error creating file:', fileError)
                throw new Error(fileError.message)
            }

            // Create initial version
            const { error: versionError } = await supabase
                .from('file_versions')
                .insert({
                    file_id: file.id,
                    version_number: 1,
                    univer_data: input.univerData,
                    content: input.content,
                    change_type: input.aiModel ? 'ai_create' : 'created',
                    change_description: 'Archivo creado',
                    created_by: ctx.userId,
                    ai_model: input.aiModel,
                    ai_prompt: input.aiPrompt,
                    size_bytes: JSON.stringify(input.univerData || input.content || '').length
                })

            if (versionError) {
                log.error('[UserFilesRouter] Error creating initial version:', versionError)
                // Don't throw - file was created successfully
            }

            log.info('[UserFilesRouter] Created file:', file.id, file.name)
            return file
        }),

    // Update file (creates new version)
    update: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            name: z.string().optional(),
            univerData: z.any().optional(),
            content: z.string().optional(),
            description: z.string().optional(),
            metadata: z.any().optional(),
            changeType: changeTypeSchema.default('auto_save'),
            changeDescription: z.string().optional(),
            aiModel: z.string().optional(),
            aiPrompt: z.string().optional(),
            toolName: z.string().optional(),
            skipVersion: z.boolean().default(false)
        }))
        .mutation(async ({ ctx, input }) => {
            const { id, skipVersion, changeType, changeDescription, aiModel, aiPrompt, toolName, ...updates } = input

            // Get current file for version count
            const { data: currentFile, error: fetchError } = await supabase
                .from('user_files')
                .select('version_count, total_edits')
                .eq('id', id)
                .eq('user_id', ctx.userId)
                .single()

            if (fetchError) {
                log.error('[UserFilesRouter] Error fetching file for update:', fetchError)
                throw new Error(fetchError.message)
            }

            const updateData: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
                total_edits: (currentFile.total_edits || 0) + 1
            }

            if (updates.name !== undefined) updateData.name = updates.name
            if (updates.univerData !== undefined) updateData.univer_data = updates.univerData
            if (updates.content !== undefined) updateData.content = updates.content
            if (updates.description !== undefined) updateData.description = updates.description
            if (updates.metadata !== undefined) updateData.metadata = updates.metadata

            // Update file
            const { data: file, error: updateError } = await supabase
                .from('user_files')
                .update(updateData)
                .eq('id', id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (updateError) {
                log.error('[UserFilesRouter] Error updating file:', updateError)
                throw new Error(updateError.message)
            }

            // Create new version if needed
            if (!skipVersion && (updates.univerData !== undefined || updates.content !== undefined)) {
                const newVersionNumber = (currentFile.version_count || 0) + 1

                const { error: versionError } = await supabase
                    .from('file_versions')
                    .insert({
                        file_id: id,
                        version_number: newVersionNumber,
                        univer_data: updates.univerData,
                        content: updates.content,
                        change_type: changeType,
                        change_description: changeDescription || `Versión ${newVersionNumber}`,
                        created_by: ctx.userId,
                        ai_model: aiModel,
                        ai_prompt: aiPrompt,
                        tool_name: toolName,
                        size_bytes: JSON.stringify(updates.univerData || updates.content || '').length
                    })

                if (versionError) {
                    log.error('[UserFilesRouter] Error creating version:', versionError)
                } else {
                    // Update version count
                    await supabase
                        .from('user_files')
                        .update({ version_count: newVersionNumber })
                        .eq('id', id)

                    // Update returned file with new version count
                    file.version_count = newVersionNumber
                }
            }

            log.debug('[UserFilesRouter] Updated file:', id)
            return file
        }),

    // Mark file as opened
    markOpened: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('user_files')
                .update({ last_opened_at: new Date().toISOString() })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) {
                log.error('[UserFilesRouter] Error marking file as opened:', error)
                throw new Error(error.message)
            }
            return data
        }),

    // Delete file (soft delete)
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { error } = await supabase
                .from('user_files')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)

            if (error) {
                log.error('[UserFilesRouter] Error deleting file:', error)
                throw new Error(error.message)
            }

            log.info('[UserFilesRouter] Deleted file:', input.id)
            return { success: true }
        }),

    // Toggle pin
    togglePin: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { data: current } = await supabase
                .from('user_files')
                .select('is_pinned')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .single()

            const { data, error } = await supabase
                .from('user_files')
                .update({ is_pinned: !current?.is_pinned })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) {
                log.error('[UserFilesRouter] Error toggling pin:', error)
                throw new Error(error.message)
            }
            return data
        }),

    // Toggle archive
    toggleArchive: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const { data: current } = await supabase
                .from('user_files')
                .select('is_archived')
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .single()

            const { data, error } = await supabase
                .from('user_files')
                .update({ is_archived: !current?.is_archived })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) {
                log.error('[UserFilesRouter] Error toggling archive:', error)
                throw new Error(error.message)
            }
            return data
        }),

    // Rename file
    rename: protectedProcedure
        .input(z.object({
            id: z.string().uuid(),
            name: z.string().min(1).max(255)
        }))
        .mutation(async ({ ctx, input }) => {
            const { data, error } = await supabase
                .from('user_files')
                .update({ name: input.name })
                .eq('id', input.id)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (error) {
                log.error('[UserFilesRouter] Error renaming file:', error)
                throw new Error(error.message)
            }
            return data
        }),

    // ==================== VERSIONS ====================

    // List versions of a file
    listVersions: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid(),
            limit: z.number().min(1).max(100).default(50),
            offset: z.number().min(0).default(0)
        }))
        .query(async ({ ctx, input }) => {
            // Verify file ownership
            const { data: file } = await supabase
                .from('user_files')
                .select('id')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (!file) {
                throw new Error('File not found')
            }

            const { data, error } = await supabase
                .from('file_versions')
                .select('id, version_number, change_type, change_description, ai_model, tool_name, size_bytes, created_at')
                .eq('file_id', input.fileId)
                .order('version_number', { ascending: false })
                .range(input.offset, input.offset + input.limit - 1)

            if (error) {
                log.error('[UserFilesRouter] Error listing versions:', error)
                throw new Error(error.message)
            }
            return data || []
        }),

    // Get specific version
    getVersion: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid(),
            versionNumber: z.number().min(1)
        }))
        .query(async ({ ctx, input }) => {
            // Verify file ownership
            const { data: file } = await supabase
                .from('user_files')
                .select('id')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (!file) {
                throw new Error('File not found')
            }

            const { data, error } = await supabase
                .from('file_versions')
                .select('*')
                .eq('file_id', input.fileId)
                .eq('version_number', input.versionNumber)
                .single()

            if (error) {
                log.error('[UserFilesRouter] Error getting version:', error)
                throw new Error(error.message)
            }
            return data
        }),

    // Restore to a previous version
    restoreVersion: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid(),
            versionNumber: z.number().min(1)
        }))
        .mutation(async ({ ctx, input }) => {
            // Get the version to restore
            const { data: version, error: versionError } = await supabase
                .from('file_versions')
                .select('*')
                .eq('file_id', input.fileId)
                .eq('version_number', input.versionNumber)
                .single()

            if (versionError) {
                log.error('[UserFilesRouter] Error getting version to restore:', versionError)
                throw new Error(versionError.message)
            }

            // Get current file
            const { data: currentFile, error: fileError } = await supabase
                .from('user_files')
                .select('version_count')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (fileError) {
                log.error('[UserFilesRouter] Error getting current file:', fileError)
                throw new Error(fileError.message)
            }

            const newVersionNumber = (currentFile.version_count || 0) + 1

            // Update file with restored data
            const { data: updatedFile, error: updateError } = await supabase
                .from('user_files')
                .update({
                    univer_data: version.univer_data,
                    content: version.content,
                    version_count: newVersionNumber,
                    updated_at: new Date().toISOString()
                })
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .select()
                .single()

            if (updateError) {
                log.error('[UserFilesRouter] Error restoring file:', updateError)
                throw new Error(updateError.message)
            }

            // Create new version indicating the restore
            const { error: newVersionError } = await supabase
                .from('file_versions')
                .insert({
                    file_id: input.fileId,
                    version_number: newVersionNumber,
                    univer_data: version.univer_data,
                    content: version.content,
                    change_type: 'restore',
                    change_description: `Restaurado a versión ${input.versionNumber}`,
                    created_by: ctx.userId,
                    size_bytes: JSON.stringify(version.univer_data || version.content || '').length
                })

            if (newVersionError) {
                log.error('[UserFilesRouter] Error creating restore version:', newVersionError)
            }

            log.info('[UserFilesRouter] Restored file to version:', input.versionNumber)
            return updatedFile
        }),

    // Compare two versions
    compareVersions: protectedProcedure
        .input(z.object({
            fileId: z.string().uuid(),
            versionA: z.number().min(1),
            versionB: z.number().min(1)
        }))
        .query(async ({ ctx, input }) => {
            // Verify file ownership
            const { data: file } = await supabase
                .from('user_files')
                .select('id')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (!file) {
                throw new Error('File not found')
            }

            const { data, error } = await supabase
                .from('file_versions')
                .select('*')
                .eq('file_id', input.fileId)
                .in('version_number', [input.versionA, input.versionB])

            if (error) {
                log.error('[UserFilesRouter] Error comparing versions:', error)
                throw new Error(error.message)
            }

            const versionA = data?.find(v => v.version_number === input.versionA)
            const versionB = data?.find(v => v.version_number === input.versionB)

            return { versionA, versionB }
        }),

    // Get version stats for a file
    getVersionStats: protectedProcedure
        .input(z.object({ fileId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Verify file ownership
            const { data: file } = await supabase
                .from('user_files')
                .select('id, version_count, total_edits')
                .eq('id', input.fileId)
                .eq('user_id', ctx.userId)
                .single()

            if (!file) {
                throw new Error('File not found')
            }

            // Get counts by change type
            const { data: typeCounts, error } = await supabase
                .from('file_versions')
                .select('change_type')
                .eq('file_id', input.fileId)

            if (error) {
                log.error('[UserFilesRouter] Error getting version stats:', error)
                throw new Error(error.message)
            }

            const stats = {
                totalVersions: file.version_count || 0,
                totalEdits: file.total_edits || 0,
                byType: {} as Record<string, number>
            }

            typeCounts?.forEach(v => {
                stats.byType[v.change_type] = (stats.byType[v.change_type] || 0) + 1
            })

            return stats
        })
})
