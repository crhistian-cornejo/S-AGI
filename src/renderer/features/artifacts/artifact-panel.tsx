import { useRef } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { IconX, IconDownload, IconMaximize, IconFileText } from '@tabler/icons-react'
import { selectedArtifactAtom, artifactPanelOpenAtom, activeTabAtom } from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UniverSpreadsheet, type UniverSpreadsheetRef } from '@/features/univer/univer-spreadsheet'
import { UniverDocument, type UniverDocumentRef } from '@/features/univer/univer-document'

export function ArtifactPanel() {
    const [artifact, setArtifact] = useAtom(selectedArtifactAtom)
    const [, setPanelOpen] = useAtom(artifactPanelOpenAtom)
    const setActiveTab = useSetAtom(activeTabAtom)
    const spreadsheetRef = useRef<UniverSpreadsheetRef>(null)
    const documentRef = useRef<UniverDocumentRef>(null)

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

    if (!artifact) return null

    const isSpreadsheet = artifact.type === 'spreadsheet'
    const isDocument = artifact.type === 'document'

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2 min-w-0">
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

