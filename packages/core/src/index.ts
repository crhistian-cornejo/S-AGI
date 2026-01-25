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
