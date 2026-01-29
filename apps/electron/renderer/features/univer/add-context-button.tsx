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
  /** Number of cells selected */
  cellCount: number
}

interface AddContextButtonProps {
  fileId?: string
  fileName?: string
  artifactId?: string
  workbookName?: string
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

function buildRangeNotation(
  sheetName: string,
  startRow: number,
  startColumn: number,
  endRow: number,
  endColumn: number
): string {
  const startColLetter = colToLetter(startColumn)
  const endColLetter = colToLetter(endColumn)
  return `${sheetName}!${startColLetter}${startRow + 1}:${endColLetter}${endRow + 1}`
}

export const AddContextButton = memo(function AddContextButton({
  fileId,
  fileName,
  artifactId,
  workbookName,
  className
}: AddContextButtonProps) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [buttonPosition, setButtonPosition] = useState<{ x: number; y: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const lastSelectionRef = useRef<SelectionInfo | null>(null)
  const lastSelectionRectRef = useRef<DOMRect | null>(null)
  const lastRangeRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  const setCellContext = useSetAtom(agentPanelCellContextAtom)
  const setAgentPanelOpen = useSetAtom(agentPanelOpenAtom)
  const isAgentPanelOpen = useAtomValue(agentPanelOpenAtom)

  const getSheetContainerRect = useCallback(() => {
    const root =
      buttonRef.current?.closest('.univer-workbench') ??
      document.querySelector('.univer-workbench') ??
      document.querySelector('.univer-container') ??
      document.querySelector('.univer-app')
    return root?.getBoundingClientRect() ?? null
  }, [])

  const resolveWorksheetByName = useCallback((api: any, sheetName: string) => {
    const workbook = api.getActiveWorkbook?.()
    if (!workbook) return null
    const sheets = workbook.getSheets?.() ?? []
    return sheets.find((s: { getSheetName: () => string }) => s.getSheetName() === sheetName)
  }, [])

  const getSelectionData = useCallback(
    (api: any): { info: SelectionInfo; range: any; worksheet: any } | null => {
    const workbook = api.getActiveWorkbook?.()
    const worksheet = workbook?.getActiveSheet?.()
    if (!workbook || !worksheet) return null

    const selection = worksheet.getSelection?.()
    const ranges = selection?.getRanges?.() ?? []
    const activeRange = ranges[0] ?? selection?.getActiveRange?.()
    if (!activeRange) return null

    const sheetName = worksheet.getSheetName?.() || 'Sheet1'

    const getAddress = () => {
      const raw =
        activeRange.getAddress?.() ??
        activeRange.getA1Notation?.() ??
        activeRange.getRange?.()?.getAddress?.() ??
        activeRange.getRange?.()?.getA1Notation?.()
      if (!raw) return null
      return raw.includes('!') ? raw : `${sheetName}!${raw}`
    }

    let rangeNotation = getAddress()
    if (!rangeNotation) {
      // Fallback to numeric coords if available
      const startRow = activeRange.startRow
      const startCol = activeRange.startColumn
      const endRow = activeRange.endRow
      const endCol = activeRange.endColumn
      if (
        typeof startRow === 'number' &&
        typeof startCol === 'number' &&
        typeof endRow === 'number' &&
        typeof endCol === 'number'
      ) {
        const startColLetter = colToLetter(startCol)
        const endColLetter = colToLetter(endCol)
        rangeNotation = `${sheetName}!${startColLetter}${startRow + 1}:${endColLetter}${endRow + 1}`
      }
    }

    if (!rangeNotation) return null

    let rowCount: number | null = null
    let colCount: number | null = null

    try {
      const rows = activeRange.getRowCount?.() ?? activeRange.getNumRows?.()
      const cols = activeRange.getColumnCount?.() ?? activeRange.getNumColumns?.()
      if (typeof rows === 'number') rowCount = rows
      if (typeof cols === 'number') colCount = cols
    } catch {
      // Ignore, fallback to values
    }

    if (!rowCount || !colCount) {
      try {
        const values = activeRange.getValues?.()
        if (Array.isArray(values)) {
          rowCount = values.length
          colCount = values.reduce(
            (max: number, row: unknown) =>
              Math.max(max, Array.isArray(row) ? row.length : 0),
            0
          )
        }
      } catch {
        // Ignore
      }
    }

    const cellCount = (rowCount ?? 0) * (colCount ?? 0)

    const info: SelectionInfo = {
      range: rangeNotation,
      sheetName,
      cellCount
    }

    return { info, range: activeRange, worksheet }
  }, [])

  const getSelectionFromEvent = useCallback((api: any, params?: any) => {
    if (!params?.selections || params.selections.length === 0) return null
    const sel = params.selections[0]
    const rangeLike = sel?.range ?? sel
    if (!rangeLike) return null

    const workbook = api.getActiveWorkbook?.()
    const worksheet = workbook?.getActiveSheet?.()
    if (!workbook || !worksheet) return null

    const sheetName = worksheet.getSheetName?.() || 'Sheet1'

    let startRow = rangeLike.startRow
    let startColumn = rangeLike.startColumn
    let endRow = rangeLike.endRow
    let endColumn = rangeLike.endColumn

    if (startRow === undefined || startColumn === undefined) return null
    if (endRow === undefined || endColumn === undefined) {
      const rowCount = rangeLike.rowCount ?? rangeLike.rows ?? rangeLike.getNumRows?.()
      const colCount = rangeLike.columnCount ?? rangeLike.cols ?? rangeLike.getNumColumns?.()
      if (rowCount !== undefined) endRow = startRow + rowCount - 1
      if (colCount !== undefined) endColumn = startColumn + colCount - 1
    }

    if (
      typeof startRow !== 'number' ||
      typeof startColumn !== 'number' ||
      typeof endRow !== 'number' ||
      typeof endColumn !== 'number'
    ) {
      return null
    }

    const rangeNotation = buildRangeNotation(sheetName, startRow, startColumn, endRow, endColumn)
    const cellCount = (endRow - startRow + 1) * (endColumn - startColumn + 1)

    return {
      info: {
        range: rangeNotation,
        sheetName,
        cellCount,
      },
      range: rangeLike,
      worksheet,
    }
  }, [])

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

  const computePositionFromRect = useCallback((rect: { left: number; top: number; width: number; height: number }) => {
    const buttonRect = buttonRef.current?.getBoundingClientRect()
    const buttonWidth = buttonRect?.width ?? 140
    const buttonHeight = buttonRect?.height ?? 32
    const padding = 8
    const offset = 6

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let x = rect.left + rect.width - buttonWidth - offset
    x = Math.min(Math.max(x, padding), viewportWidth - buttonWidth - padding)

    let y = rect.top + rect.height + offset
    if (y + buttonHeight > viewportHeight - padding) {
      y = rect.top - buttonHeight - offset
    }
    y = Math.min(Math.max(y, padding), viewportHeight - buttonHeight - padding)

    setButtonPosition({ x, y })
  }, [])

  const updateButtonPosition = useCallback(() => {
    const selectionRect = findSelectionRect()
    if (selectionRect) {
      lastSelectionRectRef.current = selectionRect
    }
    const effectiveRect = selectionRect ?? lastSelectionRectRef.current
    if (!effectiveRect) return

    computePositionFromRect({
      left: effectiveRect.left,
      top: effectiveRect.top,
      width: effectiveRect.width,
      height: effectiveRect.height
    })
  }, [findSelectionRect, computePositionFromRect])

  // Listen for selection changes
  useEffect(() => {
    let disposed = false
    let disposable: { dispose: () => void } | null = null
    let selectionUnsub: (() => void) | null = null
    let retryTimer: ReturnType<typeof setInterval> | null = null
    let pollCleanup: (() => void) | null = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscribeToSelection = (api: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleSelectionChanged = (params?: any) => {
        try {
          // Hide if explicitly empty selection
          if (params?.selections && params.selections.length === 0) {
            setIsVisible(false)
            return
          }

          const selectionData = getSelectionData(api) ?? getSelectionFromEvent(api, params)
          if (!selectionData) {
            setIsVisible(false)
            return
          }

          const nextSelection = selectionData.info

          // Only show when there is an actual multi-cell selection
          if (!nextSelection.cellCount || nextSelection.cellCount <= 1) {
            setIsVisible(false)
            setSelection(null)
            return
          }

          // Only update if selection actually changed (avoid unnecessary re-renders)
          const lastSel = lastSelectionRef.current
          if (lastSel?.range === nextSelection.range) {
            return
          }

          setSelection(nextSelection)
          lastSelectionRef.current = nextSelection

          // Try to use Univer's range rect if available (canvas selections)
          const rangeRect = selectionData.range?.getCellRect?.()
          if (rangeRect && typeof rangeRect.x === 'number' && typeof rangeRect.y === 'number') {
            lastRangeRectRef.current = rangeRect
            const containerRect = getSheetContainerRect()
            const left = (containerRect?.left ?? 0) + rangeRect.x
            const top = (containerRect?.top ?? 0) + rangeRect.y
            computePositionFromRect({
              left,
              top,
              width: rangeRect.width ?? 0,
              height: rangeRect.height ?? 0
            })
          } else {
            requestAnimationFrame(() => {
              updateButtonPosition()
            })
          }

          setIsVisible(true)
        } catch {
          setIsVisible(false)
        }
      }

      // Subscribe to selection changes via Univer event API
      if (typeof api.onSelectionChanged === 'function') {
        selectionUnsub = api.onSelectionChanged((params?: any) => handleSelectionChanged(params))
      }
      if (api.addEvent && api.Event?.SelectionChanged) {
        disposable = api.addEvent(api.Event.SelectionChanged, handleSelectionChanged)
      }

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
      selectionUnsub?.()
      disposable?.dispose()
    }
  }, [updateButtonPosition, getSelectionData, getSelectionFromEvent, computePositionFromRect, getSheetContainerRect])

  useEffect(() => {
    if (!isVisible || !selection) return
    const frame = requestAnimationFrame(() => {
      if (lastRangeRectRef.current) {
        const containerRect = getSheetContainerRect()
        computePositionFromRect({
          left: (containerRect?.left ?? 0) + lastRangeRectRef.current.x,
          top: (containerRect?.top ?? 0) + lastRangeRectRef.current.y,
          width: lastRangeRectRef.current.width ?? 0,
          height: lastRangeRectRef.current.height ?? 0
        })
      } else {
        updateButtonPosition()
      }
      setTimeout(updateButtonPosition, 50)
    })
    const interval = setInterval(() => {
      if (lastRangeRectRef.current) {
        const containerRect = getSheetContainerRect()
        computePositionFromRect({
          left: (containerRect?.left ?? 0) + lastRangeRectRef.current.x,
          top: (containerRect?.top ?? 0) + lastRangeRectRef.current.y,
          width: lastRangeRectRef.current.width ?? 0,
          height: lastRangeRectRef.current.height ?? 0
        })
      } else {
        updateButtonPosition()
      }
    }, 200)

    return () => {
      cancelAnimationFrame(frame)
      clearInterval(interval)
    }
  }, [isVisible, selection, updateButtonPosition, computePositionFromRect, getSheetContainerRect])

  // Handle adding context
  const handleAddContext = useCallback(async () => {
    const instance = getSheetsInstance()
    if (!instance?.api) return

    try {
      const selectionData = getSelectionData(instance.api)
      if (!selectionData) {
        toast.error('Selecciona un rango primero')
        return
      }
      const { info, range, worksheet } = selectionData

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
        // Fallback: try to read using worksheet range (A1) or by size
        try {
          const rangePart = info.range.includes('!') ? info.range.split('!')[1] : info.range
          const targetSheet =
            resolveWorksheetByName(instance.api, info.sheetName) ?? worksheet
          const fallbackRange = targetSheet?.getRange?.(rangePart)
          const fallbackValues = fallbackRange?.getValues?.()
          if (Array.isArray(fallbackValues)) {
            values = fallbackValues.map((row: unknown) =>
              Array.isArray(row)
                ? row.map((cell: unknown) => {
                    if (cell === undefined || cell === null) return null
                    if (typeof cell === 'object' && cell !== null && 'v' in cell) {
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
          // Last resort: return empty matrix
          values = []
        }
      }

      const contextAttachment: CellContextAttachment = {
        id: nanoid(),
        range: info.range,
        sheetName: info.sheetName,
        data: values,
        fileId,
        artifactId,
        workbookName: workbookName ?? fileName
      }

      // Add to cell context
      setCellContext(prev => [...prev, contextAttachment])

      // Open agent panel if not open
      if (!isAgentPanelOpen) {
        setAgentPanelOpen(true)
      }

      // Show success toast
      toast.success('Context added', {
        description: `${info.range} (${info.cellCount} cells)`,
        duration: 2000,
      })

      // Hide the button after adding
      setIsVisible(false)
    } catch {
      toast.error('Failed to add context')
    }
  }, [
    fileId,
    fileName,
    artifactId,
    workbookName,
    setCellContext,
    setAgentPanelOpen,
    isAgentPanelOpen,
    getSelectionData,
    getSelectionFromEvent,
    resolveWorksheetByName
  ])

  if (!isVisible || !selection || !buttonPosition) {
    return null
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
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
