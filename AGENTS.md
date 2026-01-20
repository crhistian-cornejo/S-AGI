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
| AI | OpenAI SDK (Responses API), streaming vía IPC |
| Spreadsheets | @univerjs/presets |
| Package Manager | bun |

## Errores Comunes

1. **Circular imports en tRPC**: Siempre importa `router`/`publicProcedure` desde `trpc.ts`
2. **Variables de entorno vacías**: Usa `MAIN_VITE_*` para main process
3. **Tipos de tRPC**: El renderer usa `AppRouter = any` para evitar cross-process imports

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: `npx openskills read <skill-name>` (run in your shell)
  - For multiple: `npx openskills read skill-one,skill-two`
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>algorithmic-art</name>
<description>Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration. Use this when users request creating art using code, generative art, algorithmic art, flow fields, or particle systems. Create original algorithmic art rather than copying existing artists' work to avoid copyright violations.</description>
<location>project</location>
</skill>

<skill>
<name>brand-guidelines</name>
<description>Applies Anthropic's official brand colors and typography to any sort of artifact that may benefit from having Anthropic's look-and-feel. Use it when brand colors or style guidelines, visual formatting, or company design standards apply.</description>
<location>project</location>
</skill>

<skill>
<name>canvas-design</name>
<description>Create beautiful visual art in .png and .pdf documents using design philosophy. You should use this skill when the user asks to create a poster, piece of art, design, or other static piece. Create original visual designs, never copying existing artists' work to avoid copyright violations.</description>
<location>project</location>
</skill>

<skill>
<name>doc-coauthoring</name>
<description>Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks.</description>
<location>project</location>
</skill>

<skill>
<name>docx</name>
<description>"Comprehensive document creation, editing, and analysis with support for tracked changes, comments, formatting preservation, and text extraction. When Claude needs to work with professional documents (.docx files) for: (1) Creating new documents, (2) Modifying or editing content, (3) Working with tracked changes, (4) Adding comments, or any other document tasks"</description>
<location>project</location>
</skill>

<skill>
<name>frontend-design</name>
<description>Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.</description>
<location>project</location>
</skill>

<skill>
<name>internal-comms</name>
<description>A set of resources to help me write all kinds of internal communications, using the formats that my company likes to use. Claude should use this skill whenever asked to write some sort of internal communications (status reports, leadership updates, 3P updates, company newsletters, FAQs, incident reports, project updates, etc.).</description>
<location>project</location>
</skill>

<skill>
<name>mcp-builder</name>
<description>Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK).</description>
<location>project</location>
</skill>

<skill>
<name>pdf</name>
<description>Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.</description>
<location>project</location>
</skill>

<skill>
<name>pptx</name>
<description>"Presentation creation, editing, and analysis. When Claude needs to work with presentations (.pptx files) for: (1) Creating new presentations, (2) Modifying or editing content, (3) Working with layouts, (4) Adding comments or speaker notes, or any other presentation tasks"</description>
<location>project</location>
</skill>

<skill>
<name>skill-creator</name>
<description>Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.</description>
<location>project</location>
</skill>

<skill>
<name>slack-gif-creator</name>
<description>Knowledge and utilities for creating animated GIFs optimized for Slack. Provides constraints, validation tools, and animation concepts. Use when users request animated GIFs for Slack like "make me a GIF of X doing Y for Slack."</description>
<location>project</location>
</skill>

<skill>
<name>template</name>
<description>Replace with description of the skill and when Claude should use it.</description>
<location>project</location>
</skill>

<skill>
<name>theme-factory</name>
<description>Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been creating, or can generate a new theme on-the-fly.</description>
<location>project</location>
</skill>

<skill>
<name>web-artifacts-builder</name>
<description>Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex artifacts requiring state management, routing, or shadcn/ui components - not for simple single-file HTML/JSX artifacts.</description>
<location>project</location>
</skill>

<skill>
<name>webapp-testing</name>
<description>Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.</description>
<location>project</location>
</skill>

<skill>
<name>xlsx</name>
<description>"Comprehensive spreadsheet creation, editing, and analysis with support for formulas, formatting, data analysis, and visualization. When Claude needs to work with spreadsheets (.xlsx, .xlsm, .csv, .tsv, etc) for: (1) Creating new spreadsheets with formulas and formatting, (2) Reading or analyzing data, (3) Modify existing spreadsheets while preserving formulas, (4) Data analysis and visualization in spreadsheets, or (5) Recalculating formulas"</description>
<location>project</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
