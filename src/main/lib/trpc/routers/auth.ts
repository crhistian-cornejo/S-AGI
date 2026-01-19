import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { getClaudeCodeAuthManager, getChatGPTAuthManager, getZaiAuthManager, CHATGPT_CODEX_MODELS } from '../../auth'
// NOTE: Gemini auth disabled - OAuth token incompatible with generativelanguage.googleapis.com
// import { getClaudeCodeAuthManager, getChatGPTAuthManager, getZaiAuthManager, getGeminiAuthManager, CHATGPT_CODEX_MODELS } from '../../auth'
import { supabase, authStorage } from '../../supabase/client'
import { BrowserWindow, shell } from 'electron'
import log from 'electron-log'

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
        return user
    }),

    // Sign up with email and password
    signUp: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(6)
        }))
        .mutation(async ({ input }) => {
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
            log.info('[Auth] Starting OAuth flow for:', input.provider)
            
            // Get the current renderer URL for redirect
            const mainWindow = BrowserWindow.getAllWindows()[0]
            const currentUrl = mainWindow?.webContents.getURL()
            // Extract base URL (e.g., http://localhost:5173)
            const baseUrl = currentUrl ? new URL(currentUrl).origin : 'http://localhost:5173'
            const redirectTo = baseUrl // Redirect to root, OAuthCallbackHandler will capture the hash
            
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
                    parent: mainWindow,
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

                // Listen for navigation to capture the redirect with tokens
                authWindow.webContents.on('will-redirect', (event, url) => {
                    log.info('[Auth] OAuth redirect to:', url)
                    
                    // Check if this is our redirect URL with tokens
                    if (url.startsWith(baseUrl) && url.includes('access_token')) {
                        event.preventDefault()
                        
                        // Extract hash from URL
                        const urlObj = new URL(url.replace('#', '?')) // Convert hash to query for easier parsing
                        const access_token = urlObj.searchParams.get('access_token')
                        const refresh_token = urlObj.searchParams.get('refresh_token')
                        
                        if (access_token && refresh_token) {
                            // Send tokens to main window
                            mainWindow?.webContents.send('auth:oauth-tokens', {
                                access_token,
                                refresh_token
                            })
                        }
                        
                        authWindow.close()
                    }
                })

                // Also handle did-navigate for hash fragments
                authWindow.webContents.on('did-navigate', (_event, url) => {
                    log.info('[Auth] OAuth navigated to:', url)
                    
                    if (url.startsWith(baseUrl) && url.includes('access_token')) {
                        // Extract hash from URL
                        const hashIndex = url.indexOf('#')
                        if (hashIndex !== -1) {
                            const hash = url.substring(hashIndex + 1)
                            const params = new URLSearchParams(hash)
                            const access_token = params.get('access_token')
                            const refresh_token = params.get('refresh_token')
                            
                            if (access_token && refresh_token) {
                                mainWindow?.webContents.send('auth:oauth-tokens', {
                                    access_token,
                                    refresh_token
                                })
                            }
                        }
                        
                        authWindow.close()
                    }
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
        return {
            isConnected: authManager.isConnected()
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
