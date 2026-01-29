import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { IconChartBar, IconPrinter } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { getSheetsInstance } from './univer-sheets-core'

interface FloatingToolbarButtonsProps {
  className?: string
  onChartsClick: () => void
  onPrintClick: () => void
}

export function FloatingToolbarButtons({ 
  className, 
  onChartsClick, 
  onPrintClick 
}: FloatingToolbarButtonsProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  // Listen for selection changes
  useEffect(() => {
    const instance = getSheetsInstance()
    if (!instance?.api) return

    const api = instance.api
    let disposable: { dispose: () => void } | null = null

    try {
      disposable = api.addEvent(api.Event.SelectionChanged, (params: any) => {
        if (!params.selections || params.selections.length === 0) {
          setIsVisible(false)
          return
        }

        const sel = params.selections[0]
        if (!sel?.range) {
          setIsVisible(false)
          return
        }

        // Show toolbar when more than one cell is selected
        const { startRow, startColumn, endRow, endColumn } = sel.range
        const isSingleCell = startRow === endRow && startColumn === endColumn
        if (isSingleCell) {
          setIsVisible(false)
          return
        }

        // Position near selection (bottom-right corner)
        const xOffset = endColumn * 80 + 20
        const yOffset = (endRow + 1) * 24 + 20
        setPosition({ x: xOffset, y: yOffset })
        setIsVisible(true)
      })
    } catch (error) {
      console.error('[FloatingToolbarButtons] Failed to subscribe:', error)
    }

    return () => {
      disposable?.dispose()
    }
  }, [])

  if (!isVisible) return null

  return (
    <div
      className={cn(
        "absolute z-50 flex items-center gap-1.5 px-2.5 py-1.5",
        "bg-card border shadow-lg rounded-lg",
        "animate-in fade-in-0 zoom-in-95 duration-150",
        className
      )}
      style={{
        bottom: 8,
        right: 8
      }}
    >
      <button
        type="button"
        onClick={onChartsClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-muted transition-colors"
        title="Crear gráfico"
      >
        <IconChartBar size={14} />
        <span>Gráficos</span>
      </button>
      <div className="w-px h-4 bg-border" />
      <button
        type="button"
        onClick={onPrintClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-muted transition-colors"
        title="Configurar página"
      >
        <IconPrinter size={14} />
        <span>Imprimir</span>
      </button>
    </div>
  )
}
