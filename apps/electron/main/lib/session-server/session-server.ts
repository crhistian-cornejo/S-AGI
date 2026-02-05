/**
 * Session Sharing Server
 * Express + WebSocket server for sharing S-AGI chat sessions
 */

import express from 'express'
import { createServer, type Server } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import path from 'path'
import log from 'electron-log'
import ngrok from 'ngrok'

// Types
export interface SessionMessage {
  type: 'message' | 'typing' | 'system' | 'init' | 'theme'
  payload: unknown
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export interface SessionState {
  chatId: string
  chatTitle: string
  messages: ChatMessage[]
  hostName: string
  theme: 'light' | 'dark'
}

// Server state
let app: express.Express | null = null
let server: Server | null = null
let wss: WebSocketServer | null = null
let ngrokUrl: string | null = null
let isSharing = false
let currentSessionState: SessionState | null = null
const connectedClients = new Set<WebSocket>()

// Port management
const DEFAULT_PORT = 3456
let currentPort = DEFAULT_PORT

/**
 * Get local network IP address
 */
function getLocalIP(): string {
  const { networkInterfaces } = require('os')
  const nets = networkInterfaces()
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return '127.0.0.1'
}

/**
 * Start the session sharing server
 */
export async function startSessionServer(port: number = DEFAULT_PORT): Promise<{ 
  localUrl: string
  port: number 
}> {
  if (isSharing) {
    throw new Error('Session server is already running')
  }

  currentPort = port
  app = express()

  // Serve static files from public directory
  // electron-vite copies public folder to out/main/lib/session-server/public
  const fs = require('fs')
  
  // Try common paths for dev and production
  const possiblePaths = [
    // Development: __dirname is out/main, public is in lib/session-server/public
    path.join(__dirname, 'lib', 'session-server', 'public'),
    // Production: might be directly in the app resources
    path.join(process.resourcesPath || '', 'app', 'out', 'main', 'lib', 'session-server', 'public'),
    // Fallback: relative to this file's compiled location
    path.join(__dirname, '..', '..', 'apps', 'electron', 'main', 'lib', 'session-server', 'public'),
  ]
  
  let publicPath = ''
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      publicPath = p
      break
    }
  }
  
  if (!publicPath) {
    log.error('[SessionServer] Could not find public folder. Tried:', possiblePaths)
    publicPath = possiblePaths[0] // Use first path anyway for error message
  }
  
  log.info(`[SessionServer] Serving static files from: ${publicPath}`)
  app.use(express.static(publicPath))
  
  // Explicit index.html route as fallback
  app.get('/', (_req, res) => {
    const indexPath = path.join(publicPath, 'index.html')
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath)
    } else {
      res.status(500).send(`Static files not found. Looked in: ${possiblePaths.join(', ')}`)
    }
  })

  // API endpoint to get current session state
  app.get('/api/session', (_req, res) => {
    if (currentSessionState) {
      res.json(currentSessionState)
    } else {
      res.status(404).json({ error: 'No active session' })
    }
  })

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', clients: connectedClients.size })
  })

  // Create HTTP server
  server = createServer(app)

  // Create WebSocket server
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket) => {
    log.info('[SessionServer] Client connected')
    connectedClients.add(ws)

    // Send initial state to new client
    if (currentSessionState) {
      ws.send(JSON.stringify({
        type: 'init',
        payload: currentSessionState
      }))
    }

    // Broadcast updated client count
    broadcastClientCount()

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as SessionMessage
        handleClientMessage(ws, message)
      } catch (err) {
        log.error('[SessionServer] Failed to parse client message:', err)
      }
    })

    ws.on('close', () => {
      log.info('[SessionServer] Client disconnected')
      connectedClients.delete(ws)
      broadcastClientCount()
    })

    ws.on('error', (err) => {
      log.error('[SessionServer] WebSocket error:', err)
      connectedClients.delete(ws)
    })
  })

  // Start listening
  await new Promise<void>((resolve, reject) => {
    server!.listen(port, () => {
      log.info(`[SessionServer] Server started on port ${port}`)
      resolve()
    }).on('error', reject)
  })

  isSharing = true
  const localIP = getLocalIP()
  
  return {
    localUrl: `http://${localIP}:${port}`,
    port
  }
}

