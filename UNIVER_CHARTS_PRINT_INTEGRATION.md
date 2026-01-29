# Integración de Charts y Print Layout en Univer

## 📊 Componentes Creados

### 1. UniverCharts (`components/univer-charts.tsx`)
Componente de gráficos inteligente que:
- ✅ Extrae datos automáticamente de Univer
- ✅ Detecta cabeceras y columnas numéricas
- ✅ Auto-detecta tipo de gráfico (Bar, Line, Pie, Area)
- ✅ Se actualiza al cambiar selección
- ✅ Usa Recharts (alternativa GRATUITA a charts Pro)

**Características:**
- **Auto-detección de cabeceras**: Si la primera fila tiene texto, se asume como cabecera
- **Análisis de tipos de datos**: Detecta automáticamente columnas numéricas vs texto
- **Reactividad**: Se actualiza cuando cambias la selección en Univer
- **Múltiples series**: Soporta series múltiples (columnas) en un solo gráfico

### 2. PrintLayout (`components/print-layout.tsx`)
Componente de configuración de página estilo Excel que:
- ✅ Configura tamaño de papel (A4, Letter, Legal)
- ✅ Controla orientación (Portrait/Landscape)
- ✅ Maneja márgenes (Normal, Ancho, Estrecho, Custom)
- ✅ Ajusta escala (10% - 400%)
- ✅ Vista previa en tiempo real
- ✅ Aplica estilos @media print automáticamente

**Características:**
- Presets de márgenes estilo Excel (Normal, Wide, Narrow)
- Preview de dimensiones en pixels
- Opciones de alineación
- Gridlines y headers control
- Blanco y negro opción

### 3. ExportService (`services/export-service.ts`)
Servicio de exportación que usa ExcelJS:
- ✅ Exportar a Excel (.xlsx) con estilos
- ✅ Exportar a CSV con BOM UTF-8
- ✅ Control de área de impresión
- ✅ Configuración de página en el archivo Excel
- ✅ Formato de celdas (números alineados a derecha)

**Métodos:**
- `exportToExcel()` - Exportar hoja completa o rango
- `exportToCSV()` - Exportar a CSV
- `exportToPDF()` - Usar print nativo del navegador
- `exportSelection()` - Exportar solo selección actual

## 🎨 Uso de los Componentes

### Ejemplo: UniverCharts

\`\`\`tsx
import { UniverCharts } from './features/univer/components'
import { univerAPI } from './features/univer/univer-sheets-core'

function MyComponent() {
  return (
    <UniverCharts univerAPI={univerAPI} />
  )
}
\`\`\`

### Ejemplo: PrintLayout

\`\`\`tsx
import { PrintLayout } from './features/univer/components'
import { UniverExportService } from './features/univer/services/export-service'
import { univerAPI } from './features/univer/univer-sheets-core'

function MyComponent() {
  const handleApply = (settings) => {
    // Aplicar configuración
    console.log('Apply settings:', settings)
  }

  const handlePreview = () => {
    // Mostrar vista previa
    console.log('Preview settings')
  }

  return (
    <PrintLayout 
      univerAPI={univerAPI}
      onApply={handleApply}
      onPreview={handlePreview}
    />
  )
}

// Exportar datos
const handleExport = async () => {
  await UniverExportService.exportToExcel(univerAPI, {
    filename: 'mi-dato.xlsx',
    format: 'xlsx',
    includeHeaders: true,
    includeGridlines: true,
    orientation: 'landscape',
    scale: 100,
  })
}
\`\`\`

## 🔧 Integración con univer-sheets-core

Para integrar los nuevos componentes en tu aplicación:

### 1. Importar los componentes

\`\`\`tsx
import { UniverCharts, PrintLayout } from './features/univer/components'
import { UniverExportService } from './features/univer/services/export-service'
\`\`\`

### 2. Importar estilos CSS

\`\`\`tsx
// En tu archivo principal o en univer-sheets-core.ts
import './features/univer/print.css'
\`\`\`

### 3. Añadir botones a la toolbar o sidebar

Puedes añadir botones para abrir los paneles:

\`\`\`tsx
<button onClick={() => setShowCharts(true)}>
  📊 Gráficos
</button>

<button onClick={() => setShowPrintLayout(true)}>
  🖨️ Configurar Página
</button>

<button onClick={() => UniverExportService.exportToExcel(univerAPI, { format: 'xlsx' })}>
  📥 Exportar Excel
</button>
\`\`\`

## 📋 Comparación: Univer Pro vs Solución Gratuita

| Funcionalidad | Univer Pro | Solución Gratuita |
|--------------|-------------|------------------|
| **Charts** | ✅ \$\$ | ✅ Recharts (GRATIS) |
| **Print/PDF** | ✅ \$\$ | ✅ CSS Print + ExcelJS (GRATIS) |
| **Page Layout** | ✅ \$\$ | ✅ PrintLayout component (GRATIS) |
| **Margenes** | ✅ \$\$ | ✅ Customizable (GRATIS) |
| **Orientación** | ✅ \$\$ | ✅ Portrait/Landscape (GRATIS) |
| **Escala** | ✅ \$\$ | ✅ 10% - 400% (GRATIS) |
| **Exportar Excel** | ✅ \$\$ | ✅ ExcelJS (GRATIS) |
| **Exportar CSV** | ✅ \$\$ | ✅ ExcelJS (GRATIS) |

## 🎯 Próximos Pasos

1. **Integrar Charts panel** en tu UI (sidebar o dialog)
2. **Integrar Print Layout panel** en tu UI
3. **Añadir botones de exportación** a la toolbar
4. **Testing** con datos reales de Univer
5. **Personalizar estilos** según tu tema

## ⚠️ Limitaciones de la Solución Gratuita

- **Charts**: Usan Recharts externo, no integrado en la celda de Univer
- **Print**: Usa @media print CSS, puede variar entre navegadores
- **PDF**: Usa print nativo del navegador (requiere "Guardar como PDF" manual)
- **Page Breaks**: No tan avanzados como Univer Pro (pero funcionales)

## 💡 Tips

1. **Para charts**: Selecciona el rango de datos antes de abrir el panel
2. **Para print**: Configura márgenes y orientación antes de imprimir
3. **Para exportar**: Usa `exportSelection()` para exportar solo datos seleccionados
4. **Escala**: Usa escala < 100% para ajustar más datos en una página

## 📚 Archivos Creados

\`\`\`
apps/electron/renderer/features/univer/
├── components/
│   ├── univer-charts.tsx       # Componente de gráficos
│   ├── print-layout.tsx          # Panel de configuración de página
│   └── index.ts                # Export de componentes
├── services/
│   └── export-service.ts        # Servicio de exportación
└── print.css                   # Estilos de impresión
\`\`\`
