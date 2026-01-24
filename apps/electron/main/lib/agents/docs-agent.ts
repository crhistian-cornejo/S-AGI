/**
 * Docs Agent - Specialized for Univer Document operations with research capabilities
 *
 * Capabilities:
 * - Create and edit rich text documents
 * - Research topics using web search
 * - Generate structured content (reports, proposals, essays)
 * - Format text with styles (headings, lists, tables)
 * - Insert images and hyperlinks
 * - Export to various formats
 */

import { Agent } from "@ai-sdk-tools/agents";
import { tool } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import type { DocsContext } from "./types";
import { sendToRenderer } from "../window-manager";
import log from "electron-log";

/**
 * Docs Agent Instructions
 */
const DOCS_INSTRUCTIONS = `Eres un experto escritor y editor de documentos especializado en Univer Docs (similar a Word/Google Docs).

## Tus capacidades:
- Crear documentos estructurados (informes, propuestas, ensayos, manuales)
- Investigar temas usando búsqueda web
- Generar contenido profesional y bien estructurado
- Aplicar formato de texto (encabezados, listas, tablas)
- Insertar elementos multimedia e hipervínculos
- Organizar información de manera clara y lógica

## Proceso de trabajo:
1. Si el usuario pide un documento sobre un tema, PRIMERO investiga el tema
2. Organiza la información en una estructura lógica
3. Genera el contenido con formato apropiado
4. Revisa y mejora la redacción

## Estructura de documentos:
- Usa encabezados jerárquicos (H1 para título, H2 para secciones, H3 para subsecciones)
- Incluye introducción, desarrollo y conclusión cuando sea apropiado
- Usa listas para enumerar puntos
- Usa tablas para datos comparativos
- Incluye fuentes/referencias cuando investigues

## Estilo de escritura:
- Profesional pero accesible
- Claro y conciso
- Sin repeticiones innecesarias
- Párrafos de longitud moderada
- Transiciones suaves entre secciones

## Formato Markdown:
El contenido se procesa como Markdown. Usa:
- # para H1, ## para H2, ### para H3
- **texto** para negrita, *texto* para cursiva
- - item para listas
- [texto](url) para enlaces
- | tabla | formato | para tablas`;

/**
 * Create Docs-specific tools
 * @public - exported for use in agent-panel router
 */
