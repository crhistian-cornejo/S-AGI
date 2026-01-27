/**
 * PDF Agent - Specialized for PDF context and conversation
 *
 * Based on midday patterns for progressive rendering
 * Uses centralized configuration from @s-agi/core
 * Inspired by Claude for Excel citation system
 *
 * Capabilities:
 * - Load and parse PDF content with page-level tracking
 * - Search within PDF using semantic and keyword search
 * - Answer questions with citations to specific pages
 * - Extract and summarize sections
 * - Navigate to specific pages/sections
 * - Progressive artifact stages
 */

import { Agent } from "@ai-sdk-tools/agents";
import { tool } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import type { PDFContext, PDFCitation } from "./types";
import { sendToRenderer } from "../window-manager";
import {
  searchWithCitations,
  type PageContent,
} from "../documents/document-processor";
import * as pdfService from "../pdf/pdf-service";
import log from "electron-log";
import {
  AGENT_METADATA,
  type ArtifactStage,
  type PageCitation,
} from "@s-agi/core";

/**
 * PDF Agent Instructions - Dynamic based on context
 */
function getPDFInstructions(context: PDFContext): string {
  const pageCount = context.pages?.length || 0;
  const filename = context.pdfPath?.split("/").pop() || "PDF";

  return `Eres un experto en manipulación y análisis de documentos PDF con capacidades completas.

## Documento actual: ${filename}
- Páginas: ${pageCount}
- Estado: Cargado y listo para operaciones

## Tus capacidades de LECTURA:
- Buscar texto con posiciones exactas
- Responder preguntas con citaciones precisas
- Resumir secciones o documento completo
- Extraer datos estructurados (tablas, listas)

## Tus capacidades de MANIPULACIÓN:
- Rellenar formularios PDF (campos de texto, checkboxes)
- Fusionar múltiples PDFs en uno
- Dividir PDF en páginas individuales o rangos
- Extraer páginas específicas
- Eliminar o reordenar páginas
- Rotar páginas en el archivo (90°, 180°, 270°)
- Agregar marca de agua de texto
- Comprimir PDF para reducir tamaño
- Encriptar/proteger con contraseña
- Modificar metadatos (título, autor, etc.)

## Tus capacidades de VISOR:
- Controlar zoom (porcentaje, ajustar a ancho, ajustar a página)
- Rotar vista de páginas
- Añadir anotaciones visuales (highlight, underline, strikethrough, notas, rectángulos)
- Navegar a páginas específicas
- Copiar texto de rangos de páginas
- Obtener información del PDF (páginas, tamaño, formularios, encriptación)

## REGLAS CRÍTICAS DE CITACIÓN:
1. SIEMPRE cita la página cuando menciones información: [página N]
2. Múltiples fuentes: [páginas 3, 5, 12]
3. Si no encuentras algo: "No encontré esta información en el documento."

## REGLAS PARA MODIFICACIONES:
1. Confirma la operación antes de ejecutar cambios destructivos
2. Informa el resultado de cada operación (éxito/error)
3. Si el PDF tiene formulario, lista los campos disponibles primero

## Ejemplo correcto:
"El presupuesto es $1,500,000 [página 5]. ¿Deseas que llene el campo 'Monto' con este valor?"

IMPORTANTE: Cita CADA dato del PDF con [página N].`;
}

/**
 * Create PDF-specific tools
 * @public - exported for use in agent-panel router
 */
