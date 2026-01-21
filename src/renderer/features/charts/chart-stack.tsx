'use client'

import { useState, useMemo, lazy, Suspense } from 'react'
import { IconChartBar, IconChartLine, IconChartPie, IconChartArea, IconChartDots, IconChartRadar, IconX, IconMaximize, IconMinimize } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Artifact } from '@shared/types'

// Lazy load ChartViewer
const ChartViewer = lazy(() => import('./chart-viewer').then(m => ({ default: m.ChartViewer })))

// ============================================================================
// TYPES
// ============================================================================

interface ChartStackProps {
    charts: Artifact[]
    onChartSelect?: (chart: Artifact) => void
    onChartRemove?: (chartId: string) => void
    selectedChartId?: string | null
    className?: string
}

// ============================================================================
// CHART TYPE ICON MAPPING
// ============================================================================

function getChartIcon(chartType: string) {
    switch (chartType) {
        case 'bar':
            return <IconChartBar size={14} />
        case 'line':
            return <IconChartLine size={14} />
        case 'pie':
        case 'doughnut':
            return <IconChartPie size={14} />
        case 'area':
            return <IconChartArea size={14} />
        case 'scatter':
            return <IconChartDots size={14} />
        case 'radar':
        case 'polarArea':
            return <IconChartRadar size={14} />
        default:
            return <IconChartBar size={14} />
    }
}

function getChartTypeLabel(chartType: string) {
    const labels: Record<string, string> = {
        bar: 'Bar',
        line: 'Line',
        pie: 'Pie',
        doughnut: 'Donut',
        area: 'Area',
        scatter: 'Scatter',
        radar: 'Radar',
        polarArea: 'Polar',
    }
    return labels[chartType] || chartType
}

// ============================================================================
// CHART THUMBNAIL - Mini preview
// ============================================================================

interface ChartThumbnailProps {
    chart: Artifact
    isSelected: boolean
    onClick: () => void
    onRemove?: () => void
}

function ChartThumbnail({ chart, isSelected, onClick, onRemove }: ChartThumbnailProps) {
    const config = chart.content as any
    const chartType = config?.type || 'bar'

    return (
        <div
            className={cn(
                'group relative flex flex-col rounded-lg border transition-all cursor-pointer',
                'hover:border-primary/50 hover:shadow-md',
                isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-card'
            )}
            onClick={onClick}
        >
            {/* Mini chart preview */}
            <div className="relative h-24 overflow-hidden rounded-t-lg bg-muted/30">
                <Suspense fallback={
                    <div className="flex items-center justify-center h-full">
                        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                    </div>
                }>
                    <div className="scale-[0.4] origin-top-left w-[250%] h-[250%]">
                        <ChartViewer
                            artifactId={chart.id}
                            config={{
                                ...config,
                                options: {
                                    ...config?.options,
                                    showLegend: false,
                                    title: { display: false }
                                }
                            }}
                            height={200}
                        />
                    </div>
                </Suspense>

                {/* Remove button */}
                {onRemove && (
                    <button
                        className="absolute top-1 right-1 p-1 rounded-full bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => {
                            e.stopPropagation()
                            onRemove()
                        }}
                    >
                        <IconX size={12} />
                    </button>
                )}
            </div>

            {/* Chart info */}
            <div className="p-2 space-y-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">
                        {getChartIcon(chartType)}
                    </span>
                    <span className="text-xs font-medium truncate flex-1">
                        {chart.name}
                    </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                    {getChartTypeLabel(chartType)} Chart
                </div>
            </div>
        </div>
    )
}

// ============================================================================
// CHART STACK COMPONENT
// ============================================================================

export function ChartStack({
    charts,
    onChartSelect,
    onChartRemove,
    selectedChartId,
    className,
}: ChartStackProps) {
    const [isExpanded, setIsExpanded] = useState(true)

    // Filter only chart artifacts
    const chartArtifacts = useMemo(() =>
        charts.filter(a => a.type === 'chart'),
        [charts]
    )

    if (chartArtifacts.length === 0) {
        return null
    }

    return (
        <div className={cn('flex flex-col', className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                    <IconChartBar size={16} className="text-muted-foreground" />
                    <span className="text-sm font-medium">Charts</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                        {chartArtifacts.length}
                    </span>
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            {isExpanded ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {isExpanded ? 'Collapse' : 'Expand'}
                    </TooltipContent>
                </Tooltip>
            </div>

            {/* Chart grid */}
            {isExpanded && (
                <ScrollArea className="flex-1">
                    <div className="grid grid-cols-2 gap-2 p-2">
                        {chartArtifacts.map((chart) => (
                            <ChartThumbnail
                                key={chart.id}
                                chart={chart}
                                isSelected={chart.id === selectedChartId}
                                onClick={() => onChartSelect?.(chart)}
                                onRemove={onChartRemove ? () => onChartRemove(chart.id) : undefined}
                            />
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    )
}

// ============================================================================
// CHART TABS - Horizontal tabs for switching between charts
// ============================================================================

interface ChartTabsProps {
    charts: Artifact[]
    selectedChartId: string | null
    onChartSelect: (chart: Artifact) => void
    onChartClose?: (chartId: string) => void
    className?: string
}

export function ChartTabs({
    charts,
    selectedChartId,
    onChartSelect,
    onChartClose,
    className,
}: ChartTabsProps) {
    const chartArtifacts = useMemo(() =>
        charts.filter(a => a.type === 'chart'),
        [charts]
    )

    if (chartArtifacts.length === 0) {
        return null
    }

    return (
        <div className={cn('flex items-center gap-1 overflow-x-auto scrollbar-none px-2', className)}>
            {chartArtifacts.map((chart) => {
                const config = chart.content as any
                const chartType = config?.type || 'bar'
                const isSelected = chart.id === selectedChartId

                return (
                    <div
                        key={chart.id}
                        className={cn(
                            'group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all whitespace-nowrap',
                            isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                        onClick={() => onChartSelect(chart)}
                    >
                        {getChartIcon(chartType)}
                        <span className="max-w-[100px] truncate">{chart.name}</span>

                        {onChartClose && (
                            <button
                                className={cn(
                                    'p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity',
                                    isSelected
                                        ? 'hover:bg-primary-foreground/20'
                                        : 'hover:bg-foreground/10'
                                )}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onChartClose(chart.id)
                                }}
                            >
                                <IconX size={12} />
                            </button>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ============================================================================
// EXPORT INDEX
// ============================================================================

export { ChartThumbnail }
