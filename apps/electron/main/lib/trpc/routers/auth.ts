import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { getClaudeCodeAuthManager, getChatGPTAuthManager, getZaiAuthManager, CHATGPT_CODEX_MODELS } from '../../auth'
// NOTE: Gemini auth disabled - OAuth token incompatible with generativelanguage.googleapis.com
// import { getClaudeCodeAuthManager, getChatGPTAuthManager, getZaiAuthManager, getGeminiAuthManager, CHATGPT_CODEX_MODELS } from '../../auth'
import { supabase, authStorage } from '../../supabase/client'
import { getMainWindow, sendToRenderer } from '../../window-manager'
import { BrowserWindow, shell } from 'electron'
import log from 'electron-log'
import {
    authRateLimiter,
    signUpRateLimiter,
    passwordResetRateLimiter,
    oauthRateLimiter,
    checkRateLimit
} from '../../auth/rate-limiter'

function decodeImageDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl)
    if (!match) throw new Error('Invalid image data URL')
    const contentType = match[1]
    const buffer = Buffer.from(match[2], 'base64')
    if (!buffer.length) throw new Error('Empty image data')
    return { contentType, buffer }
}

/** Parse access_token and refresh_token from a Supabase OAuth callback URL (hash or query). */
function parseOAuthTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
    const hashIdx = url.indexOf('#')
    const queryIdx = url.indexOf('?')
    let params: URLSearchParams
    if (hashIdx !== -1) {
        params = new URLSearchParams(url.substring(hashIdx + 1))
    } else if (queryIdx !== -1) {
        params = new URLSearchParams(url.substring(queryIdx + 1))
    } else {
        return null
    }
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (access_token && refresh_token) return { access_token, refresh_token }
    return null
}

