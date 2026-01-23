import { useEffect, useCallback, memo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconFileTypePdf,
    IconLayoutSidebar,
    IconX,
    IconRefresh,
    IconChevronLeft,
    IconChevronRight
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    selectedPdfAtom,
    pdfSidebarOpenAtom,
    pdfNavigationRequestAtom,
    pdfCurrentPageAtom,
    selectedChatIdAtom,
    type PdfSource
} from '@/lib/atoms'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    useSidebar
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { PdfDocumentList } from './pdf-document-list'
import { PdfViewerEnhanced } from './pdf-viewer-enhanced'
import { PdfQueueProcessor } from './components/queue-processor'

/**
 * Main PDF Tab View Component
 *
 * Layout with collapsible sidebar:
 * - Container takes full height minus titlebar (48px)
 * - Sidebar collapses to icons, main content expands
 * - Clean border separation between sidebar and content
 */
export const PdfTabView = memo(function PdfTabView() {
    const [sidebarOpen, setSidebarOpen] = useAtom(pdfSidebarOpenAtom)

    return (
        <div className="h-[calc(100vh-48px)] flex overflow-hidden bg-background">
            {/* Global queue processor - runs for all PDFs */}
            <PdfQueueProcessor />

            <SidebarProvider
                defaultOpen={sidebarOpen}
                open={sidebarOpen}
                onOpenChange={setSidebarOpen}
            >
                <PdfSidebar />
                <main className="flex-1 flex flex-col overflow-hidden">
                    <PdfMainContent />
                </main>
            </SidebarProvider>
        </div>
    )
})

/**
 * PDF Sidebar Component
 * Shows list of PDFs grouped by source (local vs cloud)
 * Collapsible sidebar with smooth transitions
 */
