# 🔴 PRIORITY 1: Centralize Attachment Schema

**Status**: 🟡 PENDING  
**Severity**: 🔴 CRITICAL  
**Estimated Time**: 1-2 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Problem**: `attachmentSchema` is duplicated in two locations - in `main/lib/trpc/routers/messages.ts` and in `shared/schemas/index.ts`. Any changes must be made in both places, leading to potential inconsistencies.

---

## 🎯 Objectives

1. Create single source of truth for attachment schema
2. Remove duplication
3. Update all import statements
4. Ensure type safety across main and renderer processes

---

## 📁 Current Duplications

### Location 1: `src/main/lib/trpc/routers/messages.ts:12`

```typescript
const attachmentSchema = z.object({
    id: z.string(),
    name: z.string(),
    size: z.number(),
    type: z.string(),
    url: z.string().optional(),
    preview: z.string().optional(),
    storagePath: z.string().optional()
})
```

### Location 2: `src/shared/schemas/index.ts:103`

```typescript
export const attachmentSchema = z.object({
    id: z.string(),
    name: z.string(),
    size: z.number(),
    type: z.string(),
    url: z.string().optional(),
    preview: z.string().optional(),
    storagePath: z.string().optional()
})
```

---

## 🔍 Issues Identified

1. **Duplication**: Same schema defined twice
2. **Synchronization risk**: Changes in one place not reflected in other
3. **Type inconsistency**: Could lead to subtle bugs
4. **Maintenance burden**: Any change requires 2 edits

---

## 🔧 Implementation Plan

### Step 1: Create dedicated attachment schema file (20 min)

```typescript
// src/shared/schemas/attachment-schema.ts
import { z } from 'zod'

export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
  url: z.string().optional(),
  preview: z.string().optional(),
  storagePath: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

export type Attachment = z.infer<typeof attachmentSchema>

// Derived types for convenience
export type AttachmentInput = z.input<typeof attachmentSchema>
export type AttachmentOutput = z.output<typeof attachmentSchema>

// Helper function to create attachment from file
export function createAttachmentFromFile(file: File): AttachmentInput {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type,
    url: undefined,
    preview: undefined,
    storagePath: undefined,
  }
}

// Helper function to validate attachment
export function isValidAttachment(data: unknown): data is Attachment {
  return attachmentSchema.safeParse(data).success
}

// Array of attachments
export const attachmentArraySchema = attachmentSchema.array()
export type AttachmentArray = z.infer<typeof attachmentArraySchema>
```

### Step 2: Update shared/schemas/index.ts (10 min)

```typescript
// src/shared/schemas/index.ts
export { attachmentSchema, Attachment, type AttachmentInput, type AttachmentOutput, createAttachmentFromFile, isValidAttachment, attachmentArraySchema, type AttachmentArray } from './attachment-schema'
```

### Step 3: Update main/lib/trpc/routers/messages.ts (15 min)

```typescript
// src/main/lib/trpc/routers/messages.ts
// Remove local definition:
// ❌ const attachmentSchema = z.object({ ... })

// Import from shared:
import { attachmentSchema, type Attachment } from '@/shared/schemas'

// Update any local type references:
// ❌ type LocalAttachment = { id: string, name: string, ... }
// ✅ type LocalAttachment = Attachment
```

### Step 4: Search for other usages (20 min)

```bash
# Find all files defining attachment schemas/types
grep -r "attachmentSchema\|interface.*Attachment" src --include="*.ts" --include="*.tsx"

# Find all files importing attachment schemas
grep -r "from.*schemas.*attachment" src --include="*.ts" --include="*.tsx"
```

Update any other locations defining or using attachment schemas.

### Step 5: Update main/index.ts if needed (10 min)

If there are other places needing the schema, ensure they import from shared.

### Step 6: Test all attachment operations (30 min)

- Test uploading attachments
- Test attachment validation
- Test attachment storage
- Test attachment retrieval
- Test attachment deletion
- Test attachment URL generation
- Test attachment preview

### Step 7: Update AGENTS.md (15 min)

Add documentation:
```markdown
## Shared Schemas

Common schemas are defined in `src/shared/schemas/`:

### Attachment Schema

```typescript
import { attachmentSchema, type Attachment } from '@/shared/schemas'

const attachment: Attachment = {
  id: '...',
  name: 'file.pdf',
  size: 1024,
  type: 'application/pdf',
  url: 'https://...'
}

// Validate
if (isValidAttachment(data)) {
  // data is Attachment
}
```
```

---

## ✅ Acceptance Criteria

- [ ] Single attachment schema file created
- [ ] All duplications removed
- [ ] All imports updated to use shared schema
- [ ] Type safety maintained
- [ ] All attachment operations tested
- [ ] AGENTS.md updated
- [ ] Code review completed

---

## 🧪 Testing Strategy

```typescript
describe('attachmentSchema', () => {
  it('should validate valid attachment', () => {
    const attachment = {
      id: '123',
      name: 'file.pdf',
      size: 1024,
      type: 'application/pdf',
      url: 'https://example.com/file.pdf',
    }
    const result = attachmentSchema.safeParse(attachment)
    expect(result.success).toBe(true)
  })

  it('should reject invalid attachment', () => {
    const attachment = {
      id: 123, // Should be string
      name: 'file.pdf',
      size: '1024', // Should be number
      type: 'application/pdf',
    }
    const result = attachmentSchema.safeParse(attachment)
    expect(result.success).toBe(false)
  })

  it('should create attachment from file', () => {
    const file = new File(['content'], 'file.pdf', { type: 'application/pdf' })
    const attachment = createAttachmentFromFile(file)
    expect(attachment.name).toBe('file.pdf')
    expect(attachment.type).toBe('application/pdf')
    expect(attachment.size).toBe(file.size)
  })

  it('should validate attachment with type guard', () => {
    const data = { id: '123', name: 'file.pdf', size: 1024, type: 'application/pdf' }
    expect(isValidAttachment(data)).toBe(true)
    expect(isValidAttachment({ invalid: 'data' })).toBe(false)
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes to existing data | MEDIUM | Use optional fields for new properties |
| Type mismatches across processes | MEDIUM | Thorough testing of IPC communication |
| Missing usages not updated | LOW | Global search for attachment references |
| Schema too restrictive | LOW | Review existing valid attachments |

---

## 📊 Metrics

**Before**:
- Duplicated schemas: 2
- Lines of duplicated code: ~20
- Maintenance points: 2

**After**:
- Duplicated schemas: 0
- Lines of code: ~50 (with helpers)
- Maintenance points: 1

---

## 🔄 Rollback Plan

```bash
# If issues arise:
git checkout HEAD~1 -- src/shared/schemas/attachment-schema.ts
git checkout HEAD~1 -- src/shared/schemas/index.ts
git checkout HEAD~1 -- src/main/lib/trpc/routers/messages.ts
git checkout HEAD~1 -- AGENTS.md
rm src/shared/schemas/attachment-schema.ts
```

---

## 📝 Notes

- Use zod for runtime validation
- Export both input and output types
- Provide helper functions for common operations
- Consider adding validation for file type extensions
- Document any custom validation rules

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 1.3.1
- [AGENTS.md](../../AGENTS.md) - Schema guidelines

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
