/**
 * Agent Panel Router - tRPC router for document-contextual AI agents
 *
 * Provides streaming AI responses for Excel, Docs, and PDF tabs using
 * the AI SDK with specialized agents.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import log from "electron-log";
import { sendToRenderer } from "../../window-manager";
import { getSecureApiKeyStore } from "../../auth/api-key-store";
import { getChatGPTAuthManager } from "../../auth";
import { getModelById, DEFAULT_MODELS } from "@shared/ai-types";
import type { AIProvider } from "@shared/ai-types";
import {
  loadPDFContext,
  getPDFContext,
  clearPDFContext,
} from "../../agents/agent-service";
import { createPDFTools } from "../../agents/pdf-agent";
import { createExcelTools } from "../../agents/excel-agent";
import { createDocsTools } from "../../agents/docs-agent";
import type {
  AgentContext,
  PDFContext,
  ExcelContext,
  DocsContext,
} from "../../agents/types";

// Store active streams for cancellation
const activeAgentStreams = new Map<string, AbortController>();

// Event types for agent panel streaming
export type AgentPanelStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "text-done"; text: string }
  | { type: "tool-call-start"; toolName: string; toolCallId: string }
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
  log.info(`[AgentPanel] Emitting event:`, { sessionId, type: event.type });
  sendToRenderer("agent-panel:stream", { sessionId, ...event });
}

// Get API key and create OpenAI client
async function getOpenAIClient(
  provider: AIProvider,
): Promise<ReturnType<typeof createOpenAI> | null> {
  const keyStore = getSecureApiKeyStore();

  if (provider === "chatgpt-plus") {
    const authManager = getChatGPTAuthManager();
    if (!authManager.isConnected()) {
      return null;
    }
    const token = authManager.getAccessToken();
    if (!token) return null;

    return createOpenAI({
      apiKey: token,
      baseURL: "https://chatgpt.com/backend-api/v1",
    });
  }

  if (provider === "zai") {
    // Z.AI uses OpenAI-compatible API, but we don't have a separate key store for it yet
    // For now, fall back to OpenAI key if available (user can configure Z.AI URL in settings)
    const openaiKey = keyStore.getOpenAIKey();
    if (!openaiKey) return null;

    return createOpenAI({
      apiKey: openaiKey,
      baseURL: "https://api.z.ai/api/paas/v4/",
    });
  }

  // Default: OpenAI API
  const openaiKey = keyStore.getOpenAIKey();
  if (!openaiKey) return null;

  return createOpenAI({ apiKey: openaiKey });
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
        provider: z.enum(["openai", "chatgpt-plus", "zai"]).default("openai"),
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
            // Excel specific
            workbookId: z.string().optional(),
            sheetId: z.string().optional(),
            selectedRange: z.string().optional(),
            // Docs specific
            documentId: z.string().optional(),
            documentTitle: z.string().optional(),
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

        // Create OpenAI client
        const openai = await getOpenAIClient(provider);
        if (!openai) {
          emitAgentEvent(sessionId, {
            type: "error",
            error: `No API key configured for ${provider}. Please add one in Settings.`,
          });
          return { success: false };
        }

        const model = openai(apiModelId);

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
          log.info(`[AgentPanel] PDF context received:`, {
            hasPdfPath: !!context?.pdfPath,
            pdfPath: context?.pdfPath,
            hasPdfName: !!context?.pdfName,
            pdfName: context?.pdfName,
            hasPdfPages: !!context?.pdfPages,
            pdfPagesCount: context?.pdfPages?.length ?? 0,
          });

          // 1. Use pre-extracted pages if provided (for remote PDFs)
          if (context?.pdfPages && context.pdfPages.length > 0) {
            agentContext.pdfPages = context.pdfPages;
            agentContext.pdfPath =
              context.pdfName || context.pdfPath || "document.pdf";
            log.info(
              `[AgentPanel] Using ${context.pdfPages.length} pre-extracted pages`,
            );
          }
          // 2. Check cached context
          else {
            const cachedPdfContext = getPDFContext(sessionId);
            if (cachedPdfContext) {
              agentContext.pdfPages = cachedPdfContext.pages;
              agentContext.pdfPath = cachedPdfContext.path;
              log.info(
                `[AgentPanel] Using cached PDF context: ${cachedPdfContext.path}`,
              );
            }
            // 3. Try to load from local file path (only for file:// URLs or local paths)
            else if (context?.pdfPath && !context.pdfPath.startsWith("http")) {
              const localPath = context.pdfPath.startsWith("file://")
                ? context.pdfPath.replace("file://", "")
                : context.pdfPath;
              log.info(
                `[AgentPanel] Loading PDF from local path: ${localPath}`,
              );
              try {
                const pdfPages = await loadPDFContext(sessionId, localPath);
                if (pdfPages) {
                  agentContext.pdfPages = pdfPages;
                  log.info(
                    `[AgentPanel] Loaded ${pdfPages.length} pages from local file`,
                  );
                } else {
                  log.warn(
                    `[AgentPanel] loadPDFContext returned null for: ${localPath}`,
                  );
                }
              } catch (loadError) {
                log.error(`[AgentPanel] Error loading PDF:`, loadError);
              }
            } else {
              log.warn(
                `[AgentPanel] No valid PDF path provided or path is HTTP URL`,
              );
            }
          }

          log.info(
            `[AgentPanel] Final agentContext.pdfPages count: ${agentContext.pdfPages?.length ?? 0}`,
          );
        }

        // Create specialized tools based on tab type and generate system prompt
        let systemPrompt = "";
        let agentTools: Record<string, unknown> = {};

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
            break;
          }

          case "excel": {
            const excelContext: ExcelContext = {
              ...agentContext,
              workbookId: context?.workbookId,
              sheetId: context?.sheetId,
              selectedRange: context?.selectedRange,
            };
            systemPrompt = `Eres un experto en hojas de cálculo especializado en Univer (similar a Excel/Google Sheets).

## Tus capacidades:
- Crear hojas de cálculo con datos estructurados
- Actualizar celdas con valores, fórmulas y formatos
- Aplicar formatos condicionales
- Ordenar y filtrar datos
- Generar análisis y cálculos
- Crear rangos con fórmulas avanzadas

## Reglas:
1. Siempre formatea los encabezados en negrita
2. Usa fórmulas cuando sea apropiado (SUM, AVERAGE, IF, VLOOKUP, etc.)
3. Aplica formato numérico apropiado (moneda, porcentaje, fecha)
4. Para datos financieros, usa 2 decimales`;
            agentTools = createExcelTools(excelContext);
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
            agentTools = createDocsTools(docsContext);
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

        log.info(
          `[AgentPanel] Starting ${tabType} agent stream for session ${sessionId}`,
        );

        // Stream the response using AI SDK
        // Build user/assistant messages (exclude system - use system param instead)
        const chatMessages = inputMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = streamText({
          model: model as any,
          system: systemPrompt,
          messages: chatMessages as any,
          tools: agentTools as any,
          abortSignal: abortController.signal,
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

          log.info(`[AgentPanel] Stream completed for session ${sessionId}`);
          return { success: true, text: fullText };
        } catch (streamError) {
          if (abortController.signal.aborted) {
            log.info(`[AgentPanel] Stream cancelled for session ${sessionId}`);
            return { success: false, cancelled: true };
          }
          throw streamError;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        log.error(`[AgentPanel] Error in agent stream:`, error);

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
        log.info(`[AgentPanel] Stopped stream for session ${input.sessionId}`);
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
      const pages = await loadPDFContext(input.sessionId, input.pdfPath);
      if (pages) {
        return {
          success: true,
          pageCount: pages.length,
          totalWords: pages.reduce((sum, p) => sum + p.wordCount, 0),
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
