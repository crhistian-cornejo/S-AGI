/**
 * PDF Compression Service
 *
 * Provides PDF compression and optimization using LibPDF.
 * Reduces file size by removing unused objects and optimizing streams.
 */

import { loadPdf, compressPdf, getMetadata } from "./pdf-service";
import log from "electron-log";

export interface CompressionResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  originalSize: number;
  compressedSize: number;
  savings: number;
  savingsPercent: number;
  error?: string;
}

export interface CompressionOptions {
  /** Remove metadata (title, author, etc.) for additional size reduction */
  removeMetadata?: boolean;
  /** Target quality for image compression (1-100, default 85) */
  imageQuality?: number;
}

/**
 * Compress a PDF document
 *
 * LibPDF's save() method automatically:
 * - Removes unused objects
 * - Optimizes stream compression
 * - Cleans up cross-reference tables
 */
export async function compress(
  pdfBytes: Uint8Array,
  _options?: CompressionOptions
): Promise<CompressionResult> {
  const originalSize = pdfBytes.length;

  try {
    log.info(
      `[CompressionService] Compressing PDF (${(originalSize / 1024).toFixed(1)} KB)`
    );

    const compressedPdf = await compressPdf(pdfBytes);
    const compressedSize = compressedPdf.length;
    const savings = originalSize - compressedSize;
    const savingsPercent =
      originalSize > 0 ? (savings / originalSize) * 100 : 0;

    log.info(
      `[CompressionService] Compression complete: ${(compressedSize / 1024).toFixed(1)} KB ` +
        `(saved ${(savings / 1024).toFixed(1)} KB, ${savingsPercent.toFixed(1)}%)`
    );

    return {
      success: true,
      pdfBytes: compressedPdf,
      originalSize,
      compressedSize,
      savings,
      savingsPercent,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    log.error("[CompressionService] Compression failed:", error);

    return {
      success: false,
      originalSize,
      compressedSize: originalSize,
      savings: 0,
      savingsPercent: 0,
      error: errorMsg,
    };
  }
}

/**
 * Analyze a PDF for compression potential
 */
export async function analyzeCompressionPotential(
  pdfBytes: Uint8Array
): Promise<{
  currentSize: number;
  pageCount: number;
  hasMetadata: boolean;
  estimatedSavings: string;
}> {
  try {
    const metadata = await getMetadata(pdfBytes);

    const hasMetadata = !!(
      metadata.title ||
      metadata.author ||
      metadata.subject
    );

    // Rough estimation based on typical PDF compression ratios
    const estimatedSavingsPercent = hasMetadata ? "5-15%" : "2-10%";

    return {
      currentSize: pdfBytes.length,
      pageCount: metadata.pageCount,
      hasMetadata,
      estimatedSavings: estimatedSavingsPercent,
    };
  } catch (error) {
    log.error("[CompressionService] Analysis failed:", error);
    return {
      currentSize: pdfBytes.length,
      pageCount: 0,
      hasMetadata: false,
      estimatedSavings: "unknown",
    };
  }
}

/**
 * Batch compress multiple PDFs
 */
export async function compressBatch(
  pdfBytesArray: Uint8Array[]
): Promise<CompressionResult[]> {
  const results: CompressionResult[] = [];

  for (let i = 0; i < pdfBytesArray.length; i++) {
    log.info(
      `[CompressionService] Processing PDF ${i + 1}/${pdfBytesArray.length}`
    );
    const result = await compress(pdfBytesArray[i]);
    results.push(result);
  }

  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalCompressed = results.reduce((sum, r) => sum + r.compressedSize, 0);
  const totalSavings = totalOriginal - totalCompressed;

  log.info(
    `[CompressionService] Batch complete: ` +
      `${results.length} PDFs, ` +
      `${(totalSavings / 1024).toFixed(1)} KB saved total`
  );

  return results;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
