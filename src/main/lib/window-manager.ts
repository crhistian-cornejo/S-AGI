import { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow) {
    mainWindow = window
}

export function getMainWindow(): BrowserWindow | null {
    return mainWindow
}

export function sendToRenderer(channel: string, ...args: any[]) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args)
    }
}
