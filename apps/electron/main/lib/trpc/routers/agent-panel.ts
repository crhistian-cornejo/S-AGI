/**
 * Agent Panel Router - tRPC router for document-contextual AI agents
 *
 * Provides streaming AI responses for Excel, Docs, and PDF tabs using
 * the AI SDK with specialized agents.
 *
 * For Claude provider, uses Claude Agent SDK with OAuth for subscription access.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { streamText, stepCountIs, tool } from "ai";
import log from "electron-log";
import { sendToRenderer } from "../../window-manager";
import { getModelById, DEFAULT_MODELS } from "@s-agi/core/types/ai";
import {
  getLanguageModel,
  getProviderStatus,
  isProviderAvailable,
} from "../../ai/providers";
import { streamClaudeForAgentPanel } from "../../ai/claude-agent-sdk";
import { getClaudeCodeAuthManager } from "../../auth/claude-code-manager";
import { getSecureApiKeyStore } from "../../auth/api-key-store";
import {
  loadPDFContext,
  getPDFContext,
  clearPDFContext,
} from "../../agents/agent-service";
import { createPDFTools } from "../../agents/pdf-agent";
import {
  createExcelMcpTools,
  createPdfMcpTools,
  createDocsMcpTools,
} from "../../ai/mcp-tools-server";
import type {
  AgentContext,
  PDFContext,
  ExcelContext,
  DocsContext,
} from "../../agents/types";

// Store active streams for cancellation
const activeAgentStreams = new Map<string, AbortController>();

// ============================================================================
// EXCEL AGENT SYSTEM PROMPT - Comprehensive and Powerful
// ============================================================================

/**
 * Build comprehensive Excel Agent system prompt
 * This prompt is designed to be clear, precise, and thorough for spreadsheet operations
 */
function buildExcelAgentSystemPrompt(hasActiveWorkbook: boolean, selectedRange?: string): string {
  const sheetStatus = hasActiveWorkbook
    ? `HOJA ACTIVA: Sí. No pases artifactId - se detecta automático.${selectedRange ? ` Selección: ${selectedRange}` : ""}`
    : `HOJA ACTIVA: No. Usa update_cells para escribir en la hoja actual.`;

  return `# EXCEL AGENT - ACTÚA INMEDIATAMENTE

⚡ REGLA #1: NO busques documentación. NO expliques qué vas a hacer. EJECUTA las herramientas AHORA.

${sheetStatus}

---

# HERRAMIENTAS - USA ESTAS DIRECTAMENTE

## update_cells - Escribir datos
{"updates": [{"cell": "A1", "value": "Texto"}, {"cell": "B1", "value": 123}]}

## format_cells - Formato visual
{"range": "A1:D1", "format": {"bold": true, "backgroundColor": "#FF6B00", "textColor": "#FFFFFF", "horizontalAlign": "center"}}

## format_cells - Bordes
{"range": "A1:D10", "format": {"border": {"style": "thin", "color": "#000000", "sides": ["all"]}}}

## apply_number_format - Formato numérico
{"range": "C2:C100", "format": "currency"}
Opciones: currency, percentage, number, date

## insert_formula - Fórmulas
{"cell": "D10", "formula": "=SUM(D2:D9)"}

---

# SECUENCIA OBLIGATORIA PARA CREAR TABLAS

1. update_cells → Escribir TODOS los datos (encabezados + filas)
2. format_cells → Encabezados: bold + backgroundColor + textColor blanco + center
3. format_cells → Bordes a TODA la tabla
4. apply_number_format → currency/percentage donde aplique
5. insert_formula → Totales con =SUM()
6. format_cells → Fila total en bold

---

# COLORES

- Naranja: #FF6B00 o #F97316
- Azul oscuro: #1E3A5F
- Verde: #10B981
- Rojo: #EF4444
- Gris claro: #F3F4F6
- Bordes: #E5E7EB o #000000

---

# EJEMPLO COMPLETO - Si usuario pide "tabla de ventas con fondo naranja":

PASO 1 - Datos:
update_cells({"updates": [
  {"cell": "A1", "value": "Producto"}, {"cell": "B1", "value": "Cantidad"}, {"cell": "C1", "value": "Precio"}, {"cell": "D1", "value": "Total"},
  {"cell": "A2", "value": "Excavadora"}, {"cell": "B2", "value": 2}, {"cell": "C2", "value": 150000}, {"cell": "D2", "value": "=B2*C2", "formula": "=B2*C2"},
  {"cell": "A3", "value": "Bulldozer"}, {"cell": "B3", "value": 1}, {"cell": "C3", "value": 200000}, {"cell": "D3", "value": "=B3*C3", "formula": "=B3*C3"},
  {"cell": "A4", "value": "TOTAL"}, {"cell": "D4", "value": "=SUM(D2:D3)", "formula": "=SUM(D2:D3)"}
]})

PASO 2 - Encabezados naranja:
format_cells({"range": "A1:D1", "format": {"bold": true, "backgroundColor": "#FF6B00", "textColor": "#FFFFFF", "horizontalAlign": "center"}})

PASO 3 - Bordes:
format_cells({"range": "A1:D4", "format": {"border": {"style": "thin", "color": "#000000", "sides": ["all"]}}})

PASO 4 - Formato moneda:
apply_number_format({"range": "C2:D4", "format": "currency"})

PASO 5 - Fila total:
format_cells({"range": "A4:D4", "format": {"bold": true, "backgroundColor": "#FED7AA"}})

---

# REGLAS ABSOLUTAS

1. ⚡ ACTÚA INMEDIATAMENTE - No digas "voy a hacer", HAZLO
2. 📊 SIEMPRE formatea encabezados con color de fondo + bold + texto blanco
3. 📏 SIEMPRE agrega bordes a toda la tabla
4. 💰 SIEMPRE usa currency para columnas de dinero
5. ➕ SIEMPRE agrega fila de totales con =SUM()
6. 🎨 Si el usuario pide un color específico, ÚSALO en los encabezados

NO respondas con "déjame revisar" o "voy a buscar". EJECUTA.`;
}

