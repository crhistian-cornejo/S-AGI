import { useState, useCallback, useEffect, useMemo, memo, useRef } from "react";
import { useAtom, useSetAtom } from "jotai";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF, useRegistry } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  Viewport,
  ViewportPluginPackage,
} from "@embedpdf/plugin-viewport/react";
import {
  Scroller,
  ScrollPluginPackage,
  type RenderPageProps,
} from "@embedpdf/plugin-scroll/react";
import { LoaderPluginPackage, useLoaderCapability } from "@embedpdf/plugin-loader/react";
import {
  RenderLayer,
  RenderPluginPackage,
} from "@embedpdf/plugin-render/react";
import {
  ZoomPluginPackage,
  useZoomCapability,
} from "@embedpdf/plugin-zoom/react";
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
  GlobalPointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import {
  SelectionPluginPackage,
  SelectionLayer,
  CopyToClipboard,
} from "@embedpdf/plugin-selection/react";
import {
  HistoryPluginPackage,
  useHistoryCapability,
} from "@embedpdf/plugin-history/react";
import {
  AnnotationPluginPackage,
  useAnnotationCapability,
  AnnotationLayer,
  type AnnotationState,
} from "@embedpdf/plugin-annotation/react";
import { PdfAnnotationSubtype, Rotation } from "@embedpdf/models";
import type { ZoomChangeEvent, ZoomState } from "@embedpdf/plugin-zoom";
import {
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
  IconHighlight,
  IconPencil,
  IconSquare,
  IconCircle,
  IconArrowBackUp,
  IconTrash,
  IconPointer,
  IconLoader2,
  IconAlertTriangle,
  IconFileTypePdf,
  IconUnderline,
  IconStrikethrough,
  IconLine,
  IconTextCaption,
  IconDownload,
  IconBrush,
  IconCopy,
  IconSearch,
  IconLayoutSidebarRight,
  IconZoomScan,
  IconDotsVertical,
  IconRotateClockwise,
  IconCloudCheck,
  IconCloudUpload,
  IconCloudX,
  IconInfoCircle,
  IconBookmark,
  IconFilesOff,
  IconPaperclip,
} from "@tabler/icons-react";
import type { TrackedAnnotation } from "@embedpdf/plugin-annotation";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { cn, isElectron } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SearchHighlights } from "./components/pdf-search-highlights";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  pdfCurrentPageAtom,
  pdfZoomLevelAtom,
  localPdfBlobCacheAtom,
  setLocalPdfBlobAtom,
  pdfSearchPanelOpenAtom,
  pdfSaveStatusAtom,
  pdfHasUnsavedChangesAtom,
  pdfLastSaveAtom,
  type PdfSource,
} from "@/lib/atoms";
import { PdfSearchPanel } from "./components/pdf-search-panel";
import { PdfThumbnailsPanel } from "./components/pdf-thumbnails-panel";
import { PdfMetadataEditor } from "./components/pdf-metadata-editor";
import { PdfOutlineEditor } from "./components/pdf-outline-editor";
import { PdfMergeTool } from "./components/pdf-merge-tool";
import { PdfAttachmentEditor } from "./components/pdf-attachment-editor";
import { trpc } from "@/lib/trpc";

interface PdfViewerEnhancedProps {
  source: PdfSource | null;
  className?: string;
}

/**
 * Enhanced PDF Viewer using EmbedPDF v1.5.0
 * Full annotation support including:
 * - Text markup: highlight, underline, strikeout, squiggly
 * - Shapes: square, circle, line, polyline, polygon
 * - Drawing: ink (pen), inkHighlighter
 * - Text: freeText
 * - Stamps/Signatures: stamp
 */
export const PdfViewerEnhanced = memo(function PdfViewerEnhanced({
  source,
  className,
}: PdfViewerEnhancedProps) {
  const [, setCurrentPage] = useAtom(pdfCurrentPageAtom);
  const [, setZoomLevel] = useAtom(pdfZoomLevelAtom);
  const [blobCache] = useAtom(localPdfBlobCacheAtom);
  const setLocalPdfBlob = useSetAtom(setLocalPdfBlobAtom);
  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Extract values for dependency array
  const sourceType = source?.type;
  const localPath = source?.metadata?.localPath;

  useEffect(() => {
    if (source) {
      console.log("[PDF Viewer] Source changed:", {
        type: source.type,
        id: source.id,
        name: source.name,
        hasLocalPath: !!source.metadata?.localPath,
      });
    }
  }, [source]);

  // Load local PDF file via IPC (with caching)
  useEffect(() => {
    // Reset state when source changes
    setLocalPdfUrl(null);
    setLocalError(null);

    // For local files in Electron, check cache first, then read via IPC
    if (sourceType === "local" && localPath && isElectron()) {
      // Check if we have a cached blob URL
      const cachedUrl = blobCache[localPath];
      if (cachedUrl) {
        console.log("[PDF Local] Using cached blob URL for:", localPath);
        setLocalPdfUrl(cachedUrl);
        return;
      }

      console.log("[PDF Local] Starting to load:", localPath);
      setLoadingLocal(true);

      const loadLocalPdf = async () => {
        const startTime = performance.now();
        try {
          const api = window.desktopApi;

          if (!api?.pdf?.readLocal) {
            throw new Error("PDF API not available");
          }

          console.log("[PDF Local] Calling IPC readLocal...");
          const result = await api.pdf.readLocal(localPath);
          const ipcTime = performance.now() - startTime;
          const sizeStr = result?.size
            ? `${(result.size / 1024 / 1024).toFixed(2)}MB`
            : "unknown";
          console.log(
            `[PDF Local] IPC completed in ${ipcTime.toFixed(0)}ms, size: ${sizeStr}`,
          );

          if (result?.success && result.data) {
            // Convert base64 to blob URL using a more robust method
            const convertStart = performance.now();

            // Convert base64 to Uint8Array directly
            const binaryString = window.atob(result.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: "application/pdf" });

            const convertTime = performance.now() - convertStart;
            console.log(
              `[PDF Local] Base64 conversion took ${convertTime.toFixed(0)}ms`,
            );

            const url = URL.createObjectURL(blob);

            // Cache the blob URL for future use
            setLocalPdfBlob({ localPath, blobUrl: url });
            setLocalPdfUrl(url);

            const totalTime = performance.now() - startTime;
            console.log(
              `[PDF Local] Total load time: ${totalTime.toFixed(0)}ms`,
            );
          } else {
            console.error("[PDF Local] Failed:", result?.error);
            setLocalError(
              result?.error ||
                "Failed to load PDF. The file may have been moved or deleted.",
            );
          }
        } catch (err) {
          console.error("[PDF Local] Error:", err);
          setLocalError(
            err instanceof Error ? err.message : "Failed to load PDF",
          );
        } finally {
          setLoadingLocal(false);
        }
      };

      loadLocalPdf();
    }
  }, [sourceType, localPath, blobCache, setLocalPdfBlob]);

  // Get PDF URL from source
  const pdfUrl = useMemo(() => {
    if (!source) return null;

    // For local files, use the loaded blob URL
    if (source.type === "local") {
      console.log(
        "[PDF] Using local blob URL:",
        localPdfUrl ? "Available" : "Not ready",
      );
      return localPdfUrl;
    }

    // For cloud files, use the URL directly
    console.log("[PDF] Using cloud URL:", source.url ? "Available" : "Missing");
    return source.url || null;
  }, [source, localPdfUrl]);

  if (!source) {
    return <EmptyState />;
  }

  // Show loading state for local files
  if (source.type === "local" && loadingLocal) {
    return (
      <div className={cn("flex flex-col h-full bg-muted/30", className)}>
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <IconLoader2
            size={32}
            className="animate-spin text-muted-foreground"
          />
          <p className="text-sm text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  // Show error state for local files
  if (source.type === "local" && localError) {
    return (
      <div className={cn("flex flex-col h-full bg-muted/30", className)}>
        <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <IconAlertTriangle size={32} className="text-destructive" />
          </div>
          <h3 className="text-lg font-semibold">Failed to load PDF</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {localError}
          </p>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return <EmptyState />;
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden bg-muted/30",
        className,
      )}
    >
      <PdfViewerCore
        pdfUrl={pdfUrl}
        pdfId={source.id}
        source={source}
        onPageChange={setCurrentPage}
        onZoomChange={setZoomLevel}
      />
    </div>
  );
});

