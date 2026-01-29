/**
 * Add Context Button - Floating button that appears when cells are selected
 *
 * Similar to Cursor's "Add Context" feature - allows users to select cells
 * and add them as context to the AI chat.
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { cn } from '@/lib/utils'
import {
  agentPanelCellContextAtom,
  agentPanelOpenAtom,
  type CellContextAttachment
} from '@/lib/atoms'
import { nanoid } from 'nanoid'
import { getSheetsInstance } from './univer-sheets-core'
import { toast } from 'sonner'

interface SelectionInfo {
  range: string
  sheetName: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  /** Number of cells selected */
  cellCount: number
}

interface AddContextButtonProps {
  fileId?: string
  fileName?: string
  className?: string
}

// Helper to convert column index to letter (0 = A, 1 = B, ..., 26 = AA, etc.)
function colToLetter(col: number): string {
  let result = ''
  let n = col
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

export const AddContextButton = memo(function AddContextButton({
  fileId,
  fileName,
  className
}: AddContextButtonProps) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [buttonPosition, setButtonPosition] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const lastSelectionRef = useRef<SelectionInfo | null>(null)

  const setCellContext = useSetAtom(agentPanelCellContextAtom)
  const setAgentPanelOpen = useSetAtom(agentPanelOpenAtom)
  const isAgentPanelOpen = useAtomValue(agentPanelOpenAtom)

  const findSelectionRect = useCallback(() => {
    const selectionElements = Array.from(
      document.querySelectorAll<HTMLElement>('[class*="univer-selection"]')
    )

    if (selectionElements.length === 0) return null

    const selectionElement = selectionElements
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]

    return selectionElement?.rect ?? null
  }, [])

  const updateButtonPosition = useCallback(() => {
    const selectionRect = findSelectionRect()

    if (!selectionRect) return

    const buttonRect = buttonRef.current?.getBoundingClientRect()
    const buttonWidth = buttonRect?.width ?? 140
    const buttonHeight = buttonRect?.height ?? 32
    const padding = 8
    const offset = 6

    const selectionLeft = selectionRect.left
    const selectionTop = selectionRect.top
    const selectionWidth = selectionRect.width
    const selectionHeight = selectionRect.height
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let x = selectionLeft + selectionWidth - buttonWidth - offset
    x = Math.min(Math.max(x, padding), viewportWidth - buttonWidth - padding)

    let y = selectionTop + selectionHeight + offset
    if (y + buttonHeight > viewportHeight - padding) {
      y = selectionTop - buttonHeight - offset
    }
    y = Math.min(Math.max(y, padding), viewportHeight - buttonHeight - padding)

    setButtonPosition({ x, y })
  }, [findSelectionRect])

  // Listen for selection changes
  useEffect(() => {
    let disposed = false
    let disposable: { dispose: () => void } | null = null
    let retryTimer: ReturnType<typeof setInterval> | null = null
    let pollCleanup: (() => void) | null = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscribeToSelection = (api: any) => {
      /**
       * Resolve range coordinates from various Univer range object formats.
       * Univer API can return ranges in different formats depending on context.
       */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolveRange = (range: any): {
        startRow: number
        startColumn: number
        endRow: number
        endColumn: number
      } | null => {
        if (!range) return null

        // Try direct property access first (most common case)
        let startRow = range.startRow
        let startColumn = range.startColumn
        let endRow = range.endRow
        let endColumn = range.endColumn

        // If properties are undefined, try alternate property names
        if (startRow === undefined) {
          startRow = range.row ?? (typeof range.getRow === 'function' ? range.getRow() : undefined)
        }
        if (startColumn === undefined) {
          startColumn = range.column ?? (typeof range.getColumn === 'function' ? range.getColumn() : undefined)
        }

        // For end coordinates, try method calls and calculate from count if needed
        if (endRow === undefined) {
          if (typeof range.getEndRow === 'function') {
            endRow = range.getEndRow()
          } else {
            const rowCount = range.rowCount ?? range.rows ??
              (typeof range.getNumRows === 'function' ? range.getNumRows() :
               typeof range.getRowCount === 'function' ? range.getRowCount() : undefined)
            if (startRow !== undefined && rowCount !== undefined) {
              endRow = startRow + rowCount - 1
            }
          }
        }

        if (endColumn === undefined) {
          if (typeof range.getEndColumn === 'function') {
            endColumn = range.getEndColumn()
          } else {
            const colCount = range.columnCount ?? range.cols ??
              (typeof range.getNumColumns === 'function' ? range.getNumColumns() :
               typeof range.getColumnCount === 'function' ? range.getColumnCount() : undefined)
            if (startColumn !== undefined && colCount !== undefined) {
              endColumn = startColumn + colCount - 1
            }
          }
        }

        // Validate all coordinates are valid numbers
        if (
          typeof startRow !== 'number' || Number.isNaN(startRow) ||
          typeof startColumn !== 'number' || Number.isNaN(startColumn) ||
          typeof endRow !== 'number' || Number.isNaN(endRow) ||
          typeof endColumn !== 'number' || Number.isNaN(endColumn)
        ) {
          return null
        }

        return { startRow, startColumn, endRow, endColumn }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleSelectionChanged = (params?: any) => {
        try {
          const workbook = api.getActiveWorkbook()
          const worksheet = workbook?.getActiveSheet()

          if (!workbook || !worksheet) {
            return
          }

          // Hide if explicitly empty selection
          if (params?.selections && params.selections.length === 0) {
            setIsVisible(false)
            return
          }

          // Try multiple sources to get the active range
          // Priority: event params > selection API > getActiveRange
          const selectionFromEvent = params?.selections?.[0]?.range ?? params?.selections?.[0]
          const fSelection = worksheet.getSelection?.()
          const ranges = fSelection?.getRanges?.() ?? []
          const activeRange = selectionFromEvent ?? ranges[0] ?? fSelection?.getActiveRange?.()

          if (!activeRange) {
            return
          }

          const resolvedRange = resolveRange(activeRange)
          if (!resolvedRange) {
            return
          }

          const { startRow, startColumn, endRow, endColumn } = resolvedRange

          // Only show button if more than one cell is selected
          const isSingleCell = (endRow === startRow) && (endColumn === startColumn)
          if (isSingleCell) {
            setIsVisible(false)
            return
          }

          const sheetName = worksheet.getSheetName() || 'Sheet1'
          const startColLetter = colToLetter(startColumn)
          const endColLetter = colToLetter(endColumn)
          const rangeNotation = `${sheetName}!${startColLetter}${startRow + 1}:${endColLetter}${endRow + 1}`

          const rowCount = endRow - startRow + 1
          const colCount = endColumn - startColumn + 1
          const cellCount = rowCount * colCount

          const nextSelection: SelectionInfo = {
            range: rangeNotation,
            sheetName,
            startRow,
            startCol: startColumn,
            endRow,
            endCol: endColumn,
            cellCount
          }

          // Only update if selection actually changed (avoid unnecessary re-renders)
          const lastSel = lastSelectionRef.current
          if (
            lastSel?.startRow === startRow &&
            lastSel?.startCol === startColumn &&
            lastSel?.endRow === endRow &&
            lastSel?.endCol === endColumn &&
            lastSel?.sheetName === sheetName
          ) {
            return
          }

          setSelection(nextSelection)
          lastSelectionRef.current = nextSelection

          setIsVisible(true)
          requestAnimationFrame(() => {
            updateButtonPosition()
          })
        } catch {
          setIsVisible(false)
        }
      }

      // Subscribe to selection changes via Univer event API
      disposable = api.addEvent(api.Event.SelectionChanged, handleSelectionChanged)

      // Fallback polling for cases where event doesn't fire (e.g., programmatic selection)
      const pollTimer = setInterval(() => {
        handleSelectionChanged()
      }, 800)

      pollCleanup = () => {
        clearInterval(pollTimer)
      }
    }

    const trySubscribe = () => {
      if (disposed || disposable) return
      const instance = getSheetsInstance()
      if (!instance?.api) {
        return
      }

      try {
        subscribeToSelection(instance.api)
      } catch {
        // Will retry on next interval
      }

      if (retryTimer) {
        clearInterval(retryTimer)
        retryTimer = null
      }
    }

    trySubscribe()
    if (!disposable) {
      retryTimer = setInterval(trySubscribe, 250)
    }

    return () => {
      disposed = true
      if (retryTimer) {
        clearInterval(retryTimer)
      }
      pollCleanup?.()
      disposable?.dispose()
    }
  }, [updateButtonPosition])

  useEffect(() => {
    if (!isVisible || !selection) return
    const frame = requestAnimationFrame(() => {
      updateButtonPosition()
      setTimeout(updateButtonPosition, 50)
    })
    const interval = setInterval(updateButtonPosition, 200)

    return () => {
      cancelAnimationFrame(frame)
      clearInterval(interval)
    }
  }, [isVisible, selection, updateButtonPosition])

  // Handle adding context
  const handleAddContext = useCallback(async () => {
    if (!selection) return

    const instance = getSheetsInstance()
    if (!instance?.api) return

    try {
      const workbook = instance.api.getActiveWorkbook()
      const worksheet = workbook?.getActiveSheet()

      if (!worksheet) return

      // Calculate row and column counts
      const rowCount = selection.endRow - selection.startRow + 1
      const colCount = selection.endCol - selection.startCol + 1

      // Get the range data using Univer's getRange API
      // Parameters: startRow, startCol, numRows, numCols
      const range = worksheet.getRange(
        selection.startRow,
        selection.startCol,
        rowCount,
        colCount
      )

      if (!range) {
        toast.error('Failed to read selected range')
        return
      }

      // Get values from the range
      // getValues() returns a 2D array of cell values
      let values: Array<Array<string | number | null>> = []
      try {
        const rawValues = range.getValues()
        if (Array.isArray(rawValues)) {
          values = rawValues.map((row: unknown) =>
            Array.isArray(row)
              ? row.map((cell: unknown) => {
                  if (cell === undefined || cell === null) return null
                  if (typeof cell === 'object' && cell !== null && 'v' in cell) {
                    // Handle Univer cell object format { v: value, s: style, ... }
                    const cellObj = cell as { v?: string | number | null }
                    return cellObj.v ?? null
                  }
                  if (typeof cell === 'string' || typeof cell === 'number') {
                    return cell
                  }
                  return String(cell)
                })
              : []
          )
        }
      } catch {
        // Fallback: try to get values cell by cell
        for (let r = 0; r < rowCount; r++) {
          const rowData: Array<string | number | null> = []
          for (let c = 0; c < colCount; c++) {
            try {
              const cell = worksheet.getRange(selection.startRow + r, selection.startCol + c, 1, 1)
              const cellValue = cell?.getValue?.()
              if (cellValue === undefined || cellValue === null) {
                rowData.push(null)
              } else if (typeof cellValue === 'string' || typeof cellValue === 'number') {
                rowData.push(cellValue)
              } else {
                rowData.push(String(cellValue))
              }
            } catch {
              rowData.push(null)
            }
          }
          values.push(rowData)
        }
      }

      const contextAttachment: CellContextAttachment = {
        id: nanoid(),
        range: selection.range,
        sheetName: selection.sheetName,
        data: values,
        fileId,
        workbookName: fileName
      }

      // Add to cell context
      setCellContext(prev => [...prev, contextAttachment])

      // Open agent panel if not open
      if (!isAgentPanelOpen) {
        setAgentPanelOpen(true)
      }

      // Show success toast
      toast.success('Context added', {
        description: `${selection.range} (${selection.cellCount} cells)`,
        duration: 2000,
      })

      // Hide the button after adding
      setIsVisible(false)
    } catch {
      toast.error('Failed to add context')
    }
  }, [selection, fileId, fileName, setCellContext, setAgentPanelOpen, isAgentPanelOpen])

  if (!isVisible || !selection) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-[100]"
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={handleAddContext}
        className={cn(
          "fixed pointer-events-auto",
          "flex items-center gap-2 px-3.5 py-1.5",
          "bg-white text-foreground",
          "border border-border/70 rounded-full shadow-md",
          "text-xs font-medium",
          "hover:bg-muted transition-colors",
          "animate-in fade-in-0 zoom-in-95",
          className
        )}
        style={{
          left: buttonPosition?.x ?? 20,
          top: buttonPosition?.y ?? 20,
          maxWidth: 'calc(100% - 40px)',
        }}
      >
        <span className="text-sm">+</span>
        <span>Add Context</span>
      </button>
    </div>
  )
})

export default AddContextButton
