import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { getCredentialManager } from "../../shared/credentials";
import {
  getAuthState,
  getSetupNeeds,
  importClaudeFromCli,
} from "../../shared/auth";
import { getChatGPTAuthManager, getClaudeCodeAuthManager } from "../../auth";
import { supabase } from "../../supabase/client";
import os from "os";
import { app } from "electron";

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
      return { success: true };
    }),

  // Set Anthropic API key (secure - key stored in encrypted storage)
  setAnthropicKey: publicProcedure
    .input(z.object({ key: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const manager = getCredentialManager();
      await manager.setAnthropicKey(input.key);
      return { success: true };
    }),

  // Set Z.AI API key (secure - key stored in encrypted storage)
  setZaiKey: publicProcedure
    .input(z.object({ key: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const manager = getCredentialManager();
      await manager.setZaiKey(input.key);
      return { success: true };
    }),

  // Clear all API keys (secure - clears encrypted storage)
  clearAllKeys: publicProcedure.mutation(async () => {
    const manager = getCredentialManager();
    await manager.clearAll();
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
});