/**
 * Stop the session sharing server
 */
export async function stopSessionServer(): Promise<void> {
  if (!isSharing) {
    return
  }

  // Close ngrok tunnel if active
  if (ngrokUrl) {
    await stopNgrokTunnel()
  }

  // Notify all clients that session is ending
  broadcastToAll({
    type: 'system',
    payload: { message: 'Session ended by host' }
  })

  // Close all WebSocket connections
  for (const client of connectedClients) {
    client.close()
  }
  connectedClients.clear()

  // Close WebSocket server
  if (wss) {
    wss.close()
    wss = null
  }

  // Close HTTP server
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve())
    })
    server = null
  }

  app = null
  isSharing = false
  currentSessionState = null
  
  log.info('[SessionServer] Server stopped')
}

/**
 * Start ngrok tunnel for public access
 */
export async function startNgrokTunnel(authToken?: string): Promise<string> {
  if (!isSharing) {
    throw new Error('Session server must be running before starting ngrok tunnel')
  }

  if (ngrokUrl) {
    return ngrokUrl
  }

  try {
    // Set auth token if provided
    if (authToken) {
      await ngrok.authtoken(authToken)
    }

    // Connect ngrok
    ngrokUrl = await ngrok.connect({
      addr: currentPort,
      proto: 'http'
    })

    log.info(`[SessionServer] ngrok tunnel created: ${ngrokUrl}`)
    return ngrokUrl
  } catch (err) {
    log.error('[SessionServer] Failed to create ngrok tunnel:', err)
    throw err
  }
}

/**
 * Stop ngrok tunnel
 */
export async function stopNgrokTunnel(): Promise<void> {
  if (ngrokUrl) {
    await ngrok.disconnect()
    ngrokUrl = null
    log.info('[SessionServer] ngrok tunnel closed')
  }
}

/**
 * Update session state and broadcast to all clients
 */
export function updateSessionState(state: SessionState): void {
  currentSessionState = state
  broadcastToAll({
    type: 'init',
    payload: state
  })
}

/**
 * Add a new message to the session
 */
export function addMessage(message: ChatMessage): void {
  if (currentSessionState) {
    currentSessionState.messages.push(message)
    broadcastToAll({
      type: 'message',
      payload: message
    })
  }
}

/**
 * Update theme
 */
export function updateTheme(theme: 'light' | 'dark'): void {
  if (currentSessionState) {
    currentSessionState.theme = theme
    broadcastToAll({
      type: 'theme',
      payload: { theme }
    })
  }
}

/**
 * Broadcast typing indicator
 */
export function broadcastTyping(isTyping: boolean, role: 'user' | 'assistant'): void {
  broadcastToAll({
    type: 'typing',
    payload: { isTyping, role }
  })
}

/**
 * Get server status
 */
export function getServerStatus(): {
  isSharing: boolean
  localUrl: string | null
  ngrokUrl: string | null
  clientCount: number
} {
  const localIP = getLocalIP()
  return {
    isSharing,
    localUrl: isSharing ? `http://${localIP}:${currentPort}` : null,
    ngrokUrl,
    clientCount: connectedClients.size
  }
}

// ============ Private Helpers ============

function broadcastToAll(message: SessionMessage): void {
  const data = JSON.stringify(message)
  for (const client of connectedClients) {
    if (client.readyState === client.OPEN) {
      client.send(data)
    }
  }
}

function broadcastClientCount(): void {
  broadcastToAll({
    type: 'system',
    payload: { clientCount: connectedClients.size }
  })
}

function handleClientMessage(_ws: WebSocket, message: SessionMessage): void {
  // For now, clients are read-only
  // Future: could allow clients to send messages too
  log.debug('[SessionServer] Received client message:', message.type)
}
