/**
 * Storage Adapter Type Definitions
 * Common types used across all storage adapters
 */

// ============ ENUMS ============
export type StorageMode = "local" | "cloud";
export type FileType = "excel" | "doc" | "note";
export type PanelType = "pdf_chat" | "agent_panel";
export type BucketType = "attachments" | "images";
export type ChangeType =
  | "created"
  | "auto_save"
  | "manual_save"
  | "ai_edit"
  | "ai_create"
  | "restore"
  | "import"
  | "checkpoint";
export type SyncStatus = "pending" | "synced" | "conflict";

// ============ CHAT TYPES ============
export interface Chat {
  id: string;
  userId: string;
  title: string | null;
  archived: boolean;
  pinned: boolean;
  sourceType: string | null;
  sourceId: string | null;
  openaiVectorStoreId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateChatInput {
  userId: string;
  title?: string;
  sourceType?: string;
  sourceId?: string;
}

export interface UpdateChatInput {
  title?: string;
  archived?: boolean;
  pinned?: boolean;
  openaiVectorStoreId?: string;
}

export interface ListChatsOptions {
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

// ============ MESSAGE TYPES ============
export interface Message {
  id: string;
  chatId: string;
  userId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachments: unknown[] | null;
  metadata: Record<string, unknown> | null;
  modelId: string | null;
  modelName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageInput {
  chatId: string;
  userId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
  modelId?: string;
  modelName?: string;
}

export interface UpdateMessageInput {
  content?: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
}

// ============ ARTIFACT TYPES ============
export interface Artifact {
  id: string;
  chatId: string | null;
  userId: string;
  messageId: string | null;
  type: "spreadsheet" | "document" | "code" | "chart";
  name: string;
  content: unknown | null;
  univerData: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateArtifactInput {
  chatId?: string;
  userId: string;
  messageId?: string;
  type: "spreadsheet" | "document" | "code" | "chart";
  name: string;
  content?: unknown;
  univerData?: unknown;
}

export interface UpdateArtifactInput {
  name?: string;
  content?: unknown;
  univerData?: unknown;
}

// ============ USER FILE TYPES ============
export interface UserFile {
  id: string;
  userId: string;
  type: FileType;
  name: string;
  description: string | null;
  univerData: unknown | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  icon: string | null;
  color: string | null;
  versionCount: number;
  totalEdits: number;
  isPinned: boolean;
  isArchived: boolean;
  folderPath: string | null;
  tags: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  lastOpenedAt: Date | null;
  deletedAt: Date | null;
}

export interface CreateUserFileInput {
  userId: string;
  type: FileType;
  name: string;
  description?: string;
  univerData?: unknown;
  content?: string;
  metadata?: Record<string, unknown>;
  icon?: string;
  color?: string;
}

export interface UpdateUserFileInput {
  name?: string;
  description?: string;
  univerData?: unknown;
  content?: string;
  metadata?: Record<string, unknown>;
  icon?: string;
  color?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  folderPath?: string;
  tags?: string[];
}

export interface ListFilesOptions {
  includeArchived?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: "name" | "createdAt" | "updatedAt" | "lastOpenedAt";
  sortOrder?: "asc" | "desc";
}

// ============ FILE VERSION TYPES ============
export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  univerData: unknown | null;
  content: string | null;
  changeType: ChangeType;
  changeDescription: string | null;
  changeSummary: unknown | null;
  diffSummary: unknown | null;
  createdBy: string | null;
  aiModel: string | null;
  aiPrompt: string | null;
  toolName: string | null;
  sizeBytes: number | null;
  commitId: string | null;
  commitMessage: string | null;
  commitParentId: string | null;
  isCheckpoint: boolean;
  isObsolete: boolean;
  obsoletedAt: Date | null;
  obsoletedByVersion: number | null;
  createdAt: Date;
}

export interface CreateFileVersionInput {
  fileId: string;
  versionNumber: number;
  univerData?: unknown;
  content?: string;
  changeType: ChangeType;
  changeDescription?: string;
  changeSummary?: unknown;
  createdBy?: string;
  aiModel?: string;
  aiPrompt?: string;
  toolName?: string;
  sizeBytes?: number;
  commitId?: string;
  commitMessage?: string;
  commitParentId?: string;
  isCheckpoint?: boolean;
}

export interface ListVersionsOptions {
  includeObsolete?: boolean;
  limit?: number;
  offset?: number;
}

// ============ PANEL MESSAGE TYPES ============
export interface PanelMessage {
  id: string;
  userId: string;
  panelType: PanelType;
  sourceId: string;
  tabType: string | null;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown> | null;
  modelId: string | null;
  modelName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePanelMessageInput {
  userId: string;
  panelType: PanelType;
  sourceId: string;
  tabType?: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
  modelId?: string;
  modelName?: string;
}

export interface UpdatePanelMessageInput {
  content?: string;
  metadata?: Record<string, unknown>;
}

// ============ CHAT FILE TYPES ============
export interface ChatFile {
  id: string;
  chatId: string;
  userId: string;
  filename: string;
  storagePath: string;
  fileSize: number | null;
  fileHash: string | null;
  contentType: string | null;
  openaiFileId: string | null;
  openaiVectorStoreFileId: string | null;
  processingStatus: string;
  extractedContent: string | null;
  metadata: Record<string, unknown> | null;
  pages: number | null;
  createdAt: Date;
}

export interface CreateChatFileInput {
  chatId: string;
  userId: string;
  filename: string;
  storagePath: string;
  fileSize?: number;
  fileHash?: string;
  contentType?: string;
  openaiFileId?: string;
  openaiVectorStoreFileId?: string;
  pages?: number;
}

// ============ FILE STORAGE TYPES ============
export interface FileUploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

export interface FileUploadResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface FileDownloadResult {
  success: boolean;
  data?: Buffer;
  error?: string;
}

// ============ QUICK PROMPT TYPES ============
export interface QuickPrompt {
  id: string;
  userId: string;
  title: string;
  content: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateQuickPromptInput {
  userId: string;
  title: string;
  content: string;
  order?: number;
}

export interface UpdateQuickPromptInput {
  title?: string;
  content?: string;
  order?: number;
}
