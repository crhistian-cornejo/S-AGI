# S-AGI — Plan de Mejoras y Decisiones Técnicas

> Documento generado tras auditoría del codebase. Priorizado por impacto y riesgo.
> Fecha: 2026-02-12 | Versión: 0.2.7

---

## 🔴 CRÍTICAS — Abordar de inmediato

### 1. `main/index.ts` es un God File (2,340 líneas)

**Problema:**
El entry point del main process concentra responsabilidades que NO le corresponden:
- Gestión de ventanas (create, restore, bounds, zen mode)
- Menú de aplicación (macOS + Windows, 200+ líneas)
- System Tray (lifecycle, context menu, show/hide)
- 40+ `ipcMain.handle()` inline (clipboard, auth, theme, preferences, window size…)
- Quick Prompt window (creación, posicionamiento, IPC)
- Auto-updater initialization
- Hotkeys (registro global, lifecycle)
- Power monitor listeners

**Por qué es crítico:**
- Cualquier cambio en clipboard rompe potencialmente el tray
- Imposible hacer code review efectivo — el diff siempre es enorme
- No se puede testear ningún módulo de forma aislada
- Carga cognitiva: nadie puede tener 2,340 líneas en la cabeza

**Decisión — Dividir en módulos con registro centralizado:**

```
main/
├── index.ts                    # Solo: app lifecycle, createWindow, orquestación
├── lib/
│   ├── ipc/
│   │   ├── register-all.ts     # Importa y registra todos los handlers
│   │   ├── clipboard.ts        # clipboard:write-text, read-text, write-html, etc.
│   │   ├── window-controls.ts  # window:getBounds, setBounds, setMinimumSize, etc.
│   │   ├── auth-sync.ts        # auth:set-session
│   │   ├── theme.ts            # theme:get, theme:set
│   │   └── preferences.ts      # preferences:get, preferences:set
│   ├── menu/
│   │   └── application-menu.ts # updateApplicationMenu() completo
│   ├── tray/
│   │   └── tray-manager.ts     # createTray, destroyTray, updateTrayMenu
│   └── quick-prompt/
│       └── quick-prompt-window.ts  # createQuickPromptWindow, positioning
```

**Patrón para cada módulo IPC:**

```typescript
// main/lib/ipc/clipboard.ts
import { ipcMain } from "electron";
import { validateIPCSender } from "../security/ipc-validation";

export function registerClipboardHandlers() {
  ipcMain.handle("clipboard:write-text", (event, text: string) => {
    if (!validateIPCSender(event.sender)) return false;
    const { clipboard } = require("electron");
    clipboard.writeText(text);
    return true;
  });
  // ... resto de handlers
}
```

```typescript
// main/lib/ipc/register-all.ts
import { registerClipboardHandlers } from "./clipboard";
import { registerWindowHandlers } from "./window-controls";
import { registerAuthHandlers } from "./auth-sync";
import { registerThemeHandlers } from "./theme";
import { registerPreferencesHandlers } from "./preferences";

export function registerAllIpcHandlers(mainWindow: BrowserWindow) {
  registerClipboardHandlers();
  registerWindowHandlers(mainWindow);
  registerAuthHandlers(mainWindow);
  registerThemeHandlers();
  registerPreferencesHandlers(mainWindow);
}
```

**Resultado esperado:** `index.ts` debería quedar en ~300 líneas (lifecycle + window creation + orquestación).

**Orden de ejecución:**
1. Extraer `application-menu.ts` primero (es el bloque más grande y autónomo)
2. Extraer todos los `ipcMain.handle()` agrupados por dominio
3. Extraer tray + quick-prompt
4. Limpiar `index.ts` para que solo orqueste

---

### 2. 174+ usos de `any` en el renderer

**Problema:**
Archivos críticos usan `any` extensivamente, anulando TypeScript:

