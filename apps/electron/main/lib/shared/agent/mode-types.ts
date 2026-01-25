/**
 * Permission Mode Types
 *
 * Three-level permission system for agent command execution:
 * - safe: Read-only operations, blocks destructive tools
 * - ask: Prompts user for bash commands (default)
 * - allow-all: Auto-approves all commands
 *
 * Based on craft-agents-oss architecture patterns.
 */

/**
 * Permission modes ordered from most restrictive to least restrictive
 */
export type PermissionMode = 'safe' | 'ask' | 'allow-all'

export const PERMISSION_MODE_ORDER: PermissionMode[] = ['safe', 'ask', 'allow-all']

/**
 * Permission mode display information
 */
export const PERMISSION_MODE_INFO: Record<PermissionMode, { label: string; description: string; icon: string }> = {
    safe: {
        label: 'Safe Mode',
        description: 'Read-only operations. Blocks file writes, edits, and destructive commands.',
        icon: 'shield'
    },
    ask: {
        label: 'Ask Mode',
        description: 'Prompts for approval before executing bash commands.',
        icon: 'help-circle'
    },
    'allow-all': {
        label: 'Allow All',
        description: 'Auto-approves all commands. Use with caution.',
        icon: 'zap'
    }
}

/**
 * Tools that are blocked in safe mode
 */
export const SAFE_MODE_BLOCKED_TOOLS = new Set([
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
    'TodoWrite'
])

/**
 * Shell constructs that are always blocked for security
 */
