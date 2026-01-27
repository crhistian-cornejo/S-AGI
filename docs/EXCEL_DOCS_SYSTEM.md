# Sistema Completo de Excel/Docs con Persistencia, Diff, Commits y Versionado

## Resumen

Se ha implementado un sistema completo estilo Google Docs/Sheets para Excel y Docs con:

- ✅ **Persistencia completa** (cloud + local)
- ✅ **Sistema de versiones** (git-like)
- ✅ **Diff visual** entre versiones
- ✅ **Sistema de commits** (agrupar cambios)
- ✅ **Auto-save** inteligente
- ✅ **UI completa** para historial

## Componentes Implementados

### 1. Sistema de Diff (`apps/electron/renderer/utils/univer-diff.ts`)

**Funcionalidades:**

- Compara dos snapshots de Univer workbook
- Detecta celdas agregadas, modificadas, eliminadas
- Detecta hojas agregadas/eliminadas
- Genera resumen legible de cambios
- Calcula rangos afectados

**Uso:**

```typescript
import { diffWorkbooks, generateChangeSummary } from "@/utils/univer-diff";

const diff = diffWorkbooks(oldSnapshot, newSnapshot);
console.log(generateChangeSummary(diff)); // "3 celdas modificadas, 1 hoja agregada"
```

### 2. Sistema de Commits

**Base de Datos:**

- Migración: `20260127000000_add_commits_to_file_versions.sql`
- Campos agregados:
  - `commit_id`: UUID para agrupar versiones
  - `commit_message`: Mensaje descriptivo
  - `commit_parent_id`: Referencia a versión padre
  - `diff_summary`: JSONB con resumen de cambios

**API tRPC:**

- `userFiles.createCommit`: Crear commit agrupando versiones
- `userFiles.getCommits`: Obtener historial de commits
- `userFiles.update`: Soporta `commitOptions` para crear versiones con commit

**Uso:**

```typescript
// Crear commit
await trpc.userFiles.createCommit.mutate({
  fileId: "...",
  message: "Agregué nuevas fórmulas y formato",
  versionNumbers: [5, 6, 7], // Opcional: versiones específicas
});

// Guardar con commit
await saveFile(
  { univerData: snapshot },
  {
    commitMessage: "Implementé nueva funcionalidad",
    commitId: crypto.randomUUID(),
  },
);
```

### 3. Componente de Diff Visual (`apps/electron/renderer/components/file-version-diff.tsx`)

**Características:**

- Muestra resumen de cambios
- Lista hojas agregadas/eliminadas
- Detalle de celdas modificadas por hoja
- Expandible/colapsable
- Colores diferenciados (verde=agregado, rojo=eliminado, amarillo=modificado)

**Uso:**

```tsx
<FileVersionDiff versionA={versionA} versionB={versionB} fileType="excel" />
```

### 4. Panel de Historial Completo (`apps/electron/renderer/components/file-version-history.tsx`)

**Funcionalidades:**

- Lista todas las versiones agrupadas por fecha
- Vista previa de versiones
- Comparación side-by-side con diff visual
- Restauración de versiones
- Creación de commits
- Filtros y búsqueda

**Uso:**

```tsx
<FileVersionHistory
  fileId={fileId}
  fileType="excel"
  onClose={() => setOpen(false)}
/>
```

### 5. Mejoras en Router tRPC

**Nuevos endpoints:**

- `compareVersions`: Compara dos versiones y calcula diff
- `createCommit`: Crea un commit agrupando versiones
- `getCommits`: Obtiene historial de commits

**Mejoras en `update`:**

- Soporte para `commitOptions`
- Auto-linking a versión anterior
- Cálculo automático de diff_summary

### 6. Guardado Local

**Ya implementado:**

- `excel:save-local` IPC handler
- Export a `.xlsx` usando ExcelJS
- Integrado en `MainLayout` con `handleExportExcel`

**Uso:**