| Archivo | Usos de `any` | Riesgo |
|---------|---------------|--------|
| `univer-diff.ts` | 12+ | Comparaciones de snapshots sin validación de forma |
| `univer-diff-stats.ts` | 8+ | Estadísticas incorrectas si la estructura cambia |
| `exceljs-exchange.ts` | 10+ | Casting forzado a internals de ExcelJS |
| `data-processing.worker.ts` | 8+ | Worker messages sin tipado = bugs silenciosos |
| `file-version-history*.tsx` | 15+ | Props `version: any` en 4 archivos |
| `univer-docs-core.ts` | 10+ | `api as any` — acceso a APIs internas no tipadas |
| `univer-spreadsheet.tsx` | 8+ | Snapshots y drawing resources sin tipo |
| `chat-markdown-renderer.tsx` | 12+ | Todos los componentes markdown: `(props: any)` |
| `univer-charts.tsx` | 8+ | Datos de gráficos sin validación |

**Por qué es crítico:**
- Un cambio en la estructura de Univer snapshots puede romper diff/export sin ningún error en compilación
- Los workers reciben mensajes sin validar — cualquier typo en el `type` pasa silencioso
- Las file versions se muestran sin garantía de que tengan los campos necesarios

**Decisión — Crear tipos centralizados y eliminar `any` por fases:**

**Fase 1: Tipos para Univer snapshots (impacto más alto)**

```typescript
// packages/core/src/types/univer-snapshot.ts
import { z } from "zod";

export const UniverCellSchema = z.object({
  v: z.union([z.string(), z.number(), z.boolean()]).optional(),
  s: z.string().optional(),        // style ID
  t: z.number().optional(),        // cell type
  f: z.string().optional(),        // formula
  si: z.string().optional(),       // style index
  p: z.record(z.unknown()).optional(), // rich text
});

export const UniverSheetSchema = z.object({
  id: z.string(),
  name: z.string(),
  rowCount: z.number(),
  columnCount: z.number(),
  cellData: z.record(z.record(UniverCellSchema)).optional(),
  mergeData: z.array(z.object({
    startRow: z.number(),
    endRow: z.number(),
    startColumn: z.number(),
    endColumn: z.number(),
  })).optional(),
  rowData: z.record(z.object({ h: z.number().optional(), hd: z.number().optional() })).optional(),
  columnData: z.record(z.object({ w: z.number().optional(), hd: z.number().optional() })).optional(),
});

export const UniverSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  sheetOrder: z.array(z.string()),
  sheets: z.record(UniverSheetSchema),
  resources: z.array(z.object({
    name: z.string(),
    data: z.string(),
  })).optional(),
});

export type UniverCell = z.infer<typeof UniverCellSchema>;
export type UniverSheet = z.infer<typeof UniverSheetSchema>;
export type UniverSnapshot = z.infer<typeof UniverSnapshotSchema>;
```

**Fase 2: Tipos para file versions**

```typescript
// packages/core/src/types/file-version.ts
export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  univerData: UniverSnapshot;
  createdAt: string;
  source: "auto" | "manual" | "checkpoint";
  metadata?: {
    changesSummary?: string;
    cellsModified?: number;
  };
}

export interface VersionComparison {
  versionA: FileVersion;
  versionB: FileVersion;
}
```

**Fase 3: Tipos para worker messages**

```typescript
// renderer/workers/data-processing.types.ts
export type WorkerRequest =
  | { type: "hasRealChanges"; payload: { oldSnapshot: UniverSnapshot; newSnapshot: UniverSnapshot } }
  | { type: "jsonStringify"; payload: { data: unknown } }
  | { type: "deepEqual"; payload: { a: unknown; b: unknown } };

export type WorkerResponse =
  | { id: string; type: "hasRealChanges"; result: boolean }
  | { id: string; type: "jsonStringify"; result: string }
  | { id: string; type: "deepEqual"; result: boolean }
  | { id: string; error: string };
```

**Fase 4: Componentes markdown — usar tipos de `react-markdown`**

```typescript
// En chat-markdown-renderer.tsx
import type { Components } from "react-markdown";

const baseComponents: Partial<Components> = {
  h1: ({ children, ...props }) => (
    <h1 className="..." {...props}>{children}</h1>
  ),
  // Los tipos se infieren automáticamente
};
```

**Orden de eliminación:**
1. `UniverSnapshot` types → desbloquea diff, diff-stats, version-history, worker
2. `FileVersion` types → desbloquea los 4 archivos de version-history
3. `WorkerMessage` types → tipado bidireccional del worker
4. Markdown components → usar `Components` de react-markdown
5. ExcelJS casting → crear wrappers tipados para los internals

