/**
 * App-Specific Shared Module
 *
 * Contains app-specific code that can't be in packages/core:
 * - config.ts: Uses Vite's import.meta.env
 * - trpc-types.ts: References app's tRPC router
 *
 * For shared types and utilities, use @s-agi/core:
 *   import type { AIProvider } from '@s-agi/core/types/ai'
 *   import type { Chat, Message } from '@s-agi/core/types'
 *   import { chatSchema } from '@s-agi/core/schemas'
 */

// App configuration (Vite environment variables)
export * from './config'

// tRPC router type (app-specific)
export * from './trpc-types'
