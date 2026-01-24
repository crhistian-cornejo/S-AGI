/**
 * Permission Mode Manager
 *
 * Manages per-session permission modes and command approval.
 * Implements the 3-level permission system (safe/ask/allow-all).
 *
 * Based on craft-agents-oss architecture patterns.
 */

import {
    type PermissionMode,
    type PermissionCheckResult,
    type SessionPermissionState,
    getModeConfig,
    BLOCKED_SHELL_CONSTRUCTS,
    ALWAYS_BLOCKED_PATTERNS,
    READ_ONLY_BASH_PATTERNS,
    SAFE_MODE_BLOCKED_TOOLS
} from './mode-types'

/**
 * Per-session permission state storage
 */
const sessionStates = new Map<string, SessionPermissionState>()

/**
 * Default permission mode for new sessions
 */
let defaultMode: PermissionMode = 'ask'

/**
 * Set the default permission mode for new sessions
 */
export function setDefaultPermissionMode(mode: PermissionMode): void {
    defaultMode = mode
}

/**
 * Get the default permission mode
 */
export function getDefaultPermissionMode(): PermissionMode {
    return defaultMode
}

/**
 * Get or create permission state for a session
 */
export function getSessionState(sessionId: string): SessionPermissionState {
    let state = sessionStates.get(sessionId)
    if (!state) {
        state = {
            mode: defaultMode,
            sessionId,
            createdAt: Date.now(),
            approvedCommands: new Set(),
            deniedCommands: new Set()
        }
        sessionStates.set(sessionId, state)
    }
    return state
}

/**
 * Set permission mode for a session
 */
export function setSessionMode(sessionId: string, mode: PermissionMode): void {
    const state = getSessionState(sessionId)
    state.mode = mode
    // Clear approved/denied commands when mode changes
    state.approvedCommands.clear()
    state.deniedCommands.clear()
}

/**
 * Get current permission mode for a session
 */
export function getSessionMode(sessionId: string): PermissionMode {
    return getSessionState(sessionId).mode
}

/**
 * Clear permission state for a session
 */
export function clearSessionState(sessionId: string): void {
    sessionStates.delete(sessionId)
}

/**
 * Clear all session states
 */
export function clearAllSessionStates(): void {
    sessionStates.clear()
}

/**
 * Normalize a bash command for pattern matching
 */
function normalizeCommand(command: string): string {
    return command.trim().replace(/\s+/g, ' ')
}

/**
 * Check if a command contains blocked shell constructs
 */
