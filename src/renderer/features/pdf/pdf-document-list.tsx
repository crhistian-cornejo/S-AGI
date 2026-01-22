import { memo, useMemo, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconFileTypePdf,
    IconLoader2,
    IconAlertCircle,
    IconCheck,
    IconClock,
    IconCloudUpload,
    IconPlus,
    IconX,
    IconCloudFilled,
    IconDeviceFloppy
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface PdfDocumentListProps {
    className?: string
    onSelect?: (pdf: PdfSource) => void
}

/**
 * Sidebar component showing all available PDFs
 * Groups by source type:
 * - Local PDFs (session-only, from filesystem)
 * - Cloud PDFs (artifacts + chat_files from Supabase)
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
            const api = window.desktopApi as { pdf?: { pickLocal: () => Promise<{ files: { path: string; name: string; size: number }[] }> } }
            const result = await api?.pdf?.pickLocal()

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
                return (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span><IconCheck size={12} className="text-emerald-500" /></span>
                        </TooltipTrigger>
                        <TooltipContent side="right">Processed</TooltipContent>
                    </Tooltip>
                )
            case 'processing':
                return (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span><IconLoader2 size={12} className="text-blue-500 animate-spin" /></span>
                        </TooltipTrigger>
                        <TooltipContent side="right">Processing...</TooltipContent>
                    </Tooltip>
                )
            case 'failed':
                return (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span><IconAlertCircle size={12} className="text-destructive" /></span>
                        </TooltipTrigger>
                        <TooltipContent side="right">Failed to process</TooltipContent>
                    </Tooltip>
                )
            case 'pending':
                return (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span><IconClock size={12} className="text-muted-foreground" /></span>
                        </TooltipTrigger>
                        <TooltipContent side="right">Pending</TooltipContent>
                    </Tooltip>
                )
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
            <div className={cn("flex items-center justify-center py-12", className)}>
                <div className="flex flex-col items-center gap-2">
                    <IconLoader2 size={20} className="animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Loading...</span>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
                <IconAlertCircle size={24} className="text-destructive mb-2" />
                <p className="text-sm text-muted-foreground">Failed to load documents</p>
            </div>
        )
    }

    const cloudPdfCount = (artifactPdfs.length || 0) + (chatFilePdfs.length || 0)
    const totalPdfs = cloudPdfCount + localPdfs.length

    if (totalPdfs === 0 && !isElectron()) {
        return (
            <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
                <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                    <IconFileTypePdf size={24} className="text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No documents</p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-[180px]">
                    Upload PDFs to your chats to see them here
                </p>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col gap-1 py-1", className)}>
            {/* Local PDFs Section - Session Only */}
            {isElectron() && (
                <SidebarGroup className="py-1.5">
                    <div className="flex items-center justify-between px-2 mb-1">
                        <SidebarGroupLabel className="flex items-center gap-1.5 h-6 px-0">
                            <IconDeviceFloppy size={12} className="text-amber-500" />
                            <span className="text-[11px] font-medium uppercase tracking-wide">Local</span>
                        </SidebarGroupLabel>
                        <SidebarGroupAction 
                            onClick={handleAddLocalPdf} 
                            title="Add local PDF"
                            className="relative right-0 top-0 h-5 w-5"
                        >
                            <IconPlus size={12} />
                        </SidebarGroupAction>
                    </div>
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
                            <div className="px-2 py-2.5 text-center rounded-lg bg-muted/30 mx-1">
                                <p className="text-[11px] text-muted-foreground/70">
                                    Quick view local PDFs
                                </p>
                                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                                    Session only
                                </p>
                            </div>
                        )}
                    </SidebarGroupContent>
                </SidebarGroup>
            )}

            {/* Separator between local and cloud */}
            {isElectron() && cloudPdfCount > 0 && (
                <Separator className="mx-3 w-auto opacity-30 my-1" />
            )}

            {/* Cloud PDFs Section */}
            {cloudPdfCount > 0 && (
                <SidebarGroup className="py-1.5">
                    <div className="flex items-center px-2 mb-1">
                        <SidebarGroupLabel className="flex items-center gap-1.5 h-6 px-0">
                            <IconCloudFilled size={12} className="text-blue-500" />
                            <span className="text-[11px] font-medium uppercase tracking-wide">Cloud</span>
                            <span className="text-[10px] text-muted-foreground ml-1">
                                {cloudPdfCount}
                            </span>
                        </SidebarGroupLabel>
                    </div>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {/* Generated PDFs (Artifacts) */}
                            {artifactPdfs.map((pdf) => (
                                <PdfListItem
                                    key={pdf.id}
                                    pdf={pdf as PdfSource}
                                    isSelected={selectedPdf?.id === pdf.id}
                                    onClick={() => handleSelect(pdf as PdfSource)}
                                    sourceType="artifact"
                                />
                            ))}

                            {/* Knowledge Documents (Chat Files) */}
                            {chatFilePdfs.map((pdf) => (
                                <PdfListItem
                                    key={pdf.id}
                                    pdf={pdf as PdfSource}
                                    isSelected={selectedPdf?.id === pdf.id}
                                    onClick={() => handleSelect(pdf as PdfSource)}
                                    sourceType="chat_file"
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
                <div className="px-3 py-4 text-center">
                    <IconCloudUpload size={18} className="text-muted-foreground/30 mx-auto mb-1.5" />
                    <p className="text-[11px] text-muted-foreground/50">
                        No cloud documents
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
    /** Source type for cloud PDFs */
    sourceType?: 'artifact' | 'chat_file'
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
    sourceType,
    onRemove
}: PdfListItemProps) {
    const iconColor = isLocal 
        ? "text-amber-500" 
        : sourceType === 'artifact' 
            ? "text-purple-500" 
            : "text-red-500"

    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                isActive={isSelected}
                onClick={onClick}
                tooltip={pdf.name}
                className={cn(
                    "h-auto py-2 pr-8 group/pdf-item transition-all",
                    isSelected && "bg-sidebar-accent"
                )}
            >
                <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                    isSelected 
                        ? "bg-background shadow-sm" 
                        : "bg-muted/50"
                )}>
                    <IconFileTypePdf
                        size={16}
                        className={cn(iconColor, !isSelected && "opacity-70")}
                    />
                </div>
                <div className="flex-1 min-w-0 text-left ml-0.5">
                    <p className={cn(
                        "text-sm truncate leading-tight",
                        isSelected ? "font-medium" : "font-normal"
                    )}>
                        {pdf.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                        {pdf.pageCount && (
                            <span>{pdf.pageCount} pages</span>
                        )}
                        {pdf.pageCount && fileSize && (
                            <span className="opacity-50">•</span>
                        )}
                        {fileSize && (
                            <span>{fileSize}</span>
                        )}
                        {processingIcon && (
                            <span className="ml-0.5">{processingIcon}</span>
                        )}
                    </div>
                </div>
            </SidebarMenuButton>
            {isLocal && onRemove && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover/menu-item:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive rounded-md"
                    onClick={onRemove}
                >
                    <IconX size={12} />
                </Button>
            )}
        </SidebarMenuItem>
    )
})
