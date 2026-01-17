import { useAtom } from 'jotai'
import { IconX, IconDownload, IconEdit, IconMaximize } from '@tabler/icons-react'
import { selectedArtifactAtom, artifactPanelOpenAtom } from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { UniverSpreadsheet } from '@/features/univer/univer-spreadsheet'

export function ArtifactPanel() {
    const [artifact, setArtifact] = useAtom(selectedArtifactAtom)
    const [, setPanelOpen] = useAtom(artifactPanelOpenAtom)

    const handleClose = () => {
        setArtifact(null)
        setPanelOpen(false)
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
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <IconEdit size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <IconDownload size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <IconMaximize size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
                        <IconX size={16} />
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {artifact.type === 'spreadsheet' ? (
                    <UniverSpreadsheet
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
