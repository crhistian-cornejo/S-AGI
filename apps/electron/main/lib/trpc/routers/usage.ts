import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { supabase } from "../../supabase/client";
import { getStorageAdapter, isLocalStorageMode } from "../../storage";
import log from "electron-log";

// Helper to format date as YYYY-MM-DD (Local Time)
const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const usageRouter = router({
  getStats: publicProcedure
    .input(
      z.object({
        month: z.number().min(0).max(11).optional(), // 0-indexed month
        year: z.number().min(2020).max(2100).optional(),
      }),
    )
    .query(async ({ input }) => {
      // In local mode, query from SQLite
      if (isLocalStorageMode()) {
        log.debug("[Usage] Local mode - fetching usage stats from SQLite");
        const adapter = await getStorageAdapter();

        const now = new Date();
        const targetYear = input.year ?? now.getFullYear();
        const targetMonth = input.month ?? now.getMonth();

        // Define Ranges
        const chartStartDate = new Date(targetYear, targetMonth, 1);
        const chartEndDate = new Date(targetYear, targetMonth + 1, 0);

        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get all messages from local storage
        // Note: We'll get all chats and then all messages with metadata
        const allChats = await adapter.chats.listAll?.() || await adapter.chats.list("local-user");

        // Collect all messages with usage metadata
        const allMessages: Array<{ createdAt: Date; modelId: string | null; metadata: any }> = [];

        for (const chat of allChats) {
          const messages = await adapter.messages.listByChatId?.(chat.id) ||
                          await adapter.messages.list(chat.id, "local-user");

          for (const msg of messages) {
            if (msg.metadata && typeof msg.metadata === 'object') {
              allMessages.push({
                createdAt: msg.createdAt,
                modelId: msg.modelId,
                metadata: msg.metadata
              });
            }
          }
        }

        // Initialize daily map for Chart (Target Month)
        const dailyMap = new Map<
          string,
          { date: string; tokens: number; models: Set<string> }
        >();

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

        allMessages.forEach((msg) => {
          const msgDate = msg.createdAt;
          const dateStr = formatDate(msgDate);
          const usage = msg.metadata?.usage;
          const tokens =
            typeof usage?.totalTokens === "number" ? usage.totalTokens :
            (typeof usage?.promptTokens === "number" && typeof usage?.completionTokens === "number"
              ? usage.promptTokens + usage.completionTokens : 0);
          const model = msg.modelId;

          // 1. Fill Chart Data (if in target month/year)
          if (
            msgDate.getMonth() === targetMonth &&
            msgDate.getFullYear() === targetYear
          ) {
            if (dailyMap.has(dateStr)) {
              const entry = dailyMap.get(dateStr)!;
              entry.tokens += tokens;
              if (model) entry.models.add(model);
            }
            selectedMonthTotal += tokens;
          }

          // 2. Calculate Totals
          if (msgDate.getFullYear() === targetYear) {
            totalTokensYear += tokens;
          }

          // Rolling stats (relative to NOW)
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
      }

      // Cloud mode: Check authentication
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const now = new Date();
      const targetYear = input.year ?? now.getFullYear();
      const targetMonth = input.month ?? now.getMonth();

      // Define Ranges
      const chartStartDate = new Date(targetYear, targetMonth, 1);
      const chartEndDate = new Date(targetYear, targetMonth + 1, 0);

      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const yearStart = new Date(targetYear, 0, 1);
      const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);

      // Query start: Min of (yearStart, oneMonthAgo) to ensure we cover both current stats and historical year
      const queryStart = new Date(
        Math.min(yearStart.getTime(), oneMonthAgo.getTime()),
      );
      // Query end: Max of (yearEnd, now)
      const queryEnd = new Date(Math.max(yearEnd.getTime(), now.getTime()));

      const { data, error } = await supabase
        .from("chat_messages")
        .select("created_at, model_id, metadata")
        .gte("created_at", queryStart.toISOString())
        .lte("created_at", queryEnd.toISOString())
        .not("metadata", "is", null);

      if (error) {
        console.error("Error fetching usage stats:", error);
        throw new Error("Failed to fetch usage stats");
      }

      // Initialize daily map for Chart (Target Month)
      const dailyMap = new Map<
        string,
        { date: string; tokens: number; models: Set<string> }
      >();

      const iterDate = new Date(chartStartDate);
      while (iterDate <= chartEndDate) {
        const dateStr = formatDate(iterDate);
        dailyMap.set(dateStr, { date: dateStr, tokens: 0, models: new Set() });
        iterDate.setDate(iterDate.getDate() + 1);
      }

      let totalTokensWeek = 0;
      let totalTokensFortnight = 0;
      let totalTokensMonth = 0; // Last 30 days
      let totalTokensYear = 0; // Selected Year
      let selectedMonthTotal = 0; // Selected Month

      data?.forEach((msg: any) => {
        const msgDate = new Date(msg.created_at);
        const dateStr = formatDate(msgDate);
        const usage = msg.metadata?.usage;
        const tokens =
          typeof usage?.totalTokens === "number" ? usage.totalTokens : 0;
        const model = msg.model_id;

        // 1. Fill Chart Data (if in target month/year)
        if (
          msgDate.getMonth() === targetMonth &&
          msgDate.getFullYear() === targetYear
        ) {
          if (dailyMap.has(dateStr)) {
            const entry = dailyMap.get(dateStr)!;
            entry.tokens += tokens;
            if (model) entry.models.add(model);
          }
          selectedMonthTotal += tokens;
        }

        // 2. Calculate Totals
        // Year Total (for the selected year)
        if (msgDate.getFullYear() === targetYear) {
          totalTokensYear += tokens;
        }

        // Rolling stats (relative to NOW)
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
          month: totalTokensMonth, // Last 30 days
          year: totalTokensYear, // Selected Year
          selectedMonth: selectedMonthTotal, // Specific to chart
        },
      };
    }),

  // Keep legacy for backward compat if needed (though we'll update frontend)
  getDailyStats: publicProcedure
    .input(z.object({ days: z.number().optional() }))
    .query(async () => {
      return {
        daily: [],
        totals: { week: 0, fortnight: 0, month: 0, year: 0 },
      };
    }),
});
