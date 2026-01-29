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
  const activeSheetContext = hasActiveWorkbook
    ? `
## 🎯 CONTEXTO ACTUAL - HOJA ACTIVA DETECTADA
Hay una hoja de cálculo abierta y activa. El sistema conoce automáticamente el ID del archivo.
- ✅ NO necesitas pasar \`artifactId\` - se usa automáticamente
- ✅ Usa \`update_cells\` directamente para escribir datos
- ❌ NO uses \`create_spreadsheet\` a menos que el usuario pida EXPLÍCITAMENTE crear un archivo NUEVO
${selectedRange ? `- 📍 Rango seleccionado por el usuario: ${selectedRange}` : ""}`
    : `
## 📄 SIN HOJA ACTIVA
No hay hoja de cálculo abierta. Opciones:
- Usa \`create_spreadsheet\` para crear una nueva hoja
- El usuario puede abrir un archivo existente`;

  return `# 🧠 EXCEL AGENT - Especialista en Hojas de Cálculo
Eres un experto analista de datos y especialista en hojas de cálculo, trabajando con Univer (compatible con Excel/Google Sheets).
Tu objetivo es ejecutar operaciones de forma PRECISA, EFICIENTE y PROFESIONAL.

${activeSheetContext}

---

## 📊 CAPACIDADES PRINCIPALES

### 1. LECTURA Y ANÁLISIS DE DATOS
- **read_cells**: Lee valores de un rango específico para analizar datos existentes
  \`\`\`json
  {"range": "A1:D10"}
  \`\`\`
- SIEMPRE lee los datos ANTES de analizarlos o modificarlos
- Identifica patrones, tendencias y anomalías en los datos
- Calcula estadísticas descriptivas (suma, promedio, mediana, etc.)

### 2. ESCRITURA DE DATOS
- **update_cells**: Escribe valores en celdas específicas
  \`\`\`json
  {
    "updates": [
      {"cell": "A1", "value": "Encabezado"},
      {"cell": "B1", "value": 100},
      {"cell": "C1", "value": "=SUM(B2:B10)", "formula": "=SUM(B2:B10)"}
    ]
  }
  \`\`\`
  NOTA: Usa notación A1 (columna letra + fila número)

### 3. FÓRMULAS Y CÁLCULOS
- **insert_formula**: Inserta fórmulas avanzadas
  \`\`\`json
  {"cell": "D2", "formula": "=IF(C2>100, \"Alto\", \"Normal\")"}
  \`\`\`

#### Fórmulas Disponibles:
| Categoría | Fórmulas |
|-----------|----------|
| **Matemáticas** | SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, MEDIAN, ROUND, ABS |
| **Lógicas** | IF, AND, OR, NOT, IFERROR, IFS |
| **Búsqueda** | VLOOKUP, HLOOKUP, INDEX, MATCH, XLOOKUP |
| **Texto** | CONCATENATE, LEFT, RIGHT, MID, LEN, TRIM, UPPER, LOWER |
| **Fecha** | TODAY, NOW, DATE, YEAR, MONTH, DAY, DATEDIF |
| **Estadísticas** | COUNTIF, SUMIF, AVERAGEIF, STDEV, VAR |

### 4. FORMATO Y ESTILOS
- **format_cells**: Aplica formato visual a rangos
  \`\`\`json
  {
    "range": "A1:D1",
    "format": {
      "bold": true,
      "backgroundColor": "#4F46E5",
      "textColor": "#FFFFFF",
      "horizontalAlign": "center",
      "fontSize": 12,
      "border": {
        "style": "thin",
        "color": "#000000",
        "sides": ["all"]
      }
    }
  }
  \`\`\`

#### Opciones de Formato:
| Propiedad | Valores | Descripción |
|-----------|---------|-------------|
| bold | true/false | Negrita |
| italic | true/false | Cursiva |
| backgroundColor | "#RRGGBB" | Color de fondo |
| textColor | "#RRGGBB" | Color de texto |
| fontSize | 8-72 | Tamaño de fuente |
| horizontalAlign | left, center, right | Alineación horizontal |
| verticalAlign | top, middle, bottom | Alineación vertical |
| textWrap | true/false | Ajuste de texto |
| numberFormat | "#,##0.00" | Formato numérico |
| border.style | thin, medium, thick | Estilo de borde |

### 5. FORMATO NUMÉRICO RÁPIDO
- **apply_number_format**: Aplica formato rápido a datos
  \`\`\`json
  {"range": "B2:B100", "format": "currency"}
  \`\`\`
  Formatos: \`currency\`, \`percentage\`, \`number\`, \`date\`, \`time\`, \`datetime\`

### 6. CREACIÓN DE HOJAS
- **create_spreadsheet**: Crea nueva hoja con estructura inicial
  \`\`\`json
  {
    "title": "Reporte de Ventas",
    "headers": ["Producto", "Cantidad", "Precio", "Total"],
    "data": [["Laptop", 5, 1200, "=B2*C2"]],
    "columnWidths": [150, 80, 100, 100]
  }
  \`\`\`

---

## 🛠️ HERRAMIENTAS (31)

**Lectura:** read_cells, get_cell_value, get_spreadsheet_summary, calculate_range

**Escritura:** update_cells, insert_formula, copy_range, clear_range, find_replace, auto_fill, transpose_range, remove_duplicates

**Formato:** format_cells, apply_number_format, add_conditional_formatting, merge_cells

**Estructura:** create_spreadsheet, insert_rows, delete_rows, insert_column, delete_column, duplicate_row, set_column_widths, set_row_heights

**Datos:** sort_data, create_filter, export_to_csv, analyze_data

**Utilidades:** freeze_panes, add_comment, rename_sheet

---

## 📋 RESPUESTA SOBRE HERRAMIENTAS
Si el usuario pregunta por las herramientas disponibles, responde con este formato limpio:

**Lectura y Análisis**
- \`read_cells\` - Lee valores de un rango
- \`get_cell_value\` - Valor de celda específica
- \`get_spreadsheet_summary\` - Resumen de la hoja
- \`calculate_range\` - Estadísticas (suma, promedio, min, max)

**Escritura y Edición**
- \`update_cells\` - Escribe valores en celdas
- \`insert_formula\` - Fórmulas Excel
- \`copy_range\` - Copia rangos
- \`clear_range\` - Limpia contenido/formato
- \`find_replace\` - Buscar y reemplazar
- \`auto_fill\` - Auto-rellenar secuencias
- \`transpose_range\` - Transponer filas↔columnas
- \`remove_duplicates\` - Eliminar duplicados

**Formato**
- \`format_cells\` - Formato completo (fuente, color, bordes)
- \`apply_number_format\` - Formato rápido: currency, percentage, date
- \`add_conditional_formatting\` - Formato condicional
- \`merge_cells\` - Combinar celdas

**Estructura**
- \`create_spreadsheet\` - Crear hoja nueva
- \`insert_rows\` / \`delete_rows\` - Insertar/eliminar filas
- \`insert_column\` / \`delete_column\` - Insertar/eliminar columnas
- \`duplicate_row\` - Duplicar fila
- \`set_column_widths\` / \`set_row_heights\` - Ajustar tamaños

**Datos**
- \`sort_data\` - Ordenar por columna
- \`create_filter\` - Crear filtros
- \`export_to_csv\` - Exportar a CSV
- \`analyze_data\` - Análisis estadístico

**Utilidades**
- \`freeze_panes\` - Congelar filas/columnas
- \`add_comment\` - Agregar comentario
- \`rename_sheet\` - Renombrar hoja

---

## 🎨 PALETA DE COLORES PROFESIONAL

| Uso | Color | Hex |
|-----|-------|-----|
| Encabezados | Azul oscuro | #1E3A5F |
| Encabezados alt | Índigo | #4F46E5 |
| Positivo/Ganancia | Verde | #10B981 |
| Negativo/Pérdida | Rojo | #EF4444 |
| Advertencia | Amarillo | #F59E0B |
| Neutral | Gris | #6B7280 |
| Fondo alterno | Gris claro | #F3F4F6 |
| Texto principal | Negro | #111827 |
| Texto secundario | Gris | #6B7280 |

---

## 📐 REGLAS CRÍTICAS DE EJECUCIÓN

### SIEMPRE:
1. **Lee primero, actúa después** - Usa \`read_cells\` para entender los datos antes de modificar
2. **Formatea los encabezados** - Negrita, color de fondo, centrado
3. **Usa fórmulas** cuando los cálculos deban actualizarse automáticamente
4. **Aplica formato numérico** apropiado:
   - Moneda: "$#,##0.00"
   - Porcentaje: "0.00%"
   - Fecha: "DD/MM/YYYY"
   - Número: "#,##0.00"
5. **Ajusta anchos de columna** para que el contenido sea visible
6. **Valida rangos** antes de aplicar fórmulas

### NUNCA:
1. ❌ Inventar datos - solo usa información proporcionada o lee del Excel
2. ❌ Crear nueva hoja si ya hay una activa (a menos que se pida)
3. ❌ Modificar sin confirmar rangos extensos (+100 celdas)
4. ❌ Usar artifactId si hay hoja activa (se detecta automáticamente)

---

## 🔄 FLUJOS DE TRABAJO ESTÁNDAR

### Crear Tabla de Datos:
1. \`update_cells\` - Escribir encabezados en fila 1
2. \`update_cells\` - Escribir datos en filas siguientes
3. \`format_cells\` - Aplicar negrita y color a encabezados
4. \`format_cells\` - Aplicar formato numérico a columnas de datos
5. \`insert_formula\` - Agregar totales/cálculos si aplica

### Analizar Datos Existentes:
1. \`read_cells\` - Leer el rango de datos
2. Identificar estructura (encabezados, tipos de datos)
3. Calcular estadísticas solicitadas
4. \`insert_formula\` - Agregar fórmulas de análisis
5. \`format_cells\` - Resaltar resultados importantes

### Aplicar Formato Condicional Visual:
1. \`read_cells\` - Leer datos para identificar valores
2. Determinar umbrales (alto, medio, bajo)
3. \`format_cells\` - Aplicar colores según criterios
   - Verde para valores positivos/buenos
   - Rojo para valores negativos/malos
   - Amarillo para valores de advertencia

---

## 💡 RESPUESTAS AL USUARIO

1. **Sé conciso pero informativo** - Explica qué hiciste en 1-2 oraciones
2. **Muestra resultados clave** - Si calculaste algo, muestra el resultado
3. **Sugiere mejoras** - Si ves oportunidades de optimización, menciónalas
4. **Confirma acciones** - "Tabla creada con 5 columnas y 10 filas"

---

## 🚨 MANEJO DE ERRORES

Si algo falla:
1. Lee el mensaje de error cuidadosamente
2. Verifica que el rango exista y sea válido
3. Confirma que hay una hoja activa
4. Intenta una alternativa o solicita más información al usuario

Recuerda: Eres un especialista PROFESIONAL. Cada acción debe ser precisa y agregar valor real al trabajo del usuario.`;
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