---

### 3. `console.log` en producción (main process)

**Problema:**
`messages.ts` tiene 7 `console.log()` y `file-manager/ipc.ts` tiene 1, cuando `electron-log` ya está configurado e importado en `index.ts`.

**Por qué es crítico:**
- `console.log` en Electron main NO se ve en producción (no hay terminal)
- `electron-log` escribe a archivo + permite niveles (debug/info/warn/error)
- Logs de producción se pierden → no puedes diagnosticar bugs de usuarios

**Decisión:**

```typescript
// ❌ ANTES
console.log('[MessagesRouter] add message, userId:', ctx.userId);

// ✅ DESPUÉS
import log from "electron-log";
const logger = log.scope("messages-router");

logger.info('add message, userId:', ctx.userId);
logger.debug('Chat lookup result:', { chat, chatError }); // debug para verbose
```

**Regla:** Agregar regla de ESLint `no-console` para `apps/electron/main/`:

```javascript
// apps/electron/eslint.config.mjs — agregar:
{
  files: ["main/**/*.ts"],
  rules: {
    "no-console": "error"
  }
}
```

---

### 4. `preload/index.ts` — 899 líneas de bridge monolítico

**Problema:**
El preload es el espejo del God File de `main/index.ts`. Cada IPC handler tiene su contraparte aquí con `ipcRenderer.invoke()`. Al ser un solo archivo:
- No se puede navegar fácilmente
- Los tipos se repiten entre main ↔ preload ↔ renderer
- Cambiar un handler requiere tocar 3 archivos sin guía clara

**Por qué es crítico:**
- El preload es la **superficie de ataque** de seguridad — Electron lo documenta como zona crítica
- Un error aquí expone APIs del sistema al renderer
- Imposible hacer audit de seguridad en 899 líneas

**Decisión — Modularizar preload con tipado compartido:**

```
preload/
├── index.ts              # Solo: contextBridge.exposeInMainWorld('desktopApi', api)
├── bridges/
│   ├── clipboard.ts      # clipboard methods
│   ├── window.ts         # window control methods
│   ├── auth.ts           # auth sync methods
│   ├── theme.ts          # theme methods
│   ├── files.ts          # file manager methods
│   └── preferences.ts    # preferences methods
└── types.ts              # DesktopApi interface (shared with renderer)
```

```typescript
// preload/bridges/clipboard.ts
import { ipcRenderer } from "electron";

export const clipboardBridge = {
  writeText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text),
  readText: () => ipcRenderer.invoke("clipboard:read-text"),
  writeHtml: (html: string, text?: string) => ipcRenderer.invoke("clipboard:write-html", html, text),
  readHtml: () => ipcRenderer.invoke("clipboard:read-html"),
  readFormats: () => ipcRenderer.invoke("clipboard:read-formats"),
  write: (data: { text?: string; html?: string; rtf?: string }) => ipcRenderer.invoke("clipboard:write", data),
  read: () => ipcRenderer.invoke("clipboard:read"),
};
```

```typescript
// preload/index.ts — queda en ~50 líneas
import { contextBridge } from "electron";
import { clipboardBridge } from "./bridges/clipboard";
import { windowBridge } from "./bridges/window";
import { authBridge } from "./bridges/auth";
// ...

const desktopApi = {
  clipboard: clipboardBridge,
  window: windowBridge,
  auth: authBridge,
  // ...
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
```

---

## 🟡 IMPORTANTES — Mejoran mantenibilidad

### 5. Sin tests para lógica de negocio (tRPC routers)

**Problema:**
La carpeta `tests/` tiene subdirectorios para `ai/`, `golden/`, `renderer/`, `security/`, `utils/` pero NO hay tests para:
- `routers/chats.ts` — CRUD de chats
- `routers/messages.ts` — Inserción, upload, optimización de imágenes
- `routers/artifacts.ts` — Gestión de artifacts
- `routers/panel-messages.ts` — Sistema de mensajes de paneles

**Impacto:**
Estos routers son el **core de la aplicación**. Un refactor (como dividir `index.ts`) sin tests es peligroso.

**Decisión — Tests mínimos viables:**

