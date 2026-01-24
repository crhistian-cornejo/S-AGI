/**
 * Chart Tool Definitions
 * Schema definitions for interactive chart generation
 */

import { z } from 'zod'

export const CHART_TOOLS = {
    generate_chart: {
        description: 'Generate an interactive chart from data. Creates bar, line, pie, area, scatter, or doughnut charts. Returns a chart artifact that can be viewed in the gallery.',
        inputSchema: z.object({
            title: z.string().describe('Title of the chart'),
            type: z.enum(['bar', 'line', 'pie', 'area', 'scatter', 'doughnut', 'radar', 'polarArea']).describe('Type of chart to generate'),
            labels: z.array(z.string()).describe('Labels for the X axis or pie slices (e.g., ["Jan", "Feb", "Mar"])'),
            datasets: z.array(z.object({
                label: z.string().describe('Name of the data series'),
                data: z.array(z.number()).describe('Numeric values for this series'),
                backgroundColor: z.string().optional().describe('Background color (CSS color or rgba)'),
                borderColor: z.string().optional().describe('Border color (CSS color or rgba)')
            })).describe('Data series to plot. Each dataset is a line/bar group.'),
            options: z.union([
                z.object({
                    showLegend: z.boolean().optional().describe('Show chart legend. Default: true'),
                    showGrid: z.boolean().optional().describe('Show grid lines. Default: true'),
                    stacked: z.boolean().optional().describe('Stack bars/areas. Default: false'),
                    aspectRatio: z.number().optional().describe('Width/height ratio. Default: 2'),
                    xAxisTitle: z.string().optional().describe('Title for X axis'),
                    yAxisTitle: z.string().optional().describe('Title for Y axis')
                }),
                z.string()
            ]).optional().describe('Chart display options')
        })
    }
} as const

export type ChartToolName = keyof typeof CHART_TOOLS
