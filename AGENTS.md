# AGENTS.md

Guía para agentes AI que trabajan en este repositorio (Claude Code, Cursor, etc.)

## ¿Qué es S-AGI?

**S-AGI** - Aplicación Electron/Web para crear spreadsheets con AI usando Univer. Los usuarios chatean con Claude para generar, editar y manipular hojas de cálculo en tiempo real.

## Comandos

```bash
# Desarrollo
bun run dev              # Electron con hot reload
bun run dev:web          # Solo web (sin Electron)

# Build
bun run build            # Compilar app
bun run package:win      # Windows (NSIS + portable)
bun run package:mac      # macOS (DMG + ZIP)

# Verificación
bun run ts:check         # TypeScript check
```

## Arquitectura

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # Entry, window lifecycle
│   └── lib/
│       ├── auth/            # Claude Code OAuth (safeStorage)
│       ├── supabase/        # DB client
│       └── trpc/
│           ├── trpc.ts      # ⚠️ Base helpers (router, publicProcedure)
│           ├── index.ts     # App router export
│           └── routers/     # Individual routers
│
├── preload/                 # IPC bridge (context isolation)
│   └── index.ts             # desktopApi + tRPC bridge
│
├── renderer/                # React 19 UI
│   ├── App.tsx
│   ├── components/ui/       # shadcn/Radix components
│   ├── features/
│   │   ├── chat/            # Chat interface
│   │   ├── artifacts/       # Spreadsheet viewer
│   │   ├── sidebar/         # Navigation
│   │   ├── layout/          # MainLayout, TitleBar
│   │   └── univer/          # Univer integration
│   └── lib/
│       ├── atoms/           # Jotai state
│       ├── stores/          # Zustand stores
│       ├── trpc.tsx         # tRPC client
│       ├── supabase.ts      # Supabase client
│       ├── utils.ts         # cn(), isMac(), etc.
│       └── overlay-styles.ts # Shared dropdown styles
│
└── shared/                  # Shared types/config
    ├── config.ts
    └── types.ts             # Zod schemas
```

## Convenciones de Imports

### ❌ MAL - Circular imports
```typescript
// En routers/chats.ts
import { router, publicProcedure } from '../index'  // ❌ Circular!
```

### ✅ BIEN - Imports desde archivo base
```typescript
// En routers/chats.ts
import { router, publicProcedure } from '../trpc'   // ✅ Correcto
```

### Regla: tRPC Helpers
- **`trpc.ts`**: Define `router` y `publicProcedure` (base)
- **`index.ts`**: Importa routers y exporta `appRouter`
- **Routers**: SIEMPRE importan de `../trpc`, NUNCA de `../index`

## State Management

| Tipo | Tecnología | Uso |
|------|------------|-----|
| UI State | Jotai | sidebar, selected chat, theme |
| Complex State | Zustand | sub-chats, tabs |
| Server State | React Query + tRPC | chats, messages, artifacts |

### Jotai Atoms
```typescript
// Nomenclatura: camelCase + Atom suffix
export const selectedChatIdAtom = atomWithStorage('key', null)
export const sidebarOpenAtom = atomWithStorage('sidebar', true)
```

## tRPC Patterns

### Main Process (Routers)
```typescript
// src/main/lib/trpc/routers/example.ts
import { z } from 'zod'
import { router, publicProcedure } from '../trpc'  // ⚠️ Desde trpc.ts
import { supabase } from '../../supabase/client'

export const exampleRouter = router({
  list: publicProcedure.query(async () => {
    const { data } = await supabase.from('table').select('*')
    return data
  }),
  
  create: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      // ...
    })
})
```

### Renderer (Hooks)
```typescript
import { trpc } from '@/lib/trpc'

// Query
const { data, isLoading } = trpc.chats.list.useQuery()

// Mutation
const createChat = trpc.chats.create.useMutation({
  onSuccess: (chat) => setSelectedChatId(chat.id)
})
```

## Environment Variables

```bash
# Main process (MAIN_VITE_ prefix)
MAIN_VITE_SUPABASE_URL=https://xxx.supabase.co
MAIN_VITE_SUPABASE_ANON_KEY=xxx

# Renderer process (VITE_ prefix)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_ANTHROPIC_CLIENT_ID=xxx
```

## File Naming

| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Components | kebab-case | `chat-input.tsx` |
| UI Components | kebab-case | `dropdown-menu.tsx` |
| Stores | kebab-case | `sub-chat-store.ts` |
| Atoms | camelCase | `atoms/index.ts` |
| Utils | camelCase | `utils.ts` |

## UI Components

Usamos **Tabler Icons** en lugar de Lucide:
```typescript
import { IconMenu2, IconSend, IconTable } from '@tabler/icons-react'

<IconMenu2 size={18} />
```

Path alias para imports:
```typescript
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```

## Supabase Queries

```typescript
import { supabase } from '@/lib/supabase'

// Select
const { data, error } = await supabase
  .from('chats')
  .select('*')
  .eq('user_id', userId)

// Insert
const { data } = await supabase
  .from('artifacts')
  .insert({ name, type, content })
  .select()
  .single()

// Update
await supabase
  .from('chats')
  .update({ title: newTitle })
  .eq('id', chatId)
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 33, electron-vite |
| UI | React 19, TypeScript, Tailwind CSS |
| Components | Radix UI, Tabler Icons, Motion |
| State | Jotai, Zustand, React Query |
| Backend | tRPC, Supabase |
| AI | AI SDK v6, Claude Code |
| Spreadsheets | @univerjs/presets |
| Package Manager | bun |

## Errores Comunes

1. **Circular imports en tRPC**: Siempre importa `router`/`publicProcedure` desde `trpc.ts`
2. **Variables de entorno vacías**: Usa `MAIN_VITE_*` para main process
3. **Tipos de tRPC**: El renderer usa `AppRouter = any` para evitar cross-process imports
