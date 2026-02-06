import type { CSSProperties, MouseEvent } from "react";
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
  IconPhoto,
  IconArrowLeft,
  IconMinus,
  IconSquare,
  IconX,
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
  aboutDialogOpenAtom,
  settingsActiveTabAtom,
  type SettingsTab,
  commandKOpenAtom,
  reasoningEffortAtom,
  supportsReasoningAtom,
  addLocalPdfAtom,
  createPdfSourceFromLocalFile,
  agentPanelOpenAtom,
  zenModeAtom,
  type ReasoningEffort,
} from "@/lib/atoms";
import {
  excelScratchSessionIdAtom,
  docScratchSessionIdAtom,
  currentExcelFileIdAtom,
  currentExcelFileAtom,
  currentDocFileIdAtom,
  currentDocFileAtom,
  currentNoteFileAtom,
  fileSnapshotCacheAtom,
  versionHistoryPreviewVersionAtom,
  versionPreviewDataAtom,
} from "@/lib/atoms/user-files";
import { excelSidebarOpenAtom, docSidebarOpenAtom } from "@/lib/atoms";
import { Sidebar } from "@/features/sidebar/sidebar";
import { ChatView } from "@/features/chat/chat-view";
import { ShareSessionButton } from "@/features/chat/share-session-dialog";
import { useOpenSettingsPage } from "@/features/settings/use-open-settings-page";
import { TitleBar } from "./title-bar";
import { cn, isMacOS, isElectron } from "@/lib/utils";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useHotkeys } from "react-hotkeys-hook";
import { useUniverTheme } from "@/features/univer/use-univer-theme";
import {
  exportToExcel,
  exportToExcelBuffer,
} from "@/features/univer/excel-exchange";
import { toast } from "sonner";
import { useCacheMaintenance } from "@/hooks/use-cache-maintenance";
import { VersionPreviewBanner } from "@/components/version-preview-banner";

