/**
 * File Version History Panel - Sheet/Inset Style
 *
 * Panel de historial de versiones estilo Sheet/Inset que se muestra
 * como un panel lateral deslizable o overlay
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
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { diffWorkbooks } from "@/utils/univer-diff";
import {
  formatTimeAgo,
  formatFullDateTime,
  formatDateWithTime,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
    groupVersionsByDate,
  } = useFileVersions(fileId);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[540px] p-0 flex flex-col [&>button]:hidden">
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <IconHistory size={20} className="text-primary" />
              </div>
              <div>
                <SheetTitle>Historial de Versiones</SheetTitle>
                <SheetDescription>
                  {versions?.length || 0} versión
                  {(versions?.length || 0) !== 1 ? "es" : ""}
                </SheetDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileExportButton
                fileId={fileId}
                fileType={fileType}
                variant="ghost"
                size="sm"
              />
              <Button
                variant="ghost"
                size="icon"
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
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Cargando historial...
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Version List */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                  {versionGroups.map((group, groupIdx) => (
                    <div key={groupIdx}>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {group.date}
                        </h3>
                        <Separator className="flex-1" />
                        <Badge variant="secondary" className="text-xs">
                          {group.versions.length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {group.versions.map((version) => (
                          <VersionCard
                            key={version.id}
                            version={version}
                            isSelected={
                              previewVersion === version.version_number ||
                              selectedVersions?.includes(version.version_number)
                            }
                            isPreview={
                              previewVersion === version.version_number
                            }
                            onSelect={() => {
                              if (
                                selectedVersions?.[0] === version.version_number
                              ) {
                                clearComparison();
                              } else if (selectedVersions?.[0]) {
                                selectVersionsForComparison(
                                  selectedVersions[0],
                                  version.version_number,
                                );
                              } else {
                                selectVersionForPreview(version.version_number);
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
                        ))}
                      </div>
                    </div>
                  ))}

                  {versions.length === 0 && (
                    <div className="text-center py-12">
                      <IconHistory
                        size={48}
                        className="mx-auto mb-4 opacity-30 text-muted-foreground"
                      />
                      <p className="text-sm text-muted-foreground">
                        No hay versiones aún
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Comparison View */}
              {viewMode === "compare" && comparisonData && (
                <div className="border-t p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-semibold text-sm">
                        Comparando Versiones
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {comparisonData.versionA?.version_number} →{" "}
                        {comparisonData.versionB?.version_number}
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
                        >
                          <IconHighlight size={14} className="mr-1" />
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
                    <div className="max-h-64 overflow-y-auto">
                      <FileVersionDiff
                        versionA={comparisonData.versionA}
                        versionB={comparisonData.versionB}
                        fileType={fileType}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Comparación disponible solo para archivos Excel y Docs.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Commit Dialog */}
        {showCommitDialog && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-background border rounded-lg p-6 w-full max-w-md mx-4">
              <h3 className="font-semibold mb-4">Crear Commit</h3>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Mensaje del commit (ej: 'Agregué nuevas fórmulas y formato')"
                className="w-full p-2 border rounded mb-4 min-h-[100px]"
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
                  Crear Commit
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Version Card Component
interface VersionCardProps {
  version: any;
  isSelected: boolean;
  isPreview: boolean;
  onSelect: () => void;
  onRestore: () => void;
  onPreview: () => void;
  getChangeTypeLabel: (type: string) => string;
  getChangeTypeIcon: (type: string) => string;
  formatSize: (bytes?: number) => string;
}

function VersionCard({
  version,
  isSelected,
  isPreview,
  onSelect,
  onRestore,
  onPreview,
  getChangeTypeLabel,
  getChangeTypeIcon,
  formatSize,
}: VersionCardProps) {
  const isAIGenerated = version.ai_model || version.tool_name;

  return (
    <div
      className={cn(
        "group relative p-3 rounded-lg border transition-all cursor-pointer",
        isSelected
          ? "bg-primary/10 border-primary/50 shadow-sm"
          : "bg-background border-border hover:bg-muted/50 hover:border-border",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* Avatar/Icon */}
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {isAIGenerated ? <IconRobot size={14} /> : <IconUser size={14} />}
          </AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs font-mono">
              v{version.version_number}
            </Badge>
            <span className="text-xs">
              {getChangeTypeIcon(version.change_type)}
            </span>
            <span className="text-xs text-muted-foreground">
              {getChangeTypeLabel(version.change_type)}
            </span>
            {isPreview && (
              <Badge variant="secondary" className="text-xs">
                Vista previa
              </Badge>
            )}
          </div>

          {version.change_description && (
            <p className="text-sm font-medium mb-1 truncate">
              {version.change_description}
            </p>
          )}

          {version.tool_name && (
            <p className="text-xs text-muted-foreground mb-1">
              Tool: <span className="font-mono">{version.tool_name}</span>
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <IconClock size={12} />
              <span>
                {formatTimeAgo(version.created_at, { includeDate: true })}
              </span>
            </div>
            <span>·</span>
            <span>{formatSize(version.size_bytes)}</span>
            {version.commit_message && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <IconGitCommit size={12} />
                  <span className="truncate max-w-[120px]">
                    {version.commit_message}
                  </span>
                </span>
              </>
            )}
          </div>

          {/* Full date on hover */}
          <div className="mt-1 text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {formatFullDateTime(version.created_at)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
          >
            <IconEye size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
          >
            <IconRestore size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
