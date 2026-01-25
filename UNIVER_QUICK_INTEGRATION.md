# Univer Sales Table - Quick Integration Guide

Copy-paste ready code snippets for rapid integration into your project.

## Integration Example 1: Basic React Component

```tsx
// pages/SalesReport.tsx
import React from 'react'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from '@/examples/univer-sales-table-example'

export default function SalesReportPage() {
    return (
        <div className="w-full h-screen flex flex-col">
            <h1 className="text-2xl font-bold p-4">Sales Report</h1>
            <div className="flex-1 border border-gray-200">
                <UniverSpreadsheet
                    data={getSalesTableData()}
                    artifactId="sales-report"
                />
            </div>
        </div>
    )
}
```

---

## Integration Example 2: With Save Button

```tsx
// components/SalesTableWithSave.tsx
import React, { useRef } from 'react'
import { UniverSpreadsheet, UniverSpreadsheetRef } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from '@/examples/univer-sales-table-example'

export function SalesTableWithSave() {
    const spreadsheetRef = useRef<UniverSpreadsheetRef>(null)
    const [isSaving, setIsSaving] = React.useState(false)

    const handleSave = async () => {
        try {
            setIsSaving(true)
            await spreadsheetRef.current?.save()
            alert('Saved successfully!')
        } catch (error) {
            alert('Save failed: ' + error)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex gap-2">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save'}
                </button>
            </div>
            <div className="flex-1 border border-gray-200 rounded">
                <UniverSpreadsheet
                    ref={spreadsheetRef}
                    data={getSalesTableData()}
                    artifactId="sales-table"
                />
            </div>
        </div>
    )
}
```

---

## Integration Example 3: Ready-Made Component

```tsx
// pages/SalesReport.tsx
import SalesTableExample from '@/examples/univer-sales-example.component'

export default function SalesReportPage() {
    return (
        <SalesTableExample
            artifactId="sales-2024-q1"
            title="Q1 2024 Sales Report"
            showExportButton={true}
            onSave={() => console.log('Report saved to database!')}
            onReady={() => console.log('Spreadsheet ready!')}
        />
    )
}
```

---

## Integration Example 4: API Data Integration

```tsx
// pages/SalesReportFromAPI.tsx
import React, { useEffect, useState } from 'react'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { createTableFromAPIData } from '@/examples/univer-advanced-examples'

export default function SalesReportFromAPI() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch from your API
                const response = await fetch('/api/sales')
                const apiData = await response.json()

                // Convert API data to Univer format
                const univerData = createTableFromAPIData(apiData)
                setData(univerData)
            } catch (error) {
                console.error('Failed to load data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    if (loading) return <div>Loading...</div>
    if (!data) return <div>Failed to load data</div>

    return (
        <div className="w-full h-screen">
            <UniverSpreadsheet data={data} artifactId="api-sales" />
        </div>
    )
}
```

---

## Integration Example 5: Multiple Report Types

```tsx
// pages/Reports.tsx
import React, { useState } from 'react'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { createReportTemplate, ReportType } from '@/examples/univer-advanced-examples'

export default function ReportsPage() {
    const [reportType, setReportType] = useState<ReportType>(ReportType.SALES)
    const reportData = React.useMemo(
        () => createReportTemplate(reportType),
        [reportType]
    )

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="p-4 bg-gray-100 rounded">
                <label className="font-semibold">Report Type: </label>
                <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as ReportType)}
                    className="ml-2 px-3 py-1 border rounded"
                >
                    <option value={ReportType.SALES}>Sales</option>
                    <option value={ReportType.INVENTORY}>Inventory</option>
                    <option value={ReportType.REVENUE}>Revenue</option>
                    <option value={ReportType.CUSTOMER}>Customer</option>
                </select>
            </div>
            <div className="flex-1 border border-gray-200 rounded">
                <UniverSpreadsheet data={reportData} />
            </div>
        </div>
    )
}
```

---

## Integration Example 6: Export Functionality

```tsx
// components/SalesTableWithExport.tsx
import React, { useRef } from 'react'
import { UniverSpreadsheet, UniverSpreadsheetRef } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from '@/examples/univer-sales-table-example'
import { convertToCSV } from '@/examples/univer-advanced-examples'

export function SalesTableWithExport() {
    const spreadsheetRef = useRef<UniverSpreadsheetRef>(null)

    const handleExportCSV = () => {
        const snapshot = spreadsheetRef.current?.getSnapshot()
        if (!snapshot) return

        const csv = convertToCSV(snapshot)
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `sales-${new Date().toISOString().split('T')[0]}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    const handleExportJSON = () => {
        const snapshot = spreadsheetRef.current?.getSnapshot()
        if (!snapshot) return

        const json = JSON.stringify(snapshot, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `sales-${new Date().toISOString().split('T')[0]}.json`
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex gap-2">
                <button
                    onClick={handleExportCSV}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                    Export CSV
                </button>
                <button
                    onClick={handleExportJSON}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Export JSON
                </button>
            </div>
            <div className="flex-1 border border-gray-200 rounded">
                <UniverSpreadsheet
                    ref={spreadsheetRef}
                    data={getSalesTableData()}
                />
            </div>
        </div>
    )
}
```

---

## Integration Example 7: Custom Styling

```tsx
// components/StyledSalesTable.tsx
import React from 'react'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from '@/examples/univer-sales-table-example'

