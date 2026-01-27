/**
 * Tool Generators - Generator pattern for streaming artifacts
 *
 * Based on midday patterns for progressive rendering and streaming
 * Enables tools to yield intermediate states as they work
 */

import { z } from 'zod'
import type { ArtifactStage } from './artifact-config'
import type { ToolCategory, ToolDefinition } from './tool-config'

// ============================================================================
// GENERATOR TYPES
// ============================================================================

/**
 * Artifact update yielded during tool execution
 */
export interface ArtifactUpdate {
  type: 'stage' | 'data' | 'progress' | 'citation' | 'error'
  artifactId: string
  stage?: ArtifactStage
  message?: string
  data?: unknown
  progress?: number // 0-100
  citation?: {
    type: 'cell' | 'page' | 'web'
    reference: string
    value?: string | number
  }
  error?: string
}

/**
 * Generator tool result
 */
export interface GeneratorToolResult<T = unknown> {
  success: boolean
  result?: T
  error?: string
  artifactId?: string
  stage?: ArtifactStage
}

/**
 * Generator tool function type
 */
export type GeneratorToolFunction<TInput, TResult> = (
  input: TInput,
  context: ToolGeneratorContext
) => AsyncGenerator<ArtifactUpdate, GeneratorToolResult<TResult>, unknown>

/**
 * Context passed to generator tools
 */
export interface ToolGeneratorContext {
  userId: string
  chatId: string
  artifactId?: string
  onUpdate: (update: ArtifactUpdate) => void
  onStageChange: (stage: ArtifactStage, message?: string) => void
}

// ============================================================================
// GENERATOR TOOL DEFINITION
// ============================================================================

export interface GeneratorToolDefinition<TInput = unknown, TResult = unknown> extends Omit<ToolDefinition, 'inputSchema'> {
  inputSchema: z.ZodType<TInput>
  generator: GeneratorToolFunction<TInput, TResult>
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a stage update
 */
export function* stageUpdate(
  artifactId: string,
  stage: ArtifactStage,
  message?: string
): Generator<ArtifactUpdate, void, unknown> {
  yield {
    type: 'stage',
    artifactId,
    stage,
    message,
  }
}

/**
 * Create a progress update
 */
export function* progressUpdate(
  artifactId: string,
  progress: number,
  message?: string
): Generator<ArtifactUpdate, void, unknown> {
  yield {
    type: 'progress',
    artifactId,
    progress,
    message,
  }
}

/**
 * Create a data update
 */
export function* dataUpdate(
  artifactId: string,
  data: unknown,
  message?: string
): Generator<ArtifactUpdate, void, unknown> {
  yield {
    type: 'data',
    artifactId,
    data,
    message,
  }
}

/**
 * Create a citation update
 */
export function* citationUpdate(
  artifactId: string,
  citation: ArtifactUpdate['citation']
): Generator<ArtifactUpdate, void, unknown> {
  yield {
    type: 'citation',
    artifactId,
    citation,
  }
}

// ============================================================================
// WRAPPER FOR CONVERTING GENERATOR TOOLS TO REGULAR TOOLS
// ============================================================================

/**
 * Wraps a generator tool to work with the AI SDK tool() function
 * Collects all updates and returns the final result
 */
export function wrapGeneratorTool<TInput, TResult>(
  generatorFn: GeneratorToolFunction<TInput, TResult>,
  context: ToolGeneratorContext
): (input: TInput) => Promise<GeneratorToolResult<TResult>> {
  return async (input: TInput): Promise<GeneratorToolResult<TResult>> => {
    const generator = generatorFn(input, context)
    let result: IteratorResult<ArtifactUpdate, GeneratorToolResult<TResult>>

    do {
      result = await generator.next()

      if (!result.done) {
        // Process intermediate update
        const update = result.value
        context.onUpdate(update)

        if (update.type === 'stage' && update.stage) {
          context.onStageChange(update.stage, update.message)
        }
      }
    } while (!result.done)

    return result.value
  }
}

// ============================================================================
// EXAMPLE GENERATOR TOOLS
// ============================================================================

/**
 * Example: Create spreadsheet with progressive stages
 */
export const createSpreadsheetGenerator: GeneratorToolDefinition<
  { title: string; headers: string[]; data?: (string | number | null)[][] },
  { artifactId: string; rowCount: number; columnCount: number }
> = {
  name: 'create_spreadsheet_generator',
  category: 'excel' as ToolCategory,
  description: 'Create a spreadsheet with progressive rendering',
  inputSchema: z.object({
    title: z.string(),
    headers: z.array(z.string()),
    data: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).optional(),
  }),
  requiresApproval: false,
  icon: 'IconTablePlus',
  uiComponent: 'SpreadsheetCreatedTool',
  generator: async function* ({ headers, data }, context) {
    const artifactId = context.artifactId || crypto.randomUUID()

    // Stage: Loading
    yield* stageUpdate(artifactId, 'loading', 'Preparing spreadsheet...')
    yield* progressUpdate(artifactId, 10, 'Creating structure')

    // Build headers
    yield* progressUpdate(artifactId, 30, 'Adding headers')

    // Build data
    if (data && data.length > 0) {
      const totalRows = data.length
      for (let i = 0; i < totalRows; i++) {
        const progress = 30 + Math.floor((i / totalRows) * 40)
        if (i % Math.max(1, Math.floor(totalRows / 10)) === 0) {
          yield* progressUpdate(artifactId, progress, `Adding rows: ${i + 1}/${totalRows}`)
        }
      }
    }

    // Stage: Data Ready
    yield* stageUpdate(artifactId, 'data_ready', 'Data loaded')
    yield* progressUpdate(artifactId, 80, 'Applying formatting')

    // Stage: Complete
    yield* stageUpdate(artifactId, 'complete', 'Spreadsheet ready')
    yield* progressUpdate(artifactId, 100, 'Done')

    return {
      success: true,
      artifactId,
      stage: 'complete' as ArtifactStage,
      result: {
        artifactId,
        rowCount: (data?.length || 0) + 1,
        columnCount: headers.length,
      },
    }
  },
}

