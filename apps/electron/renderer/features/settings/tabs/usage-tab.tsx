import { TokenUsageChart } from "../components/token-usage-chart";
import { IconChartBar } from "@tabler/icons-react";

export function UsageTab() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <IconChartBar size={24} className="text-primary" />
          <h3 className="text-lg font-semibold">Token Usage</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Track your AI token consumption and model usage over time.
        </p>
      </div>

      <TokenUsageChart />
    </div>
  );
}
