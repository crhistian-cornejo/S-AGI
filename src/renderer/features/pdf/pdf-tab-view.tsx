import { useEffect, useCallback, memo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconFileTypePdf,
    IconLayoutSidebar,
    IconX,
    IconRefresh
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
    SidebarInset,
    SidebarGroup,
    SidebarGroupContent,
    SidebarRail,
    useSidebar
} from '@/components/ui/sidebar'
import { PdfDocumentList } from './pdf-document-list'
import { PdfViewerEnhanced } from './pdf-viewer-enhanced'

/**
 * Main PDF Tab View Component
 *
 * Uses shadcn's Sidebar component with variant="inset" for a modern,
 * professional look where the sidebar is visually embedded within the page.
 * 
 * Layout:
 * - Container takes full height minus titlebar (56px)
 * - Sidebar and main content both have inset styling with rounded corners
 * - Background is sidebar color, content areas are main background
 */
export const PdfTabView = memo(function PdfTabView() {
    const [sidebarOpen, setSidebarOpen] = useAtom(pdfSidebarOpenAtom)

    return (
        // Container: full screen, with padding-top for titlebar
        <div className="h-screen pt-14 bg-sidebar">
            <SidebarProvider
                defaultOpen={sidebarOpen}
                open={sidebarOpen}
                onOpenChange={setSidebarOpen}
                // Takes remaining height after titlebar
                className="h-full"
            >
                <PdfSidebar />
                <SidebarInset>
                    <PdfMainContent />
                </SidebarInset>
            </SidebarProvider>
        </div>
    )
})

/**
 * PDF Sidebar Component
 * Shows list of PDFs grouped by source (local vs cloud)
 */
const PdfSidebar = memo(function PdfSidebar() {
    const selectedChatId = useAtomValue(selectedChatIdAtom)
    const utils = trpc.useUtils()

    const handleRefresh = useCallback(() => {
        utils.pdf.listAll.invalidate()
    }, [utils])

    // Count PDFs
    const { data: pdfList } = trpc.pdf.listAll.useQuery({
        chatId: selectedChatId || undefined,
        limit: 50
    })
    const pdfCount = pdfList?.pdfs?.length || 0

    return (
        <Sidebar variant="inset" collapsible="offcanvas">
            <SidebarHeader className="border-b border-sidebar-border">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <IconFileTypePdf size={16} className="text-red-500" />
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
                </div>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup className="p-1">
                    <SidebarGroupContent>
                        <PdfDocumentList className="px-0" />
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarRail />
        </Sidebar>
    )
})

/**
 * PDF Main Content Area
 * Contains the toolbar and PDF viewer
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
            {/* Top Bar */}
            <header className="flex items-center justify-between h-10 px-3 border-b border-border bg-background shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    {/* Sidebar Toggle */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={toggleSidebar}
                            >
                                <IconLayoutSidebar size={16} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {sidebarOpen ? 'Hide documents' : 'Show documents'}
                        </TooltipContent>
                    </Tooltip>

                    {/* File Info */}
                    {selectedPdf && (
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="h-4 w-px bg-border" />
                            <IconFileTypePdf size={16} className="text-red-500 shrink-0" />
                            <span className="text-sm font-medium truncate max-w-[300px]">
                                {selectedPdf.name}
                            </span>
                            {selectedPdf.pageCount && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {selectedPdf.pageCount} pages
                                </span>
                            )}
                        </div>
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
