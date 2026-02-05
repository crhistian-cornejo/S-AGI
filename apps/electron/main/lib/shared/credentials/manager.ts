/**
 * Credential Manager
 *
 * High-level API for managing all types of credentials.
 * Uses the secure storage backend for encrypted storage.
 * Includes in-memory cache with TTL to avoid repeated async lookups.
 *
 * Based on craft-agents-oss patterns.
 */

import { getSecureStorage, CredentialType } from "./secure-storage";
import log from "electron-log";

export interface ClaudeOAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  userId?: string;
  source?: "oauth" | "cli_import";
}

export interface ChatGPTOAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  email?: string;
  accountId?: string;
}

const KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

/**
 * Centralized credential management
 */
export class CredentialManager {
  private storage = getSecureStorage();
  private keyCache = new Map<string, CacheEntry<string | null>>();

  private getCached(key: string): string | null | undefined {
    const entry = this.keyCache.get(key);
    if (entry && Date.now() - entry.cachedAt < KEY_CACHE_TTL_MS) {
      return entry.value;
    }
    if (entry) {
      this.keyCache.delete(key);
    }
    return undefined;
  }

  private setCache(key: string, value: string | null): void {
    this.keyCache.set(key, { value, cachedAt: Date.now() });
  }

  private invalidateCache(key: string): void {
    this.keyCache.delete(key);
  }

  // ============================================================
  // Anthropic API Key
  // ============================================================

  async getAnthropicKey(): Promise<string | null> {
    const cached = this.getCached("anthropic_api_key");
    if (cached !== undefined) return cached;
    const cred = await this.storage.get({ type: "anthropic_api_key" });
    const value = cred?.value || null;
    this.setCache("anthropic_api_key", value);
    return value;
  }

  async setAnthropicKey(key: string | null): Promise<void> {
    this.invalidateCache("anthropic_api_key");
    if (key) {
      await this.storage.set(
        { type: "anthropic_api_key" },
        { value: key, metadata: { source: "manual" } },
      );
      log.info("[CredentialManager] Anthropic API key saved");
    } else {
      await this.storage.delete({ type: "anthropic_api_key" });
      log.info("[CredentialManager] Anthropic API key removed");
    }
  }

  async hasAnthropicKey(): Promise<boolean> {
    return this.storage.has({ type: "anthropic_api_key" });
  }

  // ============================================================
  // Claude OAuth (Claude Code Pro/Max)
  // ============================================================

  async getClaudeOAuth(): Promise<ClaudeOAuthCredentials | null> {
    const cred = await this.storage.get({ type: "claude_oauth" });
    if (!cred) return null;

    return {
      accessToken: cred.value,
      refreshToken: cred.metadata?.refreshToken,
      expiresAt: cred.metadata?.expiresAt,
      scopes: cred.metadata?.scopes,
      userId: cred.metadata?.userId,
      source: cred.metadata?.source as "oauth" | "cli_import" | undefined,
    };
  }

  async setClaudeOAuth(
    credentials: ClaudeOAuthCredentials | null,
  ): Promise<void> {
    if (credentials) {
      await this.storage.set(
        { type: "claude_oauth" },
        {
          value: credentials.accessToken,
          metadata: {
            refreshToken: credentials.refreshToken,
            expiresAt: credentials.expiresAt,
            scopes: credentials.scopes,
            userId: credentials.userId,
            connectedAt: new Date().toISOString(),
            source: credentials.source || "oauth",
          },
        },
      );
      log.info("[CredentialManager] Claude OAuth credentials saved");
    } else {
      await this.storage.delete({ type: "claude_oauth" });
      log.info("[CredentialManager] Claude OAuth credentials removed");
    }
  }

  async hasClaudeOAuth(): Promise<boolean> {
    return this.storage.has({ type: "claude_oauth" });
  }

  async isClaudeTokenExpired(): Promise<boolean> {
    const cred = await this.getClaudeOAuth();
    if (!cred || !cred.expiresAt) return false;
    // 5 minute buffer
    return Date.now() + 5 * 60 * 1000 >= cred.expiresAt;
  }

  // ============================================================
  // OpenAI API Key
  // ============================================================

  async getOpenAIKey(): Promise<string | null> {
    const cached = this.getCached("openai_api_key");
    if (cached !== undefined) return cached;
    const cred = await this.storage.get({ type: "openai_api_key" });
    const value = cred?.value || null;
    this.setCache("openai_api_key", value);
    return value;
  }

  async setOpenAIKey(key: string | null): Promise<void> {
    this.invalidateCache("openai_api_key");
    if (key) {
      await this.storage.set(
        { type: "openai_api_key" },
        { value: key, metadata: { source: "manual" } },
      );
      log.info("[CredentialManager] OpenAI API key saved");
    } else {
      await this.storage.delete({ type: "openai_api_key" });
      log.info("[CredentialManager] OpenAI API key removed");
    }
  }

