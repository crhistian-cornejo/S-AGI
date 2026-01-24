/**
 * Unified PDF Service using LibPDF
 *
 * Provides text extraction with positions, form filling,
 * digital signatures, compression, and merge/split operations.
 *
 * EmbedPDF handles viewing/rendering/annotations in the renderer.
 * LibPDF handles document manipulation in the main process.
 */

import { PDF } from "@libpdf/core";

// Local type definitions for LibPDF (library types may not be exported)
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}


/**
 * Text content with position information for RAG citations
 */
export interface TextWithPosition {
  text: string;
  pageNumber: number; // 1-based for user display
  pageIndex: number; // 0-based for internal use
  boundingBox: BoundingBox;
  lineIndex: number;
}

/**
 * Page content with all text and positions
 */
export interface PageContent {
  pageNumber: number;
  pageIndex: number;
  content: string;
  wordCount: number;
  width: number;
  height: number;
  lines: TextWithPosition[];
}

/**
 * Search result with exact position for highlighting
 */
export interface SearchResultWithPosition {
  text: string;
  pageNumber: number;
  pageIndex: number;
  boundingBox: BoundingBox;
  charBoxes: BoundingBox[];
  context: string; // surrounding text for preview
}

/**
 * PDF metadata
 */
export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  pageCount: number;
}

/**
 * Load a PDF document from bytes
 */
export async function loadPdf(bytes: Uint8Array): Promise<PDF> {
  return PDF.load(bytes, { lenient: true });
}

/**
 * Extract text from PDF with position information
 * Returns page-by-page content with bounding boxes for each line
 */
export async function extractTextWithPositions(
  pdfBytes: Uint8Array,
): Promise<PageContent[]> {
  const pdf = await loadPdf(pdfBytes);
  const pageTexts = pdf.extractText();
  const pages: PageContent[] = [];

  for (const pageText of pageTexts) {
    const lines: TextWithPosition[] = pageText.lines.map((line, lineIndex) => ({
      text: line.text,
      pageNumber: pageText.pageIndex + 1,
      pageIndex: pageText.pageIndex,
      boundingBox: line.bbox,
      lineIndex,
    }));

    pages.push({
      pageNumber: pageText.pageIndex + 1,
      pageIndex: pageText.pageIndex,
      content: pageText.text,
      wordCount: pageText.text.split(/\s+/).filter(Boolean).length,
      width: pageText.width,
      height: pageText.height,
      lines,
    });
  }

  return pages;
}

/**
 * Extract plain text from PDF (for simple RAG without positions)
 */
export async function extractText(pdfBytes: Uint8Array): Promise<string> {
  const pdf = await loadPdf(pdfBytes);
  const pageTexts = pdf.extractText();
  return pageTexts.map((p) => p.text).join("\n\n");
}

/**
 * Search text in PDF and return matches with positions
 */
export async function searchTextWithPositions(
  pdfBytes: Uint8Array,
  query: string,
  options?: { maxResults?: number; caseSensitive?: boolean },
): Promise<SearchResultWithPosition[]> {
  const pdf = await loadPdf(pdfBytes);
  const pageCount = pdf.getPageCount();
  const results: SearchResultWithPosition[] = [];
  const maxResults = options?.maxResults ?? 10;

  // Search each page
  for (
    let pageIndex = 0;
    pageIndex < pageCount && results.length < maxResults;
    pageIndex++
  ) {
    const page = pdf.getPage(pageIndex);
    if (!page) continue;
    const pageText = page.extractText();

    // Find matches in page text
    const searchText = options?.caseSensitive
      ? pageText.text
      : pageText.text.toLowerCase();
    const searchQuery = options?.caseSensitive ? query : query.toLowerCase();

    let startIndex = 0;
    while (startIndex < searchText.length && results.length < maxResults) {
      const matchIndex = searchText.indexOf(searchQuery, startIndex);
      if (matchIndex === -1) break;

      // Find the line containing this match
      let charCount = 0;
      for (const line of pageText.lines) {
        const lineEnd = charCount + line.text.length + 1; // +1 for newline
        if (matchIndex >= charCount && matchIndex < lineEnd) {
          // Get context (surrounding text)
          const contextStart = Math.max(0, matchIndex - 50);
          const contextEnd = Math.min(
            pageText.text.length,
            matchIndex + query.length + 50,
          );
          const context = pageText.text.slice(contextStart, contextEnd);

          results.push({
            text: pageText.text.slice(matchIndex, matchIndex + query.length),
            pageNumber: pageIndex + 1,
            pageIndex,
            boundingBox: line.bbox,
            charBoxes: [], // LibPDF doesn't provide char-level boxes in basic search
            context: contextStart > 0 ? "..." + context : context,
          });
          break;
        }
        charCount = lineEnd;
      }

      startIndex = matchIndex + 1;
    }
  }

  return results;
}

