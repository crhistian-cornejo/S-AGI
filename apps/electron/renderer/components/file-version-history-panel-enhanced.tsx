/**
 * File Version History Panel - Enhanced Professional Sheet
 *
 * Panel de historial de versiones estilo profesional con:
 * - Avatares de usuario desde Supabase
 * - Diseño moderno inspirado en Deployment panels
 * - Mejor organización visual
 */

import * as React from "react";
import { useFileVersions } from "@/hooks/use-file-versions";
import { FileVersionDiff } from "./file-version-diff";
import { FileExportButton } from "./file-export-button";
import { useFileHighlight } from "@/hooks/use-file-highlight";
import { Button } from "@/components/ui/button";
import {
  IconX,
  IconHistory,
  IconRestore,
  IconEye,
  IconGitCommit,
  IconHighlight,
  IconClock,
  IconUser,
  IconRobot,
  IconCheck,
  IconAlertTriangle,
  IconInfoCircle,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { diffWorkbooks } from "@/utils/univer-diff";
import { calculateDiffStats } from "@/utils/univer-diff-stats";
import {
  formatTimeAgo,
  formatFullDateTime,
  getDateGroup,
} from "@/utils/time-format";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface FileVersionHistoryPanelProps {
  fileId: string | null;
  fileType: "excel" | "doc" | "note";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileVersionHistoryPanel({
  fileId,
  fileType,
  open,
  onOpenChange,
}: FileVersionHistoryPanelProps) {
  const {
    versions,
    isLoadingVersions,
    previewVersion,
    previewVersionData,
    selectedVersions,
    comparisonData,
    isLoadingComparison,
    isRestoring,
    selectVersionForPreview,
    selectVersionsForComparison,
    clearComparison,
    restoreVersion,
    getChangeTypeLabel,
    getChangeTypeIcon,
    formatSize,
  } = useFileVersions(fileId);

  // Get current user for avatar
  const { data: currentUser } = trpc.auth.getUser.useQuery();

  const [viewMode, setViewMode] = React.useState<
    "list" | "preview" | "compare"
  >("list");
  const [commitMessage, setCommitMessage] = React.useState("");
  const [showCommitDialog, setShowCommitDialog] = React.useState(false);
  const [highlightEnabled, setHighlightEnabled] = React.useState(false);

  const { highlightDiff, clearAll } = useFileHighlight();

  const createCommitMutation = trpc.userFiles.createCommit.useMutation({
    onSuccess: () => {
      toast.success("Commit creado");
      setShowCommitDialog(false);
      setCommitMessage("");
    },
    onError: (error) => {
      toast.error("Error al crear commit: " + error.message);
    },
  });

  // Get user metadata for avatar
  const userMetadata = React.useMemo(() => {
    if (!currentUser?.user_metadata) return null;
    const md = currentUser.user_metadata as Record<string, unknown>;
    return {
      avatarUrl: (md.avatar_url as string) || null,
      fullName:
        (md.full_name as string) ||
        currentUser.email?.split("@")[0] ||
        "Usuario",
      email: currentUser.email || "",
    };
  }, [currentUser]);

  // Group versions by date with better formatting
  const versionGroups = React.useMemo(() => {
    if (!versions || versions.length === 0) {
      return [];
    }

    const groups: Map<string, typeof versions> = new Map();

    for (const version of versions) {
      const groupKey = getDateGroup(version.created_at);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(version);
    }

    // Sort groups: Hoy, Ayer, Esta semana, etc.
    const groupOrder = ["Hoy", "Ayer", "Esta semana", "Este mes"];
    const sortedGroups: Array<{ date: string; versions: typeof versions }> = [];

    for (const key of groupOrder) {
      if (groups.has(key)) {
        sortedGroups.push({ date: key, versions: groups.get(key)! });
        groups.delete(key);
      }
    }

    // Add remaining groups sorted by date
    const remaining = Array.from(groups.entries())
      .map(([date, versions]) => ({ date, versions }))
      .sort((a, b) => {
        const dateA = new Date(a.versions[0]?.created_at || 0);
        const dateB = new Date(b.versions[0]?.created_at || 0);
        return dateB.getTime() - dateA.getTime();
      });

    return [...sortedGroups, ...remaining];
  }, [versions]);

  // Auto-switch to preview when version selected
  React.useEffect(() => {
    if (previewVersion) {
      setViewMode("preview");
    }
  }, [previewVersion]);

  // Auto-switch to compare when versions selected
  React.useEffect(() => {
    if (selectedVersions) {
      setViewMode("compare");
    }
  }, [selectedVersions]);

  const handleRestore = async (versionNumber: number) => {
    if (
      !confirm(
        `¿Restaurar a la versión ${versionNumber}? Esto creará una nueva versión.`,
      )
    ) {
      return;
    }

    try {
      await restoreVersion(versionNumber);
      toast.success("Versión restaurada");
      onOpenChange(false);
    } catch (error) {
      toast.error("Error al restaurar versión");
    }
  };

  const handleCreateCommit = () => {
    if (!commitMessage.trim()) {
      toast.error("El mensaje del commit no puede estar vacío");
      return;
    }

    const versionNumbers = selectedVersions
      ? [selectedVersions[0], selectedVersions[1]].filter((v) => v > 0)
      : versions.length > 0
        ? [versions[0].version_number]
        : [];

    if (versionNumbers.length === 0) {
      toast.error("No hay versiones para agrupar");
      return;
    }

    createCommitMutation.mutate({
      fileId: fileId!,
      message: commitMessage,
      versionNumbers: versionNumbers.length > 1 ? versionNumbers : undefined,
    });
  };

  if (!fileId) {
    return null;
  }

  const totalVersions = versions?.length || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[640px] lg:w-[720px] p-0 flex flex-col bg-background [&>button]:hidden"
      >
        {/* Enhanced Header */}
        <SheetHeader className="px-6 py-5 border-b bg-muted/30">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              {/* Icon with background */}
              <div className="p-3 bg-primary/10 rounded-xl">
                <IconHistory size={24} className="text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <SheetTitle className="text-xl font-bold mb-1">
                  Historial de Versiones
                </SheetTitle>
                <SheetDescription className="text-sm">
                  {totalVersions} versión{totalVersions !== 1 ? "es" : ""}{" "}
                  guardada{totalVersions !== 1 ? "s" : ""}
                </SheetDescription>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <FileExportButton
                fileId={fileId}
                fileType={fileType}
                variant="outline"
                size="sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => onOpenChange(false)}
              >
                <IconX size={18} />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isLoadingVersions ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm font-medium text-muted-foreground">
                  Cargando historial...
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Version List */}
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-8">
                  {versionGroups.map((group, groupIdx) => (
                    <div key={groupIdx} className="space-y-3">
                      {/* Group Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          {group.date}
                        </h3>
                        <Separator className="flex-1" />
                        <Badge
                          variant="secondary"
                          className="text-xs font-semibold px-2 py-0.5"
                        >
                          {group.versions.length}
                        </Badge>
                      </div>

                      {/* Version Cards */}
                      <div className="space-y-3">
                        {group.versions.map((version, idx) => {
                          // Get previous version for diff stats
                          // Versions are ordered newest first, so previous is the next one in array
                          const prevVersion =
                            idx < group.versions.length - 1
                              ? group.versions[idx + 1]
                              : null;

                          return (
                            <EnhancedVersionCard
                              key={version.id}
                              version={version}
                              previousVersion={prevVersion}
                              fileType={fileType}
                              isSelected={
                                previewVersion === version.version_number ||
                                selectedVersions?.includes(
                                  version.version_number,
                                )
                              }
                              isPreview={
                                previewVersion === version.version_number
                              }
                              userAvatar={userMetadata?.avatarUrl || null}
                              userName={userMetadata?.fullName || "Usuario"}
                              onSelect={() => {
                                if (
                                  selectedVersions?.[0] ===
                                  version.version_number
                                ) {
                                  clearComparison();
                                } else if (selectedVersions?.[0]) {
                                  selectVersionsForComparison(
                                    selectedVersions[0],
                                    version.version_number,
                                  );
                                } else {
                                  selectVersionForPreview(
                                    version.version_number,
                                  );
                                }
                              }}
                              onRestore={() =>
                                handleRestore(version.version_number)
                              }
                              onPreview={() =>
                                selectVersionForPreview(version.version_number)
                              }
                              getChangeTypeLabel={getChangeTypeLabel}
                              getChangeTypeIcon={getChangeTypeIcon}
                              formatSize={formatSize}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {totalVersions === 0 && (
                    <div className="text-center py-16">
                      <div className="p-4 bg-muted/50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                        <IconHistory
                          size={40}
                          className="opacity-30 text-muted-foreground"
                        />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">
                        No hay versiones aún
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        Las versiones se crearán automáticamente al guardar
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Comparison View - Enhanced */}
              {viewMode === "compare" && comparisonData && (
                <div className="border-t bg-muted/20 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm">
                          Comparando Versiones
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          {comparisonData.versionA?.version_number} →{" "}
                          {comparisonData.versionB?.version_number}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Revisa los cambios entre estas dos versiones
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {fileType !== "note" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setHighlightEnabled(!highlightEnabled);
                            if (highlightEnabled) {
                              clearAll();
                            } else if (
                              comparisonData.versionA &&
                              comparisonData.versionB
                            ) {
                              try {
                                const diff = diffWorkbooks(
                                  comparisonData.versionA.univer_data as any,
                                  comparisonData.versionB.univer_data as any,
                                );
                                highlightDiff(diff, { fadeAfter: 0 });
                              } catch (err) {
                                console.error(
                                  "[FileVersionHistoryPanel] Error highlighting:",
                                  err,
                                );
                                toast.error("Error al resaltar cambios");
                              }
                            }
                          }}
                          className="gap-1.5"
                        >
                          <IconHighlight size={14} />
                          {highlightEnabled ? "Ocultar" : "Resaltar"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          clearComparison();
                          setViewMode("list");
                        }}
                      >
                        Cerrar
                      </Button>
                    </div>
                  </div>
                  {comparisonData.diff && fileType !== "note" ? (
                    <div className="max-h-80 overflow-y-auto rounded-lg border bg-background p-4">
                      <FileVersionDiff
                        versionA={comparisonData.versionA}
                        versionB={comparisonData.versionB}
                        fileType={fileType}
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-background p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <IconInfoCircle size={16} />
                        <span>
                          Comparación disponible solo para archivos Excel y
                          Docs.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Commit Dialog - Enhanced */}
        {showCommitDialog && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-background border-2 rounded-xl p-6 w-full max-w-md shadow-xl">
              <h3 className="font-bold text-lg mb-2">Crear Commit</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Agrupa estas versiones con un mensaje descriptivo
              </p>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Ej: 'Agregué nuevas fórmulas y formato de celdas'"
                className="w-full p-3 border rounded-lg mb-4 min-h-[100px] resize-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowCommitDialog(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateCommit}
                  disabled={
                    !commitMessage.trim() || createCommitMutation.isPending
                  }
                >
                  {createCommitMutation.isPending
                    ? "Creando..."
                    : "Crear Commit"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Enhanced Version Card Component
interface EnhancedVersionCardProps {
  version: any;
  previousVersion: any | null; // Previous version for diff stats
  fileType: "excel" | "doc" | "note";
  isSelected: boolean;
  isPreview: boolean;
  userAvatar: string | null;
  userName: string;
  onSelect: () => void;
  onRestore: () => void;
  onPreview: () => void;
  getChangeTypeLabel: (type: string) => string;
  getChangeTypeIcon: (type: string) => string;
  formatSize: (bytes?: number) => string;
}

function EnhancedVersionCard({
  version,
  previousVersion,
  fileType,
  isSelected,
  isPreview,
  userAvatar,
  userName,
  onSelect,
  onRestore,
  onPreview,
  getChangeTypeLabel,
  getChangeTypeIcon,
  formatSize,
}: EnhancedVersionCardProps) {
  const isAIGenerated = version.ai_model || version.tool_name;

  // Calculate diff stats if we have previous version and it's Excel/Doc
  const diffStats = React.useMemo(() => {
    if (!previousVersion || fileType === "note") return null;
    if (!version.univer_data || !previousVersion.univer_data) return null;

    try {
      return calculateDiffStats(
        previousVersion.univer_data,
        version.univer_data,
      );
    } catch (err) {
      console.warn(
        "[EnhancedVersionCard] Failed to calculate diff stats:",
        err,
      );
      return null;
    }
  }, [previousVersion, version, fileType]);

  // Get status color based on change type
  const getStatusColor = (changeType: string) => {
    switch (changeType) {
      case "auto_save":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      case "manual_save":
        return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
      case "ai_edit":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
      case "restore":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const statusColor = getStatusColor(version.change_type);
  const userInitials =
    userName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return (
    <div
      className={cn(
        "group relative rounded-xl border-2 transition-all cursor-pointer",
        "hover:shadow-md hover:border-primary/30",
        isSelected
          ? "bg-primary/5 border-primary/50 shadow-lg"
          : "bg-card border-border/50 hover:bg-muted/30",
      )}
      onClick={onSelect}
    >
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Enhanced Avatar with User Image */}
          <div className="relative shrink-0">
            <Avatar className="h-12 w-12 ring-2 ring-background shadow-sm">
              {userAvatar && !isAIGenerated ? (
                <AvatarImage src={userAvatar} alt={userName} />
              ) : null}
              <AvatarFallback
                className={cn(
                  "text-sm font-semibold",
                  isAIGenerated
                    ? "bg-purple-500/20 text-purple-600 dark:text-purple-400"
                    : "bg-primary/10 text-primary",
                )}
              >
                {isAIGenerated ? (
                  <IconRobot size={20} />
                ) : (
                  userInitials || <IconUser size={20} />
                )}
              </AvatarFallback>
            </Avatar>
            {/* Status indicator */}
            <div
              className={cn(
                "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center",
                statusColor,
              )}
            >
              {version.change_type === "manual_save" ? (
                <IconCheck size={10} />
              ) : version.change_type === "ai_edit" ? (
                <IconRobot size={10} />
              ) : (
                <IconInfoCircle size={10} />
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header Row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="text-xs font-bold font-mono px-2 py-0.5"
                >
                  v{version.version_number}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("text-xs px-2 py-0.5", statusColor)}
                >
                  <span className="mr-1">
                    {getChangeTypeIcon(version.change_type)}
                  </span>
                  {getChangeTypeLabel(version.change_type)}
                </Badge>
                {isPreview && (
                  <Badge variant="secondary" className="text-xs">
                    Vista previa
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview();
                  }}
                >
                  <IconEye size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore();
                  }}
                >
                  <IconRestore size={16} />
                </Button>
              </div>
            </div>

            {/* Description */}
            {version.change_description && (
              <p className="text-sm font-medium text-foreground leading-snug">
                {version.change_description}
              </p>
            )}

            {/* Diff Stats - Compact and Minimalist */}
            {diffStats && diffStats.totalChanges > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {diffStats.cellsAdded > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-medium">
                    <span>+{diffStats.cellsAdded}</span>
                  </div>
                )}
                {diffStats.cellsModified > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-medium">
                    <span>~{diffStats.cellsModified}</span>
                  </div>
                )}
                {diffStats.cellsDeleted > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-medium">
                    <span>-{diffStats.cellsDeleted}</span>
                  </div>
                )}
                {(diffStats.sheetsAdded > 0 || diffStats.sheetsDeleted > 0) && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-medium">
                    <span>
                      {diffStats.sheetsAdded > 0 &&
                        `+${diffStats.sheetsAdded} hoja${diffStats.sheetsAdded !== 1 ? "s" : ""}`}
                      {diffStats.sheetsAdded > 0 &&
                        diffStats.sheetsDeleted > 0 &&
                        ", "}
                      {diffStats.sheetsDeleted > 0 &&
                        `-${diffStats.sheetsDeleted} hoja${diffStats.sheetsDeleted !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Metadata Row */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <div className="flex items-center gap-1.5">
                <IconClock size={12} className="shrink-0" />
                <span className="font-medium">
                  {formatTimeAgo(version.created_at, { includeDate: true })}
                </span>
              </div>
              {version.size_bytes && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{formatSize(version.size_bytes)}</span>
                </>
              )}
              {version.commit_message && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <div className="flex items-center gap-1">
                    <IconGitCommit size={12} />
                    <span className="truncate max-w-[150px] font-medium">
                      {version.commit_message}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* AI Metadata */}
            {version.tool_name && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  <IconRobot size={12} className="mr-1" />
                  {version.tool_name}
                </Badge>
                {version.ai_model && (
                  <span className="text-muted-foreground/70">
                    {version.ai_model}
                  </span>
                )}
              </div>
            )}

            {/* Full date on hover */}
            <div className="mt-1 text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {formatFullDateTime(version.created_at)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
