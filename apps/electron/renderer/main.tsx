// Buffer polyfill for browser (if needed by other modules)
// Note: SheetJS (xlsx) doesn't require Buffer polyfill, but keeping for compatibility
import './buffer-shim'

// Clipboard polyfill for Electron - enables Univer copy/paste special
// Uses Electron's native clipboard via IPC for reliable cross-platform support
const setupClipboardPolyfill = () => {
  const desktopApi = (window as any).desktopApi

  if (!desktopApi?.clipboard) {
    console.warn('[Clipboard] No desktop API available, using browser clipboard')
    return
  }

  const originalWrite = navigator.clipboard?.write?.bind(navigator.clipboard)
  const originalRead = navigator.clipboard?.read?.bind(navigator.clipboard)
  const originalWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard)
  const originalReadText = navigator.clipboard?.readText?.bind(navigator.clipboard)

  // Override clipboard.write() - used by Univer for copy with formatting
  if (navigator.clipboard) {
    navigator.clipboard.write = async (data: ClipboardItem[]) => {
      try {
        // Try native first
        if (originalWrite) {
          return await originalWrite(data)
        }
      } catch (err) {
        // Fall back to Electron clipboard
        console.log('[Clipboard] Using Electron fallback for write')
        for (const item of data) {
          const types = item.types
          const writeData: { text?: string; html?: string } = {}

          for (const type of types) {
            const blob = await item.getType(type)
            const text = await blob.text()

            if (type === 'text/plain') {
              writeData.text = text
            } else if (type === 'text/html') {
              writeData.html = text
            }
          }

          if (writeData.html || writeData.text) {
            await desktopApi.clipboard.write(writeData)
          }
        }
      }
    }

    // Override clipboard.read() - used by Univer for paste with formatting
    navigator.clipboard.read = async () => {
      try {
        // Try native first
        if (originalRead) {
          return await originalRead()
        }
      } catch (err) {
        // Fall back to Electron clipboard
        console.log('[Clipboard] Using Electron fallback for read')
        const data = await desktopApi.clipboard.read()
        const items: ClipboardItem[] = []

        const blobParts: Record<string, Blob> = {}

        if (data.html) {
          blobParts['text/html'] = new Blob([data.html], { type: 'text/html' })
        }
        if (data.text) {
          blobParts['text/plain'] = new Blob([data.text], { type: 'text/plain' })
        }

        if (Object.keys(blobParts).length > 0) {
          items.push(new ClipboardItem(blobParts))
        }

        return items
      }
      return []
    }

    // Override writeText with fallback
    navigator.clipboard.writeText = async (text: string) => {
      try {
        if (originalWriteText) {
          return await originalWriteText(text)
        }
      } catch {
        await desktopApi.clipboard.writeText(text)
      }
    }

    // Override readText with fallback
    navigator.clipboard.readText = async () => {
      try {
        if (originalReadText) {
          return await originalReadText()
        }
      } catch {
        return await desktopApi.clipboard.readText()
      }
      return ''
    }
  }

  console.log('[Clipboard] Electron clipboard polyfill installed')
}

// Setup clipboard after DOM is ready (desktopApi is exposed via preload)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupClipboardPolyfill)
} else {
  setupClipboardPolyfill()
}

import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

// Note: StrictMode is intentionally disabled because Univer's redi DI system
// doesn't handle the mount→unmount→mount cycle well. The double-invoke causes
// stale DI state that breaks when switching between Sheets and Docs instances.
// This only affects development; production works correctly.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
