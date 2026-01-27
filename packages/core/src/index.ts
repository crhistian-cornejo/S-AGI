/**
 * @s-agi/core
 *
 * Core types and utilities for S-AGI.
 * This package contains shared type definitions, schemas,
 * and utilities used across the application.
 *
 * Import specific modules via subpath exports:
 *   import type { Chat, Message, Artifact } from '@s-agi/core/types';
 *   import type { AIProvider, ModelDefinition } from '@s-agi/core/types/ai';
 *   import { detectLanguage } from '@s-agi/core/utils';
 *   import { chatSchema, artifactSchema } from '@s-agi/core/schemas';
 *   import { FILE_CONFIG } from '@s-agi/core/file-config';
 */

// Re-export types (primary type definitions)
export * from './types'

// Re-export utilities
export * from './utils'

// Re-export schemas (only schemas, not conflicting types)
export {
    chatMessageSchema,
    chatSchema,
    artifactTypeEnum,
    artifactSchema,
    spreadsheetArtifactSchema,
    chartArtifactSchema,
    generateSpreadsheetToolSchema,
    generateChartToolSchema,
    quickPromptSchema,
    attachmentSchema,
    createChatInputSchema,
    createMessageInputSchema,
    updateChatInputSchema,
    deleteChatInputSchema,
    type ChatMessage,
    type SpreadsheetArtifact,
    type ChartArtifact,
    type QuickPrompt,
    type Attachment,
    type CreateChatInput,
    type CreateMessageInput,
    type UpdateChatInput,
    type DeleteChatInput,
} from './schemas'

// Re-export file configuration
export * from './file-config'

// Re-export agent/artifact/tool configuration (midday patterns)
export {
    // Agent config
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
    formatContextForAgent,
    // Artifact config (prefixed to avoid conflicts with schemas)
    type ArtifactType as ArtifactTypeConfig,
    type ArtifactStage,
    type ArtifactMetadata as ArtifactMetadataConfig,
    type CellCitation,
    type PageCitation,
    type WebCitation,
    type Citation,
    type SpreadsheetArtifact as SpreadsheetArtifactConfig,
    type DocumentArtifact as DocumentArtifactConfig,
    type PDFArtifact as PDFArtifactConfig,
    type ChartArtifact as ChartArtifactConfig,
    STAGE_ORDER,
    ARTIFACT_METADATA,
    TOOL_TO_ARTIFACT_MAP,
    SpreadsheetArtifactSchema as SpreadsheetArtifactConfigSchema,
    DocumentArtifactSchema as DocumentArtifactConfigSchema,
    PDFArtifactSchema as PDFArtifactConfigSchema,
    ChartArtifactSchema as ChartArtifactConfigSchema,
    isStageAtLeast,
    getArtifactTypeForTool,
    shouldShowSkeleton,
    getStageProgress,
    getNextStage,
    // Tool config
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
    getToolUIComponent,
    // Tool generators (midday streaming pattern)
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
} from './config'
