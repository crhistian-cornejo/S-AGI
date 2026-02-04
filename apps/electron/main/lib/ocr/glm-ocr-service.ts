/**
 * GLM-OCR Service
 *
 * Service for calling Z.AI's GLM-OCR layout_parsing API
 * Handles PDF/image OCR with advanced table and formula extraction
 */

import log from 'electron-log'
import { getZaiAuthManager } from '../auth/zai-manager'
import type {
  GLMOCRRequest,
  GLMOCRResponse,
  GLMOCRError,
  OCRProcessingResult,
  PageContent,
} from './types'

// ============================================================================
// Configuration
// ============================================================================

const GLM_OCR_API_URL = 'https://api.z.ai/api/paas/v4/layout_parsing'
const DEFAULT_TIMEOUT_MS = 120_000 // 2 minutes for large PDFs
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1000

// ============================================================================
// Main Service Functions
// ============================================================================

/**
 * Process a document with GLM-OCR
 *
 * @param fileBuffer - The PDF or image file buffer
 * @param contentType - MIME type of the file
 * @param options - Processing options
 * @returns OCR processing result with content and pages
 */
export async function processWithGLMOCR(
  fileBuffer: Buffer,
  contentType: string = 'application/pdf',
  options: {
    timeout?: number
    signal?: AbortSignal
  } = {}
): Promise<OCRProcessingResult> {
  const startTime = Date.now()
  const apiKey = getZaiAuthManager().getApiKey()

  if (!apiKey) {
    throw new GLMOCRServiceError('Z.AI API key not configured', 'NO_API_KEY')
  }

  log.info('[GLM-OCR] Starting document processing...')

  // Convert buffer to base64 data URL
  const base64 = fileBuffer.toString('base64')
  const dataUrl = `data:${contentType};base64,${base64}`

  // Make API call with retries
  const response = await callGLMOCRWithRetry(
    { model: 'glm-ocr', file: dataUrl },
    apiKey,
    options.timeout ?? DEFAULT_TIMEOUT_MS,
    options.signal
  )

  // Transform response to PageContent format
  const result = transformResponseToPages(response.content)

  const processingTimeMs = Date.now() - startTime
  log.info(`[GLM-OCR] Processing completed in ${processingTimeMs}ms`)

  return {
    ...result,
    metadata: {
      extractionMethod: 'glm-ocr',
      processingTimeMs,
      tablesCount: countTables(response.content),
      formulasCount: countFormulas(response.content),
    },
  }
}

/**
 * Process a document from URL with GLM-OCR
 */
export async function processFromUrlWithGLMOCR(
  fileUrl: string,
  options: {
    timeout?: number
    signal?: AbortSignal
  } = {}
): Promise<OCRProcessingResult> {
  const startTime = Date.now()
  const apiKey = getZaiAuthManager().getApiKey()

  if (!apiKey) {
    throw new GLMOCRServiceError('Z.AI API key not configured', 'NO_API_KEY')
  }

  log.info('[GLM-OCR] Processing document from URL...')

  const response = await callGLMOCRWithRetry(
    { model: 'glm-ocr', file: fileUrl },
    apiKey,
    options.timeout ?? DEFAULT_TIMEOUT_MS,
    options.signal
  )

  const result = transformResponseToPages(response.content)
  const processingTimeMs = Date.now() - startTime

  return {
    ...result,
    metadata: {
      extractionMethod: 'glm-ocr',
      processingTimeMs,
      tablesCount: countTables(response.content),
      formulasCount: countFormulas(response.content),
    },
  }
}

/**
 * Check if GLM-OCR is available (has API key)
 */
export function isGLMOCRAvailable(): boolean {
  return getZaiAuthManager().hasApiKey()
}

// ============================================================================
// API Call Implementation
// ============================================================================

async function callGLMOCRWithRetry(
  request: GLMOCRRequest,
  apiKey: string,
  timeout: number,
  signal?: AbortSignal
): Promise<GLMOCRResponse> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGLMOCRAPI(request, apiKey, timeout, signal)
    } catch (error) {
      lastError = error as Error
      const isRetryable = isRetryableError(error)

      if (!isRetryable || attempt === MAX_RETRIES) {
        throw error
      }

      log.warn(
        `[GLM-OCR] Attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms...`,
        error
      )
      await sleep(RETRY_DELAY_MS * attempt) // Exponential backoff
    }
  }

  throw lastError
}

