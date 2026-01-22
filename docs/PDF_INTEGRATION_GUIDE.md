# 📍 ¿Dónde está el PDF en tu UI?

## 🎯 Ubicación Actual del PDF Viewer

El componente `PdfViewer` está creado pero **NO está integrado** en tu UI aún.

---

## 📂 Estructura Actual de Artifacts

### Archivos Clave:

```
src/
├── renderer/
│   ├── features/
│   │   ├── artifacts/
│   │   │   └── artifact-panel.tsx     ← PANEL PRINCIPAL
│   │   ├── univer/
│   │   │   ├── univer-document.tsx     ← Viewer DOCX
│   │   │   └── univer-spreadsheet.tsx ← Viewer XLSX
│   │   ├── charts/
│   │   │   └── chart-viewer.tsx        ← Viewer Charts
│   │   └── docs/
│   │       └── doc-viewer.tsx            ← Wrapper documents
│   └── components/
│       └── pdf-viewer/
│           └── PdfViewer.tsx              ← ✅ PDF VIEWER CREADO (no integrado)
```

---

## 🔍 Cómo Funciona el Sistema de Artifacts

### Tipos de Artifacts Actuales:

```typescript
// src/shared/types.ts
export const ArtifactTypeSchema = z.enum([
  'spreadsheet',  // Hojas de cálculo (Univer)
  'table',        // Tablas
  'chart',        // Gráficos (Recharts)
  'code',         // Código
  'document'      // Documentos (Univer - DOCX)
])
```

**NOTA:** No existe el tipo `pdf` actualmente.

### En `artifact-panel.tsx`:

```tsx
// Línea 249-285: RENDERIZADO DE VIEWERS
{isSpreadsheet ? (
    <UniverSpreadsheet
        ref={spreadsheetRef}
        artifactId={artifact.id}
        data={artifact.univer_data}
    />
) : isDocument ? (
    <UniverDocument
        ref={documentRef}
        artifactId={artifact.id}
        data={artifact.univer_data}
    />
) : isChart && artifact.content ? (
    <ChartViewer
        ref={chartViewerRef}
        artifactId={artifact.id}
        config={artifact.content as any}
        className="p-4"
    />
) : (
    <div>Unsupported artifact type: {artifact.type}</div>
)}
```

---

## 🚀 Pasos para Integrar el PDF Viewer

### Paso 1: Agregar Tipo de Artifact 'pdf'

**Archivo:** `src/shared/types.ts`

```typescript
// CAMBIAR ESTO:
export const ArtifactTypeSchema = z.enum(['spreadsheet', 'table', 'chart', 'code', 'document'])

// POR ESTO:
export const ArtifactTypeSchema = z.enum(['spreadsheet', 'table', 'chart', 'code', 'document', 'pdf'])
```

### Paso 2: Importar PdfViewer en Artifact Panel

**Archivo:** `src/renderer/features/artifacts/artifact-panel.tsx`

```tsx
// AGREGAR IMPORT AL INICIO:
import { PdfViewer } from '@/components/pdf-viewer/PdfViewer'

// Opcional: Importar icono PDF si no existe:
import { IconFileTypePdf } from '@tabler/icons-react'
```

### Paso 3: Agregar Lógica de Rendering

**Archivo:** `src/renderer/features/artifacts/artifact-panel.tsx`

```tsx
// EN LA FUNCIÓN ArtifactPanel() - AGREGAR:
const isPdf = artifact?.type === 'pdf'

// EN EL HEADER - AGREGAR ICONO PDF:
{isPdf && <IconFileTypePdf size={16} className="text-muted-foreground shrink-0" />}

// EN EL CONTENIDO - AGREGAR PDF VIEWER:
{isSpreadsheet ? (
    <UniverSpreadsheet ... />
) : isDocument ? (
    <UniverDocument ... />
) : isChart && artifact.content ? (
    <ChartViewer ... />
) : isPdf && artifact.pdf_url ? (
    <PdfViewer
        url={artifact.pdf_url}
        className="w-full h-full"
        onDownload={handleDownloadPdf}
    />
) : (
    <div>Unsupported artifact type: {artifact.type}</div>
)}
```

### Paso 4: Actualizar Schema de Base de Datos

**Archivo:** `src/main/lib/database/schema.ts`

```typescript
// EN TABLE artifacts - AGREGAR COLUMNAS:
pdf_url text,           // URL del archivo PDF
pdf_password text?       // Contraseña si está protegido
pdf_page_count integer   // Número de páginas
```

---

## 🎨 Donde Aparecerá el PDF Viewer

