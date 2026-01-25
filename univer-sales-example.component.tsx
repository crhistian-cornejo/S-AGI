/**
 * Example React Component: Professional Sales Table with Univer
 *
 * This component demonstrates how to integrate the sales table example
 * into your React application using the Univer spreadsheet component.
 *
 * Features demonstrated:
 * - Loading and displaying the sales table
 * - Handling save operations
 * - Error states
 * - Loading indicators
 * - Integration with the UniverSpreadsheet component
 */

import React from 'react'
import { UniverSpreadsheet, UniverSpreadsheetRef } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from './univer-sales-table-example'

interface SalesTableExampleProps {
    /**
     * Optional artifact ID for persistence
     * If provided, the spreadsheet will auto-save to the database
     */
    artifactId?: string

    /**
     * Optional callback when the table is ready
     */
    onReady?: () => void

    /**
     * Optional callback on save
     */
    onSave?: () => void

    /**
     * Optional title to display above the table
     */
    title?: string

    /**
     * Show export button
     */
    showExportButton?: boolean
}

/**
 * Sales Table Example Component
 *
 * A professional sales data table built with Univer Spreadsheet.
 * Includes 10 products with calculations and professional styling.
 *
 * Example usage:
 * ```tsx
 * <SalesTableExample
 *     artifactId="sales-report-2024"
 *     title="Q1 2024 Sales Report"
 *     showExportButton={true}
 *     onSave={() => console.log('Saved!')}
 * />
 * ```
 */
export const SalesTableExample = React.forwardRef<
    HTMLDivElement,
    SalesTableExampleProps
>(
    (
        {
            artifactId = 'sales-table-example',
            onReady,
            onSave,
            title = 'Sales Report - Product Inventory',
            showExportButton = true,
        },
        ref
    ) => {
        const spreadsheetRef = React.useRef<UniverSpreadsheetRef>(null)
        const [isSaving, setIsSaving] = React.useState(false)
        const [saveMessage, setSaveMessage] = React.useState<string | null>(null)
        const [saveError, setSaveError] = React.useState<string | null>(null)

        // Load the sales table data
        const salesData = React.useMemo(() => getSalesTableData(), [])

        // Handle save operation
        const handleSave = React.useCallback(async () => {
            if (!spreadsheetRef.current) return

            try {
                setIsSaving(true)
                setSaveError(null)
                setSaveMessage(null)

                // Save the spreadsheet
                await spreadsheetRef.current.save()

                // Show success message
                setSaveMessage('Spreadsheet saved successfully!')
                setTimeout(() => setSaveMessage(null), 3000)

                // Call optional callback
                onSave?.()
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to save'
                setSaveError(errorMessage)
                console.error('Save error:', err)
            } finally {
                setIsSaving(false)
            }
        }, [onSave])

        // Handle export to Excel/CSV (if needed)
        const handleExport = React.useCallback(() => {
            if (!spreadsheetRef.current) return

            try {
                const snapshot = spreadsheetRef.current.getSnapshot()
                if (!snapshot) {
                    setSaveError('No data to export')
                    return
                }

                // Example: Convert to JSON for export
                // You can extend this to support CSV, Excel, etc.
                const dataStr = JSON.stringify(snapshot, null, 2)
                const dataBlob = new Blob([dataStr], { type: 'application/json' })
                const url = URL.createObjectURL(dataBlob)
                const link = document.createElement('a')
                link.href = url
                link.download = `sales-report-${new Date().toISOString().split('T')[0]}.json`
                link.click()
                URL.revokeObjectURL(url)

                setSaveMessage('Spreadsheet exported successfully!')
                setTimeout(() => setSaveMessage(null), 3000)
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to export'
                setSaveError(errorMessage)
                console.error('Export error:', err)
            }
        }, [])

        // Notify when ready
        React.useEffect(() => {
            onReady?.()
        }, [onReady])

        return (
            <div ref={ref} className="flex flex-col h-full w-full gap-4 p-4">
                {/* Header Section */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                        <p className="text-sm text-gray-600 mt-1">
                            Professional sales data with calculations and formatting
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        {showExportButton && (
                            <button
                                onClick={handleExport}
                                disabled={isSaving}
                                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                                title="Export spreadsheet as JSON"
                            >
                                Export
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            title="Save spreadsheet to database"
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>

                {/* Status Messages */}
                {saveMessage && (
                    <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                        {saveMessage}
                    </div>
                )}
                {saveError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                        Error: {saveError}
                    </div>
                )}

                {/* Spreadsheet Container */}
                <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <UniverSpreadsheet
                        ref={spreadsheetRef}
                        data={salesData}
                        artifactId={artifactId}
                    />
                </div>

                {/* Info Footer */}
                <div className="text-xs text-gray-500 space-y-1">
                    <p>
                        Table includes: 10 products, calculated totals with SUM formulas, professional styling with alternating row colors, and currency formatting.
                    </p>
                    <p>
                        Features: Dark blue header, light blue alternating rows, defined borders, optimized column widths, and automatic calculations.
                    </p>
                </div>
            </div>
        )
    }
)

SalesTableExample.displayName = 'SalesTableExample'

export default SalesTableExample

/**
 * Alternative: Hook-based component for different use cases
 *
 * Usage in a parent component:
 * ```tsx
 * function MyPage() {
 *   const { data, isLoading, error } = useSalesTable()
 *
 *   if (isLoading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error}</div>
 *
 *   return <UniverSpreadsheet data={data} />
 * }
 * ```
 */
export function useSalesTable() {
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<Error | null>(null)
    const [data, setData] = React.useState(null)

    React.useEffect(() => {
        try {
            setIsLoading(true)
            const salesData = getSalesTableData()
            setData(salesData)
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'))
        } finally {
            setIsLoading(false)
        }
    }, [])

    return { data, isLoading, error }
}
