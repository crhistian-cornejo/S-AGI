import { useEffect, useCallback, memo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  IconFileTypePdf,
  IconLayoutSidebar,
  IconRefresh,
  IconLayoutSidebarLeftCollapse,
} from "@tabler/icons-react";
import { trpc } from "@/lib/trpc";
import {
  selectedPdfAtom,
  pdfSidebarOpenAtom,
  pdfNavigationRequestAtom,
  pdfCurrentPageAtom,
  selectedChatIdAtom,
  agentPanelOpenAtom,
  type PdfSource,
} from "@/lib/atoms";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, isMacOS, isWindows } from "@/lib/utils";
import { PdfDocumentList } from "./pdf-document-list";
import { PdfViewerEnhanced } from "./pdf-viewer-enhanced";
import { PdfQueueProcessor } from "./components/queue-processor";
import { KnowledgeDropZone } from "./components/knowledge-drop-zone";

/**
 * Main PDF Tab View Component
 *
 * Layout with collapsible sidebar:
 * - Container takes full height minus titlebar (48px)
 * - Sidebar collapses to icons, main content expands
 * - Clean border separation between sidebar and content
 */
export const PdfTabView = memo(function PdfTabView() {
  const [sidebarOpen, setSidebarOpen] = useAtom(pdfSidebarOpenAtom);

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Global queue processor - runs for all PDFs */}
      <PdfQueueProcessor />

      {/* Sidebar - collapses completely like chat sidebar */}
      <div
        className={cn(
          "h-full border-r border-border bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0",
          sidebarOpen ? "w-72" : "w-0 border-r-0"
        )}
      >
        <div className="w-72 h-full">
          <PdfSidebarContent />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden pt-10">
        <PdfMainContent sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      </main>
    </div>
  );
});

/**
 * PDF Sidebar Content Component
 * Shows list of PDFs grouped by source (local vs cloud)
 * Simple content without SidebarProvider - parent handles collapse
 */
const PdfSidebarContent = memo(function PdfSidebarContent() {
  const utils = trpc.useUtils();
  const [, setAgentPanelOpen] = useAtom(agentPanelOpenAtom);
  const [, setSidebarOpen] = useAtom(pdfSidebarOpenAtom);
  const isWindowsPlatform = isWindows();
  const isMacPlatform = isMacOS();

  const handleRefresh = useCallback(() => {
    utils.pdf.listAll.invalidate();
  }, [utils]);

  // Count PDFs (all user's PDFs, not filtered by chat)
  const { data: pdfList } = trpc.pdf.listAll.useQuery({
    limit: 50,
  });
  const pdfCount = pdfList?.pdfs?.length || 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className={cn(
          "border-b border-sidebar-border flex items-center justify-between px-2",
          isMacPlatform ? "pt-8 pb-2" : "h-10",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isWindowsPlatform ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setAgentPanelOpen(true)}
                  className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <img src="/logo.svg" alt="S-AGI" className="h-5 w-5" />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate">
                      S-AGI
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      PDFs
                    </span>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open chat panel</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <IconFileTypePdf
                size={16}
                className="text-red-500 shrink-0"
              />
              <span className="text-sm font-semibold">Documents</span>
            </div>
          )}
          {pdfCount > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
              {pdfCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setSidebarOpen(false)}
              >
                <IconLayoutSidebarLeftCollapse size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Collapse sidebar</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Knowledge Drop Zone */}
        <div className="px-2 pt-2">
          <KnowledgeDropZone onUploadComplete={() => handleRefresh()} />
        </div>

        <div className="p-1">
          <PdfDocumentList className="px-0" />
        </div>
      </div>
    </div>
  );
});

/**
 * PDF Main Content Area
 * Contains the header bar and PDF viewer
 */
const PdfMainContent = memo(function PdfMainContent({
  sidebarOpen,
  onToggleSidebar,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const [selectedPdf, setSelectedPdf] = useAtom(selectedPdfAtom);
  const [navigationRequest, setNavigationRequest] = useAtom(
    pdfNavigationRequestAtom,
  );
  const setCurrentPage = useSetAtom(pdfCurrentPageAtom);
  const selectedChatId = useAtomValue(selectedChatIdAtom);

  // Query for finding PDF by filename (for citation navigation)
  const findByFilename = trpc.pdf.findByFilename.useQuery(
    {
      filename: navigationRequest?.filename || "",
      chatId: navigationRequest?.chatId || selectedChatId || undefined,
    },
    {
      enabled: !!navigationRequest?.filename,
    },
  );

  // Query for signed URL when we have a chat_file
  const signedUrl = trpc.pdf.getSignedUrl.useQuery(
    { fileId: selectedPdf?.id || "" },
    {
      enabled:
        !!selectedPdf && selectedPdf.type === "chat_file" && !selectedPdf.url,
    },
  );

  // Handle navigation request (from citation clicks)
  useEffect(() => {
    if (!navigationRequest) return;

    if (findByFilename.data?.found) {
      const pdfData = findByFilename.data as PdfSource & { found: boolean };
      setSelectedPdf({
        type: pdfData.type,
        id: pdfData.id,
        name: pdfData.name,
        url: pdfData.url,
        chatId: pdfData.chatId,
        pageCount: pdfData.pageCount,
        pages: pdfData.pages,
      });

      if (navigationRequest.pageNumber) {
        setCurrentPage(navigationRequest.pageNumber);
      }

      setNavigationRequest(null);
    }
  }, [
    findByFilename.data,
    navigationRequest,
    setSelectedPdf,
    setCurrentPage,
    setNavigationRequest,
  ]);

  // Update URL when we get a signed URL
  useEffect(() => {
    if (signedUrl.data?.url && selectedPdf && !selectedPdf.url) {
      setSelectedPdf({
        ...selectedPdf,
        url: signedUrl.data.url,
      });
    }
  }, [signedUrl.data, selectedPdf, setSelectedPdf]);

  return (
    <div className="flex-1 overflow-hidden">
      {selectedPdf ? (
        <PdfViewerEnhanced source={selectedPdf} className="h-full" />
      ) : (
        <EmptyState onOpenSidebar={onToggleSidebar} sidebarOpen={sidebarOpen} />
      )}
    </div>
  );
});

/** Empty state when no PDF is selected */
const EmptyState = memo(function EmptyState({
  sidebarOpen,
  onOpenSidebar,
}: {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-full bg-muted/20">
      <div className="text-center max-w-sm px-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-5">
          <IconFileTypePdf size={32} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No PDF Selected</h3>
        <p className="text-sm text-muted-foreground mb-5">
          Select a document from the sidebar to start viewing, or upload a PDF
          to your chats.
        </p>
        {!sidebarOpen && (
          <Button variant="outline" onClick={onOpenSidebar} className="gap-2">
            <IconLayoutSidebar size={16} />
            Show Documents
          </Button>
        )}
      </div>
    </div>
  );
});
