/**
 * Storage Module Index
 * Provides unified access to local-first storage with optional cloud sync
 */

import log from "electron-log";
import { SQLiteAdapter } from "./adapters/sqlite-adapter";
import type { IStorageAdapter, StorageMode } from "./adapters/storage-adapter";

// Re-export existing modules
export * from './paths'
export * from './cache-manager'
export * from './template-store'
export * from './backup-manager'

// Re-export new local storage modules
// Export adapter types directly to avoid conflicts
export { SQLiteAdapter } from "./adapters/sqlite-adapter";
export type { IStorageAdapter } from "./adapters/storage-adapter";
export type {
  StorageMode,
  FileType,
  PanelType,
  BucketType,
  Chat,
  CreateChatInput,
  UpdateChatInput,
  ListChatsOptions,
  Message,
  CreateMessageInput,
  UpdateMessageInput,
  Artifact,
  CreateArtifactInput,
  UpdateArtifactInput,
  UserFile,
  CreateUserFileInput,
  UpdateUserFileInput,
  ListFilesOptions,
  FileVersion,
  CreateFileVersionInput,
  ListVersionsOptions,
  PanelMessage,
  CreatePanelMessageInput,
  UpdatePanelMessageInput,
  ChatFile,
  CreateChatFileInput,
  FileUploadOptions,
  FileUploadResult,
  QuickPrompt,
  CreateQuickPromptInput,
  UpdateQuickPromptInput,
  ChangeType,
  SyncStatus,
} from "./adapters/types";

// Export local-db functions
export {
  initDatabase,
  getDatabase,
  getRawDatabase,
  closeDatabase,
  getDatabasePath,
  getLocalStoragePath,
  isLocalDatabaseAvailable,
} from "./local-db";

// Export local-files functions
export { getLocalFileStorage, type LocalFileStorage } from "./local-files";

// ============ STORAGE FACTORY ============

let currentAdapter: IStorageAdapter | null = null;
let currentMode: StorageMode = "local";

/**
 * Get the current storage mode
 */
export function getStorageMode(): StorageMode {
  return currentMode;
}

/**
 * Check if storage is initialized
 */
export function isStorageInitialized(): boolean {
  return currentAdapter !== null && currentAdapter.isConnected;
}

/**
 * Get the storage adapter (initializes if needed)
 */
export async function getStorageAdapter(): Promise<IStorageAdapter> {
  if (currentAdapter && currentAdapter.isConnected) {
    return currentAdapter;
  }

  return initializeStorage("local");
}

/**
 * Initialize storage with specified mode
 * @param mode - 'local' for SQLite, 'cloud' for Supabase
 */
export async function initializeStorage(mode: StorageMode = "local"): Promise<IStorageAdapter> {
  // Close existing adapter if switching modes
  if (currentAdapter && currentAdapter.isConnected && currentMode !== mode) {
    await currentAdapter.close();
    currentAdapter = null;
  }

  // Return existing adapter if already initialized with same mode
  if (currentAdapter && currentAdapter.isConnected) {
    return currentAdapter;
  }

  currentMode = mode;

  if (mode === "local") {
    log.info("[Storage] Initializing local SQLite storage...");
    currentAdapter = new SQLiteAdapter();
    await currentAdapter.initialize();
    log.info("[Storage] Local storage initialized successfully");
  } else {
    // Cloud mode - will be implemented later
    // For now, fall back to local
    log.info("[Storage] Cloud mode requested but not yet implemented, using local");
    currentAdapter = new SQLiteAdapter();
    await currentAdapter.initialize();
  }

  return currentAdapter;
}

/**
 * Close the current storage connection
 */
export async function closeStorage(): Promise<void> {
  if (currentAdapter) {
    await currentAdapter.close();
    currentAdapter = null;
    log.info("[Storage] Storage closed");
  }
}

/**
 * Get the current adapter synchronously (returns null if not initialized)
 */
export function getStorageAdapterSync(): IStorageAdapter | null {
  return currentAdapter;
}

// ============ CONSTANTS ============

export const LOCAL_USER_ID = "local-user";

/**
 * Get the user ID for storage operations
 * In local mode, always returns LOCAL_USER_ID
 * In cloud mode, returns the Supabase user ID
 */
export function getStorageUserId(supabaseUserId?: string | null): string {
  if (currentMode === "cloud" && supabaseUserId) {
    return supabaseUserId;
  }
  return LOCAL_USER_ID;
}
