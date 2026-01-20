import { useRef } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { IconX, IconDownload, IconMaximize, IconFileText, IconUpload, IconFileSpreadsheet } from '@tabler/icons-react'
import { selectedArtifactAtom, artifactPanelOpenAtom, activeTabAtom } from '@/lib/atoms'
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

export function ArtifactPanel() {
    const [artifact, setArtifact] = useAtom(selectedArtifactAtom)
    const [, setPanelOpen] = useAtom(artifactPanelOpenAtom)
    const setActiveTab = useSetAtom(activeTabAtom)
    const spreadsheetRef = useRef<UniverSpreadsheetRef>(null)
    const documentRef = useRef<UniverDocumentRef>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Mutation to create new artifact from imported Excel
    const createArtifact = trpc.artifacts.create.useMutation()
    const utils = trpc.useUtils()

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

    if (!artifact) return null

    const isSpreadsheet = artifact.type === 'spreadsheet'
    const isDocument = artifact.type === 'document'

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
                    <span className="font-medium truncate">{artifact.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{artifact.type}</span>
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

                    {/* Export dropdown - only for spreadsheets */}
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
                    ) : (
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
                            <TooltipContent>Save & Download</TooltipContent>
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
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Unsupported artifact type: {artifact.type}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
