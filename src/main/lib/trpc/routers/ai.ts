import { setMaxListeners } from "events";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import log from "electron-log";
import { sendToRenderer } from "../../window-manager";
import { supabase } from "../../supabase/client";
import { getSecureApiKeyStore } from "../../auth/api-key-store";
import { getChatGPTAuthManager } from "../../auth";
// NOTE: Gemini auth disabled - OAuth token incompatible with generativelanguage.googleapis.com
// import { getChatGPTAuthManager, getGeminiAuthManager } from '../../auth'

import OpenAI from "openai";
import type { Responses } from "openai/resources/responses/responses";
import { OpenAIFileService } from "../../ai/openai-files";
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
} from "@shared/ai-types";
import { AI_MODELS, DEFAULT_MODELS, getModelById } from "@shared/ai-types";
import { generateSuggestions } from "../../ai/suggestions";
import {
  selectAgent,
  executeSpecializedAgent,
  shouldUseSpecializedAgent,
  getPDFContext,
  createModel,
} from "../../agents/agent-service";
import type { AgentContext } from "../../agents/types";

// Re-export type for consumers
export type { AIStreamEvent } from "@shared/ai-types";

// Store active streams for cancellation
const activeStreams = new Map<string, AbortController>();

// Maximum number of agent loop steps
const MAX_AGENT_STEPS = 15;

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const FLEX_REQUEST_TIMEOUT_MS = 900_000;
// Exponential backoff with jitter: 500ms, 1s, 2s, 4s, 8s (5 retries total)
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
const MAX_JITTER_MS = 500; // Random jitter to avoid thundering herd

const ZAI_GENERAL_BASE_URL = "https://api.z.ai/api/paas/v4/";
const ZAI_CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4/";
const ZAI_SOURCE_HEADER = "S-AGI-Agent";

const AUTO_TITLE_MAX_LENGTH = 25;

function getFallbackTitle(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return "New Chat";
  if (trimmed.length <= AUTO_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, AUTO_TITLE_MAX_LENGTH)}...`;
}

/** Heurísticas para ResponseMode Auto: elige 'thinking' o 'instant'. */
function pickModeAuto(
  text: string,
  _hasImages?: boolean,
): "instant" | "thinking" {
  const t = text.toLowerCase();
  const long = text.length > 800;
  const complex = [
    "arquitect",
    "diseñ",
    "seguridad",
    "optim",
    "debug",
    "cálcul",
    "contrato",
    "plan",
    "detallado",
    "paso a paso",
    "con ejemplos",
  ].some((k) => t.includes(k));
  // Note: images don't need thinking mode, just more output tokens (handled separately)
  // Spreadsheet/table keywords also don't need thinking - just output tokens
  return long || complex ? "thinking" : "instant";
}

function isLikelyCodingPrompt(text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes("```")) return true;
  if (
    /[\\/][\w.\-]+\.([cm]?[jt]sx?|py|go|rs|java|kt|cs|php|rb|sql|json|yml|yaml|toml|md)\b/i.test(
      text,
    )
  )
    return true;
  if (
    /\b([cm]?[jt]sx?|typescript|javascript|python|golang|rust|java|kotlin|c#|sql|react|electron|node|bun|npm|vite|webpack)\b/i.test(
      t,
    )
  )
    return true;
  if (
    /\b(stack trace|exception|traceback|segfault|compile|build|tsc|lint|typecheck|bug|fix|refactor)\b/i.test(
      t,
    )
  )
    return true;
  if (/\b(git|commit|diff|pr|pull request|branch|merge)\b/i.test(t))
    return true;
  return false;
}

function isZaiBillingError(error: unknown): boolean {
  const status = (error as any)?.status;
  const message = (error as any)?.message || "";
  return (
    status === 429 &&
    /insufficient\s+balance|no\s+resource\s+package|quota\s+exceeded/i.test(
      message,
    )
  );
}

function isRetryableError(error: unknown): boolean {
  const status = (error as any)?.status;
  const code = (error as any)?.code;
  const message = (error as any)?.message || "";
  const errorType = (error as any)?.type || "";

  // Z.AI billing errors should NOT be retried (they won't resolve themselves)
  // Common patterns: "Insufficient balance", "no resource package", "quota exceeded"
  if (isZaiBillingError(error)) {
    log.warn("[AI] Z.AI billing error detected - will not retry:", message);
    return false;
  }

  // OpenAI server errors (500, 502, 503, 504) - always retry
  if (typeof status === "number" && status >= 500 && status < 600) {
    log.info(`[AI] Server error ${status} detected - will retry`);
    return true;
  }

  // Rate limiting (429) - retry with backoff
  if (status === 429) {
    log.info("[AI] Rate limit (429) detected - will retry with backoff");
    return true;
  }

  // OpenAI specific error types that are retryable
  if (
    errorType === "server_error" ||
    errorType === "api_error" ||
    errorType === "service_unavailable"
  ) {
    log.info(`[AI] OpenAI error type "${errorType}" - will retry`);
    return true;
  }

  // Network errors - retry
  const retryableCodes = [
    "ETIMEDOUT",
    "ECONNRESET",
    "EPIPE",
    "ENOTFOUND",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "EHOSTUNREACH",
  ];
  if (retryableCodes.includes(code)) {
    log.info(`[AI] Network error ${code} - will retry`);
    return true;
  }

  // OpenAI "An error occurred while processing" messages - these are transient
  if (
    /error occurred while processing|internal server error|bad gateway|service unavailable/i.test(
      message,
    )
  ) {
    log.info("[AI] Transient OpenAI error detected in message - will retry");
    return true;
  }

  return false;
}

