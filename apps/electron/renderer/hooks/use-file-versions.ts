/**
 * Hook for managing file version history
 * Provides version listing, preview, restore, and comparison
 */
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  versionHistoryOpenAtom,
  versionHistoryFileIdAtom,
  versionHistoryPreviewVersionAtom,
  type FileVersion,
} from "@/lib/atoms/user-files";

export interface VersionStats {
  totalVersions: number;
  totalEdits: number;
  byType: Record<string, number>;
}

export function useFileVersions(fileId: string | null) {
  const [isOpen, setIsOpen] = useAtom(versionHistoryOpenAtom);
  const [historyFileId, setHistoryFileId] = useAtom(versionHistoryFileIdAtom);
  const [previewVersion, setPreviewVersion] = useAtom(
    versionHistoryPreviewVersionAtom,
  );

  const [selectedVersions, setSelectedVersions] = useState<
    [number, number] | null
  >(null);

  const utils = trpc.useUtils();

  // ==================== QUERIES ====================

  // List versions for the file - enabled when fileId exists (not dependent on isOpen atom)
  const {
    data: versions,
    isLoading: isLoadingVersions,
    refetch: refetchVersions,
  } = trpc.userFiles.listVersions.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId },
  );

  // Get specific version for preview
  const { data: previewVersionData, isLoading: isLoadingPreview } =
    trpc.userFiles.getVersion.useQuery(
      { fileId: fileId!, versionNumber: previewVersion! },
      { enabled: !!fileId && !!previewVersion },
    );

  // Get version stats
  const { data: stats } = trpc.userFiles.getVersionStats.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId && isOpen },
  );

  // Compare two versions
  const { data: comparisonData, isLoading: isLoadingComparison } =
    trpc.userFiles.compareVersions.useQuery(
      {
        fileId: fileId!,
        versionA: selectedVersions?.[0] || 0,
        versionB: selectedVersions?.[1] || 0,
      },
      {
        enabled:
          !!fileId &&
          !!selectedVersions &&
          selectedVersions[0] > 0 &&
          selectedVersions[1] > 0,
      },
    );

  // ==================== MUTATIONS ====================

  const restoreMutation = trpc.userFiles.restoreVersion.useMutation({
    onSuccess: (updatedFile) => {
      // Invalidate file and versions
      if (fileId) {
        // Invalidate all file-related queries to ensure consistency
        utils.userFiles.get.invalidate({ id: fileId });
        utils.userFiles.listVersions.invalidate({ fileId });
        utils.userFiles.getVersionStats.invalidate({ fileId });

        // Also invalidate list queries for the file type to update version counts in sidebar
        if (updatedFile?.type) {
          utils.userFiles.list.invalidate({ type: updatedFile.type });
        }
      }
      // Clear preview
      setPreviewVersion(null);
    },
  });

  // ==================== ACTIONS ====================

  // Open version history panel
  const openHistory = useCallback(
    (fId: string) => {
      setHistoryFileId(fId);
      setIsOpen(true);
      setPreviewVersion(null);
      setSelectedVersions(null);
    },
    [setHistoryFileId, setIsOpen, setPreviewVersion],
  );

  // Close version history panel
  const closeHistory = useCallback(() => {
    setIsOpen(false);
    setHistoryFileId(null);
    setPreviewVersion(null);
    setSelectedVersions(null);
  }, [setIsOpen, setHistoryFileId, setPreviewVersion]);

  // Set preview version (null for current)
  const selectVersionForPreview = useCallback(
    (versionNumber: number | null) => {
      setPreviewVersion(versionNumber);
    },
    [setPreviewVersion],
  );

  // Select two versions for comparison
  const selectVersionsForComparison = useCallback(
    (versionA: number, versionB: number) => {
      setSelectedVersions([versionA, versionB]);
    },
    [],
  );

  // Clear comparison
  const clearComparison = useCallback(() => {
    setSelectedVersions(null);
  }, []);

  // Restore to a specific version
  const restoreVersion = useCallback(
    async (versionNumber: number) => {
      if (!fileId) {
        console.warn("[useFileVersions] No file to restore");
        return null;
      }

      try {
        const result = await restoreMutation.mutateAsync({
          fileId,
          versionNumber,
        });
        return result;
      } catch (error) {
        console.error("[useFileVersions] Error restoring version:", error);
        throw error;
      }
    },
    [fileId, restoreMutation],
  );

  // Get a specific version's data (for manual fetching)
  const fetchVersion = useCallback(
    async (versionNumber: number) => {
      if (!fileId) return null;

      return utils.userFiles.getVersion.fetch({
        fileId,
        versionNumber,
      });
    },
    [fileId, utils],
  );

  // ==================== HELPERS ====================

  // Get version change type label
  const getChangeTypeLabel = useCallback((changeType: string): string => {
    const labels: Record<string, string> = {
      created: "Creado",
      auto_save: "Auto-guardado",
      manual_save: "Guardado manual",
      ai_edit: "Editado por IA",
      ai_create: "Creado por IA",
      restore: "Restaurado",
      import: "Importado",
    };
    return labels[changeType] || changeType;
  }, []);

  // Get version change type icon
  const getChangeTypeIcon = useCallback((changeType: string): string => {
    const icons: Record<string, string> = {
      created: "✨",
      auto_save: "💾",
      manual_save: "📝",
      ai_edit: "🤖",
      ai_create: "🤖",
      restore: "⏪",
      import: "📥",
    };
    return icons[changeType] || "📄";
  }, []);

  // Format version size
  const formatSize = useCallback((bytes: number | undefined): string => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  // Group versions by date
  const groupVersionsByDate = useCallback(
    (versionsList: FileVersion[] | undefined) => {
      if (!versionsList) return [];

      const groups: { date: string; versions: FileVersion[] }[] = [];
      let currentDate = "";

      for (const version of versionsList) {
        const date = new Date(version.created_at).toLocaleDateString("es-ES", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        if (date !== currentDate) {
          currentDate = date;
          groups.push({ date, versions: [] });
        }

        groups[groups.length - 1].versions.push(version);
      }

      return groups;
    },
    [],
  );

  return {
    // State
    versions: versions || [],
    isOpen,
    historyFileId,
    previewVersion,
    previewVersionData,
    stats: stats as VersionStats | undefined,
    selectedVersions,
    comparisonData,

    // Loading states
    isLoadingVersions,
    isLoadingPreview,
    isLoadingComparison,
    isRestoring: restoreMutation.isPending,

    // Actions
    openHistory,
    closeHistory,
    selectVersionForPreview,
    selectVersionsForComparison,
    clearComparison,
    restoreVersion,
    fetchVersion,
    refetchVersions,

    // Helpers
    getChangeTypeLabel,
    getChangeTypeIcon,
    formatSize,
    groupVersionsByDate,
  };
}
