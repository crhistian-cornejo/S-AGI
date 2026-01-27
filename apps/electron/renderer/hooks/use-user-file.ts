/**
 * Hook for managing user files (Excel, Docs, Notes) with version history
 * Provides CRUD operations, auto-save, and version tracking
 */
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  getFileIdAtom,
  getFileAtom,
  fileSnapshotCacheAtom,
  fileSavingAtom,
  type UserFile,
  type UserFileType,
} from "@/lib/atoms/user-files";

const AUTO_SAVE_DELAY = 3000; // 3 seconds

export type ChangeType =
  | "created"
  | "auto_save"
  | "manual_save"
  | "ai_edit"
  | "ai_create"
  | "restore"
  | "import";

export interface SaveOptions {
  changeType?: ChangeType;
  changeDescription?: string;
  aiModel?: string;
  aiPrompt?: string;
  toolName?: string;
  skipVersion?: boolean;
}

export function useUserFile(type: UserFileType) {
  const [currentFileId, setCurrentFileId] = useAtom(getFileIdAtom(type));
  const [currentFile, setCurrentFile] = useAtom(getFileAtom(type));
  const [snapshotCache, setSnapshotCache] = useAtom(fileSnapshotCacheAtom);
  const [savingState, setSavingState] = useAtom(fileSavingAtom);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utils = trpc.useUtils();

  // ==================== QUERIES ====================

  // List files of this type
  const {
    data: filesList,
    isLoading: isLoadingList,
    refetch: refetchList,
  } = trpc.userFiles.list.useQuery(
    { type, includeArchived: false },
    { staleTime: 30000 },
  );

  // Get current file data
  const {
    data: fetchedFile,
    isLoading: isLoadingFile,
    refetch: refetchFile,
  } = trpc.userFiles.get.useQuery(
    { id: currentFileId! },
    {
      enabled: !!currentFileId,
      staleTime: 10000,
    },
  );

  // Get last opened file (for initial load)
  const { data: lastOpenedFile } = trpc.userFiles.getLastOpened.useQuery(
    { type },
    {
      enabled: !currentFileId, // Only query if no file is currently selected
      staleTime: 60000,
    },
  );

  // ==================== SYNC FILE DATA ====================

  // Sync fetched file data with atom
  useEffect(() => {
    if (fetchedFile && fetchedFile.id === currentFileId) {
      setCurrentFile(fetchedFile);
    }
  }, [fetchedFile, currentFileId, setCurrentFile]);

  // Auto-select last opened file if none selected
  useEffect(() => {
    if (!currentFileId && lastOpenedFile) {
      setCurrentFileId(lastOpenedFile.id);
      setCurrentFile(lastOpenedFile);
    }
  }, [currentFileId, lastOpenedFile, setCurrentFileId, setCurrentFile]);

  // ==================== MUTATIONS ====================

  const createMutation = trpc.userFiles.create.useMutation({
    onSuccess: (newFile) => {
      setCurrentFileId(newFile.id);
      setCurrentFile(newFile);
      utils.userFiles.list.invalidate({ type });
    },
  });

  const updateMutation = trpc.userFiles.update.useMutation({
    onSuccess: (updatedFile) => {
      setCurrentFile(updatedFile);
      // Clear snapshot cache for this file
      setSnapshotCache((prev) => {
        const next = { ...prev };
        delete next[updatedFile.id];
        return next;
      });
      // Mark as not saving
      setSavingState((prev) => ({ ...prev, [updatedFile.id]: false }));

      // Invalidate queries to refresh version counts globally
      // This ensures sidebar, header, and all components show updated version counts
      utils.userFiles.list.invalidate({ type });
      utils.userFiles.get.invalidate({ id: updatedFile.id });
      // Also invalidate versions list to update the history panel
      utils.userFiles.listVersions.invalidate({ fileId: updatedFile.id });
    },
    onError: (error) => {
      console.error("[useUserFile] Error saving file:", error);
      // Mark as not saving on error too
      if (currentFile) {
        setSavingState((prev) => ({ ...prev, [currentFile.id]: false }));
      }
    },
  });

  const deleteMutation = trpc.userFiles.delete.useMutation({
    onSuccess: () => {
      // If deleted file was the current one, clear selection
      if (currentFile) {
        setCurrentFileId(null);
        setCurrentFile(null);
      }
      utils.userFiles.list.invalidate({ type });
    },
  });

  const markOpenedMutation = trpc.userFiles.markOpened.useMutation();

  const togglePinMutation = trpc.userFiles.togglePin.useMutation({
    onSuccess: (updatedFile) => {
      if (currentFile?.id === updatedFile.id) {
        setCurrentFile(updatedFile);
      }
      utils.userFiles.list.invalidate({ type });
    },
  });

  const toggleArchiveMutation = trpc.userFiles.toggleArchive.useMutation({
    onSuccess: (updatedFile) => {
      if (currentFile?.id === updatedFile.id) {
        setCurrentFile(updatedFile);
      }
      utils.userFiles.list.invalidate({ type });
    },
  });

  const renameMutation = trpc.userFiles.rename.useMutation({
    onSuccess: (updatedFile) => {
      if (currentFile?.id === updatedFile.id) {
        setCurrentFile(updatedFile);
      }
      utils.userFiles.list.invalidate({ type });
    },
  });

  // ==================== ACTIONS ====================

  // Open a file by ID
  const openFile = useCallback(
    async (fileId: string) => {
      // Clear any pending auto-save for previous file
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      setCurrentFileId(fileId);

      // Mark as opened for recency tracking
      try {
        await markOpenedMutation.mutateAsync({ id: fileId });
      } catch (error) {
        console.error("[useUserFile] Error marking file as opened:", error);
      }

      // Invalidate to get fresh data
      await utils.userFiles.get.invalidate({ id: fileId });
    },
    [setCurrentFileId, markOpenedMutation, utils],
  );

  // Create a new file
  const createFile = useCallback(
    async (
      name: string,
      initialData?: unknown,
      options?: { aiModel?: string; aiPrompt?: string; description?: string },
    ) => {
      return createMutation.mutateAsync({
        type,
        name,
        univerData:
          type === "excel" || type === "doc" ? initialData : undefined,
        content: type === "note" ? (initialData as string) : undefined,
        description: options?.description,
        aiModel: options?.aiModel,
        aiPrompt: options?.aiPrompt,
      });
    },
    [type, createMutation],
  );

  // Save file changes (creates new version)
  const saveFile = useCallback(
    async (
      updates: {
        univerData?: unknown;
        content?: string;
        name?: string;
      },
      options?: SaveOptions & {
        commitId?: string;
        commitMessage?: string;
        commitParentId?: string;
      },
    ) => {
      if (!currentFile) {
        console.warn("[useUserFile] No file to save");
        return null;
      }

      // Mark as saving
      setSavingState((prev) => ({ ...prev, [currentFile.id]: true }));

      try {
        const result = await updateMutation.mutateAsync({
          id: currentFile.id,
          ...updates,
          changeType: options?.changeType || "auto_save",
          changeDescription: options?.changeDescription,
          aiModel: options?.aiModel,
          aiPrompt: options?.aiPrompt,
          toolName: options?.toolName,
          skipVersion: options?.skipVersion,
          commitOptions:
            options?.commitId ||
            options?.commitMessage ||
            options?.commitParentId
              ? {
                  commitId: options?.commitId,
                  commitMessage: options?.commitMessage,
                  commitParentId: options?.commitParentId,
                }
              : undefined,
        });
        return result;
      } catch (error) {
        throw error;
      }
    },
    [currentFile, updateMutation, setSavingState],
  );

  // Auto-save with debounce
  const scheduleAutoSave = useCallback(
    (data: { univerData?: unknown; content?: string }) => {
      if (!currentFile) return;

      // Clear previous timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Mark as dirty
      setSnapshotCache((prev) => ({
        ...prev,
        [currentFile.id]: {
          ...data,
          timestamp: Date.now(),
          isDirty: true,
        },
      }));

      // Schedule save
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveFile(data, { changeType: "auto_save" });
        } catch (error) {
          console.error("[useUserFile] Auto-save error:", error);
        }
      }, AUTO_SAVE_DELAY);
    },
    [currentFile, setSnapshotCache, saveFile],
  );

  // Mark as dirty without auto-save (for tracking changes)
  const markDirty = useCallback(
    (data: { univerData?: unknown; content?: string }) => {
      if (!currentFile) return;

      setSnapshotCache((prev) => ({
        ...prev,
        [currentFile.id]: {
          ...data,
          timestamp: Date.now(),
          isDirty: true,
        },
      }));
    },
    [currentFile, setSnapshotCache],
  );

  // Close current file
  const closeFile = useCallback(() => {
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setCurrentFileId(null);
    setCurrentFile(null);
  }, [setCurrentFileId, setCurrentFile]);

  // Delete a file
  const deleteFile = useCallback(
    async (fileId: string) => {
      return deleteMutation.mutateAsync({ id: fileId });
    },
    [deleteMutation],
  );

  // Toggle pin status
  const togglePin = useCallback(
    async (fileId: string) => {
      return togglePinMutation.mutateAsync({ id: fileId });
    },
    [togglePinMutation],
  );

  // Toggle archive status
  const toggleArchive = useCallback(
    async (fileId: string) => {
      return toggleArchiveMutation.mutateAsync({ id: fileId });
    },
    [toggleArchiveMutation],
  );

  // Rename file
  const renameFile = useCallback(
    async (fileId: string, name: string) => {
      return renameMutation.mutateAsync({ id: fileId, name });
    },
    [renameMutation],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // ==================== COMPUTED STATE ====================

  const snapshot = currentFile ? snapshotCache[currentFile.id] : null;
  const isSaving = currentFile ? savingState[currentFile.id] || false : false;
  const isDirty = snapshot?.isDirty || false;

  return {
    // State
    currentFile,
    currentFileId,
    filesList: filesList || [],
    snapshot,
    isLoading: isLoadingFile,
    isLoadingList,
    isSaving,
    isDirty,

    // Actions
    openFile,
    createFile,
    saveFile,
    scheduleAutoSave,
    markDirty,
    closeFile,
    deleteFile,
    togglePin,
    toggleArchive,
    renameFile,

    // Mutations (for loading states)
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isRenaming: renameMutation.isPending,

    // Utilities
    refresh: () => {
      utils.userFiles.list.invalidate({ type });
      if (currentFileId) {
        utils.userFiles.get.invalidate({ id: currentFileId });
      }
    },
  };
}