/** Calculate delay with jitter for retry */
function getRetryDelayWithJitter(attemptIndex: number): number {
  const baseDelay =
    RETRY_DELAYS_MS[Math.min(attemptIndex, RETRY_DELAYS_MS.length - 1)];
  const jitter = Math.random() * MAX_JITTER_MS;
  return baseDelay + jitter;
}

function createRequestSignal(
  parentSignal: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  if (timeoutMs <= 0) {
    return { signal: parentSignal, cleanup: () => {} };
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  let combinedSignal: AbortSignal;
  if (
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as any).any === "function"
  ) {
    combinedSignal = (AbortSignal as any).any([
      parentSignal,
      timeoutController.signal,
    ]);
  } else {
    combinedSignal = timeoutController.signal;
    parentSignal.addEventListener("abort", () => timeoutController.abort(), {
      once: true,
    });
  }

  const cleanup = () => clearTimeout(timeoutId);
  combinedSignal.addEventListener("abort", cleanup, { once: true });

  return { signal: combinedSignal, cleanup };
}

async function withRetry<T>(
  label: string,
  parentSignal: AbortSignal,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  const maxAttempts = RETRY_DELAYS_MS.length + 1; // +1 for initial attempt

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // Check if already aborted before starting
    if (parentSignal.aborted) {
      throw new Error("Request cancelled");
    }

    const { signal, cleanup } = createRequestSignal(parentSignal, timeoutMs);
    try {
      if (attempt > 0) {
        log.info(`[AI] ${label} - attempt ${attempt + 1}/${maxAttempts}`);
      }
      return await task(signal);
    } catch (error) {
      lastError = error;
      const errorStatus = (error as any)?.status;
      const errorMessage = (error as any)?.message || String(error);
      const requestId =
        (error as any)?.request_id ||
        (error as any)?.headers?.get?.("x-request-id") ||
        "unknown";

      // Log detailed error info
      log.warn(`[AI] ${label} failed (attempt ${attempt + 1}/${maxAttempts})`, {
        status: errorStatus,
        message: errorMessage.slice(0, 200),
        requestId,
        retryable: isRetryableError(error),
      });

      // Check if we should retry
      const isLastAttempt = attempt === maxAttempts - 1;
      if (!isRetryableError(error) || isLastAttempt) {
        if (isLastAttempt && isRetryableError(error)) {
          log.error(
            `[AI] ${label} - max retries (${maxAttempts}) exhausted. Last error:`,
            errorMessage.slice(0, 300),
          );
        }
        throw error;
      }

      // Calculate delay with jitter and wait
      const delayMs = getRetryDelayWithJitter(attempt);
      log.info(
        `[AI] ${label} - waiting ${Math.round(delayMs)}ms before retry...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      cleanup();
    }
  }

  throw lastError;
}

// System prompt for S-AGI agent
// OPTIMIZATION: OpenAI automatically caches prompts > 1024 tokens
// Keep the static parts at the beginning for maximum cache hits
// @see https://platform.openai.com/docs/guides/prompt-caching
const SYSTEM_PROMPT = `# S-AGI System Instructions
Version: 2.0.0
Role: AI assistant for spreadsheet creation, document writing, image generation, and web research

================================================================================
CORE IDENTITY
================================================================================

You are S-AGI, a specialized AI assistant designed to help users create, edit, and analyze spreadsheets and documents. You have access to powerful native tools, custom spreadsheet/document operations, UI navigation controls, and image generation capabilities. You can also see and analyze images uploaded by users.

================================================================================
MULTIMODAL CAPABILITIES
================================================================================

### Image Understanding
You can see and analyze images uploaded by users. When a user uploads an image:

**Tables & Data in Images:**
- If you see a table, data grid, or structured information in an image, AUTOMATICALLY extract all visible data
- Use ONLY create_spreadsheet with ALL the data in one call - do NOT use format_cells, set_column_width, or other formatting tools
- The spreadsheet will be auto-formatted with professional styling
- Keep it simple: one tool call is better than many

**Charts & Graphs:**
- Describe the chart type, data trends, and key insights
- Offer to recreate the underlying data in a spreadsheet

**Screenshots & UI:**
- Analyze and describe what you see
- Extract any text or data visible

**General Images:**
- Describe the content and offer relevant actions

### Image Generation (GPT Image 1.5)
- generate_image: Create images from text descriptions
- edit_image: Modify existing images using AI
- Supports transparent backgrounds, various sizes, and quality levels

================================================================================
UI NAVIGATION TOOLS
================================================================================

You can control the application UI to provide a seamless experience:

- navigate_to_tab: Switch between tabs (chat, excel, doc, gallery)
  * Use after creating content to show it to the user
  * Example: After creating a spreadsheet, navigate to 'excel' tab

- select_artifact: Select an existing artifact to view or edit
  * Opens the artifact in the side panel or full tab
  * Use to continue editing previous work

- get_ui_context: Get current UI state
  * Returns active chat, selected artifact, available artifacts
  * Use to understand context before taking actions

**IMPORTANT: After creating a spreadsheet or document, consider navigating to the appropriate tab so the user can immediately see and interact with their content.**

================================================================================
NATIVE TOOLS (Built-in OpenAI Capabilities)
================================================================================

### Web Search
- Search the web for current information, news, and data
- Use for up-to-date information that may not be in your training data
- Can search specific domains or general web
- Returns URLs and content snippets

### Code Interpreter
- Write and execute Python code for data analysis
- Perform complex calculations and data transformations
- Generate charts and visualizations
- Process and analyze data before creating spreadsheets

### File Search
- Search through uploaded files to find relevant information
- Query vector stores for semantic search
- Extract specific data from documents

================================================================================
SPREADSHEET TOOLS
================================================================================

### Creation & Data Management
- create_spreadsheet: Create new spreadsheets with column headers and initial data
- update_cells: Update multiple cells with new values (batch operation)
- add_row: Add new rows to existing spreadsheets
- delete_row: Delete rows from a spreadsheet
- insert_formula: Insert Excel-style formulas (=SUM, =AVERAGE, =IF, =VLOOKUP, etc.)

### Formatting & Styling
- format_cells: Apply comprehensive formatting including:
  * Text: bold, italic, underline, strikethrough
  * Font: size, color, family
  * Cell: background color, alignment (horizontal/vertical), text wrap
  * Numbers: currency, percentage, date formats
  * Borders: style, color, thickness
- merge_cells: Merge a range of cells into one
- set_column_width: Set width of specific columns
- set_row_height: Set height of specific rows

### Analysis
- get_spreadsheet_summary: Get current state of a spreadsheet
  * Use this FIRST when modifying existing spreadsheets
  * Returns structure, data, and formatting information

================================================================================
DOCUMENT TOOLS
================================================================================

- create_document: Create a new Word-like document with optional initial content
- insert_text: Insert text at the start or end of a document
- replace_document_content: Replace the entire content of a document
- get_document_content: Read a document's current content

================================================================================
WORKFLOW GUIDELINES
================================================================================

1. **Multi-tool Operations**: Execute multiple tools in sequence for complex tasks
2. **Research → Create**: Use web search to gather data, then create spreadsheets
3. **Code → Visualize**: Use code interpreter for analysis, then format results
4. **Context First**: Always use get_spreadsheet_summary or get_document_content before modifications
5. **Parallel Execution**: When possible, batch related operations together
6. **Image → Spreadsheet**: When user uploads image with table data, extract and create spreadsheet automatically
7. **Navigate After Creation**: Use navigate_to_tab to show users their created content

================================================================================
RESPONSE STYLE
================================================================================

- Be concise but helpful
- Use Markdown formatting for clarity
- Math: use $...$ (inline) and $$...$$ (block) with LaTeX; never put equations in backticks. Use \\int (not f), e^{i\\pi} (not e^(iπ)), \\infty, \\sqrt{}, etc.
- Explain actions before and after tool use
- For spreadsheets: always format headers (bold) and set column widths
- For documents: use clear structure with headings and lists
- Include source URLs when citing web search results
- Acknowledge errors clearly and suggest alternatives

================================================================================
END OF STATIC INSTRUCTIONS
================================================================================
`;

// Plan Mode system prompt - used when mode='plan'
const PLAN_MODE_SYSTEM_PROMPT = `# S-AGI Planning Mode

You are in PLANNING MODE. Your ONLY job is to create a plan and call the ExitPlanMode tool.

## CRITICAL RULES

1. **NEVER output text directly** - ALL your output MUST be through the ExitPlanMode tool
2. **ALWAYS call ExitPlanMode** - This is mandatory, not optional
3. **Plan only, don't execute** - You're creating a roadmap, not doing the work

## HOW TO RESPOND

When the user asks for something:
1. Think about what steps are needed
2. Create a plan in markdown format  
3. Call ExitPlanMode with the plan parameter

## PLAN FORMAT (JSON for the tool)

The plan parameter should be markdown with this structure:

## Summary
[One sentence describing what will be accomplished]

## Steps
1. **[Action name]** - [What will be done and expected result]
2. **[Action name]** - [What will be done and expected result]
3. ...

## Notes
- [Any important considerations]

## EXAMPLE

If user says "Create a sales report", you MUST call:

ExitPlanMode({
  plan: "## Summary\\nCreate a sales report spreadsheet with data and formatting.\\n\\n## Steps\\n1. **Create spreadsheet** - Initialize 'Sales Report' with columns\\n2. **Add headers** - Revenue, Units, Region\\n3. **Insert sample data** - Add example rows\\n4. **Add formulas** - SUM for totals\\n5. **Format cells** - Bold headers, currency format\\n\\n## Notes\\n- Will use update_cells for data entry"
})

## AVAILABLE TOOLS FOR EXECUTION (reference only)

- Spreadsheet: create_spreadsheet, update_cells, insert_formula, format_cells, merge_cells, add_row, delete_row
- Documents: create_document, insert_text, replace_document_content
- Native: web_search, code_interpreter

## REMEMBER

- Do NOT write any text response
- Do NOT explain your plan in chat
- JUST call ExitPlanMode with the plan
- The UI will display your plan beautifully
- User will click "Implement Plan" to execute
`;

/**
 * Convert Zod schema to JSON Schema for OpenAI Responses API
 * Note: With strict=true, ALL properties must be in required array.
 * Optional fields must use anyOf with null type.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return convertZodType(schema);
}

function extractWebSearchDetails(wsEvent: any): {
  action?: "search" | "open_page" | "find_in_page";
  query?: string;
  domains?: string[];
  url?: string;
} {
  const actionValue = wsEvent?.action;
  const actionObj =
    typeof actionValue === "object" && actionValue !== null ? actionValue : {};
  const actionType =
    actionValue === "search" ||
    actionValue === "open_page" ||
    actionValue === "find_in_page"
      ? actionValue
      : actionObj.type === "search" ||
          actionObj.type === "open_page" ||
          actionObj.type === "find_in_page"
        ? actionObj.type
        : undefined;

  const queries = Array.isArray(actionObj.queries)
    ? actionObj.queries
    : Array.isArray(wsEvent?.queries)
      ? wsEvent.queries
      : undefined;

  const query =
    typeof actionObj.query === "string"
      ? actionObj.query
      : typeof wsEvent?.query === "string"
        ? wsEvent.query
        : queries?.[0];

  const domains = Array.isArray(actionObj.domains)
    ? actionObj.domains
    : Array.isArray(wsEvent?.domains)
      ? wsEvent.domains
      : undefined;

  const url =
    typeof actionObj.url === "string"
      ? actionObj.url
      : typeof wsEvent?.url === "string"
        ? wsEvent.url
        : undefined;

  return {
    action: actionType,
    query,
    domains,
    url,
  };
}

function convertZodType(zodType: z.ZodTypeAny): Record<string, unknown> {
  const description = zodType.description || "";

  // Handle ZodOptional
  if (zodType instanceof z.ZodOptional) {
    const inner = convertZodType(zodType._def.innerType);
    return {
      anyOf: [inner, { type: "null" }],
      description: inner.description || description,
    };
  }

  // Handle ZodDefault
  if (zodType instanceof z.ZodDefault) {
    const inner = convertZodType(zodType._def.innerType);
    return {
      anyOf: [inner, { type: "null" }],
      description: inner.description || description,
    };
  }

  // Handle ZodObject
  if (zodType instanceof z.ZodObject) {
    const shape = zodType.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldType = value as z.ZodTypeAny;
      const isOptional =
        fieldType instanceof z.ZodOptional || fieldType instanceof z.ZodDefault;

      if (isOptional) {
        const inner =
          fieldType instanceof z.ZodOptional
            ? convertZodType(fieldType._def.innerType)
            : convertZodType(
                (fieldType as z.ZodDefault<z.ZodTypeAny>)._def.innerType,
              );
        properties[key] = {
          anyOf: [inner, { type: "null" }],
          description: fieldType.description || inner.description || "",
        };
      } else {
        properties[key] = convertZodType(fieldType);
      }

      // ALL fields must be required for strict mode
      required.push(key);
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
      description,
    };
  }

  // Handle ZodArray
  if (zodType instanceof z.ZodArray) {
    return {
      type: "array",
      items: convertZodType(zodType._def.type),
      description,
    };
  }

  // Handle ZodEnum
  if (zodType instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: zodType._def.values,
      description,
    };
  }

  // Handle ZodUnion
  if (zodType instanceof z.ZodUnion) {
    const options = zodType._def.options as z.ZodTypeAny[];
    // Check if it's a simple union of primitives
    const types = options.map((opt) => {
      if (opt instanceof z.ZodString) return "string";
      if (opt instanceof z.ZodNumber) return "number";
      if (opt instanceof z.ZodBoolean) return "boolean";
      if (opt instanceof z.ZodNull) return "null";
      return "string";
    });

    // If all are the same type, just use that type
    const uniqueTypes = [...new Set(types.filter((t) => t !== "null"))];
    if (uniqueTypes.length === 1) {
      if (types.includes("null")) {
        return {
          anyOf: [{ type: uniqueTypes[0] }, { type: "null" }],
          description,
        };
      }
      return { type: uniqueTypes[0], description };
    }

    // Multiple types
    return {
      anyOf: options.map((opt) => convertZodType(opt)),
      description,
    };
  }

  // Handle primitives
  if (zodType instanceof z.ZodString) {
    return { type: "string", description };
  }
  if (zodType instanceof z.ZodNumber) {
    return { type: "number", description };
  }
  if (zodType instanceof z.ZodBoolean) {
    return { type: "boolean", description };
  }
  if (zodType instanceof z.ZodNull) {
    return { type: "null", description };
  }

  // Fallback
  return { type: "string", description };
}

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
 * MINIMAL TOOLS MODE: When processing images (tables/data extraction)
 * Only expose create_spreadsheet, create_document, and generate_chart to prevent 19+ tool call chains.
 * The model will put all data in a single create_spreadsheet call instead of
 * calling format_cells, set_column_width, freeze_panes, etc. separately.
 */
const MINIMAL_SPREADSHEET_TOOLS = ["create_spreadsheet"] as const;
const MINIMAL_DOCUMENT_TOOLS = ["create_document"] as const;
const MINIMAL_CHART_TOOLS = ["generate_chart"] as const;

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
      ...(codeConfig.containerType && {
        container: { type: codeConfig.containerType },
      }),
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

/**
 * Sanitize API error messages to remove sensitive information
 * and provide user-friendly messages for known error patterns
 */
function sanitizeApiError(errorText: string): string {
  // Redact API keys first
  let sanitized = errorText.replace(
    /sk-[a-zA-Z0-9_-]{20,}/g,
    "[REDACTED_API_KEY]",
  );

  // Z.AI billing/quota errors - provide a helpful message
  if (/insufficient\s+balance|no\s+resource\s+package/i.test(errorText)) {
    return "Z.AI: Insufficient balance or quota exceeded. Try using the free model (GLM-4.7-Flash) or check your Z.AI subscription.";
  }

  // Z.AI quota exceeded
  if (/quota\s+exceeded/i.test(errorText)) {
    return "Z.AI: Quota exceeded. Try using the free model (GLM-4.7-Flash) or wait until your quota resets.";
  }

  // General rate limit message improvements
  if (/429|rate\s+limit/i.test(errorText)) {
    return "Rate limit exceeded. Please wait a moment and try again.";
  }

  return sanitized;
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
  options?: { maxHistoricalImages?: number; supportsImages?: boolean },
): Array<OpenAI.ChatCompletionMessageParam> {
  const result: Array<OpenAI.ChatCompletionMessageParam> = [
    { role: "system", content: systemPrompt },
  ];
  const maxHistoricalImages = options?.maxHistoricalImages ?? 10;
  const supportsImages = options?.supportsImages ?? true;
  let historicalImageCount = 0;

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
        const content: Array<OpenAI.ChatCompletionContentPart> = [
          ...imagesToInclude.map((img) => ({
            type: "image_url" as const,
            image_url: {
              url: `data:${img.mediaType};base64,${img.data}`,
              detail: "auto" as const,
            },
          })),
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
    const content: Array<OpenAI.ChatCompletionContentPart> = [
      ...currentImages.map((img) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${img.mediaType};base64,${img.data}`,
          detail: "auto" as const,
        },
      })),
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
        availableProviders: ["openai", "chatgpt-plus", "zai"] as const,
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
        provider: z.enum(["openai", "chatgpt-plus", "zai"]).default("openai"),
        apiKey: z.string().optional(), // Optional for chatgpt-plus provider
        tavilyApiKey: z.string().optional(),
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate user has access to this chat
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
          // Determine provider and model
          const provider = input.provider || "openai";
          const modelId =
            input.model ||
            DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS];
          const modelDef = getModelById(modelId);
          const apiModelId =
            (modelDef as { modelIdForApi?: string } | undefined)
              ?.modelIdForApi || modelId;

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
            `[AI] Starting ${provider === "zai" ? "Chat Completions" : "Responses API"} agent loop with ${modelId} (provider: ${provider})`,
          );
          log.info(`[AI] Reasoning config:`, input.reasoning);
          if (hasImages) {
            log.info(`[AI] Including ${input.images?.length} image(s)`);
          }

          // Create OpenAI client based on provider
          let client: OpenAI;
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
            if (!input.apiKey) {
              throw new Error("Z.AI API key is required");
            }

            const wantsCodingEndpoint = isLikelyCodingPrompt(input.prompt);
            zaiBaseURL = wantsCodingEndpoint
              ? ZAI_CODING_BASE_URL
              : ZAI_GENERAL_BASE_URL;

            client = new OpenAI({
              apiKey: input.apiKey,
              baseURL: zaiBaseURL,
              defaultHeaders: {
                "X-Source": ZAI_SOURCE_HEADER,
              },
            });

            log.info(
              `[AI] Using Z.AI provider endpoint: ${wantsCodingEndpoint ? "coding" : "general"}`,
            );
          } else {
            // Standard OpenAI API - use API key
            if (!input.apiKey) {
              throw new Error("OpenAI API key is required");
            }

            client = new OpenAI({
              apiKey: input.apiKey,
            });
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

          // Build tools based on mode
          // OPTIMIZATION: When images are present, use minimal tools to avoid 19+ tool call chains
          // This forces the model to use create_spreadsheet with ALL data in one call
          const { tools: functionTools, executors } =
            input.mode === "plan"
              ? createPlanModeTools(input.chatId, ctx.userId)
              : hasImages
                ? createMinimalFunctionTools(
                    input.chatId,
                    ctx.userId,
                    toolContext,
                  )
                : createFunctionTools(input.chatId, ctx.userId, toolContext);

          if (hasImages) {
            log.info(
              `[AI] Using MINIMAL tools mode for image input - only create_spreadsheet/create_document available`,
            );
          }

          // Select system prompt based on mode
          // Add current date/time context for accurate temporal awareness
          const now = new Date();
          const dateContext = `\n\n================================================================================
CURRENT DATE & TIME
================================================================================
Today: ${now.toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Lima" })}
Time: ${now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" })} (Lima, Peru)
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
          ): { enabled: boolean; contextSize: "low" | "medium" | "high" } => {
            const explicitWebPatterns = [
              /\b(internet|web|online|google|buscar\s+en\s+la\s+web|busca\s+en\s+la\s+web|search\s+the\s+web)\b/i,
              /\b(source|sources|fuente|fuentes|cita|citation)\b/i,
              /\bsite:/i,
            ];

            const recencyPatterns = [
              /\b(hoy|ayer|esta\s+semana|este\s+mes|este\s+ano|actual|actualidad|reciente|ultimas|ultimos|latest|news|noticias)\b/i,
              /\b(precio|cotizacion|stock|acciones|tipo\s+de\s+cambio|usd|dolar|eur|crypto|bitcoin)\b/i,
              /\b(clima|weather|pronostico)\b/i,
              /\b(resultados|score|marcador|partido|eleccion|elecciones)\b/i,
            ];

            const researchPatterns = [
              /\b(investiga|investigar|research|comparar|benchmark|analiza\s+fuentes|recopila)\b/i,
            ];

            const hasUrl = /(https?:\/\/|www\.)/i.test(prompt);
            const wantsWeb = explicitWebPatterns.some((pattern) =>
              pattern.test(prompt),
            );
            const wantsRecency = recencyPatterns.some((pattern) =>
              pattern.test(prompt),
            );
            const wantsResearch = researchPatterns.some((pattern) =>
              pattern.test(prompt),
            );

            const enabled = hasUrl || wantsWeb || wantsRecency || wantsResearch;
            const contextSize: "low" | "medium" | "high" =
              wantsResearch || prompt.length > 220 ? "medium" : "low";

            log.info("[AI] Web search heuristic analysis:", {
              prompt: prompt.substring(0, 100),
              enabled,
              contextSize,
              hasUrl,
              wantsWeb,
              wantsRecency,
              wantsResearch,
            });

            return { enabled, contextSize };
          };

          // Automatically enable file search if chat has a vector store (Knowledge Base)
          // This allows the AI to search uploaded documents without explicit frontend request
          // Following Anthropic/OpenAI best practices for RAG systems
          if (modelDef?.supportsFileSearch) {
            const { data: chatData } = await supabase
              .from("chats")
              .select("openai_vector_store_id")
              .eq("id", input.chatId)
              .single();

            if (chatData?.openai_vector_store_id) {
              log.info(
                `[AI] Chat has Knowledge Base, auto-enabling file search with vector store: ${chatData.openai_vector_store_id}`,
              );

              // Get list of uploaded files FIRST to inform both isDocumentQuery and system prompt
              const { data: chatFiles } = await supabase
                .from("chat_files")
                .select("filename, file_size, content_type, openai_file_id")
                .eq("chat_id", input.chatId)
                .order("created_at", { ascending: false });

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
                      chatData.openai_vector_store_id,
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
                  vectorStoreIds: [chatData.openai_vector_store_id],
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
            ? { enabled: false, contextSize: "low" as const }
            : shouldUseWebSearch(input.prompt);

          if (webSearchDecision.enabled) {
            nativeToolsConfig = {
              ...nativeToolsConfig,
              webSearch: {
                ...(typeof nativeToolsConfig?.webSearch === "object"
                  ? nativeToolsConfig.webSearch
                  : {}),
                searchContextSize: webSearchDecision.contextSize,
              },
            };
          } else if (nativeToolsConfig?.webSearch !== false) {
            nativeToolsConfig = {
              ...nativeToolsConfig,
              webSearch: false,
            };
          }

          log.info(`[AI] Web search decision:`, webSearchDecision);
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

          // ResponseMode Thinking: paso 1 — plan (solo openai/chatgpt-plus)
          let planText = "";
          if (
            chosenMode === "thinking" &&
            (provider === "openai" || provider === "chatgpt-plus")
          ) {
            try {
              const planRes = await client.responses.create({
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

          // For Z.AI, check if model supports images
          const zaiSupportsImages = modelDef?.supportsImages ?? true;
          const chatMessages =
            provider === "zai"
              ? toChatMessages(
                  systemPrompt,
                  input.messages || [],
                  input.prompt,
                  input.images,
                  {
                    supportsImages: zaiSupportsImages,
                    maxHistoricalImages: 10,
                  },
                )
              : null;

          // Determine reasoning config (ResponseMode override para GPT-5.2)
          const reasoningConfig: ReasoningConfig | undefined =
            provider === "zai"
              ? undefined
              : chosenMode === "instant"
                ? { effort: "none", summary: "auto" }
                : chosenMode === "thinking"
                  ? { effort: "high", summary: "auto" }
                  : modelDef?.supportsReasoning
                    ? input.reasoning
                    : undefined;

          log.info(`[AI] Final reasoning config:`, reasoningConfig);

          let currentStepNumber = 0;
          let fullText = "";
          let fullReasoningSummary = "";
          let currentResponseId = input.previousResponseId;
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

              const params: any = {
                model: modelId,
                messages: chatMessages || [],
                tools: chatTools.length > 0 ? chatTools : undefined,
                tool_choice: chatTools.length > 0 ? "auto" : undefined,
                stream: true,
              };

              if (provider === "zai") {
                params.thinking = zaiThinkingEnabled
                  ? { type: "enabled", clear_thinking: false }
                  : { type: "disabled" };
              }

              let stream: any;
              try {
                stream = await withRetry(
                  `${provider}.chat.completions.create`,
                  abortController.signal,
                  0,
                  (signal) =>
                    client.chat.completions.create(params, {
                      signal,
                      timeout: DEFAULT_REQUEST_TIMEOUT_MS,
                    }) as any,
                );
              } catch (err) {
                // Handle Z.AI billing/quota errors with graceful fallbacks
                if (provider === "zai" && isZaiBillingError(err)) {
                  // 1) If using coding endpoint, fall back to general endpoint
                  if (zaiBaseURL === ZAI_CODING_BASE_URL) {
                    log.warn(
                      "[AI] Z.AI coding endpoint billing error - falling back to general endpoint",
                    );
                    zaiBaseURL = ZAI_GENERAL_BASE_URL;
                    client = new OpenAI({
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
                          client.chat.completions.create(params, {
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
                        client.chat.completions.create(params, {
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

              for await (const chunk of stream as any) {
                lastChunk = chunk;
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.content) {
                  fullText += delta.content;
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

          if (provider === "zai") {
            // Z.AI uses Chat Completions API (OpenAI-compatible)
            // It doesn't support OpenAI's Responses API
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
              previous_response_id: currentResponseId,
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
            };

            log.info(
              `[AI] Stream params: maxOutputTokens=${maxOutputTokens}, truncation=${truncation}, flex=${!!optimization.useFlex}, prompt_cache_key=${promptCacheKey}, prompt_cache_retention=${promptCacheRetention || "default"}, tool_choice=${shouldForceFileSearch && currentStepNumber === 1 ? "file_search" : "auto"}, tools=${toolsForRequest.map((t: any) => t.type).join(", ")}`,
            );

            const requestTimeoutMs =
              supportsOpenAiOptimizations && optimization.useFlex
                ? FLEX_REQUEST_TIMEOUT_MS
                : DEFAULT_REQUEST_TIMEOUT_MS;

            // Build request options
            // Note: ChatGPT Plus auth headers are handled in custom fetch
            const requestOptions: Parameters<
              typeof client.responses.stream
            >[1] = {
              // Increase timeout for flex processing (can be slower)
              timeout: requestTimeoutMs,
            };

            const stream: any = await withRetry(
              "responses.stream",
              abortController.signal,
              0,
              async (signal) =>
                client.responses.stream(streamParams, {
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
                log.info(
                  `[AI] Web search completed:`,
                  JSON.stringify(wsEvent, null, 2),
                );
                const { action, query, domains, url } =
                  extractWebSearchDetails(wsEvent);
                emit({
                  type: "web-search-done",
                  searchId: event.item_id,
                  action,
                  query,
                  domains,
                  url,
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
              .on("response.code_interpreter_call.completed", (event: any) => {
                emit({
                  type: "code-interpreter-done",
                  executionId: event.item_id,
                  output: "",
                });
              })
              .on("response.file_search_call.in_progress", (event: any) => {
                log.info(
                  `[AI] File search in_progress:`,
                  JSON.stringify(event, null, 2),
                );
                emit({ type: "file-search-start", searchId: event.item_id });
              })
              .on("response.file_search_call.searching", (event: any) => {
                const fsEvent = event as any;
                log.info(`[AI] File search searching:`, {
                  itemId: event.item_id,
                  queries: fsEvent.queries,
                  status: fsEvent.status,
                });
                emit({
                  type: "file-search-searching",
                  searchId: event.item_id,
                });
              })
              .on("response.file_search_call.completed", (event: any) => {
                const fsEvent = event as any;
                log.info(`[AI] File search completed:`, {
                  itemId: event.item_id,
                  resultsCount: fsEvent.results?.length || 0,
                  results: fsEvent.results?.map((r: any) => ({
                    filename: r.filename,
                    score: r.score,
                    textPreview: r.text?.substring(0, 200),
                  })),
                });
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

            // DEBUG: Log the full final response structure
            log.info(
              `[AI] finalResponse keys: ${Object.keys(finalResponse).join(", ")}`,
            );
            log.info(
              `[AI] finalResponse.output type: ${typeof finalResponse.output}, isArray: ${Array.isArray(finalResponse.output)}, length: ${(finalResponse.output as any)?.length}`,
            );

            // Check finalResponse.output for annotations (fallback if not received via streaming)
            // The annotations may be in the final response output items
            if (finalResponse.output && Array.isArray(finalResponse.output)) {
              const allFinalAnnotations: any[] = [];

              for (const outputItem of finalResponse.output) {
                const itemType = (outputItem as any).type;
                log.info(`[AI] Final output item type: ${itemType}`);

                // Log the full structure of each output item
                if (itemType === "message") {
                  const msgItem = outputItem as any;
                  log.info(
                    `[AI] Message content count: ${msgItem.content?.length || 0}`,
                  );

                  for (const content of msgItem.content || []) {
                    log.info(
                      `[AI] Content type: ${content?.type}, annotations: ${JSON.stringify(content?.annotations?.slice(0, 2))}`,
                    );
                    if (
                      content?.annotations &&
                      content.annotations.length > 0
                    ) {
                      log.info(
                        `[AI] Found ${content.annotations.length} annotations in final response`,
                      );
                      allFinalAnnotations.push(...content.annotations);
                    }
                  }
                } else if (itemType === "web_search_call") {
                  // Web search results might have URLs here
                  log.info(
                    `[AI] Web search call item: ${JSON.stringify(outputItem).slice(0, 500)}`,
                  );
                } else if (itemType === "file_search_call") {
                  // File search results with document citations
                  const fsItem = outputItem as any;
                  log.info(`[AI] File search call item:`, {
                    id: fsItem.id,
                    status: fsItem.status,
                    resultsCount: fsItem.results?.length || 0,
                    results: fsItem.results?.slice(0, 3)?.map((r: any) => ({
                      filename: r.filename,
                      score: r.score,
                      textPreview: r.text?.substring(0, 150),
                    })),
                  });
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
                  log.info(
                    `[AI] Emitting ${urlCitations.length} URL citations and ${fileCitations.length} file citations from final response`,
                  );
                  emit({ type: "annotations", annotations: allCitations });
                }
              }
            } else {
              log.warn(
                `[AI] finalResponse.output is not a valid array: ${JSON.stringify(finalResponse.output)?.slice(0, 200)}`,
              );
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
                input.provider === "zai" ? ZAI_GENERAL_BASE_URL : undefined;
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

          // Get API key - prefer input key, fallback to stored
          const apiKey = input.apiKey || getSecureApiKeyStore().getOpenAIKey();
          if (!apiKey) {
            throw new Error("OpenAI API key is required for image generation");
          }

          // Determine if using Z.AI
          const provider = input.provider || "openai";
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
        provider: z.enum(["openai"]),
        apiKey: z.string(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const client = new OpenAI({
          apiKey: input.apiKey,
        });

        const modelId = input.model || "gpt-5-nano";

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