interface PdfViewerCoreProps {
  pdfUrl: string;
  pdfId: string;
  source: PdfSource;
  onPageChange?: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
}

/**
 * Core viewer component with EmbedPDF integration
 */
const PdfViewerCore = memo(function PdfViewerCore({
  pdfUrl,
  pdfId,
  source,
}: PdfViewerCoreProps) {
  console.log("[PDF Core] Initializing with URL:", pdfUrl, "ID:", pdfId);

  // Use local WASM file and disable Web Worker to avoid CSP issues in Electron
  const {
    engine,
    isLoading: engineLoading,
    error: engineError,
  } = usePdfiumEngine({
    worker: false,
    wasmUrl: "/pdfium.wasm",
  });

  // Build plugins configuration with full annotation support
  const plugins = useMemo(
    () => [
      createPluginRegistration(LoaderPluginPackage, {
        loadingOptions: {
          type: "url",
          pdfFile: {
            id: pdfId,
            url: pdfUrl,
          },
        },
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage, {
        pageGap: 16,
      }),
      createPluginRegistration(RenderPluginPackage, {
        withForms: true,
        withAnnotations: true,
      }),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: 1,
        minZoom: 0.25,
        maxZoom: 4,
        zoomStep: 0.25,
      }),
      // Annotation dependencies
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(HistoryPluginPackage),
      // Annotation plugin with all tools
      createPluginRegistration(AnnotationPluginPackage, {
        annotationAuthor: "User",
        autoCommit: true,
        selectAfterCreate: true, // Select after create to show menu
        deactivateToolAfterCreate: false, // Keep tool active for continuous annotation
        colorPresets: [
          "#FFEB3B",
          "#FFC107",
          "#FF9800",
          "#FF5722",
          "#F44336",
          "#E91E63",
          "#9C27B0",
          "#673AB7",
          "#3F51B5",
          "#2196F3",
          "#03A9F4",
          "#00BCD4",
          "#009688",
          "#4CAF50",
          "#8BC34A",
          "#CDDC39",
          "#795548",
          "#9E9E9E",
          "#607D8B",
          "#000000",
        ],
      }),
    ],
    [pdfId, pdfUrl],
  );

  if (engineError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <IconAlertTriangle size={32} className="text-destructive" />
        </div>
        <h3 className="text-lg font-semibold">Failed to load PDF Engine</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {engineError.message}
        </p>
      </div>
    );
  }

  if (engineLoading || !engine) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <IconLoader2 size={32} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading PDF engine...</p>
      </div>
    );
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      <CopyToClipboard />
      <PdfViewerContent source={source} />
    </EmbedPDF>
  );
});

/**
 * Inner content - must be inside EmbedPDF provider to access hooks
 * Handles keyboard shortcuts for the PDF viewer
 */
