# 🔴 PRIORITY 1: Split tools.ts Router

**Status**: 🟡 PENDING  
**Severity**: 🔴 CRITICAL  
**Estimated Time**: 6-8 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Current File**: `src/main/lib/trpc/routers/tools.ts`  
**Current Lines**: **5,017**  
**Problem**: Monolithic router with 9+ different tool types, making it impossible to maintain and causing frequent merge conflicts.

---

## 🎯 Objectives

1. Split tools.ts into 9 focused modules by tool type
2. Extract shared helper functions
3. Maintain backward compatibility with existing tRPC routes
4. Improve testability and maintainability

---

## 📁 Proposed Structure

```
src/main/lib/trpc/routers/tools/
  ├── index.ts                    # Exports all tool routers
  ├── spreadsheet-tools.ts        # ~600 lines
  ├── document-tools.ts            # ~800 lines
  ├── image-tools.ts               # ~500 lines
  ├── chart-tools.ts               # ~700 lines
  ├── data-analysis-tools.ts       # ~400 lines
  ├── export-tools.ts              # ~300 lines
  ├── format-tools.ts              # ~500 lines
  ├── import-tools.ts              # ~400 lines
  └── helpers.ts                   # ~200 lines (shared utilities)
```

---

## 🔧 Implementation Plan

### Step 1: Create new directory structure (5 min)

```bash
mkdir -p src/main/lib/trpc/routers/tools
```

### Step 2: Analyze existing tools.ts (30 min)

- Identify all tool categories
- Map each tool to its category
- Identify shared helper functions
- Document dependencies between tools

### Step 3: Create helpers.ts (30 min)

Extract shared functions:
- Validation schemas
- Error handling utilities
- Common input parsers
- Response formatters

### Step 4: Split into individual modules (4-5 hours)

**spreadsheet-tools.ts**:
- `spreadsheet:analyze`
- `spreadsheet:format`
- `spreadsheet:merge`
- `spreadsheet:filter`
- `spreadsheet:sort`
- `spreadsheet:group`

**document-tools.ts**:
- `document:summarize`
- `document:translate`
- `document:extract`
- `document:analyze`

**image-tools.ts**:
- `image:analyze`
- `image:edit`
- `image:convert`
- `image:resize`

**chart-tools.ts**:
- `chart:create`
- `chart:modify`
- `chart:format`

**data-analysis-tools.ts**:
- `data:statistics`
- `data:trends`
- `data:correlations`

**export-tools.ts**:
- `export:pdf`
- `export:excel`
- `export:csv`

**format-tools.ts**:
- `format:number`
- `format:currency`
- `format:date`

**import-tools.ts**:
- `import:csv`
- `import:json`
- `import:excel`

### Step 5: Create index.ts (15 min)

```typescript
import { router } from '../../trpc'
import { spreadsheetToolsRouter } from './spreadsheet-tools'
import { documentToolsRouter } from './document-tools'
import { imageToolsRouter } from './image-tools'
import { chartToolsRouter } from './chart-tools'
import { dataAnalysisToolsRouter } from './data-analysis-tools'
import { exportToolsRouter } from './export-tools'
import { formatToolsRouter } from './format-tools'
import { importToolsRouter } from './import-tools'

export const toolsRouter = router({
  spreadsheet: spreadsheetToolsRouter,
  document: documentToolsRouter,
  image: imageToolsRouter,
  chart: chartToolsRouter,
  data: dataAnalysisToolsRouter,
  export: exportToolsRouter,
  format: formatToolsRouter,
  import: importToolsRouter,
})
```

### Step 6: Update parent router (10 min)

```typescript
// src/main/lib/trpc/index.ts
import { toolsRouter } from './routers/tools'

export const appRouter = router({
  // ...
  tools: toolsRouter,
  // ...
})
```

### Step 7: Test all routes (30 min)

- Verify all existing routes still work
- Test each tool category
- Check backward compatibility

### Step 8: Delete original tools.ts (5 min)

```bash
rm src/main/lib/trpc/routers/tools.ts
```

---

## ✅ Acceptance Criteria

- [ ] All tools.ts routes remain functional
- [ ] No breaking changes to tRPC API
- [ ] Each module is under 1000 lines
- [ ] Helpers are properly extracted
- [ ] All tests pass
- [ ] Code review completed

---

## 🧪 Testing Strategy

1. **Unit Tests**: Test each tool router independently
2. **Integration Tests**: Test tool combinations
3. **API Tests**: Verify all tRPC routes work
4. **E2E Tests**: Test through the UI

```typescript
// Example test
describe('spreadsheet-tools', () => {
  it('should analyze spreadsheet', async () => {
    const result = await trpc.tools.spreadsheet.analyze.mutate({
      data: spreadsheetData
    })
    expect(result.summary).toBeDefined()
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes | HIGH | Test all routes before deleting original file |
| Missed dependencies | MEDIUM | Document all tool dependencies in analysis phase |
| Performance regression | LOW | Tools are already called, no routing overhead |

---

## 📊 Metrics

**Before**:
- File size: 5,017 lines
- Maintainability: 🔴 Poor
- Merge conflicts: 90% probability

**After**:
- Average file size: ~500 lines
- Maintainability: 🟢 Excellent
- Merge conflicts: <10% probability

---

## 🔄 Rollback Plan

If issues arise:
1. Keep original tools.ts in git history
2. Can quickly revert: `git checkout HEAD~1 -- src/main/lib/trpc/routers/tools.ts`
3. Document rollback steps in team chat

---

## 📝 Notes

- This is the largest refactoring in the codebase
- Coordinate with team to avoid concurrent changes
- Consider doing this in a feature branch
- Update AGENTS.md with new structure

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 1.1.1
- [AGENTS.md](../../AGENTS.md) - Architecture guidelines

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
