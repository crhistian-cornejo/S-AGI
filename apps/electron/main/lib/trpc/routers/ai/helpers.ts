/**
 * AI Router Helpers
 *
 * Utility functions for error handling, retry logic, and prompt analysis.
 */

import log from "electron-log";
import {
  RETRY_DELAYS_MS,
  MAX_JITTER_MS,
  AUTO_TITLE_MAX_LENGTH,
} from "./constants";

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Check if error is a Z.AI billing/quota error
 */
export function isZaiBillingError(error: unknown): boolean {
  const status = (error as any)?.status;
  const message = (error as any)?.message || "";
  return (
    status === 429 &&
    /insufficient\s+balance|no\s+resource\s+package|quota\s+exceeded/i.test(
      message
    )
  );
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const status = (error as any)?.status;
  const code = (error as any)?.code;
  const message = (error as any)?.message || "";
  const errorType = (error as any)?.type || "";

  // Z.AI billing errors should NOT be retried (they won't resolve themselves)
  if (isZaiBillingError(error)) {
    log.warn("[AI] Z.AI billing error detected - will not retry:", message);
    return false;
  }

  // OpenAI server errors (500, 502, 503, 504) - always retry
  if (typeof status === "number" && status >= 500 && status < 600) {
    log.info(`[AI] Server error ${status} detected - will retry`);
    return true;
  }

  // Rate limiting (429) - retry with backoff
  if (status === 429) {
    log.info("[AI] Rate limit (429) detected - will retry with backoff");
    return true;
  }

  // OpenAI specific error types that are retryable
  if (
    errorType === "server_error" ||
    errorType === "api_error" ||
    errorType === "service_unavailable"
  ) {
    log.info(`[AI] OpenAI error type "${errorType}" - will retry`);
    return true;
  }

  // Network errors - retry
  const retryableCodes = [
    "ETIMEDOUT",
    "ECONNRESET",
    "EPIPE",
    "ENOTFOUND",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "EHOSTUNREACH",
  ];
  if (retryableCodes.includes(code)) {
    log.info(`[AI] Network error ${code} - will retry`);
    return true;
  }

  // OpenAI "An error occurred while processing" messages - these are transient
  if (
    /error occurred while processing|internal server error|bad gateway|service unavailable/i.test(
      message
    )
  ) {
    log.info("[AI] Transient OpenAI error detected in message - will retry");
    return true;
  }

  return false;
}

/**
 * Calculate delay with jitter for retry
 */
export function getRetryDelayWithJitter(attemptIndex: number): number {
  const baseDelay =
    RETRY_DELAYS_MS[Math.min(attemptIndex, RETRY_DELAYS_MS.length - 1)];
  const jitter = Math.random() * MAX_JITTER_MS;
  return baseDelay + jitter;
}

/**
 * Sanitize API error messages to remove sensitive information
 */
export function sanitizeApiError(errorText: string): string {
  // Redact API keys first
  let sanitized = errorText.replace(
    /sk-[a-zA-Z0-9_-]{20,}/g,
    "[REDACTED_API_KEY]"
  );

  // Z.AI billing/quota errors - provide a helpful message
  if (/insufficient\s+balance|no\s+resource\s+package/i.test(errorText)) {
    return "Z.AI: Insufficient balance or quota exceeded. Try using the free model (GLM-4.7-Flash) or check your Z.AI subscription.";
  }

  // Z.AI quota exceeded
  if (/quota\s+exceeded/i.test(errorText)) {
    return "Z.AI: Quota exceeded. Try using the free model (GLM-4.7-Flash) or wait until your quota resets.";
  }

  // General rate limit message improvements
  if (/429|rate\s+limit/i.test(errorText)) {
    return "Rate limit exceeded. Please wait a moment and try again.";
  }

  return sanitized;
}

// ============================================================================
// Request Signal Management
// ============================================================================

/**
 * Create a combined abort signal with timeout
 */
