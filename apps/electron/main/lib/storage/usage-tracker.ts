/**
 * Usage Tracker Service
 * Reads and writes the usage_logs SQLite table for token usage analytics
 */

import log from "electron-log";
import { randomUUID } from "crypto";
import { getRawDatabase } from "./local-db";

type SQLiteDatabase = import("better-sqlite3").Database;

/** Cost per 1M tokens (input/output) by model */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "o3": { input: 2, output: 8 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 1.1, output: 4.4 },
  // Claude
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  // Ollama / local models (free)
  // Z.AI / Cerebras / Groq — mostly free-tier, $0
};

function estimateCost(modelId: string, promptTokens: number, completionTokens: number): number | null {
  // Find matching pricing (partial match for model IDs)
  const key = Object.keys(MODEL_PRICING).find(k => modelId.includes(k));
  if (!key) return null;
  const pricing = MODEL_PRICING[key];
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export interface DailyStat {
  date: string;
  tokens: number;
  models: string[];
}

export interface RollingTotals {
  week: number;
  fortnight: number;
  month: number;
  year: number;
}

export interface ModelDailyStat {
  date: string;
  model_id: string;
  model_name: string | null;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
}

export interface ChatUsageStat {
  model_id: string;
  model_name: string | null;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
  total_cost: number | null;
}

export interface UsageSummary {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_cost: number | null;
  request_count: number;
  by_model: Array<{
    model_id: string;
    model_name: string | null;
    provider: string;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost: number | null;
    request_count: number;
  }>;
}

export interface UsageLog {
  id: string;
  chat_id: string | null;
  message_id: string | null;
  provider: string;
  model_id: string | null;
  model_name: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number | null;
  total_tokens: number;
  cost_estimate: number | null;
  request_duration_ms: number | null;
  created_at: number;
}

export interface SummaryFilters {
  startDate?: Date;
  endDate?: Date;
  provider?: string;
  modelId?: string;
  chatId?: string;
}

export interface LogRequestInput {
  chatId?: string;
  messageId?: string;
  provider: string;
  modelId?: string;
  modelName?: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
  costEstimate?: number;
  requestDurationMs?: number;
}

export class UsageTracker {
  private getDb(): SQLiteDatabase {
    const db = getRawDatabase();
    if (!db) {
      throw new Error("Database not initialized");
    }
    return db;
  }

  /**
   * Write a usage log entry to the database.
   * This is the CRITICAL write method that was missing.
   */
  logRequest(input: LogRequestInput): void {
    const db = this.getDb();

    try {
      const id = randomUUID();
      const cost = input.costEstimate ??
        estimateCost(input.modelId ?? "", input.promptTokens, input.completionTokens);

      db.prepare(
        `INSERT INTO usage_logs (
          id, chat_id, message_id, provider, model_id, model_name,
          prompt_tokens, completion_tokens, reasoning_tokens, total_tokens,
          cost_estimate, request_duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.chatId ?? null,
        input.messageId ?? null,
        input.provider,
        input.modelId ?? null,
        input.modelName ?? null,
        input.promptTokens,
        input.completionTokens,
        input.reasoningTokens ?? null,
        input.totalTokens,
        cost ?? null,
        input.requestDurationMs ?? null
      );

      log.debug(
        `[UsageTracker] Logged: ${input.provider}/${input.modelId} — ${input.totalTokens} tokens, cost: $${cost?.toFixed(6) ?? "N/A"}`
      );
    } catch (err) {
      log.error("[UsageTracker] logRequest error:", err);
    }
  }

  getDailyStats(year: number, month: number): DailyStat[] {
    const db = this.getDb();
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    const startUnix = Math.floor(startDate.getTime() / 1000);
    const endUnix = Math.floor(endDate.getTime() / 1000) + 86399;

    const dailyMap = new Map<string, { date: string; tokens: number; models: Set<string> }>();
    const iterDate = new Date(startDate);
    while (iterDate <= endDate) {
      const dateStr = formatDate(iterDate);
      dailyMap.set(dateStr, { date: dateStr, tokens: 0, models: new Set() });
      iterDate.setDate(iterDate.getDate() + 1);
    }

    try {
      const rows = db
        .prepare(
          `SELECT date(created_at, 'unixepoch', 'localtime') as day,
                  model_id,
                  SUM(total_tokens) as tokens
           FROM usage_logs
           WHERE created_at >= ? AND created_at <= ?
           GROUP BY day, model_id`,
        )
        .all(startUnix, endUnix) as Array<{ day: string; model_id: string | null; tokens: number }>;

      for (const row of rows) {
        const entry = dailyMap.get(row.day);
        if (entry) {
          entry.tokens += row.tokens;
          if (row.model_id) entry.models.add(row.model_id);
        }
      }
    } catch (err) {
      log.error("[UsageTracker] getDailyStats error:", err);
    }

    return Array.from(dailyMap.values()).map((d) => ({
      date: d.date,
      tokens: d.tokens,
      models: Array.from(d.models),
    }));
  }

  getRollingTotals(year: number): RollingTotals {
    const db = this.getDb();
    const now = new Date();
    const nowUnix = Math.floor(now.getTime() / 1000);
    const weekAgo = nowUnix - 7 * 86400;
    const fortnightAgo = nowUnix - 14 * 86400;
    const monthAgo = nowUnix - 30 * 86400;
    const yearStart = Math.floor(new Date(year, 0, 1).getTime() / 1000);
    const yearEnd = Math.floor(new Date(year, 11, 31, 23, 59, 59).getTime() / 1000);

    try {
      const row = db
        .prepare(
          `SELECT
            COALESCE(SUM(CASE WHEN created_at >= ? THEN total_tokens ELSE 0 END), 0) as week,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN total_tokens ELSE 0 END), 0) as fortnight,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN total_tokens ELSE 0 END), 0) as month,
            COALESCE(SUM(CASE WHEN created_at >= ? AND created_at <= ? THEN total_tokens ELSE 0 END), 0) as year
           FROM usage_logs
           WHERE created_at >= ?`,
        )
        .get(weekAgo, fortnightAgo, monthAgo, yearStart, yearEnd, Math.min(weekAgo, fortnightAgo, monthAgo, yearStart)) as RollingTotals;

      return row;
    } catch (err) {
      log.error("[UsageTracker] getRollingTotals error:", err);
      return { week: 0, fortnight: 0, month: 0, year: 0 };
    }
  }

  getByModelDaily(startDate: Date, endDate: Date): ModelDailyStat[] {
    const db = this.getDb();
    const startUnix = Math.floor(startDate.getTime() / 1000);
    const endUnix = Math.floor(endDate.getTime() / 1000) + 86399;

    try {
      return db
        .prepare(
          `SELECT
            date(created_at, 'unixepoch', 'localtime') as date,
            model_id,
            model_name,
            provider,
            SUM(prompt_tokens) as prompt_tokens,
            SUM(completion_tokens) as completion_tokens,
            SUM(total_tokens) as total_tokens,
            COUNT(*) as request_count
           FROM usage_logs
           WHERE created_at >= ? AND created_at <= ?
           GROUP BY date, model_id
           ORDER BY date ASC`,
        )
        .all(startUnix, endUnix) as ModelDailyStat[];
    } catch (err) {
      log.error("[UsageTracker] getByModelDaily error:", err);
      return [];
    }
  }

  getChatUsage(chatId: string): ChatUsageStat[] {
    const db = this.getDb();

    try {
      return db
        .prepare(
          `SELECT
            model_id,
            model_name,
            provider,
            SUM(prompt_tokens) as prompt_tokens,
            SUM(completion_tokens) as completion_tokens,
            SUM(total_tokens) as total_tokens,
            COUNT(*) as request_count,
            SUM(cost_estimate) as total_cost
           FROM usage_logs
           WHERE chat_id = ?
           GROUP BY model_id
           ORDER BY total_tokens DESC`,
        )
        .all(chatId) as ChatUsageStat[];
    } catch (err) {
      log.error("[UsageTracker] getChatUsage error:", err);
      return [];
    }
  }

  getSummary(filters?: SummaryFilters): UsageSummary {
    const db = this.getDb();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.startDate) {
      conditions.push("created_at >= ?");
      params.push(Math.floor(filters.startDate.getTime() / 1000));
    }
    if (filters?.endDate) {
      conditions.push("created_at <= ?");
      params.push(Math.floor(filters.endDate.getTime() / 1000));
    }
    if (filters?.provider) {
      conditions.push("provider = ?");
      params.push(filters.provider);
    }
    if (filters?.modelId) {
      conditions.push("model_id = ?");
      params.push(filters.modelId);
    }
    if (filters?.chatId) {
      conditions.push("chat_id = ?");
      params.push(filters.chatId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const totals = db
        .prepare(
          `SELECT
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) as completion_tokens,
            SUM(cost_estimate) as total_cost,
            COUNT(*) as request_count
           FROM usage_logs ${whereClause}`,
        )
        .get(...params) as {
        total_tokens: number;
        prompt_tokens: number;
        completion_tokens: number;
        total_cost: number | null;
        request_count: number;
      };

      const byModel = db
        .prepare(
          `SELECT
            model_id,
            model_name,
            provider,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) as completion_tokens,
            SUM(cost_estimate) as cost,
            COUNT(*) as request_count
           FROM usage_logs ${whereClause}
           GROUP BY model_id
           ORDER BY total_tokens DESC`,
        )
        .all(...params) as UsageSummary["by_model"];

      return {
        ...totals,
        by_model: byModel,
      };
    } catch (err) {
      log.error("[UsageTracker] getSummary error:", err);
      return {
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_cost: null,
        request_count: 0,
        by_model: [],
      };
    }
  }

  getRecentLogs(limit: number = 50, offset: number = 0): UsageLog[] {
    const db = this.getDb();

    try {
      return db
        .prepare(
          `SELECT * FROM usage_logs
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
        )
        .all(limit, offset) as UsageLog[];
    } catch (err) {
      log.error("[UsageTracker] getRecentLogs error:", err);
      return [];
    }
  }
}

let tracker: UsageTracker | null = null;

export function getUsageTracker(): UsageTracker {
  if (!tracker) {
    tracker = new UsageTracker();
  }
  return tracker;
}
