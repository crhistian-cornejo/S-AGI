/**
 * Excel Agent - Specialized for Univer Spreadsheet operations
 *
 * Based on midday patterns for progressive rendering and
 * Claude for Excel citation system
 *
 * Capabilities:
 * - Create and manage spreadsheets with progressive stages
 * - Update cells with data, formulas
 * - Format cells (bold, colors, borders)
 * - Apply conditional formatting
 * - Sort and filter data
 * - Generate charts from data
 * - Data analysis and calculations
 * - Cell-level citations (Claude for Excel pattern)
 */

import { Agent } from "@ai-sdk-tools/agents";
import { tool } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import type { ExcelContext } from "./types";
import { sendToRenderer } from "../window-manager";
import log from "electron-log";
import {
  AGENT_METADATA,
  AGENT_INSTRUCTIONS,
  type ArtifactStage,
  type CellCitation,
} from "@s-agi/core";

/**
 * Excel Agent Instructions - using centralized config
 */
const EXCEL_INSTRUCTIONS = AGENT_INSTRUCTIONS.excel;

/**
 * Create Excel-specific tools
 * @public - exported for use in agent-panel router
 */
export function createExcelTools(context: ExcelContext) {
  return {
    create_spreadsheet: tool({
      description:
        "Crea una nueva hoja de cálculo con datos iniciales. Úsalo para crear tablas, reportes o análisis.",
      inputSchema: z.object({
        title: z.string().describe("Título de la hoja de cálculo"),
        headers: z.array(z.string()).describe("Encabezados de las columnas"),
        data: z
          .array(z.array(z.union([z.string(), z.number(), z.null()])))
          .optional()
          .describe("Filas de datos (array de arrays)"),
        columnWidths: z
          .array(z.number())
          .optional()
          .describe("Anchos de columna en pixeles"),
      }),
      execute: async ({ title, headers, data, columnWidths }) => {
        log.info(`[ExcelAgent] Creating spreadsheet: ${title}`);

        const artifactId = crypto.randomUUID();

        // Progressive stage: loading
        sendToRenderer("artifact:stage-update", {
          artifactId,
          stage: "loading" as ArtifactStage,
          message: "Preparando hoja de cálculo...",
        });

        // Build cell data
        const cellData: Record<
          string,
          Record<string, { v: string | number; s?: unknown }>
        > = {};

        // Add headers (row 0)
        headers.forEach((header, col) => {
          if (!cellData["0"]) cellData["0"] = {};
          cellData["0"][String(col)] = {
            v: header,
            s: { bl: 1 }, // Bold
          };
        });

        // Add data rows
        if (data) {
          data.forEach((row, rowIndex) => {
            const rowKey = String(rowIndex + 1);
            if (!cellData[rowKey]) cellData[rowKey] = {};
            row.forEach((cell, col) => {
              if (cell !== null && cell !== undefined) {
                cellData[rowKey][String(col)] = { v: cell };
              }
            });
          });
        }

        // Build workbook structure
        const workbookData = {
          id: artifactId,
          name: title,
          sheetOrder: ["sheet1"],
          sheets: {
            sheet1: {
              id: "sheet1",
              name: "Sheet1",
              rowCount: Math.max(100, (data?.length || 0) + 10),
              columnCount: Math.max(26, headers.length + 5),
              cellData,
              defaultColumnWidth: 100,
              defaultRowHeight: 24,
              columnData: columnWidths
                ? Object.fromEntries(
                    columnWidths.map((w, i) => [String(i), { w }]),
                  )
                : undefined,
            },
          },
        };

        // Progressive stage: data_ready
        sendToRenderer("artifact:stage-update", {
          artifactId,
          stage: "data_ready" as ArtifactStage,
          message: "Datos cargados",
        });

        // Send to renderer with progressive stages (midday pattern)
        sendToRenderer("artifact:created", {
          type: "spreadsheet",
          id: artifactId,
          artifactId,
          name: title,
          title,
          data: workbookData,
          chatId: context.chatId,
          userId: context.userId,
          // Progressive artifact data (midday pattern)
          stage: "data_ready" as ArtifactStage,
          metadata: {
            rowCount: (data?.length || 0) + 1,
            columnCount: headers.length,
            hasFormulas: false,
            hasCharts: false,
          },
        });

        // Final stage: complete
        sendToRenderer("artifact:stage-update", {
          artifactId,
          stage: "complete" as ArtifactStage,
          message: "Hoja de cálculo lista",
        });

        return {
          success: true,
          artifactId,
          title,
          rowCount: (data?.length || 0) + 1,
          columnCount: headers.length,
          stage: "complete",
          message: `Hoja de cálculo "${title}" creada con ${headers.length} columnas y ${(data?.length || 0) + 1} filas.`,
        };
      },
    }),

    update_cells: tool({
      description:
        "Actualiza celdas en la hoja de cálculo activa. Puede actualizar valores, fórmulas o ambos.",
      inputSchema: z.object({
        range: z.string().describe("Rango de celdas en formato A1:B10"),
        values: z
          .array(z.array(z.union([z.string(), z.number(), z.null()])))
          .describe("Valores para el rango (array de filas)"),
        artifactId: z
          .string()
          .optional()
          .describe("ID del artefacto (opcional si hay uno activo)"),
      }),
      execute: async ({ range, values, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        log.info(`[ExcelAgent] Updating cells ${range} in ${targetId}`);

        sendToRenderer("artifact:update-cells", {
          artifactId: targetId,
          range,
          values,
        });

        return {
          success: true,
          range,
          cellCount: values.flat().filter((v) => v !== null).length,
          message: `Celdas ${range} actualizadas.`,
        };
      },
    }),

    format_cells: tool({
      description:
        "Aplica formato a un rango de celdas (negrita, color, bordes, número).",
      inputSchema: z.object({
        range: z.string().describe("Rango de celdas en formato A1:B10"),
        format: z.object({
          bold: z.boolean().optional().describe("Texto en negrita"),
          italic: z.boolean().optional().describe("Texto en cursiva"),
          backgroundColor: z
            .string()
            .optional()
            .describe("Color de fondo en hex (#RRGGBB)"),
          textColor: z.string().optional().describe("Color de texto en hex"),
          numberFormat: z
            .enum(["number", "currency", "percentage", "date", "text"])
            .optional()
            .describe("Formato numérico"),
          horizontalAlign: z
            .enum(["left", "center", "right"])
            .optional()
            .describe("Alineación horizontal"),
          borders: z.boolean().optional().describe("Agregar bordes"),
        }),
        artifactId: z.string().optional(),
      }),
      execute: async ({ range, format, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        log.info(`[ExcelAgent] Formatting cells ${range}`);

        sendToRenderer("artifact:format-cells", {
          artifactId: targetId,
          range,
          format,
        });

        return {
          success: true,
          range,
          appliedFormats: Object.keys(format).filter(
            (k) => format[k as keyof typeof format],
          ),
          message: `Formato aplicado a ${range}.`,
        };
      },
    }),

    insert_formula: tool({
      description:
        "Inserta una fórmula en una celda. Soporta fórmulas de Excel estándar.",
      inputSchema: z.object({
        cell: z.string().describe("Celda donde insertar la fórmula (ej: C10)"),
        formula: z.string().describe("Fórmula a insertar (ej: =SUM(A1:A9))"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ cell, formula, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        // Ensure formula starts with =
        const normalizedFormula = formula.startsWith("=")
          ? formula
          : `=${formula}`;

        log.info(
          `[ExcelAgent] Inserting formula in ${cell}: ${normalizedFormula}`,
        );

        sendToRenderer("artifact:update-cells", {
          artifactId: targetId,
          range: `${cell}:${cell}`,
          values: [[normalizedFormula]],
        });

        return {
          success: true,
          cell,
          formula: normalizedFormula,
          message: `Fórmula insertada en ${cell}.`,
        };
      },
    }),

    add_conditional_formatting: tool({
      description: "Aplica formato condicional a un rango basado en reglas.",
      inputSchema: z.object({
        range: z.string().describe("Rango para el formato condicional"),
        rule: z.object({
          type: z
            .enum([
              "greaterThan",
              "lessThan",
              "equalTo",
              "between",
              "containsText",
              "colorScale",
            ])
            .describe("Tipo de regla"),
          value: z
            .union([z.string(), z.number()])
            .optional()
            .describe("Valor de comparación"),
          value2: z
            .union([z.string(), z.number()])
            .optional()
            .describe("Segundo valor (para between)"),
          format: z
            .object({
              backgroundColor: z.string().optional(),
              textColor: z.string().optional(),
              bold: z.boolean().optional(),
            })
            .describe("Formato a aplicar cuando se cumple la regla"),
        }),
        artifactId: z.string().optional(),
      }),
      execute: async ({ range, rule, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        log.info(`[ExcelAgent] Adding conditional formatting to ${range}`);

        sendToRenderer("artifact:conditional-format", {
          artifactId: targetId,
          range,
          rule,
        });

        return {
          success: true,
          range,
          ruleType: rule.type,
          message: `Formato condicional aplicado a ${range}.`,
        };
      },
    }),

    sort_data: tool({
      description: "Ordena datos en un rango por una columna específica.",
      inputSchema: z.object({
        range: z.string().describe("Rango de datos a ordenar"),
        sortColumn: z
          .number()
          .describe("Índice de columna para ordenar (0-based)"),
        ascending: z
          .boolean()
          .default(true)
          .describe("Orden ascendente (true) o descendente (false)"),
        hasHeaders: z
          .boolean()
          .default(true)
          .describe("Si el rango incluye encabezados"),
        artifactId: z.string().optional(),
      }),
      execute: async ({
        range,
        sortColumn,
        ascending,
        hasHeaders,
        artifactId,
      }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        log.info(`[ExcelAgent] Sorting ${range} by column ${sortColumn}`);

        sendToRenderer("artifact:sort-data", {
          artifactId: targetId,
          range,
          sortColumn,
          ascending,
          hasHeaders,
        });

        return {
          success: true,
          range,
          sortedBy: `Columna ${sortColumn + 1}`,
          order: ascending ? "ascendente" : "descendente",
          message: `Datos ordenados por columna ${sortColumn + 1} en orden ${ascending ? "ascendente" : "descendente"}.`,
        };
      },
    }),

    analyze_data: tool({
      description:
        "Analiza datos y proporciona estadísticas básicas (suma, promedio, min, max, conteo).",
      inputSchema: z.object({
        range: z.string().describe("Rango de datos a analizar"),
        includeChart: z
          .boolean()
          .default(false)
          .describe("Generar gráfico de los datos"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ range, includeChart, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        log.info(`[ExcelAgent] Analyzing data in ${range}`);

        // Request analysis from renderer
        sendToRenderer("artifact:analyze-data", {
          artifactId: targetId,
          range,
          includeChart,
        });

        return {
          success: true,
          range,
          analysisRequested: true,
          message: `Análisis solicitado para el rango ${range}. Los resultados se mostrarán en la interfaz.`,
        };
      },
    }),

    export_to_csv: tool({
      description: "Exporta la hoja de cálculo a formato CSV.",
      inputSchema: z.object({
        artifactId: z.string().optional(),
        sheetName: z
          .string()
          .optional()
          .describe("Nombre de la hoja a exportar"),
      }),
      execute: async ({ artifactId, sheetName }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        log.info(`[ExcelAgent] Exporting to CSV: ${targetId}`);

        sendToRenderer("artifact:export-csv", {
          artifactId: targetId,
          sheetName,
        });

        return {
          success: true,
          message:
            "Exportación a CSV iniciada. Se abrirá el diálogo de guardado.",
        };
      },
    }),

    // Claude for Excel pattern: Cell citations
    cite_cell: tool({
      description:
        "Cita una celda o rango específico. Crea una citación clickeable que navega a la celda.",
      inputSchema: z.object({
        cell: z.string().describe("Celda a citar (ej: A1 o rango A1:B10)"),
        label: z.string().optional().describe("Etiqueta para la citación"),
        artifactId: z.string().optional(),
        sheetName: z.string().optional().describe("Nombre de la hoja"),
      }),
      execute: async ({ cell, label, artifactId, sheetName }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        log.info(`[ExcelAgent] Creating cell citation: ${cell}`);

        const citation: CellCitation = {
          type: "cell",
          cell,
          range: cell.includes(":") ? cell : undefined,
          value: label || cell,
          artifactId: targetId,
          sheetName,
        };

        // Send citation to renderer for UI display
        sendToRenderer("artifact:citation", {
          artifactId: targetId,
          citation,
        });

        return {
          success: true,
          citation,
          message: `Citación creada para ${cell}`,
        };
      },
    }),

    // Read cell value (for AI to understand current data)
    read_cells: tool({
      description:
        "Lee los valores de un rango de celdas. Útil para analizar datos existentes.",
      inputSchema: z.object({
        range: z.string().describe("Rango de celdas a leer (ej: A1:C10)"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ range, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay hoja de cálculo activa" };
        }

        log.info(`[ExcelAgent] Reading cells ${range} from ${targetId}`);

        // Request cell values from renderer
        sendToRenderer("artifact:read-cells", {
          artifactId: targetId,
          range,
        });

        return {
          success: true,
          range,
          message: `Solicitando datos del rango ${range}. Los valores serán proporcionados por la interfaz.`,
        };
      },
    }),

    // Navigate to artifact tab
    navigate_to_excel: tool({
      description:
        "Navega al tab de Excel para mostrar la hoja de cálculo al usuario.",
      inputSchema: z.object({
        artifactId: z.string().optional(),
      }),
      execute: async ({ artifactId }) => {
        const targetId = artifactId || context.artifactId;

        log.info(`[ExcelAgent] Navigating to Excel tab`);

        sendToRenderer("navigate:tab", {
          tab: "excel",
          artifactId: targetId,
        });

        return {
          success: true,
          message: "Navegando al tab de Excel.",
        };
      },
    }),
  };
}

/**
 * Get Excel agent metadata from centralized config
 */
const excelMeta = AGENT_METADATA.excel;

/**
 * Create the Excel Agent
 * Uses centralized configuration from @s-agi/core
 */
export function createExcelAgent(
  model: LanguageModel,
  context: ExcelContext,
): Agent<ExcelContext> {
  return new Agent({
    name: excelMeta.name,
    model,
    instructions: EXCEL_INSTRUCTIONS,
    tools: createExcelTools(context),
    handoffDescription: excelMeta.description,
    maxTurns: excelMeta.maxTurns,
    temperature: excelMeta.temperature,
  });
}

// Singleton for reuse
let excelAgentInstance: Agent<ExcelContext> | null = null;

export const ExcelAgent = {
  /**
   * Get or create the Excel agent
   */
  getInstance(
    model: LanguageModel,
    context: ExcelContext,
  ): Agent<ExcelContext> {
    if (!excelAgentInstance) {
      excelAgentInstance = createExcelAgent(model, context);
    }
    return excelAgentInstance;
  },

  /**
   * Reset the agent instance
   */
  reset(): void {
    excelAgentInstance = null;
  },
};