// Event types for agent panel streaming
export type AgentPanelStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "text-done"; text: string }
  | { type: "tool-call-start"; toolName: string; toolCallId: string; args?: Record<string, unknown> }
  | {
      type: "tool-call-done";
      toolName: string;
      toolCallId: string;
      result: unknown;
    }
  | { type: "error"; error: string }
  | {
      type: "finish";
      usage?: { promptTokens: number; completionTokens: number };
    };

// Emit events to renderer
function emitAgentEvent(sessionId: string, event: AgentPanelStreamEvent) {
  sendToRenderer("agent-panel:stream", { sessionId, ...event });
}

/** MCP tool shape used by createExcelMcpTools, createDocsMcpTools, etc. */
type McpToolLike = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: unknown, extra: unknown) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
};

/**
 * Convert MCP tools to AI SDK tool() format.
 * MCP tools persist to DB and send artifact:update (full univerData); the renderer
 * listens and the UI updates. Excel-agent tools use artifact:update-cells etc.
 * which nothing handles, so we use MCP for OpenAI/Zai in the agent panel.
 */
function mcpToolsToAISDK(mcpTools: McpToolLike[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const m of mcpTools) {
    record[m.name] = tool({
      description: m.description,
      inputSchema: m.inputSchema,
      execute: async (args: unknown) => {
        const result = await m.handler(args, {});
        const text = result.content[0]?.text ?? "{}";
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      },
    });
  }
  return record;
}

