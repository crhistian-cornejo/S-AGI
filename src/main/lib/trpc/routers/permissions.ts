/**
 * Permissions Router
 *
 * tRPC endpoints for the 3-level permission system.
 * Manages session-based permission modes and command approval.
 *
 * Based on craft-agents-oss architecture patterns.
 */

import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import {
    getSessionMode,
    setSessionMode,
    getDefaultPermissionMode,
    setDefaultPermissionMode,
    checkBashPermission,
    checkToolPermission,
    approveCommand,
    denyCommand,
    getSessionPermissionSummary,
    clearSessionState,
    PERMISSION_MODE_INFO,
    PERMISSION_MODE_ORDER
} from '../../shared/agent'

const permissionModeSchema = z.enum(['safe', 'ask', 'allow-all'])

export const permissionsRouter = router({
    /**
     * Get available permission modes with their info
     */
    getModes: publicProcedure.query(() => {
        return {
            modes: PERMISSION_MODE_ORDER,
            info: PERMISSION_MODE_INFO,
            defaultMode: getDefaultPermissionMode()
        }
    }),

    /**
     * Get current permission mode for a session
     */
    getSessionMode: publicProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ input }) => {
            const mode = getSessionMode(input.sessionId)
            const summary = getSessionPermissionSummary(input.sessionId)
            return {
                ...summary,
                currentMode: mode,
                modeInfo: PERMISSION_MODE_INFO[mode]
            }
        }),

    /**
     * Set permission mode for a session
     */
    setSessionMode: publicProcedure
        .input(z.object({
            sessionId: z.string(),
            mode: permissionModeSchema
        }))
        .mutation(({ input }) => {
            setSessionMode(input.sessionId, input.mode)
            return {
                success: true,
                mode: input.mode,
                modeInfo: PERMISSION_MODE_INFO[input.mode]
            }
        }),

    /**
     * Set default permission mode for new sessions
     */
    setDefaultMode: publicProcedure
        .input(z.object({ mode: permissionModeSchema }))
        .mutation(({ input }) => {
            setDefaultPermissionMode(input.mode)
            return {
                success: true,
                defaultMode: input.mode
            }
        }),

    /**
     * Check if a bash command is allowed
     */
    checkBashCommand: publicProcedure
        .input(z.object({
            sessionId: z.string(),
            command: z.string()
        }))
        .query(({ input }) => {
            return checkBashPermission(input.sessionId, input.command)
        }),

    /**
     * Check if a tool call is allowed
     */
    checkToolCall: publicProcedure
        .input(z.object({
            sessionId: z.string(),
            toolName: z.string(),
            args: z.record(z.unknown()).optional()
        }))
        .query(({ input }) => {
            return checkToolPermission(input.sessionId, input.toolName, input.args)
        }),

    /**
     * Approve a command for this session
     */
    approveCommand: publicProcedure
        .input(z.object({
            sessionId: z.string(),
            command: z.string()
        }))
        .mutation(({ input }) => {
            approveCommand(input.sessionId, input.command)
            return { success: true }
        }),

    /**
     * Deny a command for this session
     */
    denyCommand: publicProcedure
        .input(z.object({
            sessionId: z.string(),
            command: z.string()
        }))
        .mutation(({ input }) => {
            denyCommand(input.sessionId, input.command)
            return { success: true }
        }),

    /**
     * Clear permission state for a session
     */
    clearSession: publicProcedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(({ input }) => {
            clearSessionState(input.sessionId)
            return { success: true }
        }),

    /**
     * Get permission summary for a session
     */
    getSummary: publicProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ input }) => {
            return getSessionPermissionSummary(input.sessionId)
        })
})
