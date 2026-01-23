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
  IconTrendingUp,
  IconTrendingDown,
  IconCalendarStats,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const formatTokenCount = (num: number): string => {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}k`;
  }
  return num.toString();
};

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Totals Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TotalCard label="Last 7 Days" value={totals.week} />
        <TotalCard label="Last 15 Days" value={totals.fortnight} />
        <TotalCard label="Last 30 Days" value={totals.month} />
        <TotalCard label={`${year} Total`} value={totals.year} />
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border bg-card/50 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <IconCalendarStats className="text-muted-foreground" size={18} />
              <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
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
            <span className="text-muted-foreground uppercase tracking-wider font-medium">
              Monthly Total:
            </span>
            <span className="font-mono font-semibold text-foreground text-sm">
              {formatTokenCount(totals.selectedMonth)}
            </span>
            {/* Badge is now just a label since we don't have comparison data yet */}
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
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
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
                        : "hsl(var(--muted-foreground) / 0.3)" // Darker grey for others
                    }
                    stroke={
                      entry.tokens === maxTokens
                        ? "var(--primary)"
                        : "hsl(var(--muted-foreground) / 0.5)"
                    }
                    strokeWidth={1}
                    className={cn(
                      "transition-all duration-300",
                      entry.tokens === maxTokens
                        ? "opacity-100"
                        : "opacity-70 hover:opacity-100",
                    )}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between hover:bg-accent/5 transition-colors">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold tracking-tight">
          {formatTokenCount(value)}
        </span>
        <span className="text-[10px] text-muted-foreground">tks</span>
      </div>
    </div>
  );
}
