import { useEffect, useCallback, memo, type CSSProperties } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    IconFileTypePdf,
    IconLayoutSidebar,
    IconMessageCircle,
    IconX,
    IconRefresh
} from '@tabler/icons-react'
import { trpc } from '@/lib/trpc'
import {
    selectedPdfAtom,
    pdfSidebarOpenAtom,
    pdfChatPanelOpenAtom,
    pdfNavigationRequestAtom,
    pdfCurrentPageAtom,
    selectedChatIdAtom,
    type PdfSource
} from '@/lib/atoms'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarTrigger
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PdfDocumentList } from './pdf-document-list'
import { PdfViewerEnhanced } from './pdf-viewer-enhanced'
import { PdfChatPanel } from './pdf-chat-panel'

/**
 * Main PDF Tab View Component
 *
 * Layout:
 * - Left sidebar: Document list (collapsible)
 * - Center: PDF viewer
 * - Right panel: AI chat (collapsible, future)
 */
export const PdfTabView = memo(function PdfTabView() {
    const [selectedPdf, setSelectedPdf] = useAtom(selectedPdfAtom)
    const [sidebarOpen, setSidebarOpen] = useAtom(pdfSidebarOpenAtom)
    const [chatPanelOpen, setChatPanelOpen] = useAtom(pdfChatPanelOpenAtom)
    const [navigationRequest, setNavigationRequest] = useAtom(pdfNavigationRequestAtom)
    const setCurrentPage = useSetAtom(pdfCurrentPageAtom)
    const selectedChatId = useAtomValue(selectedChatIdAtom)

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

        // If we found the PDF
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

            // Navigate to the requested page
            if (navigationRequest.pageNumber) {
                setCurrentPage(navigationRequest.pageNumber)
            }

            // Clear the navigation request
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

    const handleTextSelect = useCallback((text: string, pageNumber: number) => {
        // Open chat panel when text is selected
        if (text.length > 10) {
            setChatPanelOpen(true)
        }
    }, [setChatPanelOpen])

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

    const sidebarStyle = {
        '--sidebar-width': '16rem'
    } as CSSProperties

    return (
        <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} style={sidebarStyle}>
            <Sidebar variant="floating" side="left" collapsible="offcanvas" className="top-14 bottom-4 border-none shadow-2xl bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/60">
                <SidebarHeader className="px-4 py-3 border-b-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tracking-tight">PDFs</span>
                            {pdfCount > 0 && (
                                <span className="text-xs text-muted-foreground font-medium">
                                    {pdfCount}
                                </span>
                            )}
                        </div>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    onClick={handleRefresh}
                                >
                                    <IconRefresh size={14} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Refresh list</TooltipContent>
                        </Tooltip>
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    <PdfDocumentList className="px-2" />
                </SidebarContent>
            </Sidebar>

            <div className="flex h-full w-full overflow-hidden bg-background/50 backdrop-blur-sm">
                <div className="flex-1 flex flex-col min-w-0 relative">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background shrink-0">
                        <div className="flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <SidebarTrigger className="h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center">
                                        <IconLayoutSidebar
                                            size={16}
                                            className={cn(
                                                "transition-transform",
                                                !sidebarOpen && "rotate-180"
                                            )}
                                        />
                                    </SidebarTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                                </TooltipContent>
                            </Tooltip>

                        {selectedPdf && (
                            <div className="flex items-center gap-2 min-w-0">
                                <IconFileTypePdf size={16} className="text-red-500 shrink-0" />
                                <span className="text-sm font-medium truncate">
                                    {selectedPdf.name}
                                </span>
                                {selectedPdf.pageCount && (
                                    <span className="text-xs text-muted-foreground">
                                        ({selectedPdf.pageCount} pages)
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={chatPanelOpen ? "secondary" : "ghost"}
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setChatPanelOpen(!chatPanelOpen)}
                                >
                                    <IconMessageCircle size={16} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {chatPanelOpen ? 'Hide AI chat' : 'Ask AI about this PDF'}
                            </TooltipContent>
                        </Tooltip>

                        {selectedPdf && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => setSelectedPdf(null)}
                                    >
                                        <IconX size={16} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Close PDF</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </div>

                {/* PDF Viewer */}
                <div className="flex-1 overflow-hidden">
                    {selectedPdf ? (
                        <PdfViewerEnhanced
                            source={selectedPdf}
                            onTextSelect={handleTextSelect}
                            className="h-full"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center max-w-md px-8">
                                <IconFileTypePdf size={48} className="text-red-400/50 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No PDF Selected</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Select a PDF from the sidebar or upload one to your chats to view it here.
                                </p>
                                {!sidebarOpen && (
                                    <Button
                                        variant="outline"
                                        onClick={() => setSidebarOpen(true)}
                                        className="gap-2"
                                    >
                                        <IconLayoutSidebar size={16} />
                                        Show Document List
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                </div>

                {chatPanelOpen && selectedPdf && (
                    <div
                        className={cn(
                            "h-full border-l border-border bg-background transition-all duration-300 ease-in-out overflow-hidden shrink-0",
                            "w-80"
                        )}
                    >
                        <PdfChatPanel
                            source={selectedPdf}
                            onClose={() => setChatPanelOpen(false)}
                            className="w-80 h-full"
                        />
                    </div>
                )}
            </div>
        </SidebarProvider>
    )
})
