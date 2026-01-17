import { app, shell, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createIPCHandler } from 'trpc-electron/main'
import { appRouter } from './lib/trpc'
import { createContext } from './lib/trpc/trpc'
import { supabase } from './lib/supabase/client'
import log from 'electron-log'


// Load the renderer
if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
} else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

// Open devtools in development
if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
}


// Initialize tRPC IPC handler
function setupTRPC(): void {
    createIPCHandler({ router: appRouter, createContext })
}

// Handle deep links - parse OAuth tokens from URL
function handleDeepLink(url: string) {
    log.info('[DeepLink] Received:', url)

    if (!url.startsWith('s-agi://auth/callback')) return

    try {
        // Parse the URL - handle both hash fragments (#) and query params (?)
        const urlObj = new URL(url)

        // Check for authorization code flow (code in query params)
        const code = urlObj.searchParams.get('code')
        if (code) {
            log.info('[DeepLink] Got authorization code')
            mainWindow?.webContents.send('auth:callback', { type: 'code', code })
            mainWindow?.focus()
            return
        }

        // Check for implicit flow (tokens in hash fragment)
        // Hash is everything after #, parse it like query params
        const hashParams = new URLSearchParams(url.split('#')[1] || '')
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken) {
            log.info('[DeepLink] Got access token from implicit flow')
            mainWindow?.webContents.send('auth:callback', {
                type: 'tokens',
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: hashParams.get('expires_at'),
                provider_token: hashParams.get('provider_token')
            })
            mainWindow?.focus()
            return
        }

        log.warn('[DeepLink] No auth data found in URL')
    } catch (error) {
        log.error('[DeepLink] Error parsing URL:', error)
    }
}

// Windows/Linux: Handle deep links via second-instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (_event, commandLine) => {
        // Find the deep link URL in command line args
        const url = commandLine.find(arg => arg.startsWith('s-agi://'))
        if (url) {
            handleDeepLink(url)
        }

        // Focus the main window
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })
}

// macOS: Handle deep links when app is already running
app.on('open-url', (event, url) => {
    event.preventDefault()
    handleDeepLink(url)
})

// Register protocol for deep links
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('s-agi', process.execPath, [process.argv[1]])
    }
} else {
    app.setAsDefaultProtocolClient('s-agi')
}

// App lifecycle
app.whenReady().then(() => {
    // Set app user model id for Windows
    electronApp.setAppUserModelId('com.sagi')

    // Watch shortcuts in development
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // Setup tRPC
    setupTRPC()

    // Create window
    createWindow()

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// IPC handlers for window controls
ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow?.unmaximize()
    } else {
        mainWindow?.maximize()
    }
})

ipcMain.handle('window:close', () => {
    mainWindow?.close()
})

ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
})

ipcMain.handle('auth:set-session', async (_, session: any) => {
    log.info('[Auth] Synchronizing session from renderer, has tokens:', !!session?.access_token)
    try {
        if (session && session.access_token && session.refresh_token) {
            const { data, error } = await supabase.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token
            })
            if (error) throw error
            log.info('[Auth] Session synchronized successfully, user:', data.user?.id?.substring(0, 8) + '...')

            // Verify it persisted
            const { data: { session: verifySession } } = await supabase.auth.getSession()
            log.info('[Auth] Verification - session exists:', !!verifySession, 'user:', verifySession?.user?.id?.substring(0, 8) + '...')
        } else {
            await supabase.auth.signOut()
            log.info('[Auth] Session cleared (sign out)')
        }
        return { success: true }
    } catch (error) {
        log.error('[Auth] Failed to synchronize session:', error)
        return { success: false, error: (error as Error).message }
    }
})

ipcMain.handle('theme:get', () => {
    return nativeTheme.themeSource
})

ipcMain.handle('theme:set', (_, theme: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = theme
    return nativeTheme.shouldUseDarkColors
})
