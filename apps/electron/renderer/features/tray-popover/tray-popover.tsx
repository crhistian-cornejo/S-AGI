import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { exportToExcel } from "../univer/excel-exchange";
import {
  IconSearch,
  IconTable,
  IconFileText,
  IconFileTypePdf,
  IconSettings,
  IconLogout,
  IconExternalLink,
  IconFolder,
  IconUpload,
  IconDownload,
  IconTrash,
  IconLock,
  IconChevronRight,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Local type definition (matches TrayRecentItem from env.d.ts)
interface FileFolder {
  id: string;
  name: string;
  isSensitive: boolean;
}

interface FileItem {
  id: string;
  folderId: string;
  originalName: string;
  ext: string;
  size: number;
  mime: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  openCount: number;
  isImage: boolean;
  thumbnailUrl: string | null;
  url: string;
}

interface SpreadsheetItem {
  id: string;
  name: string;
  updatedAt: string;
  chatId?: string;
}

interface CitationItem {
  id: string;
  kind: "url" | "file";
  label: string;
  url?: string;
  filename?: string;
  chatId: string;
  messageId: string;
  createdAt: string;
  startIndex?: number;
  endIndex?: number;
  fileId?: string;
}

// Helper to safely access desktopApi
const getDesktopApi = () => window.desktopApi;

export function TrayPopover() {
  const [view, setView] = useState<"quick" | "files">("quick");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(() => {
    try {
      return localStorage.getItem("tray:selectedFolderId") || "inbox";
    } catch {
      return "inbox";
    }
  });
  const [folderFiles, setFolderFiles] = useState<FileItem[]>([]);
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [sensitiveStatus, setSensitiveStatus] = useState<{
    unlockedUntil: number;
    canBiometric: boolean;
    pinEnabled: boolean;
  } | null>(null);
  const [user, setUser] = useState<{
    email: string;
    avatarUrl: string | null;
    fullName: string | null;
  } | null>(null);
  const [pin, setPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewer, setViewer] = useState<{
    open: boolean;
    items: FileItem[];
    index: number;
    zoom: number;
  }>({ open: false, items: [], index: 0, zoom: 1 });
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetItem[]>([]);
  const [citations, setCitations] = useState<CitationItem[]>([]);
  const [pinnedCitationIds, setPinnedCitationIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("tray:pinnedCitations");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const fetchAllFiles = useCallback(async () => {
    const api = getDesktopApi();
    if (!api?.files) return;
    try {
      const list = await api.files.listAllFiles();
      setAllFiles(list || []);
    } catch (error) {
      console.error("Failed to fetch all files:", error);
      setAllFiles([]);
    }
  }, []);

  const fetchSpreadsheets = useCallback(async () => {
    const api = getDesktopApi();
    if (!api?.tray) return;
    try {
      const list = await api.tray.getSpreadsheets();
      setSpreadsheets(list || []);
    } catch (error) {
      console.error("Failed to fetch spreadsheets:", error);
      setSpreadsheets([]);
    }
  }, []);

  const fetchCitations = useCallback(async () => {
    const api = getDesktopApi();
    if (!api?.tray) return;
    try {
      const list = await api.tray.getCitations();
      setCitations(list || []);
    } catch (error) {
      console.error("Failed to fetch citations:", error);
      setCitations([]);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    const api = getDesktopApi();
    if (!api?.files) return;
    const list = await api.files.listFolders();
    setFolders(list || []);
  }, []);

  const fetchFiles = useCallback(async (folderId: string) => {
    const api = getDesktopApi();
    if (!api?.files) return;
    try {
      setFilesError(null);
      const list = await api.files.listFiles({ folderId });
      setFolderFiles(list || []);
    } catch (err: any) {
      setFolderFiles([]);
      setFilesError(err?.message || "Failed to load files");
    }
  }, []);

  const fetchSensitiveStatus = useCallback(async () => {
    const api = getDesktopApi();
    if (!api?.security) return;
    const status = await api.security.getSensitiveStatus();
    setSensitiveStatus(status || null);
  }, []);

  const fetchUser = useCallback(async () => {
    const api = getDesktopApi();
    if (!api?.tray) return;
    const u = await api.tray.getUser();
    setUser(u || null);
  }, []);

  const fetchQuickData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchAllFiles(), fetchSpreadsheets(), fetchCitations()]);
    setIsLoading(false);
  }, [fetchAllFiles, fetchSpreadsheets, fetchCitations]);

  useEffect(() => {
    fetchQuickData().catch(() => {});
    fetchFolders().catch(() => {});
    fetchSensitiveStatus().catch(() => {});
    fetchUser().catch(() => {});

    // Auto focus search input
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    const api = getDesktopApi();
    const cleanup = api?.tray?.onRefresh(() => {
      fetchQuickData().catch(() => {});
      fetchFolders().catch(() => {});
      fetchSensitiveStatus().catch(() => {});
      fetchUser().catch(() => {});
      fetchFiles(selectedFolderId).catch(() => {});
    });

    return () => {
      cleanup?.();
    };
  }, [
    fetchQuickData,
    fetchFolders,
    fetchFiles,
    fetchSensitiveStatus,
    fetchUser,
    selectedFolderId,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem("tray:selectedFolderId", selectedFolderId);
    } catch {}
    fetchFiles(selectedFolderId).catch(() => {});
  }, [selectedFolderId, fetchFiles]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key === "1") {
        e.preventDefault();
        setView("quick");
      }
      if (mod && e.key === "2") {
        e.preventDefault();
        setView("files");
      }
      if (mod && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        const api = getDesktopApi();
        if (api?.files) {
          setView("files");
          setIsImporting(true);
          api.files
            .pickAndImport({ folderId: selectedFolderId })
            .finally(() => setIsImporting(false));
        }
      }
      if (mod && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if (viewer.open) {
        if (e.key === "Escape") {
          e.preventDefault();
          setViewer({ open: false, items: [], index: 0, zoom: 1 });
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setViewer((v) => ({
            ...v,
            index: Math.max(0, v.index - 1),
            zoom: 1,
          }));
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setViewer((v) => ({
            ...v,
            index: Math.min(v.items.length - 1, v.index + 1),
            zoom: 1,
          }));
        }
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          setViewer((v) => ({ ...v, zoom: Math.min(6, v.zoom + 0.25) }));
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          setViewer((v) => ({ ...v, zoom: Math.max(1, v.zoom - 0.25) }));
        }
        if (e.key === "0") {
          e.preventDefault();
          setViewer((v) => ({ ...v, zoom: 1 }));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedFolderId, viewer.open]);

  const handleAction = (action: string, data?: Record<string, unknown>) => {
    const api = getDesktopApi();
    api?.tray?.action({ action, ...data });
  };

  const filteredFiles = useMemo(
    () =>
      folderFiles.filter((f) =>
        f.originalName.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [folderFiles, searchQuery],
  );

  const imageFiles = useMemo(
    () => filteredFiles.filter((f) => f.isImage),
    [filteredFiles],
  );

  const filteredAllFiles = useMemo(
    () =>
      allFiles.filter((f) =>
        f.originalName.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [allFiles, searchQuery],
  );

  const quickImageFiles = useMemo(
    () => filteredAllFiles.filter((f) => f.isImage),
    [filteredAllFiles],
  );

  const quickPdfFiles = useMemo(
    () =>
      filteredAllFiles.filter(
        (f) => f.ext.toLowerCase() === "pdf" || f.mime === "application/pdf",
      ),
    [filteredAllFiles],
  );

  const filteredSpreadsheets = useMemo(
    () =>
      spreadsheets.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [spreadsheets, searchQuery],
  );

  const filteredCitations = useMemo(
    () =>
      citations.filter((c) =>
        c.label.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [citations, searchQuery],
  );

  const pinnedCitations = useMemo(() => {
    const pinned = new Set(pinnedCitationIds);
    return filteredCitations.filter((c) => pinned.has(c.id));
  }, [filteredCitations, pinnedCitationIds]);

  const recentCitations = useMemo(() => {
    const pinned = new Set(pinnedCitationIds);
    return filteredCitations.filter((c) => !pinned.has(c.id));
  }, [filteredCitations, pinnedCitationIds]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes < 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    const dp = idx === 0 ? 0 : idx === 1 ? 0 : 1;
    return `${value.toFixed(dp)} ${units[idx]}`;
  };

  const createFolder = async () => {
    const api = getDesktopApi();
    if (!api?.files) return;
    const name = window.prompt("Folder name");
    if (!name) return;
    const folder = await api.files.createFolder({ name });
    await fetchFolders();
    setSelectedFolderId(folder.id);
    setView("files");
  };

  const renameFolder = async () => {
    const api = getDesktopApi();
    if (!api?.files) return;
    const current = folders.find((f) => f.id === selectedFolderId);
    const name = window.prompt("Rename folder", current?.name || "");
    if (!name) return;
    await api.files.renameFolder({ folderId: selectedFolderId, name });
    await fetchFolders();
  };

  const deleteFolder = async () => {
    const api = getDesktopApi();
    if (!api?.files) return;
    const current = folders.find((f) => f.id === selectedFolderId);
    if (!current) return;
    const ok = window.confirm(
      `Delete folder "${current.name}" and all its files?`,
    );
    if (!ok) return;
    await api.files.deleteFolder({ folderId: selectedFolderId });
    await fetchFolders();
    setSelectedFolderId("inbox");
  };

  const pickAndImport = async () => {
    const api = getDesktopApi();
    if (!api?.files) return;
    setIsImporting(true);
    try {
      await api.files.pickAndImport({ folderId: selectedFolderId });
      await fetchFiles(selectedFolderId);
      await fetchAllFiles();
    } finally {
      setIsImporting(false);
    }
  };

  const importDropped = async (paths: string[]) => {
    const api = getDesktopApi();
    if (!api?.files) return;
    setIsImporting(true);
    try {
      await api.files.importPaths({ folderId: selectedFolderId, paths });
      await fetchFiles(selectedFolderId);
      await fetchAllFiles();
    } finally {
      setIsImporting(false);
    }
  };

  const unlockSensitive = async () => {
    const api = getDesktopApi();
    if (!api?.security) return;
    const res = await api.security.unlockSensitive({
      reason: "Unlock sensitive files",
    });
    setSensitiveStatus((s) =>
      s
        ? { ...s, unlockedUntil: res.unlockedUntil }
        : {
            unlockedUntil: res.unlockedUntil,
            canBiometric: false,
            pinEnabled: false,
          },
    );
    if (res.success) {
      await fetchFiles(selectedFolderId);
    }
  };

  const unlockWithPin = async () => {
    const api = getDesktopApi();
    if (!api?.security) return;
    setPinBusy(true);
    try {
      const res = await api.security.unlockWithPin({ pin });
      setSensitiveStatus((s) =>
        s
          ? { ...s, unlockedUntil: res.unlockedUntil }
          : {
              unlockedUntil: res.unlockedUntil,
              canBiometric: false,
              pinEnabled: true,
            },
      );
      if (res.success) {
        setPin("");
        await fetchFiles(selectedFolderId);
      } else {
        setFilesError(res.error || "PIN unlock failed");
      }
    } finally {
      setPinBusy(false);
    }
  };

  const setNewPin = async () => {
    const api = getDesktopApi();
    if (!api?.security) return;
    setPinBusy(true);
    try {
      const res = await api.security.setPin({ pin });
      if (res?.success) {
        setSensitiveStatus((s) =>
          s
            ? { ...s, pinEnabled: true }
            : { unlockedUntil: 0, canBiometric: false, pinEnabled: true },
        );
        setFilesError(null);
      }
    } finally {
      setPinBusy(false);
    }
  };

  const openFile = async (fileId: string) => {
    const api = getDesktopApi();
    if (!api?.files) return;
    try {
      await api.files.openFile({ fileId });
      await fetchFiles(selectedFolderId);
    } catch (err: any) {
      setFilesError(err?.message || "Failed to open file");
    }
  };

  const deleteFile = async (fileId: string) => {
    const api = getDesktopApi();
    if (!api?.files) return;
    try {
      await api.files.deleteFile({ fileId });
      setSelectedIds((ids) => ids.filter((x) => x !== fileId));
      await fetchFiles(selectedFolderId);
    } catch (err: any) {
      setFilesError(err?.message || "Failed to delete file");
    }
  };

  const downloadFiles = async (fileIds: string[]) => {
    const api = getDesktopApi();
    if (!api?.files) return;
    try {
      await api.files.exportFiles({ fileIds });
    } catch (err: any) {
      setFilesError(err?.message || "Failed to download files");
    }
  };

  const openViewer = (items: FileItem[], startId: string) => {
    const index = Math.max(
      0,
      items.findIndex((f) => f.id === startId),
    );
    setViewer({ open: true, items, index, zoom: 1 });
  };

  const currentImage = useMemo(() => {
    if (!viewer.open) return null;
    return viewer.items[viewer.index] || null;
  }, [viewer]);

  const togglePinCitation = (id: string) => {
    setPinnedCitationIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        "tray:pinnedCitations",
        JSON.stringify(pinnedCitationIds),
      );
    } catch {}
  }, [pinnedCitationIds]);

  const downloadSpreadsheet = async (item: SpreadsheetItem) => {
    const api = getDesktopApi();
    if (!api?.tray) return;
    try {
      const data = await api.tray.getSpreadsheetData({ id: item.id });
      if (!data?.univerData) return;
      const name = data.name || item.name || "spreadsheet";
      await exportToExcel(data.univerData, `${name}.xlsx`);
    } catch (err) {
      console.error("Failed to export spreadsheet:", err);
    }
  };

  const toggleSelect = (fileId: string) => {
    setSelectedIds((ids) =>
      ids.includes(fileId) ? ids.filter((x) => x !== fileId) : [...ids, fileId],
    );
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const paths: string[] = [];
    for (const file of Array.from(e.dataTransfer.files)) {
      const anyFile = file as any;
      if (anyFile?.path) paths.push(anyFile.path);
    }
    if (paths.length) {
      await importDropped(paths);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  return (
    <div
      className="relative w-[350px] h-full bg-[#0d0d0f]/95 rounded-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col animate-popover-in text-white/95 text-[13px] select-none box-border"
      role="application"
      tabIndex={-1}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      {/* Arrow pointer - integrated with background */}
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0d0d0f] border-t border-l border-white/10 rotate-45 z-[1]" />

      {isDragging && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full h-full border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center gap-3 bg-white/5">
            <IconUpload size={32} className="text-white/40" />
            <div className="text-base font-medium text-white">
              Drop files to import
            </div>
            <div className="text-sm text-white/40">
              {folders.find((f) => f.id === selectedFolderId)?.name || "Folder"}
            </div>
          </div>
        </div>
      )}

      <div className="p-3 pb-2 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
        <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5">
          <button
            type="button"
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              view === "quick"
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/40 hover:text-white/60",
            )}
            onClick={() => setView("quick")}
          >
            Quick
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              view === "files"
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/40 hover:text-white/60",
            )}
            onClick={() => setView("files")}
          >
            Files
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-medium text-white/20 tracking-wider">
            {navigator.platform.toLowerCase().includes("mac")
              ? "⌘1 · ⌘2"
              : "Ctrl1 · Ctrl2"}
          </div>
          <div
            className="w-7 h-7 rounded-full border border-white/10 overflow-hidden bg-white/5 flex items-center justify-center shrink-0 shadow-inner"
            title={user?.email || ""}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName || user.email}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-[10px] font-bold text-white/60">
                {(user?.email || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 pb-3">
        <div className="relative flex items-center group">
          <div className="absolute left-3 text-white/20 group-focus-within:text-blue-400 transition-colors pointer-events-none flex items-center">
            <IconSearch size={14} />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            className="w-full py-2.5 pl-9 pr-3 bg-black/40 border border-white/10 rounded-lg text-white text-[13px] outline-none transition-all focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 placeholder:text-white/20 shadow-inner"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {view === "quick" ? (
        <>
          <div className="px-3 pb-3 flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-2.5 p-2.5 rounded-lg text-white/90 text-[13px] transition-all hover:bg-blue-500/10 active:scale-[0.98] active:bg-white/10"
              onClick={pickAndImport}
            >
              <IconUpload size={16} className="text-white/60" />
              <span>{isImporting ? "Importing…" : "Import Files"}</span>
            </button>
          </div>

          <div className="h-px bg-white/5 mx-4 my-1" />

          <div className="relative flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4 scrollbar-hide">
              {isLoading ? (
                <div className="py-8 text-center text-white/20 animate-pulse italic">
                  Loading...
                </div>
              ) : (
                <>
                  <div className="mb-5">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1 flex items-center gap-2">
                      Images
                    </div>
                    {quickImageFiles.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-white/20 italic">
                        No images
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5 p-1">
                        {quickImageFiles.slice(0, 30).map((img) => (
                          <button
                            key={img.id}
                            type="button"
                            className="aspect-square rounded-md overflow-hidden bg-white/5 border border-white/5 hover:border-white/20 transition-all hover:scale-105 active:scale-95"
                            onClick={() => openViewer(quickImageFiles, img.id)}
                          >
                            <img
                              src={img.thumbnailUrl || img.url}
                              alt={img.originalName}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mb-5">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1 flex items-center gap-2">
                      <span>PDFs</span>
                      <button
                        type="button"
                        className="ml-auto w-6 h-6 flex items-center justify-center rounded hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                        onClick={() => handleAction("open-local-pdf")}
                        title="Open local PDF (view only)"
                      >
                        <IconFileTypePdf size={14} />
                      </button>
                    </div>
                    {quickPdfFiles.length === 0 ? (
                      <div className="px-2 py-1">
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full p-2 rounded-lg bg-white/5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                          onClick={() => handleAction("open-local-pdf")}
                        >
                          <IconFileTypePdf size={14} />
                          <span>Open Local PDF</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {quickPdfFiles.slice(0, 8).map((file) => (
                          <div
                            key={file.id}
                            className="group flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-all"
                          >
                            <button
                              type="button"
                              className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                              onClick={() => openFile(file.id)}
                            >
                              <IconFileText
                                size={14}
                                className="text-white/40 group-hover:text-blue-400 shrink-0"
                              />
                              <span className="truncate text-[13px]">
                                {file.originalName}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                              onClick={() => downloadFiles([file.id])}
                              title="Download"
                            >
                              <IconDownload size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mb-5">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1">
                      Spreadsheets
                    </div>
                    {filteredSpreadsheets.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-white/20 italic">
                        No spreadsheets
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {filteredSpreadsheets.slice(0, 8).map((item) => (
                          <div
                            key={item.id}
                            className="group flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-all"
                          >
                            <div className="flex-1 flex items-center gap-2.5 min-w-0">
                              <IconTable
                                size={14}
                                className="text-white/40 group-hover:text-green-400 shrink-0"
                              />
                              <span className="truncate text-[13px]">
                                {item.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                              onClick={() => downloadSpreadsheet(item)}
                              title="Download"
                            >
                              <IconDownload size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1 flex items-center gap-2">
                      Notes & Citations
                    </div>

                    <div className="px-2 py-1 text-[10px] font-medium text-white/20 uppercase tracking-widest mb-1">
                      Pinned
                    </div>
                    {pinnedCitations.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-white/20 italic">
                        No pinned notes
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5 mb-3">
                        {pinnedCitations.slice(0, 8).map((citation) => (
                          <div
                            key={citation.id}
                            className="group flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-all border-l-2 border-blue-500/50 bg-blue-500/5"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="truncate text-[13px] block">
                                {citation.label}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-blue-400 transition-colors"
                              onClick={() => togglePinCitation(citation.id)}
                              title="Unpin"
                            >
                              ★
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="px-2 py-1 text-[10px] font-medium text-white/20 uppercase tracking-widest mb-1">
                      Recent
                    </div>
                    {recentCitations.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-white/20 italic">
                        No recent notes
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {recentCitations.slice(0, 8).map((citation) => (
                          <div
                            key={citation.id}
                            className="group flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-all"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="truncate text-[13px] block">
                                {citation.label}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/20 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                              onClick={() => togglePinCitation(citation.id)}
                              title="Pin"
                            >
                              ☆
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="px-3 pb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0 border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg border border-white/5">
              <IconFolder size={14} className="text-white/40 ml-1.5" />
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="bg-transparent text-xs font-medium text-white outline-none py-1 pr-2 cursor-pointer"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[#1a1a1c]">
                    {f.name}
                    {f.isSensitive ? " (Secure)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-0.5 ml-auto">
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                onClick={pickAndImport}
                title="Import (Ctrl/⌘+U)"
              >
                <IconUpload size={14} />
              </button>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                onClick={createFolder}
                title="New folder"
              >
                +
              </button>
              <button
                type="button"
                className="px-2 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors text-[11px] font-medium"
                onClick={renameFolder}
                title="Rename folder"
              >
                Rename
              </button>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                onClick={deleteFolder}
                title="Delete folder"
              >
                <IconTrash size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-hide">
            <div className="px-3 py-3">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">
                {searchQuery ? "Files (filtered)" : "Files"}
              </div>
              <div className="flex flex-col gap-1">
                {(() => {
                  const current = folders.find(
                    (f) => f.id === selectedFolderId,
                  );
                  const isLocked =
                    !!current?.isSensitive &&
                    (sensitiveStatus?.unlockedUntil ?? 0) < Date.now();
                  if (isLocked) {
                    const canBiometric = !!sensitiveStatus?.canBiometric;
                    const pinEnabled = !!sensitiveStatus?.pinEnabled;
                    return (
                      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4">
                          <IconLock size={24} />
                        </div>
                        <div className="text-sm font-medium mb-1">
                          Sensitive folder locked
                        </div>
                        <div className="text-xs text-white/40 mb-6">
                          {canBiometric
                            ? "Unlock with Touch ID"
                            : pinEnabled
                              ? "Unlock with PIN"
                              : "Set a PIN to protect this folder"}
                        </div>
                        {canBiometric ? (
                          <button
                            type="button"
                            className="w-full max-w-[200px] bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-medium transition-colors"
                            onClick={unlockSensitive}
                          >
                            Unlock
                          </button>
                        ) : (
                          <div className="w-full max-w-[200px] flex flex-col gap-2">
                            <input
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-center tracking-[0.5em] outline-none focus:border-blue-500/50 transition-all"
                              type="password"
                              inputMode="numeric"
                              placeholder="••••"
                              maxLength={4}
                              value={pin}
                              onChange={(e) => setPin(e.target.value)}
                            />
                            <button
                              type="button"
                              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-medium transition-colors"
                              onClick={pinEnabled ? unlockWithPin : setNewPin}
                              disabled={pinBusy || pin.length < 4}
                            >
                              {pinEnabled
                                ? pinBusy
                                  ? "Unlocking…"
                                  : "Unlock"
                                : pinBusy
                                  ? "Saving…"
                                  : "Set PIN"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (filesError) {
                    return (
                      <div className="py-12 text-center text-red-400/80 text-xs px-6">
                        {filesError}
                      </div>
                    );
                  }

                  if (filteredFiles.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-white/20">
                        <IconFolder size={32} className="mb-3 opacity-20" />
                        <div className="text-sm italic">
                          No files in this folder
                        </div>
                      </div>
                    );
                  }

                  return filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className={cn(
                        "group flex items-center gap-2 p-2 rounded-lg transition-all",
                        selectedIds.includes(file.id)
                          ? "bg-blue-500/10 border border-blue-500/20"
                          : "hover:bg-white/5 border border-transparent",
                      )}
                    >
                      <button
                        type="button"
                        className="flex-1 flex items-center gap-3 min-w-0 text-left"
                        onClick={() =>
                          file.isImage
                            ? openViewer(imageFiles, file.id)
                            : openFile(file.id)
                        }
                      >
                        <div className="w-10 h-10 rounded-md overflow-hidden bg-black/20 border border-white/5 shrink-0 flex items-center justify-center">
                          {file.isImage ? (
                            <img
                              src={file.thumbnailUrl || file.url}
                              alt={file.originalName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-[10px] font-bold text-white/40">
                              {(file.ext || "FILE").toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate group-hover:text-blue-400 transition-colors">
                            {file.originalName}
                          </div>
                          <div className="text-[11px] text-white/30 truncate">
                            {formatBytes(file.size)} ·{" "}
                            {formatDate(file.lastOpenedAt || file.createdAt)}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          className={cn(
                            "w-7 h-7 flex items-center justify-center rounded transition-colors",
                            selectedIds.includes(file.id)
                              ? "text-blue-400"
                              : "text-white/20 hover:text-white hover:bg-white/10",
                          )}
                          onClick={() => toggleSelect(file.id)}
                          title="Select"
                        >
                          {selectedIds.includes(file.id) ? "✓" : "○"}
                        </button>
                        <button
                          type="button"
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-white/20 hover:text-white transition-colors"
                          onClick={() => downloadFiles([file.id])}
                          title="Download"
                        >
                          <IconDownload size={14} />
                        </button>
                        <button
                          type="button"
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                          onClick={() => deleteFile(file.id)}
                          title="Delete"
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {imageFiles.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2 mt-6">
                    Gallery
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 p-1">
                    {imageFiles.slice(0, 30).map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        className="aspect-square rounded-md overflow-hidden bg-white/5 border border-white/5 hover:border-white/20 transition-all hover:scale-105 active:scale-95"
                        onClick={() => openViewer(imageFiles, img.id)}
                      >
                        <img
                          src={img.thumbnailUrl || img.url}
                          alt={img.originalName}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="mx-3 mb-3 p-2 bg-blue-600 rounded-xl flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-bottom-2">
              <div className="pl-2 text-xs font-bold text-white">
                {selectedIds.length} selected
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors flex items-center gap-2"
                  onClick={() => downloadFiles(selectedIds)}
                >
                  <IconDownload size={14} />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors flex items-center gap-2"
                  onClick={() =>
                    Promise.all(selectedIds.map((id) => deleteFile(id))).then(
                      () => setSelectedIds([]),
                    )
                  }
                >
                  <IconTrash size={14} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <footer className="p-3 border-t border-white/5 bg-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all text-xs font-medium"
            onClick={() => handleAction("open-main")}
          >
            <IconExternalLink size={14} />
            <span>Open S-AGI</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all text-xs font-medium"
            onClick={() => handleAction("settings")}
          >
            <IconSettings size={14} />
            <span>Settings</span>
          </button>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs font-medium"
          onClick={() => handleAction("quit")}
          title="Quit S-AGI"
        >
          <IconLogout size={14} />
          <span>Quit</span>
        </button>
      </footer>

      {viewer.open && currentImage && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-[100] flex flex-col animate-in fade-in duration-200">
          <div className="p-4 flex items-center justify-between border-b border-white/5 shrink-0">
            <div className="text-sm font-medium truncate pr-4">
              {currentImage.originalName}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                onClick={() => downloadFiles([currentImage.id])}
                title="Download"
              >
                <IconDownload size={18} />
              </button>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-white/60 hover:text-red-400 transition-colors"
                onClick={() => deleteFile(currentImage.id)}
                title="Delete"
              >
                <IconTrash size={18} />
              </button>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                onClick={() =>
                  setViewer({ open: false, items: [], index: 0, zoom: 1 })
                }
                title="Close (Esc)"
              >
                <IconChevronRight size={18} className="rotate-90" />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="flex-1 relative overflow-hidden flex items-center justify-center cursor-zoom-in"
            onDoubleClick={() =>
              setViewer((v) => ({
                ...v,
                zoom: v.zoom === 1 ? 2 : v.zoom === 2 ? 3 : 1,
              }))
            }
            onWheel={(e) => {
              const isMac = navigator.platform.toLowerCase().includes("mac");
              const mod = isMac ? e.metaKey : e.ctrlKey;
              if (!mod) return;
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.15 : 0.15;
              setViewer((v) => ({
                ...v,
                zoom: Math.min(6, Math.max(1, v.zoom + delta)),
              }));
            }}
          >
            <img
              className="max-w-full max-h-full object-contain transition-transform duration-200 ease-out shadow-2xl"
              src={currentImage.url}
              alt={currentImage.originalName}
              style={{ transform: `scale(${viewer.zoom})` }}
            />
          </button>
          <div className="p-4 flex items-center justify-between border-t border-white/5 shrink-0">
            <button
              type="button"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-20 transition-all"
              disabled={viewer.index <= 0}
              onClick={() =>
                setViewer((v) => ({
                  ...v,
                  index: Math.max(0, v.index - 1),
                  zoom: 1,
                }))
              }
            >
              ←
            </button>
            <div className="text-xs font-medium text-white/40 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              {viewer.index + 1} / {viewer.items.length} ·{" "}
              {viewer.zoom.toFixed(2)}×
            </div>
            <button
              type="button"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-20 transition-all"
              disabled={viewer.index >= viewer.items.length - 1}
              onClick={() =>
                setViewer((v) => ({
                  ...v,
                  index: Math.min(v.items.length - 1, v.index + 1),
                  zoom: 1,
                }))
              }
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
