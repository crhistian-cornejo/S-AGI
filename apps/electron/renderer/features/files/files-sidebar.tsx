/**
 * FilesSidebar - Unified sidebar for managing Excel and Doc files
 * Similar pattern to chat sidebar with same collapse behavior
 *
 * Features:
 * - List files by type (excel/doc)
 * - Create new files
 * - Save scratch content as new file
 * - Pin/archive/delete files
 * - Search functionality
 * - Same collapse/expand behavior as chat sidebar
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
  IconPlus,
  IconSearch,
  IconPin,
  IconPinFilled,
  IconTrash,
  IconPencil,
  IconDots,
  IconTable,
  IconFileText,
  IconLayoutSidebarLeftCollapse,
  IconArchive,
  IconDeviceFloppy,
  IconArchiveOff,
  IconUpload,
} from "@tabler/icons-react";
import {
  currentExcelFileIdAtom,
  currentExcelFileAtom,
  currentDocFileIdAtom,
  currentDocFileAtom,
  excelScratchSessionIdAtom,
  docScratchSessionIdAtom,
  fileSnapshotCacheAtom,
  type UserFile,
  type UserFileType,
} from "@/lib/atoms/user-files";
import { trpc } from "@/lib/trpc";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn, isMacOS } from "@/lib/utils";
import { toast } from "sonner";
import { importFromExcel } from "@/features/univer/excel-exchange";
import { formatTimeAgo, formatDateWithTime } from "@/utils/time-format";
import { FontWarningDialog } from "@/components/font-warning-dialog";

// ============================================================================
// FadeScrollArea
// ============================================================================
interface FadeScrollAreaProps {
  children: React.ReactNode;
  className?: string;
}

function FadeScrollArea({ children, className }: FadeScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollUp(scrollTop > 0);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });

    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll]);

  return (
    <div className={cn("relative flex-1 overflow-hidden w-full", className)}>
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-b from-sidebar to-transparent",
          canScrollUp ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent w-full"
      >
        {children}
      </div>
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-t from-sidebar to-transparent",
          canScrollDown ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

// ============================================================================
// FileItem - Individual file item
// ============================================================================
interface FileItemProps {
  file: UserFile;
  isSelected: boolean;
  isEditing: boolean;
  editingName: string;
  onSelect: () => void;
  onStartRename: () => void;
  onSaveRename: (name: string) => void;
  onCancelRename: () => void;
  onSetEditingName: (name: string) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
}

function FileItem({
  file,
  isSelected,
  isEditing,
  editingName,
  onSelect,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onSetEditingName,
  onDelete,
  onTogglePin,
  onToggleArchive,
}: FileItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const FileIcon = file.type === "excel" ? IconTable : IconFileText;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-200 cursor-pointer select-none w-full text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary",
        isSelected
          ? "bg-accent/80 text-accent-foreground"
          : "text-foreground/70 hover:bg-accent/50 hover:text-foreground",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Icon */}
      <div
        className={cn(
          "shrink-0 transition-colors",
          isSelected ? "text-primary" : "text-muted-foreground/60",
        )}
      >
        {file.icon ? (
          <span className="text-base">{file.icon}</span>
        ) : (
          <FileIcon size={16} />
        )}
      </div>

      {/* Name or input */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editingName}
            onChange={(e) => onSetEditingName(e.target.value)}
            onBlur={() => onSaveRename(editingName)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveRename(editingName);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelRename();
              }
            }}
            className="h-6 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="block truncate text-sm font-medium">
              {file.name}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground/60">
                {file.last_opened_at
                  ? formatTimeAgo(file.last_opened_at, { includeDate: true })
                  : formatTimeAgo(file.updated_at, { includeDate: true })}
              </span>
              <span className="text-[10px] text-muted-foreground/40">·</span>
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                v{file.version_count}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Pin indicator */}
      {file.is_pinned && !isEditing && (
        <IconPinFilled size={12} className="text-primary shrink-0" />
      )}

      {/* Actions */}
      <div
        className={cn(
          "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          isSelected && "opacity-100",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className="p-1 hover:bg-accent rounded transition-colors cursor-pointer"
              onClick={(e) => e.stopPropagation()}
              role="button"
              tabIndex={0}
            >
              <IconDots size={12} className="text-muted-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onStartRename}>
              <IconPencil size={14} className="mr-2" />
              Renombrar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              {file.is_pinned ? (
                <>
                  <IconPin size={14} className="mr-2" />
                  Desfijar
                </>
              ) : (
                <>
                  <IconPinFilled size={14} className="mr-2" />
                  Fijar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onToggleArchive}>
              {file.is_archived ? (
                <>
                  <IconArchiveOff size={14} className="mr-2" />
                  Desarchivar
                </>
              ) : (
                <>
                  <IconArchive size={14} className="mr-2" />
                  Archivar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <IconTrash size={14} className="mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ============================================================================
// ScratchItem - Item for unsaved scratch content
// ============================================================================
interface ScratchItemProps {
  type: UserFileType;
  isSelected: boolean;
  hasDirtyContent: boolean;
  onSelect: () => void;
  onSaveAsNew: () => void;
}

function ScratchItem({
  type,
  isSelected,
  hasDirtyContent,
  onSelect,
  onSaveAsNew,
}: ScratchItemProps) {
  const FileIcon = type === "excel" ? IconTable : IconFileText;
  const label = type === "excel" ? "Hoja nueva" : "Documento nuevo";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-200 cursor-pointer select-none w-full text-left outline-none border border-dashed",
        isSelected
          ? "bg-accent/80 text-accent-foreground border-primary/50"
          : "text-foreground/70 hover:bg-accent/50 hover:text-foreground border-border/50",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div
        className={cn(
          "shrink-0 transition-colors",
          isSelected ? "text-primary" : "text-muted-foreground/60",
        )}
      >
        <FileIcon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="block truncate text-sm">{label}</span>
        <span className="block text-[10px] text-muted-foreground/60">
          {hasDirtyContent ? "Sin guardar" : "Vacío"}
        </span>
      </div>
      {hasDirtyContent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="p-1 hover:bg-accent rounded transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSaveAsNew();
              }}
              role="button"
              tabIndex={0}
            >
              <IconDeviceFloppy size={14} className="text-primary" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Guardar como archivo</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ============================================================================
// Main FilesSidebar Component
// ============================================================================
interface FilesSidebarProps {
  type: UserFileType;
  // isOpen is now controlled by main-layout container
  onToggle: () => void;
}

export function FilesSidebar({ type, onToggle }: FilesSidebarProps) {
  // File atoms based on type
  const [currentExcelFileId, setCurrentExcelFileId] = useAtom(
    currentExcelFileIdAtom,
  );
  const setCurrentExcelFile = useSetAtom(currentExcelFileAtom);
  const [currentDocFileId, setCurrentDocFileId] = useAtom(currentDocFileIdAtom);
  const setCurrentDocFile = useSetAtom(currentDocFileAtom);

  const excelScratchId = useAtomValue(excelScratchSessionIdAtom);
  const docScratchId = useAtomValue(docScratchSessionIdAtom);
  const fileSnapshotCache = useAtomValue(fileSnapshotCacheAtom);

  // Derived values based on type
  const currentFileId =
    type === "excel" ? currentExcelFileId : currentDocFileId;
  const setCurrentFileId =
    type === "excel" ? setCurrentExcelFileId : setCurrentDocFileId;
  const setCurrentFile =
    type === "excel" ? setCurrentExcelFile : setCurrentDocFile;
  const scratchSessionId = type === "excel" ? excelScratchId : docScratchId;

  const [searchQuery, setSearchQuery] = useState("");
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState(
    type === "excel" ? "Nuevo archivo" : "Nuevo documento",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Fetch files list - ordered by last_opened_at DESC (most recent first)
  const { data: files = [], isLoading } = trpc.userFiles.list.useQuery(
    {
      type,
      includeArchived: false,
      limit: 100,
    },
    {
      // Refetch when files are updated
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 seconds
    },
  );

  // Fetch file data when selected
  const { data: selectedFileData } = trpc.userFiles.get.useQuery(
    { id: currentFileId! },
    { enabled: !!currentFileId },
  );

  // Update current file atom when data is fetched
  useEffect(() => {
    if (selectedFileData) {
      setCurrentFile(selectedFileData);
    }
  }, [selectedFileData, setCurrentFile]);

  // Load last opened file on mount if no file is selected
  const { data: lastOpenedFile } = trpc.userFiles.getLastOpened.useQuery(
    { type },
    { enabled: !currentFileId },
  );

  useEffect(() => {
    if (lastOpenedFile && !currentFileId) {
      setCurrentFileId(lastOpenedFile.id);
      setCurrentFile(lastOpenedFile);
    }
  }, [lastOpenedFile, currentFileId, setCurrentFileId, setCurrentFile]);

  // Mutations
  const createFileMutation = trpc.userFiles.create.useMutation({
    onSuccess: (file) => {
      setCurrentFileId(file.id);
      setCurrentFile(file);
      utils.userFiles.list.invalidate();
      toast.success(type === "excel" ? "Archivo creado" : "Documento creado");
    },
  });

  const renameFileMutation = trpc.userFiles.rename.useMutation({
    onSuccess: () => {
      utils.userFiles.list.invalidate();
      toast.success("Renombrado");
    },
  });

  const togglePinMutation = trpc.userFiles.togglePin.useMutation({
    onSuccess: () => {
      utils.userFiles.list.invalidate();
    },
  });

  const toggleArchiveMutation = trpc.userFiles.toggleArchive.useMutation({
    onSuccess: () => {
      utils.userFiles.list.invalidate();
      toast.success("Archivado");
    },
  });

  const deleteFileMutation = trpc.userFiles.delete.useMutation({
    onSuccess: () => {
      if (fileToDelete === currentFileId) {
        setCurrentFileId(null);
        setCurrentFile(null);
      }
      utils.userFiles.list.invalidate();
      toast.success("Eliminado");
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    },
  });

  const markOpenedMutation = trpc.userFiles.markOpened.useMutation();

  // Check if scratch has dirty content
  const scratchSnapshot = fileSnapshotCache[scratchSessionId];
  const hasDirtyScratch = scratchSnapshot?.isDirty || false;

  // Filter files by search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const query = searchQuery.toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(query));
  }, [files, searchQuery]);

  // Separate pinned and regular files, sort regular by last_opened_at DESC
  const pinnedFiles = filteredFiles.filter((f) => f.is_pinned);
  const regularFiles = filteredFiles
    .filter((f) => !f.is_pinned)
    .sort((a, b) => {
      // Sort by last_opened_at DESC (most recent first)
      // If last_opened_at is null, use updated_at as fallback
      const dateA = a.last_opened_at || a.updated_at;
      const dateB = b.last_opened_at || b.updated_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

  // Handlers
  const handleSelectFile = useCallback(
    (fileId: string) => {
      // CRITICAL: Clear the current file data FIRST to prevent showing stale data
      // from a different file while the new file data is being fetched
      if (fileId !== currentFileId) {
        console.log("[FilesSidebar] Clearing stale file data before selecting:", fileId);
        setCurrentFile(null);
      }
      setCurrentFileId(fileId);
      markOpenedMutation.mutate({ id: fileId });
    },
    [setCurrentFileId, setCurrentFile, currentFileId, markOpenedMutation],
  );

  const handleSelectScratch = useCallback(() => {
    setCurrentFileId(null);
    setCurrentFile(null);
  }, [setCurrentFileId, setCurrentFile]);

  const handleCreateFile = useCallback(() => {
    createFileMutation.mutate({
      type,
      name: type === "excel" ? "Nuevo archivo" : "Nuevo documento",
    });
  }, [createFileMutation, type]);

  const handleSaveScratchAsNew = useCallback(() => {
    setSaveAsDialogOpen(true);
  }, []);

  const handleConfirmSaveAsNew = useCallback(() => {
    const scratchData = fileSnapshotCache[scratchSessionId]?.univerData;
    createFileMutation.mutate({
      type,
      name:
        newFileName || (type === "excel" ? "Nuevo archivo" : "Nuevo documento"),
      univerData: scratchData,
    });
    setSaveAsDialogOpen(false);
    setNewFileName(type === "excel" ? "Nuevo archivo" : "Nuevo documento");
  }, [
    createFileMutation,
    fileSnapshotCache,
    scratchSessionId,
    newFileName,
    type,
  ]);

  const handleImportClick = useCallback(() => {
    if (type !== "excel") return;
    fileInputRef.current?.click();
  }, [type]);

  const [missingFonts, setMissingFonts] = useState<string[]>([]);
  const [showFontDialog, setShowFontDialog] = useState(false);

  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const univerData = await importFromExcel(file, (fonts) => {
          setMissingFonts(fonts);
          setShowFontDialog(true);
        });
        const name = univerData.name || file.name.replace(/\.xlsx?$/i, "");
        createFileMutation.mutate({
          type: "excel",
          name,
          univerData: univerData as unknown as Record<string, unknown>,
        });
        toast.success("Excel importado");
      } catch (error) {
        console.error("[FilesSidebar] Failed to import Excel:", error);
        toast.error("No se pudo importar el Excel");
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [createFileMutation],
  );

  const handleStartRename = useCallback(
    (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (file) {
        setEditingFileId(fileId);
        setEditingName(file.name);
      }
    },
    [files],
  );

  const handleSaveRename = useCallback(
    (fileId: string, name: string) => {
      if (name.trim()) {
        renameFileMutation.mutate({ id: fileId, name: name.trim() });
      }
      setEditingFileId(null);
      setEditingName("");
    },
    [renameFileMutation],
  );

  const handleCancelRename = useCallback(() => {
    setEditingFileId(null);
    setEditingName("");
  }, []);

  const handleTogglePin = useCallback(
    (fileId: string) => {
      togglePinMutation.mutate({ id: fileId });
    },
    [togglePinMutation],
  );

  const handleToggleArchive = useCallback(
    (fileId: string) => {
      toggleArchiveMutation.mutate({ id: fileId });
    },
    [toggleArchiveMutation],
  );

  const handleDeleteFile = useCallback((fileId: string) => {
    setFileToDelete(fileId);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (fileToDelete) {
      deleteFileMutation.mutate({ id: fileToDelete });
    }
  }, [fileToDelete, deleteFileMutation]);

  // Check if scratch is selected (no file selected)
  const isScratchSelected = !currentFileId;

  const TypeIcon = type === "excel" ? IconTable : IconFileText;
  const typeLabel = type === "excel" ? "Hojas de cálculo" : "Documentos";

  // Sidebar content is now rendered inside a container controlled by main-layout
  // This component just renders the inner content
  return (
    <>
      {type === "excel" && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImportFile}
        />
      )}
      <div className="h-full flex flex-col">
        {/* Header with traffic lights space on macOS */}
        <div
          className={cn(
            "flex items-center justify-between px-3 py-2 border-b border-border/50",
            isMacOS() && "pt-8",
          )}
        >
          <div className="flex items-center gap-2">
            <TypeIcon size={18} className="text-primary" />
            <span className="text-sm font-semibold">{typeLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            {type === "excel" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleImportClick}
                  >
                    <IconUpload size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Importar Excel (.xlsx)</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCreateFile}
                  disabled={createFileMutation.isPending}
                >
                  <IconPlus size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nuevo</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onToggle}
                >
                  <IconLayoutSidebarLeftCollapse size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ocultar</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border/50">
          <div className="relative">
            <IconSearch
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-sm bg-background/50 border-border/50"
            />
          </div>
        </div>

        {/* Files List */}
        <FadeScrollArea>
          <div className="px-2 py-2 space-y-1">
            {/* Scratch section */}
            <div className="mb-3">
              <ScratchItem
                type={type}
                isSelected={isScratchSelected}
                hasDirtyContent={hasDirtyScratch}
                onSelect={handleSelectScratch}
                onSaveAsNew={handleSaveScratchAsNew}
              />
            </div>

            {/* Pinned Files */}
            {pinnedFiles.length > 0 && (
              <div className="mb-3">
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Fijados
                </div>
                <div className="space-y-0.5">
                  {pinnedFiles.map((file) => (
                    <FileItem
                      key={file.id}
                      file={file as UserFile}
                      isSelected={currentFileId === file.id}
                      isEditing={editingFileId === file.id}
                      editingName={editingName}
                      onSelect={() => handleSelectFile(file.id)}
                      onStartRename={() => handleStartRename(file.id)}
                      onSaveRename={(name) => handleSaveRename(file.id, name)}
                      onCancelRename={handleCancelRename}
                      onSetEditingName={setEditingName}
                      onDelete={() => handleDeleteFile(file.id)}
                      onTogglePin={() => handleTogglePin(file.id)}
                      onToggleArchive={() => handleToggleArchive(file.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Regular Files */}
            {regularFiles.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Recientes
                </div>
                <div className="space-y-0.5">
                  {regularFiles.map((file) => (
                    <FileItem
                      key={file.id}
                      file={file as UserFile}
                      isSelected={currentFileId === file.id}
                      isEditing={editingFileId === file.id}
                      editingName={editingName}
                      onSelect={() => handleSelectFile(file.id)}
                      onStartRename={() => handleStartRename(file.id)}
                      onSaveRename={(name) => handleSaveRename(file.id, name)}
                      onCancelRename={handleCancelRename}
                      onSetEditingName={setEditingName}
                      onDelete={() => handleDeleteFile(file.id)}
                      onTogglePin={() => handleTogglePin(file.id)}
                      onToggleArchive={() => handleToggleArchive(file.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Cargando...
              </div>
            )}

            {/* Empty state */}
            {!isLoading && files.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                <p>No hay archivos</p>
                <button
                  type="button"
                  onClick={handleCreateFile}
                  className="text-primary hover:underline mt-1"
                >
                  Crear nuevo
                </button>
              </div>
            )}

            {/* No search results */}
            {!isLoading && searchQuery && filteredFiles.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                Sin resultados
              </div>
            )}
          </div>
        </FadeScrollArea>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar archivo</DialogTitle>
            <DialogDescription>
              Esta accion no se puede deshacer. El archivo sera eliminado
              permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as new file dialog */}
      <Dialog open={saveAsDialogOpen} onOpenChange={setSaveAsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar como nuevo archivo</DialogTitle>
            <DialogDescription>
              Ingresa un nombre para el nuevo archivo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Nombre del archivo"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveAsDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmSaveAsNew}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FontWarningDialog
        open={showFontDialog}
        onOpenChange={setShowFontDialog}
        missingFonts={missingFonts}
      />
    </>
  );
}
