import { setMaxListeners } from "events";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import log from "electron-log";
import { sendToRenderer } from "../../window-manager";
import { supabase } from "../../supabase/client";
import { getStorageAdapter, isLocalStorageMode } from "../../storage";
import { getSecureApiKeyStore } from "../../auth/api-key-store";
import { getChatGPTAuthManager, getClaudeCodeAuthManager } from "../../auth";
import { getCredentialManager } from "../../shared/credentials";
// NOTE: Gemini auth disabled - OAuth token incompatible with generativelanguage.googleapis.com
// import { getChatGPTAuthManager, getGeminiAuthManager } from '../../auth'

import OpenAI from "openai";
import { getOrCreateClient } from "./openai-client-cache";
import type { Responses } from "openai/resources/responses/responses";
import { OpenAIFileService, shouldUseAISDK, streamWithAISDK } from "../../ai";
import { streamWithClaudeAgentSDK } from "../../ai/claude-agent-sdk";
import {
  getDocumentContext,
  shouldUseLocalContext,
} from "../../documents/document-context";
import {
  SPREADSHEET_TOOLS,
  DOCUMENT_TOOLS,
  IMAGE_TOOLS,
  CHART_TOOLS,
  PLAN_TOOLS,
  executeTool,
  generateImageDirect,
  type ToolContext,
} from "./tools";
import type {
  AIStreamEvent,
  ReasoningConfig,
  NativeToolsConfig,
  AIProvider,
} from "@s-agi/core/types/ai";
import {
  AI_MODELS,
  getModelById,
  resolveModelForProvider,
  resolveModelIdForApi,
  sanitizeOpenAiResponseId,
} from "@s-agi/core/types/ai";
import { generateSuggestions } from "../../ai";
import {
  selectAgent,
  executeSpecializedAgent,
  shouldUseSpecializedAgent,
  getPDFContext,
  createModel,
} from "../../agents/agent-service";
import type { AgentContext } from "../../agents/types";

// Import from modular structure
// NOTE: Only importing items that don't have local definitions yet
// The rest will be migrated in future refactors
import {
  MAX_AGENT_STEPS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  FLEX_REQUEST_TIMEOUT_MS,
  ZAI_GENERAL_BASE_URL,
  ZAI_CODING_BASE_URL,
  ZAI_SOURCE_HEADER,
  SYSTEM_PROMPT,
  PLAN_MODE_SYSTEM_PROMPT,
  MINIMAL_SPREADSHEET_TOOLS,
  MINIMAL_DOCUMENT_TOOLS,
  MINIMAL_CHART_TOOLS,
} from "./ai/constants";
import {
  withRetry,
  getFallbackTitle,
  pickModeAuto,
  isLikelyCodingPrompt,
  isZaiBillingError,
  sanitizeApiError,
} from "./ai/helpers";
import { zodToJsonSchema, extractWebSearchDetails } from "./ai/schema";

// Re-export type for consumers
export type { AIStreamEvent } from "@s-agi/core/types/ai";

// Store active streams for cancellation
const activeStreams = new Map<string, AbortController>();

// ============================================================================
// Cerebras Free Tier Usage Tracker (per-model, multi-dimension)
// Tracks TPM/TPH/TPD and RPM/RPH/RPD per model using sliding windows.
// Limits are the same for all models on the free tier:
//   60K TPM, 1M TPH, 1M TPD, 30 RPM, 900 RPH, 14400 RPD
// ============================================================================
const CEREBRAS_LIMITS = {
  TPM: 60_000,      // tokens per minute
  TPH: 1_000_000,   // tokens per hour
  TPD: 1_000_000,   // tokens per day
  RPM: 30,          // requests per minute
  RPH: 900,         // requests per hour
  RPD: 14_400,      // requests per day
};
const CEREBRAS_WARNING_THRESHOLD = 0.90; // Warn at 90%
const ONE_MINUTE = 60_000;
const ONE_HOUR = 3_600_000;

interface CerebrasModelUsage {
  tokenEntries: Array<{ ts: number; tokens: number }>;
  requestTimestamps: number[];
}

const cerebrasUsage = new Map<string, CerebrasModelUsage>();

function getCerebrasModel(model: string): CerebrasModelUsage {
  let usage = cerebrasUsage.get(model);
  if (!usage) {
    usage = { tokenEntries: [], requestTimestamps: [] };
    cerebrasUsage.set(model, usage);
  }
  return usage;
}

/** Purge entries older than the given window from arrays. */
function purgeOld(usage: CerebrasModelUsage, now: number) {
  const dayStart = now - 24 * ONE_HOUR;
  usage.tokenEntries = usage.tokenEntries.filter((e) => e.ts > dayStart);
  usage.requestTimestamps = usage.requestTimestamps.filter((ts) => ts > dayStart);
}

/** Sum tokens within a time window ending at `now`. */
function sumTokens(entries: Array<{ ts: number; tokens: number }>, now: number, windowMs: number): number {
  const cutoff = now - windowMs;
  let sum = 0;
  for (const e of entries) {
    if (e.ts > cutoff) sum += e.tokens;
  }
  return sum;
}

/** Count requests within a time window ending at `now`. */
function countRequests(timestamps: number[], now: number, windowMs: number): number {
  const cutoff = now - windowMs;
  let count = 0;
  for (const ts of timestamps) {
    if (ts > cutoff) count++;
  }
  return count;
}

/** Record token usage and a request for a model. */
function cerebrasTrack(model: string, promptTokens: number, completionTokens: number) {
  const usage = getCerebrasModel(model);
  const now = Date.now();
  usage.tokenEntries.push({ ts: now, tokens: promptTokens + completionTokens });
  usage.requestTimestamps.push(now);
  purgeOld(usage, now);
}

/** Get usage percentages across all dimensions for a model. */
function cerebrasStatus(model: string): {
  tpmPct: number; tphPct: number; tpdPct: number;
  rpmPct: number; rphPct: number; rpdPct: number;
  maxPct: number; maxDimension: string;
  tpmUsed: number; tpdUsed: number; rpmUsed: number;
} {
  const usage = getCerebrasModel(model);
  const now = Date.now();
  const tpmUsed = sumTokens(usage.tokenEntries, now, ONE_MINUTE);
  const tphUsed = sumTokens(usage.tokenEntries, now, ONE_HOUR);
  const tpdUsed = sumTokens(usage.tokenEntries, now, 24 * ONE_HOUR);
  const rpmUsed = countRequests(usage.requestTimestamps, now, ONE_MINUTE);
  const rphUsed = countRequests(usage.requestTimestamps, now, ONE_HOUR);
  const rpdUsed = countRequests(usage.requestTimestamps, now, 24 * ONE_HOUR);

  const dims: Array<[string, number]> = [
    ["TPM", tpmUsed / CEREBRAS_LIMITS.TPM],
    ["TPH", tphUsed / CEREBRAS_LIMITS.TPH],
    ["TPD", tpdUsed / CEREBRAS_LIMITS.TPD],
    ["RPM", rpmUsed / CEREBRAS_LIMITS.RPM],
    ["RPH", rphUsed / CEREBRAS_LIMITS.RPH],
    ["RPD", rpdUsed / CEREBRAS_LIMITS.RPD],
  ];
  let maxPct = 0;
  let maxDimension = "TPD";
  for (const [name, pct] of dims) {
    if (pct > maxPct) { maxPct = pct; maxDimension = name; }
  }
  return {
    tpmPct: tpmUsed / CEREBRAS_LIMITS.TPM,
    tphPct: tphUsed / CEREBRAS_LIMITS.TPH,
    tpdPct: tpdUsed / CEREBRAS_LIMITS.TPD,
    rpmPct: rpmUsed / CEREBRAS_LIMITS.RPM,
    rphPct: rphUsed / CEREBRAS_LIMITS.RPH,
    rpdPct: rpdUsed / CEREBRAS_LIMITS.RPD,
    maxPct, maxDimension,
    tpmUsed, tpdUsed, rpmUsed,
  };
}

/** Pre-check: returns an error message if local tracking suggests limits are exhausted, else null. */
function cerebrasCheck(model: string): string | null {
  const s = cerebrasStatus(model);
  if (s.rpmPct >= 1) return `Cerebras RPM limit reached for ${model} (${CEREBRAS_LIMITS.RPM} req/min). Wait a moment.`;
  if (s.tpmPct >= 1) return `Cerebras TPM limit reached for ${model} (${CEREBRAS_LIMITS.TPM.toLocaleString()} tokens/min). Wait a moment.`;
  if (s.tpdPct >= 1) return `Cerebras daily token limit reached for ${model} (${CEREBRAS_LIMITS.TPD.toLocaleString()} tokens/day). Switch provider or wait.`;
  return null;
}

// ============================================================================
// Groq Free Tier Usage Tracker (per-model, multi-dimension)
// Each model has its own limits on RPM/RPD/TPM/TPD.
// @see https://console.groq.com/docs/rate-limits
// ============================================================================
const GROQ_MODEL_LIMITS: Record<string, { RPM: number; RPD: number; TPM: number; TPD: number }> = {
  "openai/gpt-oss-120b":                  { RPM: 30,  RPD: 1_000, TPM: 8_000,  TPD: 200_000 },
  "openai/gpt-oss-20b":                   { RPM: 30,  RPD: 1_000, TPM: 8_000,  TPD: 200_000 },
  "moonshotai/kimi-k2-instruct-0905":     { RPM: 60,  RPD: 1_000, TPM: 10_000, TPD: 300_000 },
  "qwen/qwen3-32b":                       { RPM: 60,  RPD: 1_000, TPM: 6_000,  TPD: 500_000 },
  "llama-3.3-70b-versatile":              { RPM: 30,  RPD: 1_000, TPM: 12_000, TPD: 100_000 },
  "meta-llama/llama-4-scout-17b-16e-instruct":    { RPM: 30, RPD: 1_000, TPM: 30_000, TPD: 500_000 },
  "meta-llama/llama-4-maverick-17b-128e-instruct": { RPM: 30, RPD: 1_000, TPM: 30_000, TPD: 500_000 },
  "llama-3.1-8b-instant":                 { RPM: 30,  RPD: 14_400, TPM: 6_000, TPD: 500_000 },
};
const GROQ_DEFAULT_LIMITS = { RPM: 30, RPD: 1_000, TPM: 6_000, TPD: 200_000 };
const GROQ_WARNING_THRESHOLD = 0.90;

interface GroqModelUsage {
  tokenEntries: Array<{ ts: number; tokens: number }>;
  requestTimestamps: number[];
}

const groqUsage = new Map<string, GroqModelUsage>();

function getGroqModelUsage(model: string): GroqModelUsage {
  let usage = groqUsage.get(model);
  if (!usage) {
    usage = { tokenEntries: [], requestTimestamps: [] };
    groqUsage.set(model, usage);
  }
  return usage;
}

function groqPurgeOld(usage: GroqModelUsage, now: number) {
  const dayStart = now - 24 * ONE_HOUR;
  usage.tokenEntries = usage.tokenEntries.filter((e) => e.ts > dayStart);
  usage.requestTimestamps = usage.requestTimestamps.filter((ts) => ts > dayStart);
}

function groqTrack(model: string, promptTokens: number, completionTokens: number) {
  const usage = getGroqModelUsage(model);
  const now = Date.now();
  usage.tokenEntries.push({ ts: now, tokens: promptTokens + completionTokens });
  usage.requestTimestamps.push(now);
  groqPurgeOld(usage, now);
}

function groqGetLimits(model: string) {
  return GROQ_MODEL_LIMITS[model] || GROQ_DEFAULT_LIMITS;
}

function groqStatus(model: string): {
  tpmPct: number; tpdPct: number;
  rpmPct: number; rpdPct: number;
  maxPct: number; maxDimension: string;
  tpmUsed: number; tpdUsed: number; rpmUsed: number; rpdUsed: number;
} {
  const usage = getGroqModelUsage(model);
  const limits = groqGetLimits(model);
  const now = Date.now();
  const tpmUsed = sumTokens(usage.tokenEntries, now, ONE_MINUTE);
  const tpdUsed = sumTokens(usage.tokenEntries, now, 24 * ONE_HOUR);
  const rpmUsed = countRequests(usage.requestTimestamps, now, ONE_MINUTE);
  const rpdUsed = countRequests(usage.requestTimestamps, now, 24 * ONE_HOUR);

  const dims: Array<[string, number]> = [
    ["TPM", tpmUsed / limits.TPM],
    ["TPD", tpdUsed / limits.TPD],
    ["RPM", rpmUsed / limits.RPM],
    ["RPD", rpdUsed / limits.RPD],
  ];
  let maxPct = 0;
  let maxDimension = "TPD";
  for (const [name, pct] of dims) {
    if (pct > maxPct) { maxPct = pct; maxDimension = name; }
  }
  return {
    tpmPct: tpmUsed / limits.TPM,
    tpdPct: tpdUsed / limits.TPD,
    rpmPct: rpmUsed / limits.RPM,
    rpdPct: rpdUsed / limits.RPD,
    maxPct, maxDimension,
    tpmUsed, tpdUsed, rpmUsed, rpdUsed,
  };
}

function groqCheck(model: string): string | null {
  const s = groqStatus(model);
  const limits = groqGetLimits(model);
  if (s.rpmPct >= 1) return `Groq RPM limit reached for ${model} (${limits.RPM} req/min). Wait a moment.`;
  if (s.tpmPct >= 1) return `Groq TPM limit reached for ${model} (${limits.TPM.toLocaleString()} tokens/min). Wait a moment.`;
  if (s.tpdPct >= 1) return `Groq daily token limit reached for ${model} (${limits.TPD.toLocaleString()} tokens/day). Switch provider or wait.`;
  return null;
}

// Shared constants/helpers/schemas now live in ./ai/*

// Type for function tools
type FunctionToolParam = Responses.FunctionTool;

/**
 * Create function tools for Responses API
 */
function createFunctionTools(
  chatId: string,
  userId: string,
  context?: ToolContext,
): {
  tools: FunctionToolParam[];
  executors: Map<string, (args: unknown) => Promise<unknown>>;
} {
  const executors = new Map<string, (args: unknown) => Promise<unknown>>();
  const tools: FunctionToolParam[] = [];

  // Add spreadsheet tools
  for (const [name, tool] of Object.entries(SPREADSHEET_TOOLS)) {
    tools.push({
      type: "function",
      name,
      description: tool.description,
      parameters: zodToJsonSchema(
        tool.inputSchema,
      ) as FunctionToolParam["parameters"],
      strict: true,
    });
    executors.set(name, (args) => executeTool(name, args, chatId, userId));
  }

  // Add document tools
  for (const [name, tool] of Object.entries(DOCUMENT_TOOLS)) {
    tools.push({
      type: "function",
      name,
      description: tool.description,
      parameters: zodToJsonSchema(
        tool.inputSchema,
      ) as FunctionToolParam["parameters"],
      strict: true,
    });
    executors.set(name, (args) => executeTool(name, args, chatId, userId));
  }

  // Add image tools (require API context)
  for (const [name, tool] of Object.entries(IMAGE_TOOLS)) {
    tools.push({
      type: "function",
      name,
      description: tool.description,
      parameters: zodToJsonSchema(
        tool.inputSchema,
      ) as FunctionToolParam["parameters"],
      strict: true,
    });
    // Pass context to image tools for API access
    executors.set(name, (args) =>
      executeTool(name, args, chatId, userId, context),
    );
  }

  // Add chart tools
  for (const [name, tool] of Object.entries(CHART_TOOLS)) {
    tools.push({
      type: "function",
      name,
      description: tool.description,
      parameters: zodToJsonSchema(
        tool.inputSchema,
      ) as FunctionToolParam["parameters"],
      strict: true,
    });
    executors.set(name, (args) => executeTool(name, args, chatId, userId));
  }

  return { tools, executors };
}

/**
 * Create plan mode tools for Responses API (only ExitPlanMode)
 */