export function createRequestSignal(
  parentSignal: AbortSignal,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  if (timeoutMs <= 0) {
    return { signal: parentSignal, cleanup: () => {} };
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  let combinedSignal: AbortSignal;
  if (
    typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as any).any === "function"
  ) {
    combinedSignal = (AbortSignal as any).any([
      parentSignal,
      timeoutController.signal,
    ]);
  } else {
    combinedSignal = timeoutController.signal;
    parentSignal.addEventListener("abort", () => timeoutController.abort(), {
      once: true,
    });
  }

  const cleanup = () => clearTimeout(timeoutId);
  combinedSignal.addEventListener("abort", cleanup, { once: true });

  return { signal: combinedSignal, cleanup };
}

/**
 * Execute a task with retry logic and exponential backoff
 */
export async function withRetry<T>(
  label: string,
  parentSignal: AbortSignal,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  const maxAttempts = RETRY_DELAYS_MS.length + 1; // +1 for initial attempt

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // Check if already aborted before starting
    if (parentSignal.aborted) {
      throw new Error("Request cancelled");
    }

    const { signal, cleanup } = createRequestSignal(parentSignal, timeoutMs);
    try {
      if (attempt > 0) {
        log.info(`[AI] ${label} - attempt ${attempt + 1}/${maxAttempts}`);
      }
      return await task(signal);
    } catch (error) {
      lastError = error;
      const errorStatus = (error as any)?.status;
      const errorMessage = (error as any)?.message || String(error);
      const requestId =
        (error as any)?.request_id ||
        (error as any)?.headers?.get?.("x-request-id") ||
        "unknown";

      // Log detailed error info
      log.warn(`[AI] ${label} failed (attempt ${attempt + 1}/${maxAttempts})`, {
        status: errorStatus,
        message: errorMessage.slice(0, 200),
        requestId,
        retryable: isRetryableError(error),
      });

      // Check if we should retry
      const isLastAttempt = attempt === maxAttempts - 1;
      if (!isRetryableError(error) || isLastAttempt) {
        if (isLastAttempt && isRetryableError(error)) {
          log.error(
            `[AI] ${label} - max retries (${maxAttempts}) exhausted. Last error:`,
            errorMessage.slice(0, 300)
          );
        }
        throw error;
      }

      // Calculate delay with jitter and wait
      const delayMs = getRetryDelayWithJitter(attempt);
      log.info(
        `[AI] ${label} - waiting ${Math.round(delayMs)}ms before retry...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      cleanup();
    }
  }

  throw lastError;
}

// ============================================================================
// Prompt Analysis
// ============================================================================

/**
 * Get fallback title from prompt
 */
export function getFallbackTitle(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return "New Chat";
  if (trimmed.length <= AUTO_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, AUTO_TITLE_MAX_LENGTH)}...`;
}

/**
 * Heuristics for ResponseMode Auto: choose 'thinking' or 'instant'
 */
export function pickModeAuto(
  text: string,
  _hasImages?: boolean
): "instant" | "thinking" {
  const t = text.toLowerCase();
  const long = text.length > 800;
  const complex = [
    "arquitect",
    "disen",
    "seguridad",
    "optim",
    "debug",
    "calcul",
    "contrato",
    "plan",
    "detallado",
    "paso a paso",
    "con ejemplos",
  ].some((k) => t.includes(k));
  return long || complex ? "thinking" : "instant";
}

/**
 * Check if prompt is likely about coding
 */
export function isLikelyCodingPrompt(text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes("```")) return true;
  if (
    /[\\/][\w.\-]+\.([cm]?[jt]sx?|py|go|rs|java|kt|cs|php|rb|sql|json|yml|yaml|toml|md)\b/i.test(
      text
    )
  )
    return true;
  if (
    /\b([cm]?[jt]sx?|typescript|javascript|python|golang|rust|java|kotlin|c#|sql|react|electron|node|bun|npm|vite|webpack)\b/i.test(
      t
    )
  )
    return true;
  if (
    /\b(stack trace|exception|traceback|segfault|compile|build|tsc|lint|typecheck|bug|fix|refactor)\b/i.test(
      t
    )
  )
    return true;
  if (/\b(git|commit|diff|pr|pull request|branch|merge)\b/i.test(t))
    return true;
  return false;
}
