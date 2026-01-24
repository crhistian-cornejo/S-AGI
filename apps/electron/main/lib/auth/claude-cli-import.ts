/**
 * Claude CLI Credential Import
 *
 * Imports existing Claude OAuth credentials from the Claude Code CLI.
 * Reads from platform-specific system credential stores:
 * - macOS: Keychain
 * - Windows: ~/.claude/.credentials.json
 * - Linux: secret-tool (libsecret) or pass (password-store)
 *
 * Based on patterns from craft-agents-oss
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import log from 'electron-log'

interface ClaudeCliCredentials {
    claudeAiOauth?: {
        accessToken: string
        refreshToken?: string
        expiresAt?: number
        scopes?: string[]
    }
}

export interface ImportedClaudeCredentials {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
    scopes?: string[]
}

/**
 * Read Claude OAuth credentials from system credential store
 * Dispatches to platform-specific implementation
 */
function readFromKeychain(): ImportedClaudeCredentials | null {
    if (process.platform === 'darwin') {
        return readFromMacOSKeychain()
    } else if (process.platform === 'win32') {
        return readFromWindowsCredentialManager()
    } else if (process.platform === 'linux') {
        return readFromLinuxSecretService()
    }
    return null
}

/**
 * Read Claude OAuth credentials from macOS Keychain
 */
