# S-AGI Architecture Guide

> Best practices from midday, 1code, and Claude for Excel patterns.
> Optimized for Electron + Web code sharing.

## Directory Structure

```
s-agi/
├── apps/
│   ├── electron/              # Desktop app (Electron)
│   │   ├── main/              # Main process (Node.js)
│   │   │   ├── lib/
│   │   │   │   ├── agents/    # AI agents (Excel, Docs, PDF, Orchestrator)
│   │   │   │   ├── ai/        # AI providers, streaming, tool execution
│   │   │   │   ├── auth/      # OAuth, Claude Code auth, safeStorage
│   │   │   │   ├── trpc/      # tRPC routers (backend API)
│   │   │   │   ├── supabase/  # Supabase client
│   │   │   │   └── pdf/       # PDF processing
│   │   │   └── index.ts       # Entry point
│   │   ├── renderer/          # Renderer process (React)
│   │   │   ├── components/    # Shared UI components
│   │   │   │   ├── ui/        # Primitives (Button, Input, etc.)
│   │   │   │   ├── citations/ # Cell/Page citations
│   │   │   │   └── icons/     # Custom icons
│   │   │   ├── features/      # Feature modules
│   │   │   │   ├── agent/     # Agent panel
│   │   │   │   ├── artifacts/ # Artifact viewer
│   │   │   │   ├── chat/      # Chat interface
│   │   │   │   ├── charts/    # Chart components
│   │   │   │   ├── layout/    # App layout, titlebar
│   │   │   │   ├── settings/  # Settings panels
│   │   │   │   └── univer/    # Spreadsheet/Doc components
│   │   │   ├── hooks/         # Custom React hooks
│   │   │   ├── lib/           # Utilities
│   │   │   │   ├── atoms/     # Jotai atoms (state)
│   │   │   │   ├── stores/    # Zustand stores (complex state)
│   │   │   │   └── utils.ts   # Shared utilities
│   │   │   └── styles/        # Global styles
│   │   └── preload/           # Preload scripts (IPC bridge)
│   │
│   └── web/                   # Web app (future)
│       ├── app/               # Next.js app router
│       └── ...
│
├── packages/
│   ├── core/                  # Shared business logic
│   │   └── src/
│   │       ├── config/        # Centralized configuration
│   │       │   ├── agent-config.ts    # Agent metadata & instructions
│   │       │   ├── artifact-config.ts # Artifact types & stages
│   │       │   ├── tool-config.ts     # Tool definitions
│   │       │   └── tool-generators.ts # Streaming tool patterns
│   │       ├── types/         # Shared TypeScript types
│   │       └── utils/         # Pure utility functions
│   │
│   ├── ui/                    # Shared UI components (future)
│   │   └── src/
│   │       ├── components/    # Cross-platform components
│   │       └── hooks/         # Cross-platform hooks
│   │
│   └── database/              # Database schemas & migrations
│       └── supabase/
│           └── migrations/
│
├── supabase/                  # Supabase project config
│   ├── migrations/
│   └── functions/             # Edge functions
│
└── docs/                      # Documentation
```

## Code Separation Principles

### 1. Platform-Agnostic Core (`packages/core`)

Everything that doesn't depend on Electron or browser APIs:

```typescript
// packages/core/src/config/agent-config.ts
export const AGENT_METADATA = {
  excel: {
    name: 'ExcelAgent',
    description: 'Especialista en hojas de cálculo',
    maxTurns: 25,
    temperature: 0.3,
  },
  // ...
}

// Can be used in Electron main, renderer, and web
```

### 2. Electron-Specific (`apps/electron`)

Platform APIs, IPC, native features:

```typescript
// apps/electron/main/lib/auth/claude-code-store.ts
import { safeStorage } from 'electron'  // Electron-only

export function saveCredentials(data: string) {
  return safeStorage.encryptString(data)
}
```

