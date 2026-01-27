import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import {
  reasoningEffortAtom,
  chatModeAtom,
  onboardingCompletedAtom,
} from "@/lib/atoms";
import { Label } from "@/components/ui/label";
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
  IconAdjustmentsHorizontal,
  IconBrain,
  IconRocket,
  IconRefresh,
  IconRotate2,
  IconMessage,
  IconDeviceDesktop,
  IconDeviceFloppy,
} from "@tabler/icons-react";

export function AdvancedTab() {
  const [reasoningEffort, setReasoningEffort] = useAtom(reasoningEffortAtom);
  const [chatMode, setChatMode] = useAtom(chatModeAtom);
  const [, setOnboardingCompleted] = useAtom(onboardingCompletedAtom);
  const [trayEnabled, setTrayEnabled] = useState(true);
  const [quickPromptEnabled, setQuickPromptEnabled] = useState(true);
  const [autoSaveDelay, setAutoSaveDelay] = useState(15000);
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
        setAutoSaveDelay(prefs.autoSaveDelay || 15000);
      })
      .catch(() => {});

    // Subscribe to updates
    const cleanup = window.desktopApi?.preferences?.onPreferencesUpdated?.(
      (prefs) => {
        setTrayEnabled(prefs.trayEnabled);
        setQuickPromptEnabled(prefs.quickPromptEnabled);
        setAutoSaveDelay(prefs.autoSaveDelay || 15000);
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
        setAutoSaveDelay(next.autoSaveDelay || 15000);
      }
    } catch {}
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
      <div className="flex flex-col space-y-1.5 text-center sm:text-left">
        <div className="flex items-center gap-2">
          <IconAdjustmentsHorizontal size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Advanced Settings
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Fine-tune AI behavior and application system settings
        </p>
      </div>

      {/* AI Behavior Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-1">
          AI Behavior
        </h4>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">
            {/* Reasoning Effort */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <IconBrain size={16} className="text-muted-foreground" />
                  <Label className="text-sm font-medium">
                    Reasoning Effort
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Controls how much "thinking" time reasoning models (like o1)
                  use
                </p>
              </div>
              <div className="flex-shrink-0 w-32">
                <Select
                  value={reasoningEffort}
                  onValueChange={(v: any) => setReasoningEffort(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Interaction Mode */}
            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <IconRocket size={16} className="text-muted-foreground" />
                  <Label className="text-sm font-medium">
                    Agent Interaction Mode
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {chatMode === "agent"
                    ? "Autonomous: The AI executes tools automatically"
                    : "Plan First: The AI proposes a plan for your approval first"}
                </p>
              </div>
              <div className="flex-shrink-0">
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-1">
          System
        </h4>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <IconDeviceDesktop
                    size={16}
                    className="text-muted-foreground"
                  />
                  <p className="text-sm font-medium text-foreground">
                    Tray Icon
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Show or hide the system tray popover
                </p>
              </div>
              <Switch
                checked={trayEnabled}
                onCheckedChange={(checked) => {
                  setTrayEnabled(checked);
                  updatePreferences({ trayEnabled: checked });
                }}
                className="data-[state=checked]:bg-primary"
                disabled={!preferencesAvailable}
              />
            </div>

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-border/50">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <IconMessage size={16} className="text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    Quick Prompt
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enable the global quick prompt hotkey
                </p>
              </div>
              <Switch
                checked={quickPromptEnabled}
                onCheckedChange={(checked) => {
                  setQuickPromptEnabled(checked);
                  updatePreferences({ quickPromptEnabled: checked });
                }}
                className="data-[state=checked]:bg-primary"
                disabled={!preferencesAvailable}
              />
            </div>

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-border/50">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <IconDeviceFloppy
                    size={16}
                    className="text-muted-foreground"
                  />
                  <p className="text-sm font-medium text-foreground">
                    Auto-guardado
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Tiempo de espera antes de guardar automáticamente (solo si hay
                  cambios reales)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5000"
                  max="60000"
                  step="1000"
                  value={autoSaveDelay}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setAutoSaveDelay(value);
                    updatePreferences({ autoSaveDelay: value });
                  }}
                  className="w-32 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs font-mono text-muted-foreground w-16 text-right">
                  {Math.round(autoSaveDelay / 1000)}s
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <IconRotate2 size={16} className="text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    Reset Onboarding
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Re-trigger the walkthrough guide and initial setup
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleResetOnboarding}
                size="sm"
                className="h-8 text-xs"
              >
                <IconRefresh size={14} className="mr-2" />
                Reset
              </Button>
            </div>
          </div>
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
