'use client'

import { useMemo, type ReactNode } from 'react'
import {
    ResponsiveContainer,
    ComposedChart,
    XAxis as RechartsXAxis,
    YAxis as RechartsYAxis,
    CartesianGrid,
    Tooltip,
    Area as RechartsArea,
    Line as RechartsLine,
    Bar as RechartsBar,
    ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/utils'
import { commonChartConfig, chartColors, type ColorPalette, colorPalettes } from './chart-utils'

// ============================================================================
// BASE CHART WRAPPER
// ============================================================================

interface BaseChartProps {
    data: Record<string, unknown>[]
    height?: number | string
    margin?: { top?: number; right?: number; bottom?: number; left?: number }
    className?: string
    children: ReactNode
}

export function BaseChart({
    data,
    height = 280,
    margin = commonChartConfig.margin,
    className,
    children,
}: BaseChartProps) {
    return (
        <div className={cn('w-full', className)} style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={margin}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--chart-grid, hsl(var(--border)))"
                        strokeOpacity={0.5}
                        vertical={false}
                    />
                    {children}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}

// ============================================================================
// STYLED AXES
// ============================================================================

interface StyledXAxisProps {
    dataKey?: string
    tickFormatter?: (value: unknown) => string
    hide?: boolean
    [key: string]: unknown
}

export function StyledXAxis({ dataKey = 'name', tickFormatter, hide, ...props }: StyledXAxisProps) {
    return (
        <RechartsXAxis
            dataKey={dataKey}
            axisLine={false}
            tickLine={false}
            tick={{
                fill: 'var(--chart-axis, hsl(var(--muted-foreground)))',
                fontSize: commonChartConfig.fontSize,
            }}
            tickFormatter={tickFormatter}
            hide={hide}
            {...props}
        />
    )
}

interface StyledYAxisProps {
    tickFormatter?: (value: number) => string
    width?: number
    hide?: boolean
    domain?: [number | 'auto' | 'dataMin' | 'dataMax' | ((value: number) => number), number | 'auto' | 'dataMin' | 'dataMax' | ((value: number) => number)]
    [key: string]: unknown
}

export function StyledYAxis({
    tickFormatter,
    width = 50,
    hide,
    domain,
    ...props
}: StyledYAxisProps) {
    return (
        <RechartsYAxis
            axisLine={false}
            tickLine={false}
            tick={{
                fill: 'var(--chart-axis, hsl(var(--muted-foreground)))',
                fontSize: commonChartConfig.fontSize,
            }}
            tickFormatter={tickFormatter}
            width={width}
            hide={hide}
            domain={domain}
            {...props}
        />
    )
}

// ============================================================================
// STYLED TOOLTIP
// ============================================================================

interface TooltipPayload {
    name: string
    value: number
    color: string
    dataKey: string
}

interface StyledTooltipProps {
    active?: boolean
    payload?: TooltipPayload[]
    label?: string
    formatter?: (value: number, name: string) => [string, string]
}

export function StyledTooltip({ active, payload, label, formatter }: StyledTooltipProps) {
    if (!active || !payload?.length) return null

    return (
        <div
            className="p-3 text-sm border rounded-lg shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
                backgroundColor: 'var(--chart-tooltip-bg, hsl(var(--popover)))',
                borderColor: 'var(--chart-tooltip-border, hsl(var(--border)))',
                fontFamily: commonChartConfig.fontFamily,
            }}
        >
            {label && (
                <p className="mb-2 text-xs font-medium text-muted-foreground border-b border-border pb-2">
                    {label}
                </p>
            )}
            <div className="space-y-1">
                {payload.map((entry, index) => {
                    const value = typeof entry.value === 'number' ? entry.value : 0
                    const [formattedValue, name] = formatter
                        ? formatter(value, entry.dataKey)
                        : [value.toLocaleString(), entry.name]

                    return (
                        <div key={`${entry.dataKey}-${index}`} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{
                                        backgroundColor: entry.color,
                                        boxShadow: `0 0 6px ${entry.color}40`,
                                    }}
                                />
                                <span className="text-xs text-muted-foreground">{name}</span>
                            </div>
                            <span className="font-semibold tabular-nums">{formattedValue}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ============================================================================
// STYLED CHART ELEMENTS
// ============================================================================

interface StyledAreaProps {
    dataKey: string
    stroke?: string
    fill?: string
    strokeWidth?: number
    useGradient?: boolean
    gradientId?: string
    animationDuration?: number
    [key: string]: unknown
}

export function StyledArea({
    dataKey,
    stroke,
    fill,
    strokeWidth = 2,
    useGradient = true,
    gradientId,
    animationDuration = commonChartConfig.animationDuration,
    ...props
}: StyledAreaProps) {
    const defaultGradientId = `area-gradient-${dataKey}`
    const actualGradientId = gradientId || defaultGradientId
    const actualFill = useGradient ? `url(#${actualGradientId})` : fill

    return (
        <>
            {useGradient && (
                <defs>
                    <linearGradient id={actualGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stroke || chartColors.primary} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={stroke || chartColors.primary} stopOpacity={0.05} />
                    </linearGradient>
                </defs>
            )}
            <RechartsArea
                type="monotone"
                dataKey={dataKey}
                stroke={stroke || chartColors.primary}
                fill={actualFill}
                strokeWidth={strokeWidth}
                animationDuration={animationDuration}
                animationEasing="ease-out"
                {...props}
            />
        </>
    )
}

interface StyledLineProps {
    dataKey: string
    stroke?: string
    strokeWidth?: number
    strokeDasharray?: string
    dot?: boolean | object
    activeDot?: boolean | object
    animationDuration?: number
    [key: string]: unknown
}

export function StyledLine({
    dataKey,
    stroke,
    strokeWidth = 2,
    strokeDasharray,
    dot = { r: 3, strokeWidth: 0 },
    activeDot = { r: 5, strokeWidth: 0 },
    animationDuration = commonChartConfig.animationDuration,
    ...props
}: StyledLineProps) {
    return (
        <RechartsLine
            type="monotone"
            dataKey={dataKey}
            stroke={stroke || chartColors.primary}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            dot={dot ? { fill: stroke || chartColors.primary, ...((typeof dot === 'object') ? dot : {}) } : false}
            activeDot={activeDot ? { fill: stroke || chartColors.primary, ...((typeof activeDot === 'object') ? activeDot : {}) } : false}
            animationDuration={animationDuration}
            animationEasing="ease-out"
            {...props}
        />
    )
}

interface StyledBarProps {
    dataKey: string
    fill?: string
    radius?: number | [number, number, number, number]
    stackId?: string
    animationDuration?: number
    [key: string]: unknown
}

export function StyledBar({
    dataKey,
    fill,
    radius = [4, 4, 0, 0],
    stackId,
    animationDuration = commonChartConfig.animationDuration,
    ...props
}: StyledBarProps) {
    return (
        <RechartsBar
            dataKey={dataKey}
            fill={fill || chartColors.primary}
            radius={radius}
            stackId={stackId}
            animationDuration={animationDuration}
            animationEasing="ease-out"
            {...props}
        />
    )
}

// ============================================================================
// CHART LEGEND
// ============================================================================

export interface LegendItem {
    label: string
    type: 'solid' | 'dashed' | 'pattern'
    color?: string
}

interface ChartLegendProps {
    title?: string
    items: LegendItem[]
    className?: string
}

export function ChartLegend({ title, items, className }: ChartLegendProps) {
    return (
        <div className={cn('flex items-center justify-between mb-4', className)}>
            {title && (
                <h4 className="text-base font-semibold text-foreground">{title}</h4>
            )}
            <div className={cn('flex gap-4 items-center', !title && 'ml-auto')}>
                {items.map((item, index) => (
                    <div key={`legend-${item.label}-${index}`} className="flex gap-2 items-center group">
                        <div
                            className="w-3 h-0.5 transition-transform group-hover:scale-110"
                            style={{
                                backgroundColor: item.type === 'solid' || item.type === 'dashed'
                                    ? item.color || chartColors.primary
                                    : 'transparent',
                                backgroundImage: item.type === 'pattern'
                                    ? 'repeating-linear-gradient(45deg, currentColor, currentColor 1px, transparent 1px, transparent 2px)'
                                    : undefined,
                                borderStyle: item.type === 'dashed' ? 'dashed' : 'solid',
                                borderWidth: item.type === 'dashed' ? '1px' : 0,
                                borderColor: item.color || chartColors.primary,
                            }}
                        />
                        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ============================================================================
// REFERENCE LINE HELPER
// ============================================================================

interface ZeroReferenceLineProps {
    stroke?: string
    strokeDasharray?: string
}

export function ZeroReferenceLine({
    stroke = 'hsl(var(--border))',
    strokeDasharray = '2 2',
}: ZeroReferenceLineProps) {
    return (
        <ReferenceLine
            y={0}
            stroke={stroke}
            strokeDasharray={strokeDasharray}
        />
    )
}

// ============================================================================
// TOOLTIP WRAPPER
// ============================================================================

interface ChartTooltipProps {
    formatter?: (value: number, name: string) => [string, string]
}

export function ChartTooltip({ formatter }: ChartTooltipProps) {
    return (
        <Tooltip
            content={<StyledTooltip formatter={formatter} />}
            cursor={{ fill: 'hsl(var(--muted) / 0.1)' }}
            wrapperStyle={{ zIndex: 9999 }}
        />
    )
}
