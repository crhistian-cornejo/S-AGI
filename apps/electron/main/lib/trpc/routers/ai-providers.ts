/**
 * AI Providers Router - Multi-account support for AI providers
 *
 * Based on 1code patterns for secure multi-account management
 * Supports: Claude, OpenAI, Gemini, and custom providers
 *
 * Features:
 * - Multi-account management per provider
 * - Account switching with active account tracking
 * - Secure credential storage (via safeStorage)
 * - Usage tracking per account
 * - Rate limit management
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { supabase } from '../../supabase/client'
import { getClaudeCodeAuthStore } from '../../auth/claude-code-store'
import { getClaudeCodeAuthManager } from '../../auth'
import log from 'electron-log'
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const ProviderTypeSchema = z.enum(['anthropic', 'openai', 'google', 'azure', 'custom'])

const AccountCredentialsSchema = z.object({
  apiKey: z.string().optional(),
  oauthToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
})

const ProviderAccountSchema = z.object({
  id: z.string(),
  provider: ProviderTypeSchema,
  name: z.string(),
  email: z.string().optional(),
  isActive: z.boolean(),
  source: z.enum(['api_key', 'oauth', 'cli_import']),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
  usageCount: z.number().default(0),
})

type ProviderAccount = z.infer<typeof ProviderAccountSchema>

// ============================================================================
// CREDENTIAL STORAGE
// ============================================================================

const CREDENTIALS_DIR = join(app.getPath('userData'), 'data', 'providers')

function ensureCredentialsDir() {
  if (!existsSync(CREDENTIALS_DIR)) {
    mkdirSync(CREDENTIALS_DIR, { recursive: true })
  }
}

function getCredentialsPath(accountId: string): string {
  return join(CREDENTIALS_DIR, `${accountId}.enc`)
}

function saveCredentials(accountId: string, credentials: z.infer<typeof AccountCredentialsSchema>) {
  ensureCredentialsDir()
  const path = getCredentialsPath(accountId)
  const data = JSON.stringify(credentials)

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(data)
    writeFileSync(path, encrypted)
  } else {
    log.warn('[AIProviders] Encryption not available, storing plaintext')
    writeFileSync(path, data)
  }
}

function loadCredentials(accountId: string): z.infer<typeof AccountCredentialsSchema> | null {
  const path = getCredentialsPath(accountId)
  if (!existsSync(path)) return null

  try {
    const data = readFileSync(path)

    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(data)
      return JSON.parse(decrypted)
    } else {
      return JSON.parse(data.toString())
    }
  } catch (error) {
    log.error('[AIProviders] Failed to load credentials:', error)
    return null
  }
}

function deleteCredentials(accountId: string) {
  const path = getCredentialsPath(accountId)
  if (existsSync(path)) {
    writeFileSync(path, '') // Clear before delete
  }
}

// ============================================================================
// ROUTER
// ============================================================================

export const aiProvidersRouter = router({
  // ========== List Accounts ==========

  /**
   * List all accounts for a provider (or all providers)
   */
  listAccounts: protectedProcedure
    .input(z.object({
      provider: ProviderTypeSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from('ai_provider_accounts')
        .select('*')
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })

      if (error) {
        log.error('[AIProviders] Failed to list accounts:', error)
        throw new Error('Failed to list accounts')
      }

      let accounts = data || []

      if (input.provider) {
        accounts = accounts.filter((a: ProviderAccount) => a.provider === input.provider)
      }

      return accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        name: a.name,
        email: a.email,
        isActive: a.is_active,
        source: a.source,
        createdAt: a.created_at,
        lastUsedAt: a.last_used_at,
        usageCount: a.usage_count || 0,
      }))
    }),

  // ========== Add Account ==========

  /**
   * Add a new account via API key
   */
  addApiKeyAccount: protectedProcedure
    .input(z.object({
      provider: ProviderTypeSchema,
      name: z.string(),
      apiKey: z.string().min(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const accountId = crypto.randomUUID()

      // Save credentials securely
      saveCredentials(accountId, { apiKey: input.apiKey })

      // Save account metadata to Supabase
      const { data, error } = await supabase
        .from('ai_provider_accounts')
        .insert({
          id: accountId,
          user_id: ctx.userId,
          provider: input.provider,
          name: input.name,
          source: 'api_key',
          is_active: false,
        })
        .select()
        .single()

      if (error) {
        deleteCredentials(accountId)
        log.error('[AIProviders] Failed to add account:', error)
        throw new Error('Failed to add account')
      }

      log.info(`[AIProviders] Added ${input.provider} account: ${input.name}`)

      return {
        id: data.id,
        provider: data.provider,
        name: data.name,
        isActive: data.is_active,
        source: data.source,
      }
    }),

  /**
   * Add account via OAuth (Claude Code style)
   */
  addOAuthAccount: protectedProcedure
    .input(z.object({
      provider: ProviderTypeSchema,
      name: z.string(),
      oauthToken: z.string(),
      refreshToken: z.string().optional(),
      expiresAt: z.number().optional(),
      email: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const accountId = crypto.randomUUID()

      // Save credentials securely
      saveCredentials(accountId, {
        oauthToken: input.oauthToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
      })

      // Save account metadata to Supabase
      const { data, error } = await supabase
        .from('ai_provider_accounts')
        .insert({
          id: accountId,
          user_id: ctx.userId,
          provider: input.provider,
          name: input.name,
          email: input.email,
          source: 'oauth',
          is_active: false,
        })
        .select()
        .single()

      if (error) {
        deleteCredentials(accountId)
        log.error('[AIProviders] Failed to add OAuth account:', error)
        throw new Error('Failed to add account')
      }

      log.info(`[AIProviders] Added ${input.provider} OAuth account: ${input.name}`)

      return {
        id: data.id,
        provider: data.provider,
        name: data.name,
        email: data.email,
        isActive: data.is_active,
        source: data.source,
      }
    }),

  // ========== Import Claude Code Account ==========

  /**
   * Import credentials from Claude Code CLI
   */
  importClaudeCodeAccount: protectedProcedure
    .mutation(async ({ ctx }) => {
      const authStore = getClaudeCodeAuthStore()
      const credentials = authStore.load()

      if (!credentials || !credentials.oauthToken) {
        throw new Error('No Claude Code credentials found. Please connect via OAuth first.')
      }

      const accountId = crypto.randomUUID()

      // Save credentials
      saveCredentials(accountId, {
        oauthToken: credentials.oauthToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      })

      // Save account
      const { data, error } = await supabase
        .from('ai_provider_accounts')
        .insert({
          id: accountId,
          user_id: ctx.userId,
          provider: 'anthropic',
          name: `Claude Pro (${credentials.userId || 'imported'})`,
          source: 'cli_import',
          is_active: true,
        })
        .select()
        .single()

      if (error) {
        deleteCredentials(accountId)
        throw new Error('Failed to import account')
      }

      // Set as active
      await supabase
        .from('ai_provider_settings')
        .upsert({
          user_id: ctx.userId,
          provider: 'anthropic',
          active_account_id: accountId,
        })

      log.info('[AIProviders] Imported Claude Code account')

      return {
        id: data.id,
        provider: data.provider,
        name: data.name,
        isActive: true,
        source: data.source,
      }
    }),

  // ========== Set Active Account ==========

  /**
   * Set the active account for a provider
   */
  setActiveAccount: protectedProcedure
    .input(z.object({
      provider: ProviderTypeSchema,
      accountId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify account belongs to user
      const { data: account, error: accountError } = await supabase
        .from('ai_provider_accounts')
        .select('id')
        .eq('id', input.accountId)
        .eq('user_id', ctx.userId)
        .single()

      if (accountError || !account) {
        throw new Error('Account not found')
      }

      // Update settings
      const { error } = await supabase
        .from('ai_provider_settings')
        .upsert({
          user_id: ctx.userId,
          provider: input.provider,
          active_account_id: input.accountId,
        })

      if (error) {
        log.error('[AIProviders] Failed to set active account:', error)
        throw new Error('Failed to set active account')
      }

      // Update account flags
      await supabase
        .from('ai_provider_accounts')
        .update({ is_active: false })
        .eq('user_id', ctx.userId)
        .eq('provider', input.provider)

      await supabase
        .from('ai_provider_accounts')
        .update({ is_active: true })
        .eq('id', input.accountId)

      log.info(`[AIProviders] Set active ${input.provider} account: ${input.accountId}`)

      return { success: true }
    }),

  // ========== Get Active Account ==========

  /**
   * Get the active account for a provider
   */
  getActiveAccount: protectedProcedure
    .input(z.object({
      provider: ProviderTypeSchema,
    }))
    .query(async ({ ctx, input }) => {
      const { data: settings } = await supabase
        .from('ai_provider_settings')
        .select('active_account_id')
        .eq('user_id', ctx.userId)
        .eq('provider', input.provider)
        .single()

      if (!settings?.active_account_id) {
        return null
      }

      const { data: account } = await supabase
        .from('ai_provider_accounts')
        .select('*')
        .eq('id', settings.active_account_id)
        .single()

      if (!account) return null

      return {
        id: account.id,
        provider: account.provider,
        name: account.name,
        email: account.email,
        source: account.source,
        lastUsedAt: account.last_used_at,
        usageCount: account.usage_count || 0,
      }
    }),

  // ========== Get Credentials ==========

  /**
   * Get credentials for an account (internal use)
   */
  getCredentials: protectedProcedure
    .input(z.object({
      accountId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify account belongs to user
      const { data: account, error } = await supabase
        .from('ai_provider_accounts')
        .select('id, provider, source')
        .eq('id', input.accountId)
        .eq('user_id', ctx.userId)
        .single()

      if (error || !account) {
        throw new Error('Account not found')
      }

      const credentials = loadCredentials(input.accountId)

      if (!credentials) {
        throw new Error('Credentials not found')
      }

      // Update last used
      await supabase
        .from('ai_provider_accounts')
        .update({
          last_used_at: new Date().toISOString(),
          usage_count: (account as { usage_count?: number }).usage_count ?? 0 + 1,
        })
        .eq('id', input.accountId)

      return {
        provider: account.provider,
        source: account.source,
        ...credentials,
      }
    }),

  // ========== Delete Account ==========

  /**
   * Delete an account
   */
  deleteAccount: protectedProcedure
    .input(z.object({
      accountId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify account belongs to user
      const { data: account, error: checkError } = await supabase
        .from('ai_provider_accounts')
        .select('id, provider')
        .eq('id', input.accountId)
        .eq('user_id', ctx.userId)
        .single()

      if (checkError || !account) {
        throw new Error('Account not found')
      }

      // Delete credentials
      deleteCredentials(input.accountId)

      // Delete from database
      const { error } = await supabase
        .from('ai_provider_accounts')
        .delete()
        .eq('id', input.accountId)

      if (error) {
        log.error('[AIProviders] Failed to delete account:', error)
        throw new Error('Failed to delete account')
      }

      // Clear active if this was the active account
      await supabase
        .from('ai_provider_settings')
        .delete()
        .eq('user_id', ctx.userId)
        .eq('active_account_id', input.accountId)

      log.info(`[AIProviders] Deleted account: ${input.accountId}`)

      return { success: true }
    }),

  // ========== Refresh Token ==========

  /**
   * Refresh OAuth token for an account
   */
  refreshToken: protectedProcedure
    .input(z.object({
      accountId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const credentials = loadCredentials(input.accountId)

      if (!credentials?.refreshToken) {
        throw new Error('No refresh token available')
      }

      // Get account info
      const { data: account } = await supabase
        .from('ai_provider_accounts')
        .select('provider')
        .eq('id', input.accountId)
        .eq('user_id', ctx.userId)
        .single()

      if (!account) {
        throw new Error('Account not found')
      }

      // Refresh based on provider
      if (account.provider === 'anthropic') {
        const authManager = getClaudeCodeAuthManager()
        const refreshed = await authManager.refresh()

        if (refreshed) {
          // Get updated token from store
          const authStore = getClaudeCodeAuthStore()
          const updatedCreds = authStore.load()

          if (updatedCreds) {
            saveCredentials(input.accountId, {
              ...credentials,
              oauthToken: updatedCreds.oauthToken,
              refreshToken: updatedCreds.refreshToken || credentials.refreshToken,
              expiresAt: updatedCreds.expiresAt,
            })
          }

          log.info('[AIProviders] Refreshed Anthropic token')

          return { success: true }
        }
      }

      throw new Error('Token refresh not supported or failed for this provider')
    }),

  // ========== Track Usage ==========

  /**
   * Track usage for an account (for analytics and rate limiting)
   */
  trackUsage: protectedProcedure
    .input(z.object({
      accountId: z.string(),
      tokens: z.number().optional(),
      cost: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from('ai_provider_accounts')
        .update({
          last_used_at: new Date().toISOString(),
          usage_count: supabase.rpc('increment_usage_count', { account_id: input.accountId })
        })
        .eq('id', input.accountId)
        .eq('user_id', ctx.userId)

      if (error) {
        // Non-critical error, just log
        log.warn('[AIProviders] Failed to track usage:', error)
      }

      return { success: true }
    }),
})
