import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import {
  reasoningEffortAtom,
  chatModeAtom,
  onboardingCompletedAtom,
} from "@/lib/atoms";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  IconBrain,
  IconRocket,
  IconRefresh,
  IconRotate2,
  IconMessage,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconSettings,
} from "@tabler/icons-react";

export function AdvancedTab() {
  const [reasoningEffort, setReasoningEffort] = useAtom(reasoningEffortAtom);
  const [chatMode, setChatMode] = useAtom(chatModeAtom);
  const [, setOnboardingCompleted] = useAtom(onboardingCompletedAtom);
  const [trayEnabled, setTrayEnabled] = useState(true);
  const [quickPromptEnabled, setQuickPromptEnabled] = useState(true);
  const [autoSaveDelay, setAutoSaveDelay] = useState(300000);
  const preferencesAvailable =
    typeof window !== "undefined" && !!window.desktopApi?.preferences;

  const handleResetOnboarding = () => {
    setOnboardingCompleted(false);
    toast.success(
      "Onboarding has been reset. It will appear on next launch or refresh.",
    );
  };

  useEffect(() => {
    if (!preferencesAvailable) return;

    // Initial load
    window.desktopApi?.preferences
      ?.get()
      .then((prefs) => {
        setTrayEnabled(prefs.trayEnabled);
        setQuickPromptEnabled(prefs.quickPromptEnabled);
        setAutoSaveDelay(prefs.autoSaveDelay || 300000);
      })
      .catch(() => {});

    // Subscribe to updates
    const cleanup = window.desktopApi?.preferences?.onPreferencesUpdated?.(
      (prefs) => {
        setTrayEnabled(prefs.trayEnabled);
        setQuickPromptEnabled(prefs.quickPromptEnabled);
        setAutoSaveDelay(prefs.autoSaveDelay || 300000);
      },
    );

    return () => {
      cleanup?.();
    };
  }, [preferencesAvailable]);

  const updatePreferences = async (patch: {
    trayEnabled?: boolean;
    quickPromptEnabled?: boolean;
    autoSaveDelay?: number;
  }) => {
    if (!preferencesAvailable) return;
    try {
      const next = await window.desktopApi?.preferences?.set(patch);
      if (next) {
        setTrayEnabled(next.trayEnabled);
        setQuickPromptEnabled(next.quickPromptEnabled);
        setAutoSaveDelay(next.autoSaveDelay || 300000);
      }
    } catch {}
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col space-y-1.5">
        <div className="flex items-center gap-2">
          <IconSettings size={18} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">Advanced Settings</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure AI behavior and system preferences
        </p>
      </div>

      {/* AI Behavior Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          AI Behavior
        </h4>

        <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
          {/* Reasoning Effort */}
          <SettingsRow
            icon={<IconBrain size={16} className="text-muted-foreground" />}
            title="Reasoning Effort"
            description="Controls how much thinking time reasoning models (like o1) use"
            action={
              <Select
                value={reasoningEffort}
                onValueChange={(v: any) => setReasoningEffort(v)}
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          {/* Interaction Mode */}
          <SettingsRow
            icon={<IconRocket size={16} className="text-muted-foreground" />}
            title="Agent Interaction Mode"
            description={
              chatMode === "agent"
                ? "Autonomous: The AI executes tools automatically"
                : "Plan First: The AI proposes a plan for your approval first"
            }
            action={
              <div className="flex items-center bg-muted rounded-md p-1">
                <button
                  type="button"
                  onClick={() => setChatMode("agent")}
                  className={`px-3 py-1 text-xs rounded-sm transition-all ${
                    chatMode === "agent"
                      ? "bg-background shadow-sm text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Agent
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode("plan")}
                  className={`px-3 py-1 text-xs rounded-sm transition-all ${
                    chatMode === "plan"
                      ? "bg-background shadow-sm text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Plan
                </button>
              </div>
            }
          />
        </div>
      </div>

      {/* System Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          System
        </h4>

        <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
          {/* Tray Icon */}
          <SettingsRow
            icon={<IconDeviceDesktop size={16} className="text-muted-foreground" />}
            title="Tray Icon"
            description="Show or hide the system tray popover"
            action={
              <Switch
                checked={trayEnabled}
                onCheckedChange={(checked) => {
                  setTrayEnabled(checked);
                  updatePreferences({ trayEnabled: checked });
                }}
                className="data-[state=checked]:bg-primary"
                disabled={!preferencesAvailable}
              />
            }
          />

          {/* Quick Prompt */}
          <SettingsRow
            icon={<IconMessage size={16} className="text-muted-foreground" />}
            title="Quick Prompt"
            description="Enable the global quick prompt hotkey"
            action={
              <Switch
                checked={quickPromptEnabled}
                onCheckedChange={(checked) => {
                  setQuickPromptEnabled(checked);
                  updatePreferences({ quickPromptEnabled: checked });
                }}
                className="data-[state=checked]:bg-primary"
                disabled={!preferencesAvailable}
              />
            }
          />

          {/* Auto-save */}
          <SettingsRow
            icon={<IconDeviceFloppy size={16} className="text-muted-foreground" />}
            title="Auto-save Delay"
            description="Wait time before saving automatically (only if there are changes)"
            action={
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="30000"
                  max="600000"
                  step="30000"
                  value={autoSaveDelay}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setAutoSaveDelay(value);
                    updatePreferences({ autoSaveDelay: value });
                  }}
                  className="w-24 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                  {autoSaveDelay >= 60000
                    ? `${Math.round(autoSaveDelay / 60000)}m`
                    : `${Math.round(autoSaveDelay / 1000)}s`}
                </span>
              </div>
            }
          />

          {/* Reset Onboarding */}
          <SettingsRow
            icon={<IconRotate2 size={16} className="text-muted-foreground" />}
            title="Reset Onboarding"
            description="Re-trigger the walkthrough guide and initial setup"
            action={
              <Button
                variant="outline"
                onClick={handleResetOnboarding}
                size="sm"
                className="h-8 w-24 text-xs"
              >
                <IconRefresh size={14} className="mr-1.5" />
                Reset
              </Button>
            }
          />
        </div>
      </div>

      {/* App Version Info */}
      <div className="pt-2 text-center">
        <p className="text-[10px] text-muted-foreground font-mono">
          S-AGI v1.0.0 • Production Build
        </p>
      </div>
    </div>
  );
}

/** Reusable row component for settings */
function SettingsRow({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-sm font-medium text-foreground">{title}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 ml-6">{description}</p>
      </div>
      {action}
    </div>
  );
}
