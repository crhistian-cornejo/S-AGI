# Refactorización del Módulo AI

## Resumen

Se ha reorganizado la estructura del módulo AI para mejorar la claridad, eliminar duplicaciones y centralizar los exports.

## Cambios Realizados

### 1. Reorganización de Archivos

**Antes:**
```
src/main/lib/
├── ai-server.ts                    # Servidor HTTP para BlockNote AI
├── ai-tools/
│   └── generate-spreadsheet.ts    # Herramienta de generación (no usada)
└── ai/
    ├── providers.ts
    ├── openai-files.ts
    ├── image-processor.ts
    ├── streaming.ts
    ├── suggestions.ts
    ├── agent.ts
    └── batch-service.ts
```

**Después:**
```
src/main/lib/
└── ai/
    ├── index.ts                    # ✅ Exports centralizados
    ├── blocknote-server.ts        # ✅ Renombrado desde ai-server.ts
    ├── providers.ts
    ├── openai-files.ts
    ├── image-processor.ts
    ├── streaming.ts
    ├── suggestions.ts
    ├── agent.ts
    └── batch-service.ts
```

### 2. Eliminaciones

- ✅ Eliminada carpeta `ai-tools/` (contenía solo un archivo no utilizado)
- ✅ El archivo `generate-spreadsheet.ts` no se estaba usando en ningún lugar

### 3. Centralización de Exports

Creado `src/main/lib/ai/index.ts` que exporta todas las funcionalidades de AI:

```typescript
// BlockNote AI Server
export { startAIServer, stopAIServer, getAIServerPort, waitForAIServerReady, clearClientCache }

// AI Providers
export { getSagiProviderRegistry, getLanguageModel, isProviderAvailable, getProviderStatus }

// OpenAI File Service
export { OpenAIFileService }
export type { OpenAIFileServiceConfig }

// Image Processing
export { processBase64Image, isProcessableImage, getExtensionForFormat }
export type { ImageProcessingOptions, ProcessedImage }

// Streaming, Suggestions, Agent, Batch Service
export * from './streaming'
export { generateSuggestions } from './suggestions'
export * from './agent'
export * from './batch-service'
```

### 4. Actualización de Imports

Todos los imports ahora usan el path centralizado:

**Antes:**
```typescript
import { startAIServer } from "./lib/ai-server"
import { OpenAIFileService } from "../../ai/openai-files"
import { processBase64Image } from '../../ai/image-processor'
import { generateSuggestions } from "../../ai/suggestions"
```

**Después:**
```typescript
import { startAIServer } from "./lib/ai"
import { OpenAIFileService } from "../../ai"
import { processBase64Image } from '../../ai'
import { generateSuggestions } from "../../ai"
```

## Archivos Modificados

1. **`src/main/lib/ai/blocknote-server.ts`** (renombrado desde `ai-server.ts`)
   - Corregidos paths relativos de imports (`./auth` → `../auth`)

2. **`src/main/lib/ai/index.ts`** (nuevo)
   - Centraliza todos los exports del módulo AI

3. **`src/main/index.ts`**
   - Actualizado import: `./lib/ai-server` → `./lib/ai`

4. **`src/main/lib/trpc/routers/ai.ts`**
   - Actualizados imports para usar `../../ai`

5. **`src/main/lib/trpc/routers/files.ts`**
   - Actualizado import para usar `../../ai`

6. **`src/main/lib/trpc/routers/messages.ts`**
   - Actualizado import para usar `../../ai`

## Beneficios

1. **✅ Imports más limpios y consistentes**
   - Un solo punto de entrada: `from '../../ai'`
   - No más paths largos como `from '../../ai/openai-files'`

2. **✅ Mejor organización**
   - Todo lo relacionado con AI está en `ai/`
   - El servidor BlockNote tiene un nombre más descriptivo

3. **✅ Eliminación de duplicaciones**
   - Eliminada carpeta `ai-tools/` no utilizada
   - Estructura más clara y mantenible

4. **✅ Facilita mantenimiento**
   - Cambios en la estructura interna no afectan los imports externos
   - Fácil agregar nuevos módulos AI

## Uso

Ahora todos los imports de AI se hacen desde el módulo centralizado:

```typescript
// ✅ Correcto - usar el index centralizado
import { 
  startAIServer, 
  OpenAIFileService, 
  processBase64Image,
  generateSuggestions 
} from '../../ai'

// ❌ Evitar - imports directos de archivos internos
import { OpenAIFileService } from '../../ai/openai-files'
```

## Próximos Pasos (Opcional)

1. Considerar mover `blocknote-server.ts` a `ai/server/blocknote.ts` si crece
2. Agregar documentación JSDoc a las funciones exportadas
3. Considerar crear subcarpetas si el módulo crece mucho:
   ```
   ai/
   ├── server/
   ├── providers/
   ├── processing/
   └── services/
   ```