```
tests/
├── routers/
│   ├── chats.test.ts        # create, list, get, update, delete
│   ├── messages.test.ts     # add, list, upload file
│   ├── artifacts.test.ts    # create, get, list, update
│   └── panel-messages.test.ts
├── utils/
│   ├── univer-diff.test.ts      # Snapshot comparison
│   └── univer-diff-stats.test.ts
```

Usar el Supabase client mockeado o SQLite in-memory para tests de routers.

---

### 6. 4 archivos de version-history redundantes

**Problema:**
```
components/
├── file-version-history.tsx              # Original
├── file-version-history-panel.tsx        # Panel variant
├── file-version-history-panel-compact.tsx # Compact variant
├── file-version-history-panel-enhanced.tsx # Enhanced variant
```

Los 4 archivos comparten ~60% del código (fetch versions, group by date, show diff). Esto es resultado de iteraciones no consolidadas.

**Decisión — Consolidar con composition pattern:**

```typescript
// components/file-version-history/index.tsx — Re-export
export { VersionHistory } from "./version-history";
export { VersionHistoryPanel } from "./version-history-panel";

// components/file-version-history/version-history.tsx — Core logic
// components/file-version-history/version-list.tsx — Shared list UI
// components/file-version-history/version-diff.tsx — Shared diff UI
// components/file-version-history/version-history-panel.tsx — Panel wrapper with variant prop

interface VersionHistoryPanelProps {
  fileId: string;
  variant: "default" | "compact" | "enhanced";
  onRestore?: (version: FileVersion) => void;
}
```

---

### 7. Dependencias infladas — 201 dependencies

**Problema y decisión por grupo:**

#### PDF (6 bibliotecas — elegir 2 max)
| Biblioteca | Uso actual | Decisión |
|------------|-----------|----------|
| `@react-pdf/renderer` | Generar PDFs desde React | ✅ MANTENER — generación |
| `react-pdf` | Visualizar PDFs en el navegador | ✅ MANTENER — viewer |
| `unpdf` | Extraer texto de PDFs | ✅ MANTENER — parsing server-side |
| `@embedpdf/*` (10 plugins) | Viewer alternativo con anotaciones | ⚠️ EVALUAR — ¿se usa realmente? ¿o `react-pdf` cubre? |
| `@libpdf/core` | Otro parser | ❌ ELIMINAR si `unpdf` lo cubre |
| `jspdf` | Generar PDFs client-side | ❌ ELIMINAR si `@react-pdf/renderer` lo cubre |

**Acción:** Grep por imports de `@libpdf` y `jspdf`. Si solo se usan en 1-2 lugares, migrar a `@react-pdf/renderer`.

#### Excel (2 bibliotecas — elegir 1)
| Biblioteca | Uso | Decisión |
|------------|-----|----------|
| `exceljs` | Import/export con formato completo | ✅ MANTENER — más completo |
| `xlsx` (SheetJS) | Parsing rápido | ❌ ELIMINAR — `exceljs` cubre todo |

#### UI inconsistente
| Biblioteca | Uso | Decisión |
|------------|-----|----------|
| `@mantine/core` + `@mantine/hooks` | BlockNote lo requiere como peer dep | ⚠️ VERIFICAR — si solo es peer dep de BlockNote, OK. Si se usa directamente, consolidar |
| `@emotion/is-prop-valid` | Probablemente peer dep de Mantine/Motion | ⚠️ VERIFICAR |

**Acción:** Ejecutar `npx depcheck` para encontrar dependencias no usadas.

---

### 8. Versiones desincronizadas de `@trpc/*`

**Problema:**
```json
"@trpc/client": "^11.8.1",
"@trpc/react-query": "^11.8.1",
"@trpc/server": "^11.7.1"    // ← minor diferente
```

**Decisión:** Sincronizar todas a la misma versión:
```json
"@trpc/client": "^11.8.1",
"@trpc/react-query": "^11.8.1",
"@trpc/server": "^11.8.1"
```

---

## 🟢 SUGERENCIAS — Nice-to-have

### 9. Consolidar state management (Jotai vs Zustand)

**Estado actual:**
- Jotai atoms: `agent-panel.ts`, `ai.ts`, `artifacts.ts`, `chat.ts`, `notes.ts`, `pdf.ts`, `ui.ts`, `user-files.ts` — **8 archivos, toda la UI state**
- Zustand stores: `create-queue-store.ts` — **1 archivo utility**
- El AGENTS.md dice "Zustand para complex state" pero en la práctica solo Jotai se usa

