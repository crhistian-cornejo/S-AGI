import { z } from 'zod'
import log from 'electron-log'
import { sendToRenderer } from '../window-manager'
import type { AIProvider } from '@s-agi/core/types/ai'

/**
 * Maximum number of agent loop steps before stopping
 */
export const MAX_AGENT_STEPS = 15

/**
 * S-AGI System Prompt
 * Optimized for OpenAI's automatic prompt caching (static parts at beginning)
 */
export const SYSTEM_PROMPT = `# S-AGI System Instructions
Version: 2.1.0
Role: AI assistant for spreadsheet creation, document writing, image generation, and web research

================================================================================
CORE IDENTITY
================================================================================

You are S-AGI, a specialized AI assistant designed to help users create, edit, and analyze spreadsheets and documents. You have access to powerful native tools, custom spreadsheet/document operations, UI navigation controls, and image generation capabilities. You can also see and analyze images uploaded by users.

================================================================================
UI NAVIGATION TOOLS
================================================================================

You can control the application UI to provide a seamless experience:

- navigate_to_tab: Switch between tabs (chat, excel, doc, gallery)
  * Use after creating content to show it to the user
  * Example: After creating a spreadsheet, navigate to 'excel' tab

- select_artifact: Select an existing artifact to view or edit
  * Opens the artifact in the side panel or full tab
  * Use to continue editing previous work

- show_notification: Display a notification to the user
  * Use for status updates, confirmations, or alerts

**IMPORTANT: After creating a spreadsheet or document, navigate to the appropriate tab so the user can immediately see and interact with their content.**

================================================================================
RESPONSE STYLE
================================================================================

- Be concise but helpful
- Use Markdown formatting for clarity
- Math: use $...$ (inline) and $$...$$ (block) with LaTeX
- Explain actions before and after tool use
- For spreadsheets: always format headers (bold) and set column widths
- For documents: use clear structure with headings and lists
- Include source URLs when citing web search results
- Acknowledge errors clearly and suggest alternatives

================================================================================
END OF STATIC INSTRUCTIONS
================================================================================
`

/**
 * UI Tool Schemas
 */
export const UI_TOOL_SCHEMAS = {
    navigate_to_tab: {
        description: 'Navigate to a specific application tab. Use after creating content to show it to the user.',
        inputSchema: z.object({
            tab: z.enum(['chat', 'excel', 'doc', 'gallery']).describe('The tab to navigate to'),
            artifactId: z.string().uuid().optional().describe('Optional artifact ID to select after navigation')
        })
    },
    select_artifact: {
        description: 'Select and display an artifact. Opens it in the side panel or full tab view.',
        inputSchema: z.object({
            artifactId: z.string().uuid().describe('ID of the artifact to select'),
            openInFullTab: z.boolean().default(false).describe('Whether to open in full tab view instead of side panel')
        })
    },
    show_notification: {
        description: 'Show a notification message to the user. Use for status updates, confirmations, or alerts.',
        inputSchema: z.object({
            message: z.string().describe('The notification message'),
            type: z.enum(['info', 'success', 'warning', 'error']).default('info').describe('Type of notification'),
            duration: z.number().optional().describe('Duration in milliseconds (default: auto based on type)')
        })
    }
} as const

/**
 * UI Tool Executors
 */
export async function executeNavigateToTab(args: { tab: string; artifactId?: string }) {
    const { tab, artifactId } = args
    log.info(`[Agent] Navigating to tab: ${tab}${artifactId ? `, artifact: ${artifactId}` : ''}`)

    const targetTab = tab === 'excel' ? 'excel' : tab === 'doc' ? 'doc' : tab

    sendToRenderer('ui:navigate-tab', { tab })

    if (artifactId) {
        await new Promise(resolve => setTimeout(resolve, 100))
        sendToRenderer('ui:select-artifact', {
            artifactId,
            openInFullTab: tab !== 'chat',
            targetTab
        })
    }

    return {
        success: true,
        navigatedTo: tab,
        selectedArtifact: artifactId || null,
        message: `Navigated to ${tab} tab${artifactId ? ' and selected artifact' : ''}`
    }
}

export async function executeSelectArtifact(args: { artifactId: string; openInFullTab?: boolean }) {
    const { artifactId, openInFullTab = false } = args
    log.info(`[Agent] Selecting artifact: ${artifactId}, fullTab: ${openInFullTab}`)

    sendToRenderer('ui:select-artifact', {
        artifactId,
        openInFullTab,
        targetTab: undefined
    })

    return {
        success: true,
        artifactId,
        message: `Selected artifact: ${artifactId}`
    }
}

export async function executeShowNotification(args: { message: string; type?: string; duration?: number }) {
    const { message, type = 'info', duration } = args
    log.info(`[Agent] Showing notification: ${type} - ${message}`)

    sendToRenderer('ui:notification', {
        message,
        type,
        duration
    })

    return {
        shown: true,
        message,
        type
    }
}

/**
 * Execute a UI tool by name
 */
export async function executeUITool(name: string, args: unknown): Promise<unknown> {
    switch (name) {
        case 'navigate_to_tab':
            return executeNavigateToTab(args as { tab: string; artifactId?: string })
        case 'select_artifact':
            return executeSelectArtifact(args as { artifactId: string; openInFullTab?: boolean })
        case 'show_notification':
            return executeShowNotification(args as { message: string; type?: string; duration?: number })
        default:
            throw new Error(`Unknown UI tool: ${name}`)
    }
}

/**
 * Context passed to tool execution
 */
export interface AgentToolContext {
    userId: string
    chatId: string
    apiKey?: string
    provider: AIProvider
    baseURL?: string
    headers?: Record<string, string>
}

/**
 * Tools that should require user approval before execution
 */
export const TOOLS_REQUIRING_APPROVAL = new Set([
    'confirm_action',
    'delete_row',
    'delete_column',
    'clear_range'
])

/**
 * Check if a tool requires approval
 */
export function toolRequiresApproval(toolName: string): boolean {
    return TOOLS_REQUIRING_APPROVAL.has(toolName)
}

/**
 * Get the system prompt for a given mode
 */
export function getSystemPrompt(mode: 'agent' | 'plan'): string {
    if (mode === 'plan') {
        return `# S-AGI Planning Mode

You are in PLANNING MODE. Your ONLY job is to create a plan and call the ExitPlanMode tool.

## CRITICAL RULES

1. **NEVER output text directly** - ALL your output MUST be through the ExitPlanMode tool
2. **ALWAYS call ExitPlanMode** - This is mandatory, not optional
3. **Plan only, don't execute** - You're creating a roadmap, not doing the work

## HOW TO RESPOND

When the user asks for something:
1. Think about what steps are needed
2. Create a plan in markdown format
3. Call ExitPlanMode with the plan parameter

## PLAN FORMAT

The plan parameter should be markdown with this structure:

## Summary
[One sentence describing what will be accomplished]

## Steps
1. [First step]
2. [Second step]
...

## Expected Results
[What the user will have when done]

## Potential Issues
[Any complications or edge cases to be aware of]
`
    }

    return SYSTEM_PROMPT
}