function readFromMacOSKeychain(): ImportedClaudeCredentials | null {
    try {
        const result = execSync(
            'security find-generic-password -s "Claude Code-credentials" -w',
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim()

        if (result) {
            const credentials: ClaudeCliCredentials = JSON.parse(result)
            if (credentials.claudeAiOauth) {
                log.info('[ClaudeCliImport] Found credentials in macOS Keychain')
                return {
                    accessToken: credentials.claudeAiOauth.accessToken,
                    refreshToken: credentials.claudeAiOauth.refreshToken,
                    expiresAt: credentials.claudeAiOauth.expiresAt,
                    scopes: credentials.claudeAiOauth.scopes,
                }
            }
        }
    } catch (error) {
        log.debug('[ClaudeCliImport] macOS Keychain entry not found or parse error:', error)
    }
    return null
}

/**
 * Read Claude OAuth credentials from Windows Credential Manager
 * Falls back to credentials file which Claude Code uses on Windows
 */
function readFromWindowsCredentialManager(): ImportedClaudeCredentials | null {
    try {
        // Read from the credentials file location that Claude Code uses on Windows
        const credentialsPath = join(homedir(), '.claude', '.credentials.json')
        if (existsSync(credentialsPath)) {
            const content = readFileSync(credentialsPath, 'utf-8')
            const credentials: ClaudeCliCredentials = JSON.parse(content)
            if (credentials.claudeAiOauth) {
                log.info('[ClaudeCliImport] Found credentials in Windows credentials file')
                return {
                    accessToken: credentials.claudeAiOauth.accessToken,
                    refreshToken: credentials.claudeAiOauth.refreshToken,
                    expiresAt: credentials.claudeAiOauth.expiresAt,
                    scopes: credentials.claudeAiOauth.scopes,
                }
            }
        }
    } catch (error) {
        log.debug('[ClaudeCliImport] Windows Credential Manager read failed:', error)
    }
    return null
}

/**
 * Read Claude OAuth credentials from Linux Secret Service (libsecret)
 * Uses secret-tool CLI which interfaces with GNOME Keyring or KDE Wallet
 */
function readFromLinuxSecretService(): ImportedClaudeCredentials | null {
    // Try secret-tool (works with GNOME Keyring, KDE Wallet via libsecret)
    try {
        const result = execSync(
            'secret-tool lookup service "Claude Code" account "credentials" 2>/dev/null',
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim()

        if (result) {
            const credentials: ClaudeCliCredentials = JSON.parse(result)
            if (credentials.claudeAiOauth) {
                log.info('[ClaudeCliImport] Found credentials via secret-tool')
                return {
                    accessToken: credentials.claudeAiOauth.accessToken,
                    refreshToken: credentials.claudeAiOauth.refreshToken,
                    expiresAt: credentials.claudeAiOauth.expiresAt,
                    scopes: credentials.claudeAiOauth.scopes,
                }
            }
        }
    } catch (error) {
        log.debug('[ClaudeCliImport] secret-tool not available or entry not found:', error)
    }

    // Fallback: try pass (password-store)
    try {
        const result = execSync(
            'pass show claude-code/credentials 2>/dev/null',
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim()

        if (result) {
            const credentials: ClaudeCliCredentials = JSON.parse(result)
            if (credentials.claudeAiOauth) {
                log.info('[ClaudeCliImport] Found credentials via pass')
                return {
                    accessToken: credentials.claudeAiOauth.accessToken,
                    refreshToken: credentials.claudeAiOauth.refreshToken,
                    expiresAt: credentials.claudeAiOauth.expiresAt,
                    scopes: credentials.claudeAiOauth.scopes,
                }
            }
        }
    } catch (error) {
        log.debug('[ClaudeCliImport] pass not available or entry not found:', error)
    }

    // Final fallback: credentials file
    return readFromCredentialsFile()
}

/**
 * Read Claude OAuth credentials from credentials file (Linux/fallback)
 */
function readFromCredentialsFile(): ImportedClaudeCredentials | null {
    const credentialsPath = join(homedir(), '.claude', '.credentials.json')

    try {
        if (existsSync(credentialsPath)) {
            const content = readFileSync(credentialsPath, 'utf-8')
            const credentials: ClaudeCliCredentials = JSON.parse(content)
            if (credentials.claudeAiOauth) {
                log.info('[ClaudeCliImport] Found credentials in credentials file')
                return {
                    accessToken: credentials.claudeAiOauth.accessToken,
                    refreshToken: credentials.claudeAiOauth.refreshToken,
                    expiresAt: credentials.claudeAiOauth.expiresAt,
                    scopes: credentials.claudeAiOauth.scopes,
                }
            }
        }
    } catch (error) {
        log.debug('[ClaudeCliImport] Credentials file not found or parse error:', error)
    }
    return null
}

/**
 * Get existing Claude OAuth credentials from keychain or credentials file
 */
export function getExistingClaudeCredentials(): ImportedClaudeCredentials | null {
    // Try keychain first (macOS, Windows, Linux)
    const keychainCreds = readFromKeychain()
    if (keychainCreds) {
        return keychainCreds
    }

    // Fall back to credentials file
    return readFromCredentialsFile()
}

/**
 * Get existing Claude OAuth token from keychain or credentials file
 * @deprecated Use getExistingClaudeCredentials() to get full credentials with refresh token
 */
export function getExistingClaudeToken(): string | null {
    const creds = getExistingClaudeCredentials()
    return creds?.accessToken || null
}

/**
 * Check if token is expired or will expire soon (within 5 minutes)
 */
export function isTokenExpired(expiresAt?: number): boolean {
    if (!expiresAt) {
        // If no expiry, assume token is still valid
        return false
    }
    // Consider expired if less than 5 minutes remaining
    const bufferMs = 5 * 60 * 1000
    return Date.now() + bufferMs >= expiresAt
}

/**
 * Check if Claude CLI is installed (cross-platform)
 */
export function isClaudeCliInstalled(): boolean {
    try {
        const home = homedir()
        const extendedPaths = [
            '/opt/homebrew/bin',
            '/usr/local/bin',
            `${home}/.local/bin`,
            `${home}/.bun/bin`,
            `${home}/.cargo/bin`,
            '/opt/local/bin',
        ]

        const currentPath = process.env.PATH || ''
        const fullPath = [...extendedPaths, ...currentPath.split(process.platform === 'win32' ? ';' : ':')].join(process.platform === 'win32' ? ';' : ':')

        const command = process.platform === 'win32' ? 'where claude' : 'which claude'

        execSync(command, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PATH: fullPath }
        })
        return true
    } catch {
        return false
    }
}

/**
 * Check if Claude CLI credentials are available
 */
export function hasClaudeCliCredentials(): boolean {
    const creds = getExistingClaudeCredentials()
    return creds !== null && !!creds.accessToken
}