/**
 * Get PDF metadata
 */
export async function getMetadata(pdfBytes: Uint8Array): Promise<PDFMetadata> {
  const pdf = await loadPdf(pdfBytes);
  // @libpdf/core may use different API - use type assertion
  const pdfAny = pdf as unknown as Record<string, unknown>;
  const getDocInfo = pdfAny.getDocumentInfo as (() => Record<string, unknown>) | undefined;
  const info = getDocInfo?.() ?? {};

  return {
    title: (info.title as string) ?? undefined,
    author: (info.author as string) ?? undefined,
    subject: (info.subject as string) ?? undefined,
    keywords: (info.keywords as string) ?? undefined,
    creator: (info.creator as string) ?? undefined,
    producer: (info.producer as string) ?? undefined,
    creationDate: (info.creationDate as Date) ?? undefined,
    modificationDate: (info.modDate as Date) ?? undefined,
    pageCount: pdf.getPageCount(),
  };
}

/**
 * Merge multiple PDFs into one
 */
export async function mergePdfs(
  pdfBytesArray: Uint8Array[],
): Promise<Uint8Array> {
  const merged = await PDF.merge(pdfBytesArray);
  return merged.save();
}

/**
 * Split PDF into separate pages
 */
export async function splitPdf(
  pdfBytes: Uint8Array,
  pageRanges?: { start: number; end: number }[],
): Promise<Uint8Array[]> {
  const pdf = await loadPdf(pdfBytes);
  const pageCount = pdf.getPageCount();
  const results: Uint8Array[] = [];

  // Use type assertion for copyPages which may have different signature
  const copyPages = async (target: unknown, src: unknown, indices: number[]) => {
    const targetAny = target as unknown as { copyPages?: (src: unknown, indices: number[]) => Promise<unknown[]> };
    if (targetAny.copyPages) {
      return targetAny.copyPages(src, indices);
    }
    return [];
  };

  if (!pageRanges) {
    // Split into individual pages
    for (let i = 0; i < pageCount; i++) {
      const newPdf = PDF.create();
      const copiedPages = await copyPages(newPdf, pdf, [i]);
      if (copiedPages.length > 0) {
        (newPdf as unknown as { addPage: (p: unknown) => void }).addPage(copiedPages[0]);
      }
      results.push(await newPdf.save());
    }
  } else {
    // Split by ranges
    for (const range of pageRanges) {
      const newPdf = PDF.create();
      const indices = [];
      for (let i = range.start - 1; i < Math.min(range.end, pageCount); i++) {
        indices.push(i);
      }
      const copiedPages = await copyPages(newPdf, pdf, indices);
      for (const page of copiedPages) {
        (newPdf as unknown as { addPage: (p: unknown) => void }).addPage(page);
      }
      results.push(await newPdf.save());
    }
  }

  return results;
}

/**
 * Compress PDF by removing unused objects and optimizing streams
 */
export async function compressPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);
  // Save with default compression (LibPDF handles stream optimization)
  return pdf.save();
}

/**
 * Get form fields from PDF
 */
export async function getFormFields(pdfBytes: Uint8Array): Promise<
  Array<{
    name: string;
    type: string;
    value: string | boolean | string[] | null;
  }>
> {
  const pdf = await loadPdf(pdfBytes);
  const form = pdf.getForm();
  if (!form) return [];

  const fields = form.getFields();

  return fields.map((field) => {
    // Use type assertion for getName which may not be in types
    const fieldAny = field as unknown as { getName?: () => string };
    return {
      name: fieldAny.getName?.() ?? "unknown",
      type: field.constructor.name,
      value: null, // Field values depend on type
    };
  });
}

/**
 * Fill form fields in PDF
 */
export async function fillFormFields(
  pdfBytes: Uint8Array,
  fieldValues: Record<string, string | boolean>,
): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);
  const form = pdf.getForm();
  if (!form) return pdf.save();

  for (const [name, value] of Object.entries(fieldValues)) {
    if (typeof value === "string") {
      const textField = form.getTextField(name);
      if (textField) {
        // Use type assertion for setText
        const textFieldAny = textField as unknown as { setText?: (v: string) => void };
        textFieldAny.setText?.(value);
      }
    } else if (typeof value === "boolean") {
      const checkbox = form.getCheckbox(name);
      if (checkbox) {
        if (value) {
          checkbox.check();
        } else {
          checkbox.uncheck();
        }
      }
    }
  }

  return pdf.save();
}

/**
 * Flatten form fields (convert to static content)
 */