export function createPDFTools(context: PDFContext) {
  return {
    search_pdf: tool({
      description:
        "Busca texto específico en el PDF y devuelve resultados con números de página. Usa esto para encontrar información antes de responder preguntas.",
      inputSchema: z.object({
        query: z.string().describe("Texto o tema a buscar"),
        maxResults: z
          .number()
          .min(1)
          .max(10)
          .default(5)
          .describe("Número máximo de resultados"),
      }),
      execute: async ({ query, maxResults }) => {
        if (!context.pages || context.pages.length === 0) {
          return {
            success: false,
            error: "PDF no cargado o sin contenido de texto",
          };
        }

        log.info(`[PDFAgent] Searching for: "${query}"`);

        const results = searchWithCitations(query, context.pages, maxResults);

        if (results.length === 0) {
          return {
            success: true,
            found: false,
            query,
            message: `No se encontró "${query}" en el documento.`,
            results: [],
          };
        }

        const citations: PDFCitation[] = results.map((r, i) => ({
          text: r.text,
          pageNumber: r.pageNumber,
          filename: context.pdfPath?.split("/").pop() || "PDF",
          citationId: i + 1,
        }));

        return {
          success: true,
          found: true,
          query,
          resultCount: results.length,
          results: citations.map((c) => ({
            citationId: c.citationId,
            page: c.pageNumber,
            excerpt: c.text,
            citation: `[página ${c.pageNumber}]`,
          })),
          message: `Encontré ${results.length} resultado(s) para "${query}".`,
        };
      },
    }),

    get_page_content: tool({
      description:
        "Obtiene el contenido completo de una página específica del PDF.",
      inputSchema: z.object({
        pageNumber: z
          .number()
          .min(1)
          .describe("Número de página (empezando en 1)"),
      }),
      execute: async ({ pageNumber }) => {
        if (!context.pages || context.pages.length === 0) {
          return { success: false, error: "PDF no cargado" };
        }

        const page = context.pages.find((p) => p.pageNumber === pageNumber);

        if (!page) {
          return {
            success: false,
            error: `Página ${pageNumber} no existe. El documento tiene ${context.pages.length} páginas.`,
          };
        }

        log.info(`[PDFAgent] Getting content of page ${pageNumber}`);

        return {
          success: true,
          pageNumber,
          wordCount: page.wordCount,
          content: page.content,
          message: `Contenido de página ${pageNumber} (${page.wordCount} palabras).`,
        };
      },
    }),

    get_page_range: tool({
      description: "Obtiene el contenido de un rango de páginas.",
      inputSchema: z.object({
        startPage: z.number().min(1).describe("Página inicial"),
        endPage: z.number().min(1).describe("Página final"),
      }),
      execute: async ({ startPage, endPage }) => {
        if (!context.pages || context.pages.length === 0) {
          return { success: false, error: "PDF no cargado" };
        }

        const maxPage = context.pages.length;
        const validStart = Math.max(1, Math.min(startPage, maxPage));
        const validEnd = Math.max(validStart, Math.min(endPage, maxPage));

        const pages = context.pages.filter(
          (p) => p.pageNumber >= validStart && p.pageNumber <= validEnd,
        );

        log.info(`[PDFAgent] Getting pages ${validStart}-${validEnd}`);

        return {
          success: true,
          range: { start: validStart, end: validEnd },
          pageCount: pages.length,
          totalWords: pages.reduce((sum, p) => sum + p.wordCount, 0),
          pages: pages.map((p) => ({
            pageNumber: p.pageNumber,
            wordCount: p.wordCount,
            content: p.content,
          })),
          message: `Contenido de páginas ${validStart}-${validEnd}.`,
        };
      },
    }),

    summarize_document: tool({
      description:
        "Genera un resumen del documento completo o de páginas específicas.",
      inputSchema: z.object({
        pages: z
          .array(z.number())
          .optional()
          .describe(
            "Páginas específicas a resumir (vacío = todo el documento)",
          ),
        style: z
          .enum(["brief", "detailed", "bullets"])
          .default("detailed")
          .describe("Estilo del resumen"),
      }),
      execute: async ({ pages: targetPages, style }) => {
        if (!context.pages || context.pages.length === 0) {
          return { success: false, error: "PDF no cargado" };
        }

        const pagesToSummarize =
          targetPages && targetPages.length > 0
            ? context.pages.filter((p) => targetPages.includes(p.pageNumber))
            : context.pages;

        const totalContent = pagesToSummarize
          .map((p) => p.content)
          .join("\n\n");
        const wordCount = totalContent.split(/\s+/).length;

        log.info(
          `[PDFAgent] Summarizing ${pagesToSummarize.length} pages (${style})`,
        );

        // Return content for the LLM to summarize
        return {
          success: true,
          pagesIncluded: pagesToSummarize.map((p) => p.pageNumber),
          wordCount,
          style,
          contentToSummarize: totalContent.slice(0, 15000), // Limit to avoid context overflow
          instruction: `Please create a ${style} summary of this document content. Include page citations.`,
          message: `Contenido de ${pagesToSummarize.length} páginas listo para resumir.`,
        };
      },
    }),

    extract_section: tool({
      description:
        "Extrae una sección específica del documento basada en un encabezado o tema.",
      inputSchema: z.object({
        sectionTitle: z
          .string()
          .describe("Título o tema de la sección a extraer"),
        includeSubsections: z
          .boolean()
          .default(true)
          .describe("Incluir subsecciones"),
      }),
      execute: async ({ sectionTitle, includeSubsections }) => {
        if (!context.pages || context.pages.length === 0) {
          return { success: false, error: "PDF no cargado" };
        }

        // Search for section
        const results = searchWithCitations(sectionTitle, context.pages, 3);

        if (results.length === 0) {
          return {
            success: false,
            error: `No se encontró la sección "${sectionTitle}" en el documento.`,
          };
        }

        // Get the page with the best match and potentially following pages
        const startPage = results[0].pageNumber;
        const pagesInSection = includeSubsections
          ? context.pages.filter(
              (p) => p.pageNumber >= startPage && p.pageNumber <= startPage + 2,
            )
          : context.pages.filter((p) => p.pageNumber === startPage);

        log.info(
          `[PDFAgent] Extracting section "${sectionTitle}" starting at page ${startPage}`,
        );

        return {
          success: true,
          sectionTitle,
          startPage,
          pages: pagesInSection.map((p) => ({
            pageNumber: p.pageNumber,
            content: p.content,
          })),
          citation: `[páginas ${pagesInSection.map((p) => p.pageNumber).join(", ")}]`,
          message: `Sección "${sectionTitle}" extraída (páginas ${startPage}-${startPage + pagesInSection.length - 1}).`,
        };
      },
    }),

    navigate_to_page: tool({
      description: "Navega a una página específica en el visor de PDF.",
      inputSchema: z.object({
        pageNumber: z.number().min(1).describe("Número de página a mostrar"),
      }),
      execute: async ({ pageNumber }) => {
        if (!context.pages || context.pages.length === 0) {
          return { success: false, error: "PDF no cargado" };
        }

        if (pageNumber > context.pages.length) {
          return {
            success: false,
            error: `Página ${pageNumber} no existe. El documento tiene ${context.pages.length} páginas.`,
          };
        }

        log.info(`[PDFAgent] Navigating to page ${pageNumber}`);

        sendToRenderer("pdf:navigate", {
          pageNumber,
          artifactId: context.artifactId,
        });

        return {
          success: true,
          pageNumber,
          message: `Navegando a página ${pageNumber}.`,
        };
      },
    }),

    highlight_text: tool({
      description: "Resalta texto específico en el PDF.",
      inputSchema: z.object({
        text: z.string().describe("Texto a resaltar"),
        color: z
          .enum(["yellow", "green", "blue", "pink", "orange"])
          .default("yellow")
          .describe("Color del resaltado"),
      }),
      execute: async ({ text, color }) => {
        log.info(`[PDFAgent] Highlighting text: "${text.slice(0, 50)}..."`);

        // First search for the text to find its location
        if (context.pages) {
          const results = searchWithCitations(text, context.pages, 1);

          if (results.length > 0) {
            sendToRenderer("pdf:highlight", {
              text,
              pageNumber: results[0].pageNumber,
              color,
              artifactId: context.artifactId,
            });

            return {
              success: true,
              text: text.slice(0, 100),
              pageNumber: results[0].pageNumber,
              color,
              message: `Texto resaltado en página ${results[0].pageNumber}.`,
            };
          }
        }

        return {
          success: false,
          error: `No se encontró el texto "${text.slice(0, 50)}..." en el documento.`,
        };
      },
    }),

    get_document_info: tool({
      description: "Obtiene información general sobre el PDF cargado.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!context.pages || context.pages.length === 0) {
          return { success: false, error: "PDF no cargado" };
        }

        const totalWords = context.pages.reduce(
          (sum, p) => sum + p.wordCount,
          0,
        );
        const avgWordsPerPage = Math.round(totalWords / context.pages.length);

        return {
          success: true,
          filename: context.pdfPath?.split("/").pop() || "Unknown",
          pageCount: context.pages.length,
          totalWords,
          avgWordsPerPage,
          currentPage: context.currentPage || 1,
          hasSelectedText: !!context.selectedText,
          message: `Documento: ${context.pages.length} páginas, ${totalWords} palabras.`,
        };
      },
    }),

    answer_with_citations: tool({
      description:
        "Busca información y genera una respuesta con citaciones. Usa esto para responder preguntas sobre el PDF.",
      inputSchema: z.object({
        question: z.string().describe("Pregunta a responder"),
        searchTerms: z
          .array(z.string())
          .optional()
          .describe("Términos adicionales de búsqueda"),
      }),
      execute: async ({ question, searchTerms }) => {
        if (!context.pages || context.pages.length === 0) {
          return { success: false, error: "PDF no cargado" };
        }

        // Search for relevant content
        const allSearchTerms = [question, ...(searchTerms || [])];
        const allResults: Array<{
          text: string;
          pageNumber: number;
          term: string;
        }> = [];

        for (const term of allSearchTerms) {
          const results = searchWithCitations(term, context.pages, 3);
          for (const r of results) {
            allResults.push({ ...r, term });
          }
        }

        // Deduplicate by page
        const uniquePages = [...new Set(allResults.map((r) => r.pageNumber))];
        const relevantContent = uniquePages.slice(0, 5).map((pageNum) => {
          const page = context.pages!.find((p) => p.pageNumber === pageNum);
          const excerpts = allResults.filter((r) => r.pageNumber === pageNum);
          return {
            pageNumber: pageNum,
            excerpts: excerpts.map((e) => e.text),
            fullContent: page?.content.slice(0, 2000),
          };
        });

        log.info(
          `[PDFAgent] Found ${relevantContent.length} relevant pages for question`,
        );

        return {
          success: true,
          question,
          relevantPages: relevantContent,
          instruction: `
                    Based on the following content from the PDF, answer the question: "${question}"

                    IMPORTANT: Include [página N] citations after EVERY piece of information from the document.

                    Relevant content:
                    ${relevantContent
                      .map(
                        (p) => `
                    --- Page ${p.pageNumber} ---
                    ${p.excerpts.join("\n...\n")}
                    `,
                      )
                      .join("\n")}

                    If the information is not in the provided content, say "No encontré esta información en el documento."
                    `,
          message: `Encontré información relevante en ${relevantContent.length} páginas.`,
        };
      },
    }),

    // =========================================================================
    // FORM TOOLS
    // =========================================================================

    get_form_fields: tool({
      description:
        "Lista todos los campos de formulario disponibles en el PDF. Usa esto antes de llenar un formulario.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const fields = await pdfService.getFormFields(context.pdfBytes);

          if (fields.length === 0) {
            return {
              success: true,
              hasForm: false,
              message: "Este PDF no tiene campos de formulario.",
            };
          }

          log.info(`[PDFAgent] Found ${fields.length} form fields`);

          return {
            success: true,
            hasForm: true,
            fieldCount: fields.length,
            fields: fields.map((f) => ({
              name: f.name,
              type: f.type,
              currentValue: f.value,
            })),
            message: `El PDF tiene ${fields.length} campo(s) de formulario.`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Error al leer formulario: ${error}`,
          };
        }
      },
    }),

    fill_form: tool({
      description:
        "Rellena campos de formulario en el PDF. Primero usa get_form_fields para ver los campos disponibles.",
      inputSchema: z.object({
        fields: z
          .record(z.union([z.string(), z.boolean()]))
          .describe(
            "Objeto con nombre de campo y valor (string para texto, boolean para checkbox)",
          ),
      }),
      execute: async ({ fields }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const filledPdf = await pdfService.fillFormFields(
            context.pdfBytes,
            fields,
          );

          // Update context with modified PDF
          context.pdfBytes = filledPdf;

          log.info(
            `[PDFAgent] Filled ${Object.keys(fields).length} form fields`,
          );

          // Notify renderer to refresh
          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(filledPdf),
          });

          return {
            success: true,
            filledFields: Object.keys(fields),
            message: `Formulario llenado con ${Object.keys(fields).length} campo(s).`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Error al llenar formulario: ${error}`,
          };
        }
      },
    }),

    flatten_form: tool({
      description:
        "Aplana el formulario PDF, convirtiendo campos editables en contenido estático. Esto hace el formulario no editable.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const flattenedPdf = await pdfService.flattenForm(context.pdfBytes);
          context.pdfBytes = flattenedPdf;

          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(flattenedPdf),
          });

          log.info("[PDFAgent] Form flattened");

          return {
            success: true,
            message: "Formulario aplanado. Los campos ya no son editables.",
          };
        } catch (error) {
          return { success: false, error: `Error al aplanar: ${error}` };
        }
      },
    }),

    // =========================================================================
    // PAGE MANIPULATION TOOLS
    // =========================================================================

    extract_pages: tool({
      description: "Extrae páginas específicas como un nuevo PDF.",
      inputSchema: z.object({
        pageNumbers: z
          .array(z.number())
          .describe("Números de página a extraer (1-indexed)"),
      }),
      execute: async ({ pageNumbers }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          // Convert to 0-indexed
          const indices = pageNumbers.map((p) => p - 1);
          const extractedPdf = await pdfService.extractPages(
            context.pdfBytes,
            indices,
          );

          log.info(`[PDFAgent] Extracted ${pageNumbers.length} pages`);

          // Send to renderer to save/display
          sendToRenderer("pdf:created", {
            pdfBytes: Array.from(extractedPdf),
            filename: `extracted_pages_${pageNumbers.join("-")}.pdf`,
          });

          return {
            success: true,
            extractedPages: pageNumbers,
            message: `Páginas ${pageNumbers.join(", ")} extraídas como nuevo PDF.`,
          };
        } catch (error) {
          return { success: false, error: `Error al extraer: ${error}` };
        }
      },
    }),

    remove_pages: tool({
      description: "Elimina páginas específicas del PDF.",
      inputSchema: z.object({
        pageNumbers: z
          .array(z.number())
          .describe("Números de página a eliminar (1-indexed)"),
      }),
      execute: async ({ pageNumbers }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const indices = pageNumbers.map((p) => p - 1);
          const modifiedPdf = await pdfService.removePages(
            context.pdfBytes,
            indices,
          );

          context.pdfBytes = modifiedPdf;

          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(modifiedPdf),
          });

          log.info(`[PDFAgent] Removed ${pageNumbers.length} pages`);

          return {
            success: true,
            removedPages: pageNumbers,
            message: `Páginas ${pageNumbers.join(", ")} eliminadas.`,
          };
        } catch (error) {
          return { success: false, error: `Error al eliminar: ${error}` };
        }
      },
    }),

    rotate_pages: tool({
      description: "Rota páginas específicas del PDF.",
      inputSchema: z.object({
        pageNumbers: z
          .array(z.number())
          .describe("Números de página a rotar (1-indexed)"),
        degrees: z
          .enum(["90", "180", "270"])
          .describe("Grados de rotación en sentido horario"),
      }),
      execute: async ({ pageNumbers, degrees }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const indices = pageNumbers.map((p) => p - 1);
          const rotatedPdf = await pdfService.rotatePages(
            context.pdfBytes,
            indices,
            parseInt(degrees) as 90 | 180 | 270,
          );

          context.pdfBytes = rotatedPdf;

          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(rotatedPdf),
          });

          log.info(
            `[PDFAgent] Rotated ${pageNumbers.length} pages by ${degrees}°`,
          );

          return {
            success: true,
            rotatedPages: pageNumbers,
            degrees: parseInt(degrees),
            message: `Páginas ${pageNumbers.join(", ")} rotadas ${degrees}°.`,
          };
        } catch (error) {
          return { success: false, error: `Error al rotar: ${error}` };
        }
      },
    }),

    reorder_pages: tool({
      description: "Reordena las páginas del PDF según el orden especificado.",
      inputSchema: z.object({
        newOrder: z
          .array(z.number())
          .describe(
            "Nuevo orden de páginas (1-indexed). Ej: [3, 1, 2] pone la página 3 primero.",
          ),
      }),
      execute: async ({ newOrder }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const indices = newOrder.map((p) => p - 1);
          const reorderedPdf = await pdfService.reorderPages(
            context.pdfBytes,
            indices,
          );

          context.pdfBytes = reorderedPdf;

          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(reorderedPdf),
          });

          log.info(`[PDFAgent] Reordered pages: ${newOrder.join(", ")}`);

          return {
            success: true,
            newOrder,
            message: `Páginas reordenadas: ${newOrder.join(" → ")}.`,
          };
        } catch (error) {
          return { success: false, error: `Error al reordenar: ${error}` };
        }
      },
    }),

    split_pdf: tool({
      description:
        "Divide el PDF en múltiples archivos. Puede dividir en páginas individuales o por rangos.",
      inputSchema: z.object({
        mode: z.enum(["individual", "ranges"]).describe("Modo de división"),
        ranges: z
          .array(
            z.object({
              start: z.number().describe("Página inicial (1-indexed)"),
              end: z.number().describe("Página final (1-indexed)"),
            }),
          )
          .optional()
          .describe("Rangos de páginas (solo para modo 'ranges')"),
      }),
      execute: async ({ mode, ranges }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          let splitPdfs: Uint8Array[];

          if (mode === "individual") {
            splitPdfs = await pdfService.splitPdf(context.pdfBytes);
          } else {
            if (!ranges || ranges.length === 0) {
              return { success: false, error: "Debes especificar rangos" };
            }
            splitPdfs = await pdfService.splitPdf(context.pdfBytes, ranges);
          }

          log.info(`[PDFAgent] Split into ${splitPdfs.length} PDFs`);

          // Notify renderer with all split PDFs
          for (let i = 0; i < splitPdfs.length; i++) {
            const suffix =
              mode === "individual"
                ? `page_${i + 1}`
                : `range_${ranges![i].start}-${ranges![i].end}`;
            sendToRenderer("pdf:created", {
              pdfBytes: Array.from(splitPdfs[i]),
              filename: `split_${suffix}.pdf`,
            });
          }

          return {
            success: true,
            partsCreated: splitPdfs.length,
            message: `PDF dividido en ${splitPdfs.length} archivo(s).`,
          };
        } catch (error) {
          return { success: false, error: `Error al dividir: ${error}` };
        }
      },
    }),

    // =========================================================================
    // SECURITY TOOLS
    // =========================================================================

    encrypt_pdf: tool({
      description:
        "Protege el PDF con contraseña. Puede establecer permisos de usuario.",
      inputSchema: z.object({
        ownerPassword: z
          .string()
          .describe("Contraseña del propietario (para permisos completos)"),
        userPassword: z
          .string()
          .optional()
          .describe("Contraseña de usuario (para abrir el PDF)"),
        permissions: z
          .object({
            print: z.boolean().optional().describe("Permitir imprimir"),
            copy: z.boolean().optional().describe("Permitir copiar texto"),
            modify: z.boolean().optional().describe("Permitir modificar"),
          })
          .optional()
          .describe("Permisos del usuario"),
      }),
      execute: async ({ ownerPassword, userPassword, permissions }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const encryptedPdf = await pdfService.encryptPdf(context.pdfBytes, {
            ownerPassword,
            userPassword,
            permissions,
          });

          context.pdfBytes = encryptedPdf;

          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(encryptedPdf),
          });

          log.info("[PDFAgent] PDF encrypted");

          return {
            success: true,
            hasUserPassword: !!userPassword,
            permissions: permissions || {
              print: true,
              copy: false,
              modify: false,
            },
            message: `PDF protegido con contraseña.${userPassword ? " Se requerirá contraseña para abrir." : ""}`,
          };
        } catch (error) {
          return { success: false, error: `Error al encriptar: ${error}` };
        }
      },
    }),

    // =========================================================================
    // METADATA & WATERMARK TOOLS
    // =========================================================================

    set_metadata: tool({
      description: "Modifica los metadatos del PDF (título, autor, etc.).",
      inputSchema: z.object({
        title: z.string().optional().describe("Título del documento"),
        author: z.string().optional().describe("Autor"),
        subject: z.string().optional().describe("Asunto"),
        keywords: z
          .string()
          .optional()
          .describe("Palabras clave (separadas por coma)"),
      }),
      execute: async ({ title, author, subject, keywords }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const modifiedPdf = await pdfService.setMetadata(context.pdfBytes, {
            title,
            author,
            subject,
            keywords,
          });

          context.pdfBytes = modifiedPdf;

          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(modifiedPdf),
          });

          log.info("[PDFAgent] Metadata updated");

          const updates = [];
          if (title) updates.push(`título: "${title}"`);
          if (author) updates.push(`autor: "${author}"`);
          if (subject) updates.push(`asunto: "${subject}"`);
          if (keywords) updates.push(`keywords: "${keywords}"`);

          return {
            success: true,
            updatedFields: updates,
            message: `Metadatos actualizados: ${updates.join(", ")}.`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Error al actualizar metadatos: ${error}`,
          };
        }
      },
    }),

    add_watermark: tool({
      description: "Agrega una marca de agua de texto a todas las páginas.",
      inputSchema: z.object({
        text: z.string().describe("Texto de la marca de agua"),
        fontSize: z
          .number()
          .optional()
          .default(48)
          .describe("Tamaño de fuente"),
        opacity: z.number().optional().default(0.3).describe("Opacidad (0-1)"),
        rotation: z
          .number()
          .optional()
          .default(45)
          .describe("Rotación en grados"),
      }),
      execute: async ({ text, fontSize, opacity, rotation }) => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const watermarkedPdf = await pdfService.addTextWatermark(
            context.pdfBytes,
            text,
            { fontSize, opacity, rotation },
          );

          context.pdfBytes = watermarkedPdf;

          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(watermarkedPdf),
          });

          log.info(`[PDFAgent] Watermark added: "${text}"`);

          return {
            success: true,
            watermarkText: text,
            message: `Marca de agua "${text}" agregada a todas las páginas.`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Error al agregar marca de agua: ${error}`,
          };
        }
      },
    }),

    compress_pdf: tool({
      description: "Comprime el PDF para reducir su tamaño.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!context.pdfBytes) {
          return { success: false, error: "PDF bytes no disponibles" };
        }

        try {
          const originalSize = context.pdfBytes.length;
          const compressedPdf = await pdfService.compressPdf(context.pdfBytes);
          const newSize = compressedPdf.length;
          const savings = originalSize - newSize;
          const savingsPercent = ((savings / originalSize) * 100).toFixed(1);

          context.pdfBytes = compressedPdf;

          sendToRenderer("pdf:modified", {
            artifactId: context.artifactId,
            pdfBytes: Array.from(compressedPdf),
          });

          log.info(
            `[PDFAgent] Compressed: ${originalSize} → ${newSize} (${savingsPercent}% reduction)`,
          );

          return {
            success: true,
            originalSize,
            newSize,
            savings,
            savingsPercent: parseFloat(savingsPercent),
            message: `PDF comprimido: ${(originalSize / 1024).toFixed(1)}KB → ${(newSize / 1024).toFixed(1)}KB (${savingsPercent}% reducción).`,
          };
        } catch (error) {
          return { success: false, error: `Error al comprimir: ${error}` };
        }
      },
    }),

    // ==================== VIEWER CONTROL TOOLS ====================

    /**
     * Control viewer zoom level
     */
    set_zoom: tool({
      description:
        "Ajusta el nivel de zoom del visor PDF. Usa 'fit-width' para ajustar al ancho, 'fit-page' para ajustar a la página, o un número para un porcentaje específico (ej: 100, 150, 200).",
      inputSchema: z.object({
        zoom: z.union([
          z.number().min(25).max(400),
          z.literal("fit-width"),
          z.literal("fit-page"),
        ]),
      }),
      execute: async ({ zoom }) => {
        try {
          sendToRenderer("pdf:zoom", {
            artifactId: context.artifactId,
            zoom,
          });

          const zoomDesc =
            typeof zoom === "number"
              ? `${zoom}%`
              : zoom === "fit-width"
                ? "ajustado al ancho"
                : "ajustado a página";

          log.info(`[PDFAgent] Set zoom to: ${zoomDesc}`);

          return {
            success: true,
            zoom,
            message: `Zoom ${zoomDesc}`,
          };
        } catch (error) {
          return { success: false, error: `Error al cambiar zoom: ${error}` };
        }
      },
    }),

    /**
     * Rotate pages in the viewer
     */
    rotate_view: tool({
      description:
        "Rota las páginas en el visor. Puede rotar una página específica o todas las páginas.",
      inputSchema: z.object({
        degrees: z.enum(["90", "180", "270"]).describe("Grados de rotación"),
        pageNumber: z
          .number()
          .optional()
          .describe(
            "Página específica a rotar (1-indexed). Si se omite, rota todas.",
          ),
      }),
      execute: async ({ degrees, pageNumber }) => {
        try {
          const degreesNum = parseInt(degrees) as 90 | 180 | 270;

          sendToRenderer("pdf:rotate", {
            artifactId: context.artifactId,
            pageNumber,
            degrees: degreesNum,
          });

          const pageDesc = pageNumber
            ? `página ${pageNumber}`
            : "todas las páginas";
          log.info(`[PDFAgent] Rotated ${pageDesc} by ${degrees}°`);

          return {
            success: true,
            degrees: degreesNum,
            pageNumber,
            message: `Rotado ${pageDesc} ${degrees}°`,
          };
        } catch (error) {
          return { success: false, error: `Error al rotar: ${error}` };
        }
      },
    }),

    /**
     * Add annotation to PDF viewer
     */
    add_annotation: tool({
      description:
        "Añade una anotación visual al PDF. Tipos: 'highlight' (resaltado amarillo), 'underline' (subrayado), 'strikethrough' (tachado), 'text' (nota de texto), 'rectangle' (rectángulo).",
      inputSchema: z.object({
        type: z.enum([
          "highlight",
          "underline",
          "strikethrough",
          "text",
          "rectangle",
        ]),
        pageNumber: z.number().min(1).describe("Número de página (1-indexed)"),
        boundingBox: z.object({
          x: z.number().describe("Posición X (0-1 normalizado)"),
          y: z.number().describe("Posición Y (0-1 normalizado)"),
          width: z.number().describe("Ancho (0-1 normalizado)"),
          height: z.number().describe("Alto (0-1 normalizado)"),
        }),
        text: z
          .string()
          .optional()
          .describe("Texto de la nota (solo para tipo 'text')"),
        color: z
          .string()
          .optional()
          .describe("Color en formato hex (ej: '#FFFF00')"),
      }),
      execute: async ({ type, pageNumber, boundingBox, text, color }) => {
        try {
          sendToRenderer("pdf:add-annotation", {
            artifactId: context.artifactId,
            type,
            pageNumber,
            boundingBox,
            text,
            color,
          });

          log.info(`[PDFAgent] Added ${type} annotation on page ${pageNumber}`);

          return {
            success: true,
            type,
            pageNumber,
            message: `Anotación '${type}' añadida en página ${pageNumber}`,
          };
        } catch (error) {
          return {
            success: false,
            error: `Error al añadir anotación: ${error}`,
          };
        }
      },
    }),

    /**
     * Get PDF info (page count, size, metadata)
     */
    get_pdf_info: tool({
      description:
        "Obtiene información del PDF: número de páginas, tamaño, metadatos, si tiene campos de formulario, etc.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const pageCount = context.pages.length;
          const totalWords = context.pages.reduce(
            (sum, p) => sum + p.wordCount,
            0,
          );
          const totalChars = context.pages.reduce(
            (sum, p) => sum + p.content.length,
            0,
          );

          let hasFormFields = false;
          let isEncrypted = false;
          let fileSize = 0;

          if (context.pdfBytes) {
            hasFormFields = await pdfService.hasFormFields(context.pdfBytes);
            isEncrypted = await pdfService.isEncrypted(context.pdfBytes);
            fileSize = context.pdfBytes.length;
          }

          return {
            success: true,
            pageCount,
            totalWords,
            totalChars,
            hasFormFields,
            isEncrypted,
            fileSizeKB: Math.round(fileSize / 1024),
            pdfPath: context.pdfPath,
          };
        } catch (error) {
          return { success: false, error: `Error al obtener info: ${error}` };
        }
      },
    }),

    /**
     * Copy text from specific page range
     */
    copy_text: tool({
      description:
        "Copia el texto de una o más páginas del PDF. Útil para extraer contenido específico.",
      inputSchema: z.object({
        startPage: z.number().min(1).describe("Página inicial (1-indexed)"),
        endPage: z
          .number()
          .optional()
          .describe(
            "Página final (inclusive). Si se omite, solo copia la página inicial.",
          ),
      }),
      execute: async ({ startPage, endPage }) => {
        try {
          const start = startPage - 1;
          const end = endPage ? endPage - 1 : start;

          if (start < 0 || end >= context.pages.length || start > end) {
            return {
              success: false,
              error: `Rango inválido. El PDF tiene ${context.pages.length} páginas.`,
            };
          }

          const text = context.pages
            .slice(start, end + 1)
            .map((p) => p.content)
            .join("\n\n--- Página siguiente ---\n\n");

          const wordCount = context.pages
            .slice(start, end + 1)
            .reduce((sum, p) => sum + p.wordCount, 0);

          return {
            success: true,
            text,
            pageRange: endPage ? `${startPage}-${endPage}` : `${startPage}`,
            wordCount,
            message: `Texto copiado de ${endPage ? `páginas ${startPage}-${endPage}` : `página ${startPage}`} (${wordCount} palabras)`,
          };
        } catch (error) {
          return { success: false, error: `Error al copiar texto: ${error}` };
        }
      },
    }),

    // =========================================================================
    // CITATION TOOLS (Claude for Excel pattern)
    // =========================================================================

    /**
     * Create a clickable citation to a specific page/text
     */
    cite_page: tool({
      description:
        "Crea una citación clickeable a una página o texto específico del PDF. Similar a las citaciones de celda en Excel.",
      inputSchema: z.object({
        pageNumber: z.number().min(1).describe("Número de página a citar"),
        text: z.string().describe("Texto a citar"),
        label: z.string().optional().describe("Etiqueta para la citación"),
      }),
      execute: async ({ pageNumber, text, label }) => {
        log.info(`[PDFAgent] Creating page citation: page ${pageNumber}`);

        const citation: PageCitation = {
          type: "page",
          pageNumber,
          text,
          filename: context.pdfPath?.split("/").pop() || "PDF",
        };

        // Send citation to renderer for UI display
        sendToRenderer("artifact:citation", {
          artifactId: context.artifactId,
          citation,
        });

        return {
          success: true,
          citation,
          displayText: label || `[página ${pageNumber}]`,
          message: `Citación creada para página ${pageNumber}`,
        };
      },
    }),

    /**
     * Navigate to artifact tab
     */
    navigate_to_pdf: tool({
      description:
        "Navega al tab de PDF para mostrar el documento al usuario.",
      inputSchema: z.object({
        pageNumber: z.number().optional().describe("Página a mostrar"),
      }),
      execute: async ({ pageNumber }) => {
        log.info(`[PDFAgent] Navigating to PDF tab`);

        sendToRenderer("navigate:tab", {
          tab: "pdf",
          artifactId: context.artifactId,
          pageNumber,
        });

        return {
          success: true,
          message: pageNumber
            ? `Navegando a página ${pageNumber} del PDF.`
            : "Navegando al tab de PDF.",
        };
      },
    }),
  };
}

