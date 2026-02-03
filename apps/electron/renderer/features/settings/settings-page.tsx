import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { IconArrowLeft } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import {
  activeTabAtom,
  settingsActiveTabAtom,
  settingsReturnTabAtom,
} from "@/lib/atoms";
import {
  renderSettingsTabContent,
  SETTINGS_TABS,
  type SettingsTabConfig,
} from "./settings-tab-config";

interface TabButtonProps {
  tab: SettingsTabConfig;
  isActive: boolean;
  onClick: () => void;
}

function SettingsTabButton({ tab, isActive, onClick }: TabButtonProps) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center whitespace-nowrap ring-offset-background transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-40 cursor-pointer shadow-none",
        "h-9 w-full justify-start gap-2 text-left px-3 py-2 rounded-lg text-sm",
        isActive
          ? "bg-foreground/10 text-foreground font-medium hover:bg-foreground/15"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground font-medium",
      )}
    >
      <Icon size={16} className={cn(isActive ? "opacity-100" : "opacity-50")} />
      {tab.label}
    </button>
  );
}

export function SettingsPage() {
  const [activeSettingsTab, setActiveSettingsTab] =
    useAtom(settingsActiveTabAtom);
  const returnTab = useAtomValue(settingsReturnTabAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="w-72 shrink-0 border-r border-border bg-sidebar pt-9 pb-6">
        <div className="px-4">
          <button
            type="button"
            onClick={() => setActiveTab(returnTab)}
            className={cn(
              "inline-flex items-center gap-2 text-sm font-medium",
              "text-muted-foreground hover:text-foreground transition-colors",
              "rounded-lg px-2 py-1.5 hover:bg-foreground/5 w-full justify-start",
            )}
          >
            <IconArrowLeft size={16} className="opacity-70" />
            Back to app
          </button>

          <div className="mt-6 space-y-1 px-1">
            {SETTINGS_TABS.map((tab) => (
              <SettingsTabButton
                key={tab.id}
                tab={tab}
                isActive={activeSettingsTab === tab.id}
                onClick={() => setActiveSettingsTab(tab.id)}
              />
            ))}
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-hidden pt-9">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-[980px] px-10 py-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSettingsTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {renderSettingsTabContent(activeSettingsTab)}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
