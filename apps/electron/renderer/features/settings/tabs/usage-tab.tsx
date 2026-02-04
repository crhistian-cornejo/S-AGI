import { TokenUsageChart } from "../components/token-usage-chart";
import { IconChartBar } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export function UsageTab() {
  // Use tRPC query to get the correct local mode status from main process
  // This checks the active account and storage mode correctly
  const { data: isLocal = false } = trpc.auth.isLocalMode.useQuery();

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <IconChartBar size={24} className="text-primary" />
          <h3 className="text-lg font-semibold">Token Usage</h3>
          <Badge
            className={cn(
              "px-2 py-0.5 h-5 text-[10px] font-medium",
              isLocal
                ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                : "bg-green-500/10 text-green-500 border-green-500/20"
            )}
          >
            {isLocal ? "LOCAL USAGE" : "CLOUD USAGE"}
          </Badge>
        </div>
        <p className="text-sm text-foreground/70">
          Track your AI token consumption and model usage over time.
        </p>
      </div>

      <TokenUsageChart />
    </div>
  );
}
