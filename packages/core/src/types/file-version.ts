/**
 * File Version Types
 *
 * Types for file version history, used by version-history components,
 * diff utilities, and the file management router.
 */
import { z } from 'zod'
import type { UniverSnapshot } from './univer-snapshot'

// =====================================================
// CHANGE TYPES
// =====================================================

export const FileVersionChangeTypeSchema = z.enum([
  'created',
  'auto_save',
  'manual_save',
  'ai_edit',
  'ai_create',
  'restore',
  'import',
])
export type FileVersionChangeType = z.infer<typeof FileVersionChangeTypeSchema>

// =====================================================
// FILE VERSION
// =====================================================

export const FileVersionSchema = z.object({
  id: z.string(),
  file_id: z.string(),
  version_number: z.number(),
  univer_data: z.unknown().optional(),
  content: z.string().optional(),
  change_type: FileVersionChangeTypeSchema,
  change_description: z.string().optional(),
  change_summary: z.unknown().optional(),
  created_by: z.string().optional(),
  ai_model: z.string().optional(),
  ai_prompt: z.string().optional(),
  tool_name: z.string().optional(),
  size_bytes: z.number().optional(),
  created_at: z.string(),
  // Soft delete fields
  is_obsolete: z.boolean().optional(),
  obsoleted_at: z.string().optional(),
  obsoleted_by_version: z.number().optional(),
})

export type FileVersion = z.infer<typeof FileVersionSchema>

// =====================================================
// VERSION COMPARISON
// =====================================================

export interface VersionComparison {
  versionA: FileVersion
  versionB: FileVersion
}

export interface VersionComparisonData {
  old: { versionNumber: number; data: UniverSnapshot; createdAt: string }
  new: { versionNumber: number; data: UniverSnapshot; createdAt: string }
}
