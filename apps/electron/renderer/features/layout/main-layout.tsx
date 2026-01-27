import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
import {
  IconPlus,
  IconLayoutSidebarLeftExpand,
  IconHistory,
  IconTable,
  IconFileText,
} from "@tabler/icons-react";
import { ChatQueueProcessor } from "@/features/chat/components/queue-processor";
import { trpc } from "@/lib/trpc";
import {
  sidebarOpenAtom,
  notesSidebarOpenAtom,
  pdfSidebarOpenAtom,
  artifactPanelOpenAtom,
  selectedArtifactAtom,
  selectedChatIdAtom,
  activeTabAtom,
  shortcutsDialogOpenAtom,
  settingsModalOpenAtom,
  settingsActiveTabAtom,
  type SettingsTab,
  commandKOpenAtom,
  reasoningEffortAtom,
  supportsReasoningAtom,
  addLocalPdfAtom,
  createPdfSourceFromLocalFile,
  agentPanelOpenAtom,
  type ReasoningEffort,
} from "@/lib/atoms";
import {
  excelScratchSessionIdAtom,
  docScratchSessionIdAtom,
  currentExcelFileIdAtom,
  currentExcelFileAtom,
  currentDocFileIdAtom,
  currentDocFileAtom,
  fileSnapshotCacheAtom,
} from "@/lib/atoms/user-files";
import { excelSidebarOpenAtom, docSidebarOpenAtom } from "@/lib/atoms";
import { Sidebar } from "@/features/sidebar/sidebar";
import { NotesSidebar } from "@/features/notes/notes-sidebar";
import { NotesPageTabs } from "@/features/notes/notes-page-tabs";
import { ChatView } from "@/features/chat/chat-view";
import { GalleryView } from "@/features/gallery/gallery-view";
import { TitleBar } from "./title-bar";
import { cn, isMacOS } from "@/lib/utils";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ShortcutsDialog } from "@/features/help/shortcuts-dialog";
import { CommandKDialog } from "@/features/chat/command-k-dialog";
import { useHotkeys } from "react-hotkeys-hook";
import { useUniverTheme } from "@/features/univer/use-univer-theme";
import {
  exportToExcel,
  exportToExcelBuffer,
} from "@/features/univer/excel-exchange";
import { toast } from "sonner";
import { FileVersionHistoryPanel } from "@/components/file-version-history-panel-compact";

// Lazy load heavy Univer components to improve initial load time
const ArtifactPanel = lazy(() =>
  import("@/features/artifacts/artifact-panel").then((m) => ({
    default: m.ArtifactPanel,
  })),
);
const UniverSpreadsheet = lazy(() =>
  import("@/features/univer/univer-spreadsheet").then((m) => ({
    default: m.UniverSpreadsheet,
  })),
);
const UniverDocument = lazy(() =>
  import("@/features/univer/univer-document").then((m) => ({
    default: m.UniverDocument,
  })),
);
const PdfTabView = lazy(() =>
  import("@/features/pdf/pdf-tab-view").then((m) => ({
    default: m.PdfTabView,
  })),
);
const IdeasView = lazy(() =>
  import("@/features/ideas/ideas-view").then((m) => ({ default: m.IdeasView })),
);
const AgentPanel = lazy(() =>
  import("@/features/agent/agent-panel").then((m) => ({
    default: m.AgentPanel,
  })),
);
const FilesSidebar = lazy(() =>
  import("@/features/files/files-sidebar").then((m) => ({
    default: m.FilesSidebar,
  })),
);
const FileHeader = lazy(() =>
  import("@/features/files/file-header").then((m) => ({
    default: m.FileHeader,
  })),
);
const settingsTabs: SettingsTab[] = [
  "account",
  "appearance",
  "api-keys",
  "advanced",
  "shortcuts",
  "debug",
  "usage",
];