const PdfViewerContent = memo(function PdfViewerContent({ source }: { source: PdfSource | null }) {
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { registry } = useRegistry();
  const { provides: loaderApi } = useLoaderCapability();
  const { provides: selectionApi } = useSelectionCapability();
  const { provides: annotationApi } = useAnnotationCapability();
  const { provides: zoomApi } = useZoomCapability();

  // Panel states
  const [searchPanelOpen, setSearchPanelOpen] = useAtom(pdfSearchPanelOpenAtom);
  const [thumbnailsPanelOpen, setThumbnailsPanelOpen] = useState(true); // Open by default

  // Auto-save state
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [saveStatus, setSaveStatus] = useAtom(pdfSaveStatusAtom);
  const setHasUnsavedChanges = useSetAtom(pdfHasUnsavedChangesAtom);
  const setLastSave = useSetAtom(pdfLastSaveAtom);

  // tRPC mutation for saving PDFs
  const saveWithAnnotationsMutation = trpc.pdf.saveWithAnnotations.useMutation();

  // Track rotation for Scroller key
  const [scrollerKey, setScrollerKey] = useState(0);

  // Keyboard event handler for Escape and other shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key - clear selection, deselect annotation, deactivate tool
      if (e.key === "Escape") {
        // Check if event was already handled (e.g., by text selection toolbar)
        if (e.defaultPrevented) {
          console.log("[PDF] Escape already handled by child component");
          return;
        }

        let handled = false;

        // 1. First priority: Clear text selection if any
        if (selectionApi) {
          try {
            const selection = selectionApi.getFormattedSelection();
            if (selection && selection.length > 0) {
              e.preventDefault();
              e.stopPropagation();
              selectionApi.clear();
              console.log("[PDF] Cleared text selection from parent handler");
              handled = true;
              return;
            }
          } catch (err) {
            // No selection, continue
          }
        }

        // 2. Second priority: Deselect any selected annotation
        if (annotationApi && !handled) {
          const selected = annotationApi.getSelectedAnnotation();
          if (selected) {
            e.preventDefault();
            e.stopPropagation();
            annotationApi.deselectAnnotation();
            console.log("[PDF] Deselected annotation");
            handled = true;
            return;
          }

          // 3. Third priority: If no annotation selected, deactivate active tool
          const activeTool = annotationApi.getActiveTool();
          if (activeTool) {
            e.preventDefault();
            e.stopPropagation();
            annotationApi.setActiveTool(null);
            console.log("[PDF] Deactivated tool:", activeTool);
            handled = true;
            return;
          }
        }
      }

      // Delete key - delete selected annotation
      if (e.key === "Delete" || e.key === "Backspace") {
        if (annotationApi) {
          const selected = annotationApi.getSelectedAnnotation();
          if (selected) {
            e.preventDefault();
            e.stopPropagation();
            annotationApi.deleteAnnotation(
              selected.object.pageIndex,
              selected.object.id,
            );
            console.log("[PDF] Deleted annotation:", selected.object.id);
            annotationApi.commit?.();
            annotationApi.deselectAnnotation();
          }
        }
      }

      // Ctrl/Cmd + C - Copy (text selection is handled by CopyToClipboard component)
      // Ctrl/Cmd + Z - Undo (handled by history plugin)
      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y - Redo (handled by history plugin)

      // Ctrl/Cmd + F - Open search
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchPanelOpen(true);
      }
    };

    // Add listener to the container so it captures keyboard events when focused
    const container = containerRef.current;
    if (container) {
      container.addEventListener("keydown", handleKeyDown, { capture: true });
      // Make container focusable
      container.tabIndex = 0;
    }

    // Also add global listener for when focus is elsewhere
    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      if (container) {
        container.removeEventListener("keydown", handleKeyDown, {
          capture: true,
        });
      }
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [selectionApi, annotationApi, setSearchPanelOpen]);

  // Focus the container when mounted to capture keyboard events
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Handle Ctrl/Cmd + Mouse Wheel for zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Only handle if Ctrl or Cmd is pressed
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        if (!zoomApi) return;

        // Determine zoom direction based on deltaY
        // Negative deltaY = scroll up = zoom in
        // Positive deltaY = scroll down = zoom out
        if (e.deltaY < 0) {
          zoomApi.zoomIn();
          console.log("[PDF] Zoom in via Ctrl+Wheel");
        } else if (e.deltaY > 0) {
          zoomApi.zoomOut();
          console.log("[PDF] Zoom out via Ctrl+Wheel");
        }
      }
    };

    const viewport = viewportContainerRef.current;
    if (viewport) {
      viewport.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        viewport.removeEventListener("wheel", handleWheel);
      };
    }
  }, [zoomApi]);

  // Listen for rotation changes to force Scroller re-render
  useEffect(() => {
    if (!registry) return;

    const store = registry.getStore();
    let lastRotation = (store.getState() as any)?.core?.rotation;

    // Subscribe to rotation changes in core state
    const unsubscribe = store.subscribe((state) => {
      const rotation = (state as any)?.core?.rotation;
      if (rotation !== undefined && rotation !== lastRotation) {
        lastRotation = rotation;
        // Force Scroller to re-render by changing its key
        setScrollerKey((prev) => prev + 1);
        console.log(`[PDF] Scroller key updated for rotation: ${rotation * 90}°`);
      }
    });

    return unsubscribe;
  }, [registry]);

  // Auto-save annotations when they change
  useEffect(() => {
    if (!annotationApi || !registry || !loaderApi || !source) return;

    const handleAnnotationChange = async (event: any) => {
      // Only save when annotation is committed (already saved to PDF in memory)
      if (event.committed) {
        console.log(`[PDF Auto-Save] Annotation ${event.type}d and committed`, event);

        // Clear any pending save timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        // Debounce save for 2 seconds
        saveTimeoutRef.current = setTimeout(async () => {
          try {
            const doc = loaderApi.getDocument();
            if (!doc) {
              console.warn("[PDF Auto-Save] No document available");
              return;
            }

            const engine = registry.getEngine() as any;
            if (!engine || !engine.saveAsCopy) {
              console.warn("[PDF Auto-Save] Engine does not support saveAsCopy");
              return;
            }

            // External PDFs can't be saved
            if (source.type === 'external') {
              console.warn("[PDF Auto-Save] External PDFs cannot be saved");
              return;
            }

            console.log("[PDF Auto-Save] Exporting PDF with annotations...");

            // Export PDF with embedded annotations
            const task = engine.saveAsCopy(doc);
            const pdfArrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
              task.wait(resolve, reject);
            });

            console.log(`[PDF Auto-Save] PDF exported successfully (${pdfArrayBuffer.byteLength} bytes)`);

            setSaveStatus('saving');
            setHasUnsavedChanges(false);

            try {
              // Convert ArrayBuffer to base64 in chunks to avoid stack overflow
              const uint8Array = new Uint8Array(pdfArrayBuffer);
              const chunkSize = 0x8000; // 32KB chunks
              let base64 = '';

              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                base64 += String.fromCharCode.apply(null, Array.from(chunk));
              }

              const base64Data = btoa(base64);

              // Call tRPC mutation to save the PDF
              await saveWithAnnotationsMutation.mutateAsync({
                id: source.id,
                type: source.type,
                pdfData: base64Data,
                localPath: source.metadata?.localPath,
              });

              setSaveStatus('saved');
              setLastSave(new Date());
              console.log('[PDF Auto-Save] Successfully saved to storage');

              // Reset to idle after 2 seconds
              setTimeout(() => setSaveStatus('idle'), 2000);
            } catch (saveError) {
              console.error('[PDF Auto-Save] Failed to save to storage:', saveError);
              setSaveStatus('error');
              setHasUnsavedChanges(true);

              // Reset to idle after 3 seconds
              setTimeout(() => setSaveStatus('idle'), 3000);
            }

          } catch (error) {
            console.error("[PDF Auto-Save] Failed to export PDF:", error);
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
          }
        }, 2000);
      }
    };

    // Listen to annotation events
    const unsubscribe = annotationApi.onAnnotationEvent(handleAnnotationChange);

    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [annotationApi, registry, loaderApi, source?.id, source?.type, source?.metadata?.localPath]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="PDF Viewer"
      className="flex flex-col h-full overflow-hidden outline-none"
    >
      {/* Toolbar */}
      <AnnotationToolbar
        onToggleSearch={() => setSearchPanelOpen(!searchPanelOpen)}
        onToggleThumbnails={() => setThumbnailsPanelOpen(!thumbnailsPanelOpen)}
        isSearchOpen={searchPanelOpen}
        isThumbnailsOpen={thumbnailsPanelOpen}
        saveStatus={saveStatus}
        pdfName={source?.name}
      />

      {/* Search Panel - collapsible at top */}
      {searchPanelOpen && (
        <div className="border-b border-border bg-background shrink-0">
          <PdfSearchPanel
            className="max-w-2xl mx-auto"
            onClose={() => setSearchPanelOpen(false)}
          />
        </div>
      )}

      {/* Main content area with optional thumbnails sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Text selection floating toolbar - needs viewport ref for coordinate conversion */}
        <TextSelectionToolbar viewportRef={viewportContainerRef} />

        {/* GlobalPointerProvider captures all pointer events for the interaction manager */}
        <div
          ref={viewportContainerRef}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <GlobalPointerProvider>
            {/* PDF Viewport */}
            <Viewport
              style={{
                flex: 1,
                backgroundColor: "hsl(var(--muted) / 0.3)",
                overflow: "auto",
              }}
            >
              <Scroller
                key={scrollerKey}
                renderPage={(props: RenderPageProps) => (
                  <PageRenderer {...props} />
                )}
              />
            </Viewport>
          </GlobalPointerProvider>
        </div>

        {/* Thumbnails Panel - right sidebar */}
        {thumbnailsPanelOpen && (
          <div className="w-[160px] border-l border-border bg-background shrink-0 overflow-hidden">
            <PdfThumbnailsPanel className="h-full" />
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Page renderer component with RenderLayer, SelectionLayer, and AnnotationLayer
 * PagePointerProvider wraps the interactive layers and captures pointer events
 */
const PageRenderer = memo(function PageRenderer({
  width,
  height,
  pageIndex,
  scale,
  rotation,
}: RenderPageProps) {
  // Calculate original page dimensions (before scaling)
  // These are needed for coordinate transformation in the interaction manager
  const pageWidth = width / scale;
  const pageHeight = height / scale;

  return (
    <div
      data-page-index={pageIndex}
      style={{
        width,
        height,
        margin: "8px auto",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        borderRadius: "4px",
        overflow: "visible",
        backgroundColor: "white",
        position: "relative",
      }}
    >
      {/* Base PDF render layer - renders the actual PDF page image */}
      <RenderLayer pageIndex={pageIndex} scale={scale} />

      {/* Search highlights layer - shows yellow highlight boxes over search results */}
      <SearchHighlights
        pageIndex={pageIndex}
        scale={scale}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
      />

      {/* PagePointerProvider - captures all pointer events for interaction
                The provider uses getBoundingClientRect() for actual dimensions
                and scale parameter for coordinate transformation */}
      <PagePointerProvider
        pageIndex={pageIndex}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        rotation={rotation}
        scale={scale}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          cursor: "text", // Show text cursor to indicate text is selectable
        }}
      >
        {/* Text selection layer - displays selection highlight rectangles */}
        <SelectionLayer pageIndex={pageIndex} scale={scale} />

        {/* Annotation layer - for drawing, shapes, and text annotations */}
        <AnnotationLayer
          pageIndex={pageIndex}
          scale={scale}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          rotation={rotation}
          selectionOutlineColor="hsl(var(--primary))"
          selectionMenu={(props) => <AnnotationSelectionMenu {...props} />}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </PagePointerProvider>
    </div>
  );
});

