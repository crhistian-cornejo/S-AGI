/**
 * AI Module Index
 *
 * This module re-exports from the legacy ai.ts file and the new
 * modular structure. The goal is to provide a clean import path
 * while maintaining backward compatibility.
 *
 * Migration Status:
 * - [x] constants.ts - System prompts and configuration extracted
 * - [x] helpers.ts - Error handling and retry logic extracted
 * - [x] schema.ts - Zod to JSON Schema conversion extracted
 * - [ ] tools.ts - Tool building functions (TODO: extract from legacy)
 * - [ ] messages.ts - Message conversion (TODO: extract from legacy)
 * - [ ] router.ts - Main router (currently in legacy ai.ts)
 *
 * Import from this module for new code:
 *   import { aiRouter } from './ai'
 *
 * The utilities can also be imported directly:
 *   import { withRetry } from './ai/helpers'
 *   import { SYSTEM_PROMPT } from './ai/constants'
 */

// Re-export constants
export {
  MAX_AGENT_STEPS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  FLEX_REQUEST_TIMEOUT_MS,
  RETRY_DELAYS_MS,
  MAX_JITTER_MS,
  AUTO_TITLE_MAX_LENGTH,
  ZAI_GENERAL_BASE_URL,
  ZAI_CODING_BASE_URL,
  ZAI_SOURCE_HEADER,
  SYSTEM_PROMPT,
  PLAN_MODE_SYSTEM_PROMPT,
  MINIMAL_SPREADSHEET_TOOLS,
  MINIMAL_DOCUMENT_TOOLS,
  MINIMAL_CHART_TOOLS,
} from "./constants";

// Re-export helpers
export {
  isZaiBillingError,
  isRetryableError,
  getRetryDelayWithJitter,
  sanitizeApiError,
  createRequestSignal,
  withRetry,
  getFallbackTitle,
  pickModeAuto,
  isLikelyCodingPrompt,
} from "./helpers";

// Re-export schema utilities
export {
  zodToJsonSchema,
  convertZodType,
  extractWebSearchDetails,
} from "./schema";

// Re-export router and types from legacy file
// These will be migrated to this module in future refactors
export { aiRouter, type AIStreamEvent } from "../ai";