// Loading fallback for lazy components
function PanelLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const [notesSidebarOpen] = useAtom(notesSidebarOpenAtom);
  const [pdfSidebarOpen] = useAtom(pdfSidebarOpenAtom);
  const [artifactPanelOpen, setArtifactPanelOpen] = useAtom(
    artifactPanelOpenAtom,
  );
  const [agentPanelOpen, setAgentPanelOpen] = useAtom(agentPanelOpenAtom);
  const selectedArtifact = useAtomValue(selectedArtifactAtom);
  const excelScratchId = useAtomValue(excelScratchSessionIdAtom);
  const docScratchId = useAtomValue(docScratchSessionIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);

  // Excel file system atoms
  const [excelSidebarOpen, setExcelSidebarOpen] = useAtom(excelSidebarOpenAtom);
  const currentExcelFileId = useAtomValue(currentExcelFileIdAtom);
  const currentExcelFile = useAtomValue(currentExcelFileAtom);
  const setCurrentExcelFile = useSetAtom(currentExcelFileAtom);
  const setFileSnapshotCache = useSetAtom(fileSnapshotCacheAtom);

  // Doc file system atoms
  const [docSidebarOpen, setDocSidebarOpen] = useAtom(docSidebarOpenAtom);
  const currentDocFileId = useAtomValue(currentDocFileIdAtom);
  const currentDocFile = useAtomValue(currentDocFileAtom);
  const setCurrentDocFile = useSetAtom(currentDocFileAtom);

  // Version history panel state
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionHistoryFileId, setVersionHistoryFileId] = useState<
    string | null
  >(null);
  const [versionHistoryFileType, setVersionHistoryFileType] = useState<
    "excel" | "doc" | "note"
  >("excel");
  const [previewVersionNumber, setPreviewVersionNumber] = useState<
    number | null
  >(null);
  const [previewVersionData, setPreviewVersionData] = useState<any>(null);

  // Refs to Univer components for saving
  const univerSpreadsheetRef = useRef<any>(null);
  const univerDocumentRef = useRef<any>(null);

  // Track previous tab to save on tab switch
  const previousTabRef = useRef<string>(activeTab);
  const [, setShortcutsOpen] = useAtom(shortcutsDialogOpenAtom);
  const setSettingsOpen = useSetAtom(settingsModalOpenAtom);
  const setSettingsTab = useSetAtom(settingsActiveTabAtom);
  const setSelectedArtifact = useSetAtom(selectedArtifactAtom);
  const setCommandKOpen = useSetAtom(commandKOpenAtom);
  const setReasoningEffort = useSetAtom(reasoningEffortAtom);
  const supportsReasoning = useAtomValue(supportsReasoningAtom);
  const addLocalPdf = useSetAtom(addLocalPdfAtom);
  const utils = trpc.useUtils();

  // Sync Univer theme with app dark/light mode
  useUniverTheme();

  // Save Excel state when switching tabs
  useEffect(() => {
    if (previousTabRef.current === "excel" && activeTab !== "excel") {
      // Switching away from Excel tab - save current state
      if (univerSpreadsheetRef.current?.getSnapshot) {
        const effectiveId = currentExcelFileId || excelScratchId;
        try {
          const snapshot = univerSpreadsheetRef.current.getSnapshot();
          if (snapshot && effectiveId) {
            setFileSnapshotCache((prev) => ({
              ...prev,
              [effectiveId]: {
                univerData: snapshot,
                timestamp: Date.now(),
                isDirty: true,
              },
            }));
            console.log(
              "[MainLayout] Saved Excel snapshot on tab switch:",
              effectiveId,
            );
          }
        } catch (err) {
          console.error(
            "[MainLayout] Failed to save Excel snapshot on tab switch:",
            err,
          );
        }
      }
    }
    previousTabRef.current = activeTab;
  }, [activeTab, currentExcelFileId, excelScratchId, setFileSnapshotCache]);

  const createChat = trpc.chats.create.useMutation({
    onSuccess: (chat) => {
      setSelectedChatId(chat.id);
      setActiveTab("chat");
      utils.chats.list.invalidate();
    },
  });

  const renameFileMutation = trpc.userFiles.rename.useMutation({
    onSuccess: (updatedFile) => {
      if (updatedFile.type === "excel") {
        setCurrentExcelFile(updatedFile);
      }
      if (updatedFile.type === "doc") {
        setCurrentDocFile(updatedFile);
      }
      utils.userFiles.list.invalidate({ type: updatedFile.type });
    },
  });

  const handleNewChat = useCallback(
    (message?: string | React.MouseEvent) => {
      const title =
        typeof message === "string"
          ? message.length > 30
            ? `${message.substring(0, 30)}...`
            : message
          : "New Chat";
      createChat.mutate({ title });
    },
    [createChat],
  );

  const handleRenameExcel = useCallback(
    (newName: string) => {
      if (!currentExcelFileId) return;
      renameFileMutation.mutate({ id: currentExcelFileId, name: newName });
    },
    [currentExcelFileId, renameFileMutation],
  );

  const handleRenameDoc = useCallback(
    (newName: string) => {
      if (!currentDocFileId) return;
      renameFileMutation.mutate({ id: currentDocFileId, name: newName });
    },
    [currentDocFileId, renameFileMutation],
  );

  // Handle version preview - load version data into Univer
  const handlePreviewVersion = useCallback(
    async (versionNumber: number | null) => {
      setPreviewVersionNumber(versionNumber);

      if (!versionNumber || !versionHistoryFileId) {
        setPreviewVersionData(null);
        return;
      }

      try {
        const versionData = await utils.userFiles.getVersion.fetch({
          fileId: versionHistoryFileId,
          versionNumber,
        });
        setPreviewVersionData(versionData);
      } catch (error) {
        console.error("[MainLayout] Failed to load version:", error);
        toast.error("Error al cargar versión");
        setPreviewVersionData(null);
      }
    },
    [versionHistoryFileId, utils.userFiles.getVersion],
  );

  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer) => {
    const uint8Array = new Uint8Array(buffer);
    const chunkSize = 0x8000; // 32KB chunks
    let base64 = "";

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(
        i,
        Math.min(i + chunkSize, uint8Array.length),
      );
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }

    return btoa(base64);
  }, []);

  const handleExportExcel = useCallback(async () => {
    try {
      const snapshot = univerSpreadsheetRef.current?.getSnapshot?.();
      if (!snapshot) {
        toast.error("No hay datos para exportar");
        return;
      }

      const baseName = currentExcelFile?.name || "spreadsheet";

      if (window.desktopApi?.excel?.saveLocal) {
        const buffer = await exportToExcelBuffer(snapshot);
        const base64 = arrayBufferToBase64(buffer);
        const result = await window.desktopApi.excel.saveLocal({
          base64,
          suggestedName: `${baseName}.xlsx`,
        });

        if (result?.success) {
          toast.success("Excel exportado");
        } else if (!result?.canceled) {
          toast.error(result?.error || "No se pudo exportar el Excel");
        }
        return;
      }

      await exportToExcel(snapshot, baseName);
      toast.success("Excel exportado");
    } catch (error) {
      console.error("[MainLayout] Export Excel failed:", error);
      toast.error("No se pudo exportar el Excel");
    }
  }, [
    arrayBufferToBase64,
    currentExcelFile,
    exportToExcelBuffer,
    exportToExcel,
  ]);

  // Global Listeners for Tray Events
  useEffect(() => {
    const api = window.desktopApi;
    if (!api?.tray) return;

    const cleanups = [
      api.tray.onAction("new-chat", (data) => {
        handleNewChat(data?.message);
      }),
      api.tray.onAction("new-spreadsheet", () => {
        setActiveTab("excel");
        setSelectedArtifact(null);
      }),
      api.tray.onAction("new-document", () => {
        setActiveTab("doc");
        setSelectedArtifact(null);
      }),
      api.tray.onAction("open-item", (data) => {
        const { itemId, type } = data;
        if (type === "chat") {
          setSelectedChatId(itemId);
          setActiveTab("chat");
        } else if (type === "spreadsheet") {
          setActiveTab("excel");
        } else if (type === "document") {
          setActiveTab("doc");
        }
      }),
      api.tray.onAction("open-settings", (data?: { tab?: string }) => {
        if (data?.tab && settingsTabs.includes(data.tab as SettingsTab)) {
          setSettingsTab(data.tab as SettingsTab);
        }
        setSettingsOpen(true);
      }),
    ];

    // Listen for local PDFs opened from tray
    if (api.pdf?.onOpenLocalPdfs) {
      cleanups.push(
        api.pdf.onOpenLocalPdfs(
          (data: {
            files: Array<{ path: string; name: string; size: number }>;
          }) => {
            console.log(
              "[MainLayout] Opening local PDFs from tray:",
              data.files.length,
            );
            for (const file of data.files) {
              const pdfSource = createPdfSourceFromLocalFile({
                path: file.path,
                name: file.name,
                size: file.size,
              });
              addLocalPdf(pdfSource);
            }
            // Switch to PDF tab
            setActiveTab("pdf");
          },
        ),
      );
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [
    handleNewChat,
    setActiveTab,
    setSelectedArtifact,
    setSelectedChatId,
    setSettingsOpen,
    setSettingsTab,
    addLocalPdf,
  ]);

  // Global Listeners for Native Menu Bar Events (macOS File, Edit, View menus)
  useEffect(() => {
    const api = window.desktopApi;
    if (!api?.menu) return;

    const cleanups = [
      // File menu
      api.menu.onNewChat(() => {
        handleNewChat();
      }),
      api.menu.onNewSpreadsheet(() => {
        setActiveTab("excel");
        setSelectedArtifact(null);
      }),
      api.menu.onNewDocument(() => {
        setActiveTab("doc");
        setSelectedArtifact(null);
      }),
      api.menu.onFilesImported(() => {
        console.log("[MainLayout] Files imported from menu");
      }),
      api.menu.onOpenPdf(
        (data: {
          files: Array<{ path: string; name: string; size: number }>;
        }) => {
          console.log(
            "[MainLayout] Opening PDFs from menu:",
            data.files.length,
          );
          for (const file of data.files) {
            const pdfSource = createPdfSourceFromLocalFile({
              path: file.path,
              name: file.name,
              size: file.size,
            });
            addLocalPdf(pdfSource);
          }
          setActiveTab("pdf");
        },
      ),
      // View menu
      api.menu.onToggleSidebar(() => {
        setSidebarOpen((prev) => !prev);
      }),
      api.menu.onShowShortcuts(() => {
        setShortcutsOpen((prev) => !prev);
      }),
      // Go menu
      api.menu.onGoToTab((data: { tab: string }) => {
        const validTabs: Array<
          "chat" | "excel" | "doc" | "pdf" | "ideas" | "gallery"
        > = ["chat", "excel", "doc", "pdf", "ideas", "gallery"];
        if (validTabs.includes(data.tab as any)) {
          setActiveTab(data.tab as any);
        }
      }),
      api.menu.onCommandK(() => {
        setCommandKOpen(true);
      }),
      // Chat menu
      api.menu.onStopGeneration(() => {
        // Send event to chat view to stop generation
        window.dispatchEvent(new CustomEvent("chat:stop-generation"));
      }),
      api.menu.onCycleReasoning(() => {
        if (supportsReasoning) {
          setReasoningEffort(
            (prev) =>
              ({ low: "medium", medium: "high", high: "low" })[
                prev
              ] as ReasoningEffort,
          );
        }
      }),
      api.menu.onClearChat(() => {
        // Send event to chat view to clear messages
        window.dispatchEvent(new CustomEvent("chat:clear"));
      }),
      api.menu.onArchiveChat(() => {
        // Send event to sidebar to archive current chat
        window.dispatchEvent(new CustomEvent("chat:archive"));
      }),
      api.menu.onDeleteChat(() => {
        // Send event to sidebar to delete current chat
        window.dispatchEvent(new CustomEvent("chat:delete"));
      }),
      // Artifact menu
      api.menu.onSaveArtifact(() => {
        // Send event to artifact panel to save
        window.dispatchEvent(new CustomEvent("artifact:save"));
      }),
      api.menu.onExportExcel(() => {
        window.dispatchEvent(new CustomEvent("artifact:export-excel"));
      }),
      api.menu.onExportChartPng(() => {
        window.dispatchEvent(new CustomEvent("artifact:export-chart-png"));
      }),
      api.menu.onExportChartPdf(() => {
        window.dispatchEvent(new CustomEvent("artifact:export-chart-pdf"));
      }),
      api.menu.onCopyChart(() => {
        window.dispatchEvent(new CustomEvent("artifact:copy-chart"));
      }),
      api.menu.onDownloadPdf(() => {
        window.dispatchEvent(new CustomEvent("artifact:download-pdf"));
      }),
      api.menu.onOpenPdfBrowser(() => {
        window.dispatchEvent(new CustomEvent("artifact:open-pdf-browser"));
      }),
      api.menu.onCloseArtifact(() => {
        setSelectedArtifact(null);
        setArtifactPanelOpen(false);
      }),
      // PDF menu
      api.menu.onSavePdfAnnotations(() => {
        window.dispatchEvent(new CustomEvent("pdf:save-annotations"));
      }),
      api.menu.onPdfNavigate(() => {
        window.dispatchEvent(new CustomEvent("pdf:navigate"));
      }),
      api.menu.onPdfHighlight(() => {
        window.dispatchEvent(new CustomEvent("pdf:highlight"));
      }),
      api.menu.onPdfZoomIn(() => {
        window.dispatchEvent(new CustomEvent("pdf:zoom-in"));
      }),
      api.menu.onPdfZoomOut(() => {
        window.dispatchEvent(new CustomEvent("pdf:zoom-out"));
      }),
      api.menu.onPdfZoomReset(() => {
        window.dispatchEvent(new CustomEvent("pdf:zoom-reset"));
      }),
      // Agent menu
      api.menu.onToggleAgentPanel(() => {
        setAgentPanelOpen((prev) => !prev);
      }),
      api.menu.onClearAgentHistory(() => {
        window.dispatchEvent(new CustomEvent("agent:clear-history"));
      }),
    ];

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [
    handleNewChat,
    setActiveTab,
    setSelectedArtifact,
    setSidebarOpen,
    setShortcutsOpen,
    setCommandKOpen,
    addLocalPdf,
    createPdfSourceFromLocalFile,
    setArtifactPanelOpen,
    setAgentPanelOpen,
    supportsReasoning,
    setReasoningEffort,
  ]);

  useEffect(() => {
    const api = window.desktopApi;
    if (!api?.app) return;

    const cleanup = api.app.onOpenSettings((data?: { tab?: string }) => {
      if (data?.tab && settingsTabs.includes(data.tab as SettingsTab)) {
        setSettingsTab(data.tab as SettingsTab);
      }
      setSettingsOpen(true);
    });

    return () => {
      cleanup();
    };
  }, [setSettingsOpen, setSettingsTab]);

  // Global Listeners for Agent-controlled UI Navigation
  useEffect(() => {
    const api = window.desktopApi;
    if (!api) return;

    const cleanups: Array<() => void> = [];

    // Listen for tab navigation from agent
    if (api.onNavigateTab) {
      cleanups.push(
        api.onNavigateTab((data) => {
          console.log("[MainLayout] Agent navigating to tab:", data.tab);
          setActiveTab(data.tab);
        }),
      );
    }

    // Listen for artifact selection from agent
    if (api.onSelectArtifact) {
      cleanups.push(
        api.onSelectArtifact(async (data) => {
          console.log(
            "[MainLayout] Agent selecting artifact:",
            data.artifactId,
          );

          // Fetch artifact data and set it
          try {
            const artifact = await utils.artifacts.get.fetch({
              id: data.artifactId,
            });
            if (artifact) {
              setSelectedArtifact(artifact);

              // Navigate to appropriate tab if requested
              if (data.openInFullTab && data.targetTab) {
                setActiveTab(data.targetTab as "excel" | "doc");
              }
            }
          } catch (err) {
            console.error("[MainLayout] Failed to fetch artifact:", err);
          }
        }),
      );
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [setActiveTab, setSelectedArtifact, utils.artifacts.get]);

  // Global Shortcuts - disabled when Univer tabs are active to avoid input conflicts
  const isUniverTabActive = activeTab === "excel" || activeTab === "doc";

  useHotkeys("shift+?", () => setShortcutsOpen((prev) => !prev), {
    preventDefault: true,
    enabled: !isUniverTabActive,
  });
  useHotkeys("meta+\\", () => setSidebarOpen((prev) => !prev), {
    preventDefault: true,
    enabled: !isUniverTabActive,
  });
  useHotkeys(
    "meta+n, ctrl+n",
    (e) => {
      e.preventDefault();
      handleNewChat();
    },
    {
      enableOnFormTags: true,
      preventDefault: true,
      enabled: !isUniverTabActive,
    },
  );
  useHotkeys("meta+comma, ctrl+comma", () => setSettingsOpen(true), {
    preventDefault: true,
    enabled: !isUniverTabActive,
  });
  useHotkeys(
    "meta+k, ctrl+k",
    (e) => {
      e.preventDefault();
      setCommandKOpen(true);
    },
    { preventDefault: true, enabled: !isUniverTabActive },
  );
  useHotkeys(
    "ctrl+tab",
    (e) => {
      e.preventDefault();
      if (!supportsReasoning) return;
      setReasoningEffort(
        (prev) =>
          ({ low: "medium", medium: "high", high: "low" })[
            prev
          ] as ReasoningEffort,
      );
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enabled: !isUniverTabActive,
    },
  );

  return (
    <div className="h-screen w-screen bg-background relative overflow-hidden">
      {/* Global queue processor for chat messages */}
      <ChatQueueProcessor />
      <TitleBar
        className={cn(
          "absolute top-0 right-0 z-50 h-10 transition-all duration-300",
          (activeTab === "chat" || activeTab === "gallery") && sidebarOpen
            ? "left-72"
            : activeTab === "ideas" && notesSidebarOpen
              ? "left-72"
              : activeTab === "pdf" && pdfSidebarOpen
                ? "left-72"
                : activeTab === "excel" && excelSidebarOpen
                  ? "left-72"
                  : activeTab === "doc" && docSidebarOpen
                    ? "left-72"
                    : "left-0",
        )}
        noTrafficLightSpace={
          ((activeTab === "chat" || activeTab === "gallery") && sidebarOpen) ||
          (activeTab === "ideas" && notesSidebarOpen) ||
          (activeTab === "pdf" && pdfSidebarOpen) ||
          (activeTab === "excel" && excelSidebarOpen) ||
          (activeTab === "doc" && docSidebarOpen)
        }
      />
      <ShortcutsDialog />
      <CommandKDialog />

      <div className="flex h-full w-full overflow-hidden relative">
        {/* Sidebar & Main Content (Chat / Gallery) */}
        {(activeTab === "chat" || activeTab === "gallery") && (
          <>
            {/* Sidebar */}
            <div
              className={cn(
                "h-full border-r border-border bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0",
                sidebarOpen ? "w-72" : "w-0 border-r-0",
              )}
            >
              <div className="w-72 h-full">
                <Sidebar />
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-10">
              {!sidebarOpen && (
                <>
                  {isMacOS() && (
                    <div
                      className={cn(
                        "absolute z-[60] flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-500 no-drag",
                        "top-0 h-11 pl-16 pr-2 left-4",
                      )}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95 text-primary no-drag"
                            onClick={() => setSidebarOpen(true)}
                          >
                            <IconLayoutSidebarLeftExpand size={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="flex items-center gap-2 font-semibold"
                        >
                          Open Sidebar
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            {navigator.platform.toLowerCase().includes("mac")
                              ? "⌘"
                              : "Ctrl"}{" "}
                            \
                          </kbd>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-xl bg-background/60 backdrop-blur-xl border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95 no-drag"
                            onClick={handleNewChat}
                            disabled={createChat.isPending}
                          >
                            <IconPlus size={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="flex items-center gap-2 font-semibold"
                        >
                          New Chat
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            {navigator.platform.toLowerCase().includes("mac")
                              ? "⌘"
                              : "Ctrl"}{" "}
                            N
                          </kbd>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95 no-drag"
                            onClick={() => setCommandKOpen(true)}
                          >
                            <IconHistory
                              size={18}
                              className="text-muted-foreground"
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="flex items-center gap-2 font-semibold"
                        >
                          Search chats
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            {navigator.platform.toLowerCase().includes("mac")
                              ? "⌘"
                              : "Ctrl"}{" "}
                            K
                          </kbd>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}

                  {!isMacOS() && !sidebarOpen && activeTab === "chat" && (
                    <div className="absolute left-4 top-12 z-[60] flex flex-col items-center gap-2 no-drag">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95 text-primary no-drag"
                            onClick={() => setSidebarOpen(true)}
                          >
                            <IconLayoutSidebarLeftExpand size={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="flex items-center gap-2 font-semibold"
                        >
                          Open Sidebar
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            Ctrl \
                          </kbd>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95 no-drag"
                            onClick={handleNewChat}
                            disabled={createChat.isPending}
                          >
                            <IconPlus size={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="flex items-center gap-2 font-semibold"
                        >
                          New Chat
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            Ctrl N
                          </kbd>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95 no-drag"
                            onClick={() => setCommandKOpen(true)}
                          >
                            <IconHistory
                              size={18}
                              className="text-muted-foreground"
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="flex items-center gap-2 font-semibold"
                        >
                          Search chats
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            Ctrl K
                          </kbd>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </>
              )}

              {activeTab === "chat" ? <ChatView /> : <GalleryView />}
            </div>

            {/* Artifact panel - only in Chat */}
            {activeTab === "chat" && (
              <div
                className={cn(
                  "h-full border-l border-border bg-background transition-all duration-300 ease-in-out overflow-hidden shrink-0 pt-10",
                  selectedArtifact && artifactPanelOpen
                    ? "w-[600px]"
                    : "w-0 border-l-0",
                )}
              >
                <div className="w-[600px] h-full">
                  <Suspense fallback={<PanelLoadingFallback />}>
                    <ArtifactPanel />
                  </Suspense>
                </div>
              </div>
            )}
          </>
        )}

        {/*
         * Excel Tab - Persistent file system with sidebar
         * Sidebar outside content area (like chat) for consistent behavior
         */}
        {activeTab === "excel" && (
          <>
            {/* Excel File Sidebar - full height like chat sidebar */}
            <div
              className={cn(
                "h-full border-r border-border bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0",
                excelSidebarOpen ? "w-72" : "w-0 border-r-0",
              )}
            >
              <div className="w-72 h-full">
                <Suspense fallback={<PanelLoadingFallback />}>
                  <FilesSidebar
                    type="excel"
                    onToggle={() => setExcelSidebarOpen(!excelSidebarOpen)}
                  />
                </Suspense>
              </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden pt-10 animate-in fade-in zoom-in-95 duration-300">
              {/* File Header - shows when file is selected */}
              {currentExcelFile && (
                <Suspense fallback={null}>
                  <FileHeader
                    file={currentExcelFile}
                    onRename={handleRenameExcel}
                    onExport={handleExportExcel}
                    onSave={async () => {
                      if (univerSpreadsheetRef.current?.save) {
                        await univerSpreadsheetRef.current.save();
                        toast.success("Guardado");
                      }
                    }}
                    storageKind="cloud"
                    storageLabel="Nube (S-AGI)"
                    storageTooltip="Guardado en la nube con historial de versiones"
                    onOpenHistory={() => {
                      setVersionHistoryFileId(currentExcelFileId);
                      setVersionHistoryFileType("excel");
                      setVersionHistoryOpen(true);
                    }}
                  />
                </Suspense>
              )}
              {/* Scratch header when no file selected */}
              {!currentExcelFile && !currentExcelFileId && (
                <div className="h-10 border-b border-border/50 bg-background/50 flex items-center px-4">
                  <IconTable size={16} className="text-muted-foreground mr-2" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Hoja nueva - Guarda para crear un archivo</span>
                    <span className="text-xs text-muted-foreground/60">
                      • Sin guardar (local temporal)
                    </span>
                  </div>
                </div>
              )}
              {/* Spreadsheet */}
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  <Suspense fallback={<PanelLoadingFallback />}>
                    <UniverSpreadsheet
                      ref={univerSpreadsheetRef}
                      key={`spreadsheet-${currentExcelFileId || excelScratchId}-${previewVersionNumber || "current"}`}
                      fileId={
                        previewVersionNumber
                          ? undefined
                          : currentExcelFileId || undefined
                      }
                      fileData={
                        previewVersionData?.univer_data ||
                        currentExcelFile?.univer_data
                      }
                      artifactId={
                        !currentExcelFileId
                          ? selectedArtifact?.type === "spreadsheet"
                            ? selectedArtifact.id
                            : excelScratchId
                          : undefined
                      }
                      data={
                        !currentExcelFileId
                          ? selectedArtifact?.type === "spreadsheet"
                            ? selectedArtifact.univer_data
                            : undefined
                          : undefined
                      }
                    />
                  </Suspense>
                </div>
                {/* Agent Panel - slides from right */}
                <div
                  className={cn(
                    "h-full border-l border-border/50 bg-background transition-all duration-300 ease-in-out overflow-hidden shrink-0",
                    agentPanelOpen
                      ? "w-[300px] min-w-[280px]"
                      : "w-0 border-l-0",
                  )}
                  inert={!agentPanelOpen ? "" : undefined}
                >
                  <div className="w-[300px] min-w-[280px] h-full">
                    <Suspense fallback={<PanelLoadingFallback />}>
                      <AgentPanel />
                    </Suspense>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/*
         * Doc Tab - Persistent file system with sidebar
         * Sidebar outside content area (like chat) for consistent behavior
         */}
        {activeTab === "doc" && (
          <>
            {/* Doc File Sidebar - full height like chat sidebar */}
            <div
              className={cn(
                "h-full border-r border-border bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0",
                docSidebarOpen ? "w-72" : "w-0 border-r-0",
              )}
            >
              <div className="w-72 h-full">
                <Suspense fallback={<PanelLoadingFallback />}>
                  <FilesSidebar
                    type="doc"
                    onToggle={() => setDocSidebarOpen(!docSidebarOpen)}
                  />
                </Suspense>
              </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden pt-10 animate-in fade-in zoom-in-95 duration-300">
              {/* File Header - shows when file is selected */}
              {currentDocFile && (
                <Suspense fallback={null}>
                  <FileHeader
                    file={currentDocFile}
                    onRename={handleRenameDoc}
                    onSave={async () => {
                      if (univerDocumentRef.current?.save) {
                        await univerDocumentRef.current.save();
                        toast.success("Guardado");
                      }
                    }}
                    storageKind="cloud"
                    storageLabel="Nube (S-AGI)"
                    storageTooltip="Guardado en la nube con historial de versiones"
                    onOpenHistory={() => {
                      setVersionHistoryFileId(currentDocFileId);
                      setVersionHistoryFileType("doc");
                      setVersionHistoryOpen(true);
                    }}
                  />
                </Suspense>
              )}
              {/* Scratch header when no file selected */}
              {!currentDocFile && !currentDocFileId && (
                <div className="h-10 border-b border-border/50 bg-background/50 flex items-center px-4">
                  <IconFileText
                    size={16}
                    className="text-muted-foreground mr-2"
                  />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Documento nuevo - Guarda para crear un archivo</span>
                    <span className="text-xs text-muted-foreground/60">
                      • Sin guardar (local temporal)
                    </span>
                  </div>
                </div>
              )}
              {/* Document */}
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  <Suspense fallback={<PanelLoadingFallback />}>
                    <UniverDocument
                      ref={univerDocumentRef}
                      key={`document-${currentDocFileId || docScratchId}-${previewVersionNumber || "current"}`}
                      fileId={
                        previewVersionNumber
                          ? undefined
                          : currentDocFileId || undefined
                      }
                      fileData={
                        previewVersionData?.univer_data ||
                        currentDocFile?.univer_data
                      }
                      artifactId={
                        !currentDocFileId
                          ? selectedArtifact?.type === "document"
                            ? selectedArtifact.id
                            : docScratchId
                          : undefined
                      }
                      data={
                        !currentDocFileId
                          ? selectedArtifact?.type === "document"
                            ? selectedArtifact.univer_data
                            : undefined
                          : undefined
                      }
                    />
                  </Suspense>
                </div>
                {/* Agent Panel - slides from right */}
                <div
                  className={cn(
                    "h-full border-l border-border/50 bg-background transition-all duration-300 ease-in-out overflow-hidden shrink-0",
                    agentPanelOpen
                      ? "w-[300px] min-w-[280px]"
                      : "w-0 border-l-0",
                  )}
                  inert={!agentPanelOpen ? "" : undefined}
                >
                  <div className="w-[300px] min-w-[280px] h-full">
                    <Suspense fallback={<PanelLoadingFallback />}>
                      <AgentPanel />
                    </Suspense>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/*
         * PDF Tab - Unified PDF viewer hub.
         * Shows PDFs from artifacts, knowledge documents, and citations.
         * Includes AI-powered Q&A panel.
         */}
        {activeTab === "pdf" && (
          <div className="flex-1 flex animate-in fade-in zoom-in-95 duration-300 overflow-hidden">
            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <Suspense fallback={<PanelLoadingFallback />}>
                <PdfTabView />
              </Suspense>
            </div>
            {/* Agent Panel - slides from right */}
            <div
              className={cn(
                "h-full border-l border-border/50 bg-background transition-all duration-300 ease-in-out overflow-hidden shrink-0",
                agentPanelOpen ? "w-[300px] min-w-[280px]" : "w-0 border-l-0",
              )}
              inert={!agentPanelOpen ? "" : undefined}
            >
              <div className="w-[300px] min-w-[280px] h-full">
                <Suspense fallback={<PanelLoadingFallback />}>
                  <AgentPanel />
                </Suspense>
              </div>
            </div>
          </div>
        )}

        {/*
         * Ideas Tab - Notes with BlockNote
         */}
        {activeTab === "ideas" && (
          <>
            {/* Sidebar - always rendered, handles its own visibility */}
            <NotesSidebar />

            {/* Content area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-10">
              {/* Page tabs - below titlebar */}
              <div className="h-9 border-b border-border/50 bg-background flex items-center px-4 shrink-0">
                <NotesPageTabs />
              </div>

              {/* Editor content */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <Suspense fallback={<PanelLoadingFallback />}>
                  <IdeasView />
                </Suspense>
              </div>
            </div>
          </>
        )}

        {/* Version History Panel - Compact Design */}
        <FileVersionHistoryPanel
          fileId={versionHistoryFileId}
          fileType={versionHistoryFileType}
          open={versionHistoryOpen}
          onOpenChange={(open) => {
            setVersionHistoryOpen(open);
            if (!open) {
              setVersionHistoryFileId(null);
              // Reset preview when closing
              handlePreviewVersion(null);
            }
          }}
          onPreviewVersion={handlePreviewVersion}
        />
      </div>
    </div>
  );
}
