import { useAtom } from "jotai";
import {
  glmOcrEnabledAtom,
  glmOcrAutoDetectAtom,
  glmOcrAutoProcessAtom,
} from "@/lib/atoms";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  IconFileText,
  IconScan,
  IconSparkles,
  IconRobot,
  IconAlertCircle,
} from "@tabler/icons-react";
import { trpc } from "@/lib/trpc";

export function PdfSettingsTab() {
  const [ocrEnabled, setOcrEnabled] = useAtom(glmOcrEnabledAtom);
  const [autoDetect, setAutoDetect] = useAtom(glmOcrAutoDetectAtom);
  const [autoProcess, setAutoProcess] = useAtom(glmOcrAutoProcessAtom);

  // Check if Z.AI key is configured
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();
  const hasZaiKey = keyStatus?.hasZai ?? false;

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col space-y-1.5">
        <div className="flex items-center gap-2">
          <IconFileText size={18} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-foreground">PDF & OCR</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure PDF extraction and GLM-OCR settings
        </p>
      </div>

      {/* Z.AI Key Warning */}
      {!hasZaiKey && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/50 bg-amber-500/10">
          <IconAlertCircle size={16} className="text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Configure your Z.AI API key in{" "}
            <span className="font-medium">API Keys</span> tab to use GLM-OCR
          </p>
        </div>
      )}

      {/* GLM-OCR Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            GLM-OCR (Z.AI)
          </h4>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Beta
          </Badge>
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/20 divide-y divide-border/50">
          {/* Enable GLM-OCR */}
          <SettingsRow
            icon={<IconScan size={16} className="text-muted-foreground" />}
            title="Enable GLM-OCR"
            description="Use Z.AI for advanced extraction of tables, formulas, and scanned PDFs"
            action={
              <Switch
                checked={ocrEnabled}
                onCheckedChange={setOcrEnabled}
                className="data-[state=checked]:bg-primary"
                disabled={!hasZaiKey}
              />
            }
          />

          {/* Auto-detect */}
          <SettingsRow
            icon={<IconSparkles size={16} className="text-muted-foreground" />}
            title="Auto-detect PDFs"
            description="Suggest OCR when a PDF contains tables, formulas, or is scanned"
            action={
              <Switch
                checked={autoDetect}
                onCheckedChange={setAutoDetect}
                className="data-[state=checked]:bg-primary"
              />
            }
          />

          {/* Auto-process */}
          <SettingsRow
            icon={<IconRobot size={16} className="text-muted-foreground" />}
            title="Auto-process"
            description="Automatically apply OCR without asking (when high confidence)"
            action={
              <Switch
                checked={autoProcess}
                onCheckedChange={setAutoProcess}
                className="data-[state=checked]:bg-primary"
                disabled={!ocrEnabled}
              />
            }
          />
        </div>
      </div>

      {/* Info Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          About GLM-OCR
        </h4>

        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            GLM-OCR is a state-of-the-art OCR model from Z.AI with 0.9B parameters that excels at:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1.5 ml-4">
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-green-500" />
              <span>Scanned documents and images</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-green-500" />
              <span>Complex tables → HTML format</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-green-500" />
              <span>Mathematical formulas → LaTeX</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-green-500" />
              <span>Handwritten text recognition</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-green-500" />
              <span>Multi-language support (EN, ES, ZH, etc.)</span>
            </li>
          </ul>
          <p className="text-[10px] text-muted-foreground/70 pt-2">
            Pricing: $0.03 per million tokens
          </p>
        </div>
      </div>

      {/* Status Footer */}
      <div className="pt-2 text-center">
        <p className="text-[10px] text-muted-foreground font-mono">
          {hasZaiKey ? (
            <span className="text-green-500">Z.AI API Key configured</span>
          ) : (
            <span className="text-amber-500">Z.AI API Key not configured</span>
          )}
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
