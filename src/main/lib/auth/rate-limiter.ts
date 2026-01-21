import log from 'electron-log'

/**
 * Rate limiter configuration
 */
interface RateLimiterConfig {
    /** Maximum number of requests allowed in the window */
    maxRequests: number
    /** Time window in milliseconds */
    windowMs: number
    /** Optional: Block duration after limit exceeded (ms) */
    blockDurationMs?: number
}

/**
 * Rate limit entry for a specific key
 */
interface RateLimitEntry {
    /** Timestamps of requests within the window */
    requests: number[]
    /** If blocked, when the block expires */
    blockedUntil?: number
}

/**
 * Sliding window rate limiter
 *
 * Uses a sliding window algorithm for more accurate rate limiting:
 * - Tracks individual request timestamps
 * - Removes expired entries automatically
 * - Supports optional blocking after limit exceeded
 */
export class RateLimiter {
    private limits = new Map<string, RateLimitEntry>()
    private config: RateLimiterConfig
    private cleanupInterval?: NodeJS.Timeout

    constructor(config: RateLimiterConfig) {
        this.config = config

        // Cleanup old entries every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup()
        }, 60_000)
    }

    /**
     * Check if a request is allowed and record it
     * @param key Unique identifier (e.g., user ID, IP address)
     * @returns Object with allowed status and retry info
     */
    check(key: string): {
        allowed: boolean
        remaining: number
        resetAt: number
        retryAfter?: number
    } {
        const now = Date.now()
        let entry = this.limits.get(key)

        if (!entry) {
            entry = { requests: [] }
            this.limits.set(key, entry)
        }

        // Check if blocked
        if (entry.blockedUntil && entry.blockedUntil > now) {
            const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000)
            return {
                allowed: false,
                remaining: 0,
                resetAt: entry.blockedUntil,
                retryAfter
            }
        }

        // Remove expired requests from the window
        const windowStart = now - this.config.windowMs
        entry.requests = entry.requests.filter(ts => ts > windowStart)

        // Check if limit exceeded
        if (entry.requests.length >= this.config.maxRequests) {
            // Apply block if configured
            if (this.config.blockDurationMs) {
                entry.blockedUntil = now + this.config.blockDurationMs
                log.warn(`[RateLimiter] Key "${key}" blocked until ${new Date(entry.blockedUntil).toISOString()}`)
            }

            const oldestRequest = entry.requests[0] || now
            const retryAfter = Math.ceil((oldestRequest + this.config.windowMs - now) / 1000)

            return {
                allowed: false,
                remaining: 0,
                resetAt: oldestRequest + this.config.windowMs,
                retryAfter
            }
        }

        // Record the request
        entry.requests.push(now)

        const remaining = this.config.maxRequests - entry.requests.length
        const resetAt = entry.requests[0] + this.config.windowMs

        return {
            allowed: true,
            remaining,
            resetAt
        }
    }

    /**
     * Get current status for a key without recording a request
     */
    status(key: string): {
        requests: number
        remaining: number
        blocked: boolean
        blockedUntil?: number
    } {
        const now = Date.now()
        const entry = this.limits.get(key)

        if (!entry) {
            return {
                requests: 0,
                remaining: this.config.maxRequests,
                blocked: false
            }
        }

        // Check if blocked
        if (entry.blockedUntil && entry.blockedUntil > now) {
            return {
                requests: entry.requests.length,
                remaining: 0,
                blocked: true,
                blockedUntil: entry.blockedUntil
            }
        }

        // Count valid requests in window
        const windowStart = now - this.config.windowMs
        const validRequests = entry.requests.filter(ts => ts > windowStart).length

        return {
            requests: validRequests,
            remaining: Math.max(0, this.config.maxRequests - validRequests),
            blocked: false
        }
    }

    /**
     * Reset rate limit for a specific key
     */
    reset(key: string): void {
        this.limits.delete(key)
        log.info(`[RateLimiter] Reset rate limit for "${key}"`)
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now()
        const windowStart = now - this.config.windowMs
        let cleaned = 0

        for (const [key, entry] of this.limits) {
            // Remove if all requests are expired and not blocked
            const hasValidRequests = entry.requests.some(ts => ts > windowStart)
            const isBlocked = entry.blockedUntil && entry.blockedUntil > now

            if (!hasValidRequests && !isBlocked) {
                this.limits.delete(key)
                cleaned++
            }
        }

        if (cleaned > 0) {
            log.debug(`[RateLimiter] Cleaned up ${cleaned} expired entries`)
        }
    }

    /**
     * Destroy the rate limiter and clear resources
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
        }
        this.limits.clear()
    }
}

/**
 * Pre-configured rate limiters for different endpoints
 */

// Auth endpoints: 10 requests per minute, 5 minute block
export const authRateLimiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 60_000,
    blockDurationMs: 5 * 60_000
})

// Sign up: 3 per hour (stricter to prevent abuse)
export const signUpRateLimiter = new RateLimiter({
    maxRequests: 3,
    windowMs: 60 * 60_000,
    blockDurationMs: 60 * 60_000
})

// Password reset: 5 per hour
export const passwordResetRateLimiter = new RateLimiter({
    maxRequests: 5,
    windowMs: 60 * 60_000,
    blockDurationMs: 30 * 60_000
})

// OAuth: 20 per minute (more lenient for redirects)
export const oauthRateLimiter = new RateLimiter({
    maxRequests: 20,
    windowMs: 60_000,
    blockDurationMs: 2 * 60_000
})

// API requests: 100 per minute
export const apiRateLimiter = new RateLimiter({
    maxRequests: 100,
    windowMs: 60_000
})

/**
 * Helper to create rate limit error
 */
export function createRateLimitError(retryAfter?: number): Error {
    const error = new Error(
        `Rate limit exceeded. ${retryAfter ? `Please try again in ${retryAfter} seconds.` : 'Please try again later.'}`
    )
    ;(error as any).code = 'RATE_LIMIT_EXCEEDED'
    ;(error as any).retryAfter = retryAfter
    return error
}

/**
 * Rate limit middleware for tRPC procedures
 */
export function checkRateLimit(limiter: RateLimiter, key: string): void {
    const result = limiter.check(key)

    if (!result.allowed) {
        throw createRateLimitError(result.retryAfter)
    }
}