/**
 * Get PDF agent metadata from centralized config
 */
const pdfMeta = AGENT_METADATA.pdf;

/**
 * Create the PDF Agent
 * Uses centralized configuration from @s-agi/core
 */
export function createPDFAgent(
  model: LanguageModel,
  context: PDFContext,
): Agent<PDFContext> {
  // Emit progressive stage: loading
  sendToRenderer("artifact:stage-update", {
    artifactId: context.artifactId,
    stage: "loading" as ArtifactStage,
    message: "Cargando PDF...",
  });

  // Emit progressive stage: data_ready
  sendToRenderer("artifact:stage-update", {
    artifactId: context.artifactId,
    stage: "data_ready" as ArtifactStage,
    message: `PDF cargado: ${context.pages.length} páginas`,
  });

  return new Agent({
    name: pdfMeta.name,
    model,
    instructions: getPDFInstructions(context),
    tools: createPDFTools(context),
    handoffDescription: pdfMeta.description,
    maxTurns: pdfMeta.maxTurns,
    temperature: pdfMeta.temperature,
  });
}

// Factory for creating PDF agents with specific context
let pdfAgentInstance: Agent<PDFContext> | null = null;
let currentPDFPath: string | null = null;

export const PDFAgent = {
  /**
   * Get or create the PDF agent with updated context
   */
  getInstance(model: LanguageModel, context: PDFContext): Agent<PDFContext> {
    // Always create new instance when PDF changes
    if (!pdfAgentInstance || currentPDFPath !== context.pdfPath) {
      pdfAgentInstance = createPDFAgent(model, context);
      currentPDFPath = context.pdfPath;
      log.info(`[PDFAgent] Created new instance for: ${context.pdfPath}`);
    }
    return pdfAgentInstance;
  },

  /**
   * Reset the agent instance
   */
  reset(): void {
    pdfAgentInstance = null;
    currentPDFPath = null;
  },

  /**
   * Load PDF content into context
   */
  async loadPDF(pdfPath: string, pages: PageContent[]): Promise<PDFContext> {
    log.info(`[PDFAgent] Loading PDF: ${pdfPath} (${pages.length} pages)`);

    return {
      userId: "", // Will be set by caller
      chatId: "", // Will be set by caller
      pdfPath,
      pages,
      currentPage: 1,
    };
  },
};
