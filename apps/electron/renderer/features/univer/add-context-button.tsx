/**
 * Add Context Button - Floating button that appears when cells are selected
 *
 * Similar to Cursor's "Add Context" feature - allows users to select cells
 * and add them as context to the AI chat.
 */

import { memo, useState, useEffect, useCallback } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { IconPlus } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import {
  agentPanelCellContextAtom,
  agentPanelOpenAtom,
  type CellContextAttachment
} from '@/lib/atoms'
import { nanoid } from 'nanoid'
import { getSheetsInstance } from './univer-sheets-core'

interface SelectionInfo {
  range: string
  sheetName: string
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

interface AddContextButtonProps {
  fileId?: string
  fileName?: string
  className?: string
}

export const AddContextButton = memo(function AddContextButton({
  fileId,
  fileName,
  className
}: AddContextButtonProps) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = useState(false)

  const setCellContext = useSetAtom(agentPanelCellContextAtom)
  const setAgentPanelOpen = useSetAtom(agentPanelOpenAtom)
  const isAgentPanelOpen = useAtomValue(agentPanelOpenAtom)

  // Listen for selection changes
  useEffect(() => {
    const instance = getSheetsInstance()
    if (!instance?.api) return

    const api = instance.api
    let disposable: { dispose: () => void } | null = null

    try {
      // Subscribe to selection changes
      disposable = api.addEvent(api.Event.SelectionChanged, (params: {
        worksheet: unknown
        workbook: unknown
        selections: Array<{
          range: { startRow: number; startColumn: number; endRow: number; endColumn: number }
        }>
      }) => {
        if (!params.selections || params.selections.length === 0) {
          setIsVisible(false)
          return
        }

        const sel = params.selections[0]
        if (!sel?.range) {
          setIsVisible(false)
          return
        }

        const { startRow, startColumn, endRow, endColumn } = sel.range

        // Only show button if more than one cell is selected
        const isSingleCell = startRow === endRow && startColumn === endColumn
        if (isSingleCell) {
          setIsVisible(false)
          return
        }

        // Get sheet name and build range notation
        const workbook = api.getActiveWorkbook()
        const worksheet = workbook?.getActiveSheet()
        const sheetName = worksheet?.getSheetName() || 'Sheet1'

        // Convert to A1 notation
        const startColLetter = String.fromCharCode(65 + startColumn)
        const endColLetter = String.fromCharCode(65 + endColumn)
        const rangeNotation = `${sheetName}!${startColLetter}${startRow + 1}:${endColLetter}${endRow + 1}`

        setSelection({
          range: rangeNotation,
          sheetName,
          startRow,
          startCol: startColumn,
          endRow,
          endCol: endColumn
        })

        // Position the button near the selection (bottom-right corner)
        // We'll use a fixed position relative to the spreadsheet container
        setPosition({ x: endColumn * 80 + 100, y: (endRow + 1) * 24 + 40 })
        setIsVisible(true)
      })
    } catch (error) {
      console.error('[AddContextButton] Failed to subscribe to selection changes:', error)
    }

    return () => {
      disposable?.dispose()
    }
  }, [])

  // Handle adding context
  const handleAddContext = useCallback(async () => {
    if (!selection) return

    const instance = getSheetsInstance()
    if (!instance?.api) return

    try {
      const workbook = instance.api.getActiveWorkbook()
      const worksheet = workbook?.getActiveSheet()

      if (!worksheet) return

      // Get the range data
      const range = worksheet.getRange(
        selection.startRow,
        selection.startCol,
        selection.endRow - selection.startRow + 1,
        selection.endCol - selection.startCol + 1
      )

      // Get values from the range
      const values = range.getValues() as Array<Array<string | number | null>>

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

      // Hide the button after adding
      setIsVisible(false)
    } catch (error) {
      console.error('[AddContextButton] Failed to add context:', error)
    }
  }, [selection, fileId, fileName, setCellContext, setAgentPanelOpen, isAgentPanelOpen])

  if (!isVisible || !selection) return null

  return (
    <button
      type="button"
      onClick={handleAddContext}
      className={cn(
        "absolute z-50 flex items-center gap-1.5 px-2.5 py-1.5",
        "bg-primary text-primary-foreground rounded-lg shadow-lg",
        "text-xs font-medium",
        "hover:bg-primary/90 transition-colors",
        "animate-in fade-in-0 zoom-in-95 duration-150",
        className
      )}
      style={{
        // Position below the selection
        bottom: 8,
        right: 8
      }}
    >
      <IconPlus size={14} />
      <span>Add Context</span>
    </button>
  )
})

export default AddContextButton
