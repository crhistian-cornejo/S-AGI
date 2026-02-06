import { useState, useEffect, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  artifactPanelOpenAtom,
  selectedArtifactAtom,
  activeTabAtom,
  currentProviderAtom,
  sidebarOpenAtom,
  commandKOpenAtom,
  notesSidebarOpenAtom,
  pdfSidebarOpenAtom,
  agentPanelOpenAtom,
  excelSidebarOpenAtom,
  docSidebarOpenAtom,
  selectedChatIdAtom,
  zenModeAtom,
} from "@/lib/atoms";
import { useOpenSettingsPage } from "@/features/settings/use-open-settings-page";
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
  IconSettings,
  IconLogout,
  IconChevronDown,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconArrowsDiagonalMinimize2,
  IconMinus,
  IconSquare,
  IconX,
  IconMessages,
  IconPhoto,
  IconSearch,
  IconTable,
  IconFileText,
  IconPlus,
  IconLeaf,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import {
  ZaiIcon,
  OpenAIIcon,
  ClaudeIcon,
} from "@/components/icons/model-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, isMacOS, isElectron, isWindows } from "@/lib/utils";
import { HamburgerMenu } from "./hamburger-menu";
import { ShareSessionButton } from "@/features/chat/share-session-dialog";

export interface TitleBarProps {
  className?: string;
  noTrafficLightSpace?: boolean;
}

