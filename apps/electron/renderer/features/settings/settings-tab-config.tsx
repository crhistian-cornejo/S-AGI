import {
  IconAdjustmentsHorizontal,
  IconBug,
  IconChartBar,
  IconKey,
  IconKeyboard,
  IconPalette,
  IconUser,
} from "@tabler/icons-react";
import type { SettingsTab } from "@/lib/atoms";
import {
  AccountTab,
  AdvancedTab,
  ApiKeysTab,
  AppearanceTab,
  DebugTab,
} from "./tabs";
import { ShortcutsTab } from "./tabs/shortcuts-tab";
import { UsageTab } from "./tabs/usage-tab";

// Check if we're in development mode
const isDevelopment = import.meta.env.MODE === "development";

export interface SettingsTabConfig {
  id: SettingsTab;
  label: string;
  icon: typeof IconUser;
  description: string;
}

export const SETTINGS_TABS: SettingsTabConfig[] = [
  {
    id: "account",
    label: "Account",
    icon: IconUser,
    description: "Profile and connected accounts",
  },
  {
    id: "api-keys",
    label: "API Keys",
    icon: IconKey,
    description: "Configure AI provider API keys",
  },
  {
    id: "usage",
    label: "Usage",
    icon: IconChartBar,
    description: "View token usage statistics",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: IconPalette,
    description: "Theme settings",
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: IconAdjustmentsHorizontal,
    description: "Advanced AI behavior and system settings",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: IconKeyboard,
    description: "Configure keyboard shortcuts",
  },
  ...(isDevelopment
    ? [
        {
          id: "debug" as SettingsTab,
          label: "Debug",
          icon: IconBug,
          description: "Test and debug tools",
        },
      ]
    : []),
];

export function renderSettingsTabContent(activeTab: SettingsTab) {
  switch (activeTab) {
    case "account":
      return <AccountTab />;
    case "api-keys":
      return <ApiKeysTab />;
    case "usage":
      return <UsageTab />;
    case "appearance":
      return <AppearanceTab />;
    case "advanced":
      return <AdvancedTab />;
    case "shortcuts":
      return <ShortcutsTab />;
    case "debug":
      return isDevelopment ? <DebugTab /> : null;
    default:
      return <AccountTab />;
  }
}
