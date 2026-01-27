# Auto-Guardado Mejorado - Sistema Inteligente

## ✅ Mejoras Implementadas

### 1. **Auto-Guardado Configurable** ✅

**Configuración:**

- Delay ajustable desde Settings → Advanced Tab
- Default: 15 segundos (15000ms)
- Rango: 5-60 segundos
- Se aplica inmediatamente sin reiniciar

**UI en Settings:**

- Slider para ajustar delay
- Muestra tiempo en segundos (5s - 60s)
- Guarda automáticamente al cambiar

### 2. **Detección Inteligente de Cambios** ✅

**Problema Resuelto:**

- ❌ Antes: Guardaba incluso si no había cambios reales
- ✅ Ahora: Compara snapshots antes de guardar
- ✅ Solo guarda si hay cambios reales detectados

**Implementación:**

```typescript
// Compara snapshot actual con último guardado
const lastSaved = lastSavedSnapshotRef.current;
if (lastSaved && !hasRealChanges(lastSaved, snapshot)) {
  console.log("No real changes detected, skipping auto-save");
  isDirtyRef.current = false;
  return; // No guarda
}
```

**Beneficios:**

- No llena la base de datos con versiones innecesarias
- Solo crea versiones cuando hay cambios reales
- Mejor rendimiento y menos almacenamiento

### 3. **Diff Stats en Version Cards** ✅

**Características:**

- Muestra estadísticas compactas de cambios
- Badges minimalistas con colores:
  - 🟢 Verde: Celdas agregadas (+N)
  - 🔵 Azul: Celdas modificadas (~N)
  - 🔴 Rojo: Celdas eliminadas (-N)
  - 🟣 Púrpura: Hojas agregadas/eliminadas

**Diseño:**

- Badges pequeños (text-[10px])
- Colores sutiles (bg-\*-500/10)
- Solo muestra si hay cambios
- Compacto y minimalista

### 4. **Tracking de Snapshot Guardado** ✅

**Implementación:**

- `lastSavedSnapshotRef` almacena último snapshot guardado
- Se actualiza después de cada guardado exitoso
- Se inicializa al cargar archivo
- Se resetea al cambiar de archivo

**Flujo:**

```
1. Cargar archivo → lastSavedSnapshotRef = initialData
2. Usuario edita → isDirtyRef = true
3. Auto-save trigger → Compara con lastSavedSnapshotRef
4. Si hay cambios → Guarda → lastSavedSnapshotRef = nuevo snapshot
5. Si no hay cambios → No guarda, solo actualiza cache
```

## 📊 Version Cards Mejoradas

### Estructura Compacta

```
┌─────────────────────────────────────┐
│ [Avatar]  v5  [Badge]  [Badge]     │
│            Auto-guardado            │
│            [+12] [~5] [-2]          │ ← Diff stats
│            hace 2 minutos · 4.2 KB │
└─────────────────────────────────────┘
```

### Diff Stats

**Badges:**

- `+12` - 12 celdas agregadas (verde)
- `~5` - 5 celdas modificadas (azul)
- `-2` - 2 celdas eliminadas (rojo)
- `+1 hoja` - 1 hoja nueva (púrpura)

**Cálculo:**

- Compara versión actual con versión anterior
- Usa `calculateDiffStats()` para obtener estadísticas
- Solo muestra si `totalChanges > 0`

## 🔧 Configuración

### Preferences Store

**Nuevo campo:**

```typescript
interface AppPreferences {
  trayEnabled: boolean;
  quickPromptEnabled: boolean;
  autoSaveDelay: number; // 5000-60000ms (5-60 segundos)
}
```

**Default:**

- `autoSaveDelay: 15000` (15 segundos)

**Validación:**

- Mínimo: 1000ms (1 segundo)
- Máximo: 60000ms (60 segundos)
- Se valida en backend y frontend

### Advanced Tab UI

**Componente:**

- Slider input (range)
- Muestra valor en segundos
- Guarda automáticamente
- Icono de disco floppy

**Código:**

```tsx
<input
  type="range"
  min="5000"
  max="60000"
  step="1000"
  value={autoSaveDelay}
  onChange={(e) => {
    const value = parseInt(e.target.value, 10)
    setAutoSaveDelay(value)
    updatePreferences({ autoSaveDelay: value })
  }}
/>
<span>{Math.round(autoSaveDelay / 1000)}s</span>
```

## 🎯 Flujo Completo

### Escenario: Usuario Edita

```
1. Usuario edita celda
   → isDirtyRef = true
   → Cache actualizado
   → Auto-save programado (15s)

2. Espera 15 segundos
   → Auto-save ejecuta
   → Obtiene snapshot actual
   → Compara con lastSavedSnapshotRef

3a. Si hay cambios reales:
    → Guarda a DB
    → Crea nueva versión
    → lastSavedSnapshotRef = nuevo snapshot
    → isDirtyRef = false

3b. Si NO hay cambios reales:
    → No guarda
    → Solo actualiza cache
    → isDirtyRef = false
    → Log: "No real changes detected, skipping auto-save"
```

### Escenario: Usuario Solo Selecciona

```
1. Usuario selecciona celda (sin editar)
   → Command ejecutado (pero no MUTATION)
   → isDirtyRef NO se marca
   → No se programa auto-save

2. Usuario hace click (sin cambios)
   → No hay cambios
   → No se guarda nada
```

## 📁 Archivos Modificados

### Backend

- `apps/electron/main/lib/preferences-store.ts` - Agregado autoSaveDelay
- `apps/electron/main/index.ts` - Handler actualizado
- `apps/electron/preload/index.ts` - Tipos actualizados
- `apps/electron/preload/index.d.ts` - Tipos actualizados

### Frontend - Utils

- `apps/electron/renderer/utils/univer-diff-stats.ts` - Nuevo: Cálculo de diff stats
- `apps/electron/renderer/utils/univer-diff.ts` - Ya existía

### Frontend - Components

- `apps/electron/renderer/components/file-version-history-panel-enhanced.tsx` - Cards con diff stats
- `apps/electron/renderer/features/settings/tabs/advanced-tab.tsx` - UI de configuración

### Frontend - Features

- `apps/electron/renderer/features/univer/univer-spreadsheet.tsx` - Auto-save mejorado
- `apps/electron/renderer/features/univer/univer-document.tsx` - Auto-save mejorado

## ✅ Checklist

- [x] Auto-save delay configurable (5-60s, default 15s)
- [x] UI en Settings → Advanced Tab
- [x] Detección de cambios reales (comparar snapshots)
- [x] No guardar si no hay cambios
- [x] Tracking de último snapshot guardado
- [x] Diff stats en version cards
- [x] Badges minimalistas y bonitos
- [x] Colores adaptados al tema
- [x] Funciona para Excel y Docs

## 🎊 Resultado Final

Sistema de auto-guardado completamente mejorado:

- ✅ Configurable desde Settings
- ✅ Solo guarda si hay cambios reales
- ✅ No llena la DB con versiones innecesarias
- ✅ Version cards con diff stats compactas
- ✅ Diseño minimalista y bonito
- ✅ Adaptado al tema

¡Sistema profesional y eficiente! 🚀