// Color presets for the color picker
const COLOR_PRESETS = [
  "#FFEB3B",
  "#FFC107",
  "#FF9800",
  "#FF5722",
  "#F44336",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
  "#3F51B5",
  "#2196F3",
  "#03A9F4",
  "#00BCD4",
  "#009688",
  "#4CAF50",
  "#8BC34A",
  "#CDDC39",
  "#795548",
  "#9E9E9E",
  "#607D8B",
  "#000000",
];

/**
 * Selection menu that appears when an annotation is selected
 * Fixed size, positioned at top-center of selection
 */
interface AnnotationMenuProps {
  annotation: TrackedAnnotation;
  selected: boolean;
  rect: {
    origin: { x: number; y: number };
    size: { width: number; height: number };
  };
  menuWrapperProps: { style: React.CSSProperties };
}

const AnnotationSelectionMenu = memo(function AnnotationSelectionMenu({
  annotation,
  selected,
  rect,
}: AnnotationMenuProps) {
  const { provides: annotationApi } = useAnnotationCapability();
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!selected) return null;

  // Don't show menu if annotation hasn't been committed yet (no ID)
  // NOTE: With autoCommit: true, annotations get IDs immediately after creation
  if (!annotation.object.id) {
    console.log("[PDF] Annotation menu hidden - waiting for commit. CommitState:", annotation.commitState);
    return null;
  }

  // DEBUG: Log when menu appears
  console.log("[PDF] Annotation menu visible for ID:", annotation.object.id, "Type:", annotation.object.type);

  // Get current annotation color for the indicator
  const currentColor =
    (annotation.object as { color?: string }).color || "#FFEB3B";

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (annotationApi) {
      console.log("[PDF] Deleting annotation from menu:", {
        id: annotation.object.id,
        pageIndex: annotation.object.pageIndex,
        type: annotation.object.type,
        commitState: annotation.commitState,
        fullObject: annotation.object,
      });

      if (!annotation.object.id) {
        console.error("[PDF] Cannot delete annotation - missing ID!");
        return;
      }

      annotationApi.deleteAnnotation(
        annotation.object.pageIndex,
        annotation.object.id,
      );
      await annotationApi.commit();
      annotationApi.deselectAnnotation();
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // TODO: Implement duplicate functionality
    console.log("Duplicate annotation:", annotation.object.id);
  };

  const handleColorChange = (e: React.MouseEvent, color: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (annotationApi && annotation.object.id) {
      console.log("[PDF] Changing annotation color to:", color, "ID:", annotation.object.id);
      annotationApi.updateAnnotation(
        annotation.object.pageIndex,
        annotation.object.id,
        { color },
      );
    } else if (!annotation.object.id) {
      console.error("[PDF] Cannot update annotation color - missing ID!");
    }
    setShowColorPicker(false);
  };

  // Calculate position: center-top of the annotation
  const menuLeft = rect.origin.x + rect.size.width / 2;
  const menuTop = rect.origin.y;

  return (
    <div
      role="toolbar"
      aria-label="Annotation actions"
      className="absolute z-[100] pointer-events-auto"
      style={{
        left: menuLeft,
        top: menuTop,
        transform: "translate(-50%, -100%) translateY(-8px)",
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 bg-zinc-800 rounded-full shadow-2xl px-2 py-1.5 border border-zinc-700">
        {/* Color picker with current color indicator */}
        <Popover open={showColorPicker} onOpenChange={setShowColorPicker}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-700 transition-colors"
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-white/30"
                style={{ backgroundColor: currentColor }}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-3 bg-zinc-800 border-zinc-700"
            align="center"
            side="top"
            sideOffset={8}
          >
            <div className="grid grid-cols-5 gap-2">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "w-6 h-6 rounded-full transition-all hover:scale-110",
                    currentColor === color &&
                      "ring-2 ring-white ring-offset-2 ring-offset-zinc-800",
                  )}
                  style={{ backgroundColor: color }}
                  onClick={(e) => handleColorChange(e, color)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Duplicate */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-700 transition-colors text-zinc-300 hover:text-white"
              onClick={handleDuplicate}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <IconCopy size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-zinc-900 text-white border-zinc-700"
          >
            Duplicate
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="w-px h-5 bg-zinc-600 mx-0.5" />

        {/* Delete */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors text-zinc-300 hover:text-red-400"
              onClick={handleDelete}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <IconTrash size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-zinc-900 text-white border-zinc-700"
          >
            Delete (Del)
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
});

/**
 * Floating toolbar for text selection actions
 * Appears when text is selected, allows highlight, underline, strikeout, copy
 */
interface TextSelectionToolbarProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
}

// Store selection data to prevent loss when interacting with toolbar
// We store the result of getFormattedSelection() directly
interface CachedSelection {
  // The formatted selection from the SDK (opaque to avoid type issues)
  // biome-ignore lint/suspicious/noExplicitAny: SDK type compatibility
  formatted: any[];
}

const TextSelectionToolbar = memo(function TextSelectionToolbar({
  viewportRef,
}: TextSelectionToolbarProps) {
  const { provides: selectionApi } = useSelectionCapability();
  const { provides: annotationApi } = useAnnotationCapability();
  const { provides: zoomApi } = useZoomCapability();
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  // Cache selection data so it's not lost when clicking toolbar buttons
  const cachedSelectionRef = useRef<CachedSelection | null>(null);
  // Track if we have an active selection (for position updates during zoom)
  const hasSelectionRef = useRef(false);

  // Function to find and update toolbar position based on selection highlights
  const updateToolbarPosition = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return false;

    const allDivs = viewport.querySelectorAll("div");
    let bestRect: DOMRect | null = null;

    // Helper to update best rect
    const checkRect = (domRect: DOMRect) => {
      if (domRect.width > 2 && domRect.height > 2) {
        if (!bestRect || domRect.top < bestRect.top) {
          bestRect = domRect;
        }
      }
    };

    // First pass: check inline styles
    allDivs.forEach((div) => {
      const style = div.style;
      // Check if this is a selection highlight div (has the blue background)
      if (style.background?.includes("33,150,243")) {
        checkRect(div.getBoundingClientRect());
      }
      // Also check for mixBlendMode container (the bounding box of all selections)
      if (style.mixBlendMode === "multiply" && style.isolation === "isolate") {
        checkRect(div.getBoundingClientRect());
      }
    });

    if (bestRect) {
      const rect = bestRect as DOMRect;
      setToolbarPosition({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      return true;
    }

    // Last fallback: use computed style to find any highlighted elements
    allDivs.forEach((div) => {
      const computed = window.getComputedStyle(div);
      const bg = computed.backgroundColor;
      // Check for blue-ish background (33, 150, 243 is the default selection color)
      // Also check for rgba format
      if (
        bg &&
        (bg.includes("33, 150, 243") ||
          bg.includes("33,150,243") ||
          bg.includes("rgb(33, 150, 243)"))
      ) {
        checkRect(div.getBoundingClientRect());
      }
    });

    if (bestRect) {
      const rect = bestRect as DOMRect;
      setToolbarPosition({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      return true;
    }

    return false;
  }, [viewportRef]);

  useEffect(() => {
    if (!selectionApi) return;

    const unsubscribe = selectionApi.onSelectionChange((selection) => {
      if (selection) {
        // Cache the selection data immediately
        try {
          const formatted = selectionApi.getFormattedSelection();
          if (formatted.length > 0) {
            // Store formatted selection directly
            cachedSelectionRef.current = { formatted };
            console.log(
              "[PDF Toolbar] Selection cached:",
              formatted.length,
              "items",
            );
          }
        } catch (error) {
          // Selection might not be ready yet
          console.log("[PDF Toolbar] Could not cache selection:", error);
        }

        // Wait for the DOM to update with selection highlights
        // Use triple RAF to ensure the SelectionLayer has rendered
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (updateToolbarPosition()) {
                console.log(
                  "[PDF Toolbar] Showing toolbar at position:",
                  toolbarPosition,
                );
                setShowToolbar(true);
                hasSelectionRef.current = true;
              } else {
                console.log(
                  "[PDF Toolbar] Could not find selection highlights",
                );
                setShowToolbar(false);
                hasSelectionRef.current = false;
              }
            });
          });
        });
      } else {
        console.log("[PDF Toolbar] Selection cleared");
        setShowToolbar(false);
        hasSelectionRef.current = false;
        // Don't clear cache immediately - allow toolbar actions to use it
      }
    });

    return unsubscribe;
  }, [selectionApi, updateToolbarPosition, toolbarPosition]);

  // Update toolbar position when zoom changes
  useEffect(() => {
    if (!zoomApi) return;

    const unsubscribe = zoomApi.onZoomChange(() => {
      // Only update position if we have an active selection
      if (hasSelectionRef.current && showToolbar) {
        // Wait for the DOM to update after zoom
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updateToolbarPosition();
          });
        });
      }
    });

    return unsubscribe;
  }, [zoomApi, showToolbar, updateToolbarPosition]);

  // Also update on scroll
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      if (hasSelectionRef.current && showToolbar) {
        requestAnimationFrame(() => {
          updateToolbarPosition();
        });
      }
    };

    // Listen to scroll on the viewport container
    viewport.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });

    return () => {
      viewport.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [viewportRef, showToolbar, updateToolbarPosition]);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (selectionApi) {
        selectionApi.copyToClipboard();
        console.log("[PDF Toolbar] Text copied to clipboard");
      }

      // Clear selection and hide toolbar
      if (selectionApi) {
        selectionApi.clear();
      }
      setShowToolbar(false);
      hasSelectionRef.current = false;
      cachedSelectionRef.current = null;
    },
    [selectionApi],
  );

  // Create text markup annotation from current or cached selection
  const createTextMarkup = useCallback(
    async (toolId: "highlight" | "underline" | "strikeout") => {
      if (!annotationApi) {
        console.log("[PDF] No annotation API available");
        return;
      }

      console.log("[PDF] Creating text markup:", toolId);

      // Try to get current selection, fall back to cached
      // biome-ignore lint/suspicious/noExplicitAny: SDK type compatibility
      let selections: any[] | null = null;

      if (selectionApi) {
        try {
          const currentSelection = selectionApi.getFormattedSelection();
          console.log(
            "[PDF] Current selection:",
            currentSelection?.length,
            "items",
          );
          if (currentSelection && currentSelection.length > 0) {
            selections = currentSelection;
          }
        } catch (error) {
          console.log("[PDF] Error getting current selection:", error);
          // Selection might have been cleared
        }
      }

      // Fall back to cached selection if no current selection
      if (!selections && cachedSelectionRef.current) {
        console.log("[PDF] Using cached selection");
        selections = cachedSelectionRef.current.formatted;
      }

      if (!selections || selections.length === 0) {
        console.log("[PDF] No selection available for text markup");
        return;
      }

      console.log("[PDF] Processing", selections.length, "selections");

      // Map toolId to PdfAnnotationSubtype and default colors
      const typeMap: Record<string, PdfAnnotationSubtype> = {
        highlight: PdfAnnotationSubtype.HIGHLIGHT,
        underline: PdfAnnotationSubtype.UNDERLINE,
        strikeout: PdfAnnotationSubtype.STRIKEOUT,
      };
      const colorMap: Record<string, string> = {
        highlight: "#FFFF00",
        underline: "#0000FF",
        strikeout: "#FF0000",
      };

      const annotationType = typeMap[toolId];
      const defaultColor = colorMap[toolId];

      // Get text content for annotation
      let textContent = "";
      if (selectionApi) {
        try {
          const textTask = selectionApi.getSelectedText();
          const textResult = await textTask.toPromise();
          console.log("[PDF] Selected text:", textResult);
          if (textResult && textResult.length > 0) {
            textContent = textResult.join(" ");
          }
        } catch (error) {
          console.log("[PDF] Could not get text content:", error);
        }
      }

      // Create annotations for each selection
      for (const selection of selections) {
        try {
          console.log(
            "[PDF] Creating annotation on page",
            selection.pageIndex,
            "with rects:",
            selection.segmentRects,
          );

          // biome-ignore lint/suspicious/noExplicitAny: SDK type compatibility
          const annotation: any = {
            type: annotationType,
            color: defaultColor,
            opacity: 0.5,
            segmentRects: selection.segmentRects,
            rect: selection.rect,
          };

          // Add text content if available
          if (textContent) {
            annotation.contents = textContent;
          }

          annotationApi.createAnnotation(selection.pageIndex, annotation);
          console.log("[PDF] Successfully created annotation");
        } catch (error) {
          console.error("[PDF] Error creating annotation:", error);
        }
      }

      // IMPORTANT: Commit annotations to ensure they persist
      try {
        await annotationApi.commit();
        console.log("[PDF] Annotations committed successfully");
      } catch (error) {
        console.error("[PDF] Error committing annotations:", error);
      }

      // Clear the text selection so it doesn't interfere with the new annotation
      if (selectionApi) {
        selectionApi.clear();
        console.log("[PDF] Text selection cleared after creating annotation");
      }

      // Reset selection tracking state
      hasSelectionRef.current = false;
      cachedSelectionRef.current = null;

      // Hide toolbar after a short delay to give user feedback
      // This makes the transition smoother
      setTimeout(() => {
        setShowToolbar(false);
        console.log("[PDF] Toolbar hidden. Ready for new selection.");
      }, 150);
    },
    [annotationApi, selectionApi],
  );

  const handleHighlight = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsProcessing(true);
      try {
        await createTextMarkup("highlight");
      } finally {
        setIsProcessing(false);
      }
    },
    [createTextMarkup],
  );

  const handleUnderline = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsProcessing(true);
      try {
        await createTextMarkup("underline");
      } finally {
        setIsProcessing(false);
      }
    },
    [createTextMarkup],
  );

  const handleStrikeout = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsProcessing(true);
      try {
        await createTextMarkup("strikeout");
      } finally {
        setIsProcessing(false);
      }
    },
    [createTextMarkup],
  );

  // Handle Escape key to clear selection and hide toolbar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showToolbar && !isProcessing) {
        console.log("[PDF Toolbar] Escape pressed, clearing selection");
        e.preventDefault();
        e.stopPropagation();

        // Clear text selection
        if (selectionApi) {
          selectionApi.clear();
        }

        // Reset tracking state
        hasSelectionRef.current = false;

        // Clear cache and hide toolbar
        cachedSelectionRef.current = null;
        setShowToolbar(false);
        console.log("[PDF Toolbar] Toolbar hidden and selection cleared");
      }
    };

    // Use capture to ensure we get the event first when toolbar is visible
    if (showToolbar) {
      document.addEventListener("keydown", handleKeyDown, { capture: true });
      return () => {
        document.removeEventListener("keydown", handleKeyDown, {
          capture: true,
        });
      };
    }
  }, [showToolbar, isProcessing, selectionApi]);

  if (!showToolbar) return null;

  return (
    <div
      role="toolbar"
      aria-label="Text selection actions"
      className="fixed z-[100] pointer-events-auto"
      style={{
        left: toolbarPosition.x,
        top: toolbarPosition.y,
        transform: "translate(-50%, -100%) translateY(-12px)",
      }}
      onMouseDown={(e) => {
        // Prevent default to avoid losing selection when clicking toolbar
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className="flex items-center gap-1 bg-zinc-800 rounded-full shadow-2xl px-2 py-1.5 border border-zinc-700"
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Copy */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-700 transition-colors text-zinc-300 hover:text-white"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleCopy}
            >
              <IconCopy size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-zinc-900 text-white border-zinc-700"
          >
            Copy (Ctrl+C)
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="w-px h-5 bg-zinc-600 mx-0.5" />

        {/* Highlight */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={isProcessing}
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                "hover:bg-yellow-500/20",
                isProcessing && "opacity-50 cursor-not-allowed",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleHighlight}
            >
              {isProcessing ? (
                <IconLoader2
                  size={15}
                  className="animate-spin text-yellow-400"
                />
              ) : (
                <IconHighlight size={15} className="text-yellow-400" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-zinc-900 text-white border-zinc-700"
          >
            Highlight
          </TooltipContent>
        </Tooltip>

        {/* Underline */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={isProcessing}
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                "hover:bg-zinc-700 text-zinc-300 hover:text-white",
                isProcessing && "opacity-50 cursor-not-allowed",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleUnderline}
            >
              {isProcessing ? (
                <IconLoader2 size={15} className="animate-spin" />
              ) : (
                <IconUnderline size={15} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-zinc-900 text-white border-zinc-700"
          >
            Underline
          </TooltipContent>
        </Tooltip>

        {/* Strikeout */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={isProcessing}
              className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                "hover:bg-zinc-700 text-zinc-300 hover:text-white",
                isProcessing && "opacity-50 cursor-not-allowed",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleStrikeout}
            >
              {isProcessing ? (
                <IconLoader2 size={15} className="animate-spin" />
              ) : (
                <IconStrikethrough size={15} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-zinc-900 text-white border-zinc-700"
          >
            Strikeout
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
});

/**
 * Save Status Indicator Component
 * Shows the current save status of PDF annotations
 */
const SaveStatusIndicator = memo(function SaveStatusIndicator({
  status,
  pdfName,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
  pdfName?: string;
}) {
  if (status === 'idle') return null;

  const statusConfig = {
    saving: {
      icon: IconCloudUpload,
      text: 'Saving...',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    saved: {
      icon: IconCloudCheck,
      text: 'Saved to cloud',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    error: {
      icon: IconCloudX,
      text: 'Save failed',
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all',
        config.color,
        config.bgColor,
      )}
    >
      <Icon
        size={14}
        className={status === 'saving' ? 'animate-pulse' : ''}
      />
      <span>{config.text}</span>
    </div>
  );
});

interface AnnotationToolbarProps {
  onToggleSearch: () => void;
  onToggleThumbnails: () => void;
  isSearchOpen: boolean;
  isThumbnailsOpen: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  pdfName?: string;
}

/**
 * Full Annotation Toolbar with all tools
 */
const AnnotationToolbar = memo(function AnnotationToolbar({
  onToggleSearch,
  onToggleThumbnails,
  isSearchOpen,
  isThumbnailsOpen,
  saveStatus,
  pdfName,
}: AnnotationToolbarProps) {
  const { registry } = useRegistry();
  const { provides: annotationApi } = useAnnotationCapability();
  const { provides: zoomApi } = useZoomCapability();
  const { provides: historyApi } = useHistoryCapability();
  const { provides: loaderApi } = useLoaderCapability();

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [, setCanRedo] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [isMarqueeZoomActive, setIsMarqueeZoomActive] = useState(false);
  const [currentRotation, setCurrentRotation] = useState<Rotation>(Rotation.Degree0);
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
  const [isOutlineEditorOpen, setIsOutlineEditorOpen] = useState(false);
  const [isMergeToolOpen, setIsMergeToolOpen] = useState(false);
  const [isAttachmentEditorOpen, setIsAttachmentEditorOpen] = useState(false);

  // Track available width for responsive toolbar
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  // Measure available width for responsive behavior
  useEffect(() => {
    const updateWidth = () => {
      if (toolbarRef.current) {
        const width = toolbarRef.current.offsetWidth;
        setAvailableWidth(width);
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Log available tools on mount (for debugging)
  useEffect(() => {
    if (!annotationApi) return;
    const tools = annotationApi.getTools();
    console.log(
      "[PDF] Available annotation tools:",
      tools.map((t) => t.id),
    );
  }, [annotationApi]);

  // Listen to annotation state changes
  useEffect(() => {
    if (!annotationApi) return;
    const unsubscribe = annotationApi.onStateChange(
      (state: AnnotationState) => {
        setHasSelection(state.selectedUid !== null);
        setActiveTool(state.activeToolId);
      },
    );
    return unsubscribe;
  }, [annotationApi]);

  // Auto-deselect after annotation creation to allow continuous drawing
  // When a tool is active and an annotation is created, deselect it immediately
  // This allows creating multiple annotations without manual deselection
  useEffect(() => {
    if (!annotationApi) return;

    const unsubscribe = annotationApi.onAnnotationEvent((event) => {
      // Only handle 'create' events that are committed
      if (event.type === 'create' && event.committed) {
        const activeTool = annotationApi.getActiveTool();

        // If a drawing/markup tool is active, deselect the newly created annotation
        // This allows the user to immediately create another annotation
        if (activeTool && activeTool.id !== 'select') {
          console.log('[PDF] Auto-deselecting annotation to continue with active tool:', activeTool.id);

          // Small delay to ensure the annotation is fully processed
          setTimeout(() => {
            annotationApi.deselectAnnotation();
          }, 10);
        }
      }
    });

    return unsubscribe;
  }, [annotationApi]);

  // Listen to history for undo/redo
  useEffect(() => {
    if (!historyApi) return;
    const updateHistoryState = () => {
      setCanUndo(historyApi.canUndo());
      setCanRedo(historyApi.canRedo());
    };
    updateHistoryState();
    const unsubscribe = historyApi.onHistoryChange(updateHistoryState);
    return unsubscribe;
  }, [historyApi]);

  // Listen to zoom changes
  useEffect(() => {
    if (!zoomApi) return;
    const unsubscribe = zoomApi.onZoomChange((event: ZoomChangeEvent) => {
      setCurrentZoom(event.newZoom);
    });
    const initialState: ZoomState = zoomApi.getState();
    setCurrentZoom(initialState.currentZoomLevel);
    return unsubscribe;
  }, [zoomApi]);

  // Listen to rotation changes from core state
  useEffect(() => {
    if (!registry) return;

    const store = registry.getStore();
    const currentState = store.getState();

    // Set initial rotation from core state
    const initialRotation = (currentState as any)?.core?.rotation;
    if (initialRotation !== undefined) {
      setCurrentRotation(initialRotation);
    }

    // Subscribe to state changes
    const unsubscribe = store.subscribe((state) => {
      const rotation = (state as any)?.core?.rotation;
      if (rotation !== undefined && rotation !== currentRotation) {
        setCurrentRotation(rotation);
        console.log(`[PDF] Rotation updated to ${rotation * 90}°`);
      }
    });

    return unsubscribe;
  }, [registry, currentRotation]);

  const handleToolSelect = useCallback(
    (toolId: string | null) => {
      if (!annotationApi) return;
      annotationApi.setActiveTool(toolId);
      setActiveTool(toolId);
    },
    [annotationApi],
  );

  const handleDelete = useCallback(async () => {
    if (!annotationApi) return;
    const selection = annotationApi.getSelectedAnnotation();
    if (selection) {
      annotationApi.deleteAnnotation(
        selection.object.pageIndex,
        selection.object.id,
      );
      await annotationApi.commit();
      annotationApi.deselectAnnotation();
    }
  }, [annotationApi]);

  const handleZoomIn = useCallback(() => zoomApi?.zoomIn(), [zoomApi]);
  const handleZoomOut = useCallback(() => zoomApi?.zoomOut(), [zoomApi]);
  const handleZoomReset = useCallback(() => zoomApi?.requestZoom(1), [zoomApi]);
  const handleToggleMarqueeZoom = useCallback(() => {
    if (!zoomApi) return;
    zoomApi.toggleMarqueeZoom();
    // Check the new state
    const isActive = zoomApi.isMarqueeZoomActive?.() ?? false;
    setIsMarqueeZoomActive(isActive);
    console.log("[PDF] Marquee zoom toggled:", isActive);
  }, [zoomApi]);
  const handleUndo = useCallback(() => historyApi?.undo(), [historyApi]);

  // Rotation handler - cycles through 0° → 90° → 180° → 270° → 0°
  const handleRotate = useCallback(() => {
    if (!registry || !loaderApi) return;

    try {
      const doc = loaderApi.getDocument();
      if (!doc) {
        console.warn('[PDF] No document loaded');
        return;
      }

      const engine = registry.getEngine() as any;
      if (!engine || !engine.pdfium) {
        console.warn('[PDF] PDFium engine not available');
        return;
      }

      const pdfium = engine.pdfium;

      // Get current page
      const viewportState = registry.getStore().getState().viewport;
      const currentPageIndex = viewportState?.focusedPageIndex ?? 0;

      // Get page handle
      const pageHandle = pdfium.FPDF_LoadPage(doc.handle, currentPageIndex);
      if (!pageHandle) {
        console.warn('[PDF] Failed to load page for rotation');
        return;
      }

      // Get current rotation using native API
      const currentRotation = pdfium.FPDFPage_GetRotation(pageHandle);
      const nextRotation = (currentRotation + 1) % 4;
      const rotationDegrees = nextRotation * 90;

      console.log(`[PDF] Rotating page ${currentPageIndex} from ${currentRotation * 90}° to ${rotationDegrees}° using native API`);

      // Set rotation using native PDFium API
      pdfium.FPDFPage_SetRotation(pageHandle, nextRotation);

      // Close the page
      pdfium.FPDF_ClosePage(pageHandle);

      // Update state to trigger re-render
      setCurrentRotation(nextRotation as Rotation);

      // Also dispatch to core for UI update
      const store = registry.getStore();
      store.dispatchToCore({
        type: "SET_ROTATION",
        payload: nextRotation as Rotation,
      });

      console.log(`[PDF] Native rotation applied successfully to ${rotationDegrees}°`);
    } catch (error) {
      console.error("[PDF] Native rotation error:", error);
    }
  }, [registry, loaderApi]);

  const handleCommit = useCallback(async () => {
    if (!annotationApi) return;
    try {
      await annotationApi.commit();
      console.log("[PDF] Annotations committed successfully");
    } catch (err) {
      console.error("[PDF] Failed to commit annotations:", err);
    }
  }, [annotationApi]);

  // Define all annotation tools in order of priority (left to right)
  // Most important tools first - these should always be visible
  const allAnnotationTools = [
    { id: 'select', icon: IconPointer, tooltip: 'Select', toolId: null },
    { id: 'highlight', icon: IconHighlight, tooltip: 'Highlight', toolId: 'highlight' },
    { id: 'ink', icon: IconPencil, tooltip: 'Pen', toolId: 'ink' },
    { id: 'underline', icon: IconUnderline, tooltip: 'Underline', toolId: 'underline' },
    { id: 'strikeout', icon: IconStrikethrough, tooltip: 'Strikeout', toolId: 'strikeout' },
    { id: 'inkHighlighter', icon: IconBrush, tooltip: 'Brush', toolId: 'inkHighlighter' },
    { id: 'square', icon: IconSquare, tooltip: 'Rectangle', toolId: 'square' },
    { id: 'circle', icon: IconCircle, tooltip: 'Circle', toolId: 'circle' },
    { id: 'line', icon: IconLine, tooltip: 'Line', toolId: 'line' },
    { id: 'freeText', icon: IconTextCaption, tooltip: 'Text', toolId: 'freeText' },
  ];

  // Calculate how many tools can fit
  // Button width: ~32px, gap: 4px = 36px per button
  // Reserve space for: Separator (20px) + Actions (3*36=108) + Separator (20px) + Right controls (300px) + Overflow button (40px) = ~488px
  const reservedSpace = 488;
  const buttonWidth = 36;
  const overflowButtonWidth = 40;

  const availableSpaceForTools = Math.max(0, availableWidth - reservedSpace - overflowButtonWidth);
  const maxVisibleTools = Math.floor(availableSpaceForTools / buttonWidth);

  // Split tools into visible and overflow
  const visibleTools = allAnnotationTools.slice(0, Math.max(3, maxVisibleTools)); // Always show at least 3 primary tools
  const overflowTools = allAnnotationTools.slice(visibleTools.length);
  const showDropdown = overflowTools.length > 0;

  // Right-side controls visibility
  const showThumbnails = availableWidth > 450;
  const showZoomControls = availableWidth > 500;
  const showZoomReset = availableWidth > 900;
  const showAreaZoom = availableWidth > 950;

  return (
    <div
      ref={toolbarRef}
      className="flex items-center gap-1 px-2 py-2 border-b border-border bg-background shrink-0 min-h-[48px]"
    >
      {/* Visible annotation tools - dynamically determined by available width */}
      {visibleTools.map((tool) => (
        <ToolButton
          key={tool.id}
          icon={tool.icon}
          tooltip={tool.tooltip}
          isActive={tool.toolId === null ? !activeTool : activeTool === tool.toolId}
          onClick={() => handleToolSelect(tool.toolId)}
        />
      ))}

      {/* Overflow dropdown - contains tools that don't fit */}
      {showDropdown && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8",
                overflowTools.some(t => t.toolId === activeTool) && "bg-accent"
              )}
            >
              <IconDotsVertical size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <div className="grid gap-0.5">
              {overflowTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Button
                    key={tool.id}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "justify-start h-8",
                      (tool.toolId === null ? !activeTool : activeTool === tool.toolId) && "bg-accent",
                    )}
                    onClick={() => handleToolSelect(tool.toolId)}
                  >
                    <Icon size={14} className="mr-2" />
                    {tool.tooltip}
                  </Button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Action buttons */}
      <ToolButton
        icon={IconArrowBackUp}
        tooltip="Undo"
        onClick={handleUndo}
        disabled={!canUndo}
      />
      <ToolButton
        icon={IconTrash}
        tooltip="Delete"
        onClick={handleDelete}
        disabled={!hasSelection}
      />
      <ToolButton
        icon={IconRotateClockwise}
        tooltip={`Rotate (${currentRotation * 90}°)`}
        onClick={handleRotate}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-side controls */}
      <SaveStatusIndicator status={saveStatus} pdfName={pdfName} />

      {showThumbnails && (
        <ToolButton
          icon={IconLayoutSidebarRight}
          tooltip="Thumbnails"
          isActive={isThumbnailsOpen}
          onClick={onToggleThumbnails}
        />
      )}

      <ToolButton
        icon={IconSearch}
        tooltip="Search"
        isActive={isSearchOpen}
        onClick={onToggleSearch}
      />

      {showZoomControls && (
        <>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <ToolButton
            icon={IconZoomOut}
            tooltip="Zoom Out"
            onClick={handleZoomOut}
          />
          <span className="text-xs font-medium text-muted-foreground min-w-[45px] text-center">
            {Math.round(currentZoom * 100)}%
          </span>
          <ToolButton icon={IconZoomIn} tooltip="Zoom In" onClick={handleZoomIn} />
          {showZoomReset && (
            <ToolButton
              icon={IconZoomReset}
              tooltip="Reset Zoom"
              onClick={handleZoomReset}
            />
          )}
          {showAreaZoom && (
            <ToolButton
              icon={IconZoomScan}
              tooltip="Area Zoom"
              isActive={isMarqueeZoomActive}
              onClick={handleToggleMarqueeZoom}
            />
          )}
        </>
      )}

      {/* Additional tools dropdown - for metadata, merge, etc. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <IconDotsVertical size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-1" align="end">
          <div className="grid gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start h-8"
              onClick={() => setIsMetadataEditorOpen(true)}
            >
              <IconInfoCircle size={14} className="mr-2" />
              Edit Metadata
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start h-8"
              onClick={() => setIsOutlineEditorOpen(true)}
            >
              <IconBookmark size={14} className="mr-2" />
              Edit Outline
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start h-8"
              onClick={() => setIsMergeToolOpen(true)}
            >
              <IconFilesOff size={14} className="mr-2" />
              Merge PDFs
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start h-8"
              onClick={() => setIsAttachmentEditorOpen(true)}
            >
              <IconPaperclip size={14} className="mr-2" />
              Attachments
            </Button>
            {isElectron() && (
              <>
                <Separator className="my-1" />
                <DownloadButton />
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});

/**
 * Download Button Component
 */
const DownloadButton = memo(function DownloadButton() {
  const { provides: loaderApi } = useLoaderCapability();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!loaderApi || !isElectron()) return;

    setIsDownloading(true);
    try {
      const doc = loaderApi.getDocument();
      if (!doc?.source?.data) {
        console.error('[PDF] No document data available for download');
        return;
      }

      // Get the ArrayBuffer from the document
      const arrayBuffer = doc.source.data;
      const uint8Array = new Uint8Array(arrayBuffer);

      // Open save dialog
      const result = await window.desktopApi!.showSaveDialog({
        defaultPath: 'document.pdf',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });

      if (!result.canceled && result.filePath) {
        // Save file using IPC
        await window.desktopApi!.saveFile(result.filePath, uint8Array);
        console.log('[PDF] File downloaded successfully:', result.filePath);
      }
    } catch (error) {
      console.error('[PDF] Error downloading file:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [loaderApi]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="justify-start h-8"
      onClick={handleDownload}
      disabled={isDownloading}
    >
      {isDownloading ? (
        <IconLoader2 size={14} className="mr-2 animate-spin" />
      ) : (
        <IconDownload size={14} className="mr-2" />
      )}
      Download PDF
    </Button>
  );
});


/**
 * Tool Button Props - Enhanced version with more options
 */
interface ToolButtonProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tooltip: string;
  isActive?: boolean;
  disabled?: boolean;
  variant?: "default" | "destructive";
  color?: string;
  onClick: () => void;
  className?: string;
}

const ToolButton = memo(function ToolButton({
  icon: Icon,
  tooltip,
  isActive,
  disabled,
  variant = "default",
  color,
  onClick,
  className,
}: ToolButtonProps) {
  // Use span wrapper if color is provided to style the icon
  const iconColor = color && isActive ? color : undefined;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? "secondary" : "ghost"}
          size="icon"
          className={cn(
            "h-8 w-8",
            isActive && "bg-primary/10 text-primary ring-1 ring-primary/20",
            variant === "destructive" &&
              !disabled &&
              "hover:bg-destructive/10 hover:text-destructive",
            className,
          )}
          onClick={onClick}
          disabled={disabled}
          style={iconColor ? { color: iconColor } : undefined}
        >
          <Icon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
});

/**
 * Empty state when no PDF is selected
 */
const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full bg-muted/20">
      <div className="text-center max-w-sm px-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-5">
          <IconFileTypePdf size={32} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No PDF Selected</h3>
        <p className="text-sm text-muted-foreground">
          Select a document from the sidebar to start viewing and annotating.
        </p>
      </div>
    </div>
  );
});