### 1. En el Artifact Panel (Sidebar derecho)

```
┌─────────────────────────────────────────────────┐
│ [Icon] Document Name          [PDF] [✕] │
├─────────────────────────────────────────────────┤
│                                         │
│         PDF VIEWER AQUÍ               │
│                                         │
│     (zoom, pan, navegación páginas)        │
│                                         │
│                                         │
└─────────────────────────────────────────────────┘
```

### 2. En el Tab 'Doc' (Pantalla completa)

**Archivo:** `src/renderer/features/docs/doc-viewer.tsx`

```tsx
// ACTUALIZAR PARA INCLUIR PDF:
if (selectedArtifact?.type === 'pdf') {
    return (
        <PdfViewer
            url={selectedArtifact.pdf_url}
            className="w-full h-screen"
        />
    )
}

if (selectedArtifact?.type === 'document') {
    return <UniverDocument ... />
}
```

---

## 📝 Flujo Completo de Integración

### 1. Crear Artifact PDF (Backend)

**Archivo:** `src/main/lib/tools/create-pdf.ts`

```typescript
import { db } from '../database'
import { storage } from '../storage'

export async function createPdfArtifact(params: {
  chatId: string
  pdfUrl: string
  name: string
}) {
  // Descargar PDF
  const pdfBuffer = await fetch(params.pdfUrl).then(r => r.arrayBuffer())

  // Subir a storage
  const { path, url } = await storage.upload('pdfs', {
    filename: `${params.name}.pdf`,
    buffer: Buffer.from(pdfBuffer),
    contentType: 'application/pdf'
  })

  // Crear artifact en DB
  const artifact = await db.insert('artifacts', {
    id: generateId(),
    chat_id: params.chatId,
    name: params.name,
    type: 'pdf',
    pdf_url: url,
    pdf_page_count: await getPdfPageCount(pdfBuffer),
    created_at: new Date().toISOString()
  })

  return artifact
}
```

### 2. Exponer Tool al Agent

**Archivo:** `src/renderer/features/agent/agent-tool-registry.ts`

```typescript
"tool_create_pdf": {
  name: "create_pdf",
  description: "Create a PDF artifact from a URL",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "PDF URL" },
      name: { type: "string", description: "Document name" }
    },
    required: ["url", "name"]
  },
  execute: async (input: any) => {
    const result = await window.desktopApi.createPdfArtifact(input)
    return {
      artifactId: result.id
    }
  },
  getStatus: (isPending) =>
    isPending ? "Creating PDF" : "Created PDF"
}
```

### 3. Frontend Integration

**Ver Pasos 1-4 arriba**

---

## ✅ Checklist de Integración

- [ ] Agregar tipo 'pdf' a `ArtifactTypeSchema`
- [ ] Importar `PdfViewer` en `artifact-panel.tsx`
- [ ] Agregar icono `IconFileTypePdf` al header
- [ ] Agregar rendering condicional para PDFs
- [ ] Actualizar DB schema (columnas `pdf_url`, `pdf_password`, `pdf_page_count`)
- [ ] Crear mutation `createPdfArtifact` en backend
- [ ] Exponer tool `tool_create_pdf` al agent
- [ ] Probar viewer con PDFs de diferentes tamaños
- [ ] Probar viewer con PDFs protegidos por contraseña
- [ ] Probar zoom, pan, navegación
- [ ] Probar atajos de teclado

---

## 🎯 Resumen Visual

**LUGAR 1: Artifact Panel** (Sidebar derecho, width: 500px)
```
┌──────────────────────┐
│ [PDF] My Doc.pdf   │ ← HEADER
├──────────────────────┤
│                    │
│   PDF VIEWER      │ ← CONTENIDO
│   (react-pdf)      │
│                    │
└──────────────────────┘
```

**LUGAR 2: Full Screen Tab 'Doc'**
```
┌─────────────────────────────────────┐
│  Document Viewer Tab               │
├─────────────────────────────────────┤
│                                   │
│   PDF VIEWER (Fullscreen)      │
│                                   │
└─────────────────────────────────────┘
```

---

## 🚀 ¿Quieres que yo haga la integración completa?

Si me confirmas, puedo:

1. ✅ Actualizar el schema de tipos
2. ✅ Integrar PdfViewer en artifact-panel
3. ✅ Integrar PdfViewer en doc-viewer
4. ✅ Crear el tool para que el agent pueda generar PDFs
5. ✅ Actualizar la DB schema

**Solo dime:** "Sí, integra el PDF viewer completamente" y lo haré paso a paso. 🎯
