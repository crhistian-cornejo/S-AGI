import { useEffect, useCallback, memo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  IconRefresh,
  IconLayoutSidebarLeftCollapse,
  IconFileTypePdf,
  IconLayoutSidebar,
} from "@tabler/icons-react";
import { trpc } from "@/lib/trpc";
import {
  selectedPdfAtom,
  pdfSidebarOpenAtom,
  pdfNavigationRequestAtom,
  pdfCurrentPageAtom,
  selectedChatIdAtom,
  sidebarOpenAtom,
  type PdfSource,
} from "@/lib/atoms";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, isMacOS, isElectron } from "@/lib/utils";
import { PdfDocumentList } from "./pdf-document-list";
import { PdfViewerEnhanced } from "./pdf-viewer-enhanced";
import { PdfQueueProcessor } from "./components/queue-processor";
import { KnowledgeDropZone } from "./components/knowledge-drop-zone";
import { PdfIcon } from "@/features/agent/icons";

/**
 * Main PDF Tab View Component
 *
 * Layout with collapsible sidebar:
 * - Container takes full height minus titlebar (36px)
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
          "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0",
          sidebarOpen ? "w-72 border-r border-border/40" : "w-0 border-r-0"
        )}
      >
        <div className="w-72 h-full">
          <PdfSidebarContent />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden pt-9">
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
  const [, setSidebarOpen] = useAtom(pdfSidebarOpenAtom);
  const mainSidebarOpen = useAtomValue(sidebarOpenAtom);

  const handleRefresh = useCallback(() => {
    utils.pdf.listAll.invalidate();
  }, [utils]);

  return (
    <div className="h-full flex flex-col">
      {/* Header - matches FilesSidebar pattern */}
      <div
        className={cn(
          "flex h-9 items-center justify-between px-3",
          // Add left padding for traffic lights when main sidebar is collapsed on macOS
          !mainSidebarOpen && isMacOS() && isElectron() && "pl-20",
        )}
      >
        <div className="flex items-center gap-2">
          <PdfIcon size={18} />
          {/* Hide label when main sidebar collapsed on macOS to avoid traffic light overlap */}
          {!(!mainSidebarOpen && isMacOS() && isElectron()) && (
            <span className="text-sm font-semibold">PDFs</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleRefresh}
              >
                <IconRefresh size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Actualizar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSidebarOpen(false)}
              >
                <IconLayoutSidebarLeftCollapse size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ocultar</TooltipContent>
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