**Decisión:** Si `create-queue-store.ts` es el único uso de Zustand, evaluar migrarlo a Jotai o un simple `useReducer`. Eliminar Zustand de las dependencias reduciría bundle y complejidad mental.

**Sin embargo:** Si hay stores de Zustand dentro de `features/chat/stores/`, mantener ambos es válido. Actualizar el AGENTS.md para reflejar la realidad.

---

### 10. `snake-game.tsx` en `features/chat/`

**Problema:** Un juego de Snake dentro del módulo de chat no es descubrible ni apropiado como ubicación.

**Decisión:** Mover a `features/easter-eggs/snake-game.tsx` o `features/fun/snake-game.tsx`. Documentar en el README como easter egg si es intencional.

---

### 11. Error handling inconsistente en routers

**Patrón actual** (observado en varios routers):
```typescript
const { data, error } = await supabase.from("table").select("*");
// A veces se verifica error, a veces no
return data;
```

**Decisión — Crear helper centralizado:**

```typescript
// main/lib/supabase/query.ts
import { TRPCError } from "@trpc/server";

export async function supabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>
): Promise<T> {
  const { data, error } = await queryFn();
  if (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
      cause: error,
    });
  }
  if (data === null) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return data;
}

// Uso:
const chats = await supabaseQuery(() =>
  supabase.from("chats").select("*").eq("user_id", userId)
);
```

---

### 12. Mejorar la seguridad del IPC

**Problema actual:** Cada handler tiene `if (!validateIPCSender(event.sender)) return X` repetido. Esto es frágil — si alguien olvida la línea, hay un agujero de seguridad.

**Decisión — Middleware de validación:**

```typescript
// main/lib/ipc/secure-handle.ts
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { validateIPCSender } from "../security/ipc-validation";

export function secureHandle<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => T | Promise<T>,
  fallback?: T
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!validateIPCSender(event.sender)) {
      return fallback ?? null;
    }
    return handler(event, ...args);
  });
}

// Uso:
secureHandle("clipboard:write-text", (_event, text: string) => {
  clipboard.writeText(text);
  return true;
}, false);
```

---

## 📋 Orden de ejecución recomendado

| # | Tarea | Esfuerzo | Impacto | Riesgo |
|---|-------|----------|---------|--------|
| 1 | Crear tipos `UniverSnapshot`, `FileVersion` | Medio | 🔴 Alto | Bajo |
| 2 | Reemplazar `console.log` → `electron-log` + regla ESLint | Bajo | 🔴 Alto | Bajo |
| 3 | Sincronizar versiones `@trpc/*` | Bajo | 🟡 Medio | Bajo |
| 4 | Extraer `application-menu.ts` de `index.ts` | Medio | 🔴 Alto | Medio |
| 5 | Extraer IPC handlers de `index.ts` | Medio | 🔴 Alto | Medio |
| 6 | Crear `secureHandle` wrapper para IPC | Bajo | 🟡 Medio | Bajo |
| 7 | Modularizar `preload/index.ts` | Medio | 🔴 Alto | Medio |
| 8 | Consolidar version-history (4→1 componente) | Alto | 🟡 Medio | Medio |
| 9 | Audit de dependencias (`npx depcheck`) | Bajo | 🟡 Medio | Bajo |
| 10 | Tests para routers core | Alto | 🟡 Medio | Bajo |
| 11 | Eliminar `any` de archivos Univer | Alto | 🔴 Alto | Medio |
| 12 | Consolidar state management | Bajo | 🟢 Bajo | Bajo |

---

## 🔒 Notas de seguridad

- El patrón `validateIPCSender` es bueno pero debe ser automático (ver punto 12)
- Los `contextBridge` deben exponer la superficie mínima necesaria
- Auditar que no haya `nodeIntegration: true` ni `contextIsolation: false`
- Las API keys nunca deben pasar por el renderer — usar siempre main process como proxy

---

> **Siguiente paso:** Elegir las primeras 3 tareas de la tabla y ejecutarlas. Se recomienda empezar por las tareas de bajo riesgo y alto impacto (puntos 1, 2, 3).
