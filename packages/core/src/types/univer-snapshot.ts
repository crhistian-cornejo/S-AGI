/**
 * Univer Snapshot Types
 *
 * Comprehensive types for Univer workbook snapshots.
 * These match the actual runtime data structure used by Univer,
 * replacing `any` usage in diff, stats, and version-history code.
 */
import { z } from 'zod'

// =====================================================
// CELL STYLE
// =====================================================

export const UniverColorSchema = z.object({
  rgb: z.string().optional(),
}).passthrough()

export const UniverBorderStyleSchema = z.record(z.unknown())

export const UniverCellStyleSchema = z.object({
  bg: UniverColorSchema.optional(),         // Background color
  cl: UniverColorSchema.optional(),         // Text color
  bl: z.number().optional(),                // Bold (1 = bold)
  it: z.number().optional(),                // Italic (1 = italic)
  ul: z.object({ s: z.number().optional() }).optional(), // Underline
  st: z.object({ s: z.number().optional() }).optional(), // Strikethrough
  fs: z.number().optional(),                // Font size
  ff: z.string().optional(),                // Font family
  ht: z.number().optional(),                // Horizontal alignment
  vt: z.number().optional(),                // Vertical alignment
  tb: z.number().optional(),                // Text wrap
  tr: z.object({ a: z.number().optional() }).optional(), // Text rotation
  pd: z.object({                            // Padding
    t: z.number().optional(),
    r: z.number().optional(),
    b: z.number().optional(),
    l: z.number().optional(),
  }).optional(),
  bd: UniverBorderStyleSchema.optional(),   // Borders
}).passthrough()

export type UniverCellStyle = z.infer<typeof UniverCellStyleSchema>

// =====================================================
// CELL
// =====================================================

export const UniverCellSchema = z.object({
  v: z.union([z.string(), z.number(), z.boolean()]).optional(), // Value
  s: z.union([z.string(), UniverCellStyleSchema]).optional(),   // Style (ID or inline)
  t: z.number().optional(),                                     // Cell type
  f: z.string().optional(),                                     // Formula
  si: z.string().optional(),                                    // Style index
  p: z.record(z.unknown()).optional(),                          // Rich text
}).passthrough()

export type UniverCell = z.infer<typeof UniverCellSchema>

/**
 * Cell data is stored as a sparse 2D record: row -> col -> cell
 * Keys are numeric strings representing row/col indices.
 */
export type UniverCellDataMap = Record<string, Record<string, UniverCell>>

// =====================================================
// MERGE DATA
// =====================================================

export const UniverMergeSchema = z.object({
  startRow: z.number(),
  endRow: z.number(),
  startColumn: z.number(),
  endColumn: z.number(),
})

export type UniverMerge = z.infer<typeof UniverMergeSchema>

// =====================================================
// ROW / COLUMN METADATA
// =====================================================

export const UniverRowDataSchema = z.object({
  h: z.number().optional(),   // Height
  hd: z.number().optional(),  // Hidden
}).passthrough()

export const UniverColumnDataSchema = z.object({
  w: z.number().optional(),   // Width
  hd: z.number().optional(),  // Hidden
}).passthrough()

// =====================================================
// SHEET
// =====================================================

export const UniverSheetSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  rowCount: z.number().optional(),
  columnCount: z.number().optional(),
  cellData: z.record(z.record(UniverCellSchema)).optional(),
  mergeData: z.array(UniverMergeSchema).optional(),
  rowData: z.record(UniverRowDataSchema).optional(),
  columnData: z.record(UniverColumnDataSchema).optional(),
}).passthrough()

export type UniverSheetSnapshot = z.infer<typeof UniverSheetSnapshotSchema>

// =====================================================
// WORKBOOK SNAPSHOT
// =====================================================

export const UniverResourceSchema = z.object({
  name: z.string(),
  data: z.string(),
})

export const UniverSnapshotSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  sheetOrder: z.array(z.string()).optional(),
  sheets: z.record(UniverSheetSnapshotSchema).optional(),
  resources: z.array(UniverResourceSchema).optional(),
}).passthrough()

export type UniverSnapshot = z.infer<typeof UniverSnapshotSchema>
