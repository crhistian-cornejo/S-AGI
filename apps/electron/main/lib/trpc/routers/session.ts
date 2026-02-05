/**
 * Session Sharing tRPC Router
 * Handles session sharing operations (start/stop sharing, get status)
 */

import { z } from 'zod'
import { publicProcedure, router } from '../trpc'
import {
  startSessionServer,
  stopSessionServer,
  startNgrokTunnel,
  stopNgrokTunnel,
  updateSessionState,
  addMessage,
  updateTheme,
  broadcastTyping,
  getServerStatus,
  type ChatMessage,
  type SessionState
} from '../../session-server/session-server'
import { observable } from '@trpc/server/observable'
import { EventEmitter } from 'events'

// Event emitter for subscription updates
const sessionEvents = new EventEmitter()

// Schemas
const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.string()
})

const sessionStateSchema = z.object({
  chatId: z.string(),
  chatTitle: z.string(),
  messages: z.array(chatMessageSchema),
  hostName: z.string(),
  theme: z.enum(['light', 'dark'])
})

export const sessionRouter = router({
  /**
   * Start sharing a session
   */
  startSharing: publicProcedure
    .input(z.object({
      sessionState: sessionStateSchema,
      port: z.number().optional(),
      useNgrok: z.boolean().optional(),
      ngrokAuthToken: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      const { sessionState, port, useNgrok, ngrokAuthToken } = input

      // Start the local server
      const { localUrl, port: actualPort } = await startSessionServer(port)

      // Set initial session state
      updateSessionState(sessionState as SessionState)

      let ngrokUrl: string | null = null

      // Optionally start ngrok tunnel
      if (useNgrok) {
        try {
          ngrokUrl = await startNgrokTunnel(ngrokAuthToken)
        } catch (error) {
          console.error('Failed to start ngrok tunnel:', error)
          // Don't fail the whole operation, just continue without ngrok
        }
      }

      sessionEvents.emit('statusUpdate')

      return {
        success: true,
        localUrl,
        ngrokUrl,
        port: actualPort
      }
    }),

  /**
   * Stop sharing a session
   */
  stopSharing: publicProcedure
    .mutation(async () => {
      await stopSessionServer()
      sessionEvents.emit('statusUpdate')
      return { success: true }
    }),

  /**
   * Enable ngrok tunnel for an active session
   */
  enableNgrok: publicProcedure
    .input(z.object({
      authToken: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      const ngrokUrl = await startNgrokTunnel(input.authToken)
      sessionEvents.emit('statusUpdate')
      return { ngrokUrl }
    }),

  /**
   * Disable ngrok tunnel
   */
  disableNgrok: publicProcedure
    .mutation(async () => {
      await stopNgrokTunnel()
      sessionEvents.emit('statusUpdate')
      return { success: true }
    }),

  /**
   * Get current sharing status
   */
  getStatus: publicProcedure
    .query(() => {
      return getServerStatus()
    }),

  /**
   * Check if currently sharing
   */
  isSharing: publicProcedure
    .query(() => {
      return getServerStatus().isSharing
    }),

  /**
   * Add a new message to the shared session
   */
  addMessage: publicProcedure
    .input(chatMessageSchema)
    .mutation(({ input }) => {
      addMessage(input as ChatMessage)
      return { success: true }
    }),

  /**
   * Update theme for shared session
   */
  updateTheme: publicProcedure
    .input(z.object({
      theme: z.enum(['light', 'dark'])
    }))
    .mutation(({ input }) => {
      updateTheme(input.theme)
      return { success: true }
    }),

  /**
   * Broadcast typing indicator
   */
  setTyping: publicProcedure
    .input(z.object({
      isTyping: z.boolean(),
      role: z.enum(['user', 'assistant'])
    }))
    .mutation(({ input }) => {
      broadcastTyping(input.isTyping, input.role)
      return { success: true }
    }),

  /**
   * Update full session state
   */
  updateState: publicProcedure
    .input(sessionStateSchema)
    .mutation(({ input }) => {
      updateSessionState(input as SessionState)
      return { success: true }
    }),

  /**
   * Subscribe to status updates
   */
  onStatusUpdate: publicProcedure
    .subscription(() => {
      return observable<ReturnType<typeof getServerStatus>>((emit) => {
        const handler = () => {
          emit.next(getServerStatus())
        }

        sessionEvents.on('statusUpdate', handler)

        // Send initial status
        handler()

        return () => {
          sessionEvents.off('statusUpdate', handler)
        }
      })
    })
})

export type SessionRouter = typeof sessionRouter
