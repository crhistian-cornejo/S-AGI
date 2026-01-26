# Plan de Implementación: Sistema de Archivos Persistente con Historial de Versiones

## Objetivo

Crear un sistema de archivos persistente estilo Google Docs/Sheets donde:
- Los archivos se mantienen independientes de los artifacts
- Cada archivo tiene su propio historial de cambios (git-like)
- El Agent Panel trabaja directamente sobre el archivo guardado
- Todo cambio (manual o por IA) persiste automáticamente
- Se puede restaurar cualquier versión anterior
- Cada archivo tiene su propio historial de chat con el Agent Panel

---

## Investigación: Capacidades de Univer para Historial de Versiones

### Hallazgos de la Documentación Oficial

**Fuentes:**
- [Univer OT Algorithm](https://docs.univer.ai/blog/ot)
- [Univer Collaboration](https://docs.univer.ai/guides/sheets/features/collaboration)

### Arquitectura de Versionado en Univer

1. **Sistema de Revisiones**: Cada operación recibe un número de revisión único y global
2. **EventSourcing Pattern**: El servidor guarda cada operación para reconstruir cualquier estado
3. **Snapshots**: Se pueden guardar a intervalos, por número de operaciones, o eventos específicos
4. **Replay de Operaciones**: Para ver una revisión, se replayan todas las operaciones hasta ese punto
5. **Snapshots de Aceleración**: Los snapshots aceleran el replay eliminando la necesidad de empezar desde cero

### Implementación Recomendada

Dado que Univer Server (privado) tiene historial completo pero nosotros usamos Univer standalone, implementaremos:

1. **file_versions table**: Guardar snapshots completos en cada guardado significativo
2. **Política de snapshots**:
   - Cada auto-save (3 segundos idle)
   - Cada tool call del Agent Panel
   - Guardado manual explícito
3. **Compresión**: Los snapshots JSONB se pueden comprimir si crecen mucho

---

## Fase 1: Base de Datos con Historial de Versiones

### 1.1 Nueva Tabla: `user_files`

```sql
CREATE TABLE user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('excel', 'doc', 'note')),
  name TEXT NOT NULL,
  description TEXT,

  -- Datos actuales (última versión)
  univer_data JSONB,          -- Datos de Univer (para Excel/Docs)
  content TEXT,               -- Contenido markdown (para Notes)

  -- Metadatos
  metadata JSONB DEFAULT '{}',
  icon TEXT,                  -- Emoji o icono
  color TEXT,                 -- Color de acento

  -- Contadores y stats
  version_count INTEGER DEFAULT 1,
  total_edits INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_opened_at TIMESTAMPTZ,

  -- Organización
  is_pinned BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  folder_path TEXT,           -- Para organización futura
  tags TEXT[],                -- Tags para búsqueda

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_user_files_user_id ON user_files(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_files_type ON user_files(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_files_last_opened ON user_files(last_opened_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_files_pinned ON user_files(is_pinned, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_files_tags ON user_files USING GIN(tags) WHERE deleted_at IS NULL;

-- RLS Policies
ALTER TABLE user_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own files"
  ON user_files FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert their own files"
  ON user_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files"
  ON user_files FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files"
  ON user_files FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_user_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_files_updated_at
  BEFORE UPDATE ON user_files
  FOR EACH ROW
  EXECUTE FUNCTION update_user_files_updated_at();
```

### 1.2 Nueva Tabla: `file_versions` (Historial Git-Like)

```sql
CREATE TABLE file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES user_files(id) ON DELETE CASCADE,

  -- Versión
  version_number INTEGER NOT NULL,

  -- Snapshot completo de datos
  univer_data JSONB,          -- Snapshot de Univer
  content TEXT,               -- Contenido para Notes

  -- Metadatos del cambio
  change_type TEXT NOT NULL CHECK (change_type IN (
    'created',        -- Creación inicial
    'auto_save',      -- Auto-guardado por idle
    'manual_save',    -- Guardado manual del usuario
    'ai_edit',        -- Edición por Agent Panel
    'ai_create',      -- Creación por Agent Panel
    'restore',        -- Restauración de versión anterior
    'import'          -- Importación de archivo externo
  )),
  change_description TEXT,    -- Descripción del cambio (generada o manual)
  change_summary JSONB,       -- Resumen estructurado de cambios

  -- Contexto
  created_by UUID REFERENCES auth.users(id),
  ai_model TEXT,              -- Si fue por IA, qué modelo
  ai_prompt TEXT,             -- Si fue por IA, qué prompt
  tool_name TEXT,             -- Si fue por tool call, cuál tool

  -- Stats
  size_bytes INTEGER,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint único
  UNIQUE(file_id, version_number)
);

-- Índices para queries eficientes
CREATE INDEX idx_file_versions_file_id ON file_versions(file_id);
CREATE INDEX idx_file_versions_created_at ON file_versions(file_id, created_at DESC);
CREATE INDEX idx_file_versions_change_type ON file_versions(file_id, change_type);

-- RLS (hereda permisos del archivo padre)
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of their files"
  ON file_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_files
      WHERE user_files.id = file_versions.file_id
      AND user_files.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert versions of their files"
  ON file_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_files
      WHERE user_files.id = file_versions.file_id
      AND user_files.user_id = auth.uid()
    )
  );
```

### 1.3 Migración de Datos desde Artifacts

```sql
-- Migrar artifacts tipo spreadsheet a user_files
INSERT INTO user_files (
  user_id, type, name, univer_data, created_at, updated_at, last_opened_at
)
SELECT
  COALESCE(a.user_id, c.user_id) as user_id,
  'excel' as type,
  a.name,
  a.univer_data,
  a.created_at,
  a.updated_at,
  a.updated_at as last_opened_at
FROM artifacts a
LEFT JOIN chats c ON a.chat_id = c.id
WHERE a.type = 'spreadsheet'
  AND a.univer_data IS NOT NULL
  AND (a.user_id IS NOT NULL OR c.user_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- Crear versión inicial para archivos migrados
INSERT INTO file_versions (
  file_id, version_number, univer_data, change_type,
  change_description, created_at
)
SELECT
  uf.id,
  1,
  uf.univer_data,
  'import',
  'Migrado desde artifacts',
  uf.created_at
FROM user_files uf
WHERE NOT EXISTS (
  SELECT 1 FROM file_versions fv WHERE fv.file_id = uf.id
);

-- Similar para documents...
```

---

## Fase 2: Backend - Router tRPC

### 2.1 Router: `userFiles`

**Archivo:** `apps/electron/main/lib/trpc/routers/user-files.ts`

```typescript
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'

const fileTypeSchema = z.enum(['excel', 'doc', 'note'])
const changeTypeSchema = z.enum([
  'created', 'auto_save', 'manual_save',
  'ai_edit', 'ai_create', 'restore', 'import'
])

export const userFilesRouter = router({
  // ==================== QUERIES ====================

  // Listar archivos por tipo
  list: protectedProcedure
    .input(z.object({
      type: fileTypeSchema,
      includeArchived: z.boolean().default(false),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0)
    }))
    .query(async ({ ctx, input }) => {
      let query = supabase
        .from('user_files')
        .select('id, name, type, description, icon, color, is_pinned, version_count, total_edits, created_at, updated_at, last_opened_at')
        .eq('user_id', ctx.userId)
        .eq('type', input.type)
        .is('deleted_at', null)
        .order('is_pinned', { ascending: false })
        .order('last_opened_at', { ascending: false, nullsFirst: false })
        .range(input.offset, input.offset + input.limit - 1)

      if (!input.includeArchived) {
        query = query.eq('is_archived', false)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data
    }),

  // Obtener archivo completo por ID
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from('user_files')
        .select('*')
        .eq('id', input.id)
        .eq('user_id', ctx.userId)
        .is('deleted_at', null)
        .single()

      if (error) throw new Error(error.message)
      return data
    }),

  // Obtener el archivo abierto más reciente por tipo
  getLastOpened: protectedProcedure
    .input(z.object({ type: fileTypeSchema }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from('user_files')
        .select('*')
        .eq('user_id', ctx.userId)
        .eq('type', input.type)
        .is('deleted_at', null)
        .eq('is_archived', false)
        .order('last_opened_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data
    }),

  // ==================== MUTATIONS ====================

  // Crear nuevo archivo
  create: protectedProcedure
    .input(z.object({
      type: fileTypeSchema,
      name: z.string().min(1).max(255),
      univerData: z.any().optional(),
      content: z.string().optional(),
      description: z.string().optional(),
      aiModel: z.string().optional(),
      aiPrompt: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      // Crear archivo
      const { data: file, error: fileError } = await supabase
        .from('user_files')
        .insert({
          user_id: ctx.userId,
          type: input.type,
          name: input.name,
          univer_data: input.univerData,
          content: input.content,
          description: input.description,
          last_opened_at: new Date().toISOString(),
          version_count: 1,
          total_edits: 0
        })
        .select()
        .single()

      if (fileError) throw new Error(fileError.message)

      // Crear versión inicial
      const { error: versionError } = await supabase
        .from('file_versions')
        .insert({
          file_id: file.id,
          version_number: 1,
          univer_data: input.univerData,
          content: input.content,
          change_type: input.aiModel ? 'ai_create' : 'created',
          change_description: 'Archivo creado',
          created_by: ctx.userId,
          ai_model: input.aiModel,
          ai_prompt: input.aiPrompt,
          size_bytes: JSON.stringify(input.univerData || input.content).length
        })

      if (versionError) {
        console.error('Error creating initial version:', versionError)
      }

      return file
    }),

  // Actualizar archivo (crea nueva versión)
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      univerData: z.any().optional(),
      content: z.string().optional(),
      description: z.string().optional(),
      metadata: z.any().optional(),
      changeType: changeTypeSchema.default('auto_save'),
      changeDescription: z.string().optional(),
      aiModel: z.string().optional(),
      aiPrompt: z.string().optional(),
      toolName: z.string().optional(),
      skipVersion: z.boolean().default(false) // Para updates menores que no necesitan versión
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, skipVersion, changeType, changeDescription, aiModel, aiPrompt, toolName, ...updates } = input

      // Obtener archivo actual para el conteo de versiones
      const { data: currentFile, error: fetchError } = await supabase
        .from('user_files')
        .select('version_count, total_edits')
        .eq('id', id)
        .eq('user_id', ctx.userId)
        .single()

      if (fetchError) throw new Error(fetchError.message)

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        total_edits: (currentFile.total_edits || 0) + 1
      }

      if (updates.name !== undefined) updateData.name = updates.name
      if (updates.univerData !== undefined) updateData.univer_data = updates.univerData
      if (updates.content !== undefined) updateData.content = updates.content
      if (updates.description !== undefined) updateData.description = updates.description
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata

      // Actualizar archivo
      const { data: file, error: updateError } = await supabase
        .from('user_files')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', ctx.userId)
        .select()
        .single()

      if (updateError) throw new Error(updateError.message)

      // Crear nueva versión si es necesario
      if (!skipVersion && (updates.univerData !== undefined || updates.content !== undefined)) {
        const newVersionNumber = (currentFile.version_count || 0) + 1

        const { error: versionError } = await supabase
          .from('file_versions')
          .insert({
            file_id: id,
            version_number: newVersionNumber,
            univer_data: updates.univerData,
            content: updates.content,
            change_type: changeType,
            change_description: changeDescription || `Versión ${newVersionNumber}`,
            created_by: ctx.userId,
            ai_model: aiModel,
            ai_prompt: aiPrompt,
            tool_name: toolName,
            size_bytes: JSON.stringify(updates.univerData || updates.content).length
          })

        if (versionError) {
          console.error('Error creating version:', versionError)
        } else {
          // Actualizar conteo de versiones
          await supabase
            .from('user_files')
            .update({ version_count: newVersionNumber })
            .eq('id', id)
        }
      }

      return file
    }),

  // Marcar como abierto
  markOpened: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from('user_files')
        .update({ last_opened_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('user_id', ctx.userId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    }),

  // Eliminar archivo (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from('user_files')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('user_id', ctx.userId)

      if (error) throw new Error(error.message)
      return { success: true }
    }),

  // Pin/Unpin
  togglePin: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: current } = await supabase
        .from('user_files')
        .select('is_pinned')
        .eq('id', input.id)
        .eq('user_id', ctx.userId)
        .single()

      const { data, error } = await supabase
        .from('user_files')
        .update({ is_pinned: !current?.is_pinned })
        .eq('id', input.id)
        .eq('user_id', ctx.userId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    }),

  // Archive/Unarchive
  toggleArchive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: current } = await supabase
        .from('user_files')
        .select('is_archived')
        .eq('id', input.id)
        .eq('user_id', ctx.userId)
        .single()

      const { data, error } = await supabase
        .from('user_files')
        .update({ is_archived: !current?.is_archived })
        .eq('id', input.id)
        .eq('user_id', ctx.userId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    }),

  // ==================== VERSIONES ====================

  // Listar versiones de un archivo
  listVersions: protectedProcedure
    .input(z.object({
      fileId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0)
    }))
    .query(async ({ ctx, input }) => {
      // Verificar propiedad del archivo
      const { data: file } = await supabase
        .from('user_files')
        .select('id')
        .eq('id', input.fileId)
        .eq('user_id', ctx.userId)
        .single()

      if (!file) throw new Error('File not found')

      const { data, error } = await supabase
        .from('file_versions')
        .select('id, version_number, change_type, change_description, ai_model, tool_name, size_bytes, created_at')
        .eq('file_id', input.fileId)
        .order('version_number', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1)

      if (error) throw new Error(error.message)
      return data
    }),

  // Obtener versión específica
  getVersion: protectedProcedure
    .input(z.object({
      fileId: z.string().uuid(),
      versionNumber: z.number().min(1)
    }))
    .query(async ({ ctx, input }) => {
      // Verificar propiedad
      const { data: file } = await supabase
        .from('user_files')
        .select('id')
        .eq('id', input.fileId)
        .eq('user_id', ctx.userId)
        .single()

      if (!file) throw new Error('File not found')

      const { data, error } = await supabase
        .from('file_versions')
        .select('*')
        .eq('file_id', input.fileId)
        .eq('version_number', input.versionNumber)
        .single()

      if (error) throw new Error(error.message)
      return data
    }),

  // Restaurar versión anterior
  restoreVersion: protectedProcedure
    .input(z.object({
      fileId: z.string().uuid(),
      versionNumber: z.number().min(1)
    }))
    .mutation(async ({ ctx, input }) => {
      // Obtener la versión a restaurar
      const { data: version, error: versionError } = await supabase
        .from('file_versions')
        .select('*')
        .eq('file_id', input.fileId)
        .eq('version_number', input.versionNumber)
        .single()

      if (versionError) throw new Error(versionError.message)

      // Obtener archivo actual
      const { data: currentFile, error: fileError } = await supabase
        .from('user_files')
        .select('version_count')
        .eq('id', input.fileId)
        .eq('user_id', ctx.userId)
        .single()

      if (fileError) throw new Error(fileError.message)

      const newVersionNumber = (currentFile.version_count || 0) + 1

      // Actualizar archivo con datos de la versión restaurada
      const { data: updatedFile, error: updateError } = await supabase
        .from('user_files')
        .update({
          univer_data: version.univer_data,
          content: version.content,
          version_count: newVersionNumber,
          updated_at: new Date().toISOString()
        })
        .eq('id', input.fileId)
        .eq('user_id', ctx.userId)
        .select()
        .single()

      if (updateError) throw new Error(updateError.message)

      // Crear nueva versión indicando la restauración
      const { error: newVersionError } = await supabase
        .from('file_versions')
        .insert({
          file_id: input.fileId,
          version_number: newVersionNumber,
          univer_data: version.univer_data,
          content: version.content,
          change_type: 'restore',
          change_description: `Restaurado a versión ${input.versionNumber}`,
          created_by: ctx.userId,
          size_bytes: JSON.stringify(version.univer_data || version.content).length
        })

      if (newVersionError) {
        console.error('Error creating restore version:', newVersionError)
      }

      return updatedFile
    }),

  // Comparar dos versiones (útil para diff visual)
  compareVersions: protectedProcedure
    .input(z.object({
      fileId: z.string().uuid(),
      versionA: z.number().min(1),
      versionB: z.number().min(1)
    }))
    .query(async ({ ctx, input }) => {
      // Verificar propiedad
      const { data: file } = await supabase
        .from('user_files')
        .select('id')
        .eq('id', input.fileId)
        .eq('user_id', ctx.userId)
        .single()

      if (!file) throw new Error('File not found')

      const { data, error } = await supabase
        .from('file_versions')
        .select('*')
        .eq('file_id', input.fileId)
        .in('version_number', [input.versionA, input.versionB])

      if (error) throw new Error(error.message)

      const versionA = data.find(v => v.version_number === input.versionA)
      const versionB = data.find(v => v.version_number === input.versionB)

      return { versionA, versionB }
    })
})
```

### 2.2 Registrar Router

**Archivo:** `apps/electron/main/lib/trpc/index.ts`

```typescript
import { userFilesRouter } from './routers/user-files'

export const appRouter = router({
  // ... otros routers
  userFiles: userFilesRouter,
})
```

---

## Fase 3: Frontend - Estado y Hooks

### 3.1 Atoms para Estado de Archivos

**Archivo:** `apps/electron/renderer/lib/atoms/user-files.ts`

```typescript
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export type UserFileType = 'excel' | 'doc' | 'note'

export interface UserFile {
  id: string
  user_id: string
  type: UserFileType
  name: string
  description?: string
  univer_data?: unknown
  content?: string
  metadata?: Record<string, unknown>
  icon?: string
  color?: string
  version_count: number
  total_edits: number
  created_at: string
  updated_at: string
  last_opened_at?: string | null
  is_pinned: boolean
  is_archived: boolean
}

export interface FileVersion {
  id: string
  file_id: string
  version_number: number
  univer_data?: unknown
  content?: string
  change_type: string
  change_description?: string
  ai_model?: string
  tool_name?: string
  size_bytes?: number
  created_at: string
}

// Archivo actualmente abierto por tipo (persistido en localStorage)
export const currentExcelFileIdAtom = atomWithStorage<string | null>(
  'current-excel-file-id',
  null
)

export const currentDocFileIdAtom = atomWithStorage<string | null>(
  'current-doc-file-id',
  null
)

export const currentNoteFileIdAtom = atomWithStorage<string | null>(
  'current-note-file-id',
  null
)

// Datos del archivo cargado (no persistido, se carga desde DB)
export const currentExcelFileAtom = atom<UserFile | null>(null)
export const currentDocFileAtom = atom<UserFile | null>(null)
export const currentNoteFileAtom = atom<UserFile | null>(null)

// Helper para obtener atoms según tipo
export const getFileIdAtom = (type: UserFileType) => {
  switch (type) {
    case 'excel': return currentExcelFileIdAtom
    case 'doc': return currentDocFileIdAtom
    case 'note': return currentNoteFileIdAtom
  }
}

export const getFileAtom = (type: UserFileType) => {
  switch (type) {
    case 'excel': return currentExcelFileAtom
    case 'doc': return currentDocFileAtom
    case 'note': return currentNoteFileAtom
  }
}

// Cache de snapshots no guardados (para cambios en progreso)
export interface FileSnapshot {
  univerData?: unknown
  content?: string
  timestamp: number
  isDirty: boolean
}

export const fileSnapshotCacheAtom = atom<Record<string, FileSnapshot>>({})

// Estado de guardado
export const fileSavingAtom = atom<Record<string, boolean>>({})

// Panel de historial de versiones
export const versionHistoryOpenAtom = atom<boolean>(false)
export const versionHistoryFileIdAtom = atom<string | null>(null)
```

### 3.2 Hook Principal: `useUserFile`

**Archivo:** `apps/electron/renderer/lib/hooks/use-user-file.ts`

```typescript
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useMemo } from 'react'
import { trpc } from '@/lib/trpc'
import {
  getFileIdAtom,
  getFileAtom,
  fileSnapshotCacheAtom,
  fileSavingAtom,
  type UserFile,
  type UserFileType
} from '@/lib/atoms/user-files'
import { useDebounce } from './use-debounce'

const AUTO_SAVE_DELAY = 3000 // 3 segundos

export function useUserFile(type: UserFileType) {
  const [currentFileId, setCurrentFileId] = useAtom(getFileIdAtom(type))
  const [currentFile, setCurrentFile] = useAtom(getFileAtom(type))
  const [snapshotCache, setSnapshotCache] = useAtom(fileSnapshotCacheAtom)
  const [savingState, setSavingState] = useAtom(fileSavingAtom)

  const utils = trpc.useUtils()

  // Queries
  const { data: filesList, isLoading: isLoadingList } = trpc.userFiles.list.useQuery(
    { type, includeArchived: false },
    { staleTime: 30000 }
  )

  const { data: fetchedFile, isLoading: isLoadingFile } = trpc.userFiles.get.useQuery(
    { id: currentFileId! },
    {
      enabled: !!currentFileId,
      staleTime: 10000
    }
  )

  // Sincronizar archivo cargado con atom
  useEffect(() => {
    if (fetchedFile) {
      setCurrentFile(fetchedFile)
    }
  }, [fetchedFile, setCurrentFile])

  // Mutations
  const createMutation = trpc.userFiles.create.useMutation({
    onSuccess: (newFile) => {
      setCurrentFileId(newFile.id)
      setCurrentFile(newFile)
      utils.userFiles.list.invalidate({ type })
    }
  })

  const updateMutation = trpc.userFiles.update.useMutation({
    onSuccess: (updatedFile) => {
      setCurrentFile(updatedFile)
      // Limpiar snapshot cache
      setSnapshotCache(prev => {
        const next = { ...prev }
        delete next[updatedFile.id]
        return next
      })
      // Marcar como no guardando
      setSavingState(prev => ({ ...prev, [updatedFile.id]: false }))
    }
  })

  const deleteMutation = trpc.userFiles.delete.useMutation({
    onSuccess: () => {
      if (currentFile) {
        setCurrentFileId(null)
        setCurrentFile(null)
      }
      utils.userFiles.list.invalidate({ type })
    }
  })

  const markOpenedMutation = trpc.userFiles.markOpened.useMutation()

  // === ACCIONES ===

  // Abrir archivo
  const openFile = useCallback(async (fileId: string) => {
    setCurrentFileId(fileId)
    await markOpenedMutation.mutateAsync({ id: fileId })
    await utils.userFiles.get.invalidate({ id: fileId })
  }, [setCurrentFileId, markOpenedMutation, utils])

  // Crear nuevo archivo
  const createFile = useCallback(async (
    name: string,
    initialData?: unknown,
    options?: { aiModel?: string; aiPrompt?: string }
  ) => {
    return createMutation.mutateAsync({
      type,
      name,
      univerData: type === 'excel' || type === 'doc' ? initialData : undefined,
      content: type === 'note' ? initialData as string : undefined,
      ...options
    })
  }, [type, createMutation])

  // Guardar cambios (crea nueva versión)
  const saveFile = useCallback(async (
    updates: {
      univerData?: unknown
      content?: string
      name?: string
    },
    options?: {
      changeType?: 'auto_save' | 'manual_save' | 'ai_edit'
      changeDescription?: string
      aiModel?: string
      aiPrompt?: string
      toolName?: string
      skipVersion?: boolean
    }
  ) => {
    if (!currentFile) return

    setSavingState(prev => ({ ...prev, [currentFile.id]: true }))

    return updateMutation.mutateAsync({
      id: currentFile.id,
      ...updates,
      changeType: options?.changeType || 'auto_save',
      changeDescription: options?.changeDescription,
      aiModel: options?.aiModel,
      aiPrompt: options?.aiPrompt,
      toolName: options?.toolName,
      skipVersion: options?.skipVersion
    })
  }, [currentFile, updateMutation, setSavingState])

  // Cerrar archivo
  const closeFile = useCallback(() => {
    setCurrentFileId(null)
    setCurrentFile(null)
  }, [setCurrentFileId, setCurrentFile])

  // Eliminar archivo
  const deleteFile = useCallback(async (fileId: string) => {
    return deleteMutation.mutateAsync({ id: fileId })
  }, [deleteMutation])

  // Marcar como dirty (cambio pendiente)
  const markDirty = useCallback((data: { univerData?: unknown; content?: string }) => {
    if (!currentFile) return

    setSnapshotCache(prev => ({
      ...prev,
      [currentFile.id]: {
        ...data,
        timestamp: Date.now(),
        isDirty: true
      }
    }))
  }, [currentFile, setSnapshotCache])

  // Estado actual
  const snapshot = currentFile ? snapshotCache[currentFile.id] : null
  const isSaving = currentFile ? savingState[currentFile.id] || false : false
  const isDirty = snapshot?.isDirty || false

  return {
    // Estado
    currentFile,
    currentFileId,
    filesList: filesList || [],
    snapshot,
    isLoading: isLoadingFile,
    isLoadingList,
    isSaving,
    isDirty,

    // Acciones
    openFile,
    createFile,
    saveFile,
    closeFile,
    deleteFile,
    markDirty,
    refresh: () => utils.userFiles.list.invalidate({ type })
  }
}
```

### 3.3 Hook para Historial de Versiones

**Archivo:** `apps/electron/renderer/lib/hooks/use-file-versions.ts`

```typescript
import { useAtom } from 'jotai'
import { trpc } from '@/lib/trpc'
import { versionHistoryOpenAtom, versionHistoryFileIdAtom } from '@/lib/atoms/user-files'

export function useFileVersions(fileId: string | null) {
  const [isOpen, setIsOpen] = useAtom(versionHistoryOpenAtom)
  const [, setHistoryFileId] = useAtom(versionHistoryFileIdAtom)

  const utils = trpc.useUtils()

  // Query versiones
  const { data: versions, isLoading } = trpc.userFiles.listVersions.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId && isOpen }
  )

  // Mutation para restaurar
  const restoreMutation = trpc.userFiles.restoreVersion.useMutation({
    onSuccess: () => {
      // Invalidar archivo y versiones
      utils.userFiles.get.invalidate({ id: fileId! })
      utils.userFiles.listVersions.invalidate({ fileId: fileId! })
    }
  })

  // Abrir panel de historial
  const openHistory = (fId: string) => {
    setHistoryFileId(fId)
    setIsOpen(true)
  }

  // Cerrar panel
  const closeHistory = () => {
    setIsOpen(false)
    setHistoryFileId(null)
  }

  // Restaurar versión
  const restoreVersion = async (versionNumber: number) => {
    if (!fileId) return
    return restoreMutation.mutateAsync({ fileId, versionNumber })
  }

  // Query versión específica (para preview)
  const getVersion = (versionNumber: number) => {
    return utils.userFiles.getVersion.fetch({
      fileId: fileId!,
      versionNumber
    })
  }

  return {
    versions: versions || [],
    isLoading,
    isRestoring: restoreMutation.isPending,
    isOpen,
    openHistory,
    closeHistory,
    restoreVersion,
    getVersion
  }
}
```

---

## Fase 4: Integración con Univer

### 4.1 Modificar UniverSpreadsheet

El componente debe:
1. Recibir `fileId` en lugar de `artifactId`
2. Usar `useUserFile('excel')` para persistencia
3. Llamar `saveFile()` con metadatos de IA cuando el agent panel modifica
4. Mostrar indicador de guardado y número de versión

**Cambios clave en `univer-spreadsheet.tsx`:**

```typescript
interface UniverSpreadsheetProps {
  fileId?: string          // Cambiar de artifactId
  data?: unknown           // Datos iniciales
  onVersionCreated?: (version: number) => void
}

export const UniverSpreadsheet = React.forwardRef<UniverSpreadsheetRef, UniverSpreadsheetProps>(({
  fileId,
  data,
  onVersionCreated
}, ref) => {
  const { currentFile, saveFile, markDirty, isSaving } = useUserFile('excel')

  // Auto-save con debounce
  const debouncedSave = useDebouncedCallback(async (univerData: unknown) => {
    if (currentFile) {
      const result = await saveFile({ univerData }, { changeType: 'auto_save' })
      if (result && onVersionCreated) {
        onVersionCreated(result.version_count)
      }
    }
  }, AUTO_SAVE_DELAY)

  // Handler para cambios del usuario
  const handleChange = useCallback((univerData: unknown) => {
    markDirty({ univerData })
    debouncedSave(univerData)
  }, [markDirty, debouncedSave])

  // Handler para cambios por IA (llamado desde agent panel)
  const handleAIChange = useCallback(async (
    univerData: unknown,
    options: { aiModel: string; aiPrompt: string; toolName: string }
  ) => {
    if (currentFile) {
      const result = await saveFile(
        { univerData },
        {
          changeType: 'ai_edit',
          changeDescription: `Editado por ${options.toolName}`,
          ...options
        }
      )
      if (result && onVersionCreated) {
        onVersionCreated(result.version_count)
      }
    }
  }, [currentFile, saveFile, onVersionCreated])

  // Exponer método para agent panel
  useImperativeHandle(ref, () => ({
    save: () => workbookRef.current?.save(),
    getSnapshot: () => workbookRef.current?.save(),
    markDirty: () => markDirty({ univerData: workbookRef.current?.save() }),
    saveWithAIMetadata: handleAIChange
  }), [markDirty, handleAIChange])

  // ... resto del componente
})
```

---

## Fase 5: Integración con Agent Panel

### 5.1 Modificar MCP Tools para Excel

Los tools deben:
1. Guardar versión después de cada operación
2. Incluir metadatos de IA en la versión

**En `apps/electron/main/lib/agents/mcp-tools.ts`:**

```typescript
export function createExcelMcpTools(context: ExcelContext) {
  return {
    create_table: async (args: CreateTableArgs) => {
      // ... crear tabla en Univer

      // Guardar versión con metadatos
      await context.saveVersion({
        changeType: 'ai_edit',
        changeDescription: `Tabla creada: ${args.tableName}`,
        toolName: 'create_table',
        aiModel: context.modelId,
        aiPrompt: context.lastPrompt
      })

      return result
    },

    update_cells: async (args: UpdateCellsArgs) => {
      // ... actualizar celdas

      await context.saveVersion({
        changeType: 'ai_edit',
        changeDescription: `Celdas actualizadas: ${args.range}`,
        toolName: 'update_cells',
        aiModel: context.modelId,
        aiPrompt: context.lastPrompt
      })

      return result
    },

    // ... otros tools
  }
}
```

### 5.2 Contexto del Agent Panel

El Agent Panel debe recibir el `fileId` actual y usarlo para:
1. Cargar el archivo correcto
2. Guardar versiones con contexto de IA
3. Mostrar historial de ese archivo específico

---

## Fase 6: UI - Componentes

### 6.1 File List Sidebar

Componente para listar y gestionar archivos:
- Lista de archivos ordenados por reciente/pinned
- Crear nuevo archivo
- Eliminar/archivar
- Renombrar

### 6.2 Version History Panel

Panel lateral o modal para:
- Ver timeline de versiones
- Preview de versión (read-only)
- Restaurar versión
- Ver diff entre versiones (futuro)
- Filtrar por tipo de cambio (user/AI)

### 6.3 File Header

Barra superior mostrando:
- Nombre del archivo (editable)
- Indicador de guardado (✓ Guardado / ⏳ Guardando...)
- Número de versión actual
- Botón de historial
- Menú de acciones (exportar, duplicar, etc.)

---

## Orden de Implementación

### Semana 1: Base
1. [ ] Crear migración SQL con tablas y RLS
2. [ ] Implementar router tRPC `userFilesRouter`
3. [ ] Registrar router en tRPC index

### Semana 2: Frontend Core
4. [ ] Crear atoms para estado de archivos
5. [ ] Implementar hook `useUserFile`
6. [ ] Implementar hook `useFileVersions`

### Semana 3: Integración Univer
7. [ ] Modificar UniverSpreadsheet para usar nuevo sistema
8. [ ] Modificar UniverDocument similar
9. [ ] Implementar auto-save con versioning

### Semana 4: Agent Panel
10. [ ] Modificar MCP tools para guardar versiones
11. [ ] Integrar fileId en context del agent panel
12. [ ] Agregar metadatos de IA a versiones

### Semana 5: UI
13. [ ] Implementar FileList sidebar
14. [ ] Implementar Version History panel
15. [ ] Implementar File Header

### Semana 6: Testing y Polish
16. [ ] Testing end-to-end
17. [ ] Migración de datos existentes
18. [ ] Documentación

---

## Notas Importantes

1. **Compatibilidad**: El sistema de `artifacts` se mantiene para charts, PDFs, etc.
2. **Performance**: Los snapshots grandes pueden comprimirse con pako/gzip
3. **Límites**: Considerar límite de versiones (ej: mantener últimas 100)
4. **Export**: Añadir capacidad de exportar archivo con todo su historial
5. **Offline**: Considerar sync cuando vuelva conexión

---

## Próximos Pasos Inmediatos

1. Aprobar este plan
2. Crear la migración SQL
3. Comenzar implementación del router
