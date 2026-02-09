import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  IconCalendarStats,
  IconChevronLeft,
  IconChevronRight,
  IconCpu,
  IconList,
  IconExternalLink,
  IconClock,
  IconCoin,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSetAtom } from "jotai";
import {
  selectedChatIdAtom,
  activeTabAtom,
  settingsModalOpenAtom,
} from "@/lib/atoms";

const formatTokenCount = (num: number): string => {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}k`;
  }
  return num.toString();
};

const formatCost = (cost: number | null | undefined): string => {
  if (cost == null || cost === 0) return "-";
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
};

const formatDuration = (ms: number | null | undefined): string => {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatRelativeTime = (unixTimestamp: number): string => {
  const now = Date.now() / 1000;
  const diff = now - unixTimestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixTimestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

// Color palette for models
const MODEL_COLORS = [
  "hsl(var(--primary))",
  "hsl(220, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(280, 60%, 55%)",
  "hsl(30, 80%, 55%)",
  "hsl(350, 65%, 50%)",
  "hsl(180, 55%, 45%)",
  "hsl(60, 70%, 45%)",
];

export function TokenUsageChart() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();

  const {
    data: usageData,
    isLoading,
    isError,
    error,
  } = trpc.usage.getStats.useQuery({ month, year });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    const nextMonth = new Date(year, month + 1, 1);
    if (nextMonth <= new Date()) {
      setCurrentDate(nextMonth);
    }
  };

  const isCurrentMonth =
    new Date().getMonth() === month && new Date().getFullYear() === year;

  const formattedData = useMemo(() => {
    if (!usageData?.daily) return [];
    return usageData.daily.map((d) => ({
      ...d,
      // Format date for display (e.g. "JAN 23")
      displayDate: new Date(d.date)
        .toLocaleDateString("en-US", { month: "short", day: "numeric" })
        .toUpperCase(),
    }));
  }, [usageData]);

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive text-sm flex items-center gap-3">
        <div className="flex-1">
          <p className="font-semibold">Unable to load usage statistics</p>
          <p className="opacity-80 mt-1">
            {error?.message || "Unknown error occurred"}
          </p>
          <p className="text-xs mt-2 text-muted-foreground bg-background/50 p-2 rounded inline-block">
            Tip: If you just updated the app, please restart it completely to
            apply backend changes.
          </p>
        </div>
      </div>
    );
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover/90 backdrop-blur-sm border border-border px-3 py-2 rounded-lg shadow-xl text-xs">
          <p className="font-semibold mb-1 text-popover-foreground">{label}</p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Tokens:</span>
            <span className="font-mono font-medium text-primary">
              {data.tokens.toLocaleString()}
            </span>
          </div>
          {data.models && data.models.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">
                Models
              </p>
              <div className="flex flex-wrap gap-1">
                {data.models.map((m: string) => (
                  <span
                    key={m}
                    className="px-1.5 py-0.5 rounded-sm bg-secondary text-[10px] text-secondary-foreground"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-24 w-1/4 rounded-xl" />
          <Skeleton className="h-24 w-1/4 rounded-xl" />
          <Skeleton className="h-24 w-1/4 rounded-xl" />
          <Skeleton className="h-24 w-1/4 rounded-xl" />
        </div>
        <Skeleton className="h-[200px] w-full rounded-xl" />
      </div>
    );
  }

  const totals = usageData?.totals || {
    week: 0,
    fortnight: 0,
    month: 0, // Global last 30 days
    year: 0, // Selected Year
    selectedMonth: 0, // Selected Month
  };

  // Find max value to highlight the highest bar
  const maxTokens = Math.max(...(formattedData.map((d) => d.tokens) || [0]));

  // Date range for model breakdown (selected month)
  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDay = new Date(year, month + 1, 0).getDate();
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Totals Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TotalCard label="Last 7 Days" value={totals.week} />
        <TotalCard label="Last 15 Days" value={totals.fortnight} />
        <TotalCard label="Last 30 Days" value={totals.month} />
        <TotalCard label={`${year} Total`} value={totals.year} />
      </div>

      {/* Daily Chart */}
      <div className="rounded-xl border border-border bg-card/50 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <IconCalendarStats className="text-foreground/70" size={18} />
              <h3 className="text-sm font-medium tracking-wide text-foreground/70 uppercase">
                {currentDate
                  .toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })
                  .toUpperCase()}
              </h3>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1 border border-border rounded-md bg-background/50 p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handlePrevMonth}
              >
                <IconChevronLeft size={12} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleNextMonth}
                disabled={isCurrentMonth}
              >
                <IconChevronRight size={12} />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground/70 uppercase tracking-wider font-medium">
              Monthly Total:
            </span>
            <span className="font-mono font-semibold text-foreground text-sm">
              {formatTokenCount(totals.selectedMonth)}
            </span>
            <Badge className="bg-primary/10 text-primary border-primary/20 px-1.5 py-0 h-5">
              TOKENS
            </Badge>
          </div>
        </div>

        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={formattedData}
              margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
            >
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "var(--muted)", opacity: 0.2 }}
              />
              <XAxis
                dataKey="displayDate"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--foreground) / 0.7)", fontSize: 10 }}
                dy={10}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <Bar dataKey="tokens" radius={[2, 2, 0, 0]} maxBarSize={40}>
                {formattedData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.tokens === maxTokens
                        ? "var(--primary)" // Orange/Accent for max
                        : "hsl(var(--foreground) / 0.35)" // Clearer bars in dark mode
                    }
                    stroke={
                      entry.tokens === maxTokens
                        ? "var(--primary)"
                        : "hsl(var(--foreground) / 0.55)"
                    }
                    strokeWidth={1}
                    className={cn(
                      "transition-all duration-300",
                      entry.tokens === maxTokens
                        ? "opacity-100"
                        : "opacity-70 hover:opacity-100"
                    )}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Breakdown */}
      <ModelBreakdown startDate={startDate} endDate={endDate} />

      {/* Recent Logs */}
      <RecentLogsTable />
    </div>
  );
}

// ─── Model Breakdown Section ────────────────────────────────────────────────

function ModelBreakdown({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const { data: modelData, isLoading } = trpc.usage.getByModelDaily.useQuery({
    startDate,
    endDate,
  });

  // Aggregate per-model totals
  const modelTotals = useMemo(() => {
    if (!modelData || modelData.length === 0) return [];

    const map = new Map<
      string,
      {
        model_id: string;
        provider: string;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        request_count: number;
      }
    >();

    for (const row of modelData) {
      const key = row.model_id || "unknown";
      const existing = map.get(key);
      if (existing) {
        existing.prompt_tokens += row.prompt_tokens;
        existing.completion_tokens += row.completion_tokens;
        existing.total_tokens += row.total_tokens;
        existing.request_count += row.request_count;
      } else {
        map.set(key, {
          model_id: row.model_id || "unknown",
          provider: row.provider,
          prompt_tokens: row.prompt_tokens,
          completion_tokens: row.completion_tokens,
          total_tokens: row.total_tokens,
          request_count: row.request_count,
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => b.total_tokens - a.total_tokens
    );
  }, [modelData]);

  const maxModelTokens = modelTotals[0]?.total_tokens || 1;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-6 shadow-sm space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    );
  }

  if (modelTotals.length === 0) {
    return null; // Don't show section if no data
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <IconCpu className="text-foreground/70" size={18} />
        <h3 className="text-sm font-medium tracking-wide text-foreground/70 uppercase">
          Model Breakdown
        </h3>
        <Badge className="bg-foreground/5 text-foreground/60 border-foreground/10 px-1.5 py-0 h-5 text-[10px]">
          {modelTotals.length} {modelTotals.length === 1 ? "MODEL" : "MODELS"}
        </Badge>
      </div>

      <div className="space-y-3">
        {modelTotals.map((model, i) => {
          const pct = (model.total_tokens / maxModelTokens) * 100;
          const color = MODEL_COLORS[i % MODEL_COLORS.length];
          // Short display name: remove date suffixes from model IDs
          const displayName = model.model_id
            .replace(/-\d{8}$/, "")
            .replace(/^(claude-|gpt-)/, "$1");

          return (
            <div key={model.model_id} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-medium truncate">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-foreground/50 shrink-0">
                    {model.provider}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <span className="text-foreground/50">
                    {model.request_count}{" "}
                    {model.request_count === 1 ? "req" : "reqs"}
                  </span>
                  <span className="font-mono font-semibold">
                    {formatTokenCount(model.total_tokens)}
                  </span>
                </div>
              </div>
              <div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    backgroundColor: color,
                    opacity: 0.8,
                  }}
                />
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-foreground/40">
                <span>
                  In: {formatTokenCount(model.prompt_tokens)}
                </span>
                <span>
                  Out: {formatTokenCount(model.completion_tokens)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recent Logs Table ──────────────────────────────────────────────────────

function RecentLogsTable() {
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  const { data: logs, isLoading } = trpc.usage.getRecentLogs.useQuery({
    limit,
    offset,
  });

  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setSettingsOpen = useSetAtom(settingsModalOpenAtom);

  const navigateToChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setActiveTab("chat");
    setSettingsOpen(false);
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-6 shadow-sm space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return null; // Don't show section if no logs
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <IconList className="text-foreground/70" size={18} />
          <h3 className="text-sm font-medium tracking-wide text-foreground/70 uppercase">
            Recent Requests
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
          >
            Prev
          </Button>
          <span className="text-[10px] text-foreground/50 px-2">
            {offset + 1}-{offset + logs.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setOffset(offset + limit)}
            disabled={logs.length < limit}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 px-2 text-[10px] text-foreground/50 uppercase tracking-wider font-medium">
                Time
              </th>
              <th className="text-left py-2 px-2 text-[10px] text-foreground/50 uppercase tracking-wider font-medium">
                Provider
              </th>
              <th className="text-left py-2 px-2 text-[10px] text-foreground/50 uppercase tracking-wider font-medium">
                Model
              </th>
              <th className="text-right py-2 px-2 text-[10px] text-foreground/50 uppercase tracking-wider font-medium">
                Tokens
              </th>
              <th className="text-right py-2 px-2 text-[10px] text-foreground/50 uppercase tracking-wider font-medium">
                <IconCoin size={12} className="inline mr-0.5" />
                Cost
              </th>
              <th className="text-right py-2 px-2 text-[10px] text-foreground/50 uppercase tracking-wider font-medium">
                <IconClock size={12} className="inline mr-0.5" />
                Time
              </th>
              <th className="text-center py-2 px-2 text-[10px] text-foreground/50 uppercase tracking-wider font-medium">
                Chat
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log: any) => (
              <tr
                key={log.id}
                className="border-b border-border/20 hover:bg-foreground/[0.02] transition-colors"
              >
                <td className="py-2 px-2 text-foreground/60">
                  {formatRelativeTime(log.created_at)}
                </td>
                <td className="py-2 px-2">
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 h-4 text-[9px] font-normal"
                  >
                    {log.provider}
                  </Badge>
                </td>
                <td className="py-2 px-2 font-medium truncate max-w-[160px]">
                  {(log.model_id || "unknown")
                    .replace(/-\d{8}$/, "")}
                </td>
                <td className="py-2 px-2 text-right font-mono">
                  <span className="text-foreground/50">
                    {formatTokenCount(log.prompt_tokens)}
                  </span>
                  <span className="text-foreground/30 mx-0.5">/</span>
                  <span className="text-foreground/70">
                    {formatTokenCount(log.completion_tokens)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right font-mono text-foreground/60">
                  {formatCost(log.cost_estimate)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-foreground/60">
                  {formatDuration(log.request_duration_ms)}
                </td>
                <td className="py-2 px-2 text-center">
                  {log.chat_id ? (
                    <button
                      onClick={() => navigateToChat(log.chat_id)}
                      className="inline-flex items-center gap-0.5 text-primary/70 hover:text-primary transition-colors"
                      title="Go to chat"
                    >
                      <IconExternalLink size={12} />
                    </button>
                  ) : (
                    <span className="text-foreground/20">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between hover:bg-accent/5 transition-colors">
      <span className="text-[10px] uppercase tracking-wider text-foreground/70 font-medium">
        {label}
      </span>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold tracking-tight">
          {formatTokenCount(value)}
        </span>
        <span className="text-[10px] text-foreground/60">tks</span>
      </div>
    </div>
  );
}