function createPlanModeTools(
  chatId: string,
  userId: string,
): {
  tools: FunctionToolParam[];
  executors: Map<string, (args: unknown) => Promise<unknown>>;
} {
  const executors = new Map<string, (args: unknown) => Promise<unknown>>();
  const tools: FunctionToolParam[] = [];

  // Add plan mode tools
  for (const [name, tool] of Object.entries(PLAN_TOOLS)) {
    tools.push({
      type: "function",
      name,
      description: tool.description,
      parameters: zodToJsonSchema(
        tool.inputSchema,
      ) as FunctionToolParam["parameters"],
      strict: true,
    });
    executors.set(name, (args) => executeTool(name, args, chatId, userId));
  }

  return { tools, executors };
}

/**
 * CONTEXT-AWARE TOOLS: Only send tools relevant to what the user is working on.
 * - chat tab (no artifact): only creation tools (create_spreadsheet, create_document, generate_chart, images)
 * - excel tab: all spreadsheet tools + chart tools
 * - doc tab: all document tools
 * - gallery/pdf/ideas: only creation tools
 * This reduces token usage from ~15-20k to ~1-5k per request.
 */
function createContextualTools(
  chatId: string,
  userId: string,
  activeTab: string | undefined,
  context?: ToolContext,
): {
  tools: FunctionToolParam[];
  executors: Map<string, (args: unknown) => Promise<unknown>>;
} {
  const executors = new Map<string, (args: unknown) => Promise<unknown>>();
  const tools: FunctionToolParam[] = [];

  const addTool = (name: string, tool: { description: string; inputSchema: any }, ctx?: ToolContext) => {
    tools.push({
      type: "function",
      name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.inputSchema) as FunctionToolParam["parameters"],
      strict: true,
    });
    executors.set(name, (args) => executeTool(name, args, chatId, userId, ctx));
  };

  // Determine which tool categories to include based on active tab
  const includeAllSpreadsheet = activeTab === "excel";
  const includeAllDocument = activeTab === "doc";

  // Spreadsheet tools
  if (includeAllSpreadsheet) {
    // On excel tab: include ALL spreadsheet tools for full editing
    for (const [name, tool] of Object.entries(SPREADSHEET_TOOLS)) {
      addTool(name, tool);
    }
  } else {
    // On other tabs: only creation tool (user can still ask to create a spreadsheet)
    for (const name of MINIMAL_SPREADSHEET_TOOLS) {
      const tool = SPREADSHEET_TOOLS[name];
      if (tool) addTool(name, tool);
    }
  }

  // Document tools
  if (includeAllDocument) {
    // On doc tab: include ALL document tools for full editing
    for (const [name, tool] of Object.entries(DOCUMENT_TOOLS)) {
      addTool(name, tool);
    }
  } else {
    // On other tabs: only creation tool
    for (const name of MINIMAL_DOCUMENT_TOOLS) {
      const tool = DOCUMENT_TOOLS[name];
      if (tool) addTool(name, tool);
    }
  }

  // Image tools - always available (lightweight, only 2 tools)
  for (const [name, tool] of Object.entries(IMAGE_TOOLS)) {
    addTool(name, tool, context);
  }

  // Chart tools - available on excel tab or as creation tool
  if (includeAllSpreadsheet) {
    for (const [name, tool] of Object.entries(CHART_TOOLS)) {
      addTool(name, tool);
    }
  } else {
    for (const name of MINIMAL_CHART_TOOLS) {
      const tool = CHART_TOOLS[name];
      if (tool) addTool(name, tool);
    }
  }

  return { tools, executors };
}

/**
 * MINIMAL TOOLS MODE: When processing images (tables/data extraction)
 * Only expose create_spreadsheet, create_document, and generate_chart to prevent 19+ tool call chains.
 * The model will put all data in a single create_spreadsheet call instead of
 * calling format_cells, set_column_width, freeze_panes, etc. separately.
 */
function createMinimalFunctionTools(
  chatId: string,
  userId: string,
  context?: ToolContext,
): {
  tools: FunctionToolParam[];
  executors: Map<string, (args: unknown) => Promise<unknown>>;
} {
  const executors = new Map<string, (args: unknown) => Promise<unknown>>();
  const tools: FunctionToolParam[] = [];

  // Only add create_spreadsheet
  for (const name of MINIMAL_SPREADSHEET_TOOLS) {
    const tool = SPREADSHEET_TOOLS[name];
    if (tool) {
      tools.push({
        type: "function",
        name,
        description: tool.description,
        parameters: zodToJsonSchema(
          tool.inputSchema,
        ) as FunctionToolParam["parameters"],
        strict: true,
      });
      executors.set(name, (args) => executeTool(name, args, chatId, userId));
    }
  }

  // Only add create_document
  for (const name of MINIMAL_DOCUMENT_TOOLS) {
    const tool = DOCUMENT_TOOLS[name];
    if (tool) {
      tools.push({
        type: "function",
        name,
        description: tool.description,
        parameters: zodToJsonSchema(
          tool.inputSchema,
        ) as FunctionToolParam["parameters"],
        strict: true,
      });
      executors.set(name, (args) => executeTool(name, args, chatId, userId));
    }
  }

  // Include chart tools (generate_chart)
  for (const name of MINIMAL_CHART_TOOLS) {
    const tool = CHART_TOOLS[name];
    if (tool) {
      tools.push({
        type: "function",
        name,
        description: tool.description,
        parameters: zodToJsonSchema(
          tool.inputSchema,
        ) as FunctionToolParam["parameters"],
        strict: true,
      });
      executors.set(name, (args) => executeTool(name, args, chatId, userId));
    }
  }

  // Still include image tools (generate/edit) since they may be relevant
  for (const [name, tool] of Object.entries(IMAGE_TOOLS)) {
    tools.push({
      type: "function",
      name,
      description: tool.description,
      parameters: zodToJsonSchema(
        tool.inputSchema,
      ) as FunctionToolParam["parameters"],
      strict: true,
    });
    executors.set(name, (args) =>
      executeTool(name, args, chatId, userId, context),
    );
  }

  log.info(
    `[AI] Created MINIMAL function tools for image mode: ${tools.map((t) => t.name).join(", ")}`,
  );
  return { tools, executors };
}

// Union type for all tools
type ToolParam = Responses.Tool;

function buildZaiWebSearchTool(
  searchContextSize: "low" | "medium" | "high",
): ToolParam {
  const count =
    searchContextSize === "low" ? 3 : searchContextSize === "high" ? 8 : 5;
  return {
    type: "web_search",
    web_search: {
      enable: "True",
      search_engine: "search-prime",
      search_result: "True",
      count: `${count}`,
      search_recency_filter: "noLimit",
      content_size: searchContextSize,
    },
  } as unknown as ToolParam;
}

type ZaiWebSearchResult = {
  title?: string;
  url?: string;
};

function getZaiWebSearchResults(
  completion: OpenAI.ChatCompletion,
): ZaiWebSearchResult[] {
  const rawResults = (completion as any)?.web_search;
  if (!Array.isArray(rawResults)) return [];

  return rawResults
    .map((result: any) => ({
      title: result.title ?? result.media,
      url: result.link ?? result.url,
    }))
    .filter((result: ZaiWebSearchResult) => Boolean(result.url));
}

function getDomainsFromUrls(urls: string[]): string[] {
  const domains = new Set<string>();
  for (const url of urls) {
    try {
      domains.add(new URL(url).hostname);
    } catch {
      // Ignore invalid URLs
    }
  }
  return Array.from(domains);
}

function buildZaiWebSearchAnnotations(results: ZaiWebSearchResult[]) {
  return results
    .map((result) => ({
      type: "url_citation" as const,
      url: result.url || "",
      title: result.title,
      startIndex: 0,
      endIndex: 0,
    }))
    .filter((annotation) => annotation.url);
}

/**
 * Build native tools array based on configuration and model support
 * @param modelId - The model ID to check capabilities
 * @param config - Native tools configuration
 * @param provider - The AI provider (affects tool format)
 */
function buildNativeTools(
  modelId: string,
  config?: NativeToolsConfig,
  provider?: AIProvider,
): ToolParam[] {
  const model = getModelById(modelId);
  if (!model) return [];

  const tools: ToolParam[] = [];

  // Web Search
  // ChatGPT Plus/Codex uses 'web_search' format, standard OpenAI uses 'web_search_preview'
  if (config?.webSearch !== false && model.supportsNativeWebSearch) {
    const webSearchConfig =
      typeof config?.webSearch === "object" ? config.webSearch : {};
    const searchContextSize = webSearchConfig.searchContextSize || "medium";

    if (provider === "chatgpt-plus") {
      // Codex endpoint uses the newer 'web_search' format
      tools.push({
        type: "web_search",
        search_context_size: searchContextSize,
      } as ToolParam);
    } else if (provider === "zai") {
      tools.push(buildZaiWebSearchTool(searchContextSize));
    } else {
      // Standard OpenAI uses 'web_search_preview'
      tools.push({
        type: "web_search_preview",
        search_context_size: searchContextSize,
      } as ToolParam);
    }
  }

  // Code Interpreter
  if (config?.codeInterpreter && model.supportsCodeInterpreter) {
    const codeConfig =
      typeof config.codeInterpreter === "object" ? config.codeInterpreter : {};
    tools.push({
      type: "code_interpreter",
      container: { type: codeConfig.containerType || "auto" },
    } as ToolParam);
  }

  // File Search
  if (config?.fileSearch && model.supportsFileSearch) {
    const fileConfig =
      typeof config.fileSearch === "object" ? config.fileSearch : {};
    const vectorStoreIds = fileConfig.vectorStoreIds || [];

    // Only add file_search tool if we have vector store IDs
    if (vectorStoreIds.length > 0) {
      const fileSearchTool: Record<string, any> = {
        type: "file_search",
        vector_store_ids: vectorStoreIds,
      };
      // Only add max_num_results if specified (avoid undefined in JSON)
      if (fileConfig.maxResults) {
        fileSearchTool.max_num_results = fileConfig.maxResults;
      }
      tools.push(fileSearchTool as ToolParam);
    } else {
      log.warn(
        "[AI] file_search enabled but no vector_store_ids provided - skipping tool",
      );
    }
  }

  return tools;
}

/**
 * Get list of all available tool names
 */
function getAllToolNames(options: {
  modelId?: string;
  nativeTools?: NativeToolsConfig;
}): string[] {
  const { modelId, nativeTools } = options;
  const model = modelId ? getModelById(modelId) : undefined;

  const tools = [
    ...Object.keys(SPREADSHEET_TOOLS),
    ...Object.keys(DOCUMENT_TOOLS),
  ];

  // Add native tools based on model and config
  if (model?.supportsNativeWebSearch && nativeTools?.webSearch !== false) {
    tools.push("web_search");
  }
  if (model?.supportsCodeInterpreter && nativeTools?.codeInterpreter) {
    tools.push("code_interpreter");
  }
  if (model?.supportsFileSearch && nativeTools?.fileSearch) {
    tools.push("file_search");
  }

  return tools;
}

// Types for input content

/** Image attachment type */
type ImageAttachment = { type: "image"; data: string; mediaType: string };

/** Message with optional images */
type MessageWithImages = {
  role: "user" | "assistant" | "system";
  content: string;
  images?: ImageAttachment[];
};

/**
 * Convert internal messages to Responses API format
 * Now supports images in historical messages for full visual context
 */
function toResponsesMessages(
  messages: Array<MessageWithImages>,
  currentPrompt: string,
  images?: ImageAttachment[],
  options?: { maxHistoricalImages?: number },
): Array<Responses.ResponseInputItem> {
  const result: Array<Responses.ResponseInputItem> = [];
  const maxHistoricalImages = options?.maxHistoricalImages ?? 10; // Limit to avoid context overflow
  let historicalImageCount = 0;

  // Add previous messages with their images
  for (const msg of messages) {
    if (msg.role === "user" || msg.role === "assistant") {
      // Check if this message has images and we haven't exceeded the limit
      const msgImages = msg.images || [];
      const imagesToInclude = msgImages.slice(
        0,
        Math.max(0, maxHistoricalImages - historicalImageCount),
      );
      historicalImageCount += imagesToInclude.length;

      if (msg.role === "user" && imagesToInclude.length > 0) {
        // User message with images - use multimodal format
        const content: Array<Responses.ResponseInputContent> = [
          ...imagesToInclude.map((img) => ({
            type: "input_image" as const,
            image_url: `data:${img.mediaType};base64,${img.data}`,
            detail: "auto" as const,
          })),
          { type: "input_text" as const, text: msg.content },
        ];
        result.push({
          type: "message",
          role: "user",
          content,
        } as Responses.ResponseInputItem);
      } else {
        // Text-only message
        result.push({
          type: "message",
          role: msg.role,
          content: msg.content,
        } as Responses.ResponseInputItem);
      }
    }
  }

  // Add current message with optional images
  if (images?.length) {
    const content: Array<Responses.ResponseInputContent> = [
      ...images.map((img) => ({
        type: "input_image" as const,
        image_url: `data:${img.mediaType};base64,${img.data}`,
        detail: "auto" as const,
      })),
      { type: "input_text" as const, text: currentPrompt },
    ];
    result.push({
      type: "message",
      role: "user",
      content,
    } as Responses.ResponseInputItem);
  } else {
    result.push({
      type: "message",
      role: "user",
      content: currentPrompt,
    } as Responses.ResponseInputItem);
  }

  return result;
}

/**
 * Convert internal messages to Chat Completions format
 * Now supports images in historical messages for Z.AI and other providers
 */
function toChatMessages(
  systemPrompt: string,
  messages: Array<MessageWithImages>,
  currentPrompt: string,
  currentImages?: ImageAttachment[],
  options?: { maxHistoricalImages?: number; supportsImages?: boolean; includeImageDetail?: boolean },
): Array<OpenAI.ChatCompletionMessageParam> {
  const result: Array<OpenAI.ChatCompletionMessageParam> = [
    { role: "system", content: systemPrompt },
  ];
  const maxHistoricalImages = options?.maxHistoricalImages ?? 10;
  const supportsImages = options?.supportsImages ?? true;
  // Groq does not support the `detail` parameter in image_url
  const includeDetail = options?.includeImageDetail ?? true;
  let historicalImageCount = 0;

  const buildImagePart = (img: ImageAttachment) => {
    const imageUrl: Record<string, string> = {
      url: `data:${img.mediaType};base64,${img.data}`,
    };
    if (includeDetail) {
      imageUrl.detail = "auto";
    }
    return { type: "image_url" as const, image_url: imageUrl };
  };

  for (const msg of messages) {
    if (msg.role === "user" || msg.role === "assistant") {
      const msgImages = msg.images || [];
      const imagesToInclude = supportsImages
        ? msgImages.slice(
            0,
            Math.max(0, maxHistoricalImages - historicalImageCount),
          )
        : [];
      historicalImageCount += imagesToInclude.length;

      if (msg.role === "user" && imagesToInclude.length > 0) {
        // User message with images - use multimodal content array
        const content: Array<any> = [
          ...imagesToInclude.map(buildImagePart),
          { type: "text" as const, text: msg.content },
        ];
        result.push({ role: "user", content });
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // Add current message with optional images
  if (currentImages?.length && supportsImages) {
    const content: Array<any> = [
      ...currentImages.map(buildImagePart),
      { type: "text" as const, text: currentPrompt },
    ];
    result.push({ role: "user", content });
  } else {
    result.push({ role: "user", content: currentPrompt });
  }

  return result;
}

function toChatCompletionTools(
  tools: FunctionToolParam[],
): OpenAI.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description ?? undefined,
      parameters: tool.parameters ?? undefined,
    },
  }));
}

// Type for pending tool calls we need to track
interface PendingToolCall {
  callId: string;
  name: string;
  arguments: string;
  parsedArgs?: unknown; // Pre-parsed args to avoid re-parsing
}

