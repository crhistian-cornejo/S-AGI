/**
 * Cleanup Service for User Files
 *
 * Automatically cleans up old versions to manage storage
 */

import { supabase } from "../../supabase/client";
import log from "electron-log";

const DEFAULT_KEEP_COUNT = 100;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start automatic cleanup service
 */
export function startCleanupService(): void {
  if (cleanupInterval) {
    log.warn("[CleanupService] Already running");
    return;
  }

  log.info("[CleanupService] Starting automatic cleanup service");

  // Run cleanup immediately
  runCleanup();

  // Then run every 24 hours
  cleanupInterval = setInterval(() => {
    runCleanup();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop automatic cleanup service
 */
export function stopCleanupService(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log.info("[CleanupService] Stopped");
  }
}

/**
 * Run cleanup for all files
 */
async function runCleanup(): Promise<void> {
  try {
    log.info("[CleanupService] Running cleanup...");

    // Get all files that have more than DEFAULT_KEEP_COUNT versions
    const { data: files, error } = await supabase
      .from("user_files")
      .select("id, version_count")
      .is("deleted_at", null)
      .gt("version_count", DEFAULT_KEEP_COUNT);

    if (error) {
      log.error("[CleanupService] Error fetching files:", error);
      return;
    }

    if (!files || files.length === 0) {
      log.debug("[CleanupService] No files need cleanup");
      return;
    }

    let totalDeleted = 0;
    for (const file of files) {
      try {
        const { data: deletedCount, error: cleanupError } = await supabase.rpc(
          "cleanup_old_file_versions",
          {
            p_file_id: file.id,
            p_keep_count: DEFAULT_KEEP_COUNT,
          },
        );

        if (cleanupError) {
          log.error(
            `[CleanupService] Error cleaning up file ${file.id}:`,
            cleanupError,
          );
        } else {
          totalDeleted += deletedCount || 0;
          log.debug(
            `[CleanupService] Cleaned up ${deletedCount} versions from file ${file.id}`,
          );
        }
      } catch (err) {
        log.error(
          `[CleanupService] Exception cleaning up file ${file.id}:`,
          err,
        );
      }
    }

    log.info(
      `[CleanupService] Cleanup completed. Deleted ${totalDeleted} old versions from ${files.length} files`,
    );
  } catch (err) {
    log.error("[CleanupService] Fatal error during cleanup:", err);
  }
}

/**
 * Manual cleanup for a specific file
 */
export async function cleanupFile(
  fileId: string,
  keepCount: number = DEFAULT_KEEP_COUNT,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("cleanup_old_file_versions", {
      p_file_id: fileId,
      p_keep_count: keepCount,
    });

    if (error) {
      log.error(`[CleanupService] Error cleaning up file ${fileId}:`, error);
      throw error;
    }

    return data || 0;
  } catch (err) {
    log.error(`[CleanupService] Exception cleaning up file ${fileId}:`, err);
    throw err;
  }
}
