/**
 * Centralized Configuration Exports
 *
 * Based on midday patterns for multi-agent orchestration
 * and Claude for Excel citation system
 */

// Agent Configuration
export {
  type AgentType,
  type AgentStatus,
  type AgentStatusInfo,
  type AgentMetadata,
  type SharedAgentConfig,
  AGENT_METADATA,
  AGENT_INSTRUCTIONS,
  SHARED_AGENT_CONFIG,
  getAgentForMessage,
  getAgentStatusMessage,
  formatContextForAgent
} from './agent-config'

// Artifact Configuration
export {
  type ArtifactType,
  type ArtifactStage,
  type ArtifactMetadata,
  type CellCitation,
  type PageCitation,
  type WebCitation,
  type Citation,
  type SpreadsheetArtifact,
  type DocumentArtifact,
  type PDFArtifact,
  type ChartArtifact,
  STAGE_ORDER,
  ARTIFACT_METADATA,
  TOOL_TO_ARTIFACT_MAP,
  SpreadsheetArtifactSchema,
  DocumentArtifactSchema,
  PDFArtifactSchema,
  ChartArtifactSchema,
  isStageAtLeast,
  getArtifactTypeForTool,
  shouldShowSkeleton,
  getStageProgress,
  getNextStage
} from './artifact-config'

// Tool Configuration
export {
  type ToolCategory,
  type ToolDefinition,
  TOOL_CATEGORY_METADATA,
  EXCEL_TOOLS,
  PDF_TOOLS,
  DOCS_TOOLS,
  UI_TOOLS,
  WEB_TOOLS,
  ALL_TOOLS,
  TOOLS_REQUIRING_CONFIRMATION,
  getToolsByCategory,
  getToolDefinition,
  toolRequiresApproval,
  getToolIcon,
  getToolUIComponent
} from './tool-config'

// Tool Generators (midday pattern for streaming artifacts)
export {
  type ArtifactUpdate,
  type GeneratorToolResult,
  type GeneratorToolFunction,
  type ToolGeneratorContext,
  type GeneratorToolDefinition,
  stageUpdate,
  progressUpdate,
  dataUpdate,
  citationUpdate,
  wrapGeneratorTool,
  createSpreadsheetGenerator,
  analyzeDataGenerator,
  GENERATOR_TOOLS,
  getGeneratorTool
} from './tool-generators'