export const agentPanelRouter = router({
  /**
   * Stream a message to the appropriate document agent
   * Uses AI SDK streamText with specialized agent tools
   */
  chat: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        tabType: z.enum(["excel", "doc", "pdf"]),
        prompt: z.string(),
        provider: z
          .enum(["openai", "chatgpt-plus", "zai", "claude"])
          .default("openai"),
        modelId: z.string().optional(),
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional(),
        images: z
          .array(
            z.object({
              data: z.string(), // base64
              mediaType: z.string(),
            }),
          )
          .optional(),
        // Context for document agents
        context: z
          .object({
            // PDF specific
            pdfPath: z.string().optional(),
            pdfName: z.string().optional(),
            currentPage: z.number().optional(),
            selectedText: z.string().optional(),
            // Pre-extracted PDF pages (for remote PDFs)
            pdfPages: z
              .array(
                z.object({
                  pageNumber: z.number(),
                  content: z.string(),
                  wordCount: z.number(),
                }),
              )
              .optional(),
            // Excel specific (legacy artifact system)
            workbookId: z.string().optional(),
            sheetId: z.string().optional(),
            selectedRange: z.string().optional(),
            // Docs specific (legacy artifact system)
            documentId: z.string().optional(),
            documentTitle: z.string().optional(),
            // New file system
            fileId: z.string().optional(),
            fileName: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        sessionId,
        tabType,
        prompt,
        provider,
        modelId,
        messages,
        images,
        context,
      } = input;

      // Cancel existing stream if any
      if (activeAgentStreams.has(sessionId)) {
        activeAgentStreams.get(sessionId)?.abort();
        activeAgentStreams.delete(sessionId);
      }

      const abortController = new AbortController();
      activeAgentStreams.set(sessionId, abortController);

      try {
        // Get model and provider
        const selectedModelId = modelId || DEFAULT_MODELS[provider];
        const modelDef = getModelById(selectedModelId);
        const apiModelId =
          (modelDef as { modelIdForApi?: string } | undefined)?.modelIdForApi ||
          selectedModelId;

        if (!isProviderAvailable(provider)) {
          const status = getProviderStatus(provider);
          emitAgentEvent(sessionId, {
            type: "error",
            error:
              status.message ||
              `No credentials configured for ${provider}. Please update Settings.`,
          });
          return { success: false };
        }

        const model = getLanguageModel(provider, apiModelId);

        // Build agent context
        const agentContext: AgentContext = {
          userId: ctx.userId,
          chatId: sessionId,
          artifactId: context?.workbookId || context?.documentId,
          pdfPath: context?.pdfPath || context?.pdfName,
          ...context,
        };

        // Handle PDF context - prioritize pre-extracted pages, then cache, then load from disk
        if (tabType === "pdf") {
          // 1. Use pre-extracted pages if provided (for remote PDFs)
          if (context?.pdfPages && context.pdfPages.length > 0) {
            agentContext.pdfPages = context.pdfPages;
            agentContext.pdfPath =
              context.pdfName || context.pdfPath || "document.pdf";
          }
          // 2. Check cached context
          else {
            const cachedPdfContext = getPDFContext(sessionId);
            if (cachedPdfContext) {
              agentContext.pdfPages = cachedPdfContext.pages;
              agentContext.pdfPath = cachedPdfContext.path;
            }
            // 3. Try to load from local file path (only for file:// URLs or local paths)
            else if (context?.pdfPath && !context.pdfPath.startsWith("http")) {
              const localPath = context.pdfPath.startsWith("file://")
                ? context.pdfPath.replace("file://", "")
                : context.pdfPath;
              try {
                const pdfData = await loadPDFContext(sessionId, localPath);
                if (pdfData) {
                  agentContext.pdfPages = pdfData.pages;
                  agentContext.pdfBytes = pdfData.pdfBytes;
                } else {
                  log.warn(
                    `[AgentPanel] loadPDFContext returned null for: ${localPath}`,
                  );
                }
              } catch (loadError) {
                log.error(`[AgentPanel] Error loading PDF:`, loadError);
              }
            }
          }
        }

        // Create specialized tools based on tab type and generate system prompt
        // Excel/Doc use MCP tools (persist + artifact:update) so the UI updates. Agent tools use
        // artifact:update-cells etc. which nothing listens to.
        let systemPrompt = "";
        let agentTools: Record<string, unknown> = {};
        let mcpTools: McpToolLike[] = [];

        switch (tabType) {
          case "pdf": {
            if (!agentContext.pdfPages || agentContext.pdfPages.length === 0) {
              emitAgentEvent(sessionId, {
                type: "error",
                error:
                  "No hay un PDF cargado. Por favor, abre un documento primero.",
              });
              return { success: false };
            }
            const pdfContext: PDFContext = {
              ...agentContext,
              pdfPath: agentContext.pdfPath || "document.pdf",
              pages: agentContext.pdfPages,
            };
            const pageCount = pdfContext.pages?.length || 0;
            const filename = pdfContext.pdfPath?.split("/").pop() || "PDF";
            systemPrompt = `Eres un experto en análisis de documentos PDF con capacidad de búsqueda y citación precisa.

## Documento actual: ${filename}
- Páginas: ${pageCount}
- Estado: Cargado y listo para consultas

## Tus capacidades:
- Buscar información específica en el PDF
- Responder preguntas citando páginas exactas
- Resumir secciones o el documento completo
- Extraer datos estructurados (tablas, listas)
- Navegar a páginas específicas

## REGLAS CRÍTICAS DE CITACIÓN:
1. SIEMPRE cita la página cuando menciones información del PDF
2. Usa formato [página N] después de cada dato
3. Si la información no está en el PDF, dilo claramente
4. Cuando busques, reporta qué encontraste y dónde

IMPORTANTE: CADA dato del PDF debe tener su citación [página N].`;
            agentTools = createPDFTools(pdfContext);
            mcpTools = createPdfMcpTools(pdfContext) as McpToolLike[];
            break;
          }

          case "excel": {
            const excelContext: ExcelContext = {
              ...agentContext,
              workbookId: context?.workbookId,
              sheetId: context?.sheetId,
              selectedRange: context?.selectedRange,
            };
            // Check if there's already a file/workbook open
            const hasActiveWorkbook = !!(context?.workbookId || context?.fileId);

            // Build comprehensive Excel agent system prompt
            systemPrompt = buildExcelAgentSystemPrompt(hasActiveWorkbook, context?.selectedRange);
            mcpTools = createExcelMcpTools(excelContext) as McpToolLike[];
            agentTools = mcpToolsToAISDK(mcpTools);
            break;
          }

          case "doc": {
            const docsContext: DocsContext = {
              ...agentContext,
              documentId: context?.documentId,
              documentTitle: context?.documentTitle,
              selectedText: context?.selectedText,
            };
            systemPrompt = `Eres un experto escritor y editor de documentos especializado en Univer Docs (similar a Word/Google Docs).

## Tus capacidades:
- Crear documentos estructurados (informes, propuestas, ensayos, manuales)
- Investigar temas usando búsqueda web
- Generar contenido profesional y bien estructurado
- Aplicar formato de texto (encabezados, listas, tablas)

## Estructura de documentos:
- Usa encabezados jerárquicos (H1 para título, H2 para secciones, H3 para subsecciones)
- Incluye introducción, desarrollo y conclusión cuando sea apropiado
- Usa listas para enumerar puntos
- Usa tablas para datos comparativos`;
            mcpTools = createDocsMcpTools(docsContext) as McpToolLike[];
            agentTools = mcpToolsToAISDK(mcpTools);
            break;
          }
        }

        // Build messages for AI SDK streamText
        // Using CoreMessage format compatible with AI SDK v6
        const inputMessages: Array<{
          role: "system" | "user" | "assistant";
          content:
            | string
            | Array<
                | { type: "text"; text: string }
                | { type: "image"; image: string }
              >;
        }> = [];

        // Add system prompt
        inputMessages.push({
          role: "system",
          content: systemPrompt,
        });

        // Add conversation history
        if (messages && messages.length > 0) {
          for (const msg of messages) {
            inputMessages.push({
              role: msg.role,
              content: msg.content,
            });
          }
        }

        // Add current message with optional images
        if (images && images.length > 0) {
          inputMessages.push({
            role: "user",
            content: [
              ...images.map((img) => ({
                type: "image" as const,
                image: `data:${img.mediaType};base64,${img.data}`,
              })),
              { type: "text" as const, text: prompt },
            ],
          });
        } else {
          inputMessages.push({
            role: "user",
            content: prompt,
          });
        }

        // Build user/assistant messages (exclude system - use system param instead)
        const chatMessages = inputMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        // For Claude provider: Use Claude Agent SDK with MCP tools (supports OAuth!)
        if (provider === "claude") {
          const claudeManager = getClaudeCodeAuthManager();
          const apiKeyStore = getSecureApiKeyStore();
          const authToken = await claudeManager.getValidToken();
          const apiKey = apiKeyStore.getAnthropicKey();

          if (!authToken && !apiKey) {
            emitAgentEvent(sessionId, {
              type: "error",
              error: "Claude not configured. Connect Claude Code in Settings or add an Anthropic API key.",
            });
            return { success: false };
          }

          try {
            const result = await streamClaudeForAgentPanel({
              sessionId,
              prompt,
              messages: chatMessages.map((m) => ({
                role: m.role,
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
              })),
              modelId: apiModelId,
              systemPrompt,
              signal: abortController.signal,
              authToken: authToken || undefined,
              apiKey: apiKey || undefined,
              emitEvent: (event) => emitAgentEvent(sessionId, event),
              mcpTools: mcpTools.length > 0 ? mcpTools : undefined,
            });

            // If using file system and MCP tools exist, emit save event
            if (context?.fileId && mcpTools.length > 0) {
              sendToRenderer("file:save-with-ai-metadata", {
                fileId: context.fileId,
                tabType,
                aiModel: apiModelId,
                aiPrompt: prompt,
                toolName: tabType === "excel" ? "ExcelAgent" : "DocsAgent",
              });
            }

            return { success: true, text: result.text };
          } catch (streamError) {
            if (abortController.signal.aborted) {
              return { success: false, cancelled: true };
            }
            throw streamError;
          }
        }

        // For other providers (OpenAI, Zai, etc.), use AI SDK streamText
        // stopWhen: stepCountIs(10) allows multi-step tool use (default is 1, so tools never got results → no text)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = streamText({
          model: model as any,
          system: systemPrompt,
          messages: chatMessages as any,
          tools: agentTools as any,
          abortSignal: abortController.signal,
          stopWhen: stepCountIs(10),
        });

        // Process the stream
        let fullText = "";

        try {
          for await (const event of result.fullStream) {
            if (abortController.signal.aborted) break;

            switch (event.type) {
              case "text-delta": {
                // AI SDK v6 fullStream: try textDelta, text, or delta (varies by version)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const e = event as any;
                const textContent = e.textDelta ?? e.text ?? e.delta ?? "";

                fullText += textContent;
                emitAgentEvent(sessionId, {
                  type: "text-delta",
                  delta: textContent || "",
                });
                break;
              }

              case "tool-call":
                emitAgentEvent(sessionId, {
                  type: "tool-call-start",
                  toolName: event.toolName,
                  toolCallId: event.toolCallId,
                  args: (event as { args?: Record<string, unknown> }).args,
                });
                break;

              case "tool-result": {
                // AI SDK v6: try output, result (varies by version)
                const toolResult =
                  (event as { output?: unknown }).output ??
                  (event as { result?: unknown }).result;
                emitAgentEvent(sessionId, {
                  type: "tool-call-done",
                  toolName: event.toolName,
                  toolCallId: event.toolCallId,
                  result: toolResult,
                });
                break;
              }
            }
          }

          // Get final usage
          const usage = await result.usage;

          // Log warning if no text was generated
          if (!fullText) {
            log.warn(`[AgentPanel] Stream completed but no text was generated for session ${sessionId}`);
          }

          emitAgentEvent(sessionId, {
            type: "text-done",
            text: fullText,
          });

          // AI SDK v6: uses inputTokens/outputTokens instead of promptTokens/completionTokens
          emitAgentEvent(sessionId, {
            type: "finish",
            usage: {
              promptTokens: usage.inputTokens ?? 0,
              completionTokens: usage.outputTokens ?? 0,
            },
          });

          // If using file system and tools were called, emit save event
          if (context?.fileId && Object.keys(agentTools).length > 0) {
            sendToRenderer("file:save-with-ai-metadata", {
              fileId: context.fileId,
              tabType,
              aiModel: apiModelId,
              aiPrompt: prompt,
              toolName: tabType === "excel" ? "ExcelAgent" : "DocsAgent",
            });
          }

          return { success: true, text: fullText };
        } catch (streamError) {
          if (abortController.signal.aborted) {
            return { success: false, cancelled: true };
          }
          throw streamError;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const errorStack = error instanceof Error ? error.stack : undefined;
        log.error(`[AgentPanel] Error in agent stream for ${provider}/${modelId}:`, {
          error: errorMessage,
          stack: errorStack,
          sessionId,
          tabType,
        });

        emitAgentEvent(sessionId, {
          type: "error",
          error: errorMessage,
        });

        return { success: false, error: errorMessage };
      } finally {
        activeAgentStreams.delete(sessionId);
      }
    }),

  /**
   * Stop an active agent stream
   */
  stop: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const controller = activeAgentStreams.get(input.sessionId);
      if (controller) {
        controller.abort();
        activeAgentStreams.delete(input.sessionId);
        return { success: true };
      }
      return { success: false };
    }),

  /**
   * Load PDF context for a session
   */
  loadPdfContext: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        pdfPath: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const pdfData = await loadPDFContext(input.sessionId, input.pdfPath);
      if (pdfData) {
        return {
          success: true,
          pageCount: pdfData.pages.length,
          totalWords: pdfData.pages.reduce((sum, p) => sum + p.wordCount, 0),
        };
      }
      return { success: false };
    }),

  /**
   * Clear PDF context for a session
   */
  clearPdfContext: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      clearPDFContext(input.sessionId);
      return { success: true };
    }),

  /**
   * Get current PDF context status
   */
  getPdfContextStatus: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .query(({ input }) => {
      const context = getPDFContext(input.sessionId);
      if (context) {
        return {
          loaded: true,
          path: context.path,
          pageCount: context.pages.length,
          totalWords: context.pages.reduce((sum, p) => sum + p.wordCount, 0),
        };
      }
      return { loaded: false };
    }),
});