export const authRouter = router({
    // ========== Supabase User Auth ==========

    // Get current session/user
    getSession: publicProcedure.query(async () => {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
            log.error('[Auth] getSession error:', error)
            return null
        }
        return session
    }),

    // Get current user
    getUser: publicProcedure.query(async () => {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) {
            log.error('[Auth] getUser error:', error)
            return null
        }
        if (!user) return null

        const userMetadata: Record<string, unknown> = (user.user_metadata as Record<string, unknown>) ?? {}
        const avatarPath = typeof userMetadata.avatar_path === 'string' ? userMetadata.avatar_path : null
        const avatarProviderUrl = typeof userMetadata.avatar_provider_url === 'string' ? userMetadata.avatar_provider_url : null

        if (avatarPath) {
            const { data: signedData, error: signError } = await supabase.storage
                .from('attachments')
                .createSignedUrl(avatarPath, 60 * 60 * 24 * 7)
            if (!signError && signedData?.signedUrl) {
                return {
                    ...user,
                    user_metadata: {
                        ...userMetadata,
                        avatar_url: signedData.signedUrl
                    }
                }
            }
        }

        if (avatarProviderUrl) {
            return {
                ...user,
                user_metadata: {
                    ...userMetadata,
                    avatar_url: avatarProviderUrl
                }
            }
        }

        const fallbackPicture = typeof userMetadata.picture === 'string' ? userMetadata.picture : null
        const existingAvatarUrl = typeof userMetadata.avatar_url === 'string' ? userMetadata.avatar_url : null
        if (!existingAvatarUrl && fallbackPicture) {
            return {
                ...user,
                user_metadata: {
                    ...userMetadata,
                    avatar_url: fallbackPicture
                }
            }
        }

        return user
    }),

    updateProfile: protectedProcedure
        .input(z.object({
            fullName: z.string().min(1).max(80).nullable().optional(),
            username: z.string().min(2).max(32).regex(/^[a-z0-9_]+$/).nullable().optional(),
            bio: z.string().max(240).nullable().optional(),
            website: z.string().max(200).url().nullable().optional(),
            location: z.string().max(80).nullable().optional(),
            timezone: z.string().max(80).nullable().optional(),
            pronouns: z.string().max(40).nullable().optional(),
            avatar: z.object({
                mode: z.enum(['keep', 'remove', 'provider', 'upload']),
                dataUrl: z.string().nullable().optional(),
                providerUrl: z.string().url().nullable().optional()
            }).optional()
        }))
        .mutation(async ({ input, ctx }) => {
            const { data: { user: currentUser }, error: currentUserError } = await supabase.auth.getUser()
            if (currentUserError) {
                log.error('[Auth] updateProfile getUser error:', currentUserError)
                throw new Error(currentUserError.message)
            }
            if (!currentUser) throw new Error('Not authenticated. Please sign in first.')

            const existingMetadata: Record<string, unknown> = (currentUser.user_metadata as Record<string, unknown>) ?? {}
            const nextMetadata: Record<string, unknown> = { ...existingMetadata }

            if (input.fullName !== undefined) nextMetadata.full_name = input.fullName
            if (input.username !== undefined) nextMetadata.username = input.username
            if (input.bio !== undefined) nextMetadata.bio = input.bio
            if (input.website !== undefined) nextMetadata.website = input.website
            if (input.location !== undefined) nextMetadata.location = input.location
            if (input.timezone !== undefined) nextMetadata.timezone = input.timezone
            if (input.pronouns !== undefined) nextMetadata.pronouns = input.pronouns

            const existingAvatarPath = typeof existingMetadata.avatar_path === 'string' ? existingMetadata.avatar_path : null

            if (input.avatar?.mode === 'remove') {
                if (existingAvatarPath) {
                    await supabase.storage.from('attachments').remove([existingAvatarPath])
                }
                nextMetadata.avatar_path = null
                nextMetadata.avatar_provider_url = null
            }

            if (input.avatar?.mode === 'provider') {
                const providerUrl = input.avatar.providerUrl ?? null
                nextMetadata.avatar_path = null
                nextMetadata.avatar_provider_url = providerUrl
            }

            if (input.avatar?.mode === 'upload') {
                const dataUrl = input.avatar.dataUrl
                if (!dataUrl) throw new Error('Missing avatar data')
                const { contentType, buffer } = decodeImageDataUrl(dataUrl)
                if (buffer.length > 2_000_000) throw new Error('Avatar image too large')

                const path = `avatars/${ctx.userId}/avatar`
                const ext = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : contentType.includes('jpeg') ? 'jpg' : 'img'
                const storagePath = `${path}.${ext}`

                if (existingAvatarPath && existingAvatarPath !== storagePath) {
                    await supabase.storage.from('attachments').remove([existingAvatarPath])
                }

                const { error: uploadError } = await supabase.storage
                    .from('attachments')
                    .upload(storagePath, buffer, { contentType, upsert: true, cacheControl: '3600' })

                if (uploadError) {
                    log.error('[Auth] updateProfile avatar upload error:', uploadError)
                    throw new Error(uploadError.message)
                }

                nextMetadata.avatar_path = storagePath
                nextMetadata.avatar_provider_url = null
            }

            const { data, error } = await supabase.auth.updateUser({ data: nextMetadata })
            if (error) {
                log.error('[Auth] updateProfile updateUser error:', error)
                throw new Error(error.message)
            }

            return data.user
        }),

    // Sign up with email and password
    signUp: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(6)
        }))
        .mutation(async ({ input }) => {
            // Rate limit by email to prevent spam
            checkRateLimit(signUpRateLimiter, input.email.toLowerCase())
            log.info('[Auth] Signing up:', input.email)
            const { data, error } = await supabase.auth.signUp({
                email: input.email,
                password: input.password
            })

            if (error) {
                log.error('[Auth] signUp error:', error)
                throw new Error(error.message)
            }

            log.info('[Auth] Sign up successful:', data.user?.id)
            return {
                user: data.user,
                session: data.session
            }
        }),

    // Sign in with email and password
    signIn: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string()
        }))
        .mutation(async ({ input }) => {
            // Rate limit by email to prevent brute force
            checkRateLimit(authRateLimiter, input.email.toLowerCase())
            log.info('[Auth] Signing in:', input.email)
            const { data, error } = await supabase.auth.signInWithPassword({
                email: input.email,
                password: input.password
            })

            if (error) {
                log.error('[Auth] signIn error:', error)
                throw new Error(error.message)
            }

            log.info('[Auth] Sign in successful:', data.user?.id)
            return {
                user: data.user,
                session: data.session
            }
        }),

    // Sign out
    signOut: publicProcedure.mutation(async () => {
        log.info('[Auth] Signing out')
        const { error } = await supabase.auth.signOut()

        if (error) {
            log.error('[Auth] signOut error:', error)
            throw new Error(error.message)
        }

        // Explicitly clear encrypted session storage
        authStorage.clear()

        log.info('[Auth] Sign out successful')
        return { success: true }
    }),

    // ========== Z.AI API Key ==========

    // Set Z.AI API key
    setZaiKey: publicProcedure
        .input(z.object({ key: z.string().nullable() }))
        .mutation(({ input }) => {
            const zaiAuth = getZaiAuthManager()
            zaiAuth.setApiKey(input.key)
            return { success: true }
        }),

    // Clear Z.AI API key
    clearZaiKey: publicProcedure.mutation(() => {
        const zaiAuth = getZaiAuthManager()
        zaiAuth.clear()
        return { success: true }
    }),

    // Request password reset
    resetPassword: publicProcedure
        .input(z.object({
            email: z.string().email()
        }))
        .mutation(async ({ input }) => {
            // Strict rate limit for password resets
            checkRateLimit(passwordResetRateLimiter, input.email.toLowerCase())
            log.info('[Auth] Requesting password reset for:', input.email)
            const { error } = await supabase.auth.resetPasswordForEmail(input.email)

            if (error) {
                log.error('[Auth] resetPassword error:', error)
                throw new Error(error.message)
            }

            return { success: true }
        }),

    // Sign in with OAuth provider (Google, GitHub, etc.)
    signInWithOAuth: publicProcedure
        .input(z.object({
            provider: z.enum(['google', 'github', 'apple'])
        }))
        .mutation(async ({ input }) => {
            // Rate limit OAuth attempts (use provider as key since we don't have user identity yet)
            checkRateLimit(oauthRateLimiter, `oauth:${input.provider}`)
            log.info('[Auth] Starting OAuth flow for:', input.provider)

            const mainWindow = getMainWindow()
            const currentUrl = mainWindow?.webContents.getURL()
            const baseUrl = currentUrl ? new URL(currentUrl).origin : 'http://localhost:5173'
            const redirectTo = baseUrl

            log.info('[Auth] Using redirect URL:', redirectTo)
            
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: input.provider,
                options: {
                    redirectTo,
                    skipBrowserRedirect: true
                }
            })

            if (error) {
                log.error('[Auth] OAuth error:', error)
                throw new Error(error.message)
            }

            // Open OAuth in a new Electron window instead of external browser
            if (data.url) {
                log.info('[Auth] Opening OAuth URL in Electron window')
                
                const authWindow = new BrowserWindow({
                    width: 500,
                    height: 700,
                    parent: mainWindow ?? undefined,
                    modal: true,
                    show: true,
                    webPreferences: {
                        sandbox: true,
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                })

                authWindow.webContents.setWindowOpenHandler(({ url }) => {
                    shell.openExternal(url)
                    return { action: 'deny' }
                })

                authWindow.loadURL(data.url)

                let tokensHandled = false

                function tryHandleOAuthCallback(url: string): boolean {
                    if (tokensHandled) return true
                    if (!url.startsWith(baseUrl) || !url.includes('access_token')) return false
                    const tokens = parseOAuthTokensFromUrl(url)
                    if (!tokens) {
                        log.warn('[Auth] OAuth callback URL missing access_token or refresh_token')
                        return false
                    }
                    tokensHandled = true
                    log.info('[Auth] OAuth tokens extracted, sending to main window')
                    sendToRenderer('auth:oauth-tokens', { access_token: tokens.access_token, refresh_token: tokens.refresh_token })
                    return true
                }

                function finishAndClose(event?: { preventDefault: () => void }) {
                    event?.preventDefault()
                    if (!authWindow.isDestroyed()) authWindow.close()
                }

                // will-redirect: server 302 to our URL (Supabase HTTP redirect)
                authWindow.webContents.on('will-redirect', (event, url) => {
                    log.info('[Auth] OAuth will-redirect to:', url.slice(0, 100) + (url.length > 100 ? '...' : ''))
                    if (tryHandleOAuthCallback(url)) finishAndClose(event)
                })

                // will-navigate: client-side redirect (e.g. Supabase callback page JS: location.href = ...)
                authWindow.webContents.on('will-navigate', (event, url) => {
                    log.info('[Auth] OAuth will-navigate to:', url.slice(0, 100) + (url.length > 100 ? '...' : ''))
                    if (tryHandleOAuthCallback(url)) finishAndClose(event)
                })

                // did-navigate: fallback when redirect wasn't prevented (e.g. preventDefault failed or event order)
                authWindow.webContents.on('did-navigate', (_event, url) => {
                    log.info('[Auth] OAuth did-navigate to:', url.slice(0, 100) + (url.length > 100 ? '...' : ''))
                    if (tryHandleOAuthCallback(url)) finishAndClose()
                })
            }

            return { success: true, url: data.url }
        }),

    // Exchange OAuth code for session (called after deep link callback)
    exchangeCodeForSession: publicProcedure
        .input(z.object({
            code: z.string()
        }))
        .mutation(async ({ input }) => {
            log.info('[Auth] Exchanging code for session')
            
            const { data, error } = await supabase.auth.exchangeCodeForSession(input.code)

            if (error) {
                log.error('[Auth] Exchange code error:', error)
                throw new Error(error.message)
            }

            log.info('[Auth] OAuth sign in successful:', data.user?.id)
            return {
                user: data.user,
                session: data.session
            }
        }),

    // Set session from OAuth tokens (for hash fragment flow)
    setSession: publicProcedure
        .input(z.object({
            access_token: z.string(),
            refresh_token: z.string()
        }))
        .mutation(async ({ input }) => {
            log.info('[Auth] Setting session from tokens...')
            
            const { data, error } = await supabase.auth.setSession({
                access_token: input.access_token,
                refresh_token: input.refresh_token
            })

            if (error) {
                log.error('[Auth] setSession error:', error)
                throw new Error(error.message)
            }

            log.info('[Auth] Session set successfully, user:', data.user?.id)
            
            // Verify session is retrievable
            const { data: { session: verifySession } } = await supabase.auth.getSession()
            log.info('[Auth] Verification after setSession - user:', verifySession?.user?.id)
            
            return {
                user: data.user,
                session: data.session
            }
        }),

    // ========== Claude Code OAuth ==========

    // Get Claude Code connection status
    getClaudeCodeStatus: publicProcedure.query(() => {
        const authManager = getClaudeCodeAuthManager()
        const credentials = authManager.getCredentials()
        return {
            isConnected: authManager.isConnected(),
            source: credentials?.source,
            connectedAt: credentials?.connectedAt
        }
    }),

    // Start Claude Code OAuth flow
    connectClaudeCode: protectedProcedure.mutation(() => {
        const authManager = getClaudeCodeAuthManager()
        const mainWindow = BrowserWindow.getAllWindows()[0] || null
        authManager.startAuthFlow(mainWindow)
        return { started: true }
    }),

    // Complete OAuth with authorization code
    completeClaudeCodeAuth: publicProcedure
        .input(z.object({ code: z.string() }))
        .mutation(async ({ input }) => {
            const authManager = getClaudeCodeAuthManager()
            const credentials = await authManager.exchangeCode(input.code)
            return {
                success: true,
                connectedAt: credentials.connectedAt
            }
        }),

    // Disconnect Claude Code
    disconnectClaudeCode: protectedProcedure.mutation(() => {
        const authManager = getClaudeCodeAuthManager()
        authManager.disconnect()
        return { success: true }
    }),

    // ========== ChatGPT Plus/Pro OAuth (Codex Flow) ==========

    // Get ChatGPT Plus connection status
    getChatGPTStatus: publicProcedure.query(() => {
        const authManager = getChatGPTAuthManager()
        const credentials = authManager.getCredentials()
        return {
            isConnected: authManager.isConnected(),
            email: credentials?.email,
            connectedAt: credentials?.connectedAt,
            accountId: credentials?.accountId
        }
    }),

    // Get available ChatGPT Codex models
    getChatGPTModels: publicProcedure.query(() => {
        return CHATGPT_CODEX_MODELS
    }),

    // Start ChatGPT Plus OAuth flow with PKCE
    connectChatGPT: protectedProcedure.mutation(async () => {
        const authManager = getChatGPTAuthManager()
        const mainWindow = BrowserWindow.getAllWindows()[0] || null
        await authManager.startAuthFlow(mainWindow)
        return { started: true }
    }),

    // Refresh ChatGPT access token
    refreshChatGPTToken: publicProcedure.mutation(async () => {
        const authManager = getChatGPTAuthManager()
        const success = await authManager.refresh()
        return { success }
    }),

    // Get ChatGPT access token (for AI requests)
    getChatGPTToken: publicProcedure.query(() => {
        const authManager = getChatGPTAuthManager()
        return {
            accessToken: authManager.getAccessToken(),
            accountId: authManager.getAccountId(),
            inferenceEndpoint: authManager.getInferenceEndpoint()
        }
    }),

    // Disconnect from ChatGPT Plus
    disconnectChatGPT: protectedProcedure.mutation(() => {
        const authManager = getChatGPTAuthManager()
        authManager.disconnect()
        return { success: true }
    }),

    // ========== Gemini Advanced / Google One OAuth - DISABLED ==========
    // OAuth token from Gemini CLI is incompatible with generativelanguage.googleapis.com
    // Would require Cloud Code Assist API (cloudcode-pa.googleapis.com) with different format

    // Get Gemini connection status - always returns disconnected
    getGeminiStatus: publicProcedure.query(() => {
        // const authManager = getGeminiAuthManager()
        // const credentials = authManager.getCredentials()
        return {
            isConnected: false, // DISABLED
            email: undefined,
            connectedAt: undefined
        }
    }),

    // Start Gemini OAuth flow - disabled
    connectGemini: protectedProcedure.mutation(async () => {
        // const authManager = getGeminiAuthManager()
        // const mainWindow = BrowserWindow.getAllWindows()[0] || null
        // await authManager.startAuthFlow(mainWindow)
        throw new Error('Gemini Advanced is currently disabled. OAuth token incompatible with API endpoint.')
    }),

    // Disconnect from Gemini - no-op
    disconnectGemini: protectedProcedure.mutation(() => {
        // const authManager = getGeminiAuthManager()
        // authManager.disconnect()
        return { success: true }
    })
})
