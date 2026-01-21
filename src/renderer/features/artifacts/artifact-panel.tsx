import { useRef, lazy, Suspense, useMemo } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { IconX, IconDownload, IconMaximize, IconFileText, IconUpload, IconFileSpreadsheet, IconChartBar, IconPhoto, IconFileTypePdf, IconCopy } from '@tabler/icons-react'
import { toast } from 'sonner'
import { selectedArtifactAtom, artifactPanelOpenAtom, activeTabAtom, selectedChatIdAtom } from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UniverSpreadsheet, type UniverSpreadsheetRef } from '@/features/univer/univer-spreadsheet'
import { UniverDocument, type UniverDocumentRef } from '@/features/univer/univer-document'
import { exportToExcel, importFromExcel } from '@/features/univer/excel-exchange'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import type { ChartViewerRef } from '@/features/charts/chart-viewer'

// Lazy load ChartViewer to avoid loading Recharts until needed
const ChartViewer = lazy(() => import('@/features/charts/chart-viewer').then(m => ({ default: m.ChartViewer })))

// ============================================================================
// CHART TABS COMPONENT - Shows all charts for current chat
// ============================================================================

interface ChartTabsProps {
    chatId: string
    selectedChartId: string | null
    onChartSelect: (chartId: string) => void
}

function ChartTabs({ chatId, selectedChartId, onChartSelect }: ChartTabsProps) {
    const { data: artifacts } = trpc.artifacts.list.useQuery({ chatId })

    const charts = useMemo(() =>
        (artifacts || []).filter(a => a.type === 'chart'),
        [artifacts]
    )

    if (charts.length <= 1) return null

    return (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border overflow-x-auto scrollbar-none">
            {charts.map((chart) => {
                const isSelected = chart.id === selectedChartId

                return (
                    <button
                        key={chart.id}
                        className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                            isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                        onClick={() => onChartSelect(chart.id)}
                    >
                        <IconChartBar size={12} />
                        <span className="max-w-[80px] truncate">{chart.name}</span>
                    </button>
                )
            })}
        </div>
    )
}

// ============================================================================
// MAIN ARTIFACT PANEL
// ============================================================================

