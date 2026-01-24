/**
 * Shared Module - Cross-Process Types and Configuration
 *
 * This module contains types and utilities shared between
 * main process, renderer process, and preload scripts.
 */

// Application configuration
export * from './config'

// Core types (primary definitions for Chat, Artifact, ArtifactType)
export * from './types'

// AI types and interfaces
export * from './ai-types'

// Hotkey configuration types
export * from './hotkey-types'

// File configuration (size limits, compression, accepted types)
export * from './file-config'

// Language detection utilities
export * from './detect-language'

// Schemas (Zod validation) - excluding types already exported from './types'
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

// tRPC types
export * from './trpc-types'
