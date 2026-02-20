import { useState, useEffect, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  artifactPanelOpenAtom,
  selectedArtifactAtom,
  activeTabAtom,
  currentProviderAtom,
  sidebarOpenAtom,
  notesSidebarOpenAtom,
  pdfSidebarOpenAtom,
  agentPanelOpenAtom,
  excelSidebarOpenAtom,
  docSidebarOpenAtom,
  selectedChatIdAtom,
  authDialogOpenAtom,
  settingsActiveTabAtom,
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
  IconCheck,
  IconChevronDown,
  IconDeviceDesktop,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconArrowsDiagonalMinimize2,
  IconMinus,
  IconSquare,
  IconX,
  IconMessages,
  IconTable,
  IconFileText,
  IconPlus,
  IconUser,
  IconUsers,
  IconLeaf,
  IconDownload,
  IconRefresh,
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
import { cn, isMacOS, isElectron, isWindows, isLinux } from "@/lib/utils";
import { HamburgerMenu } from "./hamburger-menu";
import { ShareSessionButton } from "@/features/chat/share-session-dialog";
import { toast } from "sonner";
import {
  updateStatusAtom,
  updateVersionAtom,
  updateDownloadPercentAtom,
} from "@/lib/atoms";

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
  const selectedArtifact = useAtomValue(selectedArtifactAtom);
  const isDesktop = isElectron();
  const showTrafficLights = isMacOS() && isDesktop;

  const utils = trpc.useUtils();
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const { data: session } = trpc.auth.getSession.useQuery();
  const user = session?.user;
  const { data: accountsData } = trpc.auth.getAccounts.useQuery();
  const accounts = accountsData?.accounts || [];
  const hasMultipleAccounts = accounts.length > 1;
  const activeAccount = accounts.find((account) => account.isActive);
  const activeAvatarUrl = activeAccount?.avatarUrl || "";
  const activeAvatarIsEmoji = activeAvatarUrl.startsWith("emoji://");
  const activeAvatarEmoji = activeAvatarIsEmoji
    ? decodeURIComponent(activeAvatarUrl.split("://")[1]?.split("?")[0] || "👤")
    : null;
  const activeAvatarBgColor = activeAvatarIsEmoji
    ? decodeURIComponent(activeAvatarUrl.split("bg=")[1] || "#6366f1")
    : null;
  const userDisplayName =
    activeAccount?.isLocal
      ? activeAccount.displayName || "Cuenta Local"
      : activeAccount?.email ||
        user?.user_metadata?.full_name ||
        user?.email ||
        "Not logged in";

  const signOut = trpc.auth.signOut.useMutation({
    onSuccess: () => {
      window.desktopApi?.setSession(null);
      utils.auth.getSession.invalidate();
      utils.auth.getAccounts.invalidate();
      setSelectedChatId(null);
    },
  });

  const switchAccount = trpc.auth.switchAccount.useMutation({
    onSuccess: () => {
      // Keep titlebar account switch behavior aligned with Sidebar.
      utils.auth.getSession.invalidate();
      utils.auth.getUser.invalidate();
      utils.auth.getAccounts.invalidate();
      utils.chats.list.invalidate();
      utils.chats.listArchived.invalidate();
      utils.gallery.list.invalidate();
      utils.artifacts.list.invalidate();
      utils.userFiles.list.invalidate();
      setSelectedChatId(null);
      toast.success("Switched account");
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
  const setAuthDialogOpen = useSetAtom(authDialogOpenAtom);
  const setSettingsTab = useSetAtom(settingsActiveTabAtom);
  const updateStatus = useAtomValue(updateStatusAtom);
  const updateVersion = useAtomValue(updateVersionAtom);
  const updateDownloadPercent = useAtomValue(updateDownloadPercentAtom);
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();

  // Windows and Linux both need custom window controls (macOS uses native traffic lights)
  const isWindowsApp = isWindows() || isLinux();
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
        "h-9 bg-sidebar shrink-0 px-2 transition-all duration-300 relative",
        !showTrafficLights && "pr-0",
        className
      )}
    >
      <div className="flex h-full w-full items-center">
      {/* Traffic light spacer — keeps buttons away from macOS semaphore zone */}
      {showTrafficLights && !noTrafficLightSpace && (
        <div className="w-[68px] shrink-0 drag-region h-full" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />
      )}
      {/* Left flex spacer — centers tab buttons when sidebar collapsed on macOS */}
      {showTrafficLights && !noTrafficLightSpace && !sidebarOpen && (
        <div className="flex-1 drag-region h-full" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />
      )}
      {/* Left side - Ideas tab with sidebar toggles (like Excel) */}
      {activeTab === "ideas" && (!sidebarOpen || !notesSidebarOpen) && (
        <div
          className={cn(
            "flex items-center gap-1.5 shrink-0 z-[200] no-drag pointer-events-auto",
            showTrafficLights
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
            showTrafficLights
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
            showTrafficLights
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
            showTrafficLights
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

            {/* macOS: chat controls are rendered in main-layout.tsx as an overlay
                outside the drag region hierarchy to avoid macOS hiddenInset hit area issues */}
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
      <div className="flex-1 drag-region h-full" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} aria-hidden />

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

        {/* Update badge - visible when update is available, downloading, or downloaded */}
        {(updateStatus === "available" || updateStatus === "downloading" || updateStatus === "downloaded") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (updateStatus === "downloaded") {
                    window.desktopApi?.update?.installUpdate();
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-all duration-200 no-drag pointer-events-auto mr-1",
                  updateStatus === "downloaded"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 cursor-pointer animate-pulse"
                    : "bg-blue-500/15 text-blue-600 dark:text-blue-400 cursor-default"
                )}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                {updateStatus === "downloading" ? (
                  <IconRefresh size={13} className="animate-spin" />
                ) : (
                  <IconDownload size={13} />
                )}
                {updateStatus === "downloaded"
                  ? `Restart${updateVersion ? ` v${updateVersion}` : ""}`
                  : updateStatus === "downloading"
                    ? `${Math.round(updateDownloadPercent)}%`
                    : `Update${updateVersion ? ` v${updateVersion}` : ""}`}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {updateStatus === "downloaded"
                ? "Click to restart and install update"
                : updateStatus === "downloading"
                  ? `Downloading update... ${Math.round(updateDownloadPercent)}%`
                  : "Update is being downloaded automatically"}
            </TooltipContent>
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
                  {activeAvatarIsEmoji ? (
                    <AvatarFallback
                      className="text-sm"
                      style={{ backgroundColor: activeAvatarBgColor || undefined }}
                    >
                      {activeAvatarEmoji}
                    </AvatarFallback>
                  ) : activeAvatarUrl ? (
                    <AvatarImage src={activeAvatarUrl} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-[10px]">
                    {activeAccount?.isLocal ? (
                      <IconDeviceDesktop size={12} />
                    ) : (
                      (activeAccount?.email || user?.email)?.charAt(0).toUpperCase() || (
                        <IconUser size={12} />
                      )
                    )}
                  </AvatarFallback>
                </Avatar>
                <IconChevronDown
                  size={12}
                  className="text-muted-foreground opacity-50"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 mt-1">
              <DropdownMenuLabel className="flex items-center justify-between">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold truncate">
                    {userDisplayName}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate font-normal">
                    {activeAccount?.isLocal ? "Modo offline" : activeAccount?.email || user?.email}
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

              {accounts.length > 0 && (
                <>
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <IconUsers size={12} />
                      Cuentas
                    </span>
                    {hasMultipleAccounts && (
                      <span className="text-[9px] text-muted-foreground">
                        {accounts.length} conectadas
                      </span>
                    )}
                  </DropdownMenuLabel>
                  <div className="max-h-40 overflow-y-auto">
                    {accounts.map((account) => {
                      const isEmoji = account.avatarUrl?.startsWith("emoji://");
                      const emoji = isEmoji
                        ? decodeURIComponent(
                            account.avatarUrl!.split("://")[1]?.split("?")[0] || "👤"
                          )
                        : null;
                      const bgColor = isEmoji
                        ? decodeURIComponent(account.avatarUrl!.split("bg=")[1] || "#6366f1")
                        : null;

                      return (
                        <DropdownMenuItem
                          key={account.id}
                          onClick={() => {
                            if (!account.isActive) {
                              switchAccount.mutate({ accountId: account.id });
                            }
                          }}
                          className={cn(
                            "flex items-center gap-2 cursor-pointer",
                            account.isActive && "bg-accent/50"
                          )}
                        >
                          <div className="relative">
                            <Avatar className="h-5 w-5">
                              {isEmoji ? (
                                <AvatarFallback
                                  className="text-xs"
                                  style={{ backgroundColor: bgColor || undefined }}
                                >
                                  {emoji}
                                </AvatarFallback>
                              ) : account.avatarUrl ? (
                                <AvatarImage src={account.avatarUrl} />
                              ) : null}
                              <AvatarFallback className="text-[10px] bg-primary/10">
                                {account.isLocal ? (
                                  <IconDeviceDesktop size={12} />
                                ) : (
                                  account.email?.charAt(0).toUpperCase() || "?"
                                )}
                              </AvatarFallback>
                            </Avatar>
                            {account.isActive && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-background" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              {account.isLocal
                                ? account.displayName || "Cuenta Local"
                                : account.email}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {account.isLocal ? "Modo offline" : account.provider || "Cloud"}
                            </p>
                          </div>
                          {account.isActive && (
                            <IconCheck size={14} className="text-green-500 shrink-0" />
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem
                onClick={() => setAuthDialogOpen(true)}
                className="gap-2"
              >
                <IconPlus size={14} />
                Agregar cuenta
              </DropdownMenuItem>

              {hasMultipleAccounts && (
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsTab("account");
                    openSettingsPage();
                  }}
                  className="gap-2"
                >
                  <IconUsers size={14} />
                  Administrar cuentas...
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => openSettingsPage()}
                className="justify-between cursor-pointer"
              >
                <span className="flex items-center">
                  <IconSettings size={14} className="mr-2" />
                  Configuración
                </span>
                <kbd className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                  {isMacOS() ? "⌘," : "Ctrl+,"}
                </kbd>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOut.mutate()}
                className="cursor-pointer"
              >
                <IconLogout size={14} className="mr-2" />
                {hasMultipleAccounts ? "Cerrar sesión actual" : "Cerrar sesión"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      </div>
    </div>
  );
}
