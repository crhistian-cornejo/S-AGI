# 🟠 PRIORITY 2: Create Path Aliases

**Status**: 🟡 PENDING  
**Severity**: 🟠 HIGH  
**Estimated Time**: 2-3 hours  
**Last Updated**: January 24, 2026

---

## 📋 Overview

**Problem**: Deep relative imports (e.g., `../../window-manager`) make the codebase fragile to refactoring. Path aliases would provide cleaner imports and make refactoring safer.

---

## 🎯 Objectives

1. Configure TypeScript path aliases
2. Create barrel exports for common imports
3. Update imports progressively
4. Improve maintainability

---

## 📋 Current State

### Deep Relative Imports

```typescript
// src/main/lib/trpc/routers/ai.ts
import { sendToRenderer } from "../../window-manager";
import { supabase } from "../../supabase/client";
import { getSecureApiKeyStore } from "../../auth/api-key-store";
```

### Fragile Structure

- Moving `window-manager.ts` breaks 45+ imports
- Refactoring directory structure requires massive updates
- Import paths are hard to read and maintain

---

## 🔧 Implementation Plan

### Step 1: Update tsconfig.json (30 min)

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"],
      "@/*": ["src/*"]
    },
    // ... other options
  }
}
```

### Step 2: Update tsconfig.node.json for main process (15 min)

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@main/*": ["./src/main/*"],
      "@shared/*": ["./src/shared/*"]
    }
  }
}
```

### Step 3: Update vite.config.ts for renderer (15 min)

```typescript
// vite.config.ts
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    }
  }
})
```

### Step 4: Create barrel exports (1 hour)

#### Create `src/main/lib/index.ts`

```typescript
// src/main/lib/index.ts
export { sendToRenderer } from './window-manager'
export { supabase } from './supabase/client'
export { getSecureApiKeyStore } from './auth/api-key-store'
export { log } from './logger'
export { getOpenaiClient } from './ai/openai-client'

// Services
export * from './services'

// Types
export * from './domain'
```

#### Create `src/renderer/lib/index.ts`

```typescript
// src/renderer/lib/index.ts
export { cn } from './utils'
export { isMac, isWindows, isLinux } from './platform-utils'

// Stores
export * from './stores'
export * from './atoms'

// Clients
export { trpc } from './trpc-client'
export { supabase } from './supabase'

// Hooks (after refactoring)
// export * from '../hooks'
```

#### Create `src/shared/index.ts`

```typescript
// src/shared/index.ts
export * from './config'
export * from './file-config'
export * from './types'
export * from './schemas'
export * from './ai-types'
export * from './hotkey-types'
```

### Step 5: Update imports progressively (1 hour)

#### Update main process imports

```typescript
// Before
import { sendToRenderer } from "../../window-manager";
import { supabase } from "../../supabase/client";

// After
import { sendToRenderer, supabase } from '@main/lib';

// OR
import { sendToRenderer } from '@main/lib/window-manager';
import { supabase } from '@main/lib/supabase/client';
```

#### Update renderer imports

```typescript
// Before
import { trpc } from "../../lib/trpc";
import { cn } from "../../lib/utils";

// After
import { trpc, cn } from '@renderer/lib';

// OR
import { trpc } from '@renderer/lib/trpc-client';
import { cn } from '@renderer/lib/utils';
```

#### Update shared imports

```typescript
// Before
import { FILE_CONFIG } from "../../shared/file-config";

// After
import { FILE_CONFIG } from '@shared/file-config';
```

### Step 6: Update electron.vite.config.ts for main (15 min)

```typescript
// electron.vite.config.ts
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, './src/main'),
      '@shared': path.resolve(__dirname, './src/shared'),
    }
  }
})
```

### Step 7: Test all imports (30 min)

- Test main process imports
- Test renderer imports
- Test shared imports
- Verify tRPC works
- Verify IPC communication works
- Check all build processes

### Step 8: Update AGENTS.md (15 min)

