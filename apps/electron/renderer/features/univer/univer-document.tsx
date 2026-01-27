import * as React from "react";
import { useAtom } from "jotai";
import { trpc } from "@/lib/trpc";
import {
  initDocsUniver,
  createDocument,
  disposeDocsUniver,
  getDocsInstanceVersion,
  getDocsInstance,
} from "./univer-docs-core";
import { artifactSnapshotCacheAtom, type ArtifactSnapshot } from "@/lib/atoms";
import {
  fileSnapshotCacheAtom,
  type FileSnapshot,
  fileSavingAtom,
  currentDocFileAtom,
} from "@/lib/atoms/user-files";
import { CommandType, UniverInstanceType } from "@univerjs/core";
import { hasRealChanges } from "@/utils/univer-diff-stats";

interface UniverDocumentProps {
  // Legacy: artifact-based props (for backward compatibility)
  artifactId?: string;
  data?: any;
  // New: file-based props
  fileId?: string;
  fileData?: any;
  // Optional: callback when version is created
  onVersionCreated?: (versionNumber: number) => void;
}

export interface UniverDocumentRef {
  save: () => Promise<void>;
  getContent: () => any;
  markDirty: () => void;
  // New: save with AI metadata for Agent Panel
  saveWithAIMetadata: (options: {
    aiModel: string;
    aiPrompt: string;
    toolName: string;
  }) => Promise<void>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UniverDocument = React.forwardRef<
  UniverDocumentRef,
  UniverDocumentProps
>(({ artifactId, data, fileId, fileData, onVersionCreated }, ref) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const documentRef = React.useRef<any>(null);
  const versionRef = React.useRef<number>(-1);
  const isDirtyRef = React.useRef(false);
  const lastSavedSnapshotRef = React.useRef<any>(null); // Track last saved snapshot to compare
  const cacheUpdateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const commandListenerRef = React.useRef<{ dispose?: () => void } | null>(
    null,
  );
  const triggerAutoSaveRef = React.useRef<() => void>(() => {});
  const setSnapshotInCacheRef = React.useRef<
    (id: string, snapshot: any, isDirty: boolean) => void
  >(() => {});
  const isInitializingRef = React.useRef(false); // Flag to ignore events during initialization

  // Auto-save delay from preferences (default 15 seconds)
  const [autoSaveDelay, setAutoSaveDelay] = React.useState(15000);

  React.useEffect(() => {
    // Load auto-save delay from preferences
    if (window.desktopApi?.preferences?.get) {
      window.desktopApi.preferences
        .get()
        .then((prefs) => {
          setAutoSaveDelay(prefs.autoSaveDelay || 15000);
        })
        .catch(() => {});

      // Listen for preference changes
      const cleanup = window.desktopApi.preferences.onPreferencesUpdated?.(
        (prefs) => {
          setAutoSaveDelay(prefs.autoSaveDelay || 15000);
        },
      );
      return cleanup;
    }
  }, []);

  // Determine if using new file system or legacy artifact system
  const hasFileId = !!fileId;
  const hasArtifactId = !!artifactId && UUID_REGEX.test(artifactId);
  const cacheScope: "file" | "artifact" =
    hasFileId || !hasArtifactId ? "file" : "artifact";
  const effectiveId = fileId || artifactId;
  const effectiveData = fileData || data;

  // === LEGACY: Artifact snapshot cache ===
  const [artifactSnapshotCache, setArtifactSnapshotCache] = useAtom(
    artifactSnapshotCacheAtom,
  );

  // === NEW: File snapshot cache ===
  const [fileSnapshotCache, setFileSnapshotCache] = useAtom(
    fileSnapshotCacheAtom,
  );
  const [, setSavingState] = useAtom(fileSavingAtom);

  // tRPC utils for invalidating queries globally
  const utils = trpc.useUtils();

  // Atom for updating current Doc file (for version count updates)
  const [currentDocFile, setCurrentDocFile] = useAtom(currentDocFileAtom);

  // Get the appropriate snapshot cache based on mode
  const getSnapshotCache = React.useCallback(() => {
    if (!effectiveId) return null;
    if (cacheScope === "file") {
      return fileSnapshotCache[effectiveId];
    } else if (cacheScope === "artifact") {
      return artifactSnapshotCache[effectiveId];
    }
    return null;
  }, [cacheScope, effectiveId, fileSnapshotCache, artifactSnapshotCache]);

  // Set snapshot in appropriate cache
  const setSnapshotInCache = React.useCallback(
    (id: string, snapshot: any, isDirty: boolean) => {
      if (cacheScope === "file") {
        const entry: FileSnapshot = {
          univerData: snapshot,
          timestamp: Date.now(),
          isDirty,
        };
        setFileSnapshotCache((prev) => ({
          ...prev,
          [id]: entry,
        }));
      } else {
        const entry: ArtifactSnapshot = {
          univerData: snapshot,
          timestamp: Date.now(),
          isDirty,
        };
        setArtifactSnapshotCache((prev) => ({
          ...prev,
          [id]: entry,
        }));
      }
    },
    [cacheScope, setFileSnapshotCache, setArtifactSnapshotCache],
  );

  // Generate a stable instance ID
  const instanceIdRef = React.useRef<string>(`document-${Date.now()}`);
  const effectiveDataId = effectiveId ?? instanceIdRef.current;

  // Track current ID to detect switches
  const currentIdRef = React.useRef<string | undefined>(effectiveId);
  const isInitializedRef = React.useRef(false);

  // Track when we received DB data from props (for cache comparison)
  const dbDataTimestampRef = React.useRef<number>(Date.now());
  React.useEffect(() => {
    // Update timestamp whenever effectiveData changes from props
    dbDataTimestampRef.current = Date.now();
  }, [effectiveData]);

  // Check if we have a cached snapshot that's newer than the DB data
  // FIXED: Always prefer cache if it exists and is recent, not just when dirty
  const getCachedOrDbData = React.useCallback(() => {
    if (!effectiveId) return effectiveData;
    const cached = getSnapshotCache();

    if (cached) {
      // Use cache if:
      // 1. It's marked as dirty (has unsaved changes), OR
      // 2. It's newer than when we received DB data (race condition protection)
      const isCacheNewer = cached.timestamp > dbDataTimestampRef.current - 1000; // 1s tolerance
      const shouldUseCache = cached.isDirty || isCacheNewer;

      if (shouldUseCache) {
        console.log("[UniverDocument] Using cached snapshot:", effectiveId, {
          isDirty: cached.isDirty,
          isCacheNewer,
          cacheTime: new Date(cached.timestamp).toISOString(),
        });
        return cached.univerData;
      }
    }

    return effectiveData;
  }, [effectiveId, effectiveData, getSnapshotCache]);

  // Debug: log received data
  React.useEffect(() => {
    console.log("[UniverDocument] Mounted with:", {
      mode: cacheScope,
      effectiveId,
      hasData: !!effectiveData,
      hasCachedData: !!getSnapshotCache(),
      dataKeys: effectiveData ? Object.keys(effectiveData) : [],
      bodyLength: effectiveData?.body?.dataStream?.length,
    });
  }, [cacheScope, effectiveId, effectiveData, getSnapshotCache]);

  // Helper function to safely get snapshot from document
  // Must be defined BEFORE it's used in callbacks
  const getDocumentSnapshot = React.useCallback(() => {
    if (!documentRef.current) {
      return null;
    }

    // Check if save method exists and is a function
    if (typeof documentRef.current.save === "function") {
      try {
        return documentRef.current.save();
      } catch (err) {
        console.warn("[UniverDocument] Error calling save():", err);
        return null;
      }
    }

    // If save doesn't exist, try to get snapshot from API
    const instance = getDocsInstance();
    if (instance) {
      try {
        const activeDoc = instance.api.getActiveDocument?.();
        if (activeDoc && typeof activeDoc.save === "function") {
          return activeDoc.save();
        }
      } catch (err) {
        console.warn("[UniverDocument] Error getting snapshot from API:", err);
      }
    }

    console.warn("[UniverDocument] No save method available on document");
    return null;
  }, []);

  // === MUTATIONS ===
  // Legacy: Artifact save mutation (with proper error handling)
  const saveArtifactSnapshot = trpc.artifacts.saveUniverSnapshot.useMutation({
    onSuccess: (_result, variables) => {
      const savedId = variables.id;
      if (savedId) {
        console.log("[UniverDocument] Artifact save confirmed:", savedId);
        // Clear dirty flag in artifact cache
        setArtifactSnapshotCache((prev) => {
          const existing = prev[savedId];
          if (existing) {
            return {
              ...prev,
              [savedId]: { ...existing, isDirty: false },
            };
          }
          return prev;
        });
      }
    },
    onError: (error, variables) => {
      const failedId = variables.id;
      console.error(
        "[UniverDocument] Artifact save failed, keeping dirty flag:",
        failedId,
        error,
      );
      // Keep dirty flag TRUE on error
      if (failedId) {
        setArtifactSnapshotCache((prev) => {
          const existing = prev[failedId];
          if (existing && !existing.isDirty) {
            return {
              ...prev,
              [failedId]: { ...existing, isDirty: true },
            };
          }
          return prev;
        });
      }
    },
  });

  // New: File update mutation
  const updateFileMutation = trpc.userFiles.update.useMutation({
    onSuccess: (result, variables) => {
      // Use the ID from the mutation variables, not from current fileId
      // This handles race conditions where fileId changed during save
      const savedId = variables.id;
      if (savedId) {
        setSavingState((prev) => ({ ...prev, [savedId]: false }));
        // Clear dirty flag in cache - save confirmed
        setFileSnapshotCache((prev) => {
          const existing = prev[savedId];
          if (existing) {
            console.log(
              "[UniverDocument] DB save confirmed, clearing dirty flag:",
              savedId,
            );
            return {
              ...prev,
              [savedId]: { ...existing, isDirty: false },
            };
          }
          return prev;
        });
      }

      // Update current file atom if this is the current file
      if (result && currentDocFile?.id === result.id) {
        setCurrentDocFile(result);
      }

      // Invalidate queries to refresh version counts globally
      if (result) {
        // Invalidate list query for doc files
        utils.userFiles.list.invalidate({ type: "doc" });
        // Invalidate get query for this specific file
        utils.userFiles.get.invalidate({ id: result.id });
        // Invalidate versions list to update the history panel
        utils.userFiles.listVersions.invalidate({ fileId: result.id });
      }

      if (onVersionCreated && result?.version_count) {
        onVersionCreated(result.version_count);
      }
    },
    onError: (error, variables) => {
      const failedId = variables.id;
      console.error(
        "[UniverDocument] DB save failed, keeping dirty flag:",
        failedId,
        error,
      );
      if (failedId) {
        setSavingState((prev) => ({ ...prev, [failedId]: false }));
        // IMPORTANT: Keep dirty flag TRUE on error so data isn't lost
        setFileSnapshotCache((prev) => {
          const existing = prev[failedId];
          if (existing && !existing.isDirty) {
            return {
              ...prev,
              [failedId]: { ...existing, isDirty: true },
            };
          }
          return prev;
        });
      }
    },
  });

  // Handle save (unified for both modes)
  const handleSave = React.useCallback(async () => {
    if (!documentRef.current || isSaving || !effectiveId) return;

    try {
      setIsSaving(true);
      const snapshot = getDocumentSnapshot();

      if (snapshot) {
        if (hasFileId && fileId) {
          // New file system
          setSavingState((prev) => ({ ...prev, [fileId]: true }));
          await updateFileMutation.mutateAsync({
            id: fileId,
            univerData: snapshot,
            changeType: "manual_save",
            changeDescription: "Guardado manual",
          });
          isDirtyRef.current = false;
          lastSavedSnapshotRef.current = snapshot; // Store last saved snapshot
          setSnapshotInCache(effectiveId, snapshot, false);
        } else if (hasArtifactId && artifactId) {
          // Legacy artifact system
          await saveArtifactSnapshot.mutateAsync({
            id: artifactId,
            univerData: snapshot,
          });
          isDirtyRef.current = false;
          lastSavedSnapshotRef.current = snapshot; // Store last saved snapshot
          setSnapshotInCache(effectiveId, snapshot, false);
        } else {
          // Scratch or unknown target - keep local cache only
          setSnapshotInCache(effectiveId, snapshot, true);
        }
      }
    } catch (err) {
      console.error("Failed to save document:", err);
    } finally {
      setIsSaving(false);
    }
  }, [
    effectiveId,
    hasFileId,
    hasArtifactId,
    fileId,
    artifactId,
    isSaving,
    updateFileMutation,
    saveArtifactSnapshot,
    setSavingState,
    setSnapshotInCache,
    getDocumentSnapshot,
  ]);

  // Save with AI metadata (for Agent Panel)
  const handleSaveWithAIMetadata = React.useCallback(
    async (options: {
      aiModel: string;
      aiPrompt: string;
      toolName: string;
    }) => {
      if (!documentRef.current || !fileId) {
        console.warn(
          "[UniverDocument] Cannot save with AI metadata - no fileId or document",
        );
        return;
      }

      try {
        setIsSaving(true);
        setSavingState((prev) => ({ ...prev, [fileId]: true }));

        const snapshot = getDocumentSnapshot();

        if (snapshot) {
          await updateFileMutation.mutateAsync({
            id: fileId,
            univerData: snapshot,
            changeType: "ai_edit",
            changeDescription: `Editado por ${options.toolName}`,
            aiModel: options.aiModel,
            aiPrompt: options.aiPrompt,
            toolName: options.toolName,
          });
          isDirtyRef.current = false;
          lastSavedSnapshotRef.current = snapshot; // Store last saved snapshot
          console.log(
            "[UniverDocument] Saved with AI metadata:",
            options.toolName,
          );
        }
      } catch (err) {
        console.error("[UniverDocument] Failed to save with AI metadata:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [fileId, updateFileMutation, setSavingState, getDocumentSnapshot],
  );

  const getContent = React.useCallback(() => {
    return getDocumentSnapshot();
  }, [getDocumentSnapshot]);

  // Mark as dirty when user makes changes
  const markDirty = React.useCallback(() => {
    isDirtyRef.current = true;
    const targetId = currentIdRef.current;
    if (targetId && documentRef.current) {
      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
      }
      cacheUpdateTimeoutRef.current = setTimeout(() => {
        try {
          const snapshot = getDocumentSnapshot();
          if (snapshot) {
            setSnapshotInCacheRef.current(targetId, snapshot, true);
          }
        } catch (err) {
          console.warn(
            "[UniverDocument] Failed to cache snapshot on markDirty:",
            err,
          );
        }
      }, 250);
    }
  }, [getDocumentSnapshot]);

  React.useImperativeHandle(ref, () => ({
    save: handleSave,
    getContent,
    markDirty,
    saveWithAIMetadata: handleSaveWithAIMetadata,
  }));

  // Store data in a ref to avoid re-initialization on every render
  const cachedData = getCachedOrDbData();
  const initialDataRef = React.useRef(cachedData);

  // Initialize Univer ONCE on mount, dispose ONLY on unmount
  React.useEffect(() => {
    let mounted = true;

    const initUniverDocs = async () => {
      if (!containerRef.current) {
        return;
      }

      if (isInitializedRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        await new Promise((resolve) => requestAnimationFrame(resolve));

        if (!mounted || !containerRef.current) {
          console.log(
            "[UniverDocument] Aborted init - component unmounted during wait",
          );
          return;
        }

        console.log("[UniverDocument] Initializing docs instance (one-time)");

        // Get the docs Univer instance
        const instance = await initDocsUniver(containerRef.current);

        // Store version for cleanup
        versionRef.current = instance.version;

        if (!mounted) {
          // Component unmounted during init - defer dispose with version check
          const version = versionRef.current;
          setTimeout(() => disposeDocsUniver(version), 0);
          return;
        }

        // Set initializing flag to ignore events during setup
        isInitializingRef.current = true;

        // Create document with data (use cached if available)
        const doc = createDocument(
          instance.api,
          initialDataRef.current,
          effectiveDataId,
        );
        documentRef.current = doc;
        isInitializedRef.current = true;
        currentIdRef.current = effectiveId;

        // Store initial snapshot as last saved (for change detection)
        // This MUST be done BEFORE enabling the event listener
        if (doc && initialDataRef.current) {
          lastSavedSnapshotRef.current = initialDataRef.current;
        }

        console.log("[UniverDocument] Document created:", effectiveDataId);
        setIsLoading(false);

        // Listen to Univer command execution to detect real data mutations
        commandListenerRef.current?.dispose?.();
        commandListenerRef.current = instance.api.addEvent(
          instance.api.Event.CommandExecuted,
          (event) => {
            // CRITICAL: Ignore events during initialization to prevent false saves
            if (isInitializingRef.current) {
              console.log(
                "[UniverDocument] Ignoring mutation event during initialization",
              );
              return;
            }
            if (event.type !== CommandType.MUTATION) return;
            isDirtyRef.current = true;

            if (cacheUpdateTimeoutRef.current) {
              clearTimeout(cacheUpdateTimeoutRef.current);
            }
            cacheUpdateTimeoutRef.current = setTimeout(() => {
              const targetId = currentIdRef.current;
              if (!targetId || !documentRef.current) return;
              try {
                const snapshot = getDocumentSnapshot();
                if (snapshot) {
                  setSnapshotInCacheRef.current(targetId, snapshot, true);
                }
              } catch (err) {
                console.warn(
                  "[UniverDocument] Failed to cache snapshot after mutation:",
                  err,
                );
              }
            }, 250);

            triggerAutoSaveRef.current();
          },
        );

        // Disable initializing flag after a delay to allow Univer to finish setup
        // This prevents false saves from initialization events
        setTimeout(() => {
          isInitializingRef.current = false;
          console.log(
            "[UniverDocument] Initialization complete, events enabled",
          );
        }, 1000); // 1 second should be enough for Univer to finish initialization
      } catch (err) {
        console.error("Failed to initialize Univer Docs:", err);
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load document",
          );
          setIsLoading(false);
        }
      }
    };

    initUniverDocs();

    // Cleanup ONLY on unmount
    return () => {
      mounted = false;

      const currentId = currentIdRef.current;
      const wasDirty = isDirtyRef.current;

      if (documentRef.current && currentId) {
        try {
          const snapshot = getDocumentSnapshot();
          if (snapshot) {
            // CRITICAL FIX: Always save to cache with isDirty: true when unmounting
            // The cache will be cleared by mutation onSuccess if/when DB save succeeds
            // This prevents data loss if tab switch happens before DB save completes
            setSnapshotInCache(currentId, snapshot, true);
            console.log(
              "[UniverDocument] Cached snapshot on unmount:",
              currentId,
              "wasDirty:",
              wasDirty,
            );

            // Trigger async save to DB (fire and forget)
            // The mutation's onSuccess will clear the dirty flag in cache
            if (wasDirty) {
              if (hasFileId) {
                updateFileMutation.mutate({
                  id: currentId,
                  univerData: snapshot,
                  changeType: "auto_save",
                  changeDescription: "Auto-guardado",
                });
              } else if (hasArtifactId) {
                saveArtifactSnapshot.mutate({
                  id: currentId,
                  univerData: snapshot,
                });
              }
              console.log("[UniverDocument] Triggered async save to DB");
            } else {
              // Even if not dirty, still mark cache as clean after a delay
              setTimeout(() => {
                setSnapshotInCache(currentId, snapshot, false);
              }, 2000);
            }
          }
        } catch (err) {
          console.error("[UniverDocument] Failed to cache snapshot:", err);
        }
      }

      documentRef.current = null;
      isInitializedRef.current = false;
      // NOTE: Don't reset isDirtyRef here - it's no longer relevant after unmount

      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
        cacheUpdateTimeoutRef.current = null;
      }
      commandListenerRef.current?.dispose?.();
      commandListenerRef.current = null;

      // Capture version at cleanup time
      const version = versionRef.current;

      // Defer the dispose to next tick to avoid "synchronously unmount during render" error
      // Version check ensures we don't dispose a newer instance
      setTimeout(() => {
        // Only dispose if current instance matches our version
        if (getDocsInstanceVersion() === version) {
          console.log(
            "[UniverDocument] Deferred dispose executing for version:",
            version,
          );
          disposeDocsUniver(version);
        } else {
          console.log(
            "[UniverDocument] Skipping dispose - instance was replaced",
          );
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount/unmount

  // Handle ID switches WITHOUT remounting Univer
  React.useEffect(() => {
    if (!isInitializedRef.current) return;
    if (currentIdRef.current === effectiveId) return;

    console.log(
      "[UniverDocument] ID switch detected:",
      currentIdRef.current,
      "->",
      effectiveId,
    );

    const instance = getDocsInstance();
    if (!instance) {
      console.warn("[UniverDocument] No instance for ID switch");
      return;
    }

    // Save current document to cache AND DB before switching
    const oldId = currentIdRef.current;
    const wasDirty = isDirtyRef.current;
    if (documentRef.current && oldId) {
      try {
        const snapshot = getDocumentSnapshot();
        if (snapshot) {
          // Always mark as dirty in cache until DB confirms save
          setSnapshotInCache(oldId, snapshot, true);
          console.log(
            "[UniverDocument] Cached snapshot before switch:",
            oldId,
            "wasDirty:",
            wasDirty,
          );

          // Trigger async DB save if there were changes
          if (wasDirty) {
            if (hasFileId) {
              updateFileMutation.mutate({
                id: oldId,
                univerData: snapshot,
                changeType: "auto_save",
                changeDescription: "Auto-guardado antes de cambio",
              });
            } else if (hasArtifactId) {
              saveArtifactSnapshot.mutate({ id: oldId, univerData: snapshot });
            }
            console.log(
              "[UniverDocument] Triggered DB save before switch:",
              oldId,
            );
          }
        }
      } catch (err) {
        console.error("[UniverDocument] Failed to cache before switch:", err);
      }
    }

    currentIdRef.current = effectiveId;
    isDirtyRef.current = false; // Reset for new file

    // Get data for new file/artifact BEFORE creating document
    const newData = getCachedOrDbData();

    // Store new file's snapshot as last saved BEFORE creating document
    // This is critical to prevent false saves during initialization
    if (newData) {
      lastSavedSnapshotRef.current = newData;
    }

    // Set initializing flag to ignore events during document creation
    isInitializingRef.current = true;

    // Dispose current document and create new one
    const currentDoc = instance.api.getActiveDocument?.();
    if (currentDoc) {
      const unitId = currentDoc.getId?.();
      if (unitId) {
        instance.api.disposeUnit?.(unitId);
      }
    }

    // Use createDocument to ensure the document has the save() method
    const newDoc = createDocument(instance.api, newData, effectiveDataId);
    documentRef.current = newDoc;

    // Disable initializing flag after a delay to allow Univer to finish setup
    setTimeout(() => {
      isInitializingRef.current = false;
      console.log(
        "[UniverDocument] ID switch initialization complete, events enabled",
      );
    }, 1000);

    console.log("[UniverDocument] ID switch completed:", effectiveId);
  }, [
    effectiveId,
    effectiveDataId,
    getCachedOrDbData,
    setSnapshotInCache,
    hasFileId,
    hasArtifactId,
    updateFileMutation,
    saveArtifactSnapshot,
    getDocumentSnapshot,
  ]);

  // Auto-save with debounce (3 seconds after last edit)
  const autoSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const triggerAutoSave = React.useCallback(() => {
    const targetId = currentIdRef.current || effectiveId;
    if (!targetId || !documentRef.current || isSaving) return;

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const snapshot = getDocumentSnapshot();
        if (!snapshot || !targetId || !isDirtyRef.current) return;

        // CRITICAL: Only save if there are REAL changes (compare with last saved snapshot)
        const lastSaved = lastSavedSnapshotRef.current;
        if (lastSaved && !hasRealChanges(lastSaved, snapshot)) {
          console.log(
            "[UniverDocument] No real changes detected, skipping auto-save",
          );
          isDirtyRef.current = false;
          setSnapshotInCache(targetId, snapshot, false); // Update cache but don't save
          return;
        }

        console.log("[UniverDocument] Real changes detected, auto-saving...");

        // Always keep cache in sync before saving
        setSnapshotInCache(targetId, snapshot, true);

        if (hasFileId && fileId) {
          setSavingState((prev) => ({ ...prev, [fileId]: true }));
          await updateFileMutation.mutateAsync({
            id: fileId,
            univerData: snapshot,
            changeType: "auto_save",
            changeDescription: "Auto-guardado",
          });
          lastSavedSnapshotRef.current = snapshot; // Store last saved snapshot
          setSnapshotInCache(targetId, snapshot, false);
        } else if (hasArtifactId && artifactId) {
          await saveArtifactSnapshot.mutateAsync({
            id: artifactId,
            univerData: snapshot,
          });
          lastSavedSnapshotRef.current = snapshot;
          setSnapshotInCache(targetId, snapshot, false);
        }

        isDirtyRef.current = false;
        console.log("[UniverDocument] Auto-save completed");
      } catch (err) {
        console.error("[UniverDocument] Auto-save failed:", err);
      }
    }, 3000); // 3 seconds debounce
  }, [
    effectiveId,
    hasFileId,
    hasArtifactId,
    fileId,
    artifactId,
    isSaving,
    updateFileMutation,
    saveArtifactSnapshot,
    setSavingState,
    setSnapshotInCache,
    getDocumentSnapshot,
  ]);

  React.useEffect(() => {
    triggerAutoSaveRef.current = triggerAutoSave;
  }, [triggerAutoSave]);

  React.useEffect(() => {
    setSnapshotInCacheRef.current = setSnapshotInCache;
  }, [setSnapshotInCache]);

  // Track user edits to mark as dirty and trigger auto-save
  React.useEffect(() => {
    if (!effectiveId) return;

    // Mark dirty on any keyboard input in the container
    const container = containerRef.current;
    if (!container) return;

    const handleInput = () => {
      isDirtyRef.current = true;
      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
      }
      cacheUpdateTimeoutRef.current = setTimeout(() => {
        const targetId = currentIdRef.current;
        if (!targetId || !documentRef.current) return;
        try {
          const snapshot = getDocumentSnapshot();
          if (snapshot) {
            setSnapshotInCache(targetId, snapshot, true);
          }
        } catch (err) {
          console.warn(
            "[UniverDocument] Failed to cache snapshot from input:",
            err,
          );
        }
      }, 250);
      triggerAutoSave();
    };

    container.addEventListener("input", handleInput);
    container.addEventListener("keydown", handleInput);
    container.addEventListener("paste", handleInput);

    return () => {
      container.removeEventListener("input", handleInput);
      container.removeEventListener("keydown", handleInput);
      container.removeEventListener("paste", handleInput);
      // Clear timeout on cleanup
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
      }
    };
  }, [effectiveId, triggerAutoSave, setSnapshotInCache, getDocumentSnapshot]);

  // Listen for AI tool completion events to save with metadata
  React.useEffect(() => {
    if (!fileId) return;

    // @ts-expect-error - desktopApi type extended in preload
    const unsubscribe = window.desktopApi?.onFileSaveWithAIMetadata?.(
      (data: {
        fileId: string;
        tabType: "excel" | "doc";
        aiModel: string;
        aiPrompt: string;
        toolName: string;
      }) => {
        if (data.fileId !== fileId || data.tabType !== "doc") return;

        console.log(
          "[UniverDocument] Received AI save request:",
          data.toolName,
        );

        // Get current snapshot and save with AI metadata
        if (documentRef.current) {
          try {
            const snapshot = getDocumentSnapshot();
            if (snapshot) {
              setSavingState((prev) => ({ ...prev, [fileId]: true }));
              updateFileMutation.mutate({
                id: fileId,
                univerData: snapshot,
                changeType: "ai_edit",
                changeDescription: `Editado por ${data.toolName}`,
                aiModel: data.aiModel,
                aiPrompt: data.aiPrompt,
                toolName: data.toolName,
              });
              isDirtyRef.current = false;
              console.log(
                "[UniverDocument] Saved with AI metadata:",
                data.toolName,
              );
            }
          } catch (err) {
            console.error(
              "[UniverDocument] Failed to save with AI metadata:",
              err,
            );
            setSavingState((prev) => ({ ...prev, [fileId]: false }));
          }
        }
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [fileId, updateFileMutation, setSavingState, getDocumentSnapshot]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">
              Loading document...
            </span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});

UniverDocument.displayName = "UniverDocument";
