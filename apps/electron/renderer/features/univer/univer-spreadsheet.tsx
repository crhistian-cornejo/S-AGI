import * as React from "react";
import { useAtom } from "jotai";
import { trpc } from "@/lib/trpc";
import {
  initSheetsUniver,
  createWorkbook,
  disposeSheetsUniver,
  getSheetsInstanceVersion,
  getSheetsInstance,
} from "./univer-sheets-core";
import { CommandType, UniverInstanceType } from "@univerjs/core";
import { artifactSnapshotCacheAtom, type ArtifactSnapshot } from "@/lib/atoms";
import {
  fileSnapshotCacheAtom,
  type FileSnapshot,
  fileSavingAtom,
  currentExcelFileAtom,
} from "@/lib/atoms/user-files";
import { hasRealChanges } from "@/utils/univer-diff-stats";
import { AddContextButton } from "./add-context-button";

interface UniverSpreadsheetProps {
  // Legacy: artifact-based props (for backward compatibility)
  artifactId?: string;
  data?: any;
  // New: file-based props
  fileId?: string;
  fileData?: any;
  // Optional: callback when version is created
  onVersionCreated?: (versionNumber: number) => void;
  // Preview mode: when true, skip cache and use fileData directly
  // This prevents stale cached data from overriding version preview data
  isPreviewMode?: boolean;
}

