# 🔴 PRIORITY 1: Centralize File Configurations

**Status**: 🟡 PENDING  
**Severity**: 🔴 CRITICAL  
**Estimated Time**: 2-3 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Problem**: File size limits and compression configurations are scattered across 3+ files, making it impossible to maintain consistency and easy to introduce inconsistencies.

---

## 🎯 Objectives

1. Create centralized file configuration in `shared/`
2. Consolidate all file-related constants
3. Update all usage points
4. Prevent future inconsistencies

---

## 📋 Scattered Configurations

| Location | Config | Value |
|----------|---------|-------|
| `lib/use-file-upload.ts:31` | `COMPRESSION_CONFIG` | MAX_WIDTH: 1920, QUALITY: 0.75 |
| `lib/use-file-upload.ts:31` | `MAX_FILES` | 5 |
| `lib/use-file-upload.ts:31` | `MAX_SIZE` | 512MB |
| `ai/image-processor.ts:24` | `MAX_HEIC_SIZE` | 50MB |
| `ai/image-processor.ts:25` | `MAX_IMAGE_SIZE` | 20MB |
| `lib/use-document-upload.ts:34` | `MAX_FILE_SIZE` | 100MB |

---

## 🔍 Issues Identified

1. **Inconsistencies**: Different max sizes for similar operations
2. **Duplication**: COMPRESSION_CONFIG defined in multiple places
3. **Magic numbers**: Some values hardcoded inline
4. **No single source of truth**: Changes require updating multiple files
5. **Type safety**: No zod schema for runtime validation

---

## 🔧 Implementation Plan

### Step 1: Create centralized config (30 min)

```typescript
// src/shared/file-config.ts

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  MAX_UPLOAD_SIZE: 512 * 1024 * 1024, // 512MB
  MAX_IMAGE_SIZE: 20 * 1024 * 1024, // 20MB
  MAX_HEIC_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_DOCUMENT_SIZE: 100 * 1024 * 1024, // 100MB
} as const

// Upload limits
export const UPLOAD_LIMITS = {
  MAX_FILES_PER_UPLOAD: 5,
  MAX_CONCURRENT_UPLOADS: 3,
} as const

// Compression settings
export const COMPRESSION_CONFIG = {
  IMAGES: {
    MAX_WIDTH: 1920,
    MAX_HEIGHT: 1920,
    QUALITY: 0.75,
    FORMAT: 'image/webp' as const,
  },
  DOCUMENTS: {
    ENABLED: true,
    MAX_REDUCTION: 0.7,
  },
} as const

// Accepted file types
export const ACCEPTED_FILE_TYPES = {
  IMAGES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/gif',
    'image/svg+xml',
  ] as const,
  DOCUMENTS: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ] as const,
  SPREADSHEETS: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ] as const,
} as const

// Combined accepted types
export const ALL_ACCEPTED_TYPES = [
  ...ACCEPTED_FILE_TYPES.IMAGES,
  ...ACCEPTED_FILE_TYPES.DOCUMENTS,
  ...ACCEPTED_FILE_TYPES.SPREADSHEETS,
] as const

// Helper functions
export function isImageType(mimeType: string): boolean {
  return ACCEPTED_FILE_TYPES.IMAGES.includes(mimeType as any)
}

export function isDocumentType(mimeType: string): boolean {
  return ACCEPTED_FILE_TYPES.DOCUMENTS.includes(mimeType as any)
}

export function isSpreadsheetType(mimeType: string): boolean {
  return ACCEPTED_FILE_TYPES.SPREADSHEETS.includes(mimeType as any)
}

export function isAcceptedType(mimeType: string): boolean {
  return ALL_ACCEPTED_TYPES.includes(mimeType as any)
}

export function getMaxSizeForType(mimeType: string): number {
  if (isImageType(mimeType)) return FILE_SIZE_LIMITS.MAX_IMAGE_SIZE
  if (isDocumentType(mimeType)) return FILE_SIZE_LIMITS.MAX_DOCUMENT_SIZE
  if (isSpreadsheetType(mimeType)) return FILE_SIZE_LIMITS.MAX_UPLOAD_SIZE
  return FILE_SIZE_LIMITS.MAX_UPLOAD_SIZE
}

// Validation schemas
import { z } from 'zod'

export const fileUploadSchema = z.object({
  file: z.instanceof(File),
  type: z.enum(ALL_ACCEPTED_TYPES as [string, ...string[]]),
  size: z.number().max(FILE_SIZE_LIMITS.MAX_UPLOAD_SIZE),
})

export const imageFileSchema = z.object({
  file: z.instanceof(File),
  type: z.enum(ACCEPTED_FILE_TYPES.IMAGES as [string, ...string[]]),
  size: z.number().max(FILE_SIZE_LIMITS.MAX_IMAGE_SIZE),
})

export const documentFileSchema = z.object({
  file: z.instanceof(File),
  type: z.enum(ACCEPTED_FILE_TYPES.DOCUMENTS as [string, ...string[]]),
  size: z.number().max(FILE_SIZE_LIMITS.MAX_DOCUMENT_SIZE),
})

// Export all as single object for convenience
export const FILE_CONFIG = {
  SIZE_LIMITS: FILE_SIZE_LIMITS,
  UPLOAD_LIMITS,
  COMPRESSION: COMPRESSION_CONFIG,
  ACCEPTED_TYPES: ACCEPTED_FILE_TYPES,
  ALL_ACCEPTED_TYPES,
} as const

export type FileConfig = typeof FILE_CONFIG
```