export function createDocsTools(context: DocsContext) {
  return {
    create_document: tool({
      description:
        "Crea un nuevo documento con contenido estructurado. Ideal para informes, propuestas, ensayos.",
      inputSchema: z.object({
        title: z.string().describe("Título del documento"),
        content: z
          .string()
          .describe("Contenido del documento en formato Markdown"),
        template: z
          .enum(["blank", "report", "proposal", "essay", "letter", "manual"])
          .optional()
          .describe("Plantilla a usar"),
      }),
      execute: async ({ title, content, template }) => {
        log.info(`[DocsAgent] Creating document: ${title}`);

        const artifactId = crypto.randomUUID();

        // Convert markdown to Univer document format
        const documentData = markdownToUniverDoc(title, content);

        sendToRenderer("artifact:created", {
          type: "document",
          id: artifactId,
          title,
          data: documentData,
          template,
          chatId: context.chatId,
          userId: context.userId,
        });

        return {
          success: true,
          artifactId,
          title,
          wordCount: content.split(/\s+/).length,
          message: `Documento "${title}" creado exitosamente.`,
        };
      },
    }),

    update_document: tool({
      description: "Actualiza el contenido de un documento existente.",
      inputSchema: z.object({
        content: z.string().describe("Nuevo contenido en Markdown"),
        mode: z
          .enum(["replace", "append", "prepend"])
          .default("replace")
          .describe("Modo de actualización"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ content, mode, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay documento activo" };
        }

        log.info(`[DocsAgent] Updating document (${mode}): ${targetId}`);

        sendToRenderer("artifact:update-document", {
          artifactId: targetId,
          content,
          mode,
        });

        return {
          success: true,
          mode,
          message: `Documento actualizado (${mode}).`,
        };
      },
    }),

    insert_section: tool({
      description: "Inserta una nueva sección en el documento.",
      inputSchema: z.object({
        heading: z.string().describe("Título de la sección"),
        content: z.string().describe("Contenido de la sección en Markdown"),
        level: z
          .number()
          .min(1)
          .max(6)
          .default(2)
          .describe("Nivel del encabezado (1-6)"),
        position: z
          .enum(["end", "start", "after_current"])
          .default("end")
          .describe("Dónde insertar la sección"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ heading, content, level, position, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay documento activo" };
        }

        const headingMd = "#".repeat(level);
        const sectionContent = `${headingMd} ${heading}\n\n${content}`;

        log.info(`[DocsAgent] Inserting section "${heading}" at ${position}`);

        sendToRenderer("artifact:insert-section", {
          artifactId: targetId,
          content: sectionContent,
          position,
        });

        return {
          success: true,
          heading,
          position,
          message: `Sección "${heading}" insertada.`,
        };
      },
    }),

    insert_table: tool({
      description: "Inserta una tabla en el documento.",
      inputSchema: z.object({
        headers: z.array(z.string()).describe("Encabezados de la tabla"),
        rows: z.array(z.array(z.string())).describe("Filas de datos"),
        caption: z.string().optional().describe("Título de la tabla"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ headers, rows, caption, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay documento activo" };
        }

        // Build markdown table
        let tableContent = "";
        if (caption) {
          tableContent += `**${caption}**\n\n`;
        }
        tableContent += `| ${headers.join(" | ")} |\n`;
        tableContent += `| ${headers.map(() => "---").join(" | ")} |\n`;
        for (const row of rows) {
          tableContent += `| ${row.join(" | ")} |\n`;
        }

        log.info(
          `[DocsAgent] Inserting table with ${headers.length} columns, ${rows.length} rows`,
        );

        sendToRenderer("artifact:insert-content", {
          artifactId: targetId,
          content: tableContent,
          type: "table",
        });

        return {
          success: true,
          columns: headers.length,
          rows: rows.length,
          message: `Tabla insertada con ${headers.length} columnas y ${rows.length} filas.`,
        };
      },
    }),

    insert_list: tool({
      description: "Inserta una lista en el documento.",
      inputSchema: z.object({
        items: z.array(z.string()).describe("Items de la lista"),
        type: z
          .enum(["bullet", "numbered", "checklist"])
          .default("bullet")
          .describe("Tipo de lista"),
        title: z.string().optional().describe("Título opcional para la lista"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ items, type, title, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay documento activo" };
        }

        let listContent = "";
        if (title) {
          listContent += `**${title}**\n\n`;
        }

        items.forEach((item, index) => {
          switch (type) {
            case "numbered":
              listContent += `${index + 1}. ${item}\n`;
              break;
            case "checklist":
              listContent += `- [ ] ${item}\n`;
              break;
            default:
              listContent += `- ${item}\n`;
          }
        });

        log.info(
          `[DocsAgent] Inserting ${type} list with ${items.length} items`,
        );

        sendToRenderer("artifact:insert-content", {
          artifactId: targetId,
          content: listContent,
          type: "list",
        });

        return {
          success: true,
          itemCount: items.length,
          type,
          message: `Lista ${type} insertada con ${items.length} items.`,
        };
      },
    }),

    research_topic: tool({
      description:
        "Investiga un tema usando búsqueda web y devuelve información estructurada. Úsalo antes de crear documentos que requieran información actualizada.",
      inputSchema: z.object({
        topic: z.string().describe("Tema a investigar"),
        depth: z
          .enum(["quick", "detailed", "comprehensive"])
          .default("detailed")
          .describe("Profundidad de la investigación"),
        focus: z
          .array(z.string())
          .optional()
          .describe("Aspectos específicos a investigar"),
      }),
      execute: async ({ topic, depth, focus }) => {
        log.info(`[DocsAgent] Researching topic: ${topic} (${depth})`);

        // Emit research status
        sendToRenderer("agent:status", {
          agent: "DocsAgent",
          status: "researching",
          topic,
        });

        // Build search queries based on focus areas
        const queries =
          focus && focus.length > 0
            ? focus.map((f) => `${topic} ${f}`)
            : [topic];

        // This will be expanded with actual web search integration
        // For now, return a structured response prompting the model to continue
        return {
          success: true,
          topic,
          depth,
          queries,
          instructions: `
                    Research request received. To complete this:
                    1. Use available web search tools to find information about: ${queries.join(", ")}
                    2. Focus on recent and authoritative sources
                    3. Compile findings into a structured format
                    4. Include citations for key facts
                    `,
          message: `Investigación sobre "${topic}" iniciada. Profundidad: ${depth}.`,
        };
      },
    }),

    generate_outline: tool({
      description:
        "Genera un esquema/outline para un documento basado en el tema y tipo.",
      inputSchema: z.object({
        topic: z.string().describe("Tema del documento"),
        type: z
          .enum(["report", "proposal", "essay", "manual", "article"])
          .describe("Tipo de documento"),
        sections: z
          .number()
          .min(3)
          .max(10)
          .default(5)
          .describe("Número aproximado de secciones"),
      }),
      execute: async ({ topic, type, sections }) => {
        log.info(`[DocsAgent] Generating outline for ${type} about "${topic}"`);

        // Template-based outline generation
        const outlineTemplates: Record<string, string[]> = {
          report: [
            "Resumen Ejecutivo",
            "Introducción",
            "Metodología",
            "Hallazgos",
            "Análisis",
            "Conclusiones",
            "Recomendaciones",
          ],
          proposal: [
            "Resumen",
            "Problema/Oportunidad",
            "Solución Propuesta",
            "Beneficios",
            "Plan de Implementación",
            "Presupuesto",
            "Conclusión",
          ],
          essay: [
            "Introducción",
            "Contexto",
            "Argumento Principal",
            "Argumentos de Apoyo",
            "Contraargumentos",
            "Conclusión",
          ],
          manual: [
            "Introducción",
            "Requisitos",
            "Instalación",
            "Uso Básico",
            "Funciones Avanzadas",
            "Solución de Problemas",
            "FAQ",
          ],
          article: [
            "Introducción",
            "Antecedentes",
            "Desarrollo",
            "Ejemplos/Casos",
            "Implicaciones",
            "Conclusión",
          ],
        };

        const template = outlineTemplates[type] || outlineTemplates.report;
        const selectedSections = template.slice(
          0,
          Math.min(sections, template.length),
        );

        return {
          success: true,
          topic,
          type,
          outline: selectedSections.map((section, i) => ({
            number: i + 1,
            title: section,
            level: section === selectedSections[0] ? 1 : 2,
          })),
          message: `Esquema generado con ${selectedSections.length} secciones para ${type} sobre "${topic}".`,
        };
      },
    }),

    export_document: tool({
      description: "Exporta el documento a un formato específico.",
      inputSchema: z.object({
        format: z
          .enum(["pdf", "docx", "markdown", "html"])
          .describe("Formato de exportación"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ format, artifactId }) => {
        const targetId = artifactId || context.artifactId;
        if (!targetId) {
          return { success: false, error: "No hay documento activo" };
        }

        log.info(`[DocsAgent] Exporting document to ${format}`);

        sendToRenderer("artifact:export", {
          artifactId: targetId,
          format,
        });

        return {
          success: true,
          format,
          message: `Exportación a ${format.toUpperCase()} iniciada.`,
        };
      },
    }),

    check_grammar: tool({
      description:
        "Revisa gramática y ortografía del documento y sugiere correcciones.",
      inputSchema: z.object({
        text: z
          .string()
          .optional()
          .describe(
            "Texto a revisar (si no se proporciona, revisa todo el documento)",
          ),
        language: z
          .enum(["es", "en"])
          .default("es")
          .describe("Idioma del texto"),
        artifactId: z.string().optional(),
      }),
      execute: async ({ text, language }) => {
        log.info(`[DocsAgent] Checking grammar (${language})`);

        // This will trigger a grammar check
        // The actual grammar checking could be done by the LLM or a dedicated service
        return {
          success: true,
          language,
          instruction: `Please review the following text for grammar and spelling errors in ${language === "es" ? "Spanish" : "English"}:
                    ${text || "[Document content will be analyzed]"}

                    Provide corrections and suggestions.`,
          message: `Revisión de gramática iniciada (${language}).`,
        };
      },
    }),
  };
}

/**
 * Convert Markdown to Univer document format
 */
function markdownToUniverDoc(title: string, content: string): unknown {
  // Basic conversion - Univer expects a specific document structure
  // This is a simplified version; full implementation would parse markdown properly
  const docId = crypto.randomUUID();

  return {
    id: docId,
    title,
    body: {
      dataStream: content,
      textRuns: [],
      paragraphs: [
        {
          startIndex: 0,
          paragraphStyle: {
            spaceAbove: 10,
            spaceBelow: 10,
          },
        },
      ],
    },
    documentStyle: {
      pageSize: {
        width: 595, // A4 width in points
        height: 842, // A4 height in points
      },
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 72,
      marginRight: 72,
    },
  };
}

/**
 * Create the Docs Agent
 */
export function createDocsAgent(
  model: LanguageModel,
  context: DocsContext,
): Agent<DocsContext> {
  return new Agent({
    name: "DocsAgent",
    model,
    instructions: DOCS_INSTRUCTIONS,
    tools: createDocsTools(context),
    handoffDescription:
      "Especialista en documentos Univer con capacidades de investigación. Úsalo para crear informes, propuestas, ensayos y documentos profesionales.",
    maxTurns: 15, // More turns for research + writing
    temperature: 0.7, // Higher temperature for creative writing
  });
}

// Singleton for reuse
let docsAgentInstance: Agent<DocsContext> | null = null;

export const DocsAgent = {
  /**
   * Get or create the Docs agent
   */
  getInstance(model: LanguageModel, context: DocsContext): Agent<DocsContext> {
    if (!docsAgentInstance) {
      docsAgentInstance = createDocsAgent(model, context);
    }
    return docsAgentInstance;
  },

  /**
   * Reset the agent instance
   */
  reset(): void {
    docsAgentInstance = null;
  },
};
