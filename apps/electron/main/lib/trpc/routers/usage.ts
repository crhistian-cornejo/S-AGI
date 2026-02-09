import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { supabase } from "../../supabase/client";
import { isLocalStorageMode } from "../../storage";
import { getUsageTracker } from "../../storage/usage-tracker";
import log from "electron-log";

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const usageRouter = router({
  // Main stats endpoint (chart + rolling totals)
  getStats: publicProcedure
    .input(
      z.object({
        month: z.number().min(0).max(11).optional(),
        year: z.number().min(2020).max(2100).optional(),
      }),
    )
    .query(async ({ input }) => {
      const now = new Date();
      const targetYear = input.year ?? now.getFullYear();
      const targetMonth = input.month ?? now.getMonth();

      if (isLocalStorageMode()) {
        const tracker = getUsageTracker();
        const daily = tracker.getDailyStats(targetYear, targetMonth);
        const totals = tracker.getRollingTotals(targetYear);

        // Calculate selected month total
        const selectedMonthTotal = daily.reduce((sum, d) => sum + d.tokens, 0);

        return {
          daily,
          totals: {
            ...totals,
            selectedMonth: selectedMonthTotal,
          },
        };
      }

      // Cloud mode: keep existing Supabase logic
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const chartStartDate = new Date(targetYear, targetMonth, 1);
      const chartEndDate = new Date(targetYear, targetMonth + 1, 0);
      const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 86400000);
      const yearStart = new Date(targetYear, 0, 1);
      const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);
      const queryStart = new Date(Math.min(yearStart.getTime(), oneMonthAgo.getTime()));
      const queryEnd = new Date(Math.max(yearEnd.getTime(), now.getTime()));

      const { data, error } = await supabase
        .from("chat_messages")
        .select("created_at, model_id, metadata")
        .gte("created_at", queryStart.toISOString())
        .lte("created_at", queryEnd.toISOString())
        .not("metadata", "is", null);

      if (error) {
        throw new Error("Failed to fetch usage stats");
      }

      const dailyMap = new Map<string, { date: string; tokens: number; models: Set<string> }>();
      const iterDate = new Date(chartStartDate);
      while (iterDate <= chartEndDate) {
        const dateStr = formatDate(iterDate);
        dailyMap.set(dateStr, { date: dateStr, tokens: 0, models: new Set() });
        iterDate.setDate(iterDate.getDate() + 1);
      }

      let totalTokensWeek = 0;
      let totalTokensFortnight = 0;
      let totalTokensMonth = 0;
      let totalTokensYear = 0;
      let selectedMonthTotal = 0;

      data?.forEach((msg: any) => {
        const msgDate = new Date(msg.created_at);
        const dateStr = formatDate(msgDate);
        const usage = msg.metadata?.usage;
        const tokens = typeof usage?.totalTokens === "number" ? usage.totalTokens : 0;
        const model = msg.model_id;

        if (msgDate.getMonth() === targetMonth && msgDate.getFullYear() === targetYear) {
          if (dailyMap.has(dateStr)) {
            const entry = dailyMap.get(dateStr)!;
            entry.tokens += tokens;
            if (model) entry.models.add(model);
          }
          selectedMonthTotal += tokens;
        }

        if (msgDate.getFullYear() === targetYear) totalTokensYear += tokens;
        if (msgDate >= oneWeekAgo) totalTokensWeek += tokens;
        if (msgDate >= twoWeeksAgo) totalTokensFortnight += tokens;
        if (msgDate >= oneMonthAgo) totalTokensMonth += tokens;
      });

      return {
        daily: Array.from(dailyMap.values()).map((d) => ({
          ...d,
          models: Array.from(d.models),
        })),
        totals: {
          week: totalTokensWeek,
          fortnight: totalTokensFortnight,
          month: totalTokensMonth,
          year: totalTokensYear,
          selectedMonth: selectedMonthTotal,
        },
      };
    }),

  // Per-model daily breakdown (for stacked charts)
  getByModelDaily: publicProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
    )
    .query(({ input }) => {
      const tracker = getUsageTracker();
      return tracker.getByModelDaily(new Date(input.startDate), new Date(input.endDate));
    }),

  // Usage for a specific chat (clickable association)
  getChatUsage: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(({ input }) => {
      const tracker = getUsageTracker();
      return tracker.getChatUsage(input.chatId);
    }),

  // Usage summary with filters
  getSummary: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        provider: z.string().optional(),
        modelId: z.string().optional(),
        chatId: z.string().optional(),
      }).optional(),
    )
    .query(({ input }) => {
      const tracker = getUsageTracker();
      return tracker.getSummary(
        input
          ? {
              startDate: input.startDate ? new Date(input.startDate) : undefined,
              endDate: input.endDate ? new Date(input.endDate) : undefined,
              provider: input.provider,
              modelId: input.modelId,
              chatId: input.chatId,
            }
          : undefined,
      );
    }),

  // Recent usage logs (paginated)
  getRecentLogs: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      }).optional(),
    )
    .query(({ input }) => {
      const tracker = getUsageTracker();
      return tracker.getRecentLogs(input?.limit ?? 50, input?.offset ?? 0);
    }),

  // Legacy backward compat
  getDailyStats: publicProcedure
    .input(z.object({ days: z.number().optional() }))
    .query(async () => {
      return {
        daily: [],
        totals: { week: 0, fortnight: 0, month: 0, year: 0 },
      };
    }),
});