const PdfSidebar = memo(function PdfSidebar() {
    const utils = trpc.useUtils()
    const { open, toggleSidebar } = useSidebar()

    const handleRefresh = useCallback(() => {
        utils.pdf.listAll.invalidate()
    }, [utils])

    // Count PDFs (all user's PDFs, not filtered by chat)
    const { data: pdfList } = trpc.pdf.listAll.useQuery({
        limit: 50
    })
    const pdfCount = pdfList?.pdfs?.length || 0

    return (
        <Sidebar collapsible="icon" className="border-r-0">
            <SidebarHeader className={cn(
                "border-b border-sidebar-border h-10 flex items-center",
                !open && "justify-center"
            )}>
                <div className={cn(
                    "flex items-center w-full transition-all duration-200",
                    open ? "justify-between px-2" : "justify-center px-0"
                )}>
                    {open ? (
                        <>
                            <div className="flex items-center gap-2">
                                <IconFileTypePdf size={16} className="text-red-500 shrink-0" />
                                <span className="text-sm font-semibold">Documents</span>
                                {pdfCount > 0 && (
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                                        {pdfCount}
                                    </span>
                                )}
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={handleRefresh}
                                    >
                                        <IconRefresh size={14} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">Refresh</TooltipContent>
                            </Tooltip>
                        </>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center justify-center">
                                    <IconFileTypePdf size={18} className="text-red-500" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">Documents</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </SidebarHeader>

            {/* Document list - only show when expanded */}
            {open && (
                <SidebarContent>
                    <SidebarGroup className="p-1">
                        <SidebarGroupContent>
                            <PdfDocumentList className="px-0" />
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>
            )}

            {/* Collapse/Expand toggle at bottom - always visible */}
            <div className={cn(
                "mt-auto border-t border-sidebar-border",
                open ? "p-2" : "p-1"
            )}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "w-full transition-all",
                                open ? "h-8 justify-start gap-2" : "h-8 w-8 justify-center p-0"
                            )}
                            onClick={toggleSidebar}
                        >
                            {open ? (
                                <>
                                    <IconChevronLeft size={16} />
                                    <span className="text-xs">Collapse</span>
                                </>
                            ) : (
                                <IconChevronRight size={16} />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        {open ? 'Collapse sidebar' : 'Expand sidebar'}
                    </TooltipContent>
                </Tooltip>
            </div>
        </Sidebar>
    )
})

/**
 * PDF Main Content Area
 * Contains the header bar and PDF viewer
 */
const PdfMainContent = memo(function PdfMainContent() {
    const [selectedPdf, setSelectedPdf] = useAtom(selectedPdfAtom)
    const [navigationRequest, setNavigationRequest] = useAtom(pdfNavigationRequestAtom)
    const setCurrentPage = useSetAtom(pdfCurrentPageAtom)
    const selectedChatId = useAtomValue(selectedChatIdAtom)
    const { toggleSidebar, open: sidebarOpen } = useSidebar()

    // Query for finding PDF by filename (for citation navigation)
    const findByFilename = trpc.pdf.findByFilename.useQuery(
        {
            filename: navigationRequest?.filename || '',
            chatId: navigationRequest?.chatId || selectedChatId || undefined
        },
        {
            enabled: !!navigationRequest?.filename
        }
    )

    // Query for signed URL when we have a chat_file
    const signedUrl = trpc.pdf.getSignedUrl.useQuery(
        { fileId: selectedPdf?.id || '' },
        {
            enabled: !!selectedPdf && selectedPdf.type === 'chat_file' && !selectedPdf.url
        }
    )

    // Handle navigation request (from citation clicks)
    useEffect(() => {
        if (!navigationRequest) return

        if (findByFilename.data?.found) {
            const pdfData = findByFilename.data as PdfSource & { found: boolean }
            setSelectedPdf({
                type: pdfData.type,
                id: pdfData.id,
                name: pdfData.name,
                url: pdfData.url,
                chatId: pdfData.chatId,
                pageCount: pdfData.pageCount,
                pages: pdfData.pages
            })

            if (navigationRequest.pageNumber) {
                setCurrentPage(navigationRequest.pageNumber)
            }

            setNavigationRequest(null)
        }
    }, [findByFilename.data, navigationRequest, setSelectedPdf, setCurrentPage, setNavigationRequest])

    // Update URL when we get a signed URL
    useEffect(() => {
        if (signedUrl.data?.url && selectedPdf && !selectedPdf.url) {
            setSelectedPdf({
                ...selectedPdf,
                url: signedUrl.data.url
            })
        }
    }, [signedUrl.data, selectedPdf, setSelectedPdf])

    return (
        <div className="flex flex-1 flex-col h-full overflow-hidden">
            {/* Top Bar - matches sidebar header height */}
            <header className="flex items-center justify-between h-10 px-3 border-b border-border bg-background shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    {/* File Info */}
                    {selectedPdf ? (
                        <div className="flex items-center gap-2 min-w-0">
                            <IconFileTypePdf size={16} className="text-red-500 shrink-0" />
                            <span className="text-sm font-medium truncate max-w-[400px]">
                                {selectedPdf.name}
                            </span>
                            {selectedPdf.pageCount && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {selectedPdf.pageCount} pages
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="text-sm text-muted-foreground">No document selected</span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    {selectedPdf && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setSelectedPdf(null)}
                                >
                                    <IconX size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Close PDF</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </header>

            {/* PDF Viewer */}
            <div className="flex-1 overflow-hidden">
                {selectedPdf ? (
                    <PdfViewerEnhanced
                        source={selectedPdf}
                        className="h-full"
                    />
                ) : (
                    <EmptyState onOpenSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
                )}
            </div>
        </div>
    )
})

/** Empty state when no PDF is selected */
const EmptyState = memo(function EmptyState({
    sidebarOpen,
    onOpenSidebar
}: {
    sidebarOpen: boolean
    onOpenSidebar: () => void
}) {
    return (
        <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="text-center max-w-sm px-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-5">
                    <IconFileTypePdf size={32} className="text-red-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No PDF Selected</h3>
                <p className="text-sm text-muted-foreground mb-5">
                    Select a document from the sidebar to start viewing, or upload a PDF to your chats.
                </p>
                {!sidebarOpen && (
                    <Button
                        variant="outline"
                        onClick={onOpenSidebar}
                        className="gap-2"
                    >
                        <IconLayoutSidebar size={16} />
                        Show Documents
                    </Button>
                )}
            </div>
        </div>
    )
})
