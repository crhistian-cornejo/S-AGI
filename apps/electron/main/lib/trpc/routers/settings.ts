import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { getCredentialManager } from "../../shared/credentials";
import {
  getAuthState,
  getSetupNeeds,
  importClaudeFromCli,
} from "../../shared/auth";
import { getChatGPTAuthManager, getClaudeCodeAuthManager } from "../../auth";
import { getZaiAuthManager } from "../../auth/zai-manager";
import { getCerebrasAuthManager } from "../../auth/cerebras-manager";
import { getGroqAuthManager } from "../../auth/groq-manager";
import { getSecureApiKeyStore } from "../../auth/api-key-store";
import { invalidateProviderRegistry } from "../../ai/providers";
import { supabase } from "../../supabase/client";
import os from "os";
import { app, shell } from "electron";
import { ensureDir, getStoragePaths } from "../../storage/paths";
import log from "electron-log";

// ============================================================================
// Ollama Configuration
// ============================================================================

const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";
let _ollamaBaseUrl: string | null = null;

/** Get the Ollama base URL (without /v1 suffix). */
export function getOllamaBaseUrl(): string {
  return _ollamaBaseUrl || OLLAMA_DEFAULT_BASE_URL;
}

/** Set a custom Ollama base URL (e.g., for remote/Docker setups). */
export function setOllamaBaseUrl(url: string | null): void {
  // Strip trailing slash and /v1 suffix if provided
  if (url) {
    url = url.replace(/\/+$/, "").replace(/\/v1$/, "");
  }
  _ollamaBaseUrl = url;
  log.info(`[Ollama] Base URL set to: ${url || OLLAMA_DEFAULT_BASE_URL}`);
}

/**
 * Detect Ollama model capabilities based on model name and family metadata.
 *
 * Tool calling: Only models built on architectures that support function calling
 * should have tools sent to them. Sending tools to non-capable models causes
 * errors or hallucinated tool calls.
 *
 * Vision: Models with vision/multimodal capabilities (llava, moondream, etc.)
 *
 * Reasoning: Models with chain-of-thought reasoning (deepseek-r1, qwen3, etc.)
 */
function detectOllamaModelCapabilities(
  name: string,
  family: string | null,
  families: string[] | null,
): { supportsTools: boolean; supportsImages: boolean; supportsReasoning: boolean } {
  const n = name.toLowerCase();
  const allFamilies = (families || []).map((x) => x.toLowerCase());
  if (family) allFamilies.push(family.toLowerCase());

  // Vision models (support image input)
  const supportsImages =
    /llava|vision|moondream|bakllava|minicpm-v|internvl/.test(n) ||
    allFamilies.some((fam) => /clip|vision/.test(fam));

  // Tool-calling capable model families
  // Based on Ollama's documentation and model card metadata
  const supportsTools =
    // Llama 3.1+ (tool use added in 3.1)
    /llama3\.[1-9]|llama-3\.[1-9]|llama-3-/.test(n) ||
    // Qwen 2.5+ and Qwen 3 (excellent tool support)
    /qwen2\.5|qwen3|qwen-2\.5/.test(n) ||
    // Mistral and Mixtral (native function calling)
    /mistral|mixtral/.test(n) ||
    // Command R family (Cohere)
    /command-r/.test(n) ||
    // Granite (IBM)
    /granite/.test(n) ||
    // Hermes function calling variants
    /hermes/.test(n) ||
    // Firefunction (Fireworks AI function calling model)
    /firefunction/.test(n) ||
    // Nemotron (NVIDIA)
    /nemotron/.test(n) ||
    // Phi-4 (Microsoft) supports tools
    /phi-?4|phi4/.test(n) ||
    // Gemma 2 (Google) has partial tool support
    /gemma2|gemma-2/.test(n);

  // Reasoning models (chain-of-thought)
  const supportsReasoning =
    /deepseek-r1|deepseek-r2/.test(n) ||
    // Qwen 3 has built-in reasoning mode
    /qwen3|qwq/.test(n);

  return { supportsTools, supportsImages, supportsReasoning };
}

