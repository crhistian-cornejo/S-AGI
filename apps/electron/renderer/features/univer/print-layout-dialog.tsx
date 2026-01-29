import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { IconPrinter } from '@tabler/icons-react'
import { PrintLayout } from './components/print-layout'

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
  printArea: string
  showGridlines: boolean
  showHeaders: boolean
  blackAndWhite: boolean
}

interface PrintLayoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  univerAPI: unknown
  onPrint?: () => void
  onExportExcel?: () => void
  onExportCSV?: () => void
}

export function PrintLayoutDialog({
  open,
  onOpenChange,
  univerAPI,
  onPrint,
  onExportExcel,
  onExportCSV
}: PrintLayoutDialogProps) {
  const handleApply = (settings: PrintSettings) => {
    // Apply print styles to the document
    const existingStyle = document.getElementById('print-settings-style')
    if (existingStyle) {
      existingStyle.remove()
    }

    const style = document.createElement('style')
    style.id = 'print-settings-style'
    style.textContent = `
      @media print {
        @page {
          size: ${settings.pageSize} ${settings.orientation};
          margin: ${settings.margins.top}in ${settings.margins.right}in ${settings.margins.bottom}in ${settings.margins.left}in;
        }

        .univer-container, .univer-sheet-container {
          transform: scale(${settings.scale / 100});
          transform-origin: top left;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          ${settings.blackAndWhite ? 'filter: grayscale(100%);' : ''}
        }

        ${!settings.showGridlines ? `
          .univer-sheet-container table,
          .univer-sheet-container td,
          .univer-sheet-container th {
            border: none !important;
          }
        ` : ''}
      }
    `
    document.head.appendChild(style)
  }

  const handlePreview = () => {
    // Trigger browser print dialog (which shows preview)
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconPrinter className="text-primary" size={24} />
            <span>Configuración de Página</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Configura márgenes, orientación y escala para impresión
          </DialogDescription>
        </DialogHeader>
        
        <PrintLayout 
          univerAPI={univerAPI}
          onApply={handleApply}
          onPreview={handlePreview}
        />

        <div className="flex gap-2 mt-4 pt-4 border-t">
          {onExportCSV && (
            <button
              type="button"
              onClick={onExportCSV}
              className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 rounded-md text-sm transition-colors"
            >
              Exportar CSV
            </button>
          )}
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-md text-sm transition-colors"
            >
              Exportar Excel
            </button>
          )}
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm transition-colors"
            >
              Imprimir / PDF
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