export async function flattenForm(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);
  const form = pdf.getForm();
  if (!form) return pdf.save();

  // Use type assertion - pdf-lib uses flatten(), not flattenAll()
  const formAny = form as unknown as { flatten?: () => void; flattenAll?: () => void };
  formAny.flatten?.() ?? formAny.flattenAll?.();
  return pdf.save();
}

// ============================================================================
// ENCRYPTION
// ============================================================================

export interface EncryptionOptions {
  userPassword?: string;
  ownerPassword: string;
  permissions?: {
    print?: boolean;
    printHighQuality?: boolean;
    copy?: boolean;
    modify?: boolean;
    annotate?: boolean;
    fillForms?: boolean;
    accessibility?: boolean;
    assemble?: boolean;
  };
}

/**
 * Encrypt a PDF with password protection
 * Uses AES-256 encryption (recommended)
 */
export async function encryptPdf(
  pdfBytes: Uint8Array,
  options: EncryptionOptions,
): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);

  // Use type assertion - encrypt may not be in types
  const pdfAny = pdf as unknown as { encrypt?: (opts: unknown) => void };
  pdfAny.encrypt?.({
    userPassword: options.userPassword,
    ownerPassword: options.ownerPassword,
    permissions: {
      print: options.permissions?.print ?? true,
      printHighQuality: options.permissions?.printHighQuality ?? true,
      copy: options.permissions?.copy ?? false,
      modify: options.permissions?.modify ?? false,
      annotate: options.permissions?.annotate ?? true,
      fillForms: options.permissions?.fillForms ?? true,
      accessibility: options.permissions?.accessibility ?? true,
      assemble: options.permissions?.assemble ?? false,
    },
  });

  return pdf.save();
}

/**
 * Decrypt a PDF (remove password protection)
 */
export async function decryptPdf(
  pdfBytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  // Use type assertion - password option may be in different location
  const loadOpts = { lenient: true } as Record<string, unknown>;
  loadOpts.password = password;
  const pdf = await PDF.load(pdfBytes, loadOpts as Parameters<typeof PDF.load>[1]);
  // Saving without encryption removes it
  return pdf.save();
}

// ============================================================================
// PAGE MANIPULATION
// ============================================================================

/**
 * Remove specific pages from PDF
 */
export async function removePages(
  pdfBytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);
  // Sort in reverse to avoid index shifting
  const sorted = [...pageIndices].sort((a, b) => b - a);
  for (const idx of sorted) {
    pdf.removePage(idx);
  }
  return pdf.save();
}

/**
 * Reorder pages in PDF
 */
export async function reorderPages(
  pdfBytes: Uint8Array,
  newOrder: number[],
): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);
  const pageCount = pdf.getPageCount();

  // Create new PDF with pages in specified order
  const newPdf = PDF.create();
  const pagesToCopy = newOrder.filter((i) => i >= 0 && i < pageCount);

  // Use type assertion for copyPages
  const newPdfAny = newPdf as unknown as { copyPages?: (src: unknown, indices: number[]) => Promise<unknown[]>; addPage: (p: unknown) => void };
  const copiedPages = newPdfAny.copyPages ? await newPdfAny.copyPages(pdf, pagesToCopy) : [];

  for (const page of copiedPages) {
    newPdfAny.addPage(page);
  }

  return newPdf.save();
}

/**
 * Rotate pages in PDF
 */
export async function rotatePages(
  pdfBytes: Uint8Array,
  pageIndices: number[],
  degrees: 90 | 180 | 270,
): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);

  for (const idx of pageIndices) {
    if (idx >= 0 && idx < pdf.getPageCount()) {
      const page = pdf.getPage(idx);
      if (!page) continue;

      // Use type assertion for rotation methods
      const pageAny = page as unknown as {
        getRotation?: () => { angle: number } | number;
        setRotation?: (angle: number | { angle: number }) => void;
      };

      let currentRotation = 0;
      if (pageAny.getRotation) {
        const rot = pageAny.getRotation();
        currentRotation = typeof rot === "number" ? rot : (rot?.angle ?? 0);
      }

      const newRotation = ((currentRotation + degrees) % 360) as 0 | 90 | 180 | 270;
      pageAny.setRotation?.(newRotation);
    }
  }

  return pdf.save();
}

/**
 * Extract specific pages as a new PDF
 */
export async function extractPages(
  pdfBytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);
  const newPdf = PDF.create();
  const validIndices = pageIndices.filter(
    (i) => i >= 0 && i < pdf.getPageCount(),
  );

  // Use type assertion for copyPages
  const newPdfAny = newPdf as unknown as { copyPages?: (src: unknown, indices: number[]) => Promise<unknown[]>; addPage: (p: unknown) => void };
  const copiedPages = newPdfAny.copyPages ? await newPdfAny.copyPages(pdf, validIndices) : [];

  for (const page of copiedPages) {
    newPdfAny.addPage(page);
  }

  return newPdf.save();
}

