import { app, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createIPCHandler } from 'trpc-electron/main'
import { appRouter } from './lib/trpc'
import { createContext } from './lib/trpc/trpc'
import { supabase } from './lib/supabase/client'
import { setMainWindow } from './lib/window-manager'
import log from 'electron-log'

// Suppress Chromium autofill console errors (cosmetic, not actual errors)
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createTray(): void {
    // macOS: Template images should be PNG for best compatibility
    // Electron auto-selects @2x on Retina if both exist
    const basePath = is.dev 
        ? join(__dirname, '../../src/main')
        : __dirname
    
    const pngPath = join(basePath, 'trayTemplate.png')
    const png2xPath = join(basePath, 'trayTemplate@2x.png')
    const svgPath = join(basePath, 'trayTemplate.svg')
    
    let icon: Electron.NativeImage | null = null
    
    // Best: Load both 1x and 2x PNGs for proper Retina support
    if (existsSync(pngPath) && existsSync(png2xPath)) {
        log.info('[Tray] Loading PNG with @2x variant')
        icon = nativeImage.createFromPath(pngPath)
        // Electron automatically picks up @2x when main file exists
    } else if (existsSync(pngPath)) {
        log.info('[Tray] Loading PNG (no @2x)')
        icon = nativeImage.createFromPath(pngPath)
    } else if (existsSync(svgPath)) {
        log.info('[Tray] Falling back to SVG')
        icon = nativeImage.createFromPath(svgPath)
        // SVG needs resize
        icon = icon.resize({ width: 18, height: 18 })
    }
    
    if (!icon || icon.isEmpty()) {
        log.error('[Tray] No tray icon found at:', basePath)
        icon = nativeImage.createEmpty()
        log.warn('[Tray] Using empty fallback icon')
    }
    
    // macOS: Mark as template so it adapts to dark/light menu bar
    if (process.platform === 'darwin') {
        icon.setTemplateImage(true)
    }
    
    tray = new Tray(icon)
    
    log.info('[Tray] Tray instance created')
    
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Open S-AGI', 
            click: () => {
                mainWindow?.show()
                mainWindow?.focus()
            } 
        },
        { type: 'separator' },
        { 
            label: 'Quit', 
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
                app.quit()
            } 
        }
    ])

    tray.setToolTip('S-AGI Agent')
    tray.setContextMenu(contextMenu)

    // Click behavior differs by platform
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.focus()
            } else {
                mainWindow.show()
                mainWindow.focus()
            }
        }
    })
}

function createWindow(): void {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        show: false,
        autoHideMenuBar: true,
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 12, y: 12 },
        vibrancy: 'under-window',
        visualEffectState: 'active',
        icon: process.platform === 'linux' ? join(__dirname, '../../public/logo.svg') : join(__dirname, '../../public/icon.ico'),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    // Register main window for IPC events (streaming, etc.)
    setMainWindow(mainWindow)

    // Load the renderer
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // Show window when ready
    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    // Open devtools in development
    if (is.dev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
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

    // Create Tray
    createTray()

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

// Haptic feedback handler (macOS only)
// Uses Electron's built-in haptic feedback support on macOS
ipcMain.handle('haptic:perform', (_, type: string) => {
    if (process.platform !== 'darwin') {
        return false
    }
    
    // Map our types to Electron's NSHapticFeedbackPattern names
    // Electron doesn't expose NSHapticFeedbackManager directly, 
    // but we can use BrowserWindow.setVibrancy or native modules
    // For now, we'll use a no-op that can be enhanced with native module
    // like 'electron-osx-haptic' if needed
    
    try {
        // Log the haptic request for debugging
        log.debug(`[Haptic] Requested feedback type: ${type}`)
        
        // Haptic feedback would require a native module like:
        // const { performHapticFeedback } = require('electron-osx-haptic')
        // performHapticFeedback(type)
        
        return true
    } catch (error) {
        log.error('[Haptic] Failed to perform feedback:', error)
        return false
    }
})

