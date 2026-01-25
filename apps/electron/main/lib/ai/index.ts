/**
 * AI Module - Centralized Exports
 * 
 * This module provides a clean, organized interface for all AI-related functionality.
 * Use these exports instead of importing from individual files.
 */

// BlockNote AI Server (HTTP server for BlockNote AI extension)
export {
  startAIServer,
  stopAIServer,
  getAIServerPort,
  waitForAIServerReady,
  clearClientCache,
} from './blocknote-server'

// AI Providers (OpenAI, ChatGPT Plus, Z.AI)
export {
  getSagiProviderRegistry,
  getLanguageModel,
  isProviderAvailable,
  getProviderStatus,
  invalidateProviderRegistry,
} from './providers'

// OpenAI File Service (for vector stores and file uploads)
export { OpenAIFileService } from './openai-files'
export type { OpenAIFileServiceConfig } from './openai-files'

// Image Processing
export {
  processBase64Image,
  isProcessableImage,
  getExtensionForFormat,
} from './image-processor'
export type {
  ImageProcessingOptions,
  ProcessedImage,
} from './image-processor'

// Streaming utilities
export * from './streaming'

// Suggestions
export { generateSuggestions } from './suggestions'

// Agent
export * from './agent'

// Batch Service
export * from './batch-service'