export const BLOCKED_SHELL_CONSTRUCTS = [
    // Output redirects (file overwrites)
    /[>|].*>/,
    />>/,
    /\d+>/,
    // Command substitution (injection risk)
    /\$\(/,
    /`[^`]+`/,
    // Background execution
    /&\s*$/,
    /&\s*\d/,
    // Process substitution
    /<\(/,
    />\(/
]

/**
 * Read-only bash command patterns (allowed in safe mode)
 */
export const READ_ONLY_BASH_PATTERNS: RegExp[] = [
    // File exploration
    /^ls(\s|$)/,
    /^cat\s+/,
    /^head\s+/,
    /^tail\s+/,
    /^less\s+/,
    /^more\s+/,
    /^file\s+/,
    /^wc\s+/,
    /^stat\s+/,
    /^find\s+.*-type\s+[fd]/,
    /^find\s+.*-name\s+/,
    /^tree(\s|$)/,
    /^du\s+/,
    /^df(\s|$)/,

    // Git read operations
    /^git\s+status/,
    /^git\s+log/,
    /^git\s+diff/,
    /^git\s+show/,
    /^git\s+branch(\s+-[avrl]|\s*$)/,
    /^git\s+remote\s+-v/,
    /^git\s+tag(\s+-l|\s*$)/,
    /^git\s+rev-parse/,
    /^git\s+describe/,
    /^git\s+config\s+--get/,
    /^git\s+ls-files/,
    /^git\s+ls-tree/,
    /^git\s+blame/,
    /^git\s+shortlog/,
    /^git\s+reflog/,

    // GitHub CLI read operations
    /^gh\s+pr\s+(list|view|status|checks)/,
    /^gh\s+issue\s+(list|view|status)/,
    /^gh\s+repo\s+(view|list)/,
    /^gh\s+run\s+(list|view)/,
    /^gh\s+workflow\s+(list|view)/,
    /^gh\s+release\s+(list|view)/,
    /^gh\s+api\s+/,

    // Package manager read operations
    /^npm\s+(list|ls|outdated|view|info|search|audit)/,
    /^yarn\s+(list|info|outdated|why)/,
    /^pnpm\s+(list|ls|outdated|why)/,
    /^bun\s+(pm\s+ls)/,
    /^pip\s+(list|show|freeze)/,
    /^pip3\s+(list|show|freeze)/,
    /^cargo\s+(tree|metadata)/,
    /^go\s+(list|mod\s+graph)/,

    // Search tools
    /^grep\s+/,
    /^rg\s+/,
    /^ag\s+/,
    /^ack\s+/,
    /^fd\s+/,

    // System info
    /^uname(\s|$)/,
    /^whoami(\s|$)/,
    /^hostname(\s|$)/,
    /^pwd(\s|$)/,
    /^env(\s|$)/,
    /^printenv/,
    /^echo\s+\$/,
    /^which\s+/,
    /^type\s+/,
    /^whereis\s+/,
    /^id(\s|$)/,
    /^date(\s|$)/,
    /^uptime(\s|$)/,

    // Process info
    /^ps(\s|$)/,
    /^top\s+-[ln]/,
    /^pgrep\s+/,

    // Network info (read-only)
    /^ping\s+-c\s+\d/,
    /^curl\s+.*--head/,
    /^curl\s+-I/,
    /^wget\s+--spider/,

    // Help commands
    /^man\s+/,
    /--help(\s|$)/,
    /-h(\s|$)/,
    /--version(\s|$)/,
    /-v(\s|$)/,
    /-V(\s|$)/
]

/**
 * Patterns for always-blocked commands (dangerous operations)
 */
export const ALWAYS_BLOCKED_PATTERNS: RegExp[] = [
    // Destructive commands
    /^rm\s+-rf\s+\//,
    /^rm\s+-rf\s+~\//,
    /^rm\s+-rf\s+\*/,
    /^sudo\s+rm\s+-rf/,
    /^chmod\s+-R\s+777/,
    /^mkfs\./,
    /^dd\s+if=.*of=\/dev/,
    // Fork bombs
    /:\(\)\{.*\}.*:/,
    /\.\s*\/dev\/null/,
    // Credential theft attempts
    /curl.*\|\s*bash/,
    /wget.*\|\s*bash/,
    /curl.*\|\s*sh/,
    /wget.*\|\s*sh/
]

/**
 * Mode configuration for permission checking
 */
export interface ModeConfig {
    /** Tools that are completely blocked */
    blockedTools: Set<string>
    /** Bash patterns allowed without prompting */
    readOnlyBashPatterns: RegExp[]
    /** MCP tool patterns allowed without prompting */
    readOnlyMcpPatterns: RegExp[]
    /** Whether to prompt for unrecognized bash commands */
    promptForBash: boolean
    /** Whether to prompt for MCP tool calls */
    promptForMcp: boolean
}

/**
 * Safe mode configuration - read-only operations only
 */
export const SAFE_MODE_CONFIG: ModeConfig = {
    blockedTools: SAFE_MODE_BLOCKED_TOOLS,
    readOnlyBashPatterns: READ_ONLY_BASH_PATTERNS,
    readOnlyMcpPatterns: [],
    promptForBash: false, // Blocks non-matching commands
    promptForMcp: false
}

/**
 * Ask mode configuration - prompts for bash commands
 */
export const ASK_MODE_CONFIG: ModeConfig = {
    blockedTools: new Set(),
    readOnlyBashPatterns: READ_ONLY_BASH_PATTERNS,
    readOnlyMcpPatterns: [],
    promptForBash: true,
    promptForMcp: false
}

/**
 * Allow-all mode configuration - auto-approves everything
 */
export const ALLOW_ALL_MODE_CONFIG: ModeConfig = {
    blockedTools: new Set(),
    readOnlyBashPatterns: [],
    readOnlyMcpPatterns: [],
    promptForBash: false,
    promptForMcp: false
}

/**
 * Get mode configuration for a permission mode
 */
export function getModeConfig(mode: PermissionMode): ModeConfig {
    switch (mode) {
        case 'safe':
            return SAFE_MODE_CONFIG
        case 'ask':
            return ASK_MODE_CONFIG
        case 'allow-all':
            return ALLOW_ALL_MODE_CONFIG
        default:
            return ASK_MODE_CONFIG
    }
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
    allowed: boolean
    reason?: string
    requiresPrompt?: boolean
}

/**
 * Session permission state
 */
export interface SessionPermissionState {
    mode: PermissionMode
    sessionId: string
    createdAt: number
    /** Commands that have been approved this session */
    approvedCommands: Set<string>
    /** Commands that have been denied this session */
    deniedCommands: Set<string>
}
