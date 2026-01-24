# 🔴 PRIORITY 1: Move Hooks from lib/ to hooks/

**Status**: 🟡 PENDING  
**Severity**: 🔴 CRITICAL  
**Estimated Time**: 3-4 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Problem**: 7 React hooks are incorrectly placed in `src/renderer/lib/` instead of `src/renderer/hooks/`, violating project structure and making them harder to discover.

---

## 🎯 Objectives

1. Move all hooks from `lib/` to `hooks/`
2. Split `use-spell-check.ts` (1,002 lines) into smaller, focused hooks
3. Update all import statements
4. Update AGENTS.md documentation

---

## 📋 Files to Move

| Current Location | Target Location | Lines | Priority |
|-----------------|----------------|-------|----------|
| `lib/use-spell-check.ts` | `hooks/use-spell-check.ts` | 1,002 | 🔴 CRITICAL |
| `lib/use-document-upload.ts` | `hooks/use-document-upload.ts` | 278 | 🟠 HIGH |
| `lib/use-chat-sounds.ts` | `hooks/use-chat-sounds.ts` | 499 | 🟠 HIGH |
| `lib/use-debounce.ts` | `hooks/use-debounce.ts` | 18 | 🟡 MEDIUM |
| `lib/use-file-upload.ts` | `hooks/use-file-upload.ts` | 323 | 🟠 HIGH |
| `features/sidebar/use-haptic.ts` | `hooks/use-haptic.ts` | 86 | 🟡 MEDIUM |
| `features/sidebar/use-desktop-notifications.ts` | `hooks/use-desktop-notifications.ts` | 128 | 🟡 MEDIUM |
| `lib/hooks/use-citation-navigation.ts` | `hooks/use-citation-navigation.ts` | 85 | 🟡 MEDIUM |

---

## 🔧 Implementation Plan

### Step 1: Move simple hooks (30 min)

```bash
# Move hooks that don't need refactoring
git mv src/renderer/lib/use-debounce.ts src/renderer/hooks/
git mv src/renderer/lib/use-chat-sounds.ts src/renderer/hooks/
git mv src/renderer/lib/use-file-upload.ts src/renderer/hooks/
git mv src/renderer/lib/use-document-upload.ts src/renderer/hooks/
git mv src/renderer/features/sidebar/use-haptic.ts src/renderer/hooks/
git mv src/renderer/features/sidebar/use-desktop-notifications.ts src/renderer/hooks/
git mv src/renderer/lib/hooks/use-citation-navigation.ts src/renderer/hooks/
```

### Step 2: Find and update all imports (1 hour)

```bash
# Find all files importing from lib/
grep -r "from.*lib.*use-" src/renderer --include="*.ts" --include="*.tsx"
```

Replace imports:
```typescript
// Before
import { useDebounce } from "@/lib/use-debounce"
import { useChatSounds } from "@/lib/use-chat-sounds"

// After
import { useDebounce } from "@/hooks/use-debounce"
import { useChatSounds } from "@/hooks/use-chat-sounds"
```

### Step 3: Split use-spell-check.ts (1.5-2 hours)

**Analysis**:
- Current: 1,002 lines with multiple responsibilities
- Breakdown:
  - Dictionary loading (~200 lines)
  - Spell checking logic (~300 lines)
  - Suggestions generation (~200 lines)
  - UI integration (~200 lines)
  - Configuration (~100 lines)

**Proposed split**:
```
src/renderer/hooks/
  ├── use-spell-check.ts          # Main hook (~150 lines)
  └── spell-check/
      ├── dictionary-loader.ts     # Dictionary management
      ├── spell-checker.ts         # Core spell check logic
      ├── suggestions.ts          # Suggestion generation
      └── config.ts               # Configuration
```

**use-spell-check.ts (refactored)**:
```typescript
// Main hook - orchestrates the pieces
import { useDictionaryLoader } from './spell-check/dictionary-loader'
import { useSpellChecker } from './spell-check/spell-checker'

export function useSpellCheck(options: SpellCheckOptions) {
  const { dictionary, isLoading } = useDictionaryLoader(options.language)
  const { checkWord, getSuggestions } = useSpellChecker(dictionary)

  return {
    check: checkWord,
    suggest: getSuggestions,
    isLoading
  }
}
```

### Step 4: Update imports for split components (30 min)

Find files importing use-spell-check and update:
```bash
grep -r "from.*lib.*use-spell-check" src/renderer --include="*.ts" --include="*.tsx"
```

### Step 5: Test all hooks (30 min)

- Test use-spell-check functionality
- Test document upload
- Test file upload
- Test chat sounds
- Test haptic feedback
- Test desktop notifications
- Test citation navigation

### Step 6: Update AGENTS.md (15 min)

Add hooks/ documentation:
```markdown
## Hooks Directory

All React hooks should be placed in `src/renderer/hooks/`:

- **Feature-specific hooks**: `hooks/use-*.ts`
- **Reusable utilities**: `hooks/use-debounce.ts`, etc.

Examples:
- `hooks/use-mobile.ts` - Mobile detection
- `hooks/use-smooth-stream.ts` - Streaming optimization
- `hooks/use-spell-check.ts` - Spell checking
```

### Step 7: Delete lib/hooks/ directory (5 min)

```bash
# After moving all hooks
rmdir src/renderer/lib/hooks
```

---

## ✅ Acceptance Criteria

- [ ] All hooks moved from `lib/` to `hooks/`
- [ ] `use-spell-check.ts` split into <200 line files
- [ ] All imports updated correctly
- [ ] All tests pass
- [ ] No breaking changes to functionality
- [ ] AGENTS.md updated
- [ ] Code review completed

---

## 🧪 Testing Strategy

```typescript
// Test each hook
describe('useSpellCheck', () => {
  it('should detect misspelled words', () => {
    const { check } = renderHook(() => useSpellCheck({ language: 'en' }))
    expect(check('hello')).toBe(true)
    expect(check('hllo')).toBe(false)
  })

  it('should provide suggestions', () => {
    const { suggest } = renderHook(() => useSpellCheck({ language: 'en' }))
    const suggestions = suggest('hllo')
    expect(suggestions).toContain('hello')
  })
})

describe('useChatSounds', () => {
  it('should play sound on new message', () => {
    const { playMessageSound } = renderHook(() => useChatSounds())
    // Test audio playback
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Broken imports | HIGH | Use git mv, search for imports |
| use-spell-check split breaks something | HIGH | Thorough testing of spell check |
| Circular dependencies | MEDIUM | Analyze dependencies before moving |
| Hook behavior changes | MEDIUM | Compare before/after behavior |

---

## 📊 Metrics

**Before**:
- Hooks in `lib/`: 8 files
- `use-spell-check.ts`: 1,002 lines
- Structure violations: 8

**After**:
- Hooks in `hooks/`: 12 files
- Largest hook: <200 lines
- Structure violations: 0

---

## 🔄 Rollback Plan

```bash
# If issues arise:
git checkout HEAD~1 -- src/renderer/hooks/
git checkout HEAD~1 -- src/renderer/lib/use-*.ts
git checkout HEAD~1 -- src/renderer/features/sidebar/use-*.ts
git checkout HEAD~1 -- src/renderer/lib/hooks/
git checkout HEAD~1 -- AGENTS.md
```

---

## 📝 Notes

- Use `git mv` to preserve history
- Search for all imports before deleting
- Test spell check thoroughly after split
- Consider creating `lib/spell-check/` instead of `hooks/spell-check/`
- Update any documentation referencing old paths

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 1.2
- [AGENTS.md](../../AGENTS.md) - Project structure

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
