import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useAtom } from "jotai";
import {
  IconBolt,
  IconBrain,
  IconCode,
  IconEye,
  IconFileSearch,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconWorld,
} from "@tabler/icons-react";
import type { AIProvider, ModelDefinition } from "@s-agi/core/types/ai";
import { getModelById } from "@s-agi/core/types/ai";
import { favoriteModelIdsAtom } from "@/lib/atoms";
import { ModelIcon } from "@/components/icons/model-icons";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ProviderScope = "favorites" | AIProvider;

type ApiKeyStatus = {
  hasOpenAI?: boolean;
  hasZai?: boolean;
  hasCerebras?: boolean;
  hasGroq?: boolean;
  hasOllama?: boolean;
  hasChatGPTPlus?: boolean;
  hasClaudeCode?: boolean;
};

type ModelGroups = Partial<Record<AIProvider, ModelDefinition[]>>;

interface ModelSelectorProps {
  selectedModelId: string;
  allModelsGrouped: ModelGroups;
  ollamaModels: ModelDefinition[];
  ollamaRunning: boolean;
  isZenMode?: boolean;
  keyStatus?: ApiKeyStatus;
  onSelectModel: (modelId: string) => void;
}

interface ProviderMeta {
  label: string;
  tier: "Subscription" | "Pay per use" | "Local";
  monoIcon?: boolean;
}

const PROVIDER_ORDER: AIProvider[] = [
  "chatgpt-plus",
  "openai",
  "claude",
  "zai",
  "cerebras",
  "groq",
  "ollama",
];

const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  "chatgpt-plus": { label: "ChatGPT Plus", tier: "Subscription" },
  openai: { label: "OpenAI API", tier: "Pay per use" },
  claude: { label: "Claude Pro/Max", tier: "Subscription" },
  zai: { label: "Z.AI", tier: "Subscription" },
  cerebras: { label: "Cerebras", tier: "Pay per use" },
  groq: { label: "Groq", tier: "Pay per use", monoIcon: true },
  ollama: { label: "Ollama", tier: "Local" },
};

function formatContextWindow(tokens?: number) {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return `${tokens} ctx`;
}

function isProviderEnabled(provider: AIProvider, keyStatus?: ApiKeyStatus) {
  switch (provider) {
    case "chatgpt-plus":
      return !!keyStatus?.hasChatGPTPlus;
    case "openai":
      return !!keyStatus?.hasOpenAI;
    case "claude":
      return !!keyStatus?.hasClaudeCode;
    case "zai":
      return !!keyStatus?.hasZai;
    case "cerebras":
      return !!keyStatus?.hasCerebras;
    case "groq":
      return !!keyStatus?.hasGroq;
    case "ollama":
      return keyStatus?.hasOllama !== false;
    default:
      return false;
  }
}

function ModelCapabilityPills({ model, compact = false }: { model: ModelDefinition; compact?: boolean }) {
  const capabilities = [
    model.supportsReasoning
      ? { key: "reasoning", label: "Reasoning", icon: IconBrain }
      : null,
    model.supportsImages ? { key: "vision", label: "Vision", icon: IconEye } : null,
    model.supportsNativeWebSearch || model.supportsServerWebSearch
      ? { key: "web", label: "Web", icon: IconWorld }
      : null,
    model.supportsCodeInterpreter
      ? { key: "code", label: "Code", icon: IconCode }
      : null,
    model.supportsFileSearch ? { key: "files", label: "Files", icon: IconFileSearch } : null,
    model.supportsTools ? { key: "tools", label: "Tools", icon: IconBolt } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; icon: ComponentType<{ size?: number }> }>;

  if (!capabilities.length) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {capabilities.map(({ key, label, icon: Icon }) => (
        <span
          key={key}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/35 text-muted-foreground",
            compact ? "px-1.5 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]",
          )}
        >
          <Icon size={compact ? 9 : 10} />
          {label}
        </span>
      ))}
    </div>
  );
}

interface ModelRowProps {
  model: ModelDefinition;
  selectedModelId: string;
  favoriteSet: Set<string>;
  compact?: boolean;
  onSelectModel: (modelId: string) => void;
  onToggleFavorite: (modelId: string) => void;
}

