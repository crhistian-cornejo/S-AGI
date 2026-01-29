/**
 * Export Service - Servicio de exportación estilo Excel
 * Usa ExcelJS para exportar datos con control de print layout
 */

import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { FWorkbook, FWorksheet } from '@univerjs/core/facade'

export interface ExportOptions {
  filename?: string
  format: 'xlsx' | 'csv' | 'pdf'
  printArea?: string // rango como "A1:Z100"
  includeGridlines?: boolean
  includeHeaders?: boolean
  orientation?: 'portrait' | 'landscape'
  scale?: number
  blackAndWhite?: boolean
}

export class UniverExportService {
  static async exportToExcel(
    univerAPI: any,
    options: ExportOptions
  ): Promise<void> {
    try {
      const workbook = univerAPI.getActiveWorkbook()
      if (!workbook) {
        throw new Error('No hay workbook activo')
      }

      const fWorksheet = workbook.getActiveSheet()
      if (!fWorksheet) {
        throw new Error('No hay hoja activa')
      }

      const excelWorkbook = new ExcelJS.Workbook()
      const sheetName = fWorksheet.getName() || 'Hoja1'
      const excelWorksheet = excelWorkbook.addWorksheet(sheetName)

      const range = options.printArea
        ? fWorksheet.getRange(options.printArea)
        : fWorksheet.getUsedRange()

      if (!range) {
        throw new Error('No hay datos para exportar')
      }

      const values = range.getValues()
      if (!values || !Array.isArray(values)) {
        throw new Error('No se pudieron obtener los valores')
      }

      excelWorksheet.properties.defaultColWidth = 12
      excelWorksheet.properties.defaultRowHeight = 18

      if (options.includeHeaders !== false) {
        const headers = values[0]?.map((cell: any, i: number) => 
          cell?.toString() || `Columna ${i + 1}`
        ) || []

        const headerRow = excelWorksheet.addRow(headers)
        headerRow.font = { bold: true, size: 11 }
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' },
        }
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
        headerRow.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }

        const dataStartIndex = 1
        for (let rowIndex = dataStartIndex; rowIndex < values.length; rowIndex++) {
          const row = values[rowIndex]
          if (!row) continue

          const excelRow = excelWorksheet.addRow(row)
          
          excelRow.eachCell((cell, colNumber) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
              right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            }

            const value = cell.value
            if (typeof value === 'number') {
              cell.alignment = { horizontal: 'right', vertical: 'middle' }
              cell.numFmt = '#,##0.00'
            } else if (typeof value === 'string') {
              cell.alignment = { horizontal: 'left', vertical: 'middle' }
            }
          })
        }
      } else {
        for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
          const row = values[rowIndex]
          if (!row) continue
          excelWorksheet.addRow(row)
        }
      }

      await this.configurePageSetup(excelWorksheet, options)
      excelWorksheet.properties.showGridLines = options.includeGridlines !== false

      if (options.includeHeaders !== false && values.length > 1) {
        excelWorksheet.views = [{ state: 'frozen', ySplit: 1 }]
      }

      const filename = options.filename || 'univer-export.xlsx'
      const buffer = await excelWorkbook.xlsx.writeBuffer()
      saveAs(new Blob([buffer]), filename)
    } catch (error) {
      console.error('[UniverExportService] Error exporting:', error)
      throw error
    }
  }

  private static async configurePageSetup(
    worksheet: any,
    options: ExportOptions
  ): Promise<void> {
    if (options.orientation) {
      worksheet.pageSetup = {
        ...worksheet.pageSetup,
        orientation: options.orientation,
      }
    }

    if (options.scale && options.scale !== 100) {
      worksheet.pageSetup = {
        ...worksheet.pageSetup,
        scale: options.scale,
      }
    }

    if (options.orientation === 'landscape') {
      worksheet.pageSetup = {
        ...worksheet.pageSetup,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      }
    }

    worksheet.pageMargins = {
      top: 0.75,
      right: 0.75,
      bottom: 0.75,
      left: 0.75,
    }

    worksheet.pageSetup = {
      ...worksheet.pageSetup,
      paperSize: 9,
    }
  }

  static async exportToCSV(
    univerAPI: any,
    options: ExportOptions
  ): Promise<void> {
    try {
      const workbook = univerAPI.getActiveWorkbook()
      const fWorksheet = workbook?.getActiveSheet()
      if (!fWorksheet) {
        throw new Error('No hay hoja activa')
      }

      const range = options.printArea
        ? fWorksheet.getRange(options.printArea)
        : fWorksheet.getUsedRange()

      if (!range) {
        throw new Error('No hay datos para exportar')
      }

      const values = range.getValues()
      if (!values || !Array.isArray(values)) {
        throw new Error('No se pudieron obtener los valores')
      }

      const csvContent = values
        .map(row => 
          row
            .map((cell: any) => {
              const value = cell?.toString() || ''
              if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`
              }
              return value
            })
            .join(',')
        )
        .join('\n')

      const blob = new Blob(['\uFEFF' + csvContent], { 
        type: 'text/csv;charset=utf-8;' 
      })

      const filename = options.filename || 'univer-export.csv'
      saveAs(blob, filename)
    } catch (error) {
      console.error('[UniverExportService] Error exporting CSV:', error)
      throw error
    }
  }

  static async exportToPDF(univerAPI: any): Promise<void> {
    try {
      window.print()
    } catch (error) {
      console.error('[UniverExportService] Error exporting PDF:', error)
      throw error
    }
  }

  static async exportSelection(
    univerAPI: any,
    options: ExportOptions
  ): Promise<void> {
    try {
      const workbook = univerAPI.getActiveWorkbook()
      const fWorksheet = workbook?.getActiveSheet()
      if (!fWorksheet) {
        throw new Error('No hay hoja activa')
      }

      const selection = fWorksheet.getSelection()?.getRanges()?.[0]
      if (!selection) {
        throw new Error('No hay selección')
      }

      const exportOptions = {
        ...options,
        printArea: selection.getAddress(),
        filename: options.filename || 'seleccion-univer.xlsx',
      }

      await this.exportToExcel(univerAPI, exportOptions)
    } catch (error) {
      console.error('[UniverExportService] Error exporting selection:', error)
      throw error
    }
  }
}
