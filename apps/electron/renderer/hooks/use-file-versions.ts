/**
 * Hook for managing file version history
 * Provides version listing, preview, restore, and comparison
 */
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  versionHistoryOpenAtom,
  versionHistoryFileIdAtom,
  versionHistoryPreviewVersionAtom,
  versionPreviewDataAtom,
  versionPreviewLoadingAtom,
  fileSnapshotCacheAtom,
  currentExcelFileAtom,
  currentDocFileAtom,
  type FileVersion,
  type UserFile,
} from "@/lib/atoms/user-files";

export interface VersionStats {
  totalVersions: number;
  totalEdits: number;
  byType: Record<string, number>;
}

interface UseFileVersionsOptions {
  includeObsolete?: boolean;
}

export function useFileVersions(fileId: string | null, options: UseFileVersionsOptions = {}) {
  const { includeObsolete = false } = options;

  const [isOpen, setIsOpen] = useAtom(versionHistoryOpenAtom);
  const [historyFileId, setHistoryFileId] = useAtom(versionHistoryFileIdAtom);
  const [previewVersion, setPreviewVersion] = useAtom(
    versionHistoryPreviewVersionAtom,
  );
  const [, setVersionPreviewData] = useAtom(versionPreviewDataAtom);
  const [, setVersionPreviewLoading] = useAtom(versionPreviewLoadingAtom);

  // CRITICAL: Cache and file atoms for proper restore handling
  const [, setSnapshotCache] = useAtom(fileSnapshotCacheAtom);
  const setCurrentExcelFile = useSetAtom(currentExcelFileAtom);
  const setCurrentDocFile = useSetAtom(currentDocFileAtom);

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
    { fileId: fileId!, includeObsolete },
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

  // ==================== SYNC PREVIEW DATA TO ATOM ====================
  // CRITICAL FIX: Use refs to track expected query parameters
  // This prevents race conditions where stale responses are synced with new fileId
  const expectedFileIdRef = useRef<string | null>(fileId);
  const expectedVersionRef = useRef<number | null>(previewVersion);

  // Update expected refs when params change
  useEffect(() => {
    expectedFileIdRef.current = fileId;
  }, [fileId]);

  useEffect(() => {
    expectedVersionRef.current = previewVersion;
  }, [previewVersion]);

  // Update loading state
  useEffect(() => {
    setVersionPreviewLoading(isLoadingPreview);
  }, [isLoadingPreview, setVersionPreviewLoading]);

  // CRITICAL: Clear preview data FIRST when fileId changes (switching files)
  // This must run before the sync effect to prevent race conditions
  useEffect(() => {
    console.log("[useFileVersions] FileId changed to:", fileId, "- clearing preview state");
    // Clear both atoms immediately
    setPreviewVersion(null);
    setVersionPreviewData(null);
  }, [fileId, setPreviewVersion, setVersionPreviewData]);

  // Sync preview data to atom with STRICT validation
  useEffect(() => {
    // Case 1: No preview version selected - clear data
    if (previewVersion === null) {
      console.log("[useFileVersions] No preview version selected - clearing data");
      setVersionPreviewData(null);
      return;
    }

    // Case 2: No data yet - wait for query
    if (!previewVersionData) {
      return;
    }

    // Case 3: CRITICAL VALIDATION - Verify query response matches expected parameters
    // This prevents stale responses from being synced when file/version changed
    const isResponseForCurrentFile = previewVersionData.file_id === fileId;
    const isResponseForCurrentVersion = previewVersionData.version_number === previewVersion;
    const isExpectedQuery =
      fileId === expectedFileIdRef.current &&
      previewVersion === expectedVersionRef.current;

    if (!isResponseForCurrentFile) {
      console.warn(
        "[useFileVersions] DISCARDING stale response - fileId mismatch:",
        "response file_id:", previewVersionData.file_id,
        "current fileId:", fileId
      );
      return;
    }

    if (!isResponseForCurrentVersion) {
      console.warn(
        "[useFileVersions] DISCARDING stale response - version mismatch:",
        "response version:", previewVersionData.version_number,
        "current previewVersion:", previewVersion
      );
      return;
    }

    if (!isExpectedQuery) {
      console.warn(
        "[useFileVersions] DISCARDING response - query params changed since request"
      );
      return;
    }

    // All validations passed - safe to sync
    console.log(
      "[useFileVersions] Syncing validated preview data:",
      "file:", fileId,
      "version:", previewVersionData.version_number
    );

    setVersionPreviewData({
      fileId: fileId,
      versionNumber: previewVersionData.version_number,
      univerData: previewVersionData.univer_data,
      content: previewVersionData.content,
      changeType: previewVersionData.change_type,
      changeDescription: previewVersionData.change_description,
    });
  }, [previewVersionData, previewVersion, fileId, setVersionPreviewData]);

  // ==================== MUTATIONS ====================

  const restoreMutation = trpc.userFiles.restoreVersion.useMutation({
    onSuccess: (updatedFile) => {
      if (fileId && updatedFile) {
        // CRITICAL FIX: Clear the snapshot cache for this file FIRST
        // This prevents the old cached data from overriding the restored data
        console.log("[useFileVersions] Restore success - clearing cache for:", fileId);
        setSnapshotCache((prev) => {
          const { [fileId]: _removed, ...rest } = prev;
          return rest;
        });

        // CRITICAL FIX: Immediately update the file atom with restored data
        // This ensures the spreadsheet shows the correct data without waiting for refetch
        const restoredFile = updatedFile as UserFile;
        if (restoredFile.type === "excel") {
          console.log("[useFileVersions] Updating Excel file atom with restored data");
          setCurrentExcelFile(restoredFile);
        } else if (restoredFile.type === "doc") {
          console.log("[useFileVersions] Updating Doc file atom with restored data");
          setCurrentDocFile(restoredFile);
        }

        // Invalidate queries to ensure consistency (refetch will confirm our optimistic update)
        utils.userFiles.get.invalidate({ id: fileId });
        utils.userFiles.listVersions.invalidate({ fileId });
        utils.userFiles.getVersionStats.invalidate({ fileId });

        // Also invalidate list queries for the file type to update version counts in sidebar
        if (restoredFile.type) {
          utils.userFiles.list.invalidate({ type: restoredFile.type });
        }
      }
      // Clear preview and preview data
      setPreviewVersion(null);
      setVersionPreviewData(null);
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