### Step 2: Update use-file-upload.ts (30 min)

```typescript
// src/renderer/lib/use-file-upload.ts
import { FILE_CONFIG, fileUploadSchema, getMaxSizeForType } from '@/shared/file-config'

// Remove old definitions
// ❌ const COMPRESSION_CONFIG = { ... }
// ❌ const MAX_FILES = 5
// ❌ const MAX_SIZE = 512 * 1024 * 1024

function validateFile(file: File): { valid: boolean; error?: string } {
  const result = fileUploadSchema.safeParse({
    file,
    type: file.type,
    size: file.size,
  })

  if (!result.success) {
    return { valid: false, error: result.error.issues[0].message }
  }

  return { valid: true }
}

function getMaxFileSize(file: File): number {
  return getMaxSizeForType(file.type)
}

// Use new config
const maxFiles = FILE_CONFIG.UPLOAD_LIMITS.MAX_FILES_PER_UPLOAD
const compressionConfig = FILE_CONFIG.COMPRESSION.IMAGES
```

### Step 3: Update use-document-upload.ts (20 min)

```typescript
// src/renderer/lib/use-document-upload.ts
import { FILE_CONFIG, documentFileSchema } from '@/shared/file-config'

// Remove: const MAX_FILE_SIZE = 100 * 1024 * 1024

function validateDocument(file: File): { valid: boolean; error?: string } {
  const result = documentFileSchema.safeParse({
    file,
    type: file.type,
    size: file.size,
  })

  if (!result.success) {
    return { valid: false, error: result.error.issues[0].message }
  }

  return { valid: true }
}
```

### Step 4: Update image-processor.ts (20 min)

```typescript
// src/main/lib/ai/image-processor.ts
import { FILE_CONFIG, imageFileSchema } from '@/shared/file-config'

// Remove:
// ❌ const MAX_HEIC_SIZE = 50 * 1024 * 1024
// ❌ const MAX_IMAGE_SIZE = 20 * 1024 * 1024

function validateImage(file: File): { valid: boolean; error?: string } {
  const result = imageFileSchema.safeParse({
    file,
    type: file.type,
    size: file.size,
  })

  if (!result.success) {
    return { valid: false, error: result.error.issues[0].message }
  }

  return { valid: true }
}
```

### Step 5: Search for other usages (30 min)

```bash
# Search for hardcoded file sizes
grep -r "1024.*1024" src --include="*.ts" --include="*.tsx"
grep -r "MAX_SIZE\|MAX_FILE\|MAX_UPLOAD" src --include="*.ts" --include="*.tsx"
```

