import { memo, useState, useEffect, Suspense, lazy, useRef, useCallback } from 'react'
import { IconChartBar, IconDownload, IconMaximize, IconLoader2, IconFileTypePdf, IconCopy, IconCheck } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import type { ChartViewerRef } from '@/features/charts/chart-viewer'

// Lazy load ChartViewer to avoid circular dependencies
const ChartViewer = lazy(() => import('@/features/charts/chart-viewer').then(m => ({ default: m.ChartViewer })))

interface ChartConfigInput {
    type: string
    data: {
        labels: string[]
        datasets: Array<{
            label: string
            data: number[]
            backgroundColor?: string
            borderColor?: string
            fill?: boolean
        }>
    }
    options?: {
        title?: { display?: boolean; text?: string }
        aspectRatio?: number
        palette?: string
        stacked?: boolean
        showGrid?: boolean
        smooth?: boolean
        showLegend?: boolean
        currency?: string
        locale?: string
    }
}

interface AgentGeneratedChartProps {
    artifactId: string
    chartConfig: ChartConfigInput
    title?: string
    isGenerating?: boolean
    onViewInPanel?: (id: string) => void
    className?: string
}

/**
 * Renders an AI-generated chart inline in the chat message
 * Similar to AgentGeneratedImage but for charts
 */
export const AgentGeneratedChart = memo(function AgentGeneratedChart({
    artifactId,
    chartConfig,
    title,
    isGenerating = false,
    onViewInPanel,
    className
}: AgentGeneratedChartProps) {
    const [isRevealed, setIsRevealed] = useState(false)
    const [copiedToClipboard, setCopiedToClipboard] = useState(false)
    const chartRef = useRef<ChartViewerRef>(null)

    // Trigger reveal animation after mount
    useEffect(() => {
        if (!isGenerating && !isRevealed) {
            const timer = setTimeout(() => setIsRevealed(true), 100)
            return () => clearTimeout(timer)
        }
    }, [isGenerating, isRevealed])

    const chartTitle = title || chartConfig.options?.title?.text || 'Chart'
    const chartType = chartConfig.type || 'bar'

    const handleExportPng = useCallback(async () => {
        try {
            await chartRef.current?.exportToPng(chartTitle)
            toast.success('Chart exported as PNG')
        } catch (err) {
            console.error('Failed to export PNG:', err)
            toast.error('Failed to export chart')
        }
    }, [chartTitle])

    const handleExportPdf = useCallback(async () => {
        try {
            await chartRef.current?.exportToPdf(chartTitle, chartTitle)
            toast.success('Chart exported as PDF')
        } catch (err) {
            console.error('Failed to export PDF:', err)
            toast.error('Failed to export chart')
        }
    }, [chartTitle])

    const handleCopyToClipboard = useCallback(async () => {
        try {
            const success = await chartRef.current?.copyToClipboard()
            if (success) {
                setCopiedToClipboard(true)
                toast.success('Chart copied to clipboard')
                setTimeout(() => setCopiedToClipboard(false), 2000)
            } else {
                toast.error('Failed to copy chart')
            }
        } catch (err) {
            console.error('Failed to copy:', err)
            toast.error('Failed to copy chart')
        }
    }, [])

    const handleViewInPanel = useCallback(() => {
        onViewInPanel?.(artifactId)
    }, [artifactId, onViewInPanel])

    // Loading/Generating state
    if (isGenerating) {
        return (
            <div className={cn(
                "rounded-xl border border-border/50 bg-muted/20 overflow-hidden",
                className
            )}>
                <div className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 flex items-center justify-center animate-pulse">
                        <IconChartBar size={20} className="text-indigo-400" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground animate-pulse">
                            Generating chart...
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {chartType.charAt(0).toUpperCase() + chartType.slice(1)} chart
                        </span>
                    </div>
                    <IconLoader2 size={16} className="text-muted-foreground animate-spin ml-auto" />
                </div>

                {/* Skeleton chart area */}
                <div className="h-48 bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40 relative overflow-hidden">
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
                </div>
            </div>
        )
    }

    return (
        <div className={cn(
            "relative group rounded-xl border border-border/50 overflow-hidden",
            "bg-background",
            "transition-all duration-500 ease-out",
            !isRevealed && "opacity-0 translate-y-2",
            isRevealed && "opacity-100 translate-y-0",
            className
        )}>
            {/* Chart container */}
            <div className={cn(
                "relative",
                "transition-[max-height,opacity] duration-700 ease-out",
                !isRevealed && "max-h-0 opacity-0",
                isRevealed && "max-h-[400px] opacity-100"
            )}>
                <Suspense fallback={
                    <div className="h-64 flex items-center justify-center bg-muted/20">
                        <IconLoader2 size={24} className="text-muted-foreground animate-spin" />
                    </div>
                }>
                    <ChartViewer
                        ref={chartRef}
                        artifactId={artifactId}
                        config={chartConfig as Parameters<typeof ChartViewer>[0]['config']}
                        height={280}
                        className="bg-background"
                    />
                </Suspense>
            </div>

            {/* Action buttons overlay - shown on hover */}
            {isRevealed && (
                <div className={cn(
                    "absolute top-2 right-2",
                    "flex items-center gap-1",
                    "opacity-0 group-hover:opacity-100",
                    "transition-opacity duration-200"
                )}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                                onClick={handleCopyToClipboard}
                            >
                                {copiedToClipboard ? <IconCheck size={16} className="text-emerald-500" /> : <IconCopy size={16} />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{copiedToClipboard ? 'Copied!' : 'Copy to clipboard'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                                onClick={handleExportPng}
                            >
                                <IconDownload size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export as PNG</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                                onClick={handleExportPdf}
                            >
                                <IconFileTypePdf size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Export as PDF</TooltipContent>
                    </Tooltip>
                    {onViewInPanel && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
                                    onClick={handleViewInPanel}
                                >
                                    <IconMaximize size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open in panel</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            )}

            {/* Chart info footer */}
            {isRevealed && (
                <div className={cn(
                    "flex items-center justify-between px-4 py-2",
                    "border-t border-border/30 bg-muted/10",
                    "text-xs text-muted-foreground/70"
                )}>
                    <span className="truncate max-w-[70%]" title={chartTitle}>
                        {chartTitle.length > 50 ? `${chartTitle.slice(0, 50)}...` : chartTitle}
                    </span>
                    <span className="shrink-0 flex items-center gap-1.5">
                        <IconChartBar size={12} />
                        {chartType.charAt(0).toUpperCase() + chartType.slice(1)}
                    </span>
                </div>
            )}
        </div>
    )
})