/**
 * Settings router for secure API key management and OAuth status
 *
 * SECURITY: This router NEVER returns raw credentials to the renderer.
 * All credential usage happens in the main process only.
 */
export const settingsRouter = router({
  // Get comprehensive credential status (secure - no raw values)
  getApiKeyStatus: publicProcedure.query(async () => {
    const manager = getCredentialManager();
    const status = await manager.getAllStatus();
    const chatGPTAuth = getChatGPTAuthManager();
    const claudeCodeAuth = getClaudeCodeAuthManager();

    return {
      // New secure credential manager
      hasOpenAI: status.hasOpenAIKey,
      hasAnthropic: status.hasAnthropicKey,
      hasZai: status.hasZaiKey,
      hasCerebras: status.hasCerebrasKey,
      hasGroq: status.hasGroqKey,
      hasOllama: true, // Ollama is local, always available (no API key needed)
      hasClaudeOAuth: status.hasClaudeOAuth,
      isClaudeTokenExpired: status.isClaudeTokenExpired,
      hasChatGPTOAuth: status.hasChatGPTOAuth,
      isChatGPTTokenExpired: status.isChatGPTTokenExpired,
      // Legacy managers (for backwards compatibility)
      hasChatGPTPlus: chatGPTAuth.isConnected(),
      hasClaudeCode: claudeCodeAuth.isConnected(),
    };
  }),

  // Get full auth state
  getAuthState: publicProcedure.query(async () => {
    return getAuthState();
  }),

  // Get setup needs
  getSetupNeeds: publicProcedure.query(async () => {
    return getSetupNeeds();
  }),

  // Import Claude CLI credentials
  importClaudeCli: publicProcedure.mutation(async () => {
    const success = await importClaudeFromCli();
    return { success };
  }),

  // Get system and app info for debug
  getSystemInfo: publicProcedure.query(() => {
    const { userData } = getStoragePaths();
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      totalMem: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      freeMem: Math.round(os.freemem() / (1024 * 1024 * 1024)),
      cpus: os.cpus().length,
      version: app.getVersion(),
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
      v8: process.versions.v8,
      userData,
    };
  }),

  // Check connectivity health
  checkHealth: publicProcedure.query(async () => {
    const results = {
      supabase: false,
      openai: false,
      internet: false,
    };

    try {
      // Check internet/google
      const response = await fetch("https://www.google.com", {
        method: "HEAD",
        timeout: 5000,
      } as any);
      results.internet = response.ok;
    } catch (e) {
      results.internet = false;
    }

    try {
      // Check Supabase
      const { error } = await supabase
        .from("chats")
        .select("id", { count: "exact", head: true });
      results.supabase = !error;
    } catch (e) {
      results.supabase = false;
    }

    return results;
  }),

  // Set OpenAI API key (secure - key stored in encrypted storage)
  setOpenAIKey: publicProcedure
    .input(z.object({ key: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const manager = getCredentialManager();
      await manager.setOpenAIKey(input.key);
      // Sync to legacy SecureApiKeyStore (used by isProviderAvailable / agent panel)
      getSecureApiKeyStore().setOpenAIKey(input.key);
      invalidateProviderRegistry();
      return { success: true };
    }),

  // Set Anthropic API key (secure - key stored in encrypted storage)
  setAnthropicKey: publicProcedure
    .input(z.object({ key: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const manager = getCredentialManager();
      await manager.setAnthropicKey(input.key);
      // Sync to legacy SecureApiKeyStore (used by isProviderAvailable / agent panel)
      getSecureApiKeyStore().setAnthropicKey(input.key);
      invalidateProviderRegistry();
      return { success: true };
    }),

  // Set Z.AI API key (secure - key stored in encrypted storage)
  setZaiKey: publicProcedure
    .input(z.object({ key: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const manager = getCredentialManager();
      await manager.setZaiKey(input.key);
      // Sync to legacy ZaiAuthManager (used by isProviderAvailable / agent panel)
      getZaiAuthManager().setApiKey(input.key);
      invalidateProviderRegistry();
      return { success: true };
    }),

  // Set Cerebras API key (secure - key stored in encrypted storage)
  setCerebrasKey: publicProcedure
    .input(z.object({ key: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const manager = getCredentialManager();
      await manager.setCerebrasKey(input.key);
      // Sync to legacy CerebrasAuthManager (used by isProviderAvailable)
      getCerebrasAuthManager().setApiKey(input.key);
      invalidateProviderRegistry();
      return { success: true };
    }),

  // Set Groq API key (secure - key stored in encrypted storage)
  setGroqKey: publicProcedure
    .input(z.object({ key: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const manager = getCredentialManager();
      await manager.setGroqKey(input.key);
      // Sync to legacy GroqAuthManager (used by isProviderAvailable)
      getGroqAuthManager().setApiKey(input.key);
      invalidateProviderRegistry();
      return { success: true };
    }),

  // Clear all API keys (secure - clears encrypted storage)
  clearAllKeys: publicProcedure.mutation(async () => {
    const manager = getCredentialManager();
    await manager.clearAll();
    // Sync to legacy stores
    getZaiAuthManager().clear();
    getCerebrasAuthManager().clear();
    getGroqAuthManager().clear();
    getSecureApiKeyStore().setOpenAIKey(null);
    getSecureApiKeyStore().setAnthropicKey(null);
    invalidateProviderRegistry();
    return { success: true };
  }),

  /**
   * Get stored API keys (Requested by user for display in settings)
   * SECURITY: These keys are now sent to the renderer for the "Show/Hide" feature.
   */
  getOpenAIKey: publicProcedure.query(async () => {
    const manager = getCredentialManager();
    return await manager.getOpenAIKey();
  }),

  getZaiKey: publicProcedure.query(async () => {
    const manager = getCredentialManager();
    return await manager.getZaiKey();
  }),

  getCerebrasKey: publicProcedure.query(async () => {
    const manager = getCredentialManager();
    return await manager.getCerebrasKey();
  }),

  getGroqKey: publicProcedure.query(async () => {
    const manager = getCredentialManager();
    return await manager.getGroqKey();
  }),

  openLocalFolder: publicProcedure.mutation(async () => {
    const { userData } = getStoragePaths();
    await ensureDir(userData);
    const result = await shell.openPath(userData);
    if (result) {
      throw new Error(result);
    }
    return { success: true };
  }),

  /**
   * List locally installed Ollama models by querying the Ollama API.
   * Returns an empty array if Ollama is not running.
   * Detects per-model capabilities (tools, vision, reasoning) from model metadata.
   */
  listOllamaModels: publicProcedure.query(async () => {
    try {
      const baseUrl = getOllamaBaseUrl();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return { models: [], running: false };

      const data = (await res.json()) as {
        models?: Array<{
          name: string;
          size: number;
          digest: string;
          modified_at: string;
          details?: {
            parameter_size?: string;
            quantization_level?: string;
            family?: string;
            families?: string[];
          };
        }>;
      };

      const models = (data.models || []).map((m) => {
        const caps = detectOllamaModelCapabilities(
          m.name,
          m.details?.family || null,
          m.details?.families || null,
        );
        return {
          name: m.name,
          size: m.size,
          parameterSize: m.details?.parameter_size || null,
          quantization: m.details?.quantization_level || null,
          family: m.details?.family || null,
          modifiedAt: m.modified_at,
          supportsTools: caps.supportsTools,
          supportsImages: caps.supportsImages,
          supportsReasoning: caps.supportsReasoning,
        };
      });

      return { models, running: true };
    } catch {
      return { models: [], running: false };
    }
  }),

  /**
   * Get the configured Ollama base URL.
   */
  getOllamaBaseUrl: publicProcedure.query(() => {
    return { baseUrl: getOllamaBaseUrl() };
  }),

  /**
   * Set a custom Ollama base URL (for remote/Docker setups).
   */
  setOllamaBaseUrl: publicProcedure
    .input(z.object({ baseUrl: z.string().nullable() }))
    .mutation(({ input }) => {
      setOllamaBaseUrl(input.baseUrl);
      invalidateProviderRegistry();
      return { success: true };
    }),
});
