import * as React from 'react'
import { ChartsDialog } from './charts-dialog'
import { PrintLayoutDialog } from './print-layout-dialog'
import { UniverExportService } from './services/export-service'

interface UniverToolsPanelProps {
  univerAPI: any
  fileId?: string
  fileName?: string
  // Controlled dialog state (passed from parent)
  chartsDialogOpen?: boolean
  onChartsDialogOpenChange?: (open: boolean) => void
  printDialogOpen?: boolean
  onPrintDialogOpenChange?: (open: boolean) => void
}

export function UniverToolsPanel({
  univerAPI,
  fileId,
  fileName,
  chartsDialogOpen = false,
  onChartsDialogOpenChange,
  printDialogOpen = false,
  onPrintDialogOpenChange,
}: UniverToolsPanelProps) {
  // Use controlled state from parent, or fallback to internal state
  const [internalChartsOpen, setInternalChartsOpen] = React.useState(false)
  const [internalPrintOpen, setInternalPrintOpen] = React.useState(false)

  const isChartsOpen = onChartsDialogOpenChange ? chartsDialogOpen : internalChartsOpen
  const setChartsOpen = onChartsDialogOpenChange || setInternalChartsOpen
  const isPrintOpen = onPrintDialogOpenChange ? printDialogOpen : internalPrintOpen
  const setPrintOpen = onPrintDialogOpenChange || setInternalPrintOpen

  const handlePrint = async () => {
    if (!univerAPI) return
    await UniverExportService.exportToPDF(univerAPI)
  }

  const handleExportExcel = async () => {
    if (!univerAPI || !fileId) return
    await UniverExportService.exportToExcel(univerAPI, {
      filename: `${fileName || 'export'}.xlsx`,
      format: 'xlsx',
      includeHeaders: true,
      includeGridlines: true,
      orientation: 'landscape',
      scale: 100,
    })
  }

  const handleExportCSV = async () => {
    if (!univerAPI || !fileId) return
    await UniverExportService.exportToCSV(univerAPI, {
      filename: `${fileName || 'export'}.csv`,
      format: 'csv',
    })
  }

  const handleExportSelection = async () => {
    if (!univerAPI || !fileId) return
    await UniverExportService.exportSelection(univerAPI, {
      filename: `${fileName || 'seleccion'}.xlsx`,
      format: 'xlsx',
    })
  }

  return (
    <>
      <ChartsDialog
        open={isChartsOpen}
        onOpenChange={setChartsOpen}
        univerAPI={univerAPI}
      />

      <PrintLayoutDialog
        open={isPrintOpen}
        onOpenChange={setPrintOpen}
        univerAPI={univerAPI}
        onPrint={handlePrint}
        onExportExcel={handleExportExcel}
        onExportCSV={handleExportCSV}
      />
    </>
  )
}
