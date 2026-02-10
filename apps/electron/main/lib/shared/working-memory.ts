import log from "electron-log";
import type {
  ConversationMessage,
  MemoryProvider,
  MemoryScope,
  WorkingMemory,
} from "@ai-sdk-tools/memory";
import { DEFAULT_TEMPLATE } from "@ai-sdk-tools/memory";
import { getRawDatabase } from "../storage";

const WORKING_MEMORY_KEY_PREFIX = "memory.working.";
const MAX_WORKING_MEMORY_LENGTH = 12_000;
const HISTORY_LIMIT_DEFAULT = 20;
const HISTORY_LIMIT_MAX = 500;
const PROFILE_SECTION_START = "<!-- profile-memory:start -->";
const PROFILE_SECTION_END = "<!-- profile-memory:end -->";

export const DEFAULT_WORKING_MEMORY_SCOPE: MemoryScope = "user";

interface ProfileSnapshot {
  fullName?: string;
  username?: string;
  pronouns?: string;
  bio?: string;
  website?: string;
  location?: string;
  timezone?: string;
  locale?: string;
  language?: string;
  email?: string;
}

export interface ProfileWorkingMemoryInput {
  userId: string | null | undefined;
  userMetadata?: Record<string, unknown> | null;
  email?: string | null;
  fallbackDisplayName?: string | null;
}

interface StoredWorkingMemoryPayload {
  content: string;
  updatedAt: number;
  scope: MemoryScope;
}

function resolveWorkingMemoryKey(params: {
  scope: MemoryScope;
  chatId?: string;
  userId?: string;
}): string | null {
  if (params.scope === "chat") {
    if (!params.chatId) return null;
    return `${WORKING_MEMORY_KEY_PREFIX}chat.${params.chatId}`;
  }

  if (!params.userId) return null;
  return `${WORKING_MEMORY_KEY_PREFIX}user.${params.userId}`;
}

function sanitizeWorkingMemoryContent(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const normalized = input
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

  if (!normalized) return null;
  return normalized.slice(0, MAX_WORKING_MEMORY_LENGTH);
}

function sanitizeProfileField(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const normalized = input
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, 240);
}

function resolveProfileSnapshot(input: ProfileWorkingMemoryInput): ProfileSnapshot {
  const metadata = input.userMetadata ?? {};
  const fullName =
    sanitizeProfileField(metadata.full_name) ??
    sanitizeProfileField(metadata.preferred_name) ??
    sanitizeProfileField(metadata.name) ??
    sanitizeProfileField(input.fallbackDisplayName);

  return {
    fullName: fullName ?? undefined,
    username:
      sanitizeProfileField(metadata.username) ??
      sanitizeProfileField(metadata.user_name) ??
      undefined,
    pronouns: sanitizeProfileField(metadata.pronouns) ?? undefined,
    bio: sanitizeProfileField(metadata.bio) ?? undefined,
    website: sanitizeProfileField(metadata.website) ?? undefined,
    location: sanitizeProfileField(metadata.location) ?? undefined,
    timezone: sanitizeProfileField(metadata.timezone) ?? undefined,
    locale: sanitizeProfileField(metadata.locale) ?? undefined,
    language: sanitizeProfileField(metadata.language) ?? undefined,
    email: sanitizeProfileField(input.email) ?? undefined,
  };
}

function buildProfileMemorySection(snapshot: ProfileSnapshot): string | null {
  const lines: string[] = [];

  if (snapshot.fullName) lines.push(`- Full name: ${snapshot.fullName}`);
  if (snapshot.username) lines.push(`- Username: ${snapshot.username}`);
  if (snapshot.pronouns) lines.push(`- Pronouns: ${snapshot.pronouns}`);
  if (snapshot.bio) lines.push(`- Bio: ${snapshot.bio}`);
  if (snapshot.website) lines.push(`- Website: ${snapshot.website}`);
  if (snapshot.location) lines.push(`- Location: ${snapshot.location}`);
  if (snapshot.timezone) lines.push(`- Timezone: ${snapshot.timezone}`);
  if (snapshot.locale) lines.push(`- Locale: ${snapshot.locale}`);
  if (snapshot.language) lines.push(`- Language: ${snapshot.language}`);
  if (snapshot.email) lines.push(`- Email: ${snapshot.email}`);

  if (lines.length === 0) return null;

  return [
    "## Account Profile (Auto-Synced)",
    "Keep this info accurate and use it when relevant.",
    ...lines,
  ].join("\n");
}

function stripProfileMemorySection(content: string): string {
  const pattern = new RegExp(
    `${PROFILE_SECTION_START}[\\s\\S]*?${PROFILE_SECTION_END}\\n?`,
    "g",
  );
  return content.replace(pattern, "").trimEnd();
}

function upsertProfileMemorySection(
  content: string,
  profileSection: string | null,
): string {
  const base = stripProfileMemorySection(content);
  if (!profileSection) return base.trim();

  const next = `${base.trimEnd()}\n\n${PROFILE_SECTION_START}\n${profileSection}\n${PROFILE_SECTION_END}`;
  return next.trim();
}