export function ArtifactPanel() {
    const [artifact, setArtifact] = useAtom(selectedArtifactAtom)
    const [, setPanelOpen] = useAtom(artifactPanelOpenAtom)
    const [chatId] = useAtom(selectedChatIdAtom)
    const setActiveTab = useSetAtom(activeTabAtom)
    const spreadsheetRef = useRef<UniverSpreadsheetRef>(null)
    const documentRef = useRef<UniverDocumentRef>(null)
    const chartViewerRef = useRef<ChartViewerRef>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Mutation to create new artifact from imported Excel
    const createArtifact = trpc.artifacts.create.useMutation()
    const utils = trpc.useUtils()

    // Get all artifacts for current chat to enable chart tabs
    const { data: allArtifacts } = trpc.artifacts.list.useQuery(
        { chatId: chatId || '' },
        { enabled: !!chatId }
    )

    const handleClose = () => {
        setArtifact(null)
        setPanelOpen(false)
    }

    const handleOpenInTab = () => {
        // Switch to Excel tab - artifact is already selected
        setActiveTab('excel')
        setPanelOpen(false)
    }

    const handleSave = async () => {
        if (artifact?.type === 'spreadsheet' && spreadsheetRef.current) {
            await spreadsheetRef.current.save()
        } else if (artifact?.type === 'document' && documentRef.current) {
            await documentRef.current.save()
        }
    }

    const handleExportExcel = async () => {
        if (!artifact || artifact.type !== 'spreadsheet') return

        // Get current snapshot from spreadsheet
        const snapshot = spreadsheetRef.current?.getSnapshot()
        const dataToExport = snapshot || artifact.univer_data

        if (!dataToExport) {
            console.error('No data available to export')
            return
        }

        try {
            await exportToExcel(dataToExport, `${artifact.name}.xlsx`)
        } catch (err) {
            console.error('Failed to export to Excel:', err)
        }
    }

    const handleImportClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !artifact) return

        try {
            // Import Excel file to Univer format
            const univerData = await importFromExcel(file)

            // Create new artifact with imported data (using same chat as current artifact)
            const newArtifact = await createArtifact.mutateAsync({
                chatId: artifact.chat_id,
                name: univerData.name || file.name.replace(/\.xlsx?$/i, ''),
                type: 'spreadsheet',
                univerData: univerData as unknown as Record<string, unknown>,
            })

            // Invalidate artifacts list and select the new artifact
            await utils.artifacts.list.invalidate()
            setArtifact(newArtifact)

            console.log('Excel file imported successfully:', newArtifact.id)
        } catch (err) {
            console.error('Failed to import Excel file:', err)
        } finally {
            // Reset file input so the same file can be selected again
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    // Handle chart tab selection
    const handleChartSelect = async (chartId: string) => {
        const chart = allArtifacts?.find(a => a.id === chartId)
        if (chart) {
            setArtifact(chart)
        }
    }

    // Chart export handlers
    const handleExportChartPng = async () => {
        if (!chartViewerRef.current || !artifact) return
        try {
            await chartViewerRef.current.exportToPng(artifact.name)
            toast.success('Chart exported as PNG')
        } catch (err) {
            console.error('Failed to export chart as PNG:', err)
            toast.error('Failed to export chart')
        }
    }

    const handleExportChartPdf = async () => {
        if (!chartViewerRef.current || !artifact) return
        try {
            await chartViewerRef.current.exportToPdf(artifact.name, artifact.name)
            toast.success('Chart exported as PDF')
        } catch (err) {
            console.error('Failed to export chart as PDF:', err)
            toast.error('Failed to export chart')
        }
    }

    const handleCopyChartToClipboard = async () => {
        if (!chartViewerRef.current) return
        try {
            const success = await chartViewerRef.current.copyToClipboard()
            if (success) {
                toast.success('Chart copied to clipboard')
            } else {
                toast.error('Failed to copy chart')
            }
        } catch (err) {
            console.error('Failed to copy chart:', err)
            toast.error('Failed to copy chart')
        }
    }

    if (!artifact) return null

    const isSpreadsheet = artifact.type === 'spreadsheet'
    const isDocument = artifact.type === 'document'
    const isChart = artifact.type === 'chart'

    // Count charts in current chat
    const chartCount = allArtifacts?.filter(a => a.type === 'chart').length || 0

    return (
        <div className="flex flex-col h-full">
            {/* Hidden file input for Excel import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    {isSpreadsheet && <IconFileSpreadsheet size={16} className="text-muted-foreground shrink-0" />}
                    {isDocument && <IconFileText size={16} className="text-muted-foreground shrink-0" />}
                    {isChart && <IconChartBar size={16} className="text-muted-foreground shrink-0" />}
                    <span className="font-medium truncate">{artifact.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{artifact.type}</span>
                    {isChart && chartCount > 1 && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            {chartCount} charts
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {(isSpreadsheet || isDocument) && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={handleOpenInTab}
                                >
                                    <IconMaximize size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open in Full Screen</TooltipContent>
                        </Tooltip>
                    )}

                    {/* Import button - only for spreadsheets */}
                    {isSpreadsheet && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={handleImportClick}
                                >
                                    <IconUpload size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Import Excel File</TooltipContent>
                        </Tooltip>
                    )}

                    {/* Export dropdown - for spreadsheets and charts */}
                    {isSpreadsheet ? (
                        <DropdownMenu>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <IconDownload size={16} />
                                        </Button>
                                    </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Export Options</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={handleExportExcel}>
                                    <IconFileSpreadsheet size={16} className="mr-2" />
                                    Export as Excel (.xlsx)
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleSave}>
                                    <IconDownload size={16} className="mr-2" />
                                    Save to Cloud
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : isChart ? (
                        <DropdownMenu>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <IconDownload size={16} />
                                        </Button>
                                    </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Export Options</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={handleExportChartPng}>
                                    <IconPhoto size={16} className="mr-2" />
                                    Export as PNG
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportChartPdf}>
                                    <IconFileTypePdf size={16} className="mr-2" />
                                    Export as PDF
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleCopyChartToClipboard}>
                                    <IconCopy size={16} className="mr-2" />
                                    Copy to Clipboard
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : isDocument && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={handleSave}
                                >
                                    <IconDownload size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save</TooltipContent>
                        </Tooltip>
                    )}

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
                                <IconX size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Close Panel</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Chart Tabs - Only show when viewing a chart and there are multiple charts */}
            {isChart && chatId && chartCount > 1 && (
                <ChartTabs
                    chatId={chatId}
                    selectedChartId={artifact.id}
                    onChartSelect={handleChartSelect}
                />
            )}

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {isSpreadsheet ? (
                    <UniverSpreadsheet
                        ref={spreadsheetRef}
                        artifactId={artifact.id}
                        data={artifact.univer_data}
                    />
                ) : isDocument ? (
                    <UniverDocument
                        ref={documentRef}
                        artifactId={artifact.id}
                        data={artifact.univer_data}
                    />
                ) : isChart && artifact.content ? (
                    <Suspense fallback={
                        <div className="flex items-center justify-center h-full">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                <span className="text-sm text-muted-foreground">Loading chart...</span>
                            </div>
                        </div>
                    }>
                        <ChartViewer
                            ref={chartViewerRef}
                            artifactId={artifact.id}
                            config={artifact.content as any}
                            className="p-4"
                        />
                    </Suspense>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Unsupported artifact type: {artifact.type}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
