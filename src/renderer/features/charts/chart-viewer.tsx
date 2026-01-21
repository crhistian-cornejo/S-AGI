'use client'

import { useMemo, useRef, forwardRef, useImperativeHandle, useCallback } from 'react'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    ScatterChart,
    Scatter,
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/utils'
import { exportToPng, exportToPdf, copyChartToClipboard } from './chart-export'

// ============================================================================
// CHART THEME & COLORS (Midday-inspired)
// ============================================================================

const CHART_COLORS = {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    tertiary: '#ec4899',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',
    muted: '#64748b',
}

const COLOR_PALETTES = {
    vibrant: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'],
    gradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#43e97b', '#38f9d7', '#fa709a', '#fee140'],
    neon: ['#00ff87', '#60efff', '#ff00ff', '#ffff00', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'],
    pastel: ['#a8e6cf', '#dcedc1', '#ffd3a5', '#ffaaa5', '#ff8b94', '#b8e0d2', '#d6eadf', '#eac4d5', '#b8b5ff', '#85e3ff'],
    grayscale: ['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb'],
}

// ============================================================================
// CHART CONFIGURATION
// ============================================================================

const CHART_CONFIG = {
    margin: { top: 20, right: 30, left: 20, bottom: 20 },
    animationDuration: 800,
    animationEasing: 'ease-out' as const,
    strokeWidth: 2,
    dotRadius: 4,
    activeDotRadius: 6,
    barRadius: 4,
}

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

interface TooltipProps {
    active?: boolean
    payload?: Array<{
        name: string
        value: number
        color: string
        dataKey: string
    }>
    label?: string
    formatter?: (value: number) => string
}

function ChartTooltip({ active, payload, label, formatter }: TooltipProps) {
    if (!active || !payload?.length) return null

    return (
        <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-3 min-w-[140px] animate-in fade-in-0 zoom-in-95 duration-200">
            {label && (
                <p className="text-xs font-medium text-muted-foreground mb-2 pb-2 border-b border-border">
                    {label}
                </p>
            )}
            <div className="space-y-1.5">
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 ring-offset-popover"
                                style={{ backgroundColor: entry.color, boxShadow: `0 0 8px ${entry.color}40` }}
                            />
                            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                {entry.name}
                            </span>
                        </div>
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatter ? formatter(entry.value) : entry.value.toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ============================================================================
// LEGEND COMPONENT
// ============================================================================

interface LegendProps {
    payload?: Array<{
        value: string
        color: string
        type?: string
    }>
}

function ChartLegend({ payload }: LegendProps) {
    if (!payload?.length) return null

    return (
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            {payload.map((entry, index) => (
                <div key={index} className="flex items-center gap-2 group cursor-default">
                    <div
                        className="w-3 h-3 rounded-full transition-transform group-hover:scale-110"
                        style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}50` }}
                    />
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                        {entry.value}
                    </span>
                </div>
            ))}
        </div>
    )
}

// ============================================================================
// TYPES
// ============================================================================

interface ChartDataset {
    label: string
    data: number[]
    backgroundColor?: string
    borderColor?: string
    fill?: boolean
}

interface ChartConfig {
    type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'doughnut' | 'radar' | 'polarArea'
    data: {
        labels: string[]
        datasets: ChartDataset[]
    }
    options?: {
        title?: { display?: boolean; text?: string }
        aspectRatio?: number
        palette?: keyof typeof COLOR_PALETTES
        stacked?: boolean
        showGrid?: boolean
        smooth?: boolean
        showLegend?: boolean
        currency?: string
        locale?: string
    }
}

interface ChartViewerProps {
    artifactId: string
    config: ChartConfig
    className?: string
    height?: number
}

export interface ChartViewerRef {
    exportToPng: (filename?: string) => Promise<void>
    exportToPdf: (filename?: string, title?: string) => Promise<void>
    copyToClipboard: () => Promise<boolean>
    getElement: () => HTMLDivElement | null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ChartViewer = forwardRef<ChartViewerRef, ChartViewerProps>(function ChartViewer(
    { artifactId, config, className, height = 320 },
    ref
) {
    const chartContainerRef = useRef<HTMLDivElement>(null)

    // Get chart title for exports
    const chartTitle = config.options?.title?.text || 'Chart'

    // Export handlers
    const handleExportPng = useCallback(async (filename?: string) => {
        if (!chartContainerRef.current) return
        await exportToPng(chartContainerRef.current, {
            filename: filename || chartTitle,
            scale: 2
        })
    }, [chartTitle])

    const handleExportPdf = useCallback(async (filename?: string, title?: string) => {
        if (!chartContainerRef.current) return
        await exportToPdf(chartContainerRef.current, {
            filename: filename || chartTitle,
            title: title || chartTitle,
            orientation: 'landscape'
        })
    }, [chartTitle])

    const handleCopyToClipboard = useCallback(async () => {
        if (!chartContainerRef.current) return false
        return copyChartToClipboard(chartContainerRef.current)
    }, [])

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
        exportToPng: handleExportPng,
        exportToPdf: handleExportPdf,
        copyToClipboard: handleCopyToClipboard,
        getElement: () => chartContainerRef.current
    }), [handleExportPng, handleExportPdf, handleCopyToClipboard])

    // Transform data for Recharts format
    const { chartData, colors } = useMemo(() => {
        const palette = COLOR_PALETTES[config.options?.palette || 'vibrant']
        const labels = config.data.labels
        const datasets = config.data.datasets

        // Transform to Recharts data format
        const data = labels.map((label, i) => {
            const point: Record<string, unknown> = { name: label }
            datasets.forEach((dataset) => {
                point[dataset.label] = dataset.data[i]
            })
            return point
        })

        // Assign colors to datasets
        const datasetColors = datasets.map((dataset, i) =>
            dataset.backgroundColor || dataset.borderColor || palette[i % palette.length]
        )

        return { chartData: data, colors: datasetColors }
    }, [config])

    // Axis styling
    const axisProps = {
        tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
        axisLine: false,
        tickLine: false,
    }

    const gridProps = {
        strokeDasharray: '3 3',
        stroke: 'hsl(var(--border))',
        strokeOpacity: 0.5,
        vertical: false,
    }

    // Render functions for each chart type
    const renderBarChart = () => {
        const datasets = config.data.datasets
        const stacked = config.options?.stacked

        return (
            <BarChart data={chartData} margin={CHART_CONFIG.margin}>
                {config.options?.showGrid !== false && <CartesianGrid {...gridProps} />}
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} width={50} />
                <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.1)' }} />
                {config.options?.showLegend !== false && <Legend content={<ChartLegend />} />}
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                {datasets.map((dataset, i) => (
                    <Bar
                        key={dataset.label}
                        dataKey={dataset.label}
                        fill={colors[i]}
                        radius={[CHART_CONFIG.barRadius, CHART_CONFIG.barRadius, 0, 0]}
                        stackId={stacked ? 'stack' : undefined}
                        animationDuration={CHART_CONFIG.animationDuration}
                        animationEasing={CHART_CONFIG.animationEasing}
                    />
                ))}
            </BarChart>
        )
    }

    const renderLineChart = () => {
        const datasets = config.data.datasets
        const smooth = config.options?.smooth !== false

        return (
            <LineChart data={chartData} margin={CHART_CONFIG.margin}>
                {config.options?.showGrid !== false && <CartesianGrid {...gridProps} />}
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} width={50} />
                <RechartsTooltip content={<ChartTooltip />} />
                {config.options?.showLegend !== false && <Legend content={<ChartLegend />} />}
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                {datasets.map((dataset, i) => (
                    <Line
                        key={dataset.label}
                        type={smooth ? 'monotone' : 'linear'}
                        dataKey={dataset.label}
                        stroke={colors[i]}
                        strokeWidth={CHART_CONFIG.strokeWidth}
                        dot={{ fill: colors[i], strokeWidth: 0, r: CHART_CONFIG.dotRadius }}
                        activeDot={{ r: CHART_CONFIG.activeDotRadius, strokeWidth: 0, fill: colors[i] }}
                        animationDuration={CHART_CONFIG.animationDuration}
                        animationEasing={CHART_CONFIG.animationEasing}
                    />
                ))}
            </LineChart>
        )
    }

    const renderAreaChart = () => {
        const datasets = config.data.datasets
        const smooth = config.options?.smooth !== false

        return (
            <AreaChart data={chartData} margin={CHART_CONFIG.margin}>
                <defs>
                    {datasets.map((_, i) => (
                        <linearGradient key={`gradient-${i}`} id={`area-gradient-${artifactId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={colors[i]} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={colors[i]} stopOpacity={0.05} />
                        </linearGradient>
                    ))}
                </defs>
                {config.options?.showGrid !== false && <CartesianGrid {...gridProps} />}
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} width={50} />
                <RechartsTooltip content={<ChartTooltip />} />
                {config.options?.showLegend !== false && <Legend content={<ChartLegend />} />}
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                {datasets.map((dataset, i) => (
                    <Area
                        key={dataset.label}
                        type={smooth ? 'monotone' : 'linear'}
                        dataKey={dataset.label}
                        stroke={colors[i]}
                        strokeWidth={CHART_CONFIG.strokeWidth}
                        fill={`url(#area-gradient-${artifactId}-${i})`}
                        animationDuration={CHART_CONFIG.animationDuration}
                        animationEasing={CHART_CONFIG.animationEasing}
                    />
                ))}
            </AreaChart>
        )
    }

    const renderPieChart = (isDoughnut = false) => {
        const pieData = config.data.labels.map((label, i) => ({
            name: label,
            value: config.data.datasets[0]?.data[i] || 0
        }))
        const palette = COLOR_PALETTES[config.options?.palette || 'vibrant']

        return (
            <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <defs>
                    {pieData.map((_, i) => (
                        <linearGradient key={`pie-gradient-${i}`} id={`pie-gradient-${artifactId}-${i}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={palette[i % palette.length]} stopOpacity={1} />
                            <stop offset="100%" stopColor={palette[i % palette.length]} stopOpacity={0.8} />
                        </linearGradient>
                    ))}
                </defs>
                <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isDoughnut ? '55%' : 0}
                    outerRadius="80%"
                    paddingAngle={isDoughnut ? 2 : 1}
                    dataKey="value"
                    animationDuration={CHART_CONFIG.animationDuration}
                    animationEasing={CHART_CONFIG.animationEasing}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                >
                    {pieData.map((_, i) => (
                        <Cell
                            key={`cell-${i}`}
                            fill={`url(#pie-gradient-${artifactId}-${i})`}
                            stroke="hsl(var(--background))"
                            strokeWidth={2}
                        />
                    ))}
                </Pie>
                <RechartsTooltip content={<ChartTooltip />} />
                {config.options?.showLegend !== false && <Legend content={<ChartLegend />} />}
            </PieChart>
        )
    }

    const renderScatterChart = () => {
        const datasets = config.data.datasets
        const scatterData = config.data.labels.map((label, i) => ({
            name: label,
            x: datasets[0]?.data[i] || 0,
            y: datasets[1]?.data[i] || datasets[0]?.data[i] || 0
        }))

        return (
            <ScatterChart margin={CHART_CONFIG.margin}>
                {config.options?.showGrid !== false && <CartesianGrid {...gridProps} />}
                <XAxis type="number" dataKey="x" name="X" {...axisProps} />
                <YAxis type="number" dataKey="y" name="Y" {...axisProps} width={50} />
                <RechartsTooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                {config.options?.showLegend !== false && <Legend content={<ChartLegend />} />}
                <Scatter
                    name={datasets[0]?.label || 'Data'}
                    data={scatterData}
                    fill={colors[0]}
                    animationDuration={CHART_CONFIG.animationDuration}
                    animationEasing={CHART_CONFIG.animationEasing}
                />
            </ScatterChart>
        )
    }

    const renderRadarChart = () => {
        const datasets = config.data.datasets

        return (
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
                <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <PolarAngleAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <RechartsTooltip content={<ChartTooltip />} />
                {config.options?.showLegend !== false && <Legend content={<ChartLegend />} />}
                {datasets.map((dataset, i) => (
                    <Radar
                        key={dataset.label}
                        name={dataset.label}
                        dataKey={dataset.label}
                        stroke={colors[i]}
                        fill={colors[i]}
                        fillOpacity={0.25}
                        strokeWidth={CHART_CONFIG.strokeWidth}
                        animationDuration={CHART_CONFIG.animationDuration}
                        animationEasing={CHART_CONFIG.animationEasing}
                    />
                ))}
            </RadarChart>
        )
    }

    // Select chart type
    const renderChart = () => {
        switch (config.type) {
            case 'bar':
                return renderBarChart()
            case 'line':
                return renderLineChart()
            case 'area':
                return renderAreaChart()
            case 'pie':
                return renderPieChart(false)
            case 'doughnut':
                return renderPieChart(true)
            case 'scatter':
                return renderScatterChart()
            case 'radar':
            case 'polarArea':
                return renderRadarChart()
            default:
                return (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Unsupported chart type: {config.type}</p>
                    </div>
                )
        }
    }

    return (
        <div
            ref={chartContainerRef}
            className={cn('w-full h-full flex flex-col bg-background', className)}
        >
            {/* Title */}
            {config.options?.title?.display && config.options.title.text && (
                <div className="px-4 pt-4 pb-2">
                    <h3 className="text-base font-semibold text-foreground">
                        {config.options.title.text}
                    </h3>
                </div>
            )}

            {/* Chart */}
            <div className="flex-1 min-h-0 p-2" style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    {renderChart()}
                </ResponsiveContainer>
            </div>
        </div>
    )
})

// ============================================================================
// EXPORTS
// ============================================================================

export const CHART_TYPE_MAP = {
    bar: 'bar',
    line: 'line',
    pie: 'pie',
    area: 'area',
    scatter: 'scatter',
    doughnut: 'doughnut',
    radar: 'radar',
    polarArea: 'polarArea',
} as const

export { CHART_COLORS, COLOR_PALETTES, CHART_CONFIG }