// Lazy load heavy Univer components to improve initial load time
const ArtifactPanel = lazy(() =>
  import("@/features/artifacts/artifact-panel").then((m) => ({
    default: m.ArtifactPanel,
  }))
);
const UniverSpreadsheet = lazy(() =>
  import("@/features/univer/univer-spreadsheet").then((m) => ({
    default: m.UniverSpreadsheet,
  }))
);
const UniverDocument = lazy(() =>
  import("@/features/univer/univer-document").then((m) => ({
    default: m.UniverDocument,
  }))
);
const PdfTabView = lazy(() =>
  import("@/features/pdf/pdf-tab-view").then((m) => ({
    default: m.PdfTabView,
  }))
);
const IdeasView = lazy(() =>
  import("@/features/ideas/ideas-view").then((m) => ({ default: m.IdeasView }))
);
const AgentPanel = lazy(() =>
  import("@/features/agent/agent-panel").then((m) => ({
    default: m.AgentPanel,
  }))
);
const FilesSidebar = lazy(() =>
  import("@/features/files/files-sidebar").then((m) => ({
    default: m.FilesSidebar,
  }))
);
const FileHeader = lazy(() =>
  import("@/features/files/file-header").then((m) => ({
    default: m.FileHeader,
  }))
);
const NotesSidebar = lazy(() =>
  import("@/features/notes/notes-sidebar").then((m) => ({
    default: m.NotesSidebar,
  }))
);
const PdfSidebar = lazy(() =>
  import("@/features/pdf/pdf-tab-view").then((m) => ({
    default: m.PdfSidebar,
  }))
);
const GalleryView = lazy(() =>
  import("@/features/gallery/gallery-view").then((m) => ({
    default: m.GalleryView,
  }))
);
const SettingsPage = lazy(() =>
  import("@/features/settings/settings-page").then((m) => ({
    default: m.SettingsPage,
  }))
);
const ShortcutsDialog = lazy(() =>
  import("@/features/help/shortcuts-dialog").then((m) => ({
    default: m.ShortcutsDialog,
  }))
);
const CommandKDialog = lazy(() =>
  import("@/features/chat/command-k-dialog").then((m) => ({
    default: m.CommandKDialog,
  }))
);
const FileVersionHistoryPanel = lazy(() =>
  import("@/components/file-version-history-panel-compact").then((m) => ({
    default: m.FileVersionHistoryPanel,
  }))
);
const settingsTabs: SettingsTab[] = [
  "account",
  "archived-chats",
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
  const notesSidebarOpen = useAtomValue(notesSidebarOpenAtom);
  const [pdfSidebarOpen] = useAtom(pdfSidebarOpenAtom);
  const [artifactPanelOpen, setArtifactPanelOpen] = useAtom(
    artifactPanelOpenAtom
  );
  const [agentPanelOpen, setAgentPanelOpen] = useAtom(agentPanelOpenAtom);
  const selectedArtifact = useAtomValue(selectedArtifactAtom);
  const excelScratchId = useAtomValue(excelScratchSessionIdAtom);
  const docScratchId = useAtomValue(docScratchSessionIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [zenMode, setZenMode] = useAtom(zenModeAtom);
  const zenPrevBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const zenPrevMinSizeRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  const zenPrevMaxSizeRef = useRef<{
    width: number;
    height: number;
  } | null>(null);

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

  // Note file system atoms (for rename mutation callback only)
  const setCurrentNoteFile = useSetAtom(currentNoteFileAtom);

  // Version history panel state
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionHistoryFileId, setVersionHistoryFileId] = useState<
    string | null
  >(null);
  const [versionHistoryFileType, setVersionHistoryFileType] = useState<
    "excel" | "doc" | "note"
  >("excel");
  // Version preview from atoms (managed by useFileVersions hook)
  const [, setPreviewVersionNumber] = useAtom(versionHistoryPreviewVersionAtom);
  const [previewVersionData, setPreviewVersionData] = useAtom(
    versionPreviewDataAtom
  );

  // IMPORTANT: Only use preview data if it matches the current file
  // This prevents showing data from another file due to cached/stale queries
  const validExcelPreviewData =
    previewVersionData?.fileId === currentExcelFileId
      ? previewVersionData
      : null;
  const validDocPreviewData =
    previewVersionData?.fileId === currentDocFileId ? previewVersionData : null;

  // CRITICAL: Only use file data if it matches the current file ID
  // This prevents showing stale data from a previously selected file
  const validExcelFileData =
    currentExcelFile?.id === currentExcelFileId
      ? currentExcelFile?.univer_data
      : null;
  const validDocFileData =
    currentDocFile?.id === currentDocFileId
      ? currentDocFile?.univer_data
      : null;

  // Refs to Univer components for saving
  const univerSpreadsheetRef = useRef<any>(null);
  const univerDocumentRef = useRef<any>(null);

  // Track previous tab to save on tab switch
  const previousTabRef = useRef<string>(activeTab);
  const [, setShortcutsOpen] = useAtom(shortcutsDialogOpenAtom);
  const [, setAboutOpen] = useAtom(aboutDialogOpenAtom);
  const setSettingsTab = useSetAtom(settingsActiveTabAtom);
  const setSelectedArtifact = useSetAtom(selectedArtifactAtom);
  const setCommandKOpen = useSetAtom(commandKOpenAtom);
  const setReasoningEffort = useSetAtom(reasoningEffortAtom);
  const supportsReasoning = useAtomValue(supportsReasoningAtom);
  const addLocalPdf = useSetAtom(addLocalPdfAtom);
  const utils = trpc.useUtils();
  const openSettingsPage = useOpenSettingsPage();

  // Sync Univer theme with app dark/light mode
  useUniverTheme();

  // Run cache maintenance on app start and periodically
  useCacheMaintenance();

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
              effectiveId
            );
          }
        } catch (err) {
          console.error(
            "[MainLayout] Failed to save Excel snapshot on tab switch:",
            err
          );
        }
      }
    }
    previousTabRef.current = activeTab;
  }, [activeTab, currentExcelFileId, excelScratchId, setFileSnapshotCache]);

  // Ensure agent panel is closed on Ideas (notes) tab
  useEffect(() => {
    if (activeTab === "ideas" && agentPanelOpen) {
      setAgentPanelOpen(false);
    }
  }, [activeTab, agentPanelOpen, setAgentPanelOpen]);

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
      if (updatedFile.type === "note") {
        setCurrentNoteFile(updatedFile);
      }
      utils.userFiles.list.invalidate({ type: updatedFile.type });
    },
  });

  const handleNewChat = useCallback(
    (message?: string | MouseEvent) => {
      setActiveTab("chat");
      const title =
        typeof message === "string"
          ? message.length > 30
            ? `${message.substring(0, 30)}...`
            : message
          : "New Chat";
      createChat.mutate({ title });
    },
    [createChat]
  );

  const handleRenameExcel = useCallback(
    (newName: string) => {
      if (!currentExcelFileId) return;
      renameFileMutation.mutate({ id: currentExcelFileId, name: newName });
    },
    [currentExcelFileId, renameFileMutation]
  );

  const handleRenameDoc = useCallback(
    (newName: string) => {
      if (!currentDocFileId) return;
      renameFileMutation.mutate({ id: currentDocFileId, name: newName });
    },
    [currentDocFileId, renameFileMutation]
  );

  // Handle version preview - clears atoms when panel closes
  // The actual fetching is done by the useFileVersions hook when selectVersionForPreview is called
  const handlePreviewVersion = useCallback(
    (versionNumber: number | null) => {
      if (versionNumber === null) {
        // Clear preview atoms when closing or going back to current
        setPreviewVersionNumber(null);
        setPreviewVersionData(null);
      }
      // When selecting a version, the hook's selectVersionForPreview updates the atom,
      // which triggers useQuery in the hook that fetches and syncs to versionPreviewDataAtom
    },
    [setPreviewVersionNumber, setPreviewVersionData]
  );

  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer) => {
    const uint8Array = new Uint8Array(buffer);
    const chunkSize = 0x8000; // 32KB chunks
    let base64 = "";

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(
        i,
        Math.min(i + chunkSize, uint8Array.length)
      );
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }

    return btoa(base64);
  }, []);

  // Use main-process truth for storage mode (active account), not env-only renderer guess.
  const { data: isLocalStorageMode = false } = trpc.auth.isLocalMode.useQuery();

  const getLocalPath = useCallback(
    (file?: { metadata?: Record<string, unknown> | null } | null) => {
      if (!file?.metadata || typeof file.metadata !== "object") return null;
      const maybePath = (file.metadata as Record<string, unknown>).localPath;
      return typeof maybePath === "string" ? maybePath : null;
    },
    []
  );

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
        openSettingsPage(data?.tab as SettingsTab | undefined);
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
              data.files.length
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
          }
        )
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
    setSettingsTab,
    addLocalPdf,
    openSettingsPage,
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
            data.files.length
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
        }
      ),
      // View menu
      api.menu.onToggleSidebar(() => {
        setSidebarOpen((prev) => !prev);
      }),
      api.menu.onShowShortcuts(() => {
        setShortcutsOpen((prev) => !prev);
      }),
      (api.menu as any).onShowAbout?.(() => {
        setAboutOpen(true);
      }),
      // Go menu
      api.menu.onGoToTab((data: { tab: string }) => {
        const validTabs: Array<
          "chat" | "excel" | "doc" | "pdf" | "ideas" | "gallery" | "settings"
        > = ["chat", "excel", "doc", "pdf", "ideas", "gallery", "settings"];
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
              ({ low: "medium", medium: "high", high: "low" }[
                prev
              ] as ReasoningEffort)
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
      openSettingsPage(data?.tab as SettingsTab | undefined);
    });

    return () => {
      cleanup();
    };
  }, [openSettingsPage, setSettingsTab]);

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
        })
      );
    }

    // Listen for artifact selection from agent
    if (api.onSelectArtifact) {
      cleanups.push(
        api.onSelectArtifact(async (data) => {
          console.log(
            "[MainLayout] Agent selecting artifact:",
            data.artifactId
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
        })
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

  useHotkeys(
    "meta+shift+/, ctrl+shift+/",
    () => setShortcutsOpen((prev) => !prev),
    {
      preventDefault: true,
      enabled: !isUniverTabActive,
    }
  );
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
    }
  );
  useHotkeys("meta+comma, ctrl+comma", () => openSettingsPage(), {
    preventDefault: true,
    enabled: !isUniverTabActive,
  });
  useHotkeys(
    "meta+k, ctrl+k",
    (e) => {
      e.preventDefault();
      setCommandKOpen(true);
    },
    { preventDefault: true, enabled: !isUniverTabActive }
  );
  useHotkeys(
    "ctrl+tab",
    (e) => {
      e.preventDefault();
      if (!supportsReasoning) return;
      setReasoningEffort(
        (prev) =>
          ({ low: "medium", medium: "high", high: "low" }[
            prev
          ] as ReasoningEffort)
      );
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enabled: !isUniverTabActive,
    }
  );
  // Zen Mode: resize window when toggling
  useEffect(() => {
    if (!isElectron() || !isMacOS()) return;

    const html = document.documentElement;
    const body = document.body;

    html.classList.toggle("zen-vibrancy-active", zenMode);
    body.classList.toggle("zen-vibrancy-active", zenMode);

    void window.desktopApi?.setZenModeVibrancy?.(zenMode);

    return () => {
      html.classList.remove("zen-vibrancy-active");
      body.classList.remove("zen-vibrancy-active");
    };
  }, [zenMode]);

  useEffect(() => {
    if (!isElectron() || !isMacOS()) return;

    return () => {
      document.documentElement.classList.remove("zen-vibrancy-active");
      document.body.classList.remove("zen-vibrancy-active");
      void window.desktopApi?.setZenModeVibrancy?.(false);
    };
  }, []);

  useEffect(() => {
    const api = window.desktopApi;
    if (!api?.getBounds || !api?.setBounds) return;

    const ZEN_WIDTH = 420;
    const ZEN_HEIGHT = 750;
    const ZEN_MAX_GROWTH = 100;
    const ZEN_MAX_WIDTH = ZEN_WIDTH + ZEN_MAX_GROWTH;
    const ZEN_MAX_HEIGHT = ZEN_HEIGHT + ZEN_MAX_GROWTH;
    let cancelled = false;

    if (zenMode) {
      // Entering zen mode: save current bounds, resize window to narrow
      (async () => {
        const [bounds, minSize, maxSize] = await Promise.all([
          api.getBounds(),
          api.getMinimumSize?.(),
          api.getMaximumSize?.(),
        ]);
        if (cancelled) return;
        if (!bounds) return;
        zenPrevBoundsRef.current = bounds;

        if (minSize) {
          zenPrevMinSizeRef.current = minSize;
          await api.setMinimumSize?.({
            width: ZEN_WIDTH,
            height: minSize.height,
          });
          if (cancelled) return;
        }

        if (maxSize) {
          zenPrevMaxSizeRef.current = maxSize;
          await api.setMaximumSize?.({
            width: ZEN_MAX_WIDTH,
            height: ZEN_MAX_HEIGHT,
          });
          if (cancelled) return;
        }

        const height = ZEN_HEIGHT;
        // Center on current position
        const x = bounds.x + Math.round((bounds.width - ZEN_WIDTH) / 2);
        const y = bounds.y + Math.round((bounds.height - height) / 2);

        if (cancelled) return;
        await api.setBounds({ x, y, width: ZEN_WIDTH, height });
      })();
    } else {
      // Exiting zen mode: restore previous window constraints and bounds
      (async () => {
        const prevMinSize = zenPrevMinSizeRef.current;
        zenPrevMinSizeRef.current = null;
        if (prevMinSize) {
          await api.setMinimumSize?.(prevMinSize);
          if (cancelled) return;
        }

        const prevMaxSize = zenPrevMaxSizeRef.current;
        zenPrevMaxSizeRef.current = null;
        if (prevMaxSize) {
          await api.setMaximumSize?.(prevMaxSize);
          if (cancelled) return;
        }

        const prev = zenPrevBoundsRef.current;
        zenPrevBoundsRef.current = null;
        if (prev) {
          await api.setBounds(prev);
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [zenMode]);

  // Zen Mode toggle: Cmd+Shift+Z (Mac) / Ctrl+Shift+Z (Windows)
  useHotkeys(
    "meta+shift+z, ctrl+shift+z",
    (e) => {
      e.preventDefault();
      setZenMode((prev) => !prev);
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
    }
  );

  // === ZEN MODE LAYOUT ===
  if (zenMode) {
    const showTrafficLights = isMacOS() && isElectron();
    const isMacDesktop = isMacOS() && isElectron();
    const showWindowControls = isElectron() && !isMacOS();

    return (
      <div
        className={cn(
          "h-screen w-screen relative overflow-hidden",
          isMacDesktop ? "bg-transparent" : "bg-background"
        )}
      >
        <ChatQueueProcessor />
        <Suspense fallback={null}><ShortcutsDialog /></Suspense>
        <Suspense fallback={null}><CommandKDialog /></Suspense>

        {/* Zen Title Bar */}
        <div
          className={cn(
            "h-9 shrink-0 px-2 flex items-center relative drag-region",
            isMacDesktop
              ? "bg-background/60 backdrop-blur-2xl border-b border-border/50"
              : "bg-background"
          )}
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
        >
          {/* macOS traffic light space */}
          {showTrafficLights && <div className="w-[70px] shrink-0" />}

          {/* Push exit button to the right on macOS */}
          {isMacDesktop && <div className="flex-1 drag-region" aria-hidden />}

          {/* Back to App button */}
          <div
            className="flex items-center gap-2 no-drag pointer-events-auto"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                  onClick={() => setZenMode(false)}
                  aria-label="Exit Zen Mode"
                >
                  <IconArrowLeft size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Exit Zen Mode</TooltipContent>
            </Tooltip>

            <ShareSessionButton styleVariant="zen" />
          </div>

          {/* Spacer */}
          {!isMacDesktop && <div className="flex-1 drag-region" aria-hidden />}

          {/* Window controls (Windows/Linux) */}
          {showWindowControls && (
            <div
              className="flex items-center no-drag"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              <Button
                variant="ghost"
                className="h-9 w-10 rounded-none hover:bg-accent"
                onClick={() => window.desktopApi?.minimize()}
              >
                <IconMinus size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-10 rounded-none hover:bg-accent"
                onClick={() => window.desktopApi?.maximize()}
              >
                <IconSquare size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-10 rounded-none hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => window.desktopApi?.close()}
              >
                <IconX size={16} />
              </Button>
            </div>
          )}
        </div>

        {/* Zen Chat Content - full width (window is already narrow) */}
        <div className="flex-1 flex flex-col h-[calc(100vh-36px)] overflow-hidden">
          <ChatView />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background relative overflow-hidden">
      {/* Global queue processor for chat messages */}
      <ChatQueueProcessor />
      <TitleBar
        className={cn(
          "absolute top-0 right-0 z-50 h-9 transition-all duration-300",
          activeTab === "settings" ? "bg-background" : "bg-sidebar",
          (activeTab === "chat" || activeTab === "gallery") && sidebarOpen
            ? "left-72"
            : activeTab === "ideas" && sidebarOpen && notesSidebarOpen
            ? "left-[36rem]"
            : activeTab === "ideas" && (sidebarOpen || notesSidebarOpen)
            ? "left-72"
            : activeTab === "pdf" && sidebarOpen && pdfSidebarOpen
            ? "left-[36rem]"
            : activeTab === "pdf" && (sidebarOpen || pdfSidebarOpen)
            ? "left-72"
            : activeTab === "excel" && sidebarOpen && excelSidebarOpen
            ? "left-[36rem]"
            : activeTab === "excel" && (sidebarOpen || excelSidebarOpen)
            ? "left-72"
            : activeTab === "doc" && sidebarOpen && docSidebarOpen
            ? "left-[36rem]"
            : activeTab === "doc" && (sidebarOpen || docSidebarOpen)
            ? "left-72"
            : activeTab === "settings"
            ? "left-72"
            : "left-0"
        )}
        noTrafficLightSpace={
          ((activeTab === "chat" || activeTab === "gallery") && sidebarOpen) ||
          (activeTab === "ideas" && (sidebarOpen || notesSidebarOpen)) ||
          (activeTab === "pdf" && (sidebarOpen || pdfSidebarOpen)) ||
          (activeTab === "excel" && (sidebarOpen || excelSidebarOpen)) ||
          (activeTab === "doc" && (sidebarOpen || docSidebarOpen)) ||
          activeTab === "settings"
        }
      />
      <Suspense fallback={null}><ShortcutsDialog /></Suspense>
      <Suspense fallback={null}><CommandKDialog /></Suspense>

      <div className="flex h-full w-full overflow-hidden relative">
        {/* Sidebar & Main Content (Chat / Gallery) */}
        {(activeTab === "chat" || activeTab === "gallery") && (
          <>
            {/* Sidebar - no border when alone (next to content) */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                sidebarOpen ? "w-72" : "w-0 border-r-0"
              )}
            >
              <div className="w-72 h-full">
                <Sidebar />
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-9 bg-sidebar">
              {!sidebarOpen && (
                <>
                  {/* Windows: vertical floating buttons inside chat area */}
                  {!isMacOS() && !sidebarOpen && activeTab === "chat" && (
                    <div
                      className="absolute left-4 top-12 z-[200] flex flex-col items-center gap-2 no-drag pointer-events-auto"
                      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95 text-primary"
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
                            className="h-8 w-8 rounded-md bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95"
                            onClick={() => setActiveTab("gallery")}
                          >
                            <IconPhoto size={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="flex items-center gap-2 font-semibold"
                        >
                          Gallery
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95"
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
                            className="h-8 w-8 rounded-md bg-background/60 backdrop-blur-xl border border-border/50 shadow-sm hover:bg-accent hover:scale-110 transition-all active:scale-95"
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

              <div className="flex-1 flex flex-col min-w-0 overflow-hidden px-2 pb-2">
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-2xl border border-sidebar-border/40 bg-sidebar">
                  {activeTab === "chat" ? <ChatView /> : <Suspense fallback={<PanelLoadingFallback />}><GalleryView /></Suspense>}
                </div>
              </div>
            </div>

            {/* Artifact panel - only in Chat */}
            {activeTab === "chat" && (
              <div
                className={cn(
                  "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 pt-9",
                  selectedArtifact && artifactPanelOpen
                    ? "w-[600px]"
                    : "w-0 border-l-0"
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

        {/* Settings Page */}
        {activeTab === "settings" && <Suspense fallback={<PanelLoadingFallback />}><SettingsPage /></Suspense>}

        {/*
         * Excel Tab - Persistent file system with sidebar
         * Sidebar outside content area (like chat) for consistent behavior
         */}
        {activeTab === "excel" && (
          <>
            {/* Primary Sidebar - border only when both open (line between main and page sidebar) */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                sidebarOpen
                  ? excelSidebarOpen
                    ? "w-72 border-r border-sidebar-border/40"
                    : "w-72"
                  : "w-0 border-r-0"
              )}
            >
              <div className="w-72 h-full">
                <Sidebar />
              </div>
            </div>

            {/* Excel File Sidebar - no border (next to content / inside) */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                excelSidebarOpen ? "w-72" : "w-0 border-r-0"
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
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-9 bg-sidebar animate-in fade-in zoom-in-95 duration-300">
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden px-2 pb-2">
                <div className="flex-1 flex min-w-0 overflow-hidden rounded-2xl border border-sidebar-border/40 bg-sidebar relative">
                  <div
                    className={cn(
                      "flex-1 flex flex-col min-w-0 overflow-hidden",
                      agentPanelOpen && "pr-[320px]"
                    )}
                  >
                    {/* File Header - shows when valid file is loaded (ID matches) */}
                    {currentExcelFile &&
                      currentExcelFile.id === currentExcelFileId && (
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
                            storageKind={isLocalStorageMode ? "local" : "cloud"}
                            storageLabel={
                              isLocalStorageMode ? "Local" : "Nube (S-AGI)"
                            }
                            storageTooltip={
                              isLocalStorageMode
                                ? getLocalPath(currentExcelFile)
                                  ? `Guardado en ${getLocalPath(
                                      currentExcelFile
                                    )}`
                                  : "Guardado en este dispositivo"
                                : "Guardado en la nube con historial de versiones"
                            }
                            onOpenHistory={() => {
                              setVersionHistoryFileId(currentExcelFileId);
                              setVersionHistoryFileType("excel");
                              setVersionHistoryOpen(true);
                            }}
                          />
                        </Suspense>
                      )}
                    {/* Loading header when file ID is set but data not yet loaded */}
                    {currentExcelFileId &&
                      (!currentExcelFile ||
                        currentExcelFile.id !== currentExcelFileId) && (
                        <div className="h-10 border-b border-border/50 bg-background/50 flex items-center px-4">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">
                            Cargando archivo...
                          </span>
                        </div>
                      )}
                    {/* Scratch header when no file selected */}
                    {!currentExcelFileId && (
                      <div className="h-10 border-b border-border/50 bg-background/50 flex items-center px-4">
                        <IconTable
                          size={16}
                          className="text-muted-foreground mr-2"
                        />
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Hoja nueva - Guarda para crear un archivo</span>
                          <span className="text-xs text-muted-foreground/60">
                            • Sin guardar (local temporal)
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Version Preview Banner for Excel */}
                    <VersionPreviewBanner fileId={currentExcelFileId} />

                    {/* Spreadsheet */}
                    <div className="flex-1 flex overflow-hidden">
                      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <Suspense fallback={<PanelLoadingFallback />}>
                          <UniverSpreadsheet
                            ref={univerSpreadsheetRef}
                            key={`spreadsheet-${
                              currentExcelFileId || excelScratchId
                            }-v${
                              validExcelPreviewData?.versionNumber || "current"
                            }-${validExcelPreviewData?.fileId || "none"}-vc${
                              currentExcelFile?.version_count || 0
                            }`}
                            fileId={
                              validExcelPreviewData
                                ? undefined // Don't save when previewing
                                : currentExcelFileId || undefined
                            }
                            fileData={
                              validExcelPreviewData?.univerData ||
                              validExcelFileData
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
                            isPreviewMode={!!validExcelPreviewData}
                          />
                        </Suspense>
                      </div>
                    </div>
                  </div>
                  {/* Agent Panel - GPU slide, no layout animation */}
                  <div
                    className={cn(
                      "absolute right-0 top-0 h-full w-[320px] bg-sidebar border-l border-sidebar-border/40",
                      "transition-transform transition-opacity duration-300 ease-in-out transform-gpu",
                      agentPanelOpen
                        ? "translate-x-0 opacity-100"
                        : "translate-x-full opacity-0 pointer-events-none"
                    )}
                    inert={!agentPanelOpen || undefined}
                    aria-hidden={!agentPanelOpen}
                  >
                    <div className="h-full w-[320px]">
                      <Suspense fallback={<PanelLoadingFallback />}>
                        <AgentPanel />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/*
         * Doc Tab - Persistent file system with sidebar
         * Same pattern as Excel: main Sidebar + page-specific sidebar + Agent Panel
         */}
        {activeTab === "doc" && (
          <>
            {/* Primary Sidebar - border only when both open */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                sidebarOpen
                  ? docSidebarOpen
                    ? "w-72 border-r border-sidebar-border/40"
                    : "w-72"
                  : "w-0 border-r-0"
              )}
            >
              <div className="w-72 h-full">
                <Sidebar />
              </div>
            </div>

            {/* Doc File Sidebar - no border (next to content) */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                docSidebarOpen ? "w-72" : "w-0 border-r-0"
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
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-9 bg-sidebar animate-in fade-in zoom-in-95 duration-300">
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden px-2 pb-2">
                <div className="flex-1 flex min-w-0 overflow-hidden rounded-2xl border border-sidebar-border/40 bg-sidebar relative">
                  <div
                    className={cn(
                      "flex-1 flex flex-col min-w-0 overflow-hidden",
                      agentPanelOpen && "pr-[320px]"
                    )}
                  >
                    {/* File Header - shows when valid file is loaded (ID matches) */}
                    {currentDocFile &&
                      currentDocFile.id === currentDocFileId && (
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
                            storageKind={isLocalStorageMode ? "local" : "cloud"}
                            storageLabel={
                              isLocalStorageMode ? "Local" : "Nube (S-AGI)"
                            }
                            storageTooltip={
                              isLocalStorageMode
                                ? getLocalPath(currentDocFile)
                                  ? `Guardado en ${getLocalPath(
                                      currentDocFile
                                    )}`
                                  : "Guardado en este dispositivo"
                                : "Guardado en la nube con historial de versiones"
                            }
                            onOpenHistory={() => {
                              setVersionHistoryFileId(currentDocFileId);
                              setVersionHistoryFileType("doc");
                              setVersionHistoryOpen(true);
                            }}
                          />
                        </Suspense>
                      )}
                    {/* Loading header when file ID is set but data not yet loaded */}
                    {currentDocFileId &&
                      (!currentDocFile ||
                        currentDocFile.id !== currentDocFileId) && (
                        <div className="h-10 border-b border-border/50 bg-background/50 flex items-center px-4">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">
                            Cargando documento...
                          </span>
                        </div>
                      )}
                    {/* Scratch header when no file selected */}
                    {!currentDocFileId && (
                      <div className="h-10 border-b border-border/50 bg-background/50 flex items-center px-4">
                        <IconFileText
                          size={16}
                          className="text-muted-foreground mr-2"
                        />
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>
                            Documento nuevo - Guarda para crear un archivo
                          </span>
                          <span className="text-xs text-muted-foreground/60">
                            • Sin guardar (local temporal)
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Version Preview Banner for Docs */}
                    <VersionPreviewBanner fileId={currentDocFileId} />

                    {/* Document */}
                    <div className="flex-1 flex overflow-hidden">
                      <Suspense fallback={<PanelLoadingFallback />}>
                        <UniverDocument
                          ref={univerDocumentRef}
                          key={`document-${currentDocFileId || docScratchId}-v${
                            validDocPreviewData?.versionNumber || "current"
                          }-${validDocPreviewData?.fileId || "none"}-vc${
                            currentDocFile?.version_count || 0
                          }`}
                          fileId={
                            validDocPreviewData
                              ? undefined
                              : currentDocFileId || undefined
                          }
                          fileData={
                            validDocPreviewData?.univerData || validDocFileData
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
                          isPreviewMode={!!validDocPreviewData}
                        />
                      </Suspense>
                    </div>
                  </div>
                  {/* Agent Panel - GPU slide, no layout animation */}
                  <div
                    className={cn(
                      "absolute right-0 top-0 h-full w-[320px] bg-sidebar border-l border-sidebar-border/40",
                      "transition-transform transition-opacity duration-300 ease-in-out transform-gpu",
                      agentPanelOpen
                        ? "translate-x-0 opacity-100"
                        : "translate-x-full opacity-0 pointer-events-none"
                    )}
                    inert={!agentPanelOpen || undefined}
                    aria-hidden={!agentPanelOpen}
                  >
                    <div className="h-full w-[320px]">
                      <Suspense fallback={<PanelLoadingFallback />}>
                        <AgentPanel />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/*
         * PDF Tab - Unified PDF viewer hub.
         * Same pattern as Excel: main Sidebar + PDF sidebar + main content + Agent Panel
         */}
        {activeTab === "pdf" && (
          <>
            {/* Primary Sidebar - border only when both open */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                sidebarOpen
                  ? pdfSidebarOpen
                    ? "w-72 border-r border-sidebar-border/40"
                    : "w-72"
                  : "w-0 border-r-0"
              )}
            >
              <div className="w-72 h-full">
                <Sidebar />
              </div>
            </div>

            {/* PDF File Sidebar - no border (next to content) */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                pdfSidebarOpen ? "w-72" : "w-0 border-r-0"
              )}
            >
              <div className="w-72 h-full">
                <Suspense fallback={<PanelLoadingFallback />}>
                  <PdfSidebar />
                </Suspense>
              </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-9 bg-sidebar animate-in fade-in zoom-in-95 duration-300">
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden px-2 pb-2">
                <div className="flex-1 flex min-w-0 overflow-hidden rounded-2xl border border-sidebar-border/40 bg-sidebar relative">
                  <div
                    className={cn(
                      "flex-1 flex flex-col min-w-0 overflow-hidden",
                      agentPanelOpen && "pr-[320px]"
                    )}
                  >
                    <Suspense fallback={<PanelLoadingFallback />}>
                      <PdfTabView />
                    </Suspense>
                  </div>
                  {/* Agent Panel - GPU slide, no layout animation */}
                  <div
                    className={cn(
                      "absolute right-0 top-0 h-full w-[320px] bg-sidebar border-l border-sidebar-border/40",
                      "transition-transform transition-opacity duration-300 ease-in-out transform-gpu",
                      agentPanelOpen
                        ? "translate-x-0 opacity-100"
                        : "translate-x-full opacity-0 pointer-events-none"
                    )}
                    inert={!agentPanelOpen || undefined}
                    aria-hidden={!agentPanelOpen}
                  >
                    <div className="h-full w-[320px]">
                      <Suspense fallback={<PanelLoadingFallback />}>
                        <AgentPanel />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/*
         * Ideas Tab - Notes with NotesSidebar (no Agent Panel)
         */}
        {activeTab === "ideas" && (
          <>
            {/* Primary Sidebar - border only when both open */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                sidebarOpen
                  ? notesSidebarOpen
                    ? "w-72 border-r border-sidebar-border/40"
                    : "w-72"
                  : "w-0 border-r-0"
              )}
            >
              <div className="w-72 h-full">
                <Sidebar />
              </div>
            </div>

            {/* Notes Sidebar - no border (next to content) */}
            <div
              className={cn(
                "h-full bg-sidebar transition-all duration-300 ease-in-out overflow-hidden shrink-0 min-w-0",
                notesSidebarOpen ? "w-72" : "w-0 border-r-0"
              )}
            >
              <div className="w-72 h-full">
                <Suspense fallback={<PanelLoadingFallback />}>
                  <NotesSidebar />
                </Suspense>
              </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-9 bg-sidebar animate-in fade-in zoom-in-95 duration-300">
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden px-2 pb-2">
                <div className="flex-1 flex min-w-0 overflow-hidden rounded-2xl border border-sidebar-border/40 bg-sidebar relative">
                  <div
                    className={cn(
                      "flex-1 flex flex-col min-w-0 overflow-hidden",
                      agentPanelOpen && "pr-[320px]"
                    )}
                  >
                    <Suspense fallback={<PanelLoadingFallback />}>
                      <IdeasView />
                    </Suspense>
                  </div>
                  {/* Agent Panel - GPU slide, no layout animation */}
                  <div
                    className={cn(
                      "absolute right-0 top-0 h-full w-[320px] bg-sidebar border-l border-sidebar-border/40",
                      "transition-transform transition-opacity duration-300 ease-in-out transform-gpu",
                      agentPanelOpen
                        ? "translate-x-0 opacity-100"
                        : "translate-x-full opacity-0 pointer-events-none"
                    )}
                    inert={!agentPanelOpen || undefined}
                    aria-hidden={!agentPanelOpen}
                  >
                    <div className="h-full w-[320px]">
                      <Suspense fallback={<PanelLoadingFallback />}>
                        <AgentPanel />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Version History Panel - Compact Design */}
        <Suspense fallback={null}>
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
        </Suspense>
      </div>
    </div>
  );
}
