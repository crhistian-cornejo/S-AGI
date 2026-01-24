/**
 * PDF Agent - Specialized for PDF context and conversation
 *
 * Capabilities:
 * - Load and parse PDF content with page-level tracking
 * - Search within PDF using semantic and keyword search
 * - Answer questions with citations to specific pages
 * - Extract and summarize sections
 * - Navigate to specific pages/sections
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
import log from "electron-log";

/**
 * PDF Agent Instructions - Dynamic based on context
 */
function getPDFInstructions(context: PDFContext): string {
  const pageCount = context.pages?.length || 0;
  const filename = context.pdfPath?.split("/").pop() || "PDF";

  return `Eres un experto en análisis de documentos PDF con capacidad de búsqueda y citación precisa.

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

## Formato de respuesta:
- Información del documento con [página X]
- Múltiples fuentes: [páginas 3, 5, 12]
- Si no encuentras algo: "No encontré esta información en el documento."

## Ejemplo correcto:
"El proyecto tiene un presupuesto de $1,500,000 [página 5] y un plazo de ejecución de 12 meses [página 7]."

## Ejemplo incorrecto (NUNCA hacer esto):
"El proyecto tiene un presupuesto de $1,500,000 y un plazo de 12 meses."

IMPORTANTE: CADA dato del PDF debe tener su citación [página N].`;
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
  };
}

/**
 * Create the PDF Agent
 */
export function createPDFAgent(
  model: LanguageModel,
  context: PDFContext,
): Agent<PDFContext> {
  return new Agent({
    name: "PDFAgent",
    model,
    instructions: getPDFInstructions(context),
    tools: createPDFTools(context),
    handoffDescription:
      "Especialista en análisis de PDFs. Úsalo para buscar, resumir y responder preguntas sobre documentos PDF con citaciones precisas.",
    maxTurns: 10,
    temperature: 0.3, // Lower temperature for accurate citations
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
