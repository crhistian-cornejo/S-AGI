import { app } from "electron";
import { join, dirname } from "path";
import { mkdir, readFile, writeFile, rename, rm } from "fs/promises";
import { existsSync } from "fs";
import log from "electron-log";
import { safeFilename } from "../file-manager/utils";
import type { FileType } from "./adapters/types";

const LOCAL_USER_FILES_VERSION = 1;

const TYPE_DIR: Record<FileType, string> = {
  excel: "Spreadsheets",
  doc: "Documents",
  note: "Notes",
};

const TYPE_EXT: Record<FileType, string> = {
  excel: "sagi.json",
  doc: "sagi.json",
  note: "sagi.json",
};

export interface LocalUserFilePayload {
  version: number;
  id: string;
  type: FileType;
  name: string;
  univerData?: unknown;
  content?: string;
  updatedAt: string;
}

export function getLocalUserFilesRoot(): string {
  const documentsPath = app.getPath("documents");
  const fallback = app.getPath("userData");
  return join(documentsPath || fallback, "S-AGI");
}

export async function ensureLocalUserFilesDir(type: FileType): Promise<string> {
  const root = getLocalUserFilesRoot();
  const dir = join(root, TYPE_DIR[type]);

  if (!existsSync(root)) {
    await mkdir(root, { recursive: true });
  }
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  return dir;
}

export function buildLocalUserFilePath(params: {
  dir: string;
  id: string;
  name: string;
  type: FileType;
}): string {
  const base = safeFilename(params.name || "Untitled");
  const suffix = params.id ? `-${params.id.slice(0, 8)}` : "";
  const ext = TYPE_EXT[params.type] || "sagi.json";
  return join(params.dir, `${base}${suffix}.${ext}`);
}

export async function writeLocalUserFile(
  filePath: string,
  payload: LocalUserFilePayload
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(payload);
  await writeFile(filePath, serialized, "utf-8");
}

export async function readLocalUserFile(
  filePath: string
): Promise<LocalUserFilePayload | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as LocalUserFilePayload;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    log.warn("[LocalUserFiles] Failed to read:", filePath, error);
    return null;
  }
}

export async function renameLocalUserFile(
  oldPath: string,
  newPath: string
): Promise<void> {
  await rename(oldPath, newPath);
}

export async function deleteLocalUserFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export function buildLocalPayload(params: {
  id: string;
  type: FileType;
  name: string;
  univerData?: unknown;
  content?: string;
}): LocalUserFilePayload {
  return {
    version: LOCAL_USER_FILES_VERSION,
    id: params.id,
    type: params.type,
    name: params.name,
    univerData: params.univerData,
    content: params.content,
    updatedAt: new Date().toISOString(),
  };
}
