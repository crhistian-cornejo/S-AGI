/**
 * Local File Storage Manager
 * Handles file storage for attachments, images, and exports
 * Replaces Supabase Storage for local-first mode
 */

import { app } from "electron";
import { join, dirname, extname } from "path";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  readdirSync,
  statSync,
} from "fs";
import { createHash } from "crypto";
import log from "electron-log";

export type BucketType = "attachments" | "images";

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

export interface UploadResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  data?: Buffer;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  error?: string;
}

/**
 * Local File Storage class
 * Provides a Supabase Storage-compatible API for local file operations
 */
export class LocalFileStorage {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? this.getDefaultBasePath();
    this.ensureDirectories();
  }

  /**
   * Get default base path for local storage
   */
  private getDefaultBasePath(): string {
    const userDataPath = app.getPath("userData");
    return join(userDataPath, "local-data");
  }

  /**
   * Ensure all required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.basePath,
      join(this.basePath, "attachments"),
      join(this.basePath, "images"),
      join(this.basePath, "exports"),
      join(this.basePath, "cache"),
      join(this.basePath, "cache", "thumbnails"),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        log.info(`[LocalFileStorage] Created directory: ${dir}`);
      }
    }
  }

  /**
   * Get path to a specific bucket
   */
  getBucketPath(bucket: BucketType): string {
    return join(this.basePath, bucket);
  }

  /**
   * Sanitize filename for safe storage
   */
  sanitizeFilename(name: string): string {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace special chars
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .substring(0, 200); // Limit length
  }

  /**
   * Generate a unique storage path for a file
   */
  generatePath(
    _bucket: BucketType,
    userId: string,
    folder: string,
    filename: string
  ): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const sanitized = this.sanitizeFilename(filename);
    return join(userId, folder, `${timestamp}-${randomId}-${sanitized}`);
  }

  /**
   * Upload a file to local storage
   */
  async upload(
    bucket: BucketType,
    path: string,
    data: Buffer,
    options?: UploadOptions
  ): Promise<UploadResult> {
    try {
      const fullPath = join(this.getBucketPath(bucket), path);
      const dir = dirname(fullPath);

      // Check if file exists and upsert is false
      if (existsSync(fullPath) && !options?.upsert) {
        return { success: false, error: "File already exists" };
      }

      // Create directory if it doesn't exist
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Write file
      writeFileSync(fullPath, data);
      log.info(`[LocalFileStorage] Uploaded: ${bucket}/${path}`);

      return { success: true, path };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`[LocalFileStorage] Upload failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Upload or replace a file
   */
  async uploadOrReplace(
    bucket: BucketType,
    path: string,
    data: Buffer,
    options?: Omit<UploadOptions, "upsert">
  ): Promise<UploadResult> {
    return this.upload(bucket, path, data, { ...options, upsert: true });
  }

  /**
   * Download a file from local storage
   */
  async download(bucket: BucketType, path: string): Promise<DownloadResult> {
    try {
      const fullPath = join(this.getBucketPath(bucket), path);

      if (!existsSync(fullPath)) {
        log.warn(`[LocalFileStorage] File not found: ${fullPath}`);
        return { success: false, error: "File not found" };
      }

      const data = readFileSync(fullPath);
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`[LocalFileStorage] Download failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Download a file as Buffer
   */
  async downloadAsBuffer(
    bucket: BucketType,
    path: string
  ): Promise<Buffer | null> {
    const result = await this.download(bucket, path);
    return result.success ? result.data! : null;
  }

  /**
   * Delete a file from local storage
   */
  async deleteFile(bucket: BucketType, path: string): Promise<DeleteResult> {
    try {
      const fullPath = join(this.getBucketPath(bucket), path);

      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
        log.info(`[LocalFileStorage] Deleted: ${bucket}/${path}`);
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`[LocalFileStorage] Delete failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Delete multiple files from local storage
   */
  async deleteFiles(bucket: BucketType, paths: string[]): Promise<DeleteResult> {
    try {
      for (const path of paths) {
        const fullPath = join(this.getBucketPath(bucket), path);
        if (existsSync(fullPath)) {
          unlinkSync(fullPath);
          log.info(`[LocalFileStorage] Deleted: ${bucket}/${path}`);
        }
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error(`[LocalFileStorage] Bulk delete failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Get file URL (returns file:// URL for local files)
   */
  getUrl(bucket: BucketType, path: string): string {
    const fullPath = join(this.getBucketPath(bucket), path);
    // Use forward slashes for file:// URLs on all platforms
    return `file://${fullPath.replace(/\\/g, "/")}`;
  }

  /**
   * Get absolute file path
   */
  getFilePath(bucket: BucketType, path: string): string {
    return join(this.getBucketPath(bucket), path);
  }

  /**
   * Check if a file exists
   */
  exists(bucket: BucketType, path: string): boolean {
    const fullPath = join(this.getBucketPath(bucket), path);
    return existsSync(fullPath);
  }

  /**
   * Get file stats
   */
  getStats(
    bucket: BucketType,
    path: string
  ): { size: number; mtime: Date } | null {
    try {
      const fullPath = join(this.getBucketPath(bucket), path);
      if (!existsSync(fullPath)) return null;
      const stats = statSync(fullPath);
      return { size: stats.size, mtime: stats.mtime };
    } catch {
      return null;
    }
  }

  /**
   * Calculate file hash for deduplication
   */
  hashBuffer(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * List files in a directory
   */
  listFiles(bucket: BucketType, folder: string): string[] {
    try {
      const dir = join(this.getBucketPath(bucket), folder);
      if (!existsSync(dir)) return [];
      return readdirSync(dir);
    } catch {
      return [];
    }
  }

  /**
   * Get content type from file extension
   */
  getContentType(filename: string): string {
    const ext = extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".txt": "text/plain",
      ".csv": "text/csv",
      ".json": "application/json",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xls": "application/vnd.ms-excel",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }
}

// Singleton instance
let fileStorage: LocalFileStorage | null = null;

/**
 * Get the local file storage instance
 */
export function getLocalFileStorage(): LocalFileStorage {
  if (!fileStorage) {
    fileStorage = new LocalFileStorage();
  }
  return fileStorage;
}

/**
 * Initialize the local file storage
 */
export function initLocalFileStorage(): LocalFileStorage {
  return getLocalFileStorage();
}
