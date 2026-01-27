import { useState, useEffect, useMemo, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  artifactPanelOpenAtom,
  selectedArtifactAtom,
  activeTabAtom,
  settingsModalOpenAtom,
  currentProviderAtom,
  sidebarOpenAtom,
  notesSidebarOpenAtom,
  pdfSidebarOpenAtom,
  agentPanelOpenAtom,
  shortcutsDialogOpenAtom,
  notesSelectedModelIdAtom,
  notesEditorRefAtom,
  notesIsExportingPdfAtom,
  excelSidebarOpenAtom,
  docSidebarOpenAtom,
} from "@/lib/atoms";
import { trpc } from "@/lib/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  IconMessageChatbot,
  IconTable,
  IconFileText,
  IconFileTypePdf,
  IconSettings,
  IconLogout,
  IconChevronDown,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconArrowsDiagonalMinimize2,
  IconMinus,
  IconSquare,
  IconX,
  IconNotes,
  IconCommand,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import {
  ZaiIcon,
  OpenAIIcon,
  ModelIcon,
  ClaudeIcon,
} from "@/components/icons/model-icons";
import type { AIProvider } from "@s-agi/core/types/ai";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, isMacOS, isElectron, isWindows } from "@/lib/utils";
import { HamburgerMenu } from "./hamburger-menu";

export interface TitleBarProps {
  className?: string;
  noTrafficLightSpace?: boolean;
}

