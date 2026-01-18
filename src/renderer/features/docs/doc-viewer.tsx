import { useAtomValue } from 'jotai'
import { selectedArtifactAtom } from '@/lib/atoms'
import { UniverDocument } from '@/features/univer/univer-document'

export function DocViewer() {
    const selectedArtifact = useAtomValue(selectedArtifactAtom)

    // Check if selected artifact is a document type
    const isDocument = selectedArtifact && selectedArtifact.type === 'document'

    return (
        <UniverDocument
            artifactId={isDocument ? selectedArtifact.id : undefined}
            data={isDocument ? selectedArtifact.univer_data : undefined}
        />
    )
}
