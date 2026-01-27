/**
 * File Version History Panel
 *
 * Panel completo para ver historial de versiones con diff visual
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
  IconChevronRight,
  IconHighlight,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { diffWorkbooks } from "@/utils/univer-diff";

interface FileVersionHistoryProps {
  fileId: string;
  fileType: "excel" | "doc" | "note";
  onClose: () => void;
}

export function FileVersionHistory({
  fileId,
  fileType,
  onClose,
}: FileVersionHistoryProps) {
  const {
    versions,
    isOpen,
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

  const versionGroups = React.useMemo(() => {
    return groupVersionsByDate(versions);
  }, [versions, groupVersionsByDate]);

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
      onClose();
    } catch (error) {
      toast.error("Error al restaurar versión");
    }
  };

  const handleCreateCommit = () => {
    if (!commitMessage.trim()) {
      toast.error("El mensaje del commit no puede estar vacío");
      return;
    }

    // Get selected versions or latest version
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
      fileId,
      message: commitMessage,
      versionNumbers: versionNumbers.length > 1 ? versionNumbers : undefined,
    });
  };

  if (isLoadingVersions) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Cargando historial...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <IconHistory size={20} />
          <h2 className="font-semibold">Historial de Versiones</h2>
        </div>
        <div className="flex items-center gap-2">
          <FileExportButton
            fileId={fileId}
            fileName={versions[0]?.change_description || "archivo"}
            fileType={fileType}
            variant="ghost"
            size="sm"
          />
          {fileType !== "note" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setHighlightEnabled(!highlightEnabled);
                if (highlightEnabled) {
                  clearAll();
                } else if (
                  comparisonData?.versionA &&
                  comparisonData?.versionB
                ) {
                  // Highlight changes when comparing
                  try {
                    const diff = diffWorkbooks(
                      comparisonData.versionA.univer_data as any,
                      comparisonData.versionB.univer_data as any,
                    );
                    highlightDiff(diff, { fadeAfter: 0 }); // No auto-fade
                  } catch (err) {
                    console.error(
                      "[FileVersionHistory] Error highlighting:",
                      err,
                    );
                    toast.error("Error al resaltar cambios");
                  }
                }
              }}
              disabled={
                !comparisonData || viewMode !== "compare" || fileType === "note"
              }
            >
              <IconHighlight size={16} className="mr-1" />
              {highlightEnabled ? "Ocultar" : "Resaltar"} cambios
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCommitDialog(true)}
            disabled={versions.length === 0}
          >
            <IconGitCommit size={16} className="mr-1" />
            Crear Commit
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <IconX size={16} />
          </Button>
        </div>
      </div>

      {/* Commit Dialog */}
      {showCommitDialog && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-background border rounded-lg p-6 w-full max-w-md">
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

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar - Version List */}
        <div className="w-80 border-r overflow-y-auto">
          <div className="p-4 space-y-4">
            {versionGroups.map((group, groupIdx) => (
              <div key={groupIdx}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  {group.date}
                </h3>
                <div className="space-y-1">
                  {group.versions.map((version) => (
                    <div
                      key={version.id}
                      className={cn(
                        "p-3 rounded-lg cursor-pointer transition-colors",
                        previewVersion === version.version_number && "bg-muted",
                        selectedVersions?.includes(version.version_number) &&
                          "bg-primary/10",
                      )}
                      onClick={() => {
                        if (selectedVersions?.[0] === version.version_number) {
                          // Already selected, clear
                          clearComparison();
                        } else if (selectedVersions?.[0]) {
                          // Select as second version
                          selectVersionsForComparison(
                            selectedVersions[0],
                            version.version_number,
                          );
                        } else {
                          // Select as first version or preview
                          selectVersionForPreview(version.version_number);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-muted-foreground">
                              v{version.version_number}
                            </span>
                            <span className="text-xs">
                              {getChangeTypeIcon(version.change_type)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {getChangeTypeLabel(version.change_type)}
                            </span>
                          </div>
                          {version.change_description && (
                            <p className="text-sm truncate">
                              {version.change_description}
                            </p>
                          )}
                          {version.tool_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Tool: {version.tool_name}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(version.created_at).toLocaleTimeString()}
                            {" · "}
                            {formatSize(version.size_bytes)}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectVersionForPreview(version.version_number);
                            }}
                          >
                            <IconEye size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestore(version.version_number);
                            }}
                            disabled={isRestoring}
                          >
                            <IconRestore size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {viewMode === "list" && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <IconHistory size={48} className="mx-auto mb-4 opacity-50" />
                <p>Selecciona una versión para ver detalles</p>
                <p className="text-sm mt-2">
                  O selecciona dos versiones para comparar
                </p>
              </div>
            </div>
          )}

          {viewMode === "preview" && previewVersionData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  Vista Previa - Versión {previewVersionData.version_number}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  Volver
                </Button>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">
                  <strong>Tipo:</strong>{" "}
                  {getChangeTypeLabel(previewVersionData.change_type)}
                </p>
                <p className="text-sm mt-2">
                  <strong>Descripción:</strong>{" "}
                  {previewVersionData.change_description || "Sin descripción"}
                </p>
                {previewVersionData.tool_name && (
                  <p className="text-sm mt-2">
                    <strong>Tool:</strong> {previewVersionData.tool_name}
                  </p>
                )}
                <p className="text-sm mt-2">
                  <strong>Fecha:</strong>{" "}
                  {new Date(previewVersionData.created_at).toLocaleString()}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>
                  Nota: Para ver el contenido completo, restaura esta versión.
                </p>
              </div>
            </div>
          )}

          {viewMode === "compare" && comparisonData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  Comparar Versiones {comparisonData.versionA?.version_number} y{" "}
                  {comparisonData.versionB?.version_number}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearComparison();
                    setViewMode("list");
                  }}
                >
                  Volver
                </Button>
              </div>

              {comparisonData.diff && fileType !== "note" ? (
                <FileVersionDiff
                  versionA={comparisonData.versionA}
                  versionB={comparisonData.versionB}
                  fileType={fileType}
                />
              ) : (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Comparación disponible solo para archivos Excel y Docs.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