export function StyledSalesTable() {
    const data = React.useMemo(() => {
        const baseData = getSalesTableData()

        // Customize colors
        // Find and update header background color
        const headerStyles = baseData.sheets.Ventas.styles
        Object.keys(headerStyles).forEach((key) => {
            if (key.includes('header')) {
                headerStyles[key].bg = { rgb: '#2d5016' } // Dark green
            }
        })

        return baseData
    }, [])

    return (
        <div className="w-full h-full rounded-lg overflow-hidden shadow-lg">
            <UniverSpreadsheet data={data} />
        </div>
    )
}
```

---

## Integration Example 8: Loading State

```tsx
// pages/SalesReportWithLoader.tsx
import React, { useEffect, useState } from 'react'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from '@/examples/univer-sales-table-example'

export default function SalesReportWithLoader() {
    const [isLoading, setIsLoading] = useState(true)
    const data = React.useMemo(() => {
        // Simulate data loading
        setTimeout(() => setIsLoading(false), 500)
        return getSalesTableData()
    }, [])

    return (
        <div className="relative w-full h-screen">
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                    <div className="text-center">
                        <div className="mb-2 w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
                        <p className="text-gray-600">Loading sales report...</p>
                    </div>
                </div>
            )}
            <UniverSpreadsheet data={data} artifactId="sales" />
        </div>
    )
}
```

---

## Integration Example 9: Hook Pattern

```tsx
// hooks/useSalesReport.ts
import { useEffect, useState } from 'react'
import { getSalesTableData } from '@/examples/univer-sales-table-example'

export function useSalesReport() {
    const [data, setData] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        try {
            setIsLoading(true)
            const salesData = getSalesTableData()
            setData(salesData)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }, [])

    return { data, isLoading, error }
}

// Usage in component:
// const { data, isLoading, error } = useSalesReport()
```

---

## Integration Example 10: Modal Dialog

```tsx
// components/SalesTableModal.tsx
import React, { useRef } from 'react'
import { UniverSpreadsheet, UniverSpreadsheetRef } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from '@/examples/univer-sales-table-example'

interface SalesTableModalProps {
    isOpen: boolean
    onClose: () => void
    onSave?: (data: any) => void
}

export function SalesTableModal({ isOpen, onClose, onSave }: SalesTableModalProps) {
    const spreadsheetRef = useRef<UniverSpreadsheetRef>(null)

    const handleSave = async () => {
        const snapshot = spreadsheetRef.current?.getSnapshot()
        if (snapshot && onSave) {
            onSave(snapshot)
        }
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-96 flex flex-col">
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">Sales Report</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        ✕
                    </button>
                </div>
                <div className="flex-1 overflow-hidden">
                    <UniverSpreadsheet
                        ref={spreadsheetRef}
                        data={getSalesTableData()}
                    />
                </div>
                <div className="p-4 border-t flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border rounded hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}
```

---

## Integration Example 11: TypeScript Type Safety

```tsx
// types/index.ts
import { SalesTableData } from '@/examples/univer-sales-table-example'

export interface SalesReport extends SalesTableData {
    createdAt: Date
    updatedAt: Date
    author: string
}

// usage.ts
import { SalesReport } from '@/types'

const report: SalesReport = {
    ...getSalesTableData(),
    createdAt: new Date(),
    updatedAt: new Date(),
    author: 'John Doe'
}
```

---

## Integration Example 12: Next.js Integration

```tsx
// app/sales/page.tsx
'use client'

import React from 'react'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'
import { getSalesTableData } from '@/examples/univer-sales-table-example'

export default function SalesPage() {
    const [isMounted, setIsMounted] = React.useState(false)

    React.useEffect(() => {
        setIsMounted(true)
    }, [])

    if (!isMounted) return <div>Loading...</div>

    return (
        <main className="flex flex-col gap-4 p-4 h-screen">
            <h1 className="text-3xl font-bold">Sales Dashboard</h1>
            <div className="flex-1 border border-gray-200 rounded">
                <UniverSpreadsheet
                    data={getSalesTableData()}
                    artifactId="sales-dashboard"
                />
            </div>
        </main>
    )
}
```

---

## File Copy Quick Reference

### Minimal Setup (Basic Table Only)
```bash
cp univer-sales-table-example.ts src/examples/
# Use: import { getSalesTableData } from '@/examples/univer-sales-table-example'
```

### Standard Setup (With Component)
```bash
cp univer-sales-table-example.ts src/examples/
cp univer-sales-example.component.tsx src/components/
# Use: import SalesTableExample from '@/components/univer-sales-example.component'
```

### Full Featured Setup (All Tools)
```bash
cp univer-sales-table-example.ts src/examples/
cp univer-sales-example.component.tsx src/components/
cp univer-advanced-examples.ts src/examples/utilities/
# Use all imports as needed
```

---

## Common Patterns

### Load and Display
```typescript
const data = getSalesTableData()
return <UniverSpreadsheet data={data} />
```

### With Persistence
```typescript
<UniverSpreadsheet
    data={getSalesTableData()}
    artifactId="sales-table"  // Auto-saves to DB
/>
```

### With Custom Title
```typescript
<SalesTableExample
    title="Q1 2024 Sales Analysis"
    showExportButton={true}
/>
```

### Transform Data
```typescript
const data = getSalesTableData()
const transformed = addSummaryStatistics(data)
return <UniverSpreadsheet data={transformed} />
```

---

## Troubleshooting Quick Fixes

### Issue: Component not rendering
**Fix**: Ensure `isMounted` check in useEffect for SSR apps

### Issue: Styles not applying
**Fix**: Verify style IDs match cell references in cellData

### Issue: Formulas not calculating
**Fix**: Check UniverSheetsFormulaPlugin is registered

### Issue: Save not working
**Fix**: Ensure `artifactId` is provided as prop

---

**Remember**: All files are located in `/Users/corx/Developer/Electron/S-AGI/`

Start with the simplest example and gradually add features as needed!
