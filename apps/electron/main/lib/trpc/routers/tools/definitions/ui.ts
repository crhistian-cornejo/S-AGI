/**
 * UI Navigation Tool Definitions
 * Schema definitions for application UI control tools
 */

import { z } from 'zod'

export const UI_NAVIGATION_TOOLS = {
    navigate_to_tab: {
        description: 'Navigate to a specific tab in the application. Use this to show the user your work in the appropriate view.',
        inputSchema: z.object({
            tab: z.enum(['chat', 'excel', 'doc', 'gallery']).describe('The tab to navigate to: "chat" for conversations, "excel" for spreadsheets, "doc" for documents, "gallery" for generated images')
        })
    },
    select_artifact: {
        description: 'Select an existing artifact to view or continue editing. The artifact will be displayed in the appropriate panel.',
        inputSchema: z.object({
            artifactId: z.string().describe('ID of the artifact to select'),
            openInFullTab: z.boolean().optional().describe('If true, opens the artifact in full tab view instead of side panel. Default: false')
        })
    },
    get_ui_context: {
        description: 'Get the current UI state including active tab, selected artifact, and available artifacts. Use this to understand the current context before making UI changes.',
        inputSchema: z.object({
            includeArtifactList: z.boolean().optional().describe('If true, includes list of all artifacts for current chat. Default: false')
        })
    }
} as const

export type UIToolName = keyof typeof UI_NAVIGATION_TOOLS
