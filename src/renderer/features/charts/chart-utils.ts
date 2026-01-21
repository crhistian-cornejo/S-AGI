/**
 * Chart utilities and configuration - Midday-inspired
 * Shared configuration for all chart components
 */

// ============================================================================
// COMMON CHART CONFIGURATION
// ============================================================================

export const commonChartConfig = {
    margin: { top: 12, right: 20, left: 0, bottom: 12 },
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    fontSize: 11,
    animationDuration: 600,
    animationEasing: 'ease-out' as const,
} as const

// ============================================================================
// COLOR PALETTES - Theme aware
// ============================================================================

export const chartColors = {
    // Primary palette
    primary: 'hsl(var(--primary))',
    secondary: 'hsl(var(--secondary))',
    accent: 'hsl(var(--accent))',
    muted: 'hsl(var(--muted-foreground))',

    // Semantic colors
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',

    // Chart-specific
    grid: 'hsl(var(--border))',
    axis: 'hsl(var(--muted-foreground))',
    tooltip: {
        bg: 'hsl(var(--popover))',
        border: 'hsl(var(--border))',
        text: 'hsl(var(--popover-foreground))',
    }
} as const

// Multi-series color palettes
export const colorPalettes = {
    vibrant: [
        '#6366f1', // indigo
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#f43f5e', // rose
        '#f97316', // orange
        '#eab308', // yellow
        '#22c55e', // green
        '#14b8a6', // teal
        '#06b6d4', // cyan
        '#3b82f6', // blue
    ],
    gradient: [
        '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe',
        '#00f2fe', '#43e97b', '#38f9d7', '#fa709a', '#fee140',
    ],
    neon: [
        '#00ff87', '#60efff', '#ff00ff', '#ffff00', '#ff6b6b',
        '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9',
    ],
    pastel: [
        '#a8e6cf', '#dcedc1', '#ffd3a5', '#ffaaa5', '#ff8b94',
        '#b8e0d2', '#d6eadf', '#eac4d5', '#b8b5ff', '#85e3ff',
    ],
    monochrome: [
        '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af',
        '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#ffffff',
    ],
} as const

export type ColorPalette = keyof typeof colorPalettes

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format large numbers with K/M/B suffix
 */
export function formatCompactNumber(value: number): string {
    const absValue = Math.abs(value)
    const sign = value < 0 ? '-' : ''

    if (absValue >= 1_000_000_000) {
        return `${sign}${(absValue / 1_000_000_000).toFixed(1)}B`
    }
    if (absValue >= 1_000_000) {
        return `${sign}${(absValue / 1_000_000).toFixed(1)}M`
    }
    if (absValue >= 1_000) {
        return `${sign}${(absValue / 1_000).toFixed(1)}K`
    }
    return value.toLocaleString()
}

/**
 * Create a compact tick formatter for axes
 */
export function createCompactTickFormatter() {
    return (value: number): string => formatCompactNumber(value)
}

/**
 * Format currency amount
 */
export function formatCurrency(
    value: number,
    currency = 'USD',
    locale = 'en-US',
    options?: Intl.NumberFormatOptions
): string {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
        ...options,
    }).format(value)
}

/**
 * Create currency tick formatter for Y-axis
 */
export function createCurrencyTickFormatter(currency = 'USD', locale = 'en-US') {
    return (value: number): string => {
        const absValue = Math.abs(value)
        const sign = value < 0 ? '-' : ''

        if (absValue >= 1_000_000) {
            return `${sign}${currency === 'USD' ? '$' : ''}${(absValue / 1_000_000).toFixed(1)}M`
        }
        if (absValue >= 1_000) {
            return `${sign}${currency === 'USD' ? '$' : ''}${(absValue / 1_000).toFixed(0)}K`
        }
        return formatCurrency(value, currency, locale)
    }
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 0): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

// ============================================================================
// DOMAIN CALCULATIONS
// ============================================================================

/**
 * Get domain that always includes zero (for positive and negative values)
 */
export function getZeroInclusiveDomain(): [
    (dataMin: number) => number,
    (dataMax: number) => number
] {
    return [
        (dataMin: number) => Math.min(0, dataMin * 1.1),
        (dataMax: number) => Math.max(0, dataMax * 1.1),
    ]
}

/**
 * Calculate Y-axis domain with padding
 */
export function calculateYAxisDomain(
    data: number[],
    padding = 0.1
): [number, number] {
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min
    const paddingAmount = range * padding

    return [
        min < 0 ? min - paddingAmount : 0,
        max + paddingAmount,
    ]
}

// ============================================================================
// MARGIN CALCULATIONS
// ============================================================================

/**
 * Calculate dynamic left margin based on Y-axis tick width
 */
export function calculateLeftMargin(
    data: Record<string, unknown>[],
    dataKey: string,
    tickFormatter: (value: number) => string
): number {
    if (!data.length) return 40

    const values = data.map(d => Number(d[dataKey]) || 0)
    const maxValue = Math.max(...values.map(Math.abs))
    const formattedMax = tickFormatter(maxValue)

    // Estimate character width (roughly 7px per character)
    const charWidth = 7
    const minMargin = 40
    const calculatedMargin = formattedMax.length * charWidth + 10

    return Math.max(minMargin, calculatedMargin)
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Format date range for display
 */
export function formatDateRange(from: string, to: string): string {
    const fromDate = new Date(from)
    const toDate = new Date(to)

    const fromMonth = fromDate.toLocaleDateString('en-US', { month: 'short' })
    const toMonth = toDate.toLocaleDateString('en-US', { month: 'short' })
    const fromYear = fromDate.getFullYear()
    const toYear = toDate.getFullYear()

    if (fromYear === toYear) {
        return `${fromMonth} - ${toMonth} ${toYear}`
    }
    return `${fromMonth} ${fromYear} - ${toMonth} ${toYear}`
}

/**
 * Get chart type display name
 */
export function getChartTypeName(type: string): string {
    const names: Record<string, string> = {
        bar: 'Bar Chart',
        line: 'Line Chart',
        area: 'Area Chart',
        pie: 'Pie Chart',
        doughnut: 'Doughnut Chart',
        scatter: 'Scatter Plot',
        radar: 'Radar Chart',
        polarArea: 'Polar Area Chart',
    }
    return names[type] || type
}

// ============================================================================
// CHART DATA TRANSFORMATIONS
// ============================================================================

export interface ChartDataset {
    label: string
    data: number[]
    backgroundColor?: string
    borderColor?: string
    fill?: boolean
}

export interface ChartData {
    labels: string[]
    datasets: ChartDataset[]
}

/**
 * Transform chart config data to Recharts format
 */
export function transformToRechartsData(
    labels: string[],
    datasets: ChartDataset[]
): Record<string, unknown>[] {
    return labels.map((label, index) => {
        const point: Record<string, unknown> = { name: label }
        datasets.forEach(dataset => {
            point[dataset.label] = dataset.data[index]
        })
        return point
    })
}

/**
 * Get color for dataset index from palette
 */
export function getDatasetColor(
    index: number,
    palette: ColorPalette = 'vibrant',
    customColor?: string
): string {
    if (customColor) return customColor
    const colors = colorPalettes[palette]
    return colors[index % colors.length]
}
