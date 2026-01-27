/**
 * File Version History Panel - Compact Design
 *
 * Diseño compacto y funcional similar a Excel/Google Sheets:
 * - Cards compactas como FileItem
 * - Preview funcional cargando versión en Univer
 * - Restauración clara y directa
 * - Estilo adaptado al UI existente
 */

import * as React from "react";
import { useFileVersions } from "@/hooks/use-file-versions";
import { FileExportButton } from "./file-export-button";
import { Button } from "@/components/ui/button";
import {
  IconX,
  IconHistory,
  IconRestore,
  IconEye,
  IconClock,
  IconCheck,
  IconDeviceFloppy,
  IconRobot,
  IconUser,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { calculateDiffStats } from "@/utils/univer-diff-stats";
import { formatTimeAgo } from "@/utils/time-format";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSetAtom } from "jotai";
import {
  currentExcelFileIdAtom,
  currentDocFileIdAtom,
} from "@/lib/atoms/user-files";

interface FileVersionHistoryPanelProps {
  fileId: string | null;
  fileType: "excel" | "doc" | "note";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreviewVersion?: (versionNumber: number | null) => void; // Callback para cargar versión en Univer
}

export function FileVersionHistoryPanel({
  fileId,
  fileType,
  open,
  onOpenChange,
  onPreviewVersion,
}: FileVersionHistoryPanelProps) {
  const {
    versions,
    isLoadingVersions,
    previewVersion,
    isRestoring,
    selectVersionForPreview,
    restoreVersion,
    getChangeTypeLabel,
    formatSize,
  } = useFileVersions(fileId);

  const setCurrentExcelFileId = useSetAtom(currentExcelFileIdAtom);
  const setCurrentDocFileId = useSetAtom(currentDocFileIdAtom);

  // Get current user for avatar
  const { data: currentUser } = trpc.auth.getUser.useQuery();

  // Get current file to show accurate version count
  const { data: currentFile } = trpc.userFiles.get.useQuery(
    { id: fileId! },
    { enabled: !!fileId },
  );

  // Group versions by date
  const versionGroups = React.useMemo(() => {
    if (!versions || versions.length === 0) {
      return [];
    }

    const groups: Map<string, typeof versions> = new Map();

    for (const version of versions) {
      const date = new Date(version.created_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const versionDate = new Date(date);
      versionDate.setHours(0, 0, 0, 0);

      let groupKey: string;
      if (versionDate.getTime() === today.getTime()) {
        groupKey = "Hoy";
      } else if (versionDate.getTime() === today.getTime() - 86400000) {
        groupKey = "Ayer";
      } else {
        groupKey = date.toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(version);
    }

    const groupOrder = ["Hoy", "Ayer"];
    const sortedGroups: Array<{ date: string; versions: typeof versions }> = [];

    for (const key of groupOrder) {
      if (groups.has(key)) {
        sortedGroups.push({ date: key, versions: groups.get(key)! });
        groups.delete(key);
      }
    }

    const remaining = Array.from(groups.entries())
      .map(([date, versions]) => ({ date, versions }))
      .sort((a, b) => {
        const dateA = new Date(a.versions[0]?.created_at || 0);
        const dateB = new Date(b.versions[0]?.created_at || 0);
        return dateB.getTime() - dateA.getTime();
      });

    return [...sortedGroups, ...remaining];
  }, [versions]);

  const handlePreview = async (versionNumber: number) => {
    selectVersionForPreview(versionNumber);
    if (onPreviewVersion) {
      onPreviewVersion(versionNumber);
    }
  };

  const handleRestore = async (versionNumber: number) => {
    if (
      !confirm(
        `¿Restaurar a la versión ${versionNumber}? Esto creará una nueva versión con el contenido de esta versión.`,
      )
    ) {
      return;
    }

    try {
      await restoreVersion(versionNumber);
      toast.success("Versión restaurada");
      // Cerrar preview si estaba activo
      selectVersionForPreview(null);
      if (onPreviewVersion) {
        onPreviewVersion(null);
      }
    } catch (error) {
      toast.error("Error al restaurar versión");
    }
  };

  const handleBackToCurrent = () => {
    selectVersionForPreview(null);
    if (onPreviewVersion) {
      onPreviewVersion(null);
    }
  };

  if (!fileId) {
    return null;
  }

  // Use file version_count for consistency across the app
  // Fallback to versions.length if file data not loaded yet
  const totalVersions = currentFile?.version_count || versions?.length || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[400px] p-0 flex flex-col bg-background [&>button]:hidden"
      >
        {/* Compact Header */}
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconHistory size={18} className="text-muted-foreground" />
              <SheetTitle className="text-base font-semibold">
                Historial
              </SheetTitle>
              <Badge variant="secondary" className="text-xs">
                {totalVersions}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <FileExportButton
                fileId={fileId}
                fileType={fileType}
                variant="ghost"
                size="sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onOpenChange(false)}
              >
                <IconX size={16} />
              </Button>
            </div>
          </div>
          {previewVersion && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Vista previa: v{previewVersion}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={handleBackToCurrent}
              >
                Volver a actual
              </Button>
            </div>
          )}
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {/* Loading overlay - doesn't hide the table */}
          {isLoadingVersions && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Cargando...</p>
              </div>
            </div>
          )}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {versionGroups.length > 0
                ? versionGroups.map((group, groupIdx) => (
                    <div key={groupIdx} className="space-y-1">
                      {/* Compact Group Header */}
                      <div className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.date}
                          </span>
                          <Separator className="flex-1" />
                          <span className="text-[10px] text-muted-foreground">
                            {group.versions.length}
                          </span>
                        </div>
                      </div>

                      {/* Compact Version Cards */}
                      {group.versions.map((version, idx) => {
                        const prevVersion =
                          idx < group.versions.length - 1
                            ? group.versions[idx + 1]
                            : null;

                        // Calculate diff stats directly (no useMemo inside map)
                        let diffStats = null;
                        if (prevVersion && fileType !== "note") {
                          if (version.univer_data && prevVersion.univer_data) {
                            try {
                              diffStats = calculateDiffStats(
                                prevVersion.univer_data,
                                version.univer_data,
                              );
                            } catch (err) {
                              diffStats = null;
                            }
                          }
                        }

                        const isSelected =
                          previewVersion === version.version_number;

                        // Get user info for this version
                        // For now, we'll use current user's avatar if the version was created by current user
                        // In the future, we can enhance this with user data from the backend
                        const userAvatar =
                          currentUser?.user_metadata?.avatar_url || null;
                        const userName =
                          currentUser?.user_metadata?.full_name ||
                          currentUser?.email?.split("@")[0] ||
                          "Usuario";

                        return (
                          <CompactVersionCard
                            key={version.id}
                            version={version}
                            diffStats={diffStats}
                            isSelected={isSelected}
                            isRestoring={isRestoring}
                            userAvatar={userAvatar}
                            userName={userName}
                            onPreview={() =>
                              handlePreview(version.version_number)
                            }
                            onRestore={() =>
                              handleRestore(version.version_number)
                            }
                            getChangeTypeLabel={getChangeTypeLabel}
                            formatSize={formatSize}
                          />
                        );
                      })}
                    </div>
                  ))
                : null}
              {/* Show empty state only when not loading and no versions */}
              {!isLoadingVersions && versionGroups.length === 0 && (
                <div className="text-center py-12">
                  <IconHistory
                    size={32}
                    className="mx-auto mb-3 opacity-30 text-muted-foreground"
                  />
                  <p className="text-sm text-muted-foreground">
                    No hay versiones aún
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Compact Version Card - Similar to FileItem
interface CompactVersionCardProps {
  version: any;
  diffStats: any;
  isSelected: boolean;
  isRestoring: boolean;
  userAvatar: string | null;
  userName: string;
  onPreview: () => void;
  onRestore: () => void;
  getChangeTypeLabel: (type: string) => string;
  formatSize: (bytes?: number) => string;
}

function CompactVersionCard({
  version,
  diffStats,
  isSelected,
  isRestoring,
  userAvatar,
  userName,
  onPreview,
  onRestore,
  getChangeTypeLabel,
  formatSize,
}: CompactVersionCardProps) {
  const isAIGenerated = version.ai_model || version.tool_name;

  // Get user initials for fallback
  const userInitials =
    userName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case "auto_save":
        return "text-blue-600 dark:text-blue-400";
      case "manual_save":
        return "text-green-600 dark:text-green-400";
      case "ai_edit":
        return "text-purple-600 dark:text-purple-400";
      case "restore":
        return "text-orange-600 dark:text-orange-400";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-200 cursor-pointer select-none w-full text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary",
        isSelected
          ? "bg-accent/80 text-accent-foreground"
          : "text-foreground/70 hover:bg-accent/50 hover:text-foreground",
      )}
      onClick={onPreview}
      role="button"
      tabIndex={0}
    >
      {/* Avatar */}
      <Avatar className="h-7 w-7 shrink-0">
        {userAvatar && !isAIGenerated ? (
          <AvatarImage src={userAvatar} alt={userName} />
        ) : null}
        <AvatarFallback
          className={cn(
            "text-[10px] font-semibold",
            isAIGenerated
              ? "bg-purple-500/20 text-purple-600 dark:text-purple-400"
              : "bg-primary/10 text-primary",
          )}
        >
          {isAIGenerated ? (
            <IconRobot size={14} />
          ) : (
            userInitials || <IconUser size={14} />
          )}
        </AvatarFallback>
      </Avatar>

      {/* Version Number Badge */}
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 w-8 text-center text-[10px] font-mono font-bold px-1.5 py-0 h-5",
          isSelected
            ? "bg-primary/10 text-primary border-primary/30"
            : "text-muted-foreground/60",
        )}
      >
        v{version.version_number}
      </Badge>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 h-4 font-medium",
              version.change_type === "auto_save" &&
                "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
              version.change_type === "manual_save" &&
                "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
              version.change_type === "ai_edit" &&
                "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
              version.change_type === "restore" &&
                "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
            )}
          >
            {getChangeTypeLabel(version.change_type)}
          </Badge>
          {isAIGenerated && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
            >
              <IconRobot size={10} className="mr-0.5" />
              {version.tool_name || "IA"}
            </Badge>
          )}
          {version.commit_message && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground"
            >
              {version.commit_message}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground/60">
            {formatTimeAgo(version.created_at, { includeDate: true })}
          </span>
          {version.size_bytes && (
            <>
              <span className="text-[10px] text-muted-foreground/40">·</span>
              <span className="text-[10px] text-muted-foreground/60">
                {formatSize(version.size_bytes)}
              </span>
            </>
          )}
          {/* Compact Diff Stats */}
          {diffStats && diffStats.totalChanges > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground/40">·</span>
              <div className="flex items-center gap-1 flex-wrap">
                {diffStats.cellsAdded > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 font-medium"
                  >
                    +{diffStats.cellsAdded}
                  </Badge>
                )}
                {diffStats.cellsModified > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-medium"
                  >
                    ~{diffStats.cellsModified}
                  </Badge>
                )}
                {diffStats.cellsDeleted > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 font-medium"
                  >
                    -{diffStats.cellsDeleted}
                  </Badge>
                )}
                {(diffStats.sheetsAdded > 0 || diffStats.sheetsDeleted > 0) && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-medium"
                  >
                    {diffStats.sheetsAdded > 0 &&
                      `+${diffStats.sheetsAdded} hoja${diffStats.sheetsAdded !== 1 ? "s" : ""}`}
                    {diffStats.sheetsAdded > 0 &&
                      diffStats.sheetsDeleted > 0 &&
                      ", "}
                    {diffStats.sheetsDeleted > 0 &&
                      `-${diffStats.sheetsDeleted} hoja${diffStats.sheetsDeleted !== 1 ? "s" : ""}`}
                  </Badge>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 will-change-opacity",
          isSelected && "opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onRestore}
          disabled={isRestoring}
          title="Restaurar esta versión"
        >
          <IconRestore size={14} />
        </Button>
      </div>
    </div>
  );
}