export const aiRouter = router({
  // Get AI status with available models and tools
  getStatus: protectedProcedure
    .input(
      z
        .object({
          modelId: z.string().optional(),
          nativeTools: z
            .object({
              webSearch: z.boolean().optional(),
              codeInterpreter: z.boolean().optional(),
              fileSearch: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
    )
    .query(({ input }) => {
      const chatGPTAuth = getChatGPTAuthManager();
      return {
        availableProviders: ["openai", "chatgpt-plus", "zai", "claude", "cerebras", "groq"] as const,
        availableModels: AI_MODELS,
        availableTools: getAllToolNames({
          modelId: input?.modelId,
          nativeTools: input?.nativeTools,
        }),
        supportsReasoning: input?.modelId
          ? (getModelById(input.modelId)?.supportsReasoning ?? false)
          : false,
        // ChatGPT Plus status
        chatGPTPlus: {
          isConnected: chatGPTAuth.isConnected(),
          accountId: chatGPTAuth.getAccountId(),
        },
      };
    }),

  // Stream chat with AI using OpenAI Responses API
  // Implements Agent Loop with native tools, reasoning, and function calling
  // Supports both OpenAI API (with key) and ChatGPT Plus (OAuth)
  chat: protectedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
        prompt: z.string(),
        mode: z.enum(["plan", "agent"]).default("agent"),
        provider: z
          .enum(["openai", "chatgpt-plus", "zai", "claude", "cerebras", "groq"])
          .default("openai"),
        apiKey: z.string().optional(), // Optional for chatgpt-plus provider
        model: z.string().optional(),
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant", "system"]),
              content: z.string(),
              // Support for historical images in messages
              images: z
                .array(
                  z.object({
                    type: z.literal("image"),
                    data: z.string(), // base64 data
                    mediaType: z.string(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
        // Current message images (backwards compatible)
        images: z
          .array(
            z.object({
              type: z.literal("image"),
              data: z.string(),
              mediaType: z.string(),
            }),
          )
          .optional(),
        // Responses API specific
        reasoning: z
          .object({
            effort: z.enum(["low", "medium", "high"]),
            summary: z.enum(["auto", "concise", "detailed"]).optional(),
            maxReasoningTokens: z.number().optional(),
          })
          .optional(),
        nativeTools: z
          .object({
            webSearch: z
              .union([
                z.boolean(),
                z.object({
                  searchContextSize: z
                    .enum(["low", "medium", "high"])
                    .optional(),
                }),
              ])
              .optional(),
            codeInterpreter: z
              .union([
                z.boolean(),
                z.object({
                  containerType: z
                    .enum(["auto", "python", "javascript"])
                    .optional(),
                }),
              ])
              .optional(),
            fileSearch: z
              .union([
                z.boolean(),
                z.object({
                  vectorStoreIds: z.array(z.string()).optional(),
                  maxResults: z.number().optional(),
                }),
              ])
              .optional(),
          })
          .optional(),
        previousResponseId: z.string().optional(),
        /** Instant / Thinking / Auto (solo GPT-5.2) */
        responseMode: z.enum(["instant", "thinking", "auto"]).optional(),
        // Cost optimization options
        optimization: z
          .object({
            /** Maximum output tokens (controls response length and cost) */
            maxOutputTokens: z.number().optional(),
            /** Use flex processing for 50% cost savings (slower, may fail if busy) */
            useFlex: z.boolean().optional(),
            /** Truncation strategy for context window management */
            truncation: z
              .object({
                type: z.enum(["auto", "disabled"]).optional(),
              })
              .optional(),
            /** Prompt caching key to improve cache hit rates */
            promptCacheKey: z.string().optional(),
            /** Prompt cache retention policy */
            promptCacheRetention: z.enum(["in_memory", "24h"]).optional(),
          })
          .optional(),
        /** When true, forces the AI to use the generate_image tool with the prompt */
        generateImage: z.boolean().optional(),
        /** Image size for image generation (e.g., '1024x1024', '1536x1024', '1024x1536') */
        imageSize: z.string().optional(),
        /** Target document for focused file search (from @mention) */
        targetDocument: z
          .object({
            id: z.string(),
            filename: z.string(),
          })
          .optional(),
        /** User's timezone (e.g., 'America/Lima', 'America/New_York') for accurate date/time in responses */
        timezone: z.string().optional(),
        /** Active UI tab - used for context-aware tool selection (only send relevant tools) */
        activeTab: z.enum(["chat", "excel", "doc", "gallery", "pdf", "ideas"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate user has access to this chat
      // Following OpenCode pattern: use local storage in local mode
      if (isLocalStorageMode()) {
        log.info("[AI] Local mode - verifying chat access via SQLite");
        const adapter = await getStorageAdapter();
        const chat = await adapter.chats.getById!(input.chatId);
        if (!chat) {
          log.error("[AI] Chat not found in local storage:", input.chatId);
          throw new Error("Chat not found");
        }
        log.debug("[AI] Local mode - chat verified:", input.chatId);
      } else {
        // Cloud mode: use Supabase
        const { data: chat, error } = await supabase
          .from("chats")
          .select("id")
          .eq("id", input.chatId)
          .eq("user_id", ctx.userId)
          .single();

        if (error || !chat) {
          log.error("[AI] Chat access denied:", {
            chatId: input.chatId,
            userId: ctx.userId,
            error,
          });
          throw new Error("Chat not found or access denied");
        }
      }

      // Cancel existing stream for this chat if any
      if (activeStreams.has(input.chatId)) {
        activeStreams.get(input.chatId)?.abort();
        activeStreams.delete(input.chatId);
      }

      const abortController = new AbortController();
      // withRetry + createRequestSignal add multiple abort listeners per attempt;
      // agent loop can retry several times → avoid MaxListenersExceededWarning (default 10)
      setMaxListeners(24, abortController.signal);
      activeStreams.set(input.chatId, abortController);

      const emit = (event: AIStreamEvent) => {
        sendToRenderer("ai:stream", event);
      };

      const runAgentLoop = async () => {
        const startTime = Date.now();
        try {
          // Determine provider and model using manifest defaults
          const provider = input.provider || "openai";
          const modelDef = resolveModelForProvider(
            provider as AIProvider,
            input.model,
          );
          const modelId = modelDef.id;
          const apiModelId = resolveModelIdForApi(modelId);

          const hasHistoricalImages = !!input.messages?.some(
            (message) => message.images && message.images.length > 0,
          );
          const canUseAiSdkStreaming =
            shouldUseAISDK() &&
            provider !== "claude" &&
            input.mode === "plan" &&
            !input.nativeTools &&
            !input.generateImage &&
            !input.targetDocument &&
            !input.images?.length &&
            !hasHistoricalImages;

          if (canUseAiSdkStreaming) {
            await streamWithAISDK({
              chatId: input.chatId,
              prompt: input.prompt,
              provider: provider as AIProvider,
              modelId,
              userId: ctx.userId,
              messages: input.messages?.map((message) => ({
                role: message.role,
                content: message.content,
              })),
              mode: input.mode,
              signal: abortController.signal,
            });
            return;
          }

          // ========================================================================
          // SPECIALIZED AGENT CHECK
          // Check if this message should be handled by a specialized agent
          // ========================================================================
          const pdfContext = getPDFContext(input.chatId);
          const agentContext: AgentContext = {
            userId: ctx.userId,
            chatId: input.chatId,
            apiKey: input.apiKey,
            pdfPath: pdfContext?.path,
            pdfPages: pdfContext?.pages,
          };

          if (input.apiKey && shouldUseSpecializedAgent(input.prompt, agentContext)) {
            const selection = selectAgent(input.prompt, agentContext);
            log.info(`[AI] Routing to specialized agent: ${selection.agent} - ${selection.reason}`);

            try {
              const model = createModel(input.apiKey, modelId);
              const result = await executeSpecializedAgent(
                input.prompt,
                agentContext,
                model,
                (token) => emit({ type: "text-delta", delta: token })
              );

              if (result.response) {
                // Emit the final response
                emit({ type: "text-done", text: result.response });

                // Emit finish event
                const duration = Date.now() - startTime;
                log.info(`[AI] Specialized agent completed in ${duration}ms`);
                emit({
                  type: "finish",
                  totalSteps: 1,
                  usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 },
                });

                // Early return - specialized agent handled the request
                activeStreams.delete(input.chatId);
                return;
              }
              // If response is empty, fall through to normal agent loop
              log.info(`[AI] Specialized agent returned empty response, falling through to normal processing`);
            } catch (agentError) {
              log.error(`[AI] Specialized agent error, falling through:`, agentError);
              // Fall through to normal agent loop on error
            }
          }
          // ========================================================================

          const supportsResponseMode = !!(
            modelDef as { supportsResponseMode?: boolean } | undefined
          )?.supportsResponseMode;
          const hasImages = !!(input.images && input.images.length > 0);
          const chosenMode: "instant" | "thinking" | null =
            supportsResponseMode &&
            (provider === "openai" || provider === "chatgpt-plus") &&
            input.responseMode
              ? input.responseMode === "auto"
                ? pickModeAuto(input.prompt, hasImages)
                : input.responseMode
              : null;
          if (chosenMode)
            log.info(
              `[AI] ResponseMode: ${input.responseMode} -> chosen: ${chosenMode}`,
            );

          log.info(
            `[AI] Starting ${provider === "zai" || provider === "cerebras" || provider === "groq" ? "Chat Completions" : "Responses API"} agent loop with ${modelId} (provider: ${provider})`,
          );
          log.info(`[AI] Reasoning config:`, input.reasoning);
          if (hasImages) {
            log.info(`[AI] Including ${input.images?.length} image(s)`);
          }

          // Create OpenAI client based on provider
          let client: OpenAI | null = null;
          let chatGPTAccountId: string | null = null;
          let zaiBaseURL: string | null = null;

          if (provider === "chatgpt-plus") {
            // ChatGPT Plus/Pro - use OAuth token with custom fetch
            // Following OpenCode's Codex plugin pattern to bypass Cloudflare
            const chatGPTAuth = getChatGPTAuthManager();

            if (!chatGPTAuth.isConnected()) {
              throw new Error(
                "ChatGPT Plus not connected. Please connect your ChatGPT Plus subscription in Settings.",
              );
            }

            const accessToken = chatGPTAuth.getAccessToken();
            chatGPTAccountId = chatGPTAuth.getAccountId();

            if (!accessToken) {
              throw new Error(
                "ChatGPT Plus token not available. Please reconnect.",
              );
            }

            const codexEndpoint = chatGPTAuth.getInferenceEndpoint();
            log.info(
              `[AI] ChatGPT Plus: Creating client with custom fetch, endpoint: ${codexEndpoint}`,
            );

            // Custom fetch that handles ChatGPT Plus authentication properly
            // The SDK's default behavior doesn't work with Cloudflare protection
            const codexFetch = async (
              requestInput: RequestInfo | URL,
              init?: RequestInit,
            ): Promise<Response> => {
              log.info(`[AI] Codex custom fetch called`);

              const headers = new Headers();

              // Copy existing headers, except Authorization (we'll set our own)
              if (init?.headers) {
                const headerEntries =
                  init.headers instanceof Headers
                    ? Array.from(init.headers.entries())
                    : Array.isArray(init.headers)
                      ? init.headers
                      : Object.entries(init.headers);

                for (const [key, value] of headerEntries) {
                  if (
                    key.toLowerCase() !== "authorization" &&
                    value !== undefined
                  ) {
                    headers.set(key, String(value));
                  }
                }
              }

              // Set OAuth Bearer token
              headers.set("Authorization", `Bearer ${accessToken}`);

              // Set ChatGPT Account ID for organization subscriptions
              if (chatGPTAccountId) {
                headers.set("ChatGPT-Account-Id", chatGPTAccountId);
              }

              // Parse the URL
              let urlString: string;
              if (requestInput instanceof URL) {
                urlString = requestInput.href;
              } else if (typeof requestInput === "string") {
                urlString = requestInput;
              } else {
                urlString = requestInput.url;
              }

              const parsed = new URL(urlString);

              // Rewrite URL to Codex endpoint if it's a responses/chat endpoint
              const shouldRewrite =
                parsed.pathname.includes("/responses") ||
                parsed.pathname.includes("/chat/completions");
              const finalUrl = shouldRewrite ? codexEndpoint : parsed.href;

              log.info(
                `[AI] Codex fetch: ${parsed.pathname} -> ${finalUrl} (rewrite: ${shouldRewrite})`,
              );

              // Log the request body for debugging
              if (init?.body) {
                try {
                  const bodyStr =
                    typeof init.body === "string"
                      ? init.body
                      : init.body.toString();
                  const bodyObj = JSON.parse(bodyStr);
                  log.info(
                    `[AI] Codex request body keys: ${Object.keys(bodyObj).join(", ")}`,
                  );
                  log.info(`[AI] Codex request model: ${bodyObj.model}`);
                  if (bodyObj.tools) {
                    log.info(
                      `[AI] Codex request tools count: ${bodyObj.tools.length}`,
                    );
                  }
                } catch (e) {
                  log.info(`[AI] Codex request body (raw): ${init.body}`);
                }
              }

              const response = await fetch(finalUrl, {
                ...init,
                headers,
              });

              // Log response status for debugging
              log.info(`[AI] Codex response status: ${response.status}`);
              if (!response.ok) {
                const text = await response.text();
                log.error(
                  `[AI] Codex error response: ${text.substring(0, 500)}`,
                );
                // Re-create response since we consumed the body
                return new Response(text, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers,
                });
              }

              return response;
            };

            // Create client with custom fetch - use dummy apiKey since we handle auth ourselves
            client = new OpenAI({
              apiKey: "codex-oauth", // Dummy key, auth handled by custom fetch
              baseURL: "https://api.openai.com/v1", // Base URL, will be rewritten by fetch
              fetch: codexFetch,
            });

            log.info(
              `[AI] Using ChatGPT Plus provider with account: ${chatGPTAccountId || "unknown"}`,
            );

            // NOTE: Gemini Advanced DISABLED - OAuth token incompatible with generativelanguage.googleapis.com
            // The endpoint requires API key from Google AI Studio, not OAuth token
            // OAuth tokens work with cloudcode-pa.googleapis.com but require different API format
            /*
                    } else if (provider === 'gemini-advanced') {
                        // Gemini Advanced / Google One - use OAuth token with OpenAI-compatible endpoint
                        const geminiAuth = getGeminiAuthManager()

                        if (!geminiAuth.isConnected()) {
                            throw new Error('Gemini Advanced not connected. Please connect your Google account in Settings.')
                        }

                        // Get a valid token (will refresh if expired)
                        const accessToken = await geminiAuth.getValidAccessToken()

                        if (!accessToken) {
                            throw new Error('Gemini token not available. Please reconnect.')
                        }

                        // Use Gemini's OpenAI-compatible endpoint with OAuth Bearer token
                        const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'
                        log.info(`[AI] Gemini Advanced: Using OpenAI-compatible endpoint with OAuth Bearer token`)

                        client = new OpenAI({
                            apiKey: 'oauth-placeholder', // Required by SDK but we use Bearer auth
                            baseURL: GEMINI_OPENAI_BASE_URL,
                            defaultHeaders: {
                                'Authorization': `Bearer ${accessToken}`
                            }
                        })
                    */
          } else if (provider === "zai") {
            // SECURITY: Fetch API key from credential manager if not provided
            const credentialManager = getCredentialManager();
            const zaiApiKey = input.apiKey || await credentialManager.getZaiKey();

            if (!zaiApiKey) {
              throw new Error("Z.AI API key is required. Please configure it in Settings.");
            }

            const wantsCodingEndpoint = isLikelyCodingPrompt(input.prompt);
            zaiBaseURL = wantsCodingEndpoint
              ? ZAI_CODING_BASE_URL
              : ZAI_GENERAL_BASE_URL;

            client = getOrCreateClient({
              apiKey: zaiApiKey,
              baseURL: zaiBaseURL,
              defaultHeaders: {
                "X-Source": ZAI_SOURCE_HEADER,
              },
              maxRetries: 0,
            });

            // Update apiKey for tool context
            input.apiKey = zaiApiKey;

            log.info(
              `[AI] Using Z.AI provider endpoint: ${wantsCodingEndpoint ? "coding" : "general"}`,
            );
          } else if (provider === "cerebras") {
            // Cerebras - OpenAI-compatible Chat Completions API
            const credentialManager = getCredentialManager();
            const cerebrasApiKey = input.apiKey || await credentialManager.getCerebrasKey();

            if (!cerebrasApiKey) {
              throw new Error("Cerebras API key is required. Please configure it in Settings.");
            }

            client = getOrCreateClient({
              apiKey: cerebrasApiKey,
              baseURL: "https://api.cerebras.ai/v1",
              maxRetries: 0,
            });

            // Update apiKey for tool context
            input.apiKey = cerebrasApiKey;

            log.info(`[AI] Using Cerebras provider (key: ${cerebrasApiKey.substring(0, 8)}...${cerebrasApiKey.substring(cerebrasApiKey.length - 4)}, length: ${cerebrasApiKey.length})`);
          } else if (provider === "groq") {
            // Groq - OpenAI-compatible Chat Completions API
            const credentialManager = getCredentialManager();
            const groqApiKey = input.apiKey || await credentialManager.getGroqKey();

            if (!groqApiKey) {
              throw new Error("Groq API key is required. Please configure it in Settings.");
            }

            client = getOrCreateClient({
              apiKey: groqApiKey,
              baseURL: "https://api.groq.com/openai/v1",
              maxRetries: 0,
            });

            // Update apiKey for tool context
            input.apiKey = groqApiKey;

            log.info(`[AI] Using Groq provider (key: ${groqApiKey.substring(0, 8)}...${groqApiKey.substring(groqApiKey.length - 4)}, length: ${groqApiKey.length})`);
          } else if (provider === "claude") {
            // Claude uses AI SDK streaming path below (no OpenAI client needed)
            client = null;
          } else {
            // Standard OpenAI API - fetch API key from credential manager if not provided
            const credentialManager = getCredentialManager();
            const openaiApiKey = input.apiKey || await credentialManager.getOpenAIKey();

            if (!openaiApiKey) {
              throw new Error("OpenAI API key is required. Please configure it in Settings.");
            }

            client = getOrCreateClient({
              apiKey: openaiApiKey,
              maxRetries: 0,
            });

            // Update apiKey for tool context
            input.apiKey = openaiApiKey;
          }

          let openaiClient = client;
          if (
            (provider === "openai" ||
              provider === "chatgpt-plus" ||
              provider === "zai" ||
              provider === "cerebras" ||
              provider === "groq") &&
            !openaiClient
          ) {
            throw new Error("OpenAI client not initialized");
          }

          // Build tool context for image generation and other API-requiring tools
          const toolContext: ToolContext = {
            apiKey: input.apiKey,
            provider: provider as ToolContext["provider"],
          };
          // For Z.AI, add custom base URL and headers
          if (provider === "zai") {
            toolContext.baseURL = zaiBaseURL || ZAI_GENERAL_BASE_URL;
            toolContext.headers = { "X-Source": ZAI_SOURCE_HEADER };
          }

          // Build tools based on mode and context
          // CONTEXT-AWARE TOOL SELECTION: Only send tools relevant to the active tab
          // - Reduces token usage from ~15-20k to ~1-5k per request
          // - Prevents unnecessary tool call chains (e.g., 19+ calls for spreadsheet formatting)
          // - When images are present, use minimal tools to force single create_spreadsheet calls
          const { tools: functionTools, executors } =
            input.mode === "plan"
              ? createPlanModeTools(input.chatId, ctx.userId)
              : hasImages
                ? createMinimalFunctionTools(
                    input.chatId,
                    ctx.userId,
                    toolContext,
                  )
                : createContextualTools(
                    input.chatId,
                    ctx.userId,
                    input.activeTab,
                    toolContext,
                  );

          if (hasImages) {
            log.info(
              `[AI] Using MINIMAL tools mode for image input - only create_spreadsheet/create_document available`,
            );
          } else if (input.mode !== "plan") {
            log.info(
              `[AI] Context-aware tools for tab="${input.activeTab || "chat"}": ${functionTools.length} tools (instead of 55)`,
            );
          }

          // Select system prompt based on mode
          // Add current date/time context for accurate temporal awareness
          // Use user's timezone if provided, fallback to America/Lima
          const userTimezone = input.timezone || "America/Lima";
          const now = new Date();

          // Get timezone display name (e.g., "Lima, Peru" from "America/Lima")
          let timezoneDisplay = userTimezone;
          try {
            // Extract city name from IANA timezone
            const parts = userTimezone.split("/");
            timezoneDisplay = parts[parts.length - 1].replace(/_/g, " ");
          } catch {
            // Keep full timezone if parsing fails
          }

          const dateContext = `\n\n================================================================================
CURRENT DATE & TIME (USER'S LOCAL TIME)
================================================================================
Today: ${now.toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: userTimezone })}
Time: ${now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: userTimezone })} (${timezoneDisplay})
Timezone: ${userTimezone}
================================================================================
IMPORTANT: When searching for current events, sports, news, or time-sensitive information,
use TODAY'S DATE shown above. The user is in ${timezoneDisplay} timezone.
================================================================================\n`;

          let systemPrompt =
            (input.mode === "plan" ? PLAN_MODE_SYSTEM_PROMPT : SYSTEM_PROMPT) +
            dateContext;

          // Build native tools configuration
          let nativeToolsConfig = input.nativeTools;

          log.info(
            `[AI] nativeTools input:`,
            JSON.stringify(nativeToolsConfig),
          );
          log.info(
            `[AI] Model ${modelId} supportsFileSearch: ${modelDef?.supportsFileSearch}`,
          );

          // Track if we should force file_search for document queries
          let shouldForceFileSearch = false;

          /**
           * IMPROVED: Detect if query is about uploaded documents or personal information
           * Following best practices from Anthropic/OpenAI for RAG systems:
           * 1. Personal questions (my, mi, yo) should search knowledge base first
           * 2. Document-related keywords
           * 3. Questions about dates, names, certifications, etc. that would be in documents
           */
          const isDocumentQuery = (
            prompt: string,
            fileNames: string[] = [],
          ): boolean => {
            const normalizedPrompt = prompt
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");

            // Extract meaningful keywords from file names for context matching
            const fileKeywords = fileNames.flatMap((name) => {
              const normalized = name
                .toLowerCase()
                .replace(/\.(pdf|doc|docx|txt|md)$/i, "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
              return normalized.split(/[-_\s]+/).filter((w) => w.length > 2);
            });

            // Check if prompt mentions any file-related keywords
            const mentionsFileContent = fileKeywords.some((keyword) =>
              normalizedPrompt.includes(keyword),
            );

            const docPatterns = [
              // PRIORITY 1: Personal/possessive queries (most likely about user's documents)
              /\b(my|mi|mis|yo|me)\b/i,
              /\btu\s+(titulacion|titulo|certificado|constancia|documento)/i,

              // PRIORITY 2: Explicit document references
              /\b(the\s+)?(pdf|document|file|attachment|uploaded)/i,
              /\b(el\s+)?(pdf|documento|archivo|adjunto|subido)/i,

              // PRIORITY 3: Action verbs for document analysis
              /\b(summarize|summary|resume|resumen|resumir)/i,
              /\b(what\s+does\s+it\s+say|what\s+is\s+in|read\s+the|analyze)/i,
              /\b(que\s+dice|que\s+contiene|lee\s+el|analiza|revisar)/i,
              /\b(extract|content|contents|information\s+from)/i,
              /\b(extrae|contenido|informacion\s+del)/i,

              // PRIORITY 4: Specific document/certificate terms (Spanish)
              /\b(titulacion|titulo|grado|licenciatura|maestria|doctorado)/i,
              /\b(certificado|constancia|diploma|credencial)/i,
              /\b(fecha\s+de|cuando\s+fue|en\s+que\s+fecha)/i,
              /\b(universidad|institucion|escuela|facultad)/i,

              // PRIORITY 5: Personal data queries
              /\b(nombre|direccion|telefono|email|correo)/i,
              /\b(nacimiento|nacido|naci|edad)/i,
              /\b(trabajo|empleo|experiencia|laboral)/i,
              /\b(educacion|estudios|formacion|academico)/i,

              // PRIORITY 6: Common question patterns about documents
              /\bcuando\b.*\b(fue|era|obtuve|recibi)/i,
              /\bque\s+(fecha|dia|ano|mes)/i,
              /\b(dice|menciona|indica|especifica)\s+(el|la|mi)/i,
            ];

            const matchesPattern = docPatterns.some((pattern) =>
              pattern.test(prompt),
            );

            log.info(`[AI] isDocumentQuery analysis:`, {
              prompt: prompt.substring(0, 100),
              matchesPattern,
              mentionsFileContent,
              fileKeywords: fileKeywords.slice(0, 10),
            });

            return matchesPattern || mentionsFileContent;
          };

          const shouldUseWebSearch = (
            prompt: string,
          ): { enabled: boolean; forceWebSearch: boolean; contextSize: "low" | "medium" | "high" } => {
            // Patterns that FORCE web search (model must search, no questions)
            const forceSearchPatterns = [
              /^busca\b/i, // "busca" at start of message - direct command
              /\bbusca\s+(cuando|donde|que|quien|como|cuanto|sobre|acerca|informacion)/i, // "busca cuando/donde/etc"
              /\bbuscar\s+en\s+(internet|la\s+web|google)/i, // "buscar en internet/web"
              /\bsearch\s+(for|the\s+web|online|google)/i, // "search for/the web/online"
              /\b(google|googlea)\b/i, // Direct google command
            ];

            const explicitWebPatterns = [
              /\b(internet|web|online|buscar\s+en\s+la\s+web|busca\s+en\s+la\s+web|search\s+the\s+web)\b/i,
              /\b(source|sources|fuente|fuentes|cita|citation)\b/i,
              /\bsite:/i,
            ];

            const recencyPatterns = [
              /\b(hoy|ayer|esta\s+semana|este\s+mes|este\s+ano|actual|actualidad|reciente|ultimas|ultimos|latest|news|noticias)\b/i,
              /\b(precio|cotizacion|stock|acciones|tipo\s+de\s+cambio|usd|dolar|eur|crypto|bitcoin)\b/i,
              /\b(clima|weather|pronostico)\b/i,
              /\b(resultados|score|marcador|partido|partidos|eleccion|elecciones)\b/i,
              // Sports and events scheduling (typo-tolerant: prox.* matches proximos/proxmiso, part.* matches partidos/prtidos)
              /\b(cuando\s+juega|cuando\s+juegan|prox\w*\s+part\w*|fixture|fixtures)\b/i,
              /\b(vs|versus|contra)\b/i,
              /\b(liga|copa|champions|libertadores|mundial|torneo|campeonato)\b/i,
              /\b(futbol|soccer|basketball|tennis|nba|nfl|mlb)\b/i,
              // Peruvian/Latin American football teams that need live data
              /\b(alianza\s*lima|universitario|sporting\s*cristal|cienciano|melgar|cesar\s*vallejo|binacional|mannucci|cantolao|sport\s*huancayo|san\s*martin|ayacucho|cusco|boys|municipal|carlos\s*stein|sport\s*boys|utc)\b/i,
              // Questions about "when" something happens or will happen
              /\bcuales?\s+(son|es|sera|seran)\s+.*\b(prox|part|juego|fecha)/i,
              /\bcuando\s+(es|sera|son|seran|juega|juegan)/i,
            ];

            const researchPatterns = [
              /\b(investiga|investigar|research|comparar|benchmark|analiza\s+fuentes|recopila)\b/i,
            ];

            const hasUrl = /(https?:\/\/|www\.)/i.test(prompt);
            // Force search when user gives direct command
            const forceSearch = forceSearchPatterns.some((pattern) =>
              pattern.test(prompt),
            );
            const wantsWeb = explicitWebPatterns.some((pattern) =>
              pattern.test(prompt),
            );
            const wantsRecency = recencyPatterns.some((pattern) =>
              pattern.test(prompt),
            );
            const wantsResearch = researchPatterns.some((pattern) =>
              pattern.test(prompt),
            );

            const enabled = hasUrl || forceSearch || wantsWeb || wantsRecency || wantsResearch;
            // Force web search when user explicitly commands it
            const forceWebSearch = forceSearch || wantsRecency;
            const contextSize: "low" | "medium" | "high" =
              wantsResearch || prompt.length > 220 ? "medium" : "low";

            log.info("[AI] Web search heuristic analysis:", {
              prompt: prompt.substring(0, 100),
              enabled,
              forceWebSearch,
              contextSize,
              hasUrl,
              forceSearch,
              wantsWeb,
              wantsRecency,
              wantsResearch,
            });

            return { enabled, forceWebSearch, contextSize };
          };

          // Automatically enable file search if chat has a vector store (Knowledge Base)
          // This allows the AI to search uploaded documents without explicit frontend request
          // Following Anthropic/OpenAI best practices for RAG systems
          if (modelDef?.supportsFileSearch) {
            let chatVectorStoreId: string | null = null;

            // Get vector store ID from appropriate storage
            if (isLocalStorageMode()) {
              const adapter = await getStorageAdapter();
              const chatData = await adapter.chats.getById!(input.chatId);
              chatVectorStoreId = chatData?.openaiVectorStoreId || null;
            } else {
              const { data: chatData } = await supabase
                .from("chats")
                .select("openai_vector_store_id")
                .eq("id", input.chatId)
                .single();
              chatVectorStoreId = chatData?.openai_vector_store_id || null;
            }

            if (chatVectorStoreId) {
              log.info(
                `[AI] Chat has Knowledge Base, auto-enabling file search with vector store: ${chatVectorStoreId}`,
              );

              // Get list of uploaded files FIRST to inform both isDocumentQuery and system prompt
              let chatFiles: Array<{ filename: string; file_size?: number; content_type?: string; openai_file_id?: string }> | null = null;

              if (isLocalStorageMode()) {
                const adapter = await getStorageAdapter();
                const localFiles = await adapter.chatFiles.list(input.chatId, "local-user");
                chatFiles = localFiles.map(f => ({
                  filename: f.filename,
                  file_size: f.fileSize || undefined,
                  content_type: f.contentType || undefined,
                  openai_file_id: f.openaiFileId || undefined,
                }));
              } else {
                const { data } = await supabase
                  .from("chat_files")
                  .select("filename, file_size, content_type, openai_file_id")
                  .eq("chat_id", input.chatId)
                  .order("created_at", { ascending: false });
                chatFiles = data;
              }

              let fallbackFiles: Array<{
                filename: string;
                file_size?: number;
              }> = [];
              if (!chatFiles || chatFiles.length === 0) {
                try {
                  // Get API key for file service (use input.apiKey for openai, or stored key)
                  const fileServiceApiKey =
                    input.apiKey || getSecureApiKeyStore().getOpenAIKey();
                  if (fileServiceApiKey) {
                    const fileService = new OpenAIFileService({
                      apiKey: fileServiceApiKey,
                    });
                    const openaiFiles = await fileService.listVectorStoreFiles(
                      chatVectorStoreId,
                    );
                    fallbackFiles = openaiFiles.map((file) => ({
                      filename: file.filename,
                      file_size: file.bytes,
                    }));
                  }
                } catch (err) {
                  log.warn(
                    "[AI] Failed to fetch OpenAI file list for knowledge base context:",
                    err,
                  );
                }
              }

              const filesForPrompt =
                chatFiles && chatFiles.length > 0 ? chatFiles : fallbackFiles;
              const fileNames = filesForPrompt.map((f) => f.filename);

              // IMPROVED: Check if the current prompt seems to be about uploaded documents
              // Now passing file names for better context matching
              const isDocQuery = isDocumentQuery(input.prompt, fileNames);
              log.info(
                `[AI] Query "${input.prompt.substring(0, 50)}..." - isDocumentQuery: ${isDocQuery}`,
              );

              // AGGRESSIVE STRATEGY: When knowledge base exists with files,
              // ALWAYS force file_search first unless query explicitly mentions "internet" or "web"
              const isExplicitWebQuery =
                /\b(internet|web|online|google|busca en la web|search online)\b/i.test(
                  input.prompt,
                );

              // Force file search if:
              // 1. Query matches document patterns, OR
              // 2. We have files AND query doesn't explicitly ask for web search
              shouldForceFileSearch =
                isDocQuery || (fileNames.length > 0 && !isExplicitWebQuery);

              log.info(`[AI] Force file_search decision:`, {
                isDocQuery,
                isExplicitWebQuery,
                hasFiles: fileNames.length > 0,
                shouldForceFileSearch,
              });

              // BEST PRACTICE: When knowledge base exists, ALWAYS prioritize file_search
              // Web search should only be enabled when explicitly needed for external info
              nativeToolsConfig = {
                ...nativeToolsConfig,
                fileSearch: {
                  ...(typeof nativeToolsConfig?.fileSearch === "object"
                    ? nativeToolsConfig.fileSearch
                    : {}),
                  vectorStoreIds: [chatVectorStoreId],
                  // Increase max results for better coverage
                  maxResults: 10,
                },
                // CRITICAL: Disable web_search when forcing file_search
                // This prevents OpenAI from choosing web_search over file_search
                ...(shouldForceFileSearch && { webSearch: false }),
              };

              if (shouldForceFileSearch) {
                log.info(
                  `[AI] FORCING file_search: Disabled web_search for knowledge base query`,
                );
              }

              if (filesForPrompt.length > 0) {
                // IMPROVED: Provide richer context about files to help model decide
                const fileList = filesForPrompt
                  .map((f) => {
                    const sizeKB = Math.round((f.file_size || 0) / 1024);
                    return `- ${f.filename} (${sizeKB} KB)`;
                  })
                  .join("\n");

                // BEST PRACTICE: Give clear instructions on tool priority
                const knowledgeBaseContext = `

================================================================================
KNOWLEDGE BASE - UPLOADED DOCUMENTS (PRIORITY SOURCE)
================================================================================

The user has uploaded the following documents to this conversation's knowledge base:

${fileList}

CRITICAL INSTRUCTIONS FOR DOCUMENT QUERIES:
1. When the user asks about personal information, dates, names, certificates,
   degrees, work history, or ANY information that could be in these documents,
   you MUST use the file_search tool FIRST before attempting web search.

2. The file_search tool performs semantic search across ALL uploaded documents.
   Use specific queries to find relevant information.

3. If the user asks "when was my graduation?" or "what is my degree?" or similar
   personal questions, the answer is ONLY in their uploaded documents, NOT on the web.

4. Only use web_search for:
   - Current events or news
   - General knowledge questions NOT related to the user's documents
   - Information explicitly requested from the internet

CITATION REQUIREMENTS (MANDATORY):
5. ALWAYS cite your sources with inline references after EACH fact or statement.
6. Use this exact format: "El proyecto tiene X objetivo [Nombre_Documento.pdf, p. X]"
7. If file_search returns multiple results, cite ALL relevant sources.
8. Example: "La empresa fue fundada en 2020 [Informe.pdf, p. 1] y tiene 500 empleados [Informe.pdf, p. 3]"
9. NEVER provide information from documents without citing the specific page.
`;
                systemPrompt = systemPrompt + knowledgeBaseContext;
                log.info(
                  `[AI] Added Knowledge Base context with ${filesForPrompt.length} files to system prompt`,
                );
              }
            }
          }
          // HYBRID RAG: For non-OpenAI providers, inject document context directly into prompt
          // OpenAI/ChatGPT Plus uses native file_search but we ALSO inject local context for better citation support
          const useLocalRag = shouldUseLocalContext(modelId);
          // For OpenAI and ChatGPT Plus with documents, always inject local context for inline citations
          const isOpenAIOrChatGPTPlus =
            provider === "openai" || provider === "chatgpt-plus";
          const shouldInjectLocalContext =
            useLocalRag || (isOpenAIOrChatGPTPlus && shouldForceFileSearch);

          if (shouldInjectLocalContext) {
            log.info(
              `[AI] Using local RAG for ${modelId} (useLocalRag: ${useLocalRag}, isOpenAIOrChatGPTPlus: ${isOpenAIOrChatGPTPlus}, shouldForceFileSearch: ${shouldForceFileSearch}, provider: ${provider}) to enable inline citations`,
            );

            try {
              // Get document context for this chat
              const docContext = await getDocumentContext({
                chatId: input.chatId,
                query: input.prompt,
                userId: ctx.userId,
                searchContent: true,
                maxLength: 15000,
              });

              if (docContext.hasContext) {
                log.info(
                  `[AI] Injecting local document context: ${docContext.documentNames.length} docs, ${docContext.citations?.length || 0} citations`,
                );
                systemPrompt = systemPrompt + "\n" + docContext.contextText;

                // Store citations for later emission to frontend
                if (docContext.citations && docContext.citations.length > 0) {
                  // Emit document citations so frontend can render them with hover
                  const documentCitations = docContext.citations.map((c) => ({
                    type: "document_citation" as const,
                    id: c.citationId || 0,
                    filename: c.filename,
                    pageNumber: c.pageNumber,
                    text: c.text,
                    marker: c.citationMarker,
                  }));
                  emit({
                    type: "document_citations",
                    citations: documentCitations,
                  });
                }

                // If we have document context, prioritize it over web search
                if (docContext.totalDocuments > 0) {
                  shouldForceFileSearch = true; // Reuse flag to disable web search
                  log.info(
                    `[AI] Disabling web search in favor of local document context`,
                  );
                }
              } else {
                log.info(
                  `[AI] No document context found for chat ${input.chatId}`,
                );
              }
            } catch (docError) {
              log.error(`[AI] Failed to get document context:`, docError);
              // Continue without document context - don't fail the request
            }
          }

          const webSearchDecision = shouldForceFileSearch
            ? { enabled: false, forceWebSearch: false, contextSize: "low" as const }
            : shouldUseWebSearch(input.prompt);

          // Track if we should force web search tool usage (when user explicitly commands it)
          let shouldForceWebSearch = webSearchDecision.forceWebSearch && !shouldForceFileSearch;

          // ALWAYS include web_search as available tool - model should decide when to use it
          // The heuristics only determine if we FORCE the model to use it (tool_choice)
          // This prevents the model from using spreadsheet/chart tools for web queries
          nativeToolsConfig = {
            ...nativeToolsConfig,
            webSearch: {
              ...(typeof nativeToolsConfig?.webSearch === "object"
                ? nativeToolsConfig.webSearch
                : {}),
              searchContextSize: webSearchDecision.contextSize || "medium",
            },
          };

          log.info(`[AI] Web search decision:`, { ...webSearchDecision, shouldForceWebSearch });
          log.info(
            `[AI] Building native tools with config:`,
            JSON.stringify(nativeToolsConfig, null, 2),
          );

          // Pass provider so we use correct tool format (web_search vs web_search_preview)
          const nativeTools = buildNativeTools(
            modelId,
            nativeToolsConfig,
            provider,
          );
          const allTools: ToolParam[] = [...functionTools, ...nativeTools];

          log.info(
            `[AI] Tools: ${allTools.length} (${functionTools.length} function, ${nativeTools.length} native)`,
          );
          log.info(`[AI] shouldForceFileSearch: ${shouldForceFileSearch}`);
          log.info(
            `[AI] Native tools types: ${nativeTools.map((t: any) => t.type).join(", ")}`,
          );

          // Log native tools detail for debugging
          if (nativeTools.length > 0) {
            log.info(
              `[AI] Native tools detail:`,
              JSON.stringify(nativeTools, null, 2),
            );
          }

          if (provider === "claude") {
            // Get Claude OAuth token (priority) or fallback to API key
            const claudeAuth = getClaudeCodeAuthManager();
            const claudeToken = await claudeAuth.getValidToken();
            const anthropicKey = getSecureApiKeyStore().getAnthropicKey();

            if (!claudeToken && !anthropicKey) {
              throw new Error(
                "Claude Code not connected. Please connect your Claude account in Settings > API Keys.",
              );
            }

            log.info(`[AI] Claude auth: oauthToken=${!!claudeToken}, apiKey=${!!anthropicKey}`);
            log.info(`[AI] Using Claude Agent SDK (simple chat, native tools only)`);

            // Map reasoning config for Claude SDK
            // Claude SDK uses maxThinkingTokens instead of effort levels
            const claudeReasoning = input.reasoning
              ? {
                  effort: input.reasoning.effort as 'low' | 'medium' | 'high' | 'none',
                }
              : undefined;

            await streamWithClaudeAgentSDK({
              chatId: input.chatId,
              prompt: input.prompt,
              modelId: apiModelId,
              systemPrompt,
              messages: input.messages?.map((message) => ({
                role: message.role,
                content: message.content,
              })),
              images: input.images,
              authToken: claudeToken || undefined,
              apiKey: anthropicKey || undefined,
              signal: abortController.signal,
              reasoning: claudeReasoning,
            });

            activeStreams.delete(input.chatId);
            return;
          }

          // ResponseMode Thinking: paso 1 — plan (solo openai/chatgpt-plus)
          let planText = "";
          if (
            chosenMode === "thinking" &&
            (provider === "openai" || provider === "chatgpt-plus")
          ) {
            try {
              const planRes = await openaiClient!.responses.create({
                model: apiModelId,
                input: toResponsesMessages(
                  input.messages || [],
                  input.prompt,
                  input.images,
                ),
                instructions:
                  systemPrompt +
                  "\n\n[Este paso únicamente] Extrae requerimientos, riesgos y un plan en bullets. Responde solo con eso.",
                reasoning: { effort: "low", summary: "auto" },
                max_output_tokens: 250,
                store: false,
              } as any);
              planText =
                (planRes as { output_text?: string }).output_text || "";
              log.info(`[AI] Plan step OK, ${planText.length} chars`);
            } catch (e) {
              log.warn("[AI] Plan step failed, continuing without plan", e);
            }
          }
          const effectiveInstructions = planText
            ? systemPrompt +
              "\n\nPLAN:\n" +
              planText +
              "\n\nUsa este plan. Checklist: precisión, supuestos explícitos, pasos concretos."
            : systemPrompt;

          // Build messages
          const messages = toResponsesMessages(
            input.messages || [],
            input.prompt,
            input.images,
          );

          // For Chat Completions providers (Z.AI, Cerebras, Groq), check if model supports images
          const chatCompletionsSupportsImages = modelDef?.supportsImages ?? true;
          const chatMessages =
            provider === "zai" || provider === "cerebras" || provider === "groq"
              ? toChatMessages(
                  systemPrompt,
                  input.messages || [],
                  input.prompt,
                  input.images,
                  {
                    supportsImages: chatCompletionsSupportsImages,
                    maxHistoricalImages: 10,
                    // Groq does not support the `detail` parameter in image_url
                    includeImageDetail: provider !== "groq",
                  },
                )
              : null;

          // Determine reasoning config (ResponseMode override para GPT-5.2)
          // For GPT-5.2 in auto mode: always show some reasoning (user feedback)
          // - "instant" now uses "low" effort instead of "none" to always show reasoning
          // - "thinking" uses "high" effort for complex analysis
          const reasoningConfig: ReasoningConfig | undefined =
            provider === "zai"
              ? undefined
              : chosenMode === "instant"
                ? { effort: "low", summary: "auto" } // Changed: always generate reasoning
                : chosenMode === "thinking"
                  ? { effort: "high", summary: "auto" }
                  : modelDef?.supportsReasoning
                    ? input.reasoning
                    : undefined;

          log.info(`[AI] Final reasoning config:`, reasoningConfig);

          let currentStepNumber = 0;
          let fullText = "";
          let fullReasoningSummary = "";
          let currentResponseId = sanitizeOpenAiResponseId(
            input.previousResponseId,
          );
          let pendingToolCalls: PendingToolCall[] = [];
          const usageTotals = {
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
          };

          const runChatCompletionsAgentLoop = async () => {
            // Z.AI now supports images via OpenAI-compatible multimodal format
            if (input.images?.length) {
              log.info(
                `[AI] ${provider} processing ${input.images.length} image(s) in multimodal format`,
              );
              // Log image details for debugging
              for (const img of input.images) {
                const sizeKB = Math.round((img.data.length * 3) / 4 / 1024);
                log.info(`[AI] Image: ${img.mediaType}, ~${sizeKB}KB base64, model supportsImages=${modelDef?.supportsImages}`);
              }
              // Log whether chatMessages includes multimodal content
              if (chatMessages) {
                const multimodalMsgs = chatMessages.filter((m: any) => Array.isArray(m.content));
                log.info(`[AI] chatMessages total=${chatMessages.length}, multimodal=${multimodalMsgs.length}`);
              }
            }

            // When web search is enabled for Z.AI, exclude function tools
            // This forces the model to use web_search instead of spreadsheet/doc tools
            const isWebSearchMode =
              provider === "zai" && webSearchDecision.enabled;
            const chatFunctionTools = isWebSearchMode
              ? []
              : toChatCompletionTools(functionTools);

            // For Z.AI, we need to pass native tools (like web_search) as-is
            // The Chat Completions API accepts both function tools AND native tools
            const zaiNativeTools = provider === "zai" ? nativeTools : [];
            const chatTools = [
              ...chatFunctionTools,
              ...zaiNativeTools,
            ] as OpenAI.ChatCompletionTool[];

            log.info(
              `[AI] Chat tools mode: isWebSearchMode=${isWebSearchMode}, functionTools=${chatFunctionTools.length}, nativeTools=${zaiNativeTools.length}, total=${chatTools.length}`,
            );

            while (currentStepNumber < MAX_AGENT_STEPS) {
              currentStepNumber++;
              const stepStartTime = Date.now();
              log.info(
                `[AI] ${provider} step ${currentStepNumber} starting...`,
              );
              log.info(
                `[AI] ${provider} request: model=${modelId}, messages=${chatMessages?.length || 0}, tools=${chatTools.length}`,
              );
              if (chatMessages && chatMessages.length > 0) {
                log.info(
                  `[AI] ${provider} first message role: ${chatMessages[0]?.role}`,
                );
              }

              const zaiThinkingEnabled =
                provider === "zai" &&
                modelDef?.supportsReasoning &&
                (input.mode === "plan" ||
                  input.reasoning?.effort === "medium" ||
                  input.reasoning?.effort === "high");

              // Determine tool_choice for Chat Completions API
              // Force web_search when user explicitly commands it (prevents model from asking questions)
              let chatToolChoice: any = chatTools.length > 0 ? "auto" : undefined;
              if (shouldForceWebSearch && !shouldForceFileSearch && currentStepNumber === 1 && chatTools.length > 0) {
                // For Z.AI and other Chat Completions providers, force web_search by name
                const hasWebSearchTool = chatTools.some((t: any) => t.type === "web_search" || t.function?.name === "web_search");
                if (hasWebSearchTool) {
                  chatToolChoice = { type: "function", function: { name: "web_search" } };
                  log.info(`[AI] Forcing web_search tool_choice for ${provider}`);
                }
              }

              const params: any = {
                model: apiModelId,
                messages: chatMessages || [],
                tools: chatTools.length > 0 ? chatTools : undefined,
                tool_choice: chatToolChoice,
                stream: true,
                // CRITICAL: Force immediate streaming without buffering
                // This ensures tokens arrive as soon as they're generated
                stream_options: {
                  include_usage: true, // Include usage in final chunk
                },
              };

              if (provider === "zai") {
                params.thinking = zaiThinkingEnabled
                  ? { type: "enabled", clear_thinking: false }
                  : { type: "disabled" };
              }

              // Cerebras reasoning params
              // @see https://inference-docs.cerebras.ai - Reasoning section
              if (provider === "cerebras" && modelDef?.supportsReasoning) {
                // Use 'parsed' so reasoning comes in separate delta.reasoning field
                params.reasoning_format = "parsed";

                // gpt-oss-120b supports reasoning_effort (low/medium/high)
                if (modelId === "gpt-oss-120b" && reasoningConfig?.effort && reasoningConfig.effort !== "none") {
                  params.reasoning_effort = reasoningConfig.effort;
                }
              }

              // Groq reasoning params
              // @see https://console.groq.com/docs/reasoning
              if (provider === "groq" && modelDef?.supportsReasoning) {
                const apiModel = modelDef.modelIdForApi || modelId;
                // GPT-OSS models: use include_reasoning + reasoning_effort (low/medium/high)
                if (apiModel.startsWith("openai/gpt-oss")) {
                  params.include_reasoning = true;
                  if (reasoningConfig?.effort && reasoningConfig.effort !== "none") {
                    params.reasoning_effort = reasoningConfig.effort;
                  }
                }
                // Qwen 3: use reasoning_format ('parsed') + reasoning_effort ('none'|'default')
                else if (apiModel.startsWith("qwen/")) {
                  params.reasoning_format = "parsed";
                  // Map our effort levels to Qwen's supported values
                  if (reasoningConfig?.effort === "none") {
                    params.reasoning_effort = "none";
                  } else {
                    params.reasoning_effort = "default";
                  }
                }
              }

              // Pre-check Cerebras rate limits before making the request
              if (provider === "cerebras") {
                const limitMsg = cerebrasCheck(modelId);
                if (limitMsg) {
                  log.warn(`[AI] Cerebras pre-check failed for ${modelId}: ${limitMsg}`);
                  throw new Error(limitMsg);
                }
              }

              // Pre-check Groq rate limits before making the request
              if (provider === "groq") {
                const apiModel = modelDef?.modelIdForApi || modelId;
                const limitMsg = groqCheck(apiModel);
                if (limitMsg) {
                  log.warn(`[AI] Groq pre-check failed for ${apiModel}: ${limitMsg}`);
                  throw new Error(limitMsg);
                }
              }

              let stream: any;
              try {
                stream = await withRetry(
                  `${provider}.chat.completions.create`,
                  abortController.signal,
                  0,
                  (signal) =>
                    openaiClient!.chat.completions.create(params, {
                      signal,
                      timeout: DEFAULT_REQUEST_TIMEOUT_MS,
                    }) as any,
                );
              } catch (err) {
                // Handle Cerebras 402 Payment Required errors with clear messaging
                if (provider === "cerebras" && err instanceof Error && (err as any).status === 402) {
                  log.error("[AI] Cerebras 402 Payment Required - likely using Team org key instead of Personal");
                  throw new Error(
                    "Cerebras API returned 402 (Payment Required). This usually means you're using an API key from a Team organization that requires credits. Go to cloud.cerebras.ai, switch to your Personal account, and copy that API key instead. The free tier (1M tokens/day) is only available on Personal accounts."
                  );
                }
                // Handle Cerebras 429 Rate Limit errors
                if (provider === "cerebras" && err instanceof Error && (err as any).status === 429) {
                  log.warn(`[AI] Cerebras 429 rate limit hit for model ${modelId}`);
                  throw new Error(
                    "Cerebras rate limit exceeded. Free tier limits per model: 60K tokens/min, 30 requests/min, 1M tokens/day. Wait a moment or switch to another model."
                  );
                }
                // Handle Groq 429 Rate Limit errors
                if (provider === "groq" && err instanceof Error && (err as any).status === 429) {
                  const apiModel = modelDef?.modelIdForApi || modelId;
                  const limits = groqGetLimits(apiModel);
                  log.warn(`[AI] Groq 429 rate limit hit for model ${apiModel}`);
                  throw new Error(
                    `Groq rate limit exceeded for ${apiModel}. Limits: ${limits.TPM.toLocaleString()} tokens/min, ${limits.RPM} requests/min, ${limits.TPD.toLocaleString()} tokens/day. Wait a moment or switch to another model.`
                  );
                }
                // Handle Z.AI billing/quota errors with graceful fallbacks
                if (provider === "zai" && isZaiBillingError(err)) {
                  // 1) If using coding endpoint, fall back to general endpoint
                  if (zaiBaseURL === ZAI_CODING_BASE_URL) {
                    log.warn(
                      "[AI] Z.AI coding endpoint billing error - falling back to general endpoint",
                    );
                    zaiBaseURL = ZAI_GENERAL_BASE_URL;
                    openaiClient = getOrCreateClient({
                      apiKey: input.apiKey!,
                      baseURL: zaiBaseURL,
                      defaultHeaders: { "X-Source": ZAI_SOURCE_HEADER },
                    });
                    try {
                      stream = await withRetry(
                        `${provider}.chat.completions.create`,
                        abortController.signal,
                        0,
                        (signal) =>
                          openaiClient!.chat.completions.create(params, {
                            signal,
                            timeout: DEFAULT_REQUEST_TIMEOUT_MS,
                          }) as any,
                      );
                    } catch (retryErr) {
                      // If still a billing error, proceed to model fallback
                      if (!isZaiBillingError(retryErr)) throw retryErr;
                    }
                  }
                  // 2) Fallback to free model GLM-4.7-Flash if not already using it
                  if (params.model !== "GLM-4.7-Flash") {
                    log.warn(
                      "[AI] Z.AI billing/quota error - switching to free model GLM-4.7-Flash",
                    );
                    params.model = "GLM-4.7-Flash";
                    stream = await withRetry(
                      `${provider}.chat.completions.create`,
                      abortController.signal,
                      0,
                      (signal) =>
                        openaiClient!.chat.completions.create(params, {
                          signal,
                          timeout: DEFAULT_REQUEST_TIMEOUT_MS,
                        }) as any,
                    );
                  } else {
                    // Already on free model; cannot recover
                    throw err;
                  }
                } else {
                  throw err;
                }
              }

              const toolCallMap = new Map<
                string,
                { id: string; name: string; args: string }
              >();
              let lastChunk: any = null;
              let stepReasoning = "";

              // Process stream chunks immediately without buffering
              // This ensures fastest possible token-by-token delivery
              for await (const chunk of stream as any) {
                lastChunk = chunk;
                const delta = chunk.choices?.[0]?.delta;
                
                // Skip empty chunks but process immediately when content arrives
                if (!delta) {
                  // Check for finish reason or usage in non-delta chunks
                  if (chunk.choices?.[0]?.finish_reason) {
                    log.debug(`[AI] Stream finished: ${chunk.choices[0].finish_reason}`);
                  }
                  continue;
                }

                // CRITICAL: Emit text deltas immediately as they arrive
                // No buffering - each token is sent to renderer instantly
                if (delta.content) {
                  fullText += delta.content;
                  // Emit immediately without waiting for more chunks
                  emit({ type: "text-delta", delta: delta.content });
                }

                const reasoningDelta =
                  (delta as any).reasoning ||
                  (delta as any).reasoning_summary ||
                  (delta as any).reasoning_content;
                if (
                  typeof reasoningDelta === "string" &&
                  reasoningDelta.length > 0
                ) {
                  fullReasoningSummary += reasoningDelta;
                  stepReasoning += reasoningDelta;
                  emit({
                    type: "reasoning-summary-delta",
                    delta: reasoningDelta,
                    summaryIndex: 0,
                  });
                }

                if (delta.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    const callId =
                      toolCall.id ||
                      `${chunk.id}-${toolCall.index ?? toolCallMap.size}`;
                    if (!toolCallMap.has(callId)) {
                      toolCallMap.set(callId, {
                        id: callId,
                        name: toolCall.function?.name || "tool",
                        args: "",
                      });
                      emit({
                        type: "tool-call-start",
                        toolCallId: callId,
                        toolName: toolCall.function?.name || "tool",
                      });
                    }

                    const entry = toolCallMap.get(callId);
                    if (!entry) continue;

                    if (toolCall.function?.name) {
                      entry.name = toolCall.function.name;
                    }

                    if (toolCall.function?.arguments) {
                      entry.args += toolCall.function.arguments;
                      emit({
                        type: "tool-call-delta",
                        toolCallId: callId,
                        argsDelta: toolCall.function.arguments,
                      });
                    }
                  }
                }
              }

              const finalCompletion =
                typeof (stream as any).finalChatCompletion === "function"
                  ? await (stream as any).finalChatCompletion()
                  : null;
              const completionUsage = finalCompletion?.usage;
              if (completionUsage) {
                usageTotals.promptTokens += completionUsage.prompt_tokens || 0;
                usageTotals.completionTokens +=
                  completionUsage.completion_tokens || 0;
                usageTotals.reasoningTokens +=
                  (completionUsage as any).completion_tokens_details
                    ?.reasoning_tokens || 0;
              }
              // Fallback: usage en el último chunk (común en Chat Completions streaming)
              if (
                usageTotals.promptTokens === 0 &&
                usageTotals.completionTokens === 0 &&
                lastChunk?.usage
              ) {
                usageTotals.promptTokens = lastChunk.usage.prompt_tokens || 0;
                usageTotals.completionTokens =
                  lastChunk.usage.completion_tokens || 0;
                usageTotals.reasoningTokens =
                  (lastChunk.usage as any).completion_tokens_details
                    ?.reasoning_tokens || 0;
              }

              const zaiWebSearchResults =
                provider === "zai"
                  ? getZaiWebSearchResults(
                      finalCompletion as OpenAI.ChatCompletion,
                    )
                  : [];

              if (fullReasoningSummary.length > 0) {
                emit({
                  type: "reasoning-summary-done",
                  text: fullReasoningSummary,
                  summaryIndex: 0,
                });
              }

              if (toolCallMap.size === 0) {
                if (provider === "zai" && zaiWebSearchResults.length > 0) {
                  const searchId = `zai-web-${currentStepNumber}-${Date.now()}`;
                  const urls = zaiWebSearchResults
                    .map((result) => result.url || "")
                    .filter(Boolean);
                  emit({
                    type: "web-search-start",
                    searchId,
                    query: input.prompt,
                  });
                  emit({
                    type: "web-search-done",
                    searchId,
                    query: input.prompt,
                    domains: getDomainsFromUrls(urls),
                  });

                  const annotations =
                    buildZaiWebSearchAnnotations(zaiWebSearchResults);
                  if (annotations.length > 0) {
                    emit({ type: "annotations", annotations });
                  }
                }

                emit({
                  type: "step-complete",
                  stepNumber: currentStepNumber,
                  hasMoreSteps: false,
                });
                log.info(
                  `[AI] ${provider} step ${currentStepNumber} complete in ${Date.now() - stepStartTime}ms`,
                );
                break;
              }

              const toolCalls = Array.from(toolCallMap.values());
              const toolCallPayload = toolCalls.map((toolCall) => ({
                id: toolCall.id,
                type: "function" as const,
                function: {
                  name: toolCall.name,
                  arguments: toolCall.args,
                },
              }));

              chatMessages?.push({
                role: "assistant",
                content: null,
                tool_calls: toolCallPayload,
                ...(provider === "zai" && stepReasoning
                  ? { reasoning_content: stepReasoning }
                  : {}),
              } as any);

              await Promise.all(
                toolCalls.map(async (toolCall) => {
                  let parsedArgs: unknown = {};
                  try {
                    parsedArgs = toolCall.args ? JSON.parse(toolCall.args) : {};
                  } catch (error) {
                    log.warn(
                      `[AI] Failed to parse ${provider} tool args, passing raw string`,
                    );
                    parsedArgs = { raw: toolCall.args };
                  }

                  emit({
                    type: "tool-call-done",
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    args: parsedArgs,
                  });

                  try {
                    const executor = executors.get(toolCall.name);
                    if (executor) {
                      const result = await executor(parsedArgs);
                      const success = !(
                        result &&
                        typeof result === "object" &&
                        "error" in result
                      );
                      emit({
                        type: "tool-result",
                        toolCallId: toolCall.id,
                        toolName: toolCall.name,
                        result,
                        success,
                      });

                      chatMessages?.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result),
                      } as OpenAI.ChatCompletionMessageParam);
                    }
                  } catch (err) {
                    const errorMsg =
                      err instanceof Error ? err.message : "Unknown error";
                    log.error(
                      `[AI] Tool execution error for ${toolCall.name}:`,
                      err,
                    );
                    emit({
                      type: "tool-result",
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      result: { error: errorMsg },
                      success: false,
                    });

                    chatMessages?.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
                      content: JSON.stringify({ error: errorMsg }),
                    } as OpenAI.ChatCompletionMessageParam);
                  }
                }),
              );

              emit({
                type: "step-complete",
                stepNumber: currentStepNumber,
                hasMoreSteps: true,
              });
            }

            emit({ type: "text-done", text: fullText });

            // Generate suggestions BEFORE emitting finish (so listener is still active)
            if (fullText && !abortController.signal.aborted) {
              const suggestionApiKey =
                input.apiKey || getSecureApiKeyStore().getOpenAIKey();
              if (suggestionApiKey) {
                try {
                  const suggestions = await generateSuggestions(
                    fullText,
                    input.messages || [],
                    suggestionApiKey,
                    (provider as string) === "zai"
                      ? zaiBaseURL || undefined
                      : (provider as string) === "cerebras"
                        ? "https://api.cerebras.ai/v1"
                        : (provider as string) === "groq"
                          ? "https://api.groq.com/openai/v1"
                          : undefined,
                  );
                  if (
                    suggestions.length > 0 &&
                    !abortController.signal.aborted
                  ) {
                    emit({ type: "suggestions", suggestions });
                  }
                } catch (err) {
                  log.error("[AI] Failed to generate suggestions:", err);
                  // Emit default suggestions on error
                  emit({
                    type: "suggestions",
                    suggestions: [
                      "Create spreadsheet",
                      "Visualize data",
                      "Generate chart",
                      "Analyze trends",
                    ],
                  });
                }
              } else {
                emit({
                  type: "suggestions",
                  suggestions: [
                    "Create spreadsheet",
                    "Visualize data",
                    "Generate chart",
                    "Analyze trends",
                  ],
                });
              }
            }

            // Track Cerebras per-model usage and always emit status to frontend
            if (provider === "cerebras") {
              cerebrasTrack(modelId, usageTotals.promptTokens, usageTotals.completionTokens);
              const status = cerebrasStatus(modelId);
              const pct = Math.round(status.maxPct * 100);
              const remainingTPD = Math.max(0, CEREBRAS_LIMITS.TPD - status.tpdUsed);
              log.info(`[AI] Cerebras usage for ${modelId}: TPM ${Math.round(status.tpmPct * 100)}%, TPD ${Math.round(status.tpdPct * 100)}%, RPM ${Math.round(status.rpmPct * 100)}% (highest: ${status.maxDimension} at ${pct}%)`);

              const dimLabels: Record<string, string> = {
                TPM: "tokens/min", TPH: "tokens/hour", TPD: "tokens/day",
                RPM: "requests/min", RPH: "requests/hour", RPD: "requests/day",
              };
              const dimLabel = dimLabels[status.maxDimension] || status.maxDimension;
              const message = status.maxPct >= 1
                ? `Cerebras ${dimLabel} limit reached for ${modelId}. Switch to another provider/model or wait.`
                : status.maxPct >= CEREBRAS_WARNING_THRESHOLD
                  ? `Cerebras ${modelId} at ${pct}% of ${dimLabel} limit. Consider switching provider or model.`
                  : "";

              // Always emit usage status so frontend can update the progress bar
              emit({
                type: "rate-limit-warning",
                provider: "cerebras",
                message,
                usagePercent: pct,
                remainingTokens: remainingTPD,
                dailyLimit: CEREBRAS_LIMITS.TPD,
              });
            }

            // Track Groq per-model usage and emit warning if approaching any limit
            if (provider === "groq") {
              const apiModel = modelDef?.modelIdForApi || modelId;
              groqTrack(apiModel, usageTotals.promptTokens, usageTotals.completionTokens);
              const status = groqStatus(apiModel);
              const limits = groqGetLimits(apiModel);
              const pct = Math.round(status.maxPct * 100);
              const remainingTPD = Math.max(0, limits.TPD - status.tpdUsed);
              log.info(`[AI] Groq usage for ${apiModel}: TPM ${Math.round(status.tpmPct * 100)}%, TPD ${Math.round(status.tpdPct * 100)}%, RPM ${Math.round(status.rpmPct * 100)}% (highest: ${status.maxDimension} at ${pct}%)`);

              // Always emit per-model usage for all tracked Groq models
              const modelsUsage: Array<{ model: string; tpdUsed: number; tpdLimit: number; tpmPct: number }> = [];
              for (const [m, _usage] of groqUsage) {
                const mStatus = groqStatus(m);
                const mLimits = groqGetLimits(m);
                modelsUsage.push({
                  model: m,
                  tpdUsed: mStatus.tpdUsed,
                  tpdLimit: mLimits.TPD,
                  tpmPct: Math.round(mStatus.tpmPct * 100),
                });
              }
              emit({ type: "groq-model-usage", models: modelsUsage });

              // Keep existing rate-limit-warning + toast for >= 90%
              if (status.maxPct >= GROQ_WARNING_THRESHOLD) {
                const dimLabels: Record<string, string> = {
                  TPM: "tokens/min", TPD: "tokens/day",
                  RPM: "requests/min", RPD: "requests/day",
                };
                const dimLabel = dimLabels[status.maxDimension] || status.maxDimension;
                emit({
                  type: "rate-limit-warning",
                  provider: "groq",
                  message: status.maxPct >= 1
                    ? `Groq ${dimLabel} limit reached for ${apiModel}. Switch to another provider/model or wait.`
                    : `Groq ${apiModel} at ${pct}% of ${dimLabel} limit. Consider switching provider or model.`,
                  usagePercent: pct,
                  remainingTokens: remainingTPD,
                  dailyLimit: limits.TPD,
                });
              }
            }

            emit({
              type: "finish",
              usage: {
                promptTokens: usageTotals.promptTokens,
                completionTokens: usageTotals.completionTokens,
                reasoningTokens: usageTotals.reasoningTokens,
              },
              totalSteps: currentStepNumber,
            });
          };

          if (provider === "zai" || provider === "cerebras" || provider === "groq") {
            // Z.AI, Cerebras, and Groq use Chat Completions API (OpenAI-compatible)
            // They don't support OpenAI's Responses API
            await runChatCompletionsAgentLoop();
            return;
          }

          // Agent loop
          while (currentStepNumber < MAX_AGENT_STEPS) {
            currentStepNumber++;
            const stepStartTime = Date.now();
            log.info(`[AI] Step ${currentStepNumber} starting...`);

            // Build input for this iteration
            let inputForRequest: Responses.ResponseCreateParams["input"];

            if (currentResponseId && pendingToolCalls.length > 0) {
              // Submit tool outputs
              inputForRequest = pendingToolCalls.map((tc) => ({
                type: "function_call_output" as const,
                call_id: tc.callId,
                output: tc.arguments, // This contains the result after execution
              }));
            } else {
              inputForRequest = messages;
            }

            // Build optimization options (ResponseMode override para Instant/Thinking)
            const optimization = input.optimization || {};
            // When images are present, we need more tokens for tool calls (spreadsheet data can be large)
            // instant: 350 (text only), thinking: 1400, with images: 8000 minimum
            let maxOutputTokens: number | undefined;
            if (hasImages) {
              // Images typically mean spreadsheet/table extraction which needs lots of tokens
              maxOutputTokens = Math.max(
                8000,
                optimization.maxOutputTokens || 8000,
              );
            } else if (chosenMode === "instant") {
              maxOutputTokens = 350;
            } else if (chosenMode === "thinking") {
              maxOutputTokens = 1400;
            } else {
              maxOutputTokens = optimization.maxOutputTokens;
            }
            const truncation = optimization.truncation?.type || "auto";
            const promptCacheKey = optimization.promptCacheKey || input.chatId;
            const promptCacheRetention = optimization.promptCacheRetention;
            const supportsOpenAiOptimizations = provider === "openai";

            // Build tools array - ONLY include file_search when forcing it
            // This completely removes web_search from available tools
            let toolsForRequest = allTools;

            // ChatGPT Plus/Codex endpoint supports function tools + web_search
            // Filter out unsupported native tools (file_search, code_interpreter)
            // but keep web_search (which we already converted from web_search_preview)
            if (provider === "chatgpt-plus") {
              toolsForRequest = allTools.filter(
                (t: any) => t.type === "function" || t.type === "web_search",
              );
              log.info(
                `[AI] ChatGPT Plus: Filtered to function + web_search tools, count: ${toolsForRequest.length}`,
              );
            } else if (shouldForceFileSearch && currentStepNumber === 1) {
              // Filter out web_search_preview to ensure model can ONLY use file_search
              toolsForRequest = allTools.filter(
                (t: any) =>
                  t.type !== "web_search_preview" && t.type !== "web_search",
              );
              log.info(
                `[AI] Removed web_search from tools, remaining: ${toolsForRequest.map((t: any) => t.type).join(", ")}`,
              );
            }

            // Stream the response using the official SDK
            // Note: ChatGPT Plus/Codex endpoint has limited parameter support
            const streamParams: any = {
              model: apiModelId,
              input: inputForRequest,
              tools: toolsForRequest.length > 0 ? toolsForRequest : undefined,
              instructions: effectiveInstructions,
              store: supportsOpenAiOptimizations,
              ...(currentResponseId && {
                previous_response_id: currentResponseId,
              }),
              reasoning: reasoningConfig
                ? {
                    effort: reasoningConfig.effort,
                    summary: reasoningConfig.summary,
                  }
                : undefined,
              // Cost optimization parameters
              ...(maxOutputTokens && { max_output_tokens: maxOutputTokens }),
              // Truncation - only supported by OpenAI
              ...(supportsOpenAiOptimizations && { truncation: truncation }),
              // Prompt caching - only supported by OpenAI
              ...(supportsOpenAiOptimizations && {
                prompt_cache_key: promptCacheKey,
              }),
              ...(supportsOpenAiOptimizations &&
                promptCacheRetention && {
                  prompt_cache_retention: promptCacheRetention,
                }),
              // Use flex processing if requested (50% cost savings) - only for OpenAI
              ...(supportsOpenAiOptimizations &&
                optimization.useFlex && { service_tier: "flex" }),
              // Force file_search tool when query is about uploaded documents
              // Only on first step to avoid interfering with tool result handling
              ...(shouldForceFileSearch &&
                currentStepNumber === 1 && {
                  tool_choice: { type: "file_search" },
                }),
              // Force web_search tool when user explicitly commands web search
              // This prevents the model from asking clarifying questions instead of searching
              ...(shouldForceWebSearch &&
                !shouldForceFileSearch &&
                currentStepNumber === 1 && {
                  tool_choice: { type: provider === "chatgpt-plus" ? "web_search" : "web_search_preview" },
                }),
            };

            // Determine which tool_choice will be used for logging
            const effectiveToolChoice = shouldForceFileSearch && currentStepNumber === 1
              ? "file_search"
              : shouldForceWebSearch && currentStepNumber === 1
                ? (provider === "chatgpt-plus" ? "web_search" : "web_search_preview")
                : "auto";

            log.info(
              `[AI] Stream params: maxOutputTokens=${maxOutputTokens}, truncation=${truncation}, flex=${!!optimization.useFlex}, prompt_cache_key=${promptCacheKey}, prompt_cache_retention=${promptCacheRetention || "default"}, tool_choice=${effectiveToolChoice}, tools=${toolsForRequest.map((t: any) => t.type).join(", ")}`,
            );

            const requestTimeoutMs =
              supportsOpenAiOptimizations && optimization.useFlex
                ? FLEX_REQUEST_TIMEOUT_MS
                : DEFAULT_REQUEST_TIMEOUT_MS;

            // Build request options
            // Note: ChatGPT Plus auth headers are handled in custom fetch
            const requestOptions = {
              // Increase timeout for flex processing (can be slower)
              timeout: requestTimeoutMs,
            };

            const stream: any = await withRetry(
              "responses.stream",
              abortController.signal,
              0,
              async (signal) =>
                openaiClient!.responses.stream(streamParams, {
                  ...(requestOptions as any),
                  signal,
                }) as any,
            );

            pendingToolCalls = [];
            let hasToolCalls = false;

            // Handle stream events
            stream
              .on("response.created", (event: any) => {
                log.info(
                  `[AI] Stream: response.created, id=${event.response.id}`,
                );
                currentResponseId = event.response.id;
              })
              .on("response.output_text.delta", (event: any) => {
                fullText += event.delta;
                emit({ type: "text-delta", delta: event.delta });
              })
              .on("response.reasoning_summary_text.delta", (event: any) => {
                if (fullReasoningSummary.length === 0) {
                  log.info(`[AI] Stream: First reasoning delta received`);
                }
                fullReasoningSummary += event.delta;
                emit({
                  type: "reasoning-summary-delta",
                  delta: event.delta,
                  summaryIndex: event.summary_index,
                });
              })
              .on("response.reasoning_summary_text.done", (event: any) => {
                log.info(
                  `[AI] Stream: Reasoning summary done, ${event.text?.length || 0} chars`,
                );
                emit({
                  type: "reasoning-summary-done",
                  text: event.text,
                  summaryIndex: event.summary_index,
                });
              })
              .on("response.output_item.done", (event: any) => {
                log.info(`[AI] output_item.done - type: ${event.item.type}`);

                if (event.item.type === "function_call") {
                  const functionCall =
                    event.item as Responses.ResponseFunctionToolCall;
                  hasToolCalls = true;

                  emit({
                    type: "tool-call-start",
                    toolCallId: functionCall.call_id,
                    toolName: functionCall.name,
                  });

                  // Safely parse arguments - may be truncated if response hit max_output_tokens
                  let parsedArgs: unknown = {};
                  try {
                    parsedArgs = functionCall.arguments
                      ? JSON.parse(functionCall.arguments)
                      : {};
                  } catch (parseError) {
                    log.error(
                      `[AI] Failed to parse function_call arguments for ${functionCall.name}: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
                    );
                    log.warn(
                      `[AI] Raw arguments (first 500 chars): ${functionCall.arguments?.slice(0, 500)}`,
                    );
                    // Use raw string wrapped so tool can handle gracefully
                    parsedArgs = {
                      _parseError: true,
                      raw: functionCall.arguments,
                    };
                  }

                  emit({
                    type: "tool-call-done",
                    toolCallId: functionCall.call_id,
                    toolName: functionCall.name,
                    args: parsedArgs,
                  });

                  pendingToolCalls.push({
                    callId: functionCall.call_id,
                    name: functionCall.name,
                    arguments: functionCall.arguments,
                    parsedArgs, // Store parsed args to avoid re-parsing
                  });
                }

                if (event.item.type === "message") {
                  const messageItem = event.item as any;
                  log.info(
                    `[AI] Message item done, content count: ${messageItem.content?.length || 0}`,
                  );
                  log.info(
                    `[AI] Message item raw:`,
                    JSON.stringify(messageItem, null, 2),
                  );

                  const allAnnotations: any[] = [];
                  for (const content of messageItem.content || []) {
                    log.info(
                      `[AI] Content item type: ${content?.type}, has annotations: ${!!content?.annotations}, count: ${content?.annotations?.length || 0}`,
                    );
                    if (
                      content?.annotations &&
                      content.annotations.length > 0
                    ) {
                      allAnnotations.push(...content.annotations);
                    }
                  }

                  if (allAnnotations.length > 0) {
                    log.info(
                      `[AI] Total annotations found: ${allAnnotations.length}`,
                    );
                    const urlCitations = allAnnotations
                      .filter((a: any) => a.type === "url_citation")
                      .map((a: any) => ({
                        type: "url_citation" as const,
                        url: a.url,
                        title: a.title,
                        startIndex: a.start_index,
                        endIndex: a.end_index,
                      }));

                    if (urlCitations.length > 0) {
                      log.info(
                        `[AI] Emitting ${urlCitations.length} URL citations`,
                      );
                      emit({ type: "annotations", annotations: urlCitations });
                    }
                  }
                }
              })
              .on("response.web_search_call.in_progress", (event: any) => {
                const wsEvent = event as any;
                const { action, query, domains, url } =
                  extractWebSearchDetails(wsEvent);
                emit({
                  type: "web-search-start",
                  searchId: event.item_id,
                  action,
                  query,
                  domains,
                  url,
                });
              })
              .on("response.web_search_call.searching", (event: any) => {
                const wsEvent = event as any;
                const { action, query, domains, url } =
                  extractWebSearchDetails(wsEvent);
                emit({
                  type: "web-search-searching",
                  searchId: event.item_id,
                  action,
                  query,
                  domains,
                  url,
                });
              })
              .on("response.web_search_call.completed", (event: any) => {
                const wsEvent = event as any;
                const { action, query, domains, url, sources } =
                  extractWebSearchDetails(wsEvent);

                emit({
                  type: "web-search-done",
                  searchId: event.item_id,
                  action,
                  query,
                  domains,
                  url,
                  sources, // Include sources with titles
                });
              })
              .on(
                "response.code_interpreter_call.in_progress",
                (event: any) => {
                  emit({
                    type: "code-interpreter-start",
                    executionId: event.item_id,
                  });
                },
              )
              .on(
                "response.code_interpreter_call.interpreting",
                (event: any) => {
                  emit({
                    type: "code-interpreter-interpreting",
                    executionId: event.item_id,
                  });
                },
              )
              .on("response.code_interpreter_call_code.delta", (event: any) => {
                emit({
                  type: "code-interpreter-code-delta",
                  executionId: event.item_id,
                  delta: event.delta,
                });
              })
              .on("response.code_interpreter_call_code.done", (event: any) => {
                emit({
                  type: "code-interpreter-code-done",
                  executionId: event.item_id,
                  code: event.code,
                });
              })
              .on("response.code_interpreter_call.completed", async (event: any) => {
                // Extract output text and files from the completed event
                let outputText = "";
                const images: Array<{ mimeType: string; data: string }> = [];
                try {
                  const outputs = event.output || event.item?.output || [];
                  if (Array.isArray(outputs)) {
                    outputText = outputs
                      .filter((o: any) => o.type === "logs" || o.type === "text")
                      .map((o: any) => o.logs || o.text || "")
                      .join("\n");

                    // Download image files generated by code interpreter
                    const fileOutputs = outputs.filter((o: any) => o.type === "files");
                    for (const fileOut of fileOutputs) {
                      const files = fileOut.files || [];
                      for (const file of files) {
                        if (file.file_id && file.mime_type?.startsWith("image/")) {
                          try {
                            const fileResponse = await openaiClient!.files.content(file.file_id);
                            const arrayBuf = await fileResponse.arrayBuffer();
                            const base64 = Buffer.from(arrayBuf).toString("base64");
                            images.push({
                              mimeType: file.mime_type,
                              data: base64,
                            });
                          } catch (fileErr) {
                            log.warn("[AI] Failed to download code interpreter file:", file.file_id, fileErr);
                          }
                        }
                      }
                    }
                  }
                } catch {
                  // Ignore parsing errors
                }
                emit({
                  type: "code-interpreter-done",
                  executionId: event.item_id,
                  output: outputText,
                  images,
                } as any);
              })
              .on("response.file_search_call.in_progress", (event: any) => {
                emit({ type: "file-search-start", searchId: event.item_id });
              })
              .on("response.file_search_call.searching", (event: any) => {
                emit({
                  type: "file-search-searching",
                  searchId: event.item_id,
                });
              })
              .on("response.file_search_call.completed", (event: any) => {
                const fsEvent = event as any;
                emit({
                  type: "file-search-done",
                  searchId: event.item_id,
                  results: fsEvent.results,
                });
              })
              .on("error", (event: any) => {
                emit({ type: "error", error: event.message });
              });

            // Wait for stream to complete
            const finalResponse = await stream.finalResponse();
            const responseUsage = finalResponse.usage;
            if (responseUsage) {
              usageTotals.promptTokens += responseUsage.input_tokens || 0;
              usageTotals.completionTokens += responseUsage.output_tokens || 0;
              usageTotals.reasoningTokens +=
                responseUsage.output_tokens_details?.reasoning_tokens || 0;
            }
            log.info(
              `[AI] Step ${currentStepNumber} complete in ${Date.now() - stepStartTime}ms, text=${fullText.length} chars`,
            );

            // Check finalResponse.output for annotations (fallback if not received via streaming)
            if (finalResponse.output && Array.isArray(finalResponse.output)) {
              const allFinalAnnotations: any[] = [];

              for (const outputItem of finalResponse.output) {
                const itemType = (outputItem as any).type;

                if (itemType === "message") {
                  const msgItem = outputItem as any;
                  for (const content of msgItem.content || []) {
                    if (
                      content?.annotations &&
                      content.annotations.length > 0
                    ) {
                      allFinalAnnotations.push(...content.annotations);
                    }
                  }
                }
              }

              if (allFinalAnnotations.length > 0) {
                const urlCitations = allFinalAnnotations
                  .filter((a: any) => a.type === "url_citation")
                  .map((a: any) => ({
                    type: "url_citation" as const,
                    url: a.url,
                    title: a.title,
                    startIndex: a.start_index,
                    endIndex: a.end_index,
                  }));

                const fileCitations = allFinalAnnotations
                  .filter((a: any) => a.type === "file_citation")
                  .map((a: any) => ({
                    type: "file_citation" as const,
                    fileId: a.file_id,
                    filename: a.filename,
                    index: a.index,
                  }));

                const allCitations = [...urlCitations, ...fileCitations];

                if (allCitations.length > 0) {
                  emit({ type: "annotations", annotations: allCitations });
                }

                // Handle container file citations (images from code interpreter)
                const containerFileCitations = allFinalAnnotations
                  .filter((a: any) => a.type === "container_file_citation");

                if (containerFileCitations.length > 0) {
                  log.info(
                    `[AI] Found ${containerFileCitations.length} container file citations`,
                  );

                  const downloadedImages: Array<{
                    mimeType: string;
                    data: string;
                    filename: string;
                  }> = [];

                  await Promise.all(
                    containerFileCitations.map(async (citation: any) => {
                      try {
                        const filename = citation.filename || "file";
                        const ext =
                          filename.split(".").pop()?.toLowerCase() || "";
                        const isImage = [
                          "png",
                          "jpg",
                          "jpeg",
                          "gif",
                          "webp",
                          "svg",
                          "bmp",
                        ].includes(ext);

                        if (!isImage) {
                          log.info(
                            `[AI] Skipping non-image container file: ${filename}`,
                          );
                          return;
                        }

                        log.info(
                          `[AI] Downloading container file: ${filename} (${citation.file_id}) from container ${citation.container_id}`,
                        );

                        const fileResponse =
                          await openaiClient!.containers.files.content.retrieve(
                            citation.file_id,
                            { container_id: citation.container_id },
                          );
                        const arrayBuf = await fileResponse.arrayBuffer();
                        const base64 =
                          Buffer.from(arrayBuf).toString("base64");

                        const mimeType =
                          ext === "jpg" || ext === "jpeg"
                            ? "image/jpeg"
                            : ext === "gif"
                              ? "image/gif"
                              : ext === "webp"
                                ? "image/webp"
                                : ext === "svg"
                                  ? "image/svg+xml"
                                  : "image/png";

                        downloadedImages.push({
                          mimeType,
                          data: base64,
                          filename,
                        });
                        log.info(
                          `[AI] Downloaded container file: ${filename} (${base64.length} chars base64)`,
                        );
                      } catch (err) {
                        log.warn(
                          "[AI] Failed to download container file:",
                          citation.file_id,
                          err,
                        );
                      }
                    }),
                  );

                  if (downloadedImages.length > 0) {
                    emit({
                      type: "code-interpreter-container-images",
                      images: downloadedImages,
                    } as any);
                  }
                }
              }
            }

            // Execute any pending tool calls IN PARALLEL
            if (hasToolCalls && pendingToolCalls.length > 0) {
              log.info(
                `[AI] Executing ${pendingToolCalls.length} tool calls in parallel`,
              );

              await Promise.all(
                pendingToolCalls.map(async (toolCall) => {
                  try {
                    const executor = executors.get(toolCall.name);
                    if (executor) {
                      // Use pre-parsed args if available, otherwise try to parse
                      let args = toolCall.parsedArgs;
                      if (args === undefined) {
                        try {
                          args = JSON.parse(toolCall.arguments);
                        } catch (parseError) {
                          log.error(
                            `[AI] Failed to parse tool call arguments for ${toolCall.name}: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
                          );
                          args = { _parseError: true, raw: toolCall.arguments };
                        }
                      }

                      // Check if args had parse error
                      if (
                        args &&
                        typeof args === "object" &&
                        "_parseError" in args
                      ) {
                        const errorMsg = `Failed to parse tool arguments: response may have been truncated due to max_output_tokens limit`;
                        log.error(
                          `[AI] Tool ${toolCall.name} received malformed arguments`,
                        );
                        toolCall.arguments = JSON.stringify({
                          error: errorMsg,
                          success: false,
                        });
                        emit({
                          type: "tool-result",
                          toolCallId: toolCall.callId,
                          toolName: toolCall.name,
                          result: { error: errorMsg },
                          success: false,
                        });
                        return;
                      }

                      const result = await executor(args);

                      // Update the tool call with the result for next iteration
                      toolCall.arguments = JSON.stringify(result);

                      const success = !(
                        result &&
                        typeof result === "object" &&
                        "error" in result
                      );
                      emit({
                        type: "tool-result",
                        toolCallId: toolCall.callId,
                        toolName: toolCall.name,
                        result,
                        success,
                      });
                    }
                  } catch (err) {
                    const errorMsg =
                      err instanceof Error ? err.message : "Unknown error";
                    log.error(
                      `[AI] Tool execution error for ${toolCall.name}:`,
                      err,
                    );
                    toolCall.arguments = JSON.stringify({
                      error: errorMsg,
                      success: false,
                    });
                    emit({
                      type: "tool-result",
                      toolCallId: toolCall.callId,
                      toolName: toolCall.name,
                      result: { error: errorMsg },
                      success: false,
                    });
                  }
                }),
              );

              emit({
                type: "step-complete",
                stepNumber: currentStepNumber,
                hasMoreSteps: true,
              });
              continue; // Continue the agent loop
            }

            // No more tool calls, we're done
            emit({
              type: "step-complete",
              stepNumber: currentStepNumber,
              hasMoreSteps: false,
            });
            break;
          }

          // Finalize
          emit({ type: "text-done", text: fullText });

          // Generate follow-up suggestions BEFORE finish (so IPC listener is still active)
          if (fullText && !abortController.signal.aborted) {
            const suggestionApiKey =
              input.apiKey || getSecureApiKeyStore().getOpenAIKey();
            if (suggestionApiKey) {
              const suggestionBaseURL =
                input.provider === "zai" ? ZAI_GENERAL_BASE_URL
                : input.provider === "cerebras" ? "https://api.cerebras.ai/v1"
                : input.provider === "groq" ? "https://api.groq.com/openai/v1"
                : undefined;
              try {
                const suggestions = await generateSuggestions(
                  fullText,
                  input.messages || [],
                  suggestionApiKey,
                  suggestionBaseURL,
                );
                if (
                  suggestions.length > 0 &&
                  !abortController.signal.aborted
                ) {
                  emit({ type: "suggestions", suggestions });
                }
              } catch (err) {
                log.error("[AI] Failed to generate suggestions:", err);
                // Emit default suggestions on error
                emit({
                  type: "suggestions",
                  suggestions: [
                    "Create spreadsheet",
                    "Visualize data",
                    "Generate chart",
                    "Analyze trends",
                  ],
                });
              }
            } else {
              emit({
                type: "suggestions",
                suggestions: [
                  "Create spreadsheet",
                  "Visualize data",
                  "Generate chart",
                  "Analyze trends",
                ],
              });
            }
          }

          emit({
            type: "finish",
            usage: {
              promptTokens: usageTotals.promptTokens,
              completionTokens: usageTotals.completionTokens,
              reasoningTokens: usageTotals.reasoningTokens,
            },
            totalSteps: currentStepNumber,
            // For OpenAI/Responses API: pass to next turn via previous_response_id (store: true)
            responseId: currentResponseId ?? undefined,
          });

          log.info(
            `[AI] Agent loop finished in ${Date.now() - startTime}ms, totalSteps=${currentStepNumber}, responseId=${currentResponseId ?? "none"}`,
          );
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            log.info("[AI] Agent loop aborted");
            return;
          }
          log.error("[AI] Agent loop error:", error);
          const errorMessage =
            error instanceof Error
              ? sanitizeApiError(error.message)
              : "Unknown error";
          emit({ type: "error", error: errorMessage });
        } finally {
          activeStreams.delete(input.chatId);
        }
      };

      // Direct image generation function - skips AI agent for faster response
      const runImageGeneration = async () => {
        const startTime = Date.now();
        const toolCallId = `img_${crypto.randomUUID()}`;

        try {
          log.info(
            `[AI] Direct image generation mode - prompt: "${input.prompt.slice(0, 80)}...", size: ${input.imageSize || "1024x1024"}`,
          );

          // Use provided size or default to 1024x1024
          const imageSize = input.imageSize || "1024x1024";

          // Emit tool call start event
          emit({
            type: "tool-call-start",
            toolCallId,
            toolName: "generate_image",
          });

          // Emit tool call done with args
          emit({
            type: "tool-call-done",
            toolCallId,
            toolName: "generate_image",
            args: { prompt: input.prompt, size: imageSize, quality: "high" },
          });

          // Get API key - prefer input key, fallback to credential manager
          const credentialManager = getCredentialManager();
          const provider = input.provider || "openai";

          let apiKey: string | undefined = input.apiKey;
          if (!apiKey) {
            if (provider === "zai") {
              apiKey = (await credentialManager.getZaiKey()) ?? undefined;
            } else {
              apiKey = (await credentialManager.getOpenAIKey()) ?? undefined;
            }
          }

          if (!apiKey) {
            throw new Error(`${provider === "zai" ? "Z.AI" : "OpenAI"} API key is required for image generation. Please configure it in Settings.`);
          }

          // Determine base URL for Z.AI
          const baseURL = provider === "zai" ? ZAI_GENERAL_BASE_URL : undefined;
          const headers =
            provider === "zai" ? { "X-Source": ZAI_SOURCE_HEADER } : undefined;

          // Call direct image generation with dynamic size
          const result = await generateImageDirect(
            input.prompt,
            input.chatId,
            ctx.userId,
            apiKey,
            provider as "openai" | "zai",
            baseURL,
            headers,
            imageSize,
          );

          // Emit tool result
          emit({
            type: "tool-result",
            toolCallId,
            toolName: "generate_image",
            result,
            success: true,
          });

          // Note: We don't emit text-delta with markdown image because
          // the AgentImageGeneration component renders the image from tool-result

          // Emit finish (image API no devuelve tokens; usar 0 para que la UI muestre estructura)
          const duration = Date.now() - startTime;
          log.info(`[AI] Direct image generation completed in ${duration}ms`);
          emit({
            type: "finish",
            totalSteps: 1,
            usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 },
          });
        } catch (error) {
          log.error(`[AI] Direct image generation error:`, error);
          const errorMessage =
            error instanceof Error
              ? sanitizeApiError(error.message)
              : "Unknown error";
          emit({ type: "error", error: errorMessage });
        } finally {
          activeStreams.delete(input.chatId);
        }
      };

      // Start processing in background - use direct image generation if flag is set
      if (input.generateImage) {
        runImageGeneration();
      } else {
        runAgentLoop();
      }

      return { success: true, message: "Agent loop started" };
    }),

  // Cancel ongoing chat
  cancel: protectedProcedure
    .input(z.object({ chatId: z.string() }))
    .mutation(({ input }) => {
      if (activeStreams.has(input.chatId)) {
        log.info(`[AI] Cancelling chat ${input.chatId}`);
        activeStreams.get(input.chatId)?.abort();
        activeStreams.delete(input.chatId);
        return { success: true };
      }
      return { success: false, message: "No active stream found" };
    }),

  // Generate speech audio from text (OpenAI TTS)
  textToSpeech: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        model: z.string().optional(),
        voice: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const store = getSecureApiKeyStore();
      const apiKey = store.getOpenAIKey();

      if (!apiKey) {
        throw new Error("OpenAI API key not configured");
      }

      try {
        const client = new OpenAI({ apiKey });
        const modelId = input.model || "gpt-4o-mini-tts";
        const voice = input.voice || "alloy";

        const response = await client.audio.speech.create({
          model: modelId,
          voice,
          input: input.text,
        });

        const audioBuffer = Buffer.from(await response.arrayBuffer());

        return {
          audioBase64: audioBuffer.toString("base64"),
          mimeType: "audio/mpeg",
        };
      } catch (error) {
        log.error("[AI] Text-to-speech error:", error);
        throw new Error("Failed to generate speech audio");
      }
    }),

  // Generate chat title
  generateTitle: protectedProcedure
    .input(
      z.object({
        prompt: z.string(),
        provider: z.enum(["openai", "anthropic", "zai", "chatgpt-plus", "claude", "cerebras", "groq"]).optional(),
        apiKey: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Try to get API key from credential manager if not provided
        let apiKey = input.apiKey || "";
        const credentialManager = getCredentialManager();

        // For Cerebras/Z.AI/Groq providers, use Chat Completions for title gen
        if (!apiKey && (input.provider === "cerebras" || input.provider === "zai" || input.provider === "groq")) {
          const titlePrompt = `Generate a short, concise title (max 5 words) for this message. Do not use quotes. Just respond with the title, nothing else.\n\nMessage: ${input.prompt}`;
          try {
            let titleClient: OpenAI | undefined;
            let titleModel: string;

            if (input.provider === "cerebras") {
              const cerebrasKey = await credentialManager.getCerebrasKey();
              if (cerebrasKey) {
                titleClient = new OpenAI({ apiKey: cerebrasKey, baseURL: "https://api.cerebras.ai/v1" });
                titleModel = "llama-3.3-70b";
              }
            } else if (input.provider === "groq") {
              const groqKey = await credentialManager.getGroqKey();
              if (groqKey) {
                titleClient = new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" });
                titleModel = "llama-3.3-70b-versatile";
              }
            } else {
              const zaiKey = await credentialManager.getZaiKey();
              if (zaiKey) {
                titleClient = new OpenAI({ apiKey: zaiKey, baseURL: "https://open.bigmodel.cn/api/paas/v4/" });
                titleModel = "GLM-4.7-Flash";
              }
            }

            if (titleClient!) {
              const response = await titleClient!.chat.completions.create({
                model: titleModel!,
                messages: [{ role: "user", content: titlePrompt }],
                max_completion_tokens: 50,
              });
              const candidate = response.choices[0]?.message?.content?.trim() || "";
              const title = candidate && candidate !== "New Chat" ? candidate : getFallbackTitle(input.prompt);
              return { title };
            }
          } catch (err) {
            log.warn(`[AI] ${input.provider} title generation failed:`, err);
          }
        }

        if (!apiKey) {
          // Try OpenAI first
          const openAiKey = await credentialManager.getOpenAIKey();
          if (openAiKey) apiKey = openAiKey;

          // If no OpenAI key, try Anthropic
          if (!apiKey) {
            const anthropicKey = getSecureApiKeyStore().getAnthropicKey();
            if (anthropicKey) {
              // Use Anthropic for title generation
              const Anthropic = (await import("@anthropic-ai/sdk")).default;
              const anthropic = new Anthropic({ apiKey: anthropicKey });

              const response = await anthropic.messages.create({
                model: "claude-3-5-haiku-latest",
                max_tokens: 50,
                messages: [
                  {
                    role: "user",
                    content: `Generate a short, concise title (max 5 words) for this message. Do not use quotes. Just respond with the title, nothing else.\n\nMessage: ${input.prompt}`,
                  },
                ],
              });

              const candidate = response.content[0]?.type === "text"
                ? response.content[0].text.trim()
                : "";
              const title =
                candidate && candidate !== "New Chat"
                  ? candidate
                  : getFallbackTitle(input.prompt);

              return { title };
            }
          }
        }

        // If still no API key, return fallback
        if (!apiKey) {
          log.warn("[AI] No API key available for title generation, using fallback");
          return { title: getFallbackTitle(input.prompt) };
        }

        // Use OpenAI for title generation
        const client = new OpenAI({
          apiKey,
        });

        const modelId = input.model || "gpt-4o-mini";

        const response = await withRetry(
          "responses.create",
          new AbortController().signal,
          DEFAULT_REQUEST_TIMEOUT_MS,
          (signal) =>
            client.responses.create(
              {
                model: modelId, // Fast model for title generation
                input: input.prompt,
                instructions:
                  "Generate a short, concise title (max 5 words) for the user's message. Do not use quotes. Just respond with the title, nothing else.",
                max_output_tokens: 50,
              },
              { signal },
            ),
        );

        const candidate = response.output_text?.trim() || "";
        const title =
          candidate && candidate !== "New Chat"
            ? candidate
            : getFallbackTitle(input.prompt);

        return { title };
      } catch (error) {
        log.error("[AI] Generate title error:", error);
        return { title: getFallbackTitle(input.prompt) };
      }
    }),
});