function containsBlockedShellConstruct(command: string): { blocked: boolean; reason?: string } {
    for (const pattern of BLOCKED_SHELL_CONSTRUCTS) {
        if (pattern.test(command)) {
            if (/[>|].*>|>>/.test(command)) {
                return { blocked: true, reason: 'Output redirect (file overwrite) detected' }
            }
            if (/\$\(|`[^`]+`/.test(command)) {
                return { blocked: true, reason: 'Command substitution detected (injection risk)' }
            }
            if (/&\s*$|&\s*\d/.test(command)) {
                return { blocked: true, reason: 'Background execution detected' }
            }
            if (/<\(|>\(/.test(command)) {
                return { blocked: true, reason: 'Process substitution detected' }
            }
            return { blocked: true, reason: 'Blocked shell construct detected' }
        }
    }
    return { blocked: false }
}

/**
 * Check if a command matches always-blocked patterns
 */
function isAlwaysBlocked(command: string): { blocked: boolean; reason?: string } {
    for (const pattern of ALWAYS_BLOCKED_PATTERNS) {
        if (pattern.test(command)) {
            return { blocked: true, reason: 'Dangerous command pattern detected' }
        }
    }
    return { blocked: false }
}

/**
 * Check if a command matches read-only patterns
 */
function isReadOnlyCommand(command: string): boolean {
    const normalized = normalizeCommand(command)
    return READ_ONLY_BASH_PATTERNS.some(pattern => pattern.test(normalized))
}

/**
 * Check if a compound command (with pipes, &&, ||) is safe
 */
function isCompoundCommandSafe(command: string): boolean {
    // Split by pipes and logical operators
    const parts = command.split(/\s*(?:\||&&|\|\|)\s*/)

    // All parts must be read-only for the compound command to be safe
    return parts.every(part => {
        const trimmed = part.trim()
        if (!trimmed) return true
        return isReadOnlyCommand(trimmed)
    })
}

/**
 * Check permission for a bash command
 */
export function checkBashPermission(
    sessionId: string,
    command: string
): PermissionCheckResult {
    const state = getSessionState(sessionId)
    const normalized = normalizeCommand(command)

    // Always check for dangerous patterns first
    const alwaysBlocked = isAlwaysBlocked(normalized)
    if (alwaysBlocked.blocked) {
        return {
            allowed: false,
            reason: alwaysBlocked.reason
        }
    }

    // Check for blocked shell constructs in safe/ask modes
    if (state.mode !== 'allow-all') {
        const shellBlocked = containsBlockedShellConstruct(normalized)
        if (shellBlocked.blocked) {
            return {
                allowed: false,
                reason: shellBlocked.reason
            }
        }
    }

    // Allow-all mode: approve everything except always-blocked
    if (state.mode === 'allow-all') {
        return { allowed: true }
    }

    // Check if command was previously approved/denied this session
    if (state.approvedCommands.has(normalized)) {
        return { allowed: true }
    }
    if (state.deniedCommands.has(normalized)) {
        return { allowed: false, reason: 'Previously denied this session' }
    }

    // Check for compound commands
    const isCompound = /\||&&|\|\|/.test(normalized)
    if (isCompound) {
        if (isCompoundCommandSafe(normalized)) {
            return { allowed: true }
        }
        // In ask mode, prompt for non-safe compound commands
        if (state.mode === 'ask') {
            return { allowed: false, requiresPrompt: true, reason: 'Compound command requires approval' }
        }
        // In safe mode, block non-safe compound commands
        return { allowed: false, reason: 'Compound command contains non-read-only operations' }
    }

    // Check read-only patterns
    if (isReadOnlyCommand(normalized)) {
        return { allowed: true }
    }

    // In safe mode, block non-read-only commands
    if (state.mode === 'safe') {
        return {
            allowed: false,
            reason: 'Command not in read-only allowlist (safe mode)'
        }
    }

    // In ask mode, prompt for approval
    return {
        allowed: false,
        requiresPrompt: true,
        reason: 'Command requires user approval'
    }
}

/**
 * Check permission for a tool call
 */
export function checkToolPermission(
    sessionId: string,
    toolName: string,
    _args?: Record<string, unknown>
): PermissionCheckResult {
    const state = getSessionState(sessionId)
    const modeConfig = getModeConfig(state.mode)

    // Allow-all mode: approve everything
    if (state.mode === 'allow-all') {
        return { allowed: true }
    }

    // Check if tool is blocked
    if (modeConfig.blockedTools.has(toolName)) {
        return {
            allowed: false,
            reason: `Tool '${toolName}' is blocked in ${state.mode} mode`
        }
    }

    // Bash tool uses special handling
    if (toolName === 'Bash') {
        // This should be handled by checkBashPermission
        return { allowed: true }
    }

    // Other tools are allowed by default in ask mode
    return { allowed: true }
}

/**
 * Record command approval for a session
 */
export function approveCommand(sessionId: string, command: string): void {
    const state = getSessionState(sessionId)
    const normalized = normalizeCommand(command)
    state.approvedCommands.add(normalized)
    state.deniedCommands.delete(normalized)
}

/**
 * Record command denial for a session
 */
export function denyCommand(sessionId: string, command: string): void {
    const state = getSessionState(sessionId)
    const normalized = normalizeCommand(command)
    state.deniedCommands.add(normalized)
    state.approvedCommands.delete(normalized)
}

/**
 * Check if a tool is a write operation
 */
export function isWriteTool(toolName: string): boolean {
    return SAFE_MODE_BLOCKED_TOOLS.has(toolName)
}

/**
 * Get permission summary for a session
 */
export function getSessionPermissionSummary(sessionId: string): {
    mode: PermissionMode
    approvedCount: number
    deniedCount: number
    createdAt: number
} {
    const state = getSessionState(sessionId)
    return {
        mode: state.mode,
        approvedCount: state.approvedCommands.size,
        deniedCount: state.deniedCommands.size,
        createdAt: state.createdAt
    }
}

/**
 * Export for testing
 */
export const _testing = {
    normalizeCommand,
    containsBlockedShellConstruct,
    isAlwaysBlocked,
    isReadOnlyCommand,
    isCompoundCommandSafe,
    sessionStates
}
