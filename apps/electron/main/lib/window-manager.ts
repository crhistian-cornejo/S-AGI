import { BrowserWindow } from 'electron'
import log from 'electron-log'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow) {
    mainWindow = window
    log.info('[WindowManager] Main window registered')
}

export function getMainWindow(): BrowserWindow | null {
    return mainWindow
}

export function sendToRenderer(channel: string, ...args: any[]) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args)
    } else {
        log.warn('[WindowManager] Cannot send to renderer - no window available')
    }
}