/**
 * Example: Analyze data with progressive updates
 */
export const analyzeDataGenerator: GeneratorToolDefinition<
  { range: string; metrics: string[] },
  { summary: string; statistics: Record<string, number> }
> = {
  name: 'analyze_data_generator',
  category: 'excel' as ToolCategory,
  description: 'Analyze data range with progressive updates',
  inputSchema: z.object({
    range: z.string(),
    metrics: z.array(z.string()),
  }),
  requiresApproval: false,
  icon: 'IconChartInfographic',
  uiComponent: 'DataAnalysisTool',
  generator: async function* ({ range, metrics }, context) {
    const artifactId = context.artifactId || crypto.randomUUID()

    // Stage: Loading
    yield* stageUpdate(artifactId, 'loading', 'Starting analysis...')

    // Calculate each metric progressively
    const statistics: Record<string, number> = {}
    const totalMetrics = metrics.length

    for (let i = 0; i < totalMetrics; i++) {
      const metric = metrics[i]
      const progress = Math.floor(((i + 1) / totalMetrics) * 80)

      yield* progressUpdate(artifactId, progress, `Calculating ${metric}...`)

      // Simulate calculation (in real impl, this would read from artifact)
      statistics[metric] = Math.random() * 100

      // Yield partial data
      yield* dataUpdate(artifactId, { partial: true, statistics: { ...statistics } })
    }

    // Stage: Analysis Ready
    yield* stageUpdate(artifactId, 'analysis_ready', 'Analysis complete')
    yield* progressUpdate(artifactId, 100, 'Done')

    return {
      success: true,
      artifactId,
      stage: 'analysis_ready' as ArtifactStage,
      result: {
        summary: `Analysis of ${range}: ${metrics.length} metrics calculated`,
        statistics,
      },
    }
  },
}

// ============================================================================
// REGISTRY
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GENERATOR_TOOLS: Record<string, GeneratorToolDefinition<any, any>> = {
  create_spreadsheet_generator: createSpreadsheetGenerator,
  analyze_data_generator: analyzeDataGenerator,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getGeneratorTool(name: string): GeneratorToolDefinition<any, any> | undefined {
  return GENERATOR_TOOLS[name]
}
