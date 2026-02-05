/**
 * OpenAI Client Cache
 *
 * Reuses OpenAI client instances (and their underlying TCP connections)
 * for the same provider+apiKey combination. TTL of 10 minutes.
 */

import OpenAI from "openai";

interface CachedClient {
  client: OpenAI;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CachedClient>();

function buildKey(
  apiKey: string,
  baseURL?: string,
  headers?: Record<string, string>,
): string {
  return `${apiKey}|${baseURL || ""}|${headers ? JSON.stringify(headers) : ""}`;
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > TTL_MS) {
      cache.delete(key);
    }
  }
}

export function getOrCreateClient(opts: {
  apiKey: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  maxRetries?: number;
}): OpenAI {
  evictExpired();

  const key = buildKey(opts.apiKey, opts.baseURL, opts.defaultHeaders);
  const existing = cache.get(key);

  if (existing && Date.now() - existing.createdAt < TTL_MS) {
    return existing.client;
  }

  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    defaultHeaders: opts.defaultHeaders,
    maxRetries: opts.maxRetries ?? 0,
  });

  cache.set(key, { client, createdAt: Date.now() });
  return client;
}