### 3. Shared UI (`packages/ui` - future)

React components that work everywhere:

```typescript
// packages/ui/src/components/citation-badge.tsx
// No Electron imports, no window.desktopApi
export function CitationBadge({ citation, onNavigate }) {
  return <button onClick={() => onNavigate?.(citation)}>...</button>
}
```

## State Management

### Jotai Atoms (Simple State)

```typescript
// apps/electron/renderer/lib/atoms/index.ts
export const selectedChatIdAtom = atomWithStorage<string | null>('selected-chat-id', null)
export const isStreamingAtom = atom(false)
```

### Zustand Stores (Complex State)

```typescript
// apps/electron/renderer/lib/stores/message-queue-store.ts
export const useMessageQueueStore = create<MessageQueueState>((set, get) => ({
  queue: [],
  addMessage: (msg) => set((s) => ({ queue: [...s.queue, msg] })),
}))
```

### When to Use What

| Use Case | Solution |
|----------|----------|
| Simple toggle/value | Jotai atom |
| Persisted preference | `atomWithStorage` |
| Complex mutations | Zustand store |
| Server state | tRPC + React Query |
| Derived/computed | Jotai derived atom |

## Agent Architecture

### Multi-Agent Pattern (midday style)

```
Orchestrator
├── ExcelAgent (spreadsheet operations)
├── DocsAgent (document operations)
└── PDFAgent (PDF analysis)
```

### Handoffs

```typescript
// apps/electron/main/lib/agents/orchestrator.ts
const agentHandoffs = [
  handoff(excelAgent, { onHandoff: () => log.info('→ ExcelAgent') }),
  handoff(docsAgent, { onHandoff: () => log.info('→ DocsAgent') }),
]
```

### Progressive Stages (midday pattern)

```typescript
// Tool execution with stages
sendToRenderer('artifact:stage-update', {
  artifactId,
  stage: 'loading',      // → 'data_ready' → 'chart_ready' → 'complete'
  message: 'Cargando...',
})
```

## Tool Definitions

### Centralized Configuration

```typescript
// packages/core/src/config/tool-config.ts
export const ALL_TOOLS: ToolDefinition[] = [
  {
    name: 'create_spreadsheet',
    category: 'excel',
    description: 'Crea una hoja de cálculo',
    inputSchema: z.object({ title: z.string(), headers: z.array(z.string()) }),
    requiresApproval: false,
    icon: 'IconTablePlus',
    uiComponent: 'SpreadsheetCreatedTool',
  },
]
```

### Generator Pattern (Streaming)

```typescript
// packages/core/src/config/tool-generators.ts
export const createSpreadsheetGenerator = {
  generator: async function* ({ headers, data }, context) {
    yield* stageUpdate(artifactId, 'loading', 'Preparing...')
    yield* progressUpdate(artifactId, 30, 'Adding headers')
    // ...
    return { success: true, artifactId }
  },
}
```

## Citation System (Claude for Excel)

### Types

```typescript
// Cell citation (Excel)
interface CellCitation {
  type: 'cell'
  cell: string      // "A1", "B2:D5"
  value?: string | number
  sheet?: string
}

// Page citation (PDF)
interface PageCitation {
  type: 'page'
  pageNumber: number
  text: string
  filename: string
}
```

### In AI Responses

```markdown
El total está en [[cell:E15|$1,234.56]] según los datos de [[cell:A1:D10]].

Basado en el documento [[cite:1|report.pdf|5|texto citado]].
```

## tRPC Router Structure

```typescript
// apps/electron/main/lib/trpc/index.ts
export const appRouter = router({
  // Core
  chats: chatsRouter,
  messages: messagesRouter,
  artifacts: artifactsRouter,

  // AI
  ai: aiRouter,
  aiProviders: aiProvidersRouter,  // Multi-account
  agentPanel: agentPanelRouter,

  // Files
  files: filesRouter,
  userFiles: userFilesRouter,
  pdf: pdfRouter,

  // Settings
  auth: authRouter,
  settings: settingsRouter,
  permissions: permissionsRouter,
})
```