export function TitleBar({ className, noTrafficLightSpace }: TitleBarProps) {
  const [artifactPanelOpen, setArtifactPanelOpen] = useAtom(
    artifactPanelOpenAtom,
  );
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const setSettingsOpen = useSetAtom(settingsModalOpenAtom);
  const setShortcutsOpen = useSetAtom(shortcutsDialogOpenAtom);
  const selectedArtifact = useAtomValue(selectedArtifactAtom);
  const isDesktop = isElectron();
  const showTrafficLights = isMacOS() && isDesktop;

  const utils = trpc.useUtils();
  const { data: session } = trpc.auth.getSession.useQuery();
  const user = session?.user;
  const userDisplayName =
    user?.user_metadata?.full_name || user?.email || "Not logged in";

  const signOut = trpc.auth.signOut.useMutation({
    onSuccess: () => {
      window.desktopApi?.setSession(null);
      utils.auth.getSession.invalidate();
    },
  });

  const handleMinimize = () => window.desktopApi?.minimize();
  const handleMaximize = () => window.desktopApi?.maximize();
  const handleClose = () => window.desktopApi?.close();

  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    const api = window.desktopApi;
    if (!api?.isMaximized || !api?.onMaximizeChange) return;
    api.isMaximized().then(setIsMaximized);
    return api.onMaximizeChange(setIsMaximized);
  }, []);

  const provider = useAtomValue(currentProviderAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const [notesSidebarOpen, setNotesSidebarOpen] = useAtom(notesSidebarOpenAtom);
  const [pdfSidebarOpen, setPdfSidebarOpen] = useAtom(pdfSidebarOpenAtom);
  const [agentPanelOpen, setAgentPanelOpen] = useAtom(agentPanelOpenAtom);
  const [excelSidebarOpen, setExcelSidebarOpen] = useAtom(excelSidebarOpenAtom);
  const [docSidebarOpen, setDocSidebarOpen] = useAtom(docSidebarOpenAtom);
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();

  // Notes editor controls (for titlebar)
  const [selectedModelId, setSelectedModelId] = useAtom(
    notesSelectedModelIdAtom,
  );
  const editorRef = useAtomValue(notesEditorRefAtom);
  const [isExportingPdf] = useAtom(notesIsExportingPdfAtom);

  // Available models for notes
  const availableModels = useMemo(() => {
    const models = {
      openai: [
        {
          id: "gpt-5-mini",
          name: "GPT-5 Mini",
          description: "Fast & capable",
          provider: "openai" as AIProvider,
        },
        {
          id: "gpt-5-nano",
          name: "GPT-5 Nano",
          description: "Ultra fast",
          provider: "openai" as AIProvider,
        },
      ],
      zai: [
        {
          id: "GLM-4.7-Flash",
          name: "GLM-4.7 Flash",
          description: "Fast",
          provider: "zai" as AIProvider,
        },
      ],
    };
    return provider === "zai" ? models.zai : models.openai;
  }, [provider]);

  const currentModel = useMemo(() => {
    return (
      availableModels.find((m) => m.id === selectedModelId) ||
      availableModels[0]
    );
  }, [availableModels, selectedModelId]);

  const handleExportPdf = useCallback(async () => {
    if (editorRef?.exportPdf) {
      await editorRef.exportPdf();
    }
  }, [editorRef]);

  // Agent panel is available for excel, doc, pdf tabs
  const isAgentEnabled =
    activeTab === "excel" || activeTab === "doc" || activeTab === "pdf";

  const isConnected =
    provider === "chatgpt-plus"
      ? keyStatus?.hasChatGPTPlus
      : provider === "openai"
        ? keyStatus?.hasOpenAI
        : provider === "zai"
          ? keyStatus?.hasZai
          : provider === "claude"
            ? keyStatus?.hasClaudeCode
            : false;

  const providerIcon = (() => {
    if (!isConnected)
      return { icon: OpenAIIcon, className: "text-muted-foreground" };
    switch (provider) {
      case "chatgpt-plus":
        return { icon: OpenAIIcon, className: "text-emerald-600" };
      case "openai":
        return { icon: OpenAIIcon, className: "" };
      case "zai":
        return { icon: ZaiIcon, className: "text-amber-500" };
      case "claude":
        return { icon: ClaudeIcon, className: "text-orange-500" };
      default:
        return { icon: OpenAIIcon, className: "text-muted-foreground" };
    }
  })();

  return (
    <div
      className={cn(
        "h-10 flex items-center bg-transparent drag-region shrink-0 px-2 transition-all duration-300 relative",
        showTrafficLights && !noTrafficLightSpace && "pl-20",
        !showTrafficLights && "pr-0",
        className,
      )}
    >
      {/* Left side - Logo or Sidebar toggle with Notes controls based on active tab */}
      {activeTab === "ideas" && !notesSidebarOpen && (
        /* Only show in titlebar when sidebar is collapsed */
        <div
          className={cn(
            "flex items-center gap-2 no-drag shrink-0 z-[100] relative pointer-events-auto",
            showTrafficLights ? "ml-4" : "ml-2",
          )}
        >
          {isWindows() && <HamburgerMenu />}
          {/* App Logo - shown when sidebar is collapsed */}
          <div className="flex items-center gap-2">
            <Logo size={20} className="text-primary" />
            <span className="text-sm font-semibold text-foreground tracking-tight">
              S-AGI
            </span>
          </div>

          <div className="w-px h-4 bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setNotesSidebarOpen(true)}
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
                  "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <IconLayoutSidebarLeftExpand size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Show sidebar</TooltipContent>
          </Tooltip>

          {/* Model selector and PDF export - only when sidebar is collapsed */}
          {currentModel && (
            <>
              <div className="w-px h-4 bg-border" />

              {/* Model selector */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex items-center gap-1.5 px-2 h-7 rounded-md text-xs transition-all duration-200",
                          "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <ModelIcon
                          provider={currentModel.provider || provider}
                          size={14}
                          className={
                            currentModel.provider === "zai"
                              ? "text-amber-500"
                              : ""
                          }
                        />
                        <span className="max-w-[80px] truncate text-xs">
                          {currentModel.name}
                        </span>
                        <IconChevronDown size={12} className="opacity-50" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {availableModels.map((model) => (
                        <DropdownMenuItem
                          key={model.id}
                          onClick={() => setSelectedModelId(model.id)}
                          className={cn(
                            "text-xs",
                            model.id === selectedModelId && "bg-accent",
                          )}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <ModelIcon
                              provider={model.provider || provider}
                              size={14}
                              className={cn(
                                "shrink-0",
                                model.provider === "zai"
                                  ? "text-amber-500"
                                  : "",
                              )}
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium">{model.name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {model.description}
                              </span>
                            </div>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>AI Model</p>
                </TooltipContent>
              </Tooltip>

              <div className="w-px h-4 bg-border" />

              {/* PDF export button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={isExportingPdf || !editorRef}
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
                      "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                      (isExportingPdf || !editorRef) &&
                        "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {isExportingPdf ? (
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <IconFileTypePdf size={16} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Export to PDF</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      )}
      {activeTab === "pdf" && !pdfSidebarOpen && isWindows() && (
        <div
          className={cn(
            "flex items-center gap-2 no-drag shrink-0 z-[100] relative pointer-events-auto",
            showTrafficLights ? "ml-4" : "ml-2",
          )}
        >
          <HamburgerMenu />
          {/* Logo - opens agent panel */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                className={cn(
                  "flex items-center gap-2 transition-all duration-200",
                  "hover:opacity-80 active:scale-95 cursor-pointer",
                  agentPanelOpen && "text-primary",
                )}
              >
                <div className="relative">
                  <Logo size={20} />
                  {agentPanelOpen && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  S-AGI
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {agentPanelOpen ? "Close chat panel" : "Open chat panel"}
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border" />

          {/* Sidebar toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setPdfSidebarOpen(true)}
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
                  "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <IconLayoutSidebarLeftExpand size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Show sidebar</TooltipContent>
          </Tooltip>
        </div>
      )}
      {/* Excel tab - show sidebar toggle when collapsed */}
      {activeTab === "excel" && !excelSidebarOpen && (
        <div
          className={cn(
            "flex items-center gap-2 no-drag shrink-0 z-[100] relative pointer-events-auto",
            showTrafficLights ? "ml-4" : "ml-2",
          )}
        >
          {isWindows() && <HamburgerMenu />}
          {/* Logo - opens agent panel */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                className={cn(
                  "flex items-center gap-2 transition-all duration-200",
                  "hover:opacity-80 active:scale-95 cursor-pointer",
                  agentPanelOpen && "text-primary",
                )}
              >
                <div className="relative">
                  <Logo size={20} />
                  {agentPanelOpen && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  S-AGI
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {agentPanelOpen ? "Cerrar panel" : "Abrir panel AI"}
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border" />

          {/* Sidebar toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setExcelSidebarOpen(true)}
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
                  "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <IconLayoutSidebarLeftExpand size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mostrar archivos</TooltipContent>
          </Tooltip>
        </div>
      )}
      {/* Doc tab - show sidebar toggle when collapsed */}
      {activeTab === "doc" && !docSidebarOpen && (
        <div
          className={cn(
            "flex items-center gap-2 no-drag shrink-0 z-[100] relative pointer-events-auto",
            showTrafficLights ? "ml-4" : "ml-2",
          )}
        >
          {isWindows() && <HamburgerMenu />}
          {/* Logo - opens agent panel */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                className={cn(
                  "flex items-center gap-2 transition-all duration-200",
                  "hover:opacity-80 active:scale-95 cursor-pointer",
                  agentPanelOpen && "text-primary",
                )}
              >
                <div className="relative">
                  <Logo size={20} />
                  {agentPanelOpen && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  S-AGI
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {agentPanelOpen ? "Cerrar panel" : "Abrir panel AI"}
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border" />

          {/* Sidebar toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setDocSidebarOpen(true)}
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
                  "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <IconLayoutSidebarLeftExpand size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mostrar archivos</TooltipContent>
          </Tooltip>
        </div>
      )}
      {/* Chat tab - always show hamburger menu on Windows */}
      {activeTab === "chat" && isWindows() && (
        <div
          className={cn(
            "flex items-center gap-2 no-drag shrink-0 z-[100] relative pointer-events-auto",
            showTrafficLights ? "ml-4" : "ml-2",
          )}
        >
          <HamburgerMenu />
          {/* Logo (clickable for agent panel) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  isAgentEnabled && setAgentPanelOpen(!agentPanelOpen)
                }
                disabled={!isAgentEnabled}
                className={cn(
                  "flex items-center gap-2 transition-all duration-200",
                  isAgentEnabled &&
                    "hover:opacity-80 active:scale-95 cursor-pointer",
                  !isAgentEnabled && "cursor-default",
                  isAgentEnabled && agentPanelOpen && "text-primary",
                )}
              >
                <div className="relative">
                  <Logo size={20} />
                  {isAgentEnabled && agentPanelOpen && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  S-AGI
                </span>
              </button>
            </TooltipTrigger>
            {isAgentEnabled && (
              <TooltipContent side="bottom">
                {agentPanelOpen ? "Close Agent Panel" : "Open Agent Panel"}
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      )}
      {activeTab !== "ideas" &&
        activeTab !== "chat" &&
        (!isWindows() || activeTab !== "pdf") &&
        !showTrafficLights &&
        (!isWindows() || !sidebarOpen) &&
        // Don't show default logo when excel/doc sidebar is closed (already shown with toggle)
        !(activeTab === "excel" && !excelSidebarOpen) &&
        !(activeTab === "doc" && !docSidebarOpen) && (
          <div className="flex items-center z-[100] relative pointer-events-auto">
            {isWindows() && <HamburgerMenu />}
            {/* Logo (clickable for agent panel in excel/doc/pdf tabs) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() =>
                    isAgentEnabled && setAgentPanelOpen(!agentPanelOpen)
                  }
                  disabled={!isAgentEnabled}
                  className={cn(
                    "flex items-center gap-2 no-drag ml-2 shrink-0 z-10 transition-all duration-200",
                    isAgentEnabled &&
                      "hover:opacity-80 active:scale-95 cursor-pointer",
                    !isAgentEnabled && "cursor-default",
                    isAgentEnabled && agentPanelOpen && "text-primary",
                  )}
                >
                  <div className="relative">
                    <Logo size={20} />
                    {isAgentEnabled && agentPanelOpen && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:block">
                    S-AGI
                  </span>
                </button>
              </TooltipTrigger>
              {isAgentEnabled && (
                <TooltipContent side="bottom">
                  {agentPanelOpen ? "Close Agent Panel" : "Open Agent Panel"}
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        )}

      {/* Center - Navigation tabs (absolute positioned for true centering) */}
      <div
        className={cn(
          "no-drag z-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
      >
        <div className="flex items-center bg-background/40 backdrop-blur-md border border-border/50 rounded-lg p-0.5 h-8">
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
              activeTab === "chat"
                ? "bg-accent text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
            )}
          >
            <IconMessageChatbot size={14} />
            Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("excel")}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
              activeTab === "excel"
                ? "bg-accent text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
            )}
          >
            <IconTable size={14} />
            Excel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("doc")}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
              activeTab === "doc"
                ? "bg-accent text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
            )}
          >
            <IconFileText size={14} />
            Docs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pdf")}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
              activeTab === "pdf"
                ? "bg-accent text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
            )}
          >
            <IconFileTypePdf size={14} />
            PDF
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ideas")}
            className={cn(
              "flex items-center gap-1.5 px-3 h-full rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-300",
              activeTab === "ideas"
                ? "bg-accent text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
            )}
          >
            <IconNotes size={14} />
            Notes
          </button>
        </div>
      </div>

      {/* Spacer for right-side items */}
      <div className="flex-1" />

      <div className="flex items-center no-drag pr-0">
        {showTrafficLights && activeTab !== "pdf" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  isAgentEnabled && setAgentPanelOpen(!agentPanelOpen)
                }
                disabled={!isAgentEnabled}
                className={cn(
                  "flex items-center gap-2 mr-2 transition-all duration-200",
                  isAgentEnabled &&
                    "hover:opacity-80 active:scale-95 cursor-pointer",
                  !isAgentEnabled && "cursor-default",
                  isAgentEnabled && agentPanelOpen && "text-primary",
                )}
              >
                <div className="relative">
                  <Logo size={20} />
                  {isAgentEnabled && agentPanelOpen && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:block">
                  S-AGI
                </span>
              </button>
            </TooltipTrigger>
            {isAgentEnabled && (
              <TooltipContent side="bottom">
                {agentPanelOpen ? "Close Agent Panel" : "Open Agent Panel"}
              </TooltipContent>
            )}
          </Tooltip>
        )}

        {selectedArtifact && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 mr-1"
                onClick={() => setArtifactPanelOpen(!artifactPanelOpen)}
              >
                <IconLayoutSidebarRightCollapse
                  size={18}
                  className={cn(
                    "transition-transform",
                    !artifactPanelOpen && "rotate-180",
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle Artifacts</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 mr-1"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Shortcuts"
            >
              <IconCommand size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Shortcuts</TooltipContent>
        </Tooltip>

        {isElectron() && !isMacOS() && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              className="h-10 w-11 rounded-none hover:bg-accent"
              onClick={handleMinimize}
            >
              <IconMinus size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-11 rounded-none hover:bg-accent"
              onClick={handleMaximize}
            >
              {isMaximized ? (
                <IconArrowsDiagonalMinimize2 size={14} />
              ) : (
                <IconSquare size={14} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-11 rounded-none hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleClose}
            >
              <IconX size={16} />
            </Button>
          </div>
        )}

        {showTrafficLights && !sidebarOpen && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 flex items-center gap-1.5 p-1 hover:bg-accent rounded-lg transition-colors no-drag ml-1 relative"
              >
                <Avatar className="h-6 w-6 border border-border/50">
                  <AvatarImage
                    src={
                      user?.user_metadata?.avatar_url ||
                      user?.user_metadata?.picture
                    }
                  />
                  <AvatarFallback className="bg-primary/10 text-[10px]">
                    {user?.email?.charAt(0).toUpperCase() || (
                      <OpenAIIcon size={12} className="text-muted-foreground" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <IconChevronDown
                  size={12}
                  className="text-muted-foreground opacity-50"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-1">
              <DropdownMenuLabel className="flex items-center justify-between">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold truncate">
                    {userDisplayName}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate font-normal">
                    {user?.email}
                  </span>
                </div>
                {isConnected && (
                  <div className="flex items-center gap-1.5 bg-accent/50 px-2 py-0.5 rounded-full shrink-0 ml-2">
                    <providerIcon.icon
                      size={10}
                      className={providerIcon.className}
                    />
                    <span className="text-[9px] font-bold tracking-tight uppercase">
                      {provider === "chatgpt-plus" ? "Plus" : provider}
                    </span>
                  </div>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setSettingsOpen(true)}
                className="justify-between cursor-pointer"
              >
                <span className="flex items-center">
                  <IconSettings size={14} className="mr-2" />
                  Settings
                </span>
                <kbd className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                  {navigator.platform.toLowerCase().includes("mac")
                    ? "⌘,"
                    : "Ctrl+,"}
                </kbd>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOut.mutate()}
                className="cursor-pointer"
              >
                <IconLogout size={14} className="mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