  async hasOpenAIKey(): Promise<boolean> {
    return this.storage.has({ type: "openai_api_key" });
  }

  // ============================================================
  // ChatGPT Plus OAuth
  // ============================================================

  async getChatGPTOAuth(): Promise<ChatGPTOAuthCredentials | null> {
    const cred = await this.storage.get({ type: "chatgpt_oauth" });
    if (!cred) return null;

    return {
      accessToken: cred.value,
      refreshToken: cred.metadata?.refreshToken,
      idToken: cred.metadata?.userId, // Stored in userId field for now
      expiresAt: cred.metadata?.expiresAt,
      email: cred.metadata?.email,
      accountId: cred.metadata?.userId,
    };
  }

  async setChatGPTOAuth(
    credentials: ChatGPTOAuthCredentials | null,
  ): Promise<void> {
    if (credentials) {
      await this.storage.set(
        { type: "chatgpt_oauth" },
        {
          value: credentials.accessToken,
          metadata: {
            refreshToken: credentials.refreshToken,
            expiresAt: credentials.expiresAt,
            email: credentials.email,
            userId: credentials.accountId,
            connectedAt: new Date().toISOString(),
            source: "oauth",
          },
        },
      );
      log.info("[CredentialManager] ChatGPT OAuth credentials saved");
    } else {
      await this.storage.delete({ type: "chatgpt_oauth" });
      log.info("[CredentialManager] ChatGPT OAuth credentials removed");
    }
  }

  async hasChatGPTOAuth(): Promise<boolean> {
    return this.storage.has({ type: "chatgpt_oauth" });
  }

  async isChatGPTTokenExpired(): Promise<boolean> {
    const cred = await this.getChatGPTOAuth();
    if (!cred || !cred.expiresAt) return false;
    // 5 minute buffer
    return Date.now() + 5 * 60 * 1000 >= cred.expiresAt;
  }

  // ============================================================
  // Z.AI API Key
  // ============================================================

  async getZaiKey(): Promise<string | null> {
    const cached = this.getCached("zai_api_key");
    if (cached !== undefined) return cached;
    const cred = await this.storage.get({ type: "zai_api_key" });
    const value = cred?.value || null;
    this.setCache("zai_api_key", value);
    return value;
  }

  async setZaiKey(key: string | null): Promise<void> {
    this.invalidateCache("zai_api_key");
    if (key) {
      await this.storage.set(
        { type: "zai_api_key" },
        { value: key, metadata: { source: "manual" } },
      );
      log.info("[CredentialManager] Z.AI API key saved");
    } else {
      await this.storage.delete({ type: "zai_api_key" });
      log.info("[CredentialManager] Z.AI API key removed");
    }
  }

  async hasZaiKey(): Promise<boolean> {
    return this.storage.has({ type: "zai_api_key" });
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Get status of all credentials (without exposing values)
   */
  async getAllStatus(): Promise<{
    hasAnthropicKey: boolean;
    hasClaudeOAuth: boolean;
    isClaudeTokenExpired: boolean;
    hasOpenAIKey: boolean;
    hasChatGPTOAuth: boolean;
    isChatGPTTokenExpired: boolean;
    hasZaiKey: boolean;
  }> {
    const [
      hasAnthropicKey,
      hasClaudeOAuth,
      isClaudeTokenExpired,
      hasOpenAIKey,
      hasChatGPTOAuth,
      isChatGPTTokenExpired,
      hasZaiKey,
    ] = await Promise.all([
      this.hasAnthropicKey(),
      this.hasClaudeOAuth(),
      this.isClaudeTokenExpired(),
      this.hasOpenAIKey(),
      this.hasChatGPTOAuth(),
      this.isChatGPTTokenExpired(),
      this.hasZaiKey(),
    ]);

    return {
      hasAnthropicKey,
      hasClaudeOAuth,
      isClaudeTokenExpired,
      hasOpenAIKey,
      hasChatGPTOAuth,
      isChatGPTTokenExpired,
      hasZaiKey,
    };
  }

  /**
   * Clear all credentials
   */
  async clearAll(): Promise<void> {
    this.keyCache.clear();
    const types: CredentialType[] = [
      "anthropic_api_key",
      "claude_oauth",
      "openai_api_key",
      "chatgpt_oauth",
      "zai_api_key",
      "gemini_oauth",
    ];

    for (const type of types) {
      await this.storage.delete({ type });
    }

    log.info("[CredentialManager] All credentials cleared");
  }
}

// Singleton instance
let managerInstance: CredentialManager | null = null;

export function getCredentialManager(): CredentialManager {
  if (!managerInstance) {
    managerInstance = new CredentialManager();
  }
  return managerInstance;
}
