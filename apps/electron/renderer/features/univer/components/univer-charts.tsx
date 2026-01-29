/**
 * Univer Charts - Componente de gráficos inteligente
 * Extrae datos de Univer y visualiza con Recharts
 * Detecta automáticamente el tipo de gráfico apropiado
 */

'use client'

import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from 'recharts'
import type { FRange } from '@univerjs/core/facade'

interface ChartDataPoint {
  name: string
  [key: string]: string | number
}

interface ChartColumn {
  label: string
  index: number
  values: (string | number)[]
  type: 'string' | 'number' | 'date' | 'boolean'
  isNumeric: boolean
}

export function UniverCharts({ univerAPI }: { univerAPI: any }) {
  const [selectedRange, setSelectedRange] = useState<FRange | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [columns, setColumns] = useState<ChartColumn[]>([])
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie' | 'area'>('bar')

  useEffect(() => {
    if (!univerAPI) return

    const extractData = () => {
      try {
        const fWorkbook = univerAPI.getActiveWorkbook()
        if (!fWorkbook) return

        const fWorksheet = fWorkbook.getActiveSheet()
        if (!fWorksheet) return

        const range = fWorksheet.getSelection()?.getRanges()?.[0]
        if (!range) return

        const values = range.getValues()
        if (!values || !Array.isArray(values)) return

        const processed = processDataStructure(values)
        setSelectedRange(range)
        setChartData(processed.data)
        setColumns(processed.columns)

        autoDetectChartType(processed.data, processed.columns)
      } catch (e) {
        console.error('[UniverCharts] Error extracting data:', e)
      }
    }

    const dispose = univerAPI.onSelectionChanged(() => extractData())
    extractData()
    return () => dispose?.()
  }, [univerAPI])

  const processDataStructure = (values: any[][]): {
    data: ChartDataPoint[]
    columns: ChartColumn[]
  } => {
    if (!values.length) return { data: [], columns: [] }

    const rows = values
    const colsCount = Math.max(...rows.map(r => r?.length || 0))

    const hasHeader = isHeaderRow(rows[0])
    const headerIndex = hasHeader ? 0 : -1
    const dataStartIndex = hasHeader ? 1 : 0

    const headers: string[] = hasHeader && rows[0]
      ? rows[0].map((cell: any, i: number) => cell?.toString() || `Columna ${i + 1}`)
      : Array.from({ length: colsCount }, (_, i) => `Columna ${i + 1}`)

    const columns: ChartColumn[] = headers.map((header, colIndex) => {
      const columnValues = rows.slice(dataStartIndex).map(row => row?.[colIndex])

      const types = columnValues.map(v => detectDataType(v))
      const numericCount = types.filter(t => t === 'number').length
      const totalCount = types.length

      return {
        label: header || `Columna ${colIndex + 1}`,
        index: colIndex,
        values: columnValues,
        type: numericCount / totalCount > 0.7 ? 'number' : 'string',
        isNumeric: numericCount / totalCount > 0.7,
      }
    })

    const data: ChartDataPoint[] = rows.slice(dataStartIndex).map((row, rowIndex) => {
      const point: ChartDataPoint = {
        name: headerIndex === -1 ? `Fila ${rowIndex + 1}` : row[0]?.toString() || `Fila ${rowIndex + 1}`,
      }

      columns.slice(1).forEach((col, colIndex) => {
        const value = row[col.index + 1]
        point[col.label] = col.isNumeric ? parseFloat(value) || 0 : value
      })

      return point
    })

    return { data, columns }
  }

  const detectDataType = (value: any): 'string' | 'number' | 'date' | 'boolean' => {
    if (value === null || value === undefined || value === '') return 'string'
    if (typeof value === 'number') return 'number'
    if (typeof value === 'boolean') return 'boolean'
    if (!isNaN(Date.parse(value))) return 'date'
    return 'string'
  }

  const isHeaderRow = (row: any[]): boolean => {
    if (!row || !row.length) return false
    const nonNumericCount = row.filter(cell => {
      const type = detectDataType(cell)
      return type !== 'number' && type !== 'boolean'
    }).length
    return nonNumericCount / row.length > 0.7
  }

  const autoDetectChartType = (data: ChartDataPoint[], cols: ChartColumn[]) => {
    if (data.length === 0) return

    const numericCols = cols.filter(c => c.isNumeric)
    const hasMultipleSeries = numericCols.length > 1

    if (data.length <= 3) {
      setChartType('pie')
    } else if (hasMultipleSeries && data.length > 10) {
      setChartType('area')
    } else if (hasMultipleSeries) {
      setChartType('line')
    } else {
      setChartType('bar')
    }
  }

  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Selecciona un rango de datos para crear un gráfico
        </div>
      )
    }

    const commonProps = {
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 5 },
    }

    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
              <Legend />
              {columns.slice(1).map((col, i) => (
                <Bar key={col.label} dataKey={col.label} fill={getChartColor(i)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
              <Legend />
              {columns.slice(1).map((col, i) => (
                <Line key={col.label} type="monotone" dataKey={col.label} stroke={getChartColor(i)} strokeWidth={2} dot={{ fill: getChartColor(i), r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
              <Legend />
              {columns.slice(1).map((col, i) => (
                <Area key={col.label} type="monotone" dataKey={col.label} stackId="1" stroke={getChartColor(i)} fill={getChartColor(i, 0.3)} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'pie':
        const pieData = chartData.map(point => ({
          name: point.name,
          value: Object.values(point).find(v => typeof v === 'number') || 0,
        }))

        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} outerRadius={120} fill="#8884d8">
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getChartColor(index)} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
            </PieChart>
          </ResponsiveContainer>
        )

      default:
        return null
    }
  }

  const getChartColor = (index: number, alpha: number = 1): string => {
    const colors = [
      `hsla(217, 91%, 60%, ${alpha})`,
      `hsla(160, 84%, 39%, ${alpha})`,
      `hsla(340, 82%, 52%, ${alpha})`,
      `hsla(38, 92%, 50%, ${alpha})`,
      `hsla(280, 67%, 55%, ${alpha})`,
      `hsla(120, 84%, 39%, ${alpha})`,
    ]
    return colors[index % colors.length]
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-card rounded-lg border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Gráficos de Datos</h3>
        <div className="flex gap-2">
          <button onClick={() => setChartType('bar')} className={`px-3 py-1 rounded-md text-sm transition-colors ${chartType === 'bar' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>Barras</button>
          <button onClick={() => setChartType('line')} className={`px-3 py-1 rounded-md text-sm transition-colors ${chartType === 'line' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>Líneas</button>
          <button onClick={() => setChartType('area')} className={`px-3 py-1 rounded-md text-sm transition-colors ${chartType === 'area' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>Área</button>
          <button onClick={() => setChartType('pie')} className={`px-3 py-1 rounded-md text-sm transition-colors ${chartType === 'pie' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>Circular</button>
        </div>
      </div>
      <div className="border rounded-md p-4 bg-background">{renderChart()}</div>
      {chartData.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Mostrando {chartData.length} filas de {columns.length} columnas
          {selectedRange && <span className="ml-2">(Rango: {selectedRange.getAddress()})</span>}
        </div>
      )}
    </div>
  )
}
