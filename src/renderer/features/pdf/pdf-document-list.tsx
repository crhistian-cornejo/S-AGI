import { memo, useMemo, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconFileTypePdf,
    IconLoader2,
    IconAlertCircle,
    IconCheck,
    IconClock,
    IconCloudUpload,
    IconFolder,
    IconPlus,
    IconX,
    IconCloud
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    selectedPdfAtom,
    pdfCurrentPageAtom,
    localPdfsAtom,
    addLocalPdfAtom,
    removeLocalPdfAtom,
    createPdfSourceFromLocalFile,
    type PdfSource
} from '@/lib/atoms'
import { selectedChatIdAtom } from '@/lib/atoms'
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarGroupAction,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { cn, isElectron } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface PdfDocumentListProps {
    className?: string
    onSelect?: (pdf: PdfSource) => void
}

/**
 * Sidebar component showing all available PDFs
 * Groups by source type:
 * - Cloud PDFs (artifacts + chat_files from Supabase)
 * - Local PDFs (session-only, from filesystem)
 */
export const PdfDocumentList = memo(function PdfDocumentList({
    className,
    onSelect
}: PdfDocumentListProps) {
    const [selectedPdf, setSelectedPdf] = useAtom(selectedPdfAtom)
    const [, setCurrentPage] = useAtom(pdfCurrentPageAtom)
    const selectedChatId = useAtomValue(selectedChatIdAtom)
    const localPdfs = useAtomValue(localPdfsAtom)
    const addLocalPdf = useSetAtom(addLocalPdfAtom)
    const removeLocalPdf = useSetAtom(removeLocalPdfAtom)

    // Fetch all PDFs from cloud
    const { data, isLoading, error } = trpc.pdf.listAll.useQuery({
        chatId: selectedChatId || undefined,
        limit: 50
    })

    // Group cloud PDFs by source type
    const { artifactPdfs, chatFilePdfs } = useMemo(() => {
        if (!data?.pdfs) return { artifactPdfs: [], chatFilePdfs: [] }

        return {
            artifactPdfs: data.pdfs.filter(p => p.type === 'artifact'),
            chatFilePdfs: data.pdfs.filter(p => p.type === 'chat_file')
        }
    }, [data?.pdfs])

    const handleSelect = (pdf: PdfSource) => {
        setSelectedPdf(pdf)
        setCurrentPage(1)
        onSelect?.(pdf)
    }

    // Handle local PDF upload via file picker
    const handleAddLocalPdf = useCallback(async () => {
        if (!isElectron()) return

        try {
            // Use dedicated PDF picker (view only, no import)
            const result = await window.desktopApi?.pdf.pickLocal()

            if (result?.files && result.files.length > 0) {
                for (const file of result.files) {
                    const pdfSource = createPdfSourceFromLocalFile({
                        path: file.path,
                        name: file.name,
                        size: file.size
                    })
                    addLocalPdf(pdfSource)
                }
            }
        } catch (err) {
            console.error('Error picking local PDF:', err)
        }
    }, [addLocalPdf])

    // Handle removing a local PDF
    const handleRemoveLocalPdf = useCallback((e: React.MouseEvent, pdfId: string) => {
        e.stopPropagation()
        removeLocalPdf(pdfId)
        // If the removed PDF was selected, clear selection
        if (selectedPdf?.id === pdfId) {
            setSelectedPdf(null)
        }
    }, [removeLocalPdf, selectedPdf?.id, setSelectedPdf])

    const getProcessingIcon = (status?: string) => {
        switch (status) {
            case 'completed':
                return <IconCheck size={12} className="text-green-500" />
            case 'processing':
                return <IconLoader2 size={12} className="text-blue-500 animate-spin" />
            case 'failed':
                return <IconAlertCircle size={12} className="text-destructive" />
            case 'pending':
                return <IconClock size={12} className="text-muted-foreground" />
            default:
                return null
        }
    }

    const formatFileSize = (bytes?: number) => {
        if (!bytes) return ''
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    if (isLoading) {
        return (
            <div className={cn("flex items-center justify-center py-8", className)}>
                <IconLoader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error) {
        return (
            <div className={cn("flex flex-col items-center justify-center py-8 px-4 text-center", className)}>
                <IconAlertCircle size={24} className="text-destructive mb-2" />
                <p className="text-sm text-muted-foreground">Error loading PDFs</p>
            </div>
        )
    }

    const cloudPdfCount = (artifactPdfs.length || 0) + (chatFilePdfs.length || 0)
    const totalPdfs = cloudPdfCount + localPdfs.length

    if (totalPdfs === 0 && !isElectron()) {
        return (
            <div className={cn("flex flex-col items-center justify-center py-8 px-4 text-center", className)}>
                <IconFileTypePdf size={32} className="text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No PDFs found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                    Upload PDFs to your chats to see them here
                </p>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col gap-4 py-2", className)}>
            {/* Local PDFs Section - Session Only */}
            {isElectron() && (
                <SidebarGroup>
                    <SidebarGroupLabel>Local PDFs</SidebarGroupLabel>
                    <SidebarGroupAction onClick={handleAddLocalPdf} title="Add local PDF">
                        <IconPlus />
                    </SidebarGroupAction>
                    <SidebarGroupContent>
                        {localPdfs.length > 0 ? (
                            <SidebarMenu>
                                {localPdfs.map((pdf) => (
                                    <PdfListItem
                                        key={pdf.id}
                                        pdf={pdf}
                                        isSelected={selectedPdf?.id === pdf.id}
                                        onClick={() => handleSelect(pdf)}
                                        isLocal
                                        onRemove={(e) => handleRemoveLocalPdf(e, pdf.id)}
                                        fileSize={formatFileSize(pdf.metadata?.fileSize)}
                                    />
                                ))}
                            </SidebarMenu>
                        ) : (
                            <div className="px-2 py-3 text-center">
                                <p className="text-[11px] text-muted-foreground/70">
                                    Add PDFs for quick viewing
                                </p>
                                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                                    Session only • No upload
                                </p>
                            </div>
                        )}
                    </SidebarGroupContent>
                </SidebarGroup>
            )}

            {/* Separator between local and cloud */}
            {isElectron() && cloudPdfCount > 0 && (
                <Separator className="mx-2 w-auto opacity-50" />
            )}

            {/* Cloud PDFs Section */}
            {cloudPdfCount > 0 && (
                <SidebarGroup>
                    <SidebarGroupLabel>Cloud PDFs</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {/* Generated PDFs (Artifacts) */}
                            {artifactPdfs.map((pdf) => (
                                <PdfListItem
                                    key={pdf.id}
                                    pdf={pdf}
                                    isSelected={selectedPdf?.id === pdf.id}
                                    onClick={() => handleSelect(pdf)}
                                />
                            ))}

                            {/* Knowledge Documents (Chat Files) */}
                            {chatFilePdfs.map((pdf) => (
                                <PdfListItem
                                    key={pdf.id}
                                    pdf={pdf}
                                    isSelected={selectedPdf?.id === pdf.id}
                                    onClick={() => handleSelect(pdf)}
                                    processingIcon={getProcessingIcon(pdf.metadata?.processingStatus)}
                                    fileSize={formatFileSize(pdf.metadata?.fileSize)}
                                />
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            )}

            {/* Empty state when no cloud PDFs but local exists */}
            {cloudPdfCount === 0 && localPdfs.length > 0 && (
                <div className="px-2 py-4 text-center">
                    <IconCloudUpload size={20} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground/50">
                        No cloud PDFs yet
                    </p>
                </div>
            )}
        </div>
    )
})

interface PdfListItemProps {
    pdf: PdfSource
    isSelected: boolean
    onClick: () => void
    processingIcon?: React.ReactNode
    fileSize?: string
    /** Whether this is a local (session-only) PDF */
    isLocal?: boolean
    /** Callback to remove local PDF */
    onRemove?: (e: React.MouseEvent) => void
}

const PdfListItem = memo(function PdfListItem({
    pdf,
    isSelected,
    onClick,
    processingIcon,
    fileSize,
    isLocal,
    onRemove
}: PdfListItemProps) {
    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                isActive={isSelected}
                onClick={onClick}
                tooltip={pdf.name}
                className="h-auto py-2 pr-8"
            >
                <IconFileTypePdf
                    size={18}
                    className={cn(
                        "shrink-0",
                        isLocal
                            ? isSelected ? "text-amber-500" : "text-amber-400/70"
                            : isSelected ? "text-red-500" : "text-red-400/70"
                    )}
                />
                <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate leading-tight">{pdf.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        {isLocal && (
                            <span className="text-amber-500/70">Local</span>
                        )}
                        {pdf.pageCount && (
                            <span>{pdf.pageCount} p</span>
                        )}
                        {fileSize && (
                            <span>{fileSize}</span>
                        )}
                        {processingIcon}
                    </div>
                </div>
            </SidebarMenuButton>
            {isLocal && onRemove && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1.5 h-6 w-6 opacity-0 group-hover/menu-item:opacity-100 transition-opacity z-10 hover:bg-destructive/10 hover:text-destructive"
                    onClick={onRemove}
                >
                    <IconX size={14} />
                </Button>
            )}
        </SidebarMenuItem>
    )
})