function ModelRow({
  model,
  selectedModelId,
  favoriteSet,
  compact = false,
  onSelectModel,
  onToggleFavorite,
}: ModelRowProps) {
  const isSelected = model.id === selectedModelId;
  const isFavorite = favoriteSet.has(model.id);
  const context = formatContextWindow(model.contextWindow);

  return (
    <div
      className={cn(
        "group flex items-start gap-1 rounded-xl border transition-colors",
        compact ? "p-0.5" : "p-1",
        isSelected
          ? "border-primary/50 bg-primary/10"
          : "border-transparent bg-muted/20 hover:bg-muted/45",
      )}
    >
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-start rounded-lg text-left",
          compact ? "gap-2 px-1.5 py-1.5" : "gap-2.5 px-2 py-2",
        )}
        onClick={() => onSelectModel(model.id)}
      >
        <ModelIcon
          provider={model.provider}
          size={compact ? 14 : 16}
          mono={model.provider === "groq"}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-semibold",
                compact && "text-[13px]",
                isSelected ? "text-foreground" : "text-foreground/90",
              )}
            >
              {model.name}
            </span>
            {model.includedInSubscription && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-400">
                Included
              </span>
            )}
            {context && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {context}
              </span>
            )}
          </div>
          <p className={cn("mt-0.5 truncate text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {model.description || "General purpose model"}
          </p>
          <ModelCapabilityPills model={model} compact={compact} />
        </div>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "mt-1.5 mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
              compact && "h-6 w-6 mt-1 mr-0.5",
              isFavorite
                ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                : "border-border/60 bg-background/50 text-muted-foreground hover:bg-muted/60",
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFavorite(model.id);
            }}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? <IconStarFilled size={compact ? 12 : 14} /> : <IconStar size={compact ? 12 : 14} />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {isFavorite ? "Remove from favorites" : "Add to favorites"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export const ModelSelector = memo(function ModelSelector({
  selectedModelId,
  allModelsGrouped,
  ollamaModels,
  ollamaRunning,
  isZenMode = false,
  keyStatus,
  onSelectModel,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ProviderScope>("favorites");
  const [query, setQuery] = useState("");
  const [favoriteModelIds, setFavoriteModelIds] = useAtom(favoriteModelIdsAtom);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentModel =
    getModelById(selectedModelId) || ollamaModels.find((model) => model.id === selectedModelId);

  const providerModels = useMemo(() => {
    return {
      openai: allModelsGrouped.openai || [],
      "chatgpt-plus": allModelsGrouped["chatgpt-plus"] || [],
      zai: allModelsGrouped.zai || [],
      claude: allModelsGrouped.claude || [],
      cerebras: allModelsGrouped.cerebras || [],
      groq: allModelsGrouped.groq || [],
      ollama: ollamaModels,
    } as Record<AIProvider, ModelDefinition[]>;
  }, [allModelsGrouped, ollamaModels]);

  const availableProviders = useMemo(() => {
    return PROVIDER_ORDER.filter((provider) => {
      if (!isProviderEnabled(provider, keyStatus)) return false;
      if (provider === "ollama") return true;
      return providerModels[provider].length > 0;
    });
  }, [keyStatus, providerModels]);

  useEffect(() => {
    if (scope === "favorites") return;
    if (!availableProviders.includes(scope)) {
      setScope("favorites");
    }
  }, [scope, availableProviders]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const allAvailableModels = useMemo(() => {
    return PROVIDER_ORDER.flatMap((provider) => {
      if (!availableProviders.includes(provider)) return [];
      return providerModels[provider];
    });
  }, [availableProviders, providerModels]);

  const favoriteSet = useMemo(() => new Set(favoriteModelIds), [favoriteModelIds]);

  const filterModels = useCallback(
    (models: ModelDefinition[]) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return models;
      return models.filter((model) => {
        return (
          model.name.toLowerCase().includes(normalized) ||
          model.id.toLowerCase().includes(normalized) ||
          (model.description || "").toLowerCase().includes(normalized) ||
          PROVIDER_META[model.provider].label.toLowerCase().includes(normalized)
        );
      });
    },
    [query],
  );

  const favoriteModels = useMemo(() => {
    const models = allAvailableModels.filter((model) => favoriteSet.has(model.id));
    return filterModels(models);
  }, [allAvailableModels, favoriteSet, filterModels]);

  const scopedModels = useMemo(() => {
    if (scope === "favorites") return [];
    return filterModels(providerModels[scope] || []);
  }, [scope, providerModels, filterModels]);

  const handleToggleFavorite = useCallback(
    (modelId: string) => {
      setFavoriteModelIds((prev) => {
        if (prev.includes(modelId)) {
          return prev.filter((id) => id !== modelId);
        }
        return [...prev, modelId];
      });
    },
    [setFavoriteModelIds],
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      onSelectModel(modelId);
      setOpen(false);
    },
    [onSelectModel],
  );

  const triggerMaxWidthClass = isZenMode ? "max-w-[150px]" : "max-w-[160px]";
  const popoverWidthClass = isZenMode ? "w-[min(86vw,420px)]" : "w-[min(88vw,440px)]";
  const panelHeightClass = isZenMode ? "h-[390px]" : "h-[405px]";
  const asideWidthClass = isZenMode ? "w-11" : "w-12";
  const sideButtonClass = isZenMode ? "h-8 w-8" : "h-9 w-9";
  const providerIconSize = isZenMode ? 15 : 17;
  const searchInputClass = isZenMode
    ? "h-8 rounded-lg border-border/60 bg-background/70 pl-8 text-xs"
    : "h-9 rounded-lg border-border/60 bg-background/70 pl-8 text-sm";
  const scrollHeightClass = isZenMode ? "h-[330px]" : "h-[345px]";

  return (
    <TooltipProvider delayDuration={180}>
      <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-8 w-auto rounded-xl px-2.5 text-[11px] font-semibold tracking-tight hover:bg-accent/50",
            triggerMaxWidthClass,
          )}
          title={currentModel?.description}
        >
          <span className="flex items-center gap-1.5">
            <ModelIcon
              provider={currentModel?.provider || "openai"}
              size={14}
              className="shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 truncate">{currentModel?.name || selectedModelId}</span>
            {favoriteSet.has(selectedModelId) && (
              <IconStarFilled size={12} className="shrink-0 text-yellow-400" />
            )}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className={cn(
          "border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-xl",
          popoverWidthClass,
        )}
        align="start"
        sideOffset={8}
      >
        <div className={cn("flex min-h-0", panelHeightClass)}>
          <aside className={cn("flex shrink-0 flex-col items-center gap-1 border-r border-border/60 bg-muted/20 px-1 py-2", asideWidthClass)}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center rounded-xl border transition-colors",
                    sideButtonClass,
                    scope === "favorites"
                      ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                      : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/60",
                  )}
                  onClick={() => setScope("favorites")}
                  aria-label="Favorites"
                >
                  {scope === "favorites" ? <IconStarFilled size={18} /> : <IconStar size={18} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Favorites</TooltipContent>
            </Tooltip>

            <div className="my-1 h-px w-7 bg-border/60" />

            {availableProviders.map((provider) => (
              <Tooltip key={provider}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center justify-center rounded-xl border transition-colors",
                      sideButtonClass,
                      scope === provider
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/60",
                    )}
                    onClick={() => setScope(provider)}
                    aria-label={PROVIDER_META[provider].label}
                  >
                    <ModelIcon
                      provider={provider}
                      size={providerIconSize}
                      mono={!!PROVIDER_META[provider].monoIcon}
                      className="shrink-0"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {provider === "ollama"
                    ? ollamaRunning
                      ? "Ollama (Local)"
                      : "Ollama (Offline)"
                    : `${PROVIDER_META[provider].label} (${PROVIDER_META[provider].tier})`}
                </TooltipContent>
              </Tooltip>
            ))}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-border/60 px-3 py-2.5">
              <div className="relative">
                <IconSearch
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search models..."
                  className={searchInputClass}
                />
              </div>
            </div>

            <ScrollArea className={scrollHeightClass}>
              <div className="space-y-2 p-3">
                {scope === "favorites" ? (
                  <>
                    <div className="flex items-center gap-2 px-1">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Favorites
                      </h4>
                      <span className="text-[10px] text-muted-foreground">
                        {favoriteModels.length}
                      </span>
                    </div>
                    {favoriteModels.length > 0 ? (
                      <div className="space-y-1.5">
                        {favoriteModels.map((model) => (
                          <ModelRow
                            key={`fav-${model.id}`}
                            model={model}
                            selectedModelId={selectedModelId}
                            favoriteSet={favoriteSet}
                            compact={isZenMode}
                            onSelectModel={handleSelectModel}
                            onToggleFavorite={handleToggleFavorite}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                        {query
                          ? "No favorites match your search."
                          : "Mark models with the star to keep them here."}
                      </div>
                    )}
                    {!query && favoriteModels.length > 0 && (
                      <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
                        Use provider icons on the left to browse all models.
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-1">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {PROVIDER_META[scope].label}
                      </h4>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                          PROVIDER_META[scope].tier === "Subscription"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : PROVIDER_META[scope].tier === "Local"
                              ? "bg-sky-500/15 text-sky-400"
                              : "bg-amber-500/15 text-amber-400",
                        )}
                      >
                        {scope === "ollama" && !ollamaRunning
                          ? "Offline"
                          : PROVIDER_META[scope].tier}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {scopedModels.length}
                      </span>
                    </div>

                    {scopedModels.length > 0 ? (
                      <div className="space-y-1.5">
                        {scopedModels.map((model) => (
                          <ModelRow
                            key={model.id}
                            model={model}
                            selectedModelId={selectedModelId}
                            favoriteSet={favoriteSet}
                            compact={isZenMode}
                            onSelectModel={handleSelectModel}
                            onToggleFavorite={handleToggleFavorite}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                        {scope === "ollama"
                          ? ollamaRunning
                            ? "No local models installed in Ollama."
                            : "Ollama is not running."
                          : query
                            ? "No models match your search."
                            : "No models available for this provider."}
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
});