async function callGLMOCRAPI(
  request: GLMOCRRequest,
  apiKey: string,
  timeout: number,
  signal?: AbortSignal
): Promise<GLMOCRResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // Combine signals if provided
  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch(GLM_OCR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Source': 'S-AGI-Agent',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as GLMOCRError
      const errorMessage =
        errorBody.error?.message || `HTTP ${response.status}: ${response.statusText}`

      if (response.status === 401) {
        throw new GLMOCRServiceError('Invalid Z.AI API key', 'INVALID_API_KEY')
      }
      if (response.status === 429) {
        throw new GLMOCRServiceError('Rate limit exceeded', 'RATE_LIMITED')
      }
      if (response.status >= 500) {
        throw new GLMOCRServiceError(`Server error: ${errorMessage}`, 'SERVER_ERROR')
      }

      throw new GLMOCRServiceError(errorMessage, 'API_ERROR')
    }

    const data = (await response.json()) as GLMOCRResponse

    if (!data.content) {
      throw new GLMOCRServiceError('Empty response from GLM-OCR', 'EMPTY_RESPONSE')
    }

    return data
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof GLMOCRServiceError) {
      throw error
    }

    if ((error as Error).name === 'AbortError') {
      throw new GLMOCRServiceError('Request timeout', 'TIMEOUT')
    }

    throw new GLMOCRServiceError(
      `Network error: ${(error as Error).message}`,
      'NETWORK_ERROR'
    )
  }
}

// ============================================================================
// Response Transformation
// ============================================================================

/**
 * Transform GLM-OCR markdown response to PageContent array
 *
 * GLM-OCR returns structured markdown with page breaks indicated by
 * "---" or page headers. We parse this into individual pages.
 */
function transformResponseToPages(markdownContent: string): {
  content: string
  pages: PageContent[]
} {
  const pages: PageContent[] = []

  // Split by common page break patterns
  // GLM-OCR typically uses "---" or "\n\n---\n\n" for page breaks
  // Also look for "## Page X" or similar patterns
  const pagePattern = /(?:^|\n)(?:---|\*{3}|_{3})(?:\n|$)|(?:^|\n)##?\s*(?:Page|Página|页)\s*\d+/gi
  const pageParts = markdownContent.split(pagePattern).filter((part) => part.trim())

  if (pageParts.length === 0) {
    // No page breaks found, treat entire content as one page
    pages.push({
      pageNumber: 1,
      content: markdownContent.trim(),
      wordCount: countWords(markdownContent),
    })
  } else {
    pageParts.forEach((pageContent, index) => {
      const trimmedContent = pageContent.trim()
      if (trimmedContent) {
        pages.push({
          pageNumber: index + 1,
          content: trimmedContent,
          wordCount: countWords(trimmedContent),
        })
      }
    })
  }

  // Ensure at least one page
  if (pages.length === 0) {
    pages.push({
      pageNumber: 1,
      content: markdownContent.trim() || '',
      wordCount: countWords(markdownContent),
    })
  }

  return {
    content: markdownContent,
    pages,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
}

function countTables(content: string): number {
  // Count HTML tables or markdown tables
  const htmlTables = (content.match(/<table/gi) || []).length
  const markdownTables = (content.match(/\|[-:]+\|/g) || []).length
  return htmlTables + markdownTables
}

function countFormulas(content: string): number {
  // Count LaTeX formulas ($$...$$ or $...$)
  const blockFormulas = (content.match(/\$\$[\s\S]+?\$\$/g) || []).length
  const inlineFormulas = (content.match(/\$[^$\n]+\$/g) || []).length
  return blockFormulas + inlineFormulas
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof GLMOCRServiceError) {
    return ['TIMEOUT', 'RATE_LIMITED', 'SERVER_ERROR', 'NETWORK_ERROR'].includes(
      error.code
    )
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// Custom Error Class
// ============================================================================

export class GLMOCRServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_API_KEY'
      | 'INVALID_API_KEY'
      | 'RATE_LIMITED'
      | 'TIMEOUT'
      | 'SERVER_ERROR'
      | 'NETWORK_ERROR'
      | 'API_ERROR'
      | 'EMPTY_RESPONSE'
  ) {
    super(message)
    this.name = 'GLMOCRServiceError'
  }
}
