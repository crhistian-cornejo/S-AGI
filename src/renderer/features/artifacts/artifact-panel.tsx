import { useRef } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { IconX, IconDownload, IconExternalLink } from '@tabler/icons-react'
import { selectedArtifactAtom, artifactPanelOpenAtom, appViewModeAtom } from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UniverSpreadsheet, type UniverSpreadsheetRef } from '@/features/univer/univer-spreadsheet'

export function ArtifactPanel() {
    const [artifact, setArtifact] = useAtom(selectedArtifactAtom)
    const [, setPanelOpen] = useAtom(artifactPanelOpenAtom)
    const setAppMode = useSetAtom(appViewModeAtom)
    const spreadsheetRef = useRef<UniverSpreadsheetRef>(null)

    const handleClose = () => {
        setArtifact(null)
        setPanelOpen(false)
    }

    const handleSave = async () => {
        if (spreadsheetRef.current) {
            await spreadsheetRef.current.save()
        }
    }

    if (!artifact) return null

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{artifact.name}</span>
                    <span className="text-xs text-muted-foreground">{artifact.type}</span>
                </div>

                <div className="flex items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setAppMode('native')}
                            >
                                <IconExternalLink size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open in Native Tab</TooltipContent>
                    </Tooltip>

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
                {artifact.type === 'spreadsheet' ? (
                    <UniverSpreadsheet
                        ref={spreadsheetRef}
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
