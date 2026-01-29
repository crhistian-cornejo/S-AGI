/**
 * Plan Mode Tool Definitions
 * Schema definitions for plan mode execution tools
 */

import { z } from 'zod'

export const PLAN_TOOLS = {
    ExitPlanMode: {
        description: 'Call this tool when you have finished creating the execution plan. Include the complete plan as markdown with numbered steps.',
        inputSchema: z.object({
            plan: z.string().describe('The complete execution plan in markdown format with numbered steps. Each step should describe what will be done.')
        })
    }
} as const

export type PlanToolName = keyof typeof PLAN_TOOLS