export interface UniverSpreadsheetRef {
  save: () => Promise<void>;
  getSnapshot: () => any | null;
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

export const UniverSpreadsheet = React.forwardRef<
  UniverSpreadsheetRef,
  UniverSpreadsheetProps
>(({ artifactId, data, fileId, fileData, onVersionCreated, isPreviewMode }, ref) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const workbookRef = React.useRef<any>(null);
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

  // Auto-save delay from preferences (default 5 minutes = 300000ms)
  const [autoSaveDelay, setAutoSaveDelay] = React.useState(300000);

  React.useEffect(() => {
    // Load auto-save delay from preferences (default 5 minutes = 300000ms)
    if (window.desktopApi?.preferences?.get) {
      window.desktopApi.preferences
        .get()
        .then((prefs) => {
          setAutoSaveDelay(prefs.autoSaveDelay || 300000);
        })
        .catch(() => {});

      // Listen for preference changes
      const cleanup = window.desktopApi.preferences.onPreferencesUpdated?.(
        (prefs) => {
          setAutoSaveDelay(prefs.autoSaveDelay || 300000);
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

  // Atom for updating current Excel file (for version count updates)
  const [currentExcelFile, setCurrentExcelFile] = useAtom(currentExcelFileAtom);

  // Get the appropriate snapshot cache based on mode
  const getSnapshotCache = React.useCallback(() => {
    if (!effectiveId) return null;
    if (cacheScope === "file") {
      return fileSnapshotCache[effectiveId];
    }
    if (cacheScope === "artifact") {
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

  // Use effective ID for data purposes; fallback to a stable per-mount ID
  const instanceIdRef = React.useRef<string>(`spreadsheet-${Date.now()}`);
  const effectiveDataId = effectiveId ?? instanceIdRef.current;

  // Track when we received DB data from props (for cache comparison)
  const dbDataTimestampRef = React.useRef<number>(Date.now());
  React.useEffect(() => {
    // Update timestamp whenever effectiveData changes from props
    dbDataTimestampRef.current = Date.now();
  }, [effectiveData]);

  // Check if we have a cached snapshot that's newer than the DB data
  // FIXED: Always prefer cache if it exists and is recent, not just when dirty
  // CRITICAL: Skip cache entirely when in preview mode to show version data accurately
  const getCachedOrDbData = React.useCallback(() => {
    // CRITICAL: In preview mode, always use the provided data (version preview data)
    // This prevents stale cache from overriding the version we're trying to display
    if (isPreviewMode) {
      console.log("[UniverSpreadsheet] Preview mode - skipping cache, using provided data");
      return effectiveData;
    }

    if (!effectiveId) return effectiveData;
    const cached = getSnapshotCache();

    if (cached) {
      // Use cache if:
      // 1. It's marked as dirty (has unsaved changes), OR
      // 2. It's newer than when we received DB data (race condition protection), OR
      // 3. It has a pending save that hasn't completed yet
      const isCacheNewer = cached.timestamp > dbDataTimestampRef.current - 1000; // 1s tolerance
      const shouldUseCache = cached.isDirty || isCacheNewer;

      if (shouldUseCache) {
        console.log("[UniverSpreadsheet] Using cached snapshot:", effectiveId, {
          isDirty: cached.isDirty,
          isCacheNewer,
          cacheTime: new Date(cached.timestamp).toISOString(),
        });
        return cached.univerData;
      }
    }

    return effectiveData;
  }, [effectiveId, effectiveData, getSnapshotCache, isPreviewMode]);

  // Debug: log received data
  React.useEffect(() => {
    console.log("[UniverSpreadsheet] Mounted with:", {
      mode: cacheScope,
      effectiveId,
      hasData: !!effectiveData,
      hasCachedData: !!getSnapshotCache(),
      dataKeys: effectiveData ? Object.keys(effectiveData) : [],
    });
  }, [cacheScope, effectiveId, effectiveData, getSnapshotCache]);

  // === MUTATIONS ===
  // Legacy: Artifact save mutation (with proper error handling)
  const saveArtifactSnapshot = trpc.artifacts.saveUniverSnapshot.useMutation({
    onSuccess: (_result, variables) => {
      const savedId = variables.id;
      if (savedId) {
        console.log("[UniverSpreadsheet] Artifact save confirmed:", savedId);
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
        "[UniverSpreadsheet] Artifact save failed, keeping dirty flag:",
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
              "[UniverSpreadsheet] DB save confirmed, clearing dirty flag:",
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

      // CRITICAL: Update lastSavedSnapshotRef after successful save
      // This ensures we can detect if there are real changes in the next auto-save
      if (workbookRef.current && variables.univerData) {
        lastSavedSnapshotRef.current = variables.univerData;
        console.log("[UniverSpreadsheet] Updated lastSavedSnapshotRef after successful save");
      }

      // Update current file atom if this is the current file
      if (result && currentExcelFile?.id === result.id) {
        setCurrentExcelFile(result);
      }

      // Invalidate queries to refresh version counts globally
      if (result) {
        // Invalidate list query for excel files
        utils.userFiles.list.invalidate({ type: "excel" });
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
        "[UniverSpreadsheet] DB save failed, keeping dirty flag:",
        failedId,
        error,
      );
      if (failedId) {
        setSavingState((prev) => ({ ...prev, [failedId]: false }));
        // IMPORTANT: Keep dirty flag TRUE on error so data isn't lost
        // The cache still has the data, and it will be retried on next save
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
    if (!workbookRef.current || isSaving || !effectiveId) return;

    try {
      setIsSaving(true);

      // DEBUG: Check drawing service BEFORE calling save()
      const instance = getSheetsInstance();
      if (instance) {
        try {
          const injector = (instance.univer as any).__getInjector?.();
          if (injector) {
            // Try to import and access the ISheetDrawingService
            const { ISheetDrawingService } = await import("@univerjs/sheets-drawing");
            const drawingService = injector.get(ISheetDrawingService);
            const workbookId = workbookRef.current?.getId();

            if (drawingService && workbookId) {
              const drawingData = drawingService.getDrawingDataForUnit(workbookId);
              console.log("[UniverSpreadsheet] Drawing service data BEFORE save():", {
                workbookId,
                hasDrawingData: !!drawingData,
                sheetIds: drawingData ? Object.keys(drawingData) : [],
                fullDrawingData: drawingData,
              });
            }
          }
        } catch (serviceErr) {
          console.warn("[UniverSpreadsheet] Could not access drawing service:", serviceErr);
        }
      }

      const snapshot = workbookRef.current.save();

      // DEBUG: Check if snapshot includes drawings
      if (snapshot) {
        const drawingRes = snapshot.resources?.find((r: any) => r.name === "SHEET_DRAWING_PLUGIN" || r.name?.includes("drawing"));
        console.log("[UniverSpreadsheet] Snapshot resources on save:", {
          hasResources: !!snapshot.resources,
          resourceCount: snapshot.resources?.length,
          resourceNames: snapshot.resources?.map((r: any) => r.name),
          hasDrawingResource: !!drawingRes,
          drawingDataLength: drawingRes?.data?.length,
          drawingDataPreview: drawingRes?.data?.substring(0, 100),
        });
      }

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
          setSnapshotInCache(effectiveId, snapshot, false);
        } else {
          // Scratch or unknown target - keep local cache only
          setSnapshotInCache(effectiveId, snapshot, true);
        }
      }
    } catch (err) {
      console.error("Failed to save spreadsheet:", err);
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
  ]);

  // Save with AI metadata (for Agent Panel)
  const handleSaveWithAIMetadata = React.useCallback(
    async (options: {
      aiModel: string;
      aiPrompt: string;
      toolName: string;
    }) => {
      if (!workbookRef.current || !fileId) {
        console.warn(
          "[UniverSpreadsheet] Cannot save with AI metadata - no fileId or workbook",
        );
        return;
      }

      try {
        setIsSaving(true);
        setSavingState((prev) => ({ ...prev, [fileId]: true }));

        const snapshot = workbookRef.current.save();

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
          console.log(
            "[UniverSpreadsheet] Saved with AI metadata:",
            options.toolName,
          );
        }
      } catch (err) {
        console.error(
          "[UniverSpreadsheet] Failed to save with AI metadata:",
          err,
        );
      } finally {
        setIsSaving(false);
      }
    },
    [fileId, updateFileMutation, setSavingState],
  );

  // Mark as dirty when user makes changes
  const markDirty = React.useCallback(() => {
    isDirtyRef.current = true;
    const targetId = currentIdRef.current;
    if (targetId && workbookRef.current) {
      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
      }
      cacheUpdateTimeoutRef.current = setTimeout(() => {
        try {
          const snapshot = workbookRef.current?.save?.();
          if (snapshot) {
            setSnapshotInCacheRef.current(targetId, snapshot, true);
          }
        } catch (err) {
          console.warn(
            "[UniverSpreadsheet] Failed to cache snapshot on markDirty:",
            err,
          );
        }
      }, 250);
    }
  }, []);

  React.useImperativeHandle(ref, () => ({
    save: handleSave,
    getSnapshot: () => workbookRef.current?.save?.() ?? null,
    markDirty,
    saveWithAIMetadata: handleSaveWithAIMetadata,
  }));

  // Store data in a ref to avoid re-initialization on every render
  const cachedData = getCachedOrDbData();
  const initialDataRef = React.useRef(cachedData);
  const isInitializedRef = React.useRef(false);
  // Track current ID to detect switches
  const currentIdRef = React.useRef<string | undefined>(effectiveId);

  // Initialize Univer ONCE on mount, dispose ONLY on unmount
  React.useEffect(() => {
    let mounted = true;

    const initUniver = async () => {
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
            "[UniverSpreadsheet] Aborted init - component unmounted during wait",
          );
          return;
        }

        console.log(
          "[UniverSpreadsheet] Initializing sheets instance (one-time)",
        );

        const instance = await initSheetsUniver(containerRef.current);
        versionRef.current = instance.version;

        if (!mounted) {
          const version = versionRef.current;
          setTimeout(() => disposeSheetsUniver(version), 0);
          return;
        }

        // Set initializing flag to ignore events during setup
        isInitializingRef.current = true;

        const workbook = createWorkbook(
          instance.univer,
          instance.api,
          initialDataRef.current,
          effectiveDataId,
        );

        // Store initial snapshot as last saved (for change detection)
        // This MUST be done BEFORE enabling the event listener
        if (workbook && initialDataRef.current) {
          lastSavedSnapshotRef.current = initialDataRef.current;
        }
        workbookRef.current = workbook;
        isInitializedRef.current = true;
        currentIdRef.current = effectiveId;

        console.log("[UniverSpreadsheet] Workbook created:", effectiveDataId);
        setIsLoading(false);

        // Listen to Univer command execution to detect real data mutations
        // Use CommandType.MUTATION to avoid selection-only operations
        commandListenerRef.current?.dispose?.();
        commandListenerRef.current = instance.api.addEvent(
          instance.api.Event.CommandExecuted,
          (event) => {
            // CRITICAL: Ignore events during initialization to prevent false saves
            if (isInitializingRef.current) {
              console.log(
                "[UniverSpreadsheet] Ignoring mutation event during initialization",
              );
              return;
            }
            if (event.type !== CommandType.MUTATION) return;
            isDirtyRef.current = true;

            // Update local cache (debounced) so scratch saves work reliably
            if (cacheUpdateTimeoutRef.current) {
              clearTimeout(cacheUpdateTimeoutRef.current);
            }
            cacheUpdateTimeoutRef.current = setTimeout(() => {
              const targetId = currentIdRef.current;
              if (!targetId || !workbookRef.current) return;
              try {
                const snapshot = workbookRef.current.save();
                if (snapshot) {
                  setSnapshotInCacheRef.current(targetId, snapshot, true);
                }
              } catch (err) {
                console.warn(
                  "[UniverSpreadsheet] Failed to cache snapshot after mutation:",
                  err,
                );
              }
            }, 250);

            // Trigger debounced DB save
            triggerAutoSaveRef.current();
          },
        );

        // Disable initializing flag after a delay to allow Univer to finish setup
        // This prevents false saves from initialization events
        // CRITICAL: Update lastSavedSnapshotRef AFTER Univer has finished all initial operations
        setTimeout(() => {
          isInitializingRef.current = false;
          // Re-capture the snapshot after initialization is complete
          // This ensures we have the most up-to-date snapshot for comparison
          if (workbookRef.current) {
            try {
              const currentSnapshot = workbookRef.current.save();
              if (currentSnapshot) {
                lastSavedSnapshotRef.current = currentSnapshot;
                console.log("[UniverSpreadsheet] Updated lastSavedSnapshot after initialization");
              }
            } catch (err) {
              console.warn("[UniverSpreadsheet] Failed to update snapshot after init:", err);
            }
          }
          console.log(
            "[UniverSpreadsheet] Initialization complete, events enabled",
          );
        }, 1500); // Increased to 1.5 seconds for more reliable initialization

        // Focus the container
        requestAnimationFrame(() => {
          setTimeout(() => {
            const containerEl = containerRef.current;
            const univerCanvas = containerEl?.querySelector(
              '.univer-render-canvas, [class*="univer-canvas"]',
            );

            if (!containerEl) return;

            const canvasEl = univerCanvas as HTMLElement;
            if (canvasEl && typeof canvasEl.focus === "function") {
              try {
                canvasEl.focus();
              } catch {
                containerEl.focus();
              }
            } else {
              containerEl.focus();
            }
          }, 300);
        });
      } catch (err) {
        console.error("Failed to initialize Univer Sheets:", err);
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load spreadsheet",
          );
          setIsLoading(false);
        }
      }
    };

    initUniver();

    // Cleanup ONLY on unmount
    return () => {
      mounted = false;

      const currentId = currentIdRef.current;
      const wasDirty = isDirtyRef.current;

      if (workbookRef.current && currentId) {
        try {
          const snapshot = workbookRef.current.save();
          if (snapshot) {
            // CRITICAL FIX: Always save to cache with isDirty: true when unmounting
            // The cache will be cleared by mutation onSuccess if/when DB save succeeds
            // This prevents data loss if tab switch happens before DB save completes
            setSnapshotInCache(currentId, snapshot, true);
            console.log(
              "[UniverSpreadsheet] Cached snapshot on unmount:",
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
              console.log("[UniverSpreadsheet] Triggered async save to DB");
            } else {
              // Even if not dirty, still mark cache as clean after a delay
              // This ensures we don't keep stale "dirty" flags forever
              setTimeout(() => {
                setSnapshotInCache(currentId, snapshot, false);
              }, 2000);
            }
          }
        } catch (err) {
          console.error("[UniverSpreadsheet] Failed to cache snapshot:", err);
        }
      }

      workbookRef.current = null;
      isInitializedRef.current = false;
      // NOTE: Don't reset isDirtyRef here - it's no longer relevant after unmount
      // and resetting it was causing race condition issues

      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
        cacheUpdateTimeoutRef.current = null;
      }
      commandListenerRef.current?.dispose?.();
      commandListenerRef.current = null;

      const version = versionRef.current;

      setTimeout(() => {
        if (getSheetsInstanceVersion() === version) {
          console.log(
            "[UniverSpreadsheet] Deferred dispose executing for version:",
            version,
          );
          disposeSheetsUniver(version);
        } else {
          console.log(
            "[UniverSpreadsheet] Skipping dispose - instance was replaced",
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
      "[UniverSpreadsheet] ID switch detected:",
      currentIdRef.current,
      "->",
      effectiveId,
    );

    const instance = getSheetsInstance();
    if (!instance) {
      console.warn("[UniverSpreadsheet] No instance for ID switch");
      return;
    }

    // Save current workbook to cache AND DB before switching
    const oldId = currentIdRef.current;
    const wasDirty = isDirtyRef.current;
    if (workbookRef.current && oldId) {
      try {
        const snapshot = workbookRef.current.save();
        if (snapshot) {
          // Always mark as dirty in cache until DB confirms save
          setSnapshotInCache(oldId, snapshot, true);
          console.log(
            "[UniverSpreadsheet] Cached snapshot before switch:",
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
              "[UniverSpreadsheet] Triggered DB save before switch:",
              oldId,
            );
          }
        }
      } catch (err) {
        console.error(
          "[UniverSpreadsheet] Failed to cache before switch:",
          err,
        );
      }
    }

    currentIdRef.current = effectiveId;
    isDirtyRef.current = false; // Reset for new file

    // Get data for new file/artifact BEFORE creating workbook
    const newData = getCachedOrDbData();

    // Store new file's snapshot as last saved BEFORE creating workbook
    // This is critical to prevent false saves during initialization
    if (newData) {
      lastSavedSnapshotRef.current = newData;
    }

    // Set initializing flag to ignore events during workbook creation
    isInitializingRef.current = true;

    // Dispose current workbook and create new one
    const currentWorkbook = instance.api.getActiveWorkbook();
    if (currentWorkbook) {
      const unitId = currentWorkbook.getId();
      if (unitId) {
        instance.api.disposeUnit(unitId);
      }
    }

    instance.univer.createUnit(
      UniverInstanceType.UNIVER_SHEET,
      newData || {
        id: effectiveDataId,
        name: "Workbook",
        sheetOrder: ["sheet1"],
        sheets: {
          sheet1: {
            id: "sheet1",
            name: "Sheet1",
            rowCount: 100,
            columnCount: 26,
            cellData: {},
            defaultColumnWidth: 100,
            defaultRowHeight: 24,
          },
        },
      },
    );
    workbookRef.current = instance.api.getActiveWorkbook();

    // Disable initializing flag after a delay to allow Univer to finish setup
    // CRITICAL: Update lastSavedSnapshotRef AFTER Univer has finished ID switch operations
    setTimeout(() => {
      isInitializingRef.current = false;
      // Re-capture the snapshot after ID switch is complete
      if (workbookRef.current) {
        try {
          const currentSnapshot = workbookRef.current.save();
          if (currentSnapshot) {
            lastSavedSnapshotRef.current = currentSnapshot;
            console.log("[UniverSpreadsheet] Updated lastSavedSnapshot after ID switch");
          }
        } catch (err) {
          console.warn("[UniverSpreadsheet] Failed to update snapshot after ID switch:", err);
        }
      }
      console.log(
        "[UniverSpreadsheet] ID switch initialization complete, events enabled",
      );
    }, 1500); // Increased to 1.5 seconds for more reliable initialization

    console.log("[UniverSpreadsheet] ID switch completed:", effectiveId);
  }, [
    effectiveId,
    effectiveDataId,
    getCachedOrDbData,
    setSnapshotInCache,
    hasFileId,
    hasArtifactId,
    updateFileMutation,
    saveArtifactSnapshot,
  ]);

  // Auto-save with debounce (after last edit)
  const autoSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  // Periodic auto-save interval (checks every 5 minutes)
  const periodicAutoSaveIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const triggerAutoSave = React.useCallback(() => {
    const targetId = currentIdRef.current || effectiveId;
    if (!targetId || !workbookRef.current || isSaving) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const snapshot = workbookRef.current?.save();
        if (!snapshot || !targetId || !isDirtyRef.current) return;

        // CRITICAL: Only save if there are REAL changes (compare with last saved snapshot)
        const lastSaved = lastSavedSnapshotRef.current;
        if (lastSaved && !hasRealChanges(lastSaved, snapshot)) {
          console.log(
            "[UniverSpreadsheet] No real changes detected, skipping auto-save",
          );
          isDirtyRef.current = false;
          setSnapshotInCache(targetId, snapshot, false); // Update cache but don't save
          return;
        }

        console.log(
          "[UniverSpreadsheet] Real changes detected, auto-saving...",
        );

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
          // lastSavedSnapshotRef is updated in mutation onSuccess
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
        console.log("[UniverSpreadsheet] Auto-save completed");
      } catch (err) {
        console.error("[UniverSpreadsheet] Auto-save failed:", err);
      }
    }, autoSaveDelay);
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
    autoSaveDelay,
  ]);

  // Periodic auto-save check (every 5 minutes) - only saves if there are real changes
  React.useEffect(() => {
    if (!effectiveId || !workbookRef.current) return;

    // Clear existing interval
    if (periodicAutoSaveIntervalRef.current) {
      clearInterval(periodicAutoSaveIntervalRef.current);
    }

    // Set up periodic check (every 5 minutes = 300000ms)
    periodicAutoSaveIntervalRef.current = setInterval(async () => {
      const targetId = currentIdRef.current || effectiveId;
      if (!targetId || !workbookRef.current || isSaving) return;

      try {
        const snapshot = workbookRef.current?.save();
        if (!snapshot || !targetId) return;

        // CRITICAL: Only save if there are REAL changes (compare with last saved snapshot)
        const lastSaved = lastSavedSnapshotRef.current;
        if (!lastSaved) {
          // If we don't have a last saved snapshot, initialize it but don't save
          lastSavedSnapshotRef.current = snapshot;
          console.log("[UniverSpreadsheet] Initialized lastSavedSnapshotRef from periodic check");
          return;
        }

        if (!hasRealChanges(lastSaved, snapshot)) {
          console.log(
            "[UniverSpreadsheet] Periodic check: No real changes detected, skipping save",
          );
          // Update cache but don't save to DB
          setSnapshotInCache(targetId, snapshot, false);
          return;
        }

        console.log(
          "[UniverSpreadsheet] Periodic check: Real changes detected, auto-saving...",
        );

        // Always keep cache in sync before saving
        setSnapshotInCache(targetId, snapshot, true);

        if (hasFileId && fileId) {
          setSavingState((prev) => ({ ...prev, [fileId]: true }));
          await updateFileMutation.mutateAsync({
            id: fileId,
            univerData: snapshot,
            changeType: "auto_save",
            changeDescription: "Auto-guardado periódico",
          });
          // lastSavedSnapshotRef is updated in mutation onSuccess
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
        console.log("[UniverSpreadsheet] Periodic auto-save completed");
      } catch (err) {
        console.error("[UniverSpreadsheet] Periodic auto-save failed:", err);
      }
    }, 300000); // 5 minutes = 300000ms

    return () => {
      if (periodicAutoSaveIntervalRef.current) {
        clearInterval(periodicAutoSaveIntervalRef.current);
        periodicAutoSaveIntervalRef.current = null;
      }
    };
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
  ]);

  React.useEffect(() => {
    triggerAutoSaveRef.current = triggerAutoSave;
  }, [triggerAutoSave]);

  React.useEffect(() => {
    setSnapshotInCacheRef.current = setSnapshotInCache;
  }, [setSnapshotInCache]);

  // Track user edits
  React.useEffect(() => {
    if (!effectiveId) return;

    const container = containerRef.current;
    if (!container) return;

    const handleInput = () => {
      isDirtyRef.current = true;
      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
      }
      cacheUpdateTimeoutRef.current = setTimeout(() => {
        const targetId = currentIdRef.current;
        if (!targetId || !workbookRef.current) return;
        try {
          const snapshot = workbookRef.current.save();
          if (snapshot) {
            setSnapshotInCache(targetId, snapshot, true);
          }
        } catch (err) {
          console.warn(
            "[UniverSpreadsheet] Failed to cache snapshot from input:",
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
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (cacheUpdateTimeoutRef.current) {
        clearTimeout(cacheUpdateTimeoutRef.current);
      }
    };
  }, [effectiveId, triggerAutoSave, setSnapshotInCache]);

  // Listen for live updates from AI tools
  React.useEffect(() => {
    if (!effectiveId) return;

    const unsubscribe = window.desktopApi?.onArtifactUpdate?.((updateData) => {
      // Handle both artifact and file updates
      const matchesArtifact = updateData.artifactId === artifactId;
      const matchesFile = updateData.fileId === fileId;
      if (!matchesArtifact && !matchesFile) return;
      if (updateData.type !== "spreadsheet") return;

      console.log("[UniverSpreadsheet] Received live update for:", effectiveId);

      const instance = getSheetsInstance();
      if (!instance) {
        console.warn("[UniverSpreadsheet] No Univer instance for live update");
        return;
      }

      try {
        const currentWorkbook = instance.api.getActiveWorkbook();
        if (!currentWorkbook) {
          console.log(
            "[UniverSpreadsheet] No active workbook, creating new one",
          );
          instance.univer.createUnit(
            UniverInstanceType.UNIVER_SHEET,
            updateData.univerData,
          );
          workbookRef.current = instance.api.getActiveWorkbook();
          return;
        }

        // INCREMENTAL UPDATE
        const univerData = updateData.univerData;
        const sheetId = Object.keys(univerData.sheets || {})[0];
        if (!sheetId || !univerData.sheets?.[sheetId]) {
          console.warn("[UniverSpreadsheet] Invalid univerData structure");
          return;
        }

        const sheetData = univerData.sheets[sheetId];
        const cellData = sheetData.cellData || {};
        const activeSheet = currentWorkbook.getActiveSheet();

        if (!activeSheet) {
          console.warn(
            "[UniverSpreadsheet] No active sheet for incremental update",
          );
          return;
        }

        const updates: Array<{
          row: number;
          col: number;
          value: unknown;
          style?: unknown;
        }> = [];

        // Check if any cell has styles - if so, we need full recreation
        let hasStyles = false;

        for (const [rowKey, rowData] of Object.entries(cellData)) {
          const row = parseInt(rowKey, 10);
          if (Number.isNaN(row) || !rowData || typeof rowData !== "object")
            continue;

          for (const [colKey, cellValue] of Object.entries(
            rowData as Record<string, unknown>,
          )) {
            const col = parseInt(colKey, 10);
            if (Number.isNaN(col)) continue;

            const cell = cellValue as { v?: unknown; s?: unknown } | null;
            if (cell) {
              updates.push({
                row,
                col,
                value: cell.v,
                style: cell.s,
              });
              // Check if this cell has any styles defined
              if (cell.s && typeof cell.s === 'object' && Object.keys(cell.s).length > 0) {
                hasStyles = true;
              }
            }
          }
        }

        if (updates.length > 0) {
          console.log(
            `[UniverSpreadsheet] Applying ${updates.length} cell updates, hasStyles: ${hasStyles}`,
          );

          // If styles are involved, do a full workbook recreation to apply them properly
          // The incremental setValues API doesn't support styles
          if (hasStyles) {
            console.log("[UniverSpreadsheet] Styles detected, doing full recreation");
            const unitId = currentWorkbook.getId();
            if (unitId) {
              instance.api.disposeUnit(unitId);
            }
            instance.univer.createUnit(
              UniverInstanceType.UNIVER_SHEET,
              updateData.univerData,
            );
            workbookRef.current = instance.api.getActiveWorkbook();
          } else {
            // Values-only update can use incremental approach
            const maxRow = Math.max(...updates.map((u) => u.row)) + 1;
            const maxCol = Math.max(...updates.map((u) => u.col)) + 1;

            const valueMatrix: Record<number, Record<number, unknown>> = {};
            for (const update of updates) {
              if (!valueMatrix[update.row]) valueMatrix[update.row] = {};
              valueMatrix[update.row][update.col] = update.value;
            }

            try {
              const range = activeSheet.getRange(0, 0, maxRow, maxCol);
              if (range && typeof range.setValues === "function") {
                range.setValues(valueMatrix);
              }
            } catch (rangeErr) {
              console.warn(
                "[UniverSpreadsheet] setValues failed, falling back to full recreation:",
                rangeErr,
              );
              const unitId = currentWorkbook.getId();
              if (unitId) {
                instance.api.disposeUnit(unitId);
              }
              instance.univer.createUnit(
                UniverInstanceType.UNIVER_SHEET,
                updateData.univerData,
              );
              workbookRef.current = instance.api.getActiveWorkbook();
            }
          }
        }

        console.log("[UniverSpreadsheet] Live update applied");
      } catch (err) {
        console.error("[UniverSpreadsheet] Failed to apply live update:", err);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [effectiveId, artifactId, fileId]);

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
        if (data.fileId !== fileId || data.tabType !== "excel") return;

        console.log(
          "[UniverSpreadsheet] Received AI save request:",
          data.toolName,
        );

        // Get current snapshot and save with AI metadata
        if (workbookRef.current) {
          try {
            const snapshot = workbookRef.current.save();
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
                "[UniverSpreadsheet] Saved with AI metadata:",
                data.toolName,
              );
            }
          } catch (err) {
            console.error(
              "[UniverSpreadsheet] Failed to save with AI metadata:",
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
  }, [fileId, updateFileMutation, setSavingState]);

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
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/80 z-10"
          style={{ pointerEvents: "auto" }}
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">
              Loading spreadsheet...
            </span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full outline-none" />
      {/* Add Context button - appears when cells are selected */}
      {hasFileId && (
        <AddContextButton
          fileId={fileId}
          fileName={currentExcelFile?.name}
        />
      )}
    </div>
  );
});

UniverSpreadsheet.displayName = "UniverSpreadsheet";
