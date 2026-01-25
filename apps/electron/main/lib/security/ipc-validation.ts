/**
 * IPC Sender Validation
 * 
 * Security recommendation #17: Validate the sender of all IPC messages
 * 
 * This module provides a helper function to validate that IPC messages
 * come from trusted sources (local files or trusted dev origins).
 */

import { WebContents } from 'electron'
import log from 'electron-log'

/**
 * Get allowed renderer origins (dev server URLs)
 */
function getRendererOrigins(): string[] {
  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    try {
      return [new URL(process.env.ELECTRON_RENDERER_URL).origin]
    } catch {
      return []
    }
  }
  return []
}

/**
 * Validate IPC message sender to ensure it comes from a trusted source
 * Security recommendation #17: Validate the sender of all IPC messages
 */
export function validateIPCSender(sender: WebContents): boolean {
  try {
    const url = sender.getURL()

    // Allow messages from local files
    if (url.startsWith('file://')) {
      return true
    }

    // Allow messages from trusted dev origins
    const rendererOrigins = getRendererOrigins()
    const isTrustedOrigin = rendererOrigins.some((origin) =>
      url.startsWith(origin)
    )

    if (!isTrustedOrigin) {
      log.warn(
        `[Security] IPC message rejected from untrusted origin: ${url}`
      )
      return false
    }

    return true
  } catch (error) {
    log.error('[Security] Error validating IPC sender:', error)
    return false
  }
}