```typescript
const buffer = await exportToExcelBuffer(snapshot);
const base64 = arrayBufferToBase64(buffer);
await window.desktopApi.excel.saveLocal({
  base64,
  suggestedName: "mi-archivo.xlsx",
});
```

## Flujo de Trabajo

### 1. Edición Normal

```
Usuario edita → Auto-save (3s) → Crea versión → Guarda en DB
```

### 2. Edición con IA

```
Agent Panel modifica → saveWithAIMetadata() → Crea versión con metadatos → Guarda en DB
```

### 3. Commit Manual

```
Usuario hace cambios → Crea commit → Agrupa versiones → Guarda con commit_id
```

### 4. Comparación

```
Usuario selecciona 2 versiones → compareVersions() → Calcula diff → Muestra visualmente
```

## Integración con Univer

### Auto-save

El componente `UniverSpreadsheet` ya tiene:

- ✅ Auto-save después de 3 segundos de inactividad
- ✅ Guardado manual con `handleSave()`
- ✅ Guardado con metadatos de IA con `handleSaveWithAIMetadata()`

### Cache de Snapshots

- ✅ Cache local para cambios no guardados
- ✅ Prevención de pérdida de datos al cambiar de tab
- ✅ Sincronización con DB

## Próximos Pasos (Opcional)

### 1. Highlight de Cambios en Univer

Para mostrar cambios visualmente en el editor:

```typescript
// En univer-spreadsheet.tsx
const highlightChanges = (diff: WorkbookDiff) => {
  diff.modifiedSheets.forEach((sheet) => {
    sheet.cellChanges.forEach((change) => {
      // Aplicar estilo a celda en Univer
      const cell = activeSheet.getRange(change.row, change.col);
      cell.setBackgroundColor(change.type === "added" ? "#90EE90" : "#FFB6C1");
    });
  });
};
```

### 2. Export con Historial

```typescript
// Exportar archivo con todas sus versiones
const exportWithHistory = async (fileId: string) => {
  const file = await trpc.userFiles.get.query({ id: fileId });
  const versions = await trpc.userFiles.listVersions.query({ fileId });

  // Crear ZIP con:
  // - archivo.xlsx (versión actual)
  // - versions/ (carpeta con todas las versiones)
  // - history.json (metadatos)
};
```

### 3. Sincronización Offline

- Guardar cambios localmente cuando no hay conexión
- Sincronizar cuando vuelva la conexión
- Resolver conflictos si es necesario

## Migraciones Necesarias

Ejecutar las migraciones en orden:

1. `20260126000000_add_user_files.sql` (ya existe)
2. `20260127000000_add_commits_to_file_versions.sql` (nueva)

```bash
# Las migraciones se ejecutan automáticamente al iniciar la app
# O manualmente desde Supabase dashboard
```

## Testing

### Probar Diff

1. Crear archivo Excel
2. Hacer cambios
3. Abrir historial de versiones
4. Seleccionar 2 versiones para comparar
5. Verificar que se muestran los cambios correctamente

### Probar Commits

1. Hacer varios cambios
2. Abrir historial
3. Crear commit con mensaje
4. Verificar que las versiones se agrupan

### Probar Restauración

1. Crear versión con cambios
2. Restaurar a versión anterior
3. Verificar que se crea nueva versión con tipo 'restore'

## Notas Importantes

1. **Performance**: Los diffs se calculan en el cliente para mejor rendimiento
2. **Storage**: Considerar comprimir snapshots grandes (pako/gzip)
3. **Límites**: Implementar cleanup de versiones antiguas (>100)
4. **Seguridad**: RLS policies aseguran que usuarios solo ven sus archivos

## Referencias

- [Univer OT Algorithm](https://docs.univer.ai/blog/ot)
- [Univer Sheets API](https://docs.univer.ai/guides/sheets/features/core/sheets-api)
- [PLAN_FILE_SYSTEM.md](./PLAN_FILE_SYSTEM.md) - Plan original