Add documentation:
```markdown
## Path Aliases

Use path aliases instead of relative imports:

### Main Process
```typescript
import { sendToRenderer } from '@main/lib/window-manager'
import { supabase } from '@main/lib/supabase/client'
import { cleanupChatFiles } from '@main/lib/services'
```

### Renderer Process
```typescript
import { trpc } from '@renderer/lib/trpc-client'
import { cn } from '@renderer/lib/utils'
import { useMobile } from '@renderer/hooks/use-mobile'
```

### Shared
```typescript
import { FILE_CONFIG } from '@shared/file-config'
import { Attachment } from '@shared/schemas'
```

### Barrel Exports

For cleaner imports, use barrel exports:

```typescript
// Instead of:
import { sendToRenderer, supabase, getSecureApiKeyStore } from '@main/lib/window-manager'
import { supabase } from '@main/lib/supabase/client'
import { getSecureApiKeyStore } from '@main/lib/auth/api-key-store'

// Use:
import { sendToRenderer, supabase, getSecureApiKeyStore } from '@main/lib'
```
```

---

## ✅ Acceptance Criteria

- [ ] Path aliases configured in all tsconfigs
- [ ] Barrel exports created
- [ ] All critical imports updated
- [ ] All tests pass
- [ ] Build processes work correctly
- [ ] AGENTS.md updated
- [ ] Code review completed

---

## 🧪 Testing Strategy

```typescript
// Test that imports resolve correctly

// Main process test
import { sendToRenderer } from '@main/lib/window-manager'
import { supabase } from '@main/lib/supabase/client'

describe('Path Aliases - Main', () => {
  it('should import from @main/lib', () => {
    expect(sendToRenderer).toBeDefined()
    expect(supabase).toBeDefined()
  })
})

// Renderer process test
import { trpc } from '@renderer/lib/trpc-client'
import { cn } from '@renderer/lib/utils'

describe('Path Aliases - Renderer', () => {
  it('should import from @renderer/lib', () => {
    expect(trpc).toBeDefined()
    expect(typeof cn).toBe('function')
  })
})

// Shared test
import { FILE_CONFIG } from '@shared/file-config'

describe('Path Aliases - Shared', () => {
  it('should import from @shared', () => {
    expect(FILE_CONFIG).toBeDefined()
  })
})
```

---

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Build configuration errors | HIGH | Test all builds after changes |
| Runtime import failures | HIGH | Thorough testing of all imports |
| Circular dependencies | MEDIUM | Analyze barrel exports carefully |
| IDE support issues | LOW | Restart IDE for tsconfig changes |

---

## 📊 Metrics

**Before**:
- Relative imports: 45+ deep imports
- Fragile to refactoring: HIGH
- Import readability: 🔴 Poor
- Refactoring impact: 45+ files

**After**:
- Path aliases: 3 main aliases
- Fragile to refactoring: LOW
- Import readability: 🟢 Excellent
- Refactoring impact: Minimal

---

## 🔄 Rollback Plan

```bash
# If issues arise:
git checkout HEAD~1 -- tsconfig.json
git checkout HEAD~1 -- tsconfig.node.json
git checkout HEAD~1 -- vite.config.ts
git checkout HEAD~1 -- electron.vite.config.ts
git checkout HEAD~1 -- src/main/lib/index.ts
git checkout HEAD~1 -- src/renderer/lib/index.ts
git checkout HEAD~1 -- src/shared/index.ts
```

---

## 📝 Notes

- Use progressive migration, don't update all imports at once
- Start with most common imports
- Test after each batch of updates
- Consider ESLint rule to enforce path aliases
- Document preferred alias usage

---

## 📚 Related Documents

- [REPORTE_ANALISIS_CODIGO.md](../../REPORTE_ANALISIS_CODIGO.md) - Section 2.2
- [AGENTS.md](../../AGENTS.md) - Import guidelines

---

**Owner**: TBD  
**Reviewers**: TBD  
**Due Date**: TBD
