# 🔴 PRIORITY 1: Eliminate Store Duplications

**Status**: 🟡 PENDING  
**Severity**: 🔴 CRITICAL  
**Estimated Time**: 2-3 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Problem**: Two nearly identical `message-queue-store.ts` files exist - one in `features/chat/` and one in `features/pdf/`. Only difference is the generic type (`ChatQueueItem` vs `PdfQueueItem`).

---

## 🎯 Objectives

1. Create a generic message queue store that works with any entity type
2. Migrate both chat and pdf features to use the generic store
3. Delete duplicate implementations
4. Maintain backward compatibility

---

## 📁 Current Structure

```
src/renderer/features/
  ├── chat/
  │   └── stores/message-queue-store.ts (102 lines)
  └── pdf/
      └── stores/message-queue-store.ts (102 lines)
```

---

## 🔍 Analysis

**Identical Logic**:
- Both stores have the same methods: `addToQueue`, `removeFromQueue`, `clearQueue`
- Both stores manage queues by entity ID
- Both use Zustand for state management
- Only difference: Generic type parameter

---

## 🔧 Implementation Plan

### Step 1: Create generic message queue store (30 min)

```typescript
// src/renderer/lib/stores/generic-message-queue-store.ts
import { create } from 'zustand'

export interface GenericMessageQueueState<T> {
  queues: Record<string, T[]>
  addToQueue: (entityId: string, item: T) => void
  removeFromQueue: (entityId: string, itemId: string) => void
  clearQueue: (entityId: string) => void
  getQueue: (entityId: string) => T[]
}

export function createGenericMessageQueueStore<T extends { id: string }>(
  name: string
) {
  return create<GenericMessageQueueState<T>>((set, get) => ({
    queues: {},

    addToQueue: (entityId: string, item: T) =>
      set((state) => ({
        queues: {
          ...state.queues,
          [entityId]: [...(state.queues[entityId] || []), item]
        }
      })),

    removeFromQueue: (entityId: string, itemId: string) =>
      set((state) => ({
        queues: {
          ...state.queues,
          [entityId]: state.queues[entityId]?.filter((item) => item.id !== itemId) || []
        }
      })),

    clearQueue: (entityId: string) =>
      set((state) => ({
        queues: { ...state.queues, [entityId]: [] }
      })),

    getQueue: (entityId: string) => {
      return get().queues[entityId] || []
    }
  }))
}
```

### Step 2: Migrate chat feature (30 min)

```typescript
// src/renderer/features/chat/stores/message-queue-store.ts
import { createGenericMessageQueueStore } from '@/lib/stores/generic-message-queue-store'

export interface ChatQueueItem {
  id: string
  messageId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  content?: string
}

export const useMessageQueueStore = createGenericMessageQueueStore<ChatQueueItem>(
  'chat-message-queue'
)

// Re-export types for backward compatibility
export type { GenericMessageQueueState as ChatMessageQueueState }
```

### Step 3: Migrate pdf feature (30 min)

```typescript
// src/renderer/features/pdf/stores/message-queue-store.ts
import { createGenericMessageQueueStore } from '@/lib/stores/generic-message-queue-store'

export interface PdfQueueItem {
  id: string
  messageId: string
  pdfId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  content?: string
}

export const usePdfMessageQueueStore = createGenericMessageQueueStore<PdfQueueItem>(
  'pdf-message-queue'
)

// Re-export types for backward compatibility
export type { GenericMessageQueueState as PdfMessageQueueState }
```

### Step 4: Update imports (30 min)

Search and replace imports:
```bash
# Find files importing the stores
grep -r "from.*stores/message-queue-store" src/renderer --include="*.ts" --include="*.tsx"

# Update imports to use new location (if needed)
```

Note: Imports should remain the same since we kept files in their original locations.

### Step 5: Test both features (30 min)

- Test chat message queue
- Test pdf message queue
- Verify queue operations work
- Test concurrent operations

### Step 6: Verify no breaking changes (15 min)

- Check all queue methods work
- Verify type safety
- Test error handling

---

## ✅ Acceptance Criteria

- [ ] Generic store created in `lib/stores/`
- [ ] Both chat and pdf use the generic store
- [ ] No code duplication remaining
- [ ] All tests pass
- [ ] Type safety maintained
- [ ] Backward compatibility preserved
- [ ] Code review completed

---

## 🧪 Testing Strategy

```typescript
describe('createGenericMessageQueueStore', () => {
  it('should work with ChatQueueItem', () => {
    const store = createGenericMessageQueueStore<ChatQueueItem>('test-chat')
    
    store.getState().addToQueue('chat-1', { id: '1', messageId: 'msg-1', status: 'pending' })
    const queue = store.getState().getQueue('chat-1')
    
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe('1')
  })

  it('should work with PdfQueueItem', () => {
    const store = createGenericMessageQueueStore<PdfQueueItem>('test-pdf')
    
    store.getState().addToQueue('pdf-1', { id: '1', messageId: 'msg-1', pdfId: 'pdf-1', status: 'pending' })
    const queue = store.getState().getQueue('pdf-1')
    
    expect(queue).toHaveLength(1)
  })

  it('should remove item from queue', () => {
    const store = createGenericMessageQueueStore<ChatQueueItem>('test')
    
    store.getState().addToQueue('chat-1', { id: '1', messageId: 'msg-1', status: 'pending' })
    store.getState().removeFromQueue('chat-1', '1')
    const queue = store.getState().getQueue('chat-1')
    
    expect(queue).toHaveLength(0)
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Type incompatibility | HIGH | Use generic with constraints |
| Breaking existing code | MEDIUM | Keep files in original locations |
| State persistence issues | LOW | Test persistence with devtools |
| Performance regression | LOW | Benchmark before/after |

---

## 📊 Metrics

**Before**:
- Duplicate code: 204 lines (2 files × 102 lines)
- Maintenance burden: Updates required in 2 places
- Type safety: Manual type enforcement

**After**:
- Duplicate code: 0 lines
- Maintenance burden: Single source of truth
- Type safety: Generic with constraints

---

## 🔄 Rollback Plan

```bash
# If issues arise:
git checkout HEAD~1 -- src/renderer/lib/stores/generic-message-queue-store.ts
git checkout HEAD~1 -- src/renderer/features/chat/stores/message-queue-store.ts
git checkout HEAD~1 -- src/renderer/features/pdf/stores/message-queue-store.ts
rm src/renderer/lib/stores/generic-message-queue-store.ts
```

---

## 📝 Notes

- This pattern can be reused for other store duplications
- Consider adding middleware for devtools
- Add JSDoc comments for TypeScript IntelliSense
- Export from lib/stores/index.ts for convenience

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 1.3.2
- [AGENTS.md](../../AGENTS.md) - State management guidelines

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