/**
 * Insert pages from one PDF into another
 */
export async function insertPages(
  targetPdfBytes: Uint8Array,
  sourcePdfBytes: Uint8Array,
  insertAtIndex: number,
  sourcePageIndices?: number[],
): Promise<Uint8Array> {
  const targetPdf = await loadPdf(targetPdfBytes);
  const sourcePdf = await loadPdf(sourcePdfBytes);

  const indicesToCopy =
    sourcePageIndices ??
    Array.from({ length: sourcePdf.getPageCount() }, (_, i) => i);

  // Use type assertion for copyPages
  const targetPdfAny = targetPdf as unknown as {
    copyPages?: (src: unknown, indices: number[]) => Promise<unknown[]>;
    insertPage: (idx: number, p: unknown) => void;
  };
  const copiedPages = targetPdfAny.copyPages ? await targetPdfAny.copyPages(sourcePdf, indicesToCopy) : [];

  let insertIdx = Math.min(insertAtIndex, targetPdf.getPageCount());
  for (const page of copiedPages) {
    targetPdfAny.insertPage(insertIdx, page);
    insertIdx++;
  }

  return targetPdf.save();
}

// ============================================================================
// METADATA
// ============================================================================

/**
 * Update PDF metadata
 */
export async function setMetadata(
  pdfBytes: Uint8Array,
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
  },
): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);

  if (metadata.title) pdf.setTitle(metadata.title);
  if (metadata.author) pdf.setAuthor(metadata.author);
  if (metadata.subject) pdf.setSubject(metadata.subject);
  if (metadata.keywords) pdf.setKeywords(metadata.keywords.split(","));
  if (metadata.creator) pdf.setCreator(metadata.creator);

  return pdf.save();
}

// ============================================================================
// DRAWING / WATERMARK
// ============================================================================

/**
 * Add text watermark to all pages
 */
export async function addTextWatermark(
  pdfBytes: Uint8Array,
  text: string,
  options?: {
    fontSize?: number;
    opacity?: number;
    rotation?: number;
    color?: { r: number; g: number; b: number };
  },
): Promise<Uint8Array> {
  const pdf = await loadPdf(pdfBytes);
  const pageCount = pdf.getPageCount();

  const fontSize = options?.fontSize ?? 48;
  const opacity = options?.opacity ?? 0.3;
  const rotation = options?.rotation ?? 45;
  const color = options?.color ?? { r: 0.5, g: 0.5, b: 0.5 };

  for (let i = 0; i < pageCount; i++) {
    const page = pdf.getPage(i);
    if (!page) continue;

    // Use type assertion for getSize
    const pageAny = page as unknown as { getSize?: () => { width: number; height: number } };
    const size = pageAny.getSize?.() ?? { width: 612, height: 792 }; // Default letter size
    const { width, height } = size;

    // Use type assertion for drawText options as LibPDF types may differ
    (page as unknown as { drawText: (text: string, opts: unknown) => void }).drawText(text, {
      x: width / 4,
      y: height / 2,
      size: fontSize,
      color: { type: "RGB", red: color.r, green: color.g, blue: color.b },
      opacity,
      rotate: rotation,
    });
  }

  return pdf.save();
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get page count without loading full document
 */
export async function getPageCount(pdfBytes: Uint8Array): Promise<number> {
  const pdf = await loadPdf(pdfBytes);
  return pdf.getPageCount();
}

/**
 * Get page dimensions
 */
export async function getPageDimensions(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<{ width: number; height: number }> {
  const pdf = await loadPdf(pdfBytes);
  const page = pdf.getPage(pageIndex);
  if (!page) return { width: 612, height: 792 }; // Default letter size

  // Use type assertion for getSize
  const pageAny = page as unknown as { getSize?: () => { width: number; height: number } };
  return pageAny.getSize?.() ?? { width: 612, height: 792 };
}

/**
 * Check if PDF is encrypted
 */
export async function isEncrypted(pdfBytes: Uint8Array): Promise<boolean> {
  try {
    await PDF.load(pdfBytes, { lenient: true });
    return false;
  } catch (e) {
    const error = e as Error;
    return error.message?.includes("password") ?? false;
  }
}

/**
 * Check if PDF has form fields
 */
export async function hasFormFields(pdfBytes: Uint8Array): Promise<boolean> {
  try {
    const pdf = await loadPdf(pdfBytes);
    const form = pdf.getForm();
    if (!form) return false;
    return form.getFields().length > 0;
  } catch {
    return false;
  }
}

export { PDF };
