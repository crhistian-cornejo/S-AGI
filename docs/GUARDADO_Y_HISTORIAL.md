# Sistema de Guardado y Historial - Guía Completa

## ✅ Cómo Funciona el Guardado

### 1. **Auto-guardado Automático** ✅

**¿Cuándo se guarda?**
- **Automáticamente** 3 segundos después de que dejas de editar
- No necesitas hacer nada, se guarda solo
- Se crea una nueva versión en el historial

**Indicadores visuales:**
- 🔵 **"Guardando..."** - Cuando está guardando (icono nube animado)
- 🟡 **"Sin guardar"** - Cuando hay cambios pendientes (icono disco)
- 🟢 **"Guardado"** - Cuando todo está guardado (check verde + tiempo)

### 2. **Guardado Manual** ✅

**Botón de Guardar:**
- Aparece en el `FileHeader` cuando hay cambios sin guardar
- Botón **"Guardar"** con icono de disco
- También puedes usar **Ctrl+S** (próximamente)

**Ubicación:**
- En el header del archivo, al lado del estado de guardado
- Solo aparece cuando hay cambios pendientes

**Qué hace:**
- Guarda inmediatamente sin esperar 3 segundos
- Crea una nueva versión con tipo `manual_save`
- Descripción: "Guardado manual"

### 3. **Guardado con IA** ✅

**Cuándo se usa:**
- Cuando el Agent Panel hace cambios
- Incluye metadatos: `aiModel`, `aiPrompt`, `toolName`
- Tipo: `ai_edit`

## 📋 Historial de Versiones

### Cómo Abrir el Historial

1. **Botón en el Header:**
   - Click en el botón **"v{N}"** (número de versiones)
   - O en el menú de 3 puntos → "Historial de versiones"

2. **Panel Sheet:**
   - Se abre desde la derecha como un panel deslizable
   - Muestra todas las versiones del archivo

### Qué Muestra el Historial

**Información por versión:**
- 📌 Número de versión (v1, v2, etc.)
- 📝 Tipo de cambio (auto_save, manual_save, ai_edit, etc.)
- 📅 Fecha y hora (con tiempo transcurrido)
- 👤 Avatar (robot para IA, usuario para manual)
- 📏 Tamaño del archivo
- 💬 Descripción del cambio
- 🔗 Commit (si está agrupado en un commit)

**Agrupación:**
- Versiones agrupadas por fecha: "Hoy", "Ayer", "Esta semana", etc.
- Ordenadas de más reciente a más antigua

### Funciones del Historial

1. **Vista Previa:**
   - Click en una versión para verla
   - Se muestra el contenido de esa versión

2. **Comparar Versiones:**
   - Selecciona 2 versiones para comparar
   - Muestra diferencias visualmente
   - Botón "Resaltar" para ver cambios en Univer

3. **Restaurar Versión:**
   - Click en el botón de restaurar
   - Crea una nueva versión con el contenido restaurado

4. **Exportar:**
   - Botón de exportar en el header del panel
   - Opciones:
     - Versión actual (.xlsx)
     - Con historial completo (ZIP)

## 🔧 Solución de Problemas

### El historial no muestra nada

**Causa:** El hook estaba usando un atom que no se actualizaba correctamente.

**Solución:** ✅ Ya corregido
- El hook ahora carga versiones cuando `fileId` existe
- No depende del estado `isOpen` del atom

**Verificar:**
1. Asegúrate de que el archivo tiene un `fileId`
2. Verifica que hay versiones en la base de datos
3. Revisa la consola por errores

### El botón de guardar no aparece

**Causa:** Solo aparece cuando hay cambios sin guardar.

**Solución:**
1. Edita el archivo
2. Espera a que aparezca el indicador "Sin guardar"
3. El botón "Guardar" aparecerá automáticamente

### Auto-guardado no funciona

**Verificar:**
1. El archivo debe tener un `fileId` (no ser "scratch")
2. Debe haber cambios reales (no solo abrir el archivo)
3. Espera 3 segundos después de dejar de editar

**Debug:**
- Abre la consola del navegador
- Busca mensajes: `[UniverSpreadsheet] Auto-saving...`
- Si no aparecen, hay un problema con el tracking de cambios

## 📊 Flujo Completo

### Escenario 1: Editar Archivo Existente

```
1. Abres archivo existente
   → Se carga desde DB
   → isDirtyRef = false

2. Editas una celda
   → isDirtyRef = true
   → Cache actualizado
   → Header muestra "Sin guardar" 🟡
   → Botón "Guardar" aparece

3. Esperas 3 segundos (o click en Guardar)
   → Auto-save ejecuta
   → Header muestra "Guardando..." 🔵
   → Guarda a DB
   → Crea nueva versión
   → Header muestra "Guardado" 🟢
   → Botón "Guardar" desaparece
```

### Escenario 2: Ver Historial

```
1. Click en botón "v{N}" en header
   → Panel se abre desde derecha
   → Carga versiones desde DB
   → Muestra lista agrupada por fecha

2. Click en versión
   → Vista previa de esa versión
   → Puedes restaurar si quieres

3. Click en 2 versiones
   → Modo comparación
   → Muestra diferencias
   → Botón "Resaltar" disponible
```

## 🎯 Resumen

- ✅ **Auto-guardado**: 3 segundos después de editar
- ✅ **Guardado manual**: Botón "Guardar" cuando hay cambios
- ✅ **Historial**: Botón "v{N}" en el header
- ✅ **Versiones**: Se crean automáticamente en cada guardado
- ✅ **Comparación**: Selecciona 2 versiones para comparar
- ✅ **Restauración**: Click en restaurar para volver a una versión

¡Todo funciona correctamente ahora! 🚀