function parseStoredWorkingMemory(rawValue: string | null | undefined): WorkingMemory | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredWorkingMemoryPayload>;
    const content = sanitizeWorkingMemoryContent(parsed.content);
    if (!content) return null;

    const updatedAt =
      typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : Date.now();

    return {
      content,
      updatedAt: new Date(updatedAt),
    };
  } catch {
    const content = sanitizeWorkingMemoryContent(rawValue);
    if (!content) return null;
    return {
      content,
      updatedAt: new Date(),
    };
  }
}

class SagiWorkingMemoryProvider implements MemoryProvider {
  async getWorkingMemory(params: {
    chatId?: string;
    userId?: string;
    scope: MemoryScope;
  }): Promise<WorkingMemory | null> {
    const key = resolveWorkingMemoryKey({
      scope: params.scope,
      chatId: params.chatId,
      userId: params.userId,
    });

    if (!key) return null;

    const db = getRawDatabase();
    if (!db) return null;

    try {
      const row = db
        .prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .get(key) as { value?: string } | undefined;

      return parseStoredWorkingMemory(row?.value);
    } catch (error) {
      log.warn("[WorkingMemory] Failed to read working memory:", error);
      return null;
    }
  }

  async updateWorkingMemory(params: {
    chatId?: string;
    userId?: string;
    scope: MemoryScope;
    content: string;
  }): Promise<void> {
    const key = resolveWorkingMemoryKey({
      scope: params.scope,
      chatId: params.chatId,
      userId: params.userId,
    });

    if (!key) {
      throw new Error("Missing memory identifier for selected scope");
    }

    const content = sanitizeWorkingMemoryContent(params.content);
    if (!content) {
      throw new Error("Working memory content is empty");
    }

    const db = getRawDatabase();
    if (!db) {
      throw new Error("Database not available");
    }

    try {
      const nowMs = Date.now();
      const payload: StoredWorkingMemoryPayload = {
        content,
        updatedAt: nowMs,
        scope: params.scope,
      };

      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(key, JSON.stringify(payload), Math.floor(nowMs / 1000));
    } catch (error) {
      log.warn("[WorkingMemory] Failed to persist working memory:", error);
      throw new Error("Failed to persist working memory");
    }
  }

  async saveMessage(_message: ConversationMessage): Promise<void> {
    // Chat messages are already persisted in chat_messages by the app flow.
  }

  async getMessages<T = unknown>(params: {
    chatId: string;
    userId?: string;
    limit?: number;
  }): Promise<T[]> {
    const db = getRawDatabase();
    if (!db) return [];

    const limit = Math.max(
      1,
      Math.min(params.limit ?? HISTORY_LIMIT_DEFAULT, HISTORY_LIMIT_MAX),
    );

    try {
      const sqlBase =
        "SELECT role, content FROM chat_messages WHERE chat_id = ?";
      const sqlWithUser = `${sqlBase} AND user_id = ? ORDER BY created_at DESC LIMIT ?`;
      const sqlWithoutUser = `${sqlBase} ORDER BY created_at DESC LIMIT ?`;

      const rows = (params.userId
        ? db.prepare(sqlWithUser).all(params.chatId, params.userId, limit)
        : db.prepare(sqlWithoutUser).all(params.chatId, limit)) as Array<{
        role: string;
        content: string;
      }>;

      return rows
        .reverse()
        .filter(
          (row) =>
            row.role === "user" ||
            row.role === "assistant" ||
            row.role === "system",
        )
        .map((row) => ({
          role: row.role,
          content: row.content,
        })) as T[];
    } catch (error) {
      log.warn("[WorkingMemory] Failed to load message history:", error);
      return [];
    }
  }
}

const workingMemoryProviderSingleton = new SagiWorkingMemoryProvider();

export function getWorkingMemoryProvider(): MemoryProvider {
  return workingMemoryProviderSingleton;
}

export async function syncProfileWorkingMemory(
  input: ProfileWorkingMemoryInput,
): Promise<string | null> {
  if (!input.userId) return null;

  const profileSnapshot = resolveProfileSnapshot(input);
  const profileSection = buildProfileMemorySection(profileSnapshot);
  const provider = workingMemoryProviderSingleton;

  try {
    const existing = await provider.getWorkingMemory({
      userId: input.userId,
      scope: DEFAULT_WORKING_MEMORY_SCOPE,
    });

    const baseline =
      existing?.content && existing.content.trim().length > 0
        ? existing.content
        : DEFAULT_TEMPLATE;
    const nextContent = upsertProfileMemorySection(baseline, profileSection);

    if (existing?.content?.trim() === nextContent.trim()) {
      return existing.content;
    }

    await provider.updateWorkingMemory({
      userId: input.userId,
      scope: DEFAULT_WORKING_MEMORY_SCOPE,
      content: nextContent,
    });

    return nextContent;
  } catch (error) {
    log.warn("[WorkingMemory] Failed to sync profile working memory:", error);
    return null;
  }
}
