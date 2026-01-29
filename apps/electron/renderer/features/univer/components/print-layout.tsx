/**
 * Print Layout - Configuración de página estilo Excel
 * Controla márgenes, orientación, escala y área de impresión
 */

'use client'

import { useState, useEffect } from 'react'
import { 
  IconFileText, 
  IconPrinter, 
  IconAlignLeft, 
  IconAlignCenter, 
  IconAlignRight 
} from '@tabler/icons-react'

interface PrintSettings {
  orientation: 'portrait' | 'landscape'
  pageSize: 'A4' | 'Letter' | 'Legal'
  margins: {
    top: number
    right: number
    bottom: number
    left: number
  }
  scale: number
  fitTo: 'none' | 'page' | 'width' | 'height'
  printArea: string // rango ej: "A1:Z50" o "todo"
  showGridlines: boolean
  showHeaders: boolean
  blackAndWhite: boolean
}

export function PrintLayout({ 
  univerAPI,
  onApply,
  onPreview
}: {
  univerAPI: any
  onApply: (settings: PrintSettings) => void
  onPreview: () => void
}) {
  const [settings, setSettings] = useState<PrintSettings>({
    orientation: 'portrait',
    pageSize: 'A4',
    margins: { top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 },
    scale: 100,
    fitTo: 'none',
    printArea: '',
    showGridlines: true,
    showHeaders: true,
    blackAndWhite: false,
  })

  // Calcular dimensiones en pixels
  const getPageDimensions = () => {
    const { pageSize, orientation, margins, scale } = settings
    const inchesPerMm = 0.03937

    // Tamaños en mm
    const sizes = {
      A4: { width: 210, height: 297 },
      Letter: { width: 215.9, height: 279.4 },
      Legal: { width: 215.9, height: 355.6 },
    }

    const size = sizes[pageSize]
    const widthMm = orientation === 'landscape' ? size.height : size.width
    const heightMm = orientation === 'landscape' ? size.width : size.height

    // Convertir a inches
    const widthIn = widthMm * inchesPerMm - margins.left - margins.right
    const heightIn = heightMm * inchesPerMm - margins.top - margins.bottom

    // Asumiendo 96 DPI, convertir a pixels
    const scaleFactor = settings.scale / 100
    return {
      width: Math.round(widthIn * 96 * scaleFactor),
      height: Math.round(heightIn * 96 * scaleFactor),
    }
  }

  const dimensions = getPageDimensions()

  // Aplicar estilos de impresión
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-layout-styles'

    const css = `
      @media print {
        @page {
          size: ${settings.pageSize} ${settings.orientation};
          margin: ${settings.margins.top}in ${settings.margins.right}in ${settings.margins.bottom}in ${settings.margins.left}in;
        }

        .univer-container {
          transform: scale(${settings.scale / 100});
          transform-origin: top left;
        }

        .univer-sheet-container {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          ${settings.blackAndWhite ? 'filter: grayscale(100%);' : ''}
        }
      }
    `

    style.textContent = css
    document.head.appendChild(style)

    return () => {
      style.remove()
    }
  }, [settings])

  // Presets de márgenes (como Excel)
  const marginPresets = [
    { name: 'Normal', top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 },
    { name: 'Ancho', top: 1, right: 1, bottom: 1, left: 1 },
    { name: 'Estrecho', top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
    { name: 'Centrado', top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 }, // Solo para preview
  ]

  // Obtener áreas de impresión de Univer
  const getPrintAreas = () => {
    if (!univerAPI) return []
    
    try {
      const workbook = univerAPI.getActiveWorkbook()
      const worksheet = workbook?.getActiveSheet()
      if (!worksheet) return []

      // En Univer, las áreas de impresión se definen con named ranges
      // Por ahora devolvemos opciones básicas
      return [
        { value: '', label: 'Imprimir hoja completa' },
        { value: 'selection', label: 'Solo selección actual' },
      ]
    } catch {
      return [
        { value: '', label: 'Imprimir hoja completa' },
        { value: 'selection', label: 'Solo selección actual' },
      ]
    }
  }

  return (
    <div className="space-y-4 bg-card p-6 rounded-lg border">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <IconFileText className="text-primary" size={24} />
          <h2 className="text-xl font-semibold">Configuración de Página</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onPreview()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <IconPrinter size={18} />
            Vista Previa
          </button>
          <button
            onClick={() => onApply(settings)}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Tamaño y Orientación */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Tamaño de papel</label>
          <select
            value={settings.pageSize}
            onChange={(e) => setSettings({ ...settings, pageSize: e.target.value as any })}
            className="w-full px-3 py-2 bg-background border rounded-md"
          >
            <option value="A4">A4 (210 x 297 mm)</option>
            <option value="Letter">Carta (216 x 279 mm)</option>
            <option value="Legal">Legal (216 x 356 mm)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Orientación</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSettings({ ...settings, orientation: 'portrait' })}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-md transition-colors ${settings.orientation === 'portrait' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              <div className="w-8 h-10 border-2 border-current rounded-sm" />
              <span className="text-sm">Vertical</span>
            </button>
            <button
              onClick={() => setSettings({ ...settings, orientation: 'landscape' })}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-md transition-colors ${settings.orientation === 'landscape' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              <div className="w-10 h-8 border-2 border-current rounded-sm" />
              <span className="text-sm">Horizontal</span>
            </button>
          </div>
        </div>
      </div>

      {/* Márgenes */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Márgenes (pulgadas)</label>
        
        <div className="grid grid-cols-4 gap-2">
          {marginPresets.map(preset => (
            <button
              key={preset.name}
              onClick={() => setSettings({ ...settings, margins: preset as any })}
              className={`px-3 py-2 text-sm border rounded-md transition-colors ${JSON.stringify(settings.margins) === JSON.stringify(preset) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm w-20">Superior</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2.54"
              value={settings.margins.top}
              onChange={(e) => setSettings({ 
                ...settings, 
                margins: { ...settings.margins, top: parseFloat(e.target.value) } 
              })}
              className="flex-1 px-3 py-2 bg-background border rounded-md"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-20">Inferior</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2.54"
              value={settings.margins.bottom}
              onChange={(e) => setSettings({ 
                ...settings, 
                margins: { ...settings.margins, bottom: parseFloat(e.target.value) } 
              })}
              className="flex-1 px-3 py-2 bg-background border rounded-md"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-20">Izquierdo</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2.54"
              value={settings.margins.left}
              onChange={(e) => setSettings({ 
                ...settings, 
                margins: { ...settings.margins, left: parseFloat(e.target.value) } 
              })}
              className="flex-1 px-3 py-2 bg-background border rounded-md"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-20">Derecho</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2.54"
              value={settings.margins.right}
              onChange={(e) => setSettings({ 
                ...settings, 
                margins: { ...settings.margins, right: parseFloat(e.target.value) } 
              })}
              className="flex-1 px-3 py-2 bg-background border rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Escala */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Escala</label>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="scale-none"
              name="scale"
              checked={settings.fitTo === 'none'}
              onChange={() => setSettings({ ...settings, fitTo: 'none', scale: 100 })}
              className="w-4 h-4"
            />
            <label htmlFor="scale-none" className="text-sm">Sin ajuste</label>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="fit-width"
              name="scale"
              checked={settings.fitTo === 'width'}
              onChange={() => setSettings({ ...settings, fitTo: 'width' })}
              className="w-4 h-4"
            />
            <label htmlFor="fit-width" className="text-sm">Ajustar ancho</label>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm">Escala:</span>
            <input
              type="range"
              min="10"
              max="400"
              step="10"
              value={settings.scale}
              onChange={(e) => setSettings({ 
                ...settings, 
                fitTo: 'none',
                scale: parseInt(e.target.value) 
              })}
              className="w-32"
              disabled={settings.fitTo !== 'none'}
            />
            <input
              type="number"
              min="10"
              max="400"
              value={settings.scale}
              onChange={(e) => setSettings({ 
                ...settings, 
                fitTo: 'none',
                scale: parseInt(e.target.value) 
              })}
              className="w-20 px-2 py-1 bg-background border rounded-md"
              disabled={settings.fitTo !== 'none'}
            />
            <span className="text-sm">% tamaño normal</span>
          </div>
        </div>
      </div>

      {/* Opciones de impresión */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Opciones de impresión</label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showGridlines}
              onChange={(e) => setSettings({ ...settings, showGridlines: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Mostrar líneas de cuadrícula</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showHeaders}
              onChange={(e) => setSettings({ ...settings, showHeaders: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Imprimir encabezados</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.blackAndWhite}
              onChange={(e) => setSettings({ ...settings, blackAndWhite: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Blanco y negro</span>
          </label>

          <div className="flex items-center gap-3">
            <span className="text-sm">Alinear:</span>
            <div className="flex border rounded-md">
              <button
                onClick={() => setSettings({ ...settings, alignment: 'left' as any })}
                className="px-3 py-1 hover:bg-muted border-r"
              >
                <IconAlignLeft size={16} />
              </button>
              <button
                onClick={() => setSettings({ ...settings, alignment: 'center' as any })}
                className="px-3 py-1 hover:bg-muted border-r"
              >
                <IconAlignCenter size={16} />
              </button>
              <button
                onClick={() => setSettings({ ...settings, alignment: 'right' as any })}
                className="px-3 py-1 hover:bg-muted"
              >
                <IconAlignRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Vista previa de página */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Vista previa de página</label>
        <div 
          className="mx-auto border-2 border-muted-foreground/20 rounded bg-background relative"
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            maxWidth: '100%',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-1">
              <div>{settings.pageSize} - {settings.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}</div>
              <div className="text-xs">
                {dimensions.width} × {dimensions.height} px ({settings.scale}%)
              </div>
            </div>
          </div>
        </div>
        <div className="text-center text-xs text-muted-foreground mt-2">
          Dimensiones de impresión: {dimensions.width}px × {dimensions.height}px
        </div>
      </div>
    </div>
  )
}
