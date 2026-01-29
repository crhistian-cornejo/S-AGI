import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconChartBar } from '@tabler/icons-react'
import { UniverCharts } from './components/univer-charts'

interface ChartsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  univerAPI: any
}

export function ChartsDialog({ open, onOpenChange, univerAPI }: ChartsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconChartBar className="text-primary" size={24} />
            <span>Gráficos de Datos</span>
          </DialogTitle>
        </DialogHeader>
        <UniverCharts univerAPI={univerAPI} />
      </DialogContent>
    </Dialog>
  )
}