export function TitleBar({ className, noTrafficLightSpace }: TitleBarProps) {
  const [artifactPanelOpen, setArtifactPanelOpen] = useAtom(
    artifactPanelOpenAtom
  );
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const openSettingsPage = useOpenSettingsPage();
  const setCommandKOpen = useSetAtom(commandKOpenAtom);
  const selectedArtifact = useAtomValue(selectedArtifactAtom);
  const isDesktop = isElectron();
  const showTrafficLights = isMacOS() && isDesktop;

  const utils = trpc.useUtils();
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const createChat = trpc.chats.create.useMutation({
    onSuccess: (chat) => {
      setSelectedChatId(chat.id);
      setActiveTab("chat");
      utils.chats.list.invalidate();
    },
  });
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
  const setZenMode = useSetAtom(zenModeAtom);
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();

  const isWindowsApp = isWindows();
  const showWindowsLeftLogo =
    isWindowsApp &&
    !sidebarOpen &&
    ((activeTab === "ideas" && !notesSidebarOpen) ||
      (activeTab === "pdf" && !pdfSidebarOpen) ||
      (activeTab === "excel" && !excelSidebarOpen) ||
      (activeTab === "doc" && !docSidebarOpen) ||
      activeTab === "chat");

  // Handler to create new thread (go to chat tab with new chat)
  const handleNewThread = useCallback(() => {
    setSelectedChatId(null);
    setActiveTab("chat");
    setSidebarOpen(true);
  }, [setSelectedChatId, setActiveTab, setSidebarOpen]);

  const handleNewChat = useCallback(() => {
    setActiveTab("chat");
    createChat.mutate({ title: "New Chat" });
  }, [createChat, setActiveTab]);

  // Agent panel is available for excel, doc, pdf tabs (not notes/ideas)
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
        "h-9 bg-sidebar shrink-0 px-2 transition-all duration-300 relative drag-region",
        showTrafficLights && !noTrafficLightSpace && "pl-20",
        !showTrafficLights && "pr-0",
        className
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex h-full w-full items-center">
      {/* Left side - Ideas tab with sidebar toggles (like Excel) */}
      {activeTab === "ideas" && (!sidebarOpen || !notesSidebarOpen) && (
        <div
          className={cn(
            "flex items-center gap-1.5 shrink-0 z-[200] no-drag pointer-events-auto",
            // Center buttons on macOS when main sidebar is collapsed, otherwise left-aligned
            showTrafficLights && !sidebarOpen
              ? "absolute left-1/2 -translate-x-1/2"
              : showTrafficLights
              ? "ml-1"
              : "ml-2"
          )}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {isWindowsApp && !sidebarOpen && <HamburgerMenu />}
          {/* Logo - opens agent panel (only on Windows, macOS uses right-side logo) */}
          {isWindowsApp && !sidebarOpen && isAgentEnabled && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                    className={cn(
                      "flex items-center gap-2 transition-all duration-200 no-drag pointer-events-auto relative z-[300]",
                      "hover:opacity-80 active:scale-95 cursor-pointer",
                      agentPanelOpen && "text-primary"
                    )}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <div className="relative">
                      <Logo size={16} />
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
            </>
          )}

          {/* Main sidebar toggle (chats) - when collapsed */}
          {!sidebarOpen && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground relative z-[300]"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <IconMessages size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Mostrar chats</TooltipContent>
              </Tooltip>

              {/* New thread button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleNewThread}
                    className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground relative z-[300]"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <IconPlus size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Nuevo hilo</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Notes sidebar toggle - when collapsed */}
          {!notesSidebarOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setNotesSidebarOpen(true)}
                  className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                >
                  <IconFileText size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Mostrar notas</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      {/* PDF tab - show sidebar toggles when collapsed */}
      {activeTab === "pdf" && (!sidebarOpen || !pdfSidebarOpen) && (
        <div
          className={cn(
            "flex items-center gap-1.5 shrink-0 z-[200] no-drag pointer-events-auto",
            // Center buttons on macOS when main sidebar is collapsed, otherwise left-aligned
            showTrafficLights && !sidebarOpen
              ? "absolute left-1/2 -translate-x-1/2"
              : showTrafficLights
              ? "ml-1"
              : "ml-2"
          )}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {isWindowsApp && !sidebarOpen && <HamburgerMenu />}
          {/* Logo - opens agent panel (only on Windows, macOS uses right-side logo) */}
          {isWindowsApp && !sidebarOpen && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                    className={cn(
                      "flex items-center gap-2 transition-all duration-200 no-drag pointer-events-auto relative z-[300]",
                      "hover:opacity-80 active:scale-95 cursor-pointer",
                      agentPanelOpen && "text-primary"
                    )}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <div className="relative">
                      <Logo size={16} />
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
            </>
          )}

          {/* Main sidebar toggle (chats) - when collapsed */}
          {!sidebarOpen && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground relative z-[300]"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <IconMessages size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Mostrar chats</TooltipContent>
              </Tooltip>

              {/* New thread button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleNewThread}
                    className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground relative z-[300]"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <IconPlus size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Nuevo hilo</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* PDF sidebar toggle - when collapsed */}
          {!pdfSidebarOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setPdfSidebarOpen(true)}
                  className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                >
                  <IconLayoutSidebarLeftExpand size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Mostrar PDFs</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      {/* Excel tab - show sidebar toggles when collapsed */}
      {activeTab === "excel" && (!sidebarOpen || !excelSidebarOpen) && (
        <div
          className={cn(
            "flex items-center gap-1.5 shrink-0 z-[200] no-drag pointer-events-auto",
            // Center buttons on macOS when main sidebar is collapsed, otherwise left-aligned
            showTrafficLights && !sidebarOpen
              ? "absolute left-1/2 -translate-x-1/2"
              : showTrafficLights
              ? "ml-1"
              : "ml-2"
          )}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {isWindowsApp && !sidebarOpen && <HamburgerMenu />}
          {/* Logo - opens agent panel (only on Windows, macOS uses right-side logo) */}
          {isWindowsApp && !sidebarOpen && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                    className={cn(
                      "flex items-center gap-2 transition-all duration-200 no-drag pointer-events-auto relative z-[300]",
                      "hover:opacity-80 active:scale-95 cursor-pointer",
                      agentPanelOpen && "text-primary"
                    )}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <div className="relative">
                      <Logo size={16} />
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
            </>
          )}

          {/* Main sidebar toggle (chats) - when collapsed */}
          {!sidebarOpen && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground relative z-[300]"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <IconMessages size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Mostrar chats</TooltipContent>
              </Tooltip>

              {/* New thread button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleNewThread}
                    className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground relative z-[300]"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <IconPlus size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Nuevo hilo</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Excel files sidebar toggle - when collapsed */}
          {!excelSidebarOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setExcelSidebarOpen(true)}
                  className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                >
                  <IconTable size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Mostrar archivos</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      {/* Doc tab - show sidebar toggle when collapsed */}
      {activeTab === "doc" && (!sidebarOpen || !docSidebarOpen) && (
        <div
          className={cn(
            "flex items-center gap-1.5 shrink-0 z-[200] no-drag pointer-events-auto",
            // Center buttons on macOS when main sidebar is collapsed, otherwise left-aligned
            showTrafficLights && !sidebarOpen
              ? "absolute left-1/2 -translate-x-1/2"
              : showTrafficLights
              ? "ml-1"
              : "ml-2"
          )}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {isWindowsApp && !sidebarOpen && <HamburgerMenu />}
          {/* Logo - opens agent panel (only on Windows, macOS uses right-side logo) */}
          {isWindowsApp && !sidebarOpen && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                    className={cn(
                      "flex items-center gap-2 transition-all duration-200 no-drag pointer-events-auto relative z-[300]",
                      "hover:opacity-80 active:scale-95 cursor-pointer",
                      agentPanelOpen && "text-primary"
                    )}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <div className="relative">
                      <Logo size={16} />
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
            </>
          )}

          {/* Main sidebar toggle (chats) - when collapsed */}
          {!sidebarOpen && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground relative z-[300]"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <IconMessages size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Mostrar chats</TooltipContent>
              </Tooltip>

              {/* New thread button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleNewThread}
                    className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground relative z-[300]"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  >
                    <IconPlus size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Nuevo hilo</TooltipContent>
              </Tooltip>
            </>
          )}

          {/* Doc files sidebar toggle - when collapsed */}
          {!docSidebarOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setDocSidebarOpen(true)}
                  className="no-drag pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200 hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                >
                  <IconFileText size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Mostrar documentos</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      {/* Chat/Gallery tab - show hamburger menu and logo on Windows, sidebar toggle on macOS */}
      {(activeTab === "chat" || activeTab === "gallery") &&
        !sidebarOpen &&
        (showTrafficLights || isWindowsApp) && (
          <div
            className={cn(
              "flex items-center gap-0.5 shrink-0 z-[200] no-drag pointer-events-auto",
              showTrafficLights ? "ml-1" : "ml-2"
            )}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {/* Windows: only hamburger + logo in titlebar */}
            {isWindowsApp && <HamburgerMenu />}
            {isWindowsApp && (
              <div className="flex items-center gap-2">
                <Logo size={16} />
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  S-AGI
                </span>
              </div>
            )}

            {/* macOS: chat controls beside traffic lights */}
            {showTrafficLights && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md no-drag"
                      onClick={() => setActiveTab("gallery")}
                      aria-label="Open gallery"
                    >
                      <IconPhoto size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Gallery</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md no-drag"
                      onClick={handleNewChat}
                      aria-label="New chat"
                      disabled={createChat.isPending}
                    >
                      <IconPlus size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    New Chat
                    <kbd className="ml-2 pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
                      {isMacOS() ? "⌘" : "Ctrl"}N
                    </kbd>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md no-drag"
                      onClick={() => setCommandKOpen(true)}
                      aria-label="Search chats"
                    >
                      <IconSearch size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Search
                    <kbd className="ml-2 pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
                      {isMacOS() ? "⌘" : "Ctrl"}K
                    </kbd>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md no-drag"
                      onClick={() => setSidebarOpen(true)}
                      aria-label="Open sidebar"
                    >
                      <IconLayoutSidebarLeftExpand size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Mostrar sidebar
                    <kbd className="ml-2 pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
                      {isMacOS() ? "⌘" : "Ctrl"}\
                    </kbd>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        )}
      {activeTab !== "ideas" &&
        activeTab !== "chat" &&
        activeTab !== "gallery" &&
        activeTab !== "settings" &&
        (!isWindowsApp || activeTab !== "pdf") &&
        !showTrafficLights &&
        (!isWindowsApp || !sidebarOpen) &&
        !showWindowsLeftLogo &&
        // Don't show default logo when excel/doc toggles are already visible
        !(activeTab === "excel" && (!sidebarOpen || !excelSidebarOpen)) &&
        !(activeTab === "doc" && (!sidebarOpen || !docSidebarOpen)) && (
          <div className="flex items-center z-[100] relative pointer-events-auto">
            {isWindowsApp && <HamburgerMenu />}
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
                    "flex items-center gap-2 no-drag pointer-events-auto ml-2 shrink-0 z-[300] relative transition-all duration-200",
                    isAgentEnabled &&
                      "hover:opacity-80 active:scale-95 cursor-pointer",
                    !isAgentEnabled && "cursor-default",
                    isAgentEnabled && agentPanelOpen && "text-primary"
                  )}
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <div className="relative">
                    <Logo size={16} />
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

      {/* Spacer for right-side items */}
      <div className="flex-1 drag-region" aria-hidden />

      <div className="flex items-center no-drag pr-0">
        {showTrafficLights && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  isAgentEnabled && setAgentPanelOpen(!agentPanelOpen)
                }
                disabled={!isAgentEnabled}
                className={cn(
                  "flex items-center gap-2 mr-2 transition-all duration-200 relative z-[300]",
                  isAgentEnabled &&
                    "hover:opacity-80 active:scale-95 cursor-pointer",
                  !isAgentEnabled && "cursor-default",
                  isAgentEnabled && agentPanelOpen && "text-primary"
                )}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <div className="relative">
                  <Logo size={16} />
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
                    !artifactPanelOpen && "rotate-180"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle Artifacts</TooltipContent>
          </Tooltip>
        )}

        {/* Share Session button - only on chat tab */}
        {activeTab === "chat" && (
          <ShareSessionButton styleVariant="zen" />
        )}

        {/* Zen Mode button - only on chat tab */}
        {activeTab === "chat" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 mr-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setZenMode(true)}
                aria-label="Zen Mode"
              >
                <IconLeaf size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Zen Mode
              <kbd className="ml-2 pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
                {isMacOS() ? "⌘⇧Z" : "Ctrl+Shift+Z"}
              </kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {isElectron() && !isMacOS() && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              className="h-9 w-10 rounded-none hover:bg-accent"
              onClick={handleMinimize}
            >
              <IconMinus size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-10 rounded-none hover:bg-accent"
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
              className="h-9 w-10 rounded-none hover:bg-destructive hover:text-destructive-foreground"
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
                onClick={() => openSettingsPage()}
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
    </div>
  );
}
