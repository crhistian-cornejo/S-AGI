/**
 * Storage Adapter Interface
 * Abstract interface for database and file storage operations
 * Implemented by SQLiteAdapter (local) and SupabaseAdapter (cloud)
 */

import type {
  StorageMode,
  FileType,
  PanelType,
  BucketType,
  // Chat types
  Chat,
  CreateChatInput,
  UpdateChatInput,
  ListChatsOptions,
  // Message types
  Message,
  CreateMessageInput,
  UpdateMessageInput,
  // Artifact types
  Artifact,
  CreateArtifactInput,
  UpdateArtifactInput,
  // User file types
  UserFile,
  CreateUserFileInput,
  UpdateUserFileInput,
  ListFilesOptions,
  // File version types
  FileVersion,
  CreateFileVersionInput,
  ListVersionsOptions,
  // Panel message types
  PanelMessage,
  CreatePanelMessageInput,
  UpdatePanelMessageInput,
  // Chat file types
  ChatFile,
  CreateChatFileInput,
  // File storage types
  FileUploadOptions,
  FileUploadResult,
  // Quick prompt types
  QuickPrompt,
  CreateQuickPromptInput,
  UpdateQuickPromptInput,
} from "./types";

/**
 * Storage Adapter Interface
 * Provides a unified API for both local SQLite and cloud Supabase storage
 */
export interface IStorageAdapter {
  // ============ CONFIGURATION ============
  readonly mode: StorageMode;
  readonly isConnected: boolean;

  // ============ LIFECYCLE ============
  initialize(): Promise<void>;
  close(): Promise<void>;

  // ============ CHATS ============
  chats: {
    // Legacy methods with userId (for cloud mode with multi-user)
    list(userId: string, options?: ListChatsOptions): Promise<Chat[]>;
    get(id: string, userId: string): Promise<Chat | null>;
    create(data: CreateChatInput): Promise<Chat>;
    update(id: string, userId: string, data: UpdateChatInput): Promise<Chat>;
    delete(id: string, userId: string): Promise<void>;
    archive(id: string, userId: string): Promise<Chat>;
    restore(id: string, userId: string): Promise<Chat>;
    // OpenCode-style methods (no userId check, for local single-user mode)
    listAll?(options?: ListChatsOptions): Promise<Chat[]>;
    getById?(id: string): Promise<Chat | null>;
    updateById?(id: string, data: UpdateChatInput): Promise<Chat>;
    deleteById?(id: string): Promise<void>;
    archiveById?(id: string): Promise<Chat>;
    restoreById?(id: string): Promise<Chat>;
  };

  // ============ MESSAGES ============
  messages: {
    // Legacy methods with userId (for cloud mode with multi-user)
    list(chatId: string, userId: string, limit?: number): Promise<Message[]>;
    get(id: string, userId: string): Promise<Message | null>;
    add(data: CreateMessageInput): Promise<Message>;
    update(id: string, userId: string, data: UpdateMessageInput): Promise<Message>;
    delete(id: string, userId: string): Promise<void>;
    // OpenCode-style methods (no userId check, for local single-user mode)
    listByChatId?(chatId: string, limit?: number): Promise<Message[]>;
    getById?(id: string): Promise<Message | null>;
  };

  // ============ ARTIFACTS ============
  artifacts: {
    list(chatId: string | null, userId: string): Promise<Artifact[]>;
    listStandalone(userId: string): Promise<Artifact[]>;
    listAll(userId: string): Promise<Artifact[]>;
    get(id: string, userId: string): Promise<Artifact | null>;
    create(data: CreateArtifactInput): Promise<Artifact>;
    update(id: string, userId: string, data: UpdateArtifactInput): Promise<Artifact>;
    delete(id: string, userId: string): Promise<void>;
  };

  // ============ USER FILES ============
  userFiles: {
    list(
      userId: string,
      type: FileType,
      options?: ListFilesOptions
    ): Promise<UserFile[]>;
    get(id: string, userId: string): Promise<UserFile | null>;
    create(data: CreateUserFileInput): Promise<UserFile>;
    update(id: string, userId: string, data: UpdateUserFileInput): Promise<UserFile>;
    delete(id: string, userId: string): Promise<void>;
    hardDelete(id: string, userId: string): Promise<void>;
    updateLastOpened(id: string, userId: string): Promise<void>;
    // Versions
    listVersions(
      fileId: string,
      userId: string,
      options?: ListVersionsOptions
    ): Promise<FileVersion[]>;
    getVersion(
      fileId: string,
      versionNumber: number,
      userId: string
    ): Promise<FileVersion | null>;
    createVersion(data: CreateFileVersionInput): Promise<FileVersion>;
    restoreVersion(
      fileId: string,
      versionNumber: number,
      userId: string
    ): Promise<UserFile>;
    getNextVersionNumber(fileId: string): Promise<number>;
  };

  // ============ PANEL MESSAGES ============
  panelMessages: {
    list(
      panelType: PanelType,
      sourceId: string,
      userId: string,
      tabType?: string
    ): Promise<PanelMessage[]>;
    get(id: string, userId: string): Promise<PanelMessage | null>;
    add(data: CreatePanelMessageInput): Promise<PanelMessage>;
    update(
      id: string,
      userId: string,
      data: UpdatePanelMessageInput
    ): Promise<PanelMessage>;
    delete(id: string, userId: string): Promise<void>;
    clear(
      panelType: PanelType,
      sourceId: string,
      userId: string,
      tabType?: string
    ): Promise<void>;
  };

  // ============ CHAT FILES ============
  chatFiles: {
    list(chatId: string, userId: string): Promise<ChatFile[]>;
    get(id: string, userId: string): Promise<ChatFile | null>;
    create(data: CreateChatFileInput): Promise<ChatFile>;
    delete(id: string, userId: string): Promise<void>;
    deleteForChat(chatId: string, userId: string): Promise<void>;
  };

  // ============ FILE STORAGE ============
  fileStorage: {
    upload(
      bucket: BucketType,
      path: string,
      data: Buffer,
      options?: FileUploadOptions
    ): Promise<FileUploadResult>;
    download(bucket: BucketType, path: string): Promise<Buffer | null>;
    delete(bucket: BucketType, paths: string[]): Promise<void>;
    getUrl(bucket: BucketType, path: string, expiresIn?: number): Promise<string>;
    exists(bucket: BucketType, path: string): boolean;
    generatePath(
      bucket: BucketType,
      userId: string,
      folder: string,
      filename: string
    ): string;
  };

  // ============ QUICK PROMPTS ============
  quickPrompts: {
    list(userId: string): Promise<QuickPrompt[]>;
    get(id: string, userId: string): Promise<QuickPrompt | null>;
    create(data: CreateQuickPromptInput): Promise<QuickPrompt>;
    update(
      id: string,
      userId: string,
      data: UpdateQuickPromptInput
    ): Promise<QuickPrompt>;
    delete(id: string, userId: string): Promise<void>;
    reorder(userId: string, ids: string[]): Promise<void>;
  };
}

// Re-export types for convenience
export * from "./types";
