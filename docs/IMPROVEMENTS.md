# Mejoras Recomendadas - Sin Complicaciones

> Cambios incrementales que mejoran la calidad sin reescribir código.

## Prioridad Alta (Quick Wins)

### 1. Extraer Tipos Compartidos

**Antes:**
```typescript
// Repetido en múltiples archivos
interface ToolCall {
  id: string
  name: string
  args?: string
  result?: unknown
  status?: 'streaming' | 'done' | 'executing' | 'complete' | 'error'
}
```

**Después:**
```typescript
// packages/core/src/types/tools.ts
export interface ToolCall {
  id: string
  name: string
  args?: string
  result?: unknown
  status?: ToolCallStatus
}

export type ToolCallStatus = 'streaming' | 'done' | 'executing' | 'complete' | 'error'
```

### 2. Unificar Error Handling

**Crear:**
```typescript
// packages/core/src/utils/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable = true
  ) {
    super(message)
  }
}

export function isRecoverableError(error: unknown): boolean {
  return error instanceof AppError && error.recoverable
}
```

### 3. Hooks Reutilizables

**Crear hook para auto-save:**
```typescript
// apps/electron/renderer/hooks/use-auto-save.ts
export function useAutoSave<T>({
  data,
  onSave,
  debounceMs = 3000,
  enabled = true,
}: {
  data: T
  onSave: (data: T) => Promise<void>
  debounceMs?: number
  enabled?: boolean
}) {
  const isDirtyRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const markDirty = useCallback(() => {
    isDirtyRef.current = true
    if (!enabled) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (isDirtyRef.current) {
        onSave(data).then(() => { isDirtyRef.current = false })
      }
    }, debounceMs)
  }, [data, onSave, debounceMs, enabled])

  return { markDirty, isDirty: isDirtyRef.current }
}
```

## Prioridad Media

### 4. Consolidar Atoms por Dominio

**Antes:** Un archivo `atoms/index.ts` gigante

**Después:**
```
lib/atoms/
├── index.ts          # Re-exports only
├── chat.ts           # Chat-related atoms
├── artifacts.ts      # Artifact atoms
├── ai.ts             # AI/model atoms
├── ui.ts             # UI state atoms
└── files.ts          # File system atoms
```

### 5. Componentes de Error Boundary

```typescript
// apps/electron/renderer/components/error-boundary.tsx
export function FeatureErrorBoundary({
  feature,
  children,
  fallback,
}: {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  return (
    <ErrorBoundary
      onError={(error) => {
        log.error(`[${feature}] Error:`, error)
        // Could send to error tracking
      }}
      fallback={fallback || <FeatureErrorFallback feature={feature} />}
    >
      {children}
    </ErrorBoundary>
  )
}
```

### 6. Skeleton Components

```typescript
// apps/electron/renderer/components/skeletons/
export function SpreadsheetSkeleton() {
  return (
    <div className="w-full h-full animate-pulse">
      <div className="h-8 bg-muted/50 mb-1" />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-6 bg-muted/30 mb-0.5" />
      ))}
    </div>
  )
}
```

## Prioridad Baja (Nice to Have)

### 7. Feature Flags

```typescript
// packages/core/src/config/features.ts
export const FEATURES = {
  multiAccount: true,
  webSearch: true,
  pdfAnnotations: false,  // Coming soon
  collaboration: false,   // Future
} as const

// Usage
if (FEATURES.webSearch) {
  tools.push(webSearchTool)
}
```

### 8. Logger Unificado

```typescript
// packages/core/src/utils/logger.ts
export const createLogger = (namespace: string) => ({
  info: (...args: unknown[]) => log.info(`[${namespace}]`, ...args),
  warn: (...args: unknown[]) => log.warn(`[${namespace}]`, ...args),
  error: (...args: unknown[]) => log.error(`[${namespace}]`, ...args),
  debug: (...args: unknown[]) => log.debug(`[${namespace}]`, ...args),
})

// Usage
const logger = createLogger('ExcelAgent')
logger.info('Creating spreadsheet:', title)
```

### 9. Constants Centralizadas

```typescript
// packages/core/src/constants/index.ts
export const LIMITS = {
  maxFileSize: 50 * 1024 * 1024,  // 50MB
  maxChatHistory: 100,
  autoSaveDebounce: 3000,
  maxToolTurns: 25,
}

export const DEFAULTS = {
  provider: 'openai' as const,
  model: 'gpt-5-mini',
  temperature: 0.7,
}
```

## Refactorings NO Recomendados (Evitar)

| Evitar | Por qué |
|--------|---------|
| Reescribir tRPC a REST | tRPC funciona bien, tiene type-safety |
| Migrar Jotai a Redux | Jotai es más simple para este caso de uso |
| Separar en microservicios | Complejidad innecesaria para desktop app |
| Reemplazar Univer | Ya está integrado, funciona |
| Cambiar a SQLite local | Supabase da sync gratis |

## Orden de Implementación Sugerido

1. **Semana 1:** Extraer tipos compartidos a `@s-agi/core`
2. **Semana 2:** Crear hooks reutilizables (`useAutoSave`, `useErrorBoundary`)
3. **Semana 3:** Separar atoms por dominio
4. **Semana 4:** Agregar skeletons y estados de loading consistentes

## Métricas de Éxito

- [ ] Cero tipos duplicados entre archivos
- [ ] Cada feature module < 500 líneas
- [ ] Cobertura de ErrorBoundary en todas las features
- [ ] Loading states consistentes con skeletons
- [ ] Logs estructurados con namespaces
