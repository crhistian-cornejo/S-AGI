/**
 * Charts module exports
 * Midday-inspired chart system for S-AGI
 */

// Main chart viewer
export { ChartViewer, CHART_TYPE_MAP, CHART_COLORS, COLOR_PALETTES, CHART_CONFIG, type ChartViewerRef } from './chart-viewer'

// Chart export utilities
export {
    exportToPng,
    exportToPdf,
    copyChartToClipboard,
    getChartAsDataUrl,
    type ExportPngOptions,
    type ExportPdfOptions,
    type CopyToClipboardOptions,
} from './chart-export'

// Base chart components
export {
    BaseChart,
    StyledXAxis,
    StyledYAxis,
    StyledTooltip,
    StyledArea,
    StyledLine,
    StyledBar,
    ChartLegend,
    ZeroReferenceLine,
    ChartTooltip,
    type LegendItem,
} from './base-charts'

// Chart utilities
export {
    commonChartConfig,
    chartColors,
    colorPalettes,
    formatCompactNumber,
    createCompactTickFormatter,
    formatCurrency,
    createCurrencyTickFormatter,
    formatPercentage,
    getZeroInclusiveDomain,
    calculateYAxisDomain,
    calculateLeftMargin,
    formatDateRange,
    getChartTypeName,
    transformToRechartsData,
    getDatasetColor,
    type ColorPalette,
    type ChartDataset,
    type ChartData,
} from './chart-utils'

// Chart stack/gallery
export {
    ChartStack,
    ChartTabs,
    ChartThumbnail,
} from './chart-stack'