Update any other files with hardcoded values.

### Step 6: Update shared/index.ts (10 min)

```typescript
// src/shared/index.ts
export * from './file-config'
export * from './attachment-schema' // If we create this
```

### Step 7: Test all file upload flows (45 min)

- Test image upload
- Test document upload
- Test spreadsheet upload
- Test file size validation
- Test file type validation
- Test compression
- Test multiple file uploads
- Test error messages

### Step 8: Update AGENTS.md (15 min)

Add documentation:
```markdown
## File Configuration

All file-related configurations are centralized in `src/shared/file-config.ts`:

```typescript
import { FILE_CONFIG, getMaxSizeForType } from '@/shared/file-config'

const maxSize = getMaxSizeForType(file.type)
```

### Size Limits

- **Images**: 20MB
- **Documents**: 100MB
- **Uploads**: 512MB

### Compression

Images are automatically compressed using `COMPRESSION_CONFIG`.
```

---

## ✅ Acceptance Criteria

- [ ] Centralized file config created
- [ ] All hardcoded sizes replaced
- [ ] All validation schemas in place
- [ ] All imports updated
- [ ] All file upload flows tested
- [ ] AGENTS.md updated
- [ ] Code review completed

---

## 🧪 Testing Strategy

```typescript
describe('FILE_CONFIG', () => {
  describe('size limits', () => {
    it('should have correct image size limit', () => {
      expect(FILE_CONFIG.SIZE_LIMITS.MAX_IMAGE_SIZE).toBe(20 * 1024 * 1024)
    })

    it('should have correct document size limit', () => {
      expect(FILE_CONFIG.SIZE_LIMITS.MAX_DOCUMENT_SIZE).toBe(100 * 1024 * 1024)
    })
  })

  describe('type checking', () => {
    it('should identify image types', () => {
      expect(isImageType('image/jpeg')).toBe(true)
      expect(isImageType('application/pdf')).toBe(false)
    })

    it('should identify document types', () => {
      expect(isDocumentType('application/pdf')).toBe(true)
      expect(isDocumentType('image/jpeg')).toBe(false)
    })
  })

  describe('validation', () => {
    it('should validate valid image file', () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      const result = imageFileSchema.safeParse({ file, type: file.type, size: 1024 })
      expect(result.success).toBe(true)
    })

    it('should reject oversized file', () => {
      const file = new File(['x'.repeat(100 * 1024 * 1024)], 'test.jpg', { type: 'image/jpeg' })
      const result = imageFileSchema.safeParse({ file, type: file.type, size: 100 * 1024 * 1024 })
      expect(result.success).toBe(false)
    })
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing uploads | HIGH | Thorough testing of all upload flows |
| Validation too strict | MEDIUM | Review existing valid files |
| Type mismatch | MEDIUM | Use zod schemas for runtime validation |
| Performance regression | LOW | No logic changes, just reorganization |

---

## 📊 Metrics

**Before**:
- Files with config: 3+
- Lines of duplicated config: ~50
- Magic numbers: ~10
- Validation: Manual, inconsistent

**After**:
- Files with config: 1
- Lines of config: ~150 (well-documented)
- Magic numbers: 0
- Validation: Zod schemas, consistent

---

## 🔄 Rollback Plan

```bash
# If issues arise:
git checkout HEAD~1 -- src/shared/file-config.ts
git checkout HEAD~1 -- src/renderer/lib/use-file-upload.ts
git checkout HEAD~1 -- src/renderer/lib/use-document-upload.ts
git checkout HEAD~1 -- src/main/lib/ai/image-processor.ts
git checkout HEAD~1 -- src/shared/index.ts
git checkout HEAD~1 -- AGENTS.md
rm src/shared/file-config.ts
```

---

## 📝 Notes

- Use `as const` for type inference
- Helper functions improve DX
- Zod schemas provide runtime validation
- Consider adding per-user size limits in future
- Document reasoning for each limit

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 1.3.3
- [AGENTS.md](../../AGENTS.md) - Configuration guidelines

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