## IPC Bridge (Electron)

### Preload Script

```typescript
// apps/electron/preload/index.ts
contextBridge.exposeInMainWorld('desktopApi', {
  // tRPC
  trpc: trpcProxy,

  // Events
  onArtifactUpdate: (cb) => ipcRenderer.on('artifact:update', cb),
  onAgentPanelStream: (cb) => ipcRenderer.on('agent:stream', cb),

  // Actions
  showSaveDialog: () => ipcRenderer.invoke('dialog:save'),
})
```

### Type Safety

```typescript
// apps/electron/renderer/types/electron.d.ts
interface DesktopApi {
  trpc: TRPCProxy
  onArtifactUpdate: (callback: (event: ArtifactUpdateEvent) => void) => () => void
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
```

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Component | kebab-case | `agent-panel.tsx` |
| Hook | camelCase with use | `useUserFile.ts` |
| Atom | camelCase with Atom | `selectedChatIdAtom` |
| Store | camelCase with Store | `messageQueueStore` |
| Type | PascalCase | `AgentContext` |
| Router | kebab-case | `ai-providers.ts` |
| Config | kebab-case | `agent-config.ts` |

## Imports Order

```typescript
// 1. React
import * as React from 'react'
import { memo, useState } from 'react'

// 2. External libraries
import { useAtom } from 'jotai'
import { z } from 'zod'

// 3. Internal packages
import { AGENT_METADATA } from '@s-agi/core'

// 4. Internal aliases
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

// 5. Relative imports
import { AgentMessage } from './agent-message'
import type { AgentContext } from './types'
```

## Error Handling

### tRPC Mutations

```typescript
const mutation = trpc.userFiles.update.useMutation({
  onSuccess: (result, variables) => {
    // Use variables.id, not closure variables (race condition protection)
    console.log('Saved:', variables.id)
  },
  onError: (error, variables) => {
    // Keep dirty flag, don't lose data
    console.error('Failed:', variables.id, error)
  },
})
```

### Cleanup Handlers

```typescript
React.useEffect(() => {
  return () => {
    // Always save to cache with isDirty: true on unmount
    // Let mutation.onSuccess clear it when confirmed
    setSnapshotInCache(id, snapshot, true)

    if (wasDirty) {
      mutation.mutate({ id, data: snapshot })
    }
  }
}, [])
```

## Performance Guidelines

1. **Lazy Loading**: Use `React.lazy()` for heavy components (ChartViewer, PDFViewer)
2. **Memoization**: Use `memo()` for list items and pure components
3. **Virtualization**: Use `@tanstack/react-virtual` for long lists
4. **Debouncing**: Auto-save with 3s debounce
5. **Caching**: Use WeakMap for parsed data caches

## Security

1. **Credentials**: Always use `safeStorage` in Electron
2. **API Keys**: Never expose in renderer, always through main process
3. **OAuth**: Use PKCE flow for Claude Code auth
4. **IPC**: Validate all messages from renderer
5. **Input**: Sanitize user input before database queries

## Testing Strategy

```
tests/
├── unit/           # Pure functions, utilities
├── integration/    # tRPC routers, agents
├── e2e/            # Playwright for full flows
└── fixtures/       # Test data
```

## Future: Web App Migration

When adding `apps/web`:

1. Move shared components to `packages/ui`
2. Create adapter layer for platform APIs:
   ```typescript
   // packages/ui/src/adapters/storage.ts
   export const storage = {
     get: (key) => isElectron ? electronStore.get(key) : localStorage.getItem(key),
     set: (key, value) => isElectron ? electronStore.set(key, value) : localStorage.setItem(key, value),
   }
   ```
3. Use feature flags for platform-specific features
4. Share tRPC types via `packages/core`
