import { useCallback } from 'react'
import { useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { selectedArtifactAtom } from '@/lib/atoms'
import { UniverDocument } from '@/features/univer/univer-document'
import { PdfViewer } from '@/components/pdf-viewer/PdfViewer'

export function DocViewer() {
    const selectedArtifact = useAtomValue(selectedArtifactAtom)

    // Check artifact types
    const isDocument = selectedArtifact && selectedArtifact.type === 'document'
    const isPdf = selectedArtifact && selectedArtifact.type === 'pdf'

    // Handle PDF download
    const handleDownloadPdf = useCallback(() => {
        if (!selectedArtifact?.pdf_url) return
        const link = document.createElement('a')
        link.href = selectedArtifact.pdf_url
        link.download = `${selectedArtifact.name}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success('PDF downloaded')
    }, [selectedArtifact])

    // Render PDF viewer for PDF artifacts
    if (isPdf && selectedArtifact?.pdf_url) {
        return (
            <PdfViewer
                url={selectedArtifact.pdf_url}
                className="w-full h-full"
                onDownload={handleDownloadPdf}
            />
        )
    }

    // Render Univer document for document artifacts
    return (
        <UniverDocument
            artifactId={isDocument ? selectedArtifact.id : undefined}
            data={isDocument ? selectedArtifact.univer_data : undefined}
        />
    )
}
