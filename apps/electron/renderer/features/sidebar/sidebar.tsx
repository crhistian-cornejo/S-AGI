import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ZaiIcon } from "@/components/icons/model-icons";
// NOTE: Gemini disabled - import { ZaiIcon, GeminiIcon } from '@/components/icons/model-icons'
import {
  IconSettings,
  IconBrandOpenai,
  IconBrain,
  IconDots,
  IconTrash,
  IconPencil,
  IconArchive,
  IconUser,
  IconLogout,
  IconLayoutSidebarLeftCollapse,
  IconSearch,
  IconPin,
  IconPinFilled,
  IconArchiveOff,
  IconChevronDown,
  IconChevronRight,
  IconPhoto,
  IconLoader2,
  IconCheck,
  IconPlus,
  IconUsers,
  IconDeviceDesktop,
  IconCloud,
} from "@tabler/icons-react";
import { trpc } from "@/lib/trpc";
import {
  selectedChatIdAtom,
  currentProviderAtom,
  sidebarOpenAtom,
  selectedArtifactAtom,
  artifactPanelOpenAtom,
  undoStackAtom,
  activeTabAtom,
  agentPanelOpenAtom,
  commandKOpenAtom,
  authDialogOpenAtom,
  settingsActiveTabAtom,
  type UndoItem,
} from "@/lib/atoms";
import { useOpenSettingsPage } from "@/features/settings/use-open-settings-page";
import { HamburgerMenu } from "@/features/layout/hamburger-menu";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "@/components/ui/logo";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn, detectLanguage, isMacOS, isWindows } from "@/lib/utils";
import { PageNav } from "@/features/sidebar/page-nav";
import { useStreamingStatusStore } from "@/features/chat/stores";

// ============================================================================
// FadeScrollArea - Scroll area with fade effect at top/bottom when content overflows
// ============================================================================
interface FadeScrollAreaProps {
  children: React.ReactNode;
  className?: string;
}

function FadeScrollArea({ children, className }: FadeScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollUp(scrollTop > 0);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });

    // Also check on resize
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll]);

  return (
    <div className={cn("relative flex-1 overflow-hidden w-full", className)}>
      {/* Top fade */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-b from-sidebar to-transparent",
          canScrollUp ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent w-full"
      >
        {children}
      </div>

      {/* Bottom fade */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-t from-sidebar to-transparent",
          canScrollDown ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

interface Chat {
  id: string;
  title: string | null;
  updated_at: string;
  created_at: string;
  archived: boolean;
  pinned?: boolean;
  isLocal?: boolean;
  meta?: {
    spreadsheets: number;
    documents: number;
    hasCode: boolean;
    hasImages: boolean;
    messageCount: number;
  };
}

// ============================================================================
// ChatItem - Individual chat item with context menu
// ============================================================================
interface ChatItemProps {
  chat: Chat;
  isSelected: boolean;
  isEditing: boolean;
  editingTitle: string;
  onSelect: () => void;
  onStartRename: () => void;
  onSaveRename: (title: string) => void;
  onCancelRename: () => void;
  onSetEditingTitle: (title: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onRestore?: () => void;
  isArchived?: boolean;
}

function formatRelativeTimeCompact(date: Date | string | null | undefined) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes <= 0) return "1m";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  const locale = detectLanguage();
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(d);
}

function ChatItem({
  chat,
  isSelected,
  isEditing,
  editingTitle,
  onSelect,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onSetEditingTitle,
  onArchive,
  onDelete,
  onTogglePin,
  onRestore,
  isArchived,
}: ChatItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isStreaming = useStreamingStatusStore((state) =>
    state.isStreaming(chat.id),
  );

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div
        className={cn(
          "group relative flex flex-col gap-1 px-2 py-2 rounded-lg text-xs transition-colors w-full text-left",
          isSelected
            ? "bg-muted/30 text-foreground ring-1 ring-border/40"
            : "text-foreground/80 hover:bg-muted/30",
        )}
      >
        {/* First row: editing indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-medium truncate leading-snug flex-1 min-w-0">
            Editing...
          </span>
        </div>

        {/* Second row: title input */}
        <div className="w-full min-w-0">
          <input
            type="text"
            value={editingTitle}
            onChange={(e) => onSetEditingTitle(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                onSaveRename(editingTitle);
              } else if (e.key === "Escape") {
                onCancelRename();
              }
            }}
            onBlur={() => onSaveRename(editingTitle)}
            className="w-full bg-background border border-border rounded px-2 py-1 text-[13px] font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            onClick={(e) => e.stopPropagation()}
            aria-label="Chat title"
            name="chat-title"
            autoComplete="off"
            ref={inputRef}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group relative flex items-center px-2 py-2 rounded-lg transition-all duration-200 cursor-pointer select-none w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isSelected
          ? "bg-muted/30 text-foreground ring-1 ring-border/40"
          : "text-foreground/80 hover:bg-muted/30",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="min-w-0 flex-1 pr-2 transition-[padding] duration-150 group-hover:pr-20">
        <p className="truncate font-semibold text-[15px] leading-tight">
          {chat.title || "Untitled"}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 transition-all duration-150 group-hover:opacity-0 group-hover:w-0 group-hover:overflow-hidden">
        {isStreaming && (
          <IconLoader2
            size={14}
            className={cn(
              "shrink-0 animate-spin",
              isSelected ? "text-primary" : "text-muted-foreground/60",
            )}
          />
        )}
        {/* Local/Cloud indicator */}
        {chat.isLocal !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                {chat.isLocal ? (
                  <IconDeviceDesktop size={12} className="text-muted-foreground/50" />
                ) : (
                  <IconCloud size={12} className="text-blue-400/70" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {chat.isLocal ? "Local storage" : "Cloud sync"}
            </TooltipContent>
          </Tooltip>
        )}
        <span className="text-[13px] text-muted-foreground font-medium tabular-nums">
          {formatRelativeTimeCompact(chat.updated_at)}
        </span>
      </div>
      {/* Action buttons - appear on hover, overlay right side */}
      <div
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity duration-150",
          "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
        )}
      >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "p-1 rounded-md transition-colors flex items-center justify-center",
                  chat.pinned
                    ? "text-primary opacity-100"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/30",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin();
                }}
              >
                {chat.pinned ? (
                  <IconPinFilled size={14} />
                ) : (
                  <IconPin size={14} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="end">
              {chat.pinned ? "Unpin" : "Pin"}
            </TooltipContent>
          </Tooltip>

          {!isArchived && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 rounded-md transition-colors flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive();
                  }}
                >
                  <IconArchive size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end">
                Archive
              </TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 rounded-md transition-colors active:scale-95 flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <IconDots size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onStartRename}>
                <IconPencil size={14} className="mr-2" />
                Rename
              </DropdownMenuItem>
              {isArchived ? (
                <DropdownMenuItem onClick={onRestore}>
                  <IconArchiveOff size={14} className="mr-2" />
                  Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onArchive}>
                  <IconArchive size={14} className="mr-2" />
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <IconTrash size={14} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    </div>
  );
}

// ============================================================================
// Section Header - Collapsible section header
// ============================================================================
interface SectionHeaderProps {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}

function SectionHeader({
  title,
  count,
  isOpen,
  onToggle,
  icon,
}: SectionHeaderProps) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 px-3 py-1.5 w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      onClick={onToggle}
    >
      {isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
      {icon}
      <span>{title}</span>
      <span className="ml-auto text-[10px] bg-muted/50 px-1.5 py-0.5 rounded-full">
        {count}
      </span>
    </button>
  );
}

// ============================================================================
// Main Sidebar Component
// ============================================================================
export function Sidebar() {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);
  const provider = useAtomValue(currentProviderAtom);
  const openSettingsPage = useOpenSettingsPage();
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const [agentPanelOpen, setAgentPanelOpen] = useAtom(agentPanelOpenAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const setSelectedArtifact = useSetAtom(selectedArtifactAtom);
  const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setCommandKOpen = useSetAtom(commandKOpenAtom);
  const showWindowsLogo = isWindows() && sidebarOpen;
  const isAgentEnabled =
    activeTab === "excel" || activeTab === "doc" || activeTab === "pdf";
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Section collapse state
  const [showRecent, setShowRecent] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Get API key status from main process
  const { data: keyStatus } = trpc.settings.getApiKeyStatus.useQuery();

  // Determine connection status based on provider
  // NOTE: gemini-advanced disabled
  const isConnected =
    provider === "chatgpt-plus"
      ? keyStatus?.hasChatGPTPlus
      : provider === "openai"
        ? keyStatus?.hasOpenAI
        : provider === "zai"
          ? keyStatus?.hasZai
          : provider === "claude"
            ? keyStatus?.hasClaudeCode
            : keyStatus?.hasAnthropic;

  // Fetch session
  const { data: session } = trpc.auth.getSession.useQuery();
  const user = session?.user;

  // Fetch all connected accounts (multi-account support)
  const { data: accountsData } = trpc.auth.getAccounts.useQuery();
  const accounts = accountsData?.accounts || [];
  const hasMultipleAccounts = accounts.length > 1;

  // Fetch chats (includes pinned, ordered correctly)
  const {
    data: chats,
    isLoading,
    refetch,
  } = trpc.chats.list.useQuery(undefined, {
    staleTime: 60_000,
    gcTime: 1000 * 60 * 30,
  });

  // Fetch archived chats
  const { data: archivedChats, refetch: refetchArchived } =
    trpc.chats.listArchived.useQuery(undefined, {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 30,
    });

  // Sort chats: pinned first, then by updated_at
  const sortedChats = useMemo(() => {
    return [...(chats || [])].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });
  }, [chats]);

  const filteredChats = useMemo(() => sortedChats, [sortedChats]);
  const filteredArchived = useMemo(
    () => archivedChats || [],
    [archivedChats],
  );

  const utils = trpc.useUtils();

  const [undoStack, setUndoStack] = useAtom(undoStackAtom);

  const removeUndoItem = useCallback(
    (item: UndoItem) => {
      setUndoStack((prev) => {
        const index = prev.findIndex(
          (entry) => entry.timeoutId === item.timeoutId,
        );
        if (index !== -1) {
          clearTimeout(prev[index].timeoutId);
          return [...prev.slice(0, index), ...prev.slice(index + 1)];
        }
        return prev;
      });
    },
    [setUndoStack],
  );

  const restoreChat = trpc.chats.restore.useMutation({
    onSuccess: () => {
      refetch();
      refetchArchived();
      toast.success("Chat restored");
    },
  });

  const restoreDeletedChat = trpc.chats.restoreDeleted.useMutation({
    onSuccess: () => {
      refetch();
      refetchArchived();
      toast.success("Chat restored");
    },
  });

  const restoreChatFromUndo = useCallback(
    (item: UndoItem) => {
      removeUndoItem(item);
      if (item.action === "archive") {
        restoreChat.mutate({ id: item.chatId });
      } else {
        restoreDeletedChat.mutate({ id: item.chatId });
      }
    },
    [removeUndoItem, restoreChat, restoreDeletedChat],
  );

  const createChat = trpc.chats.create.useMutation({
    onSuccess: (chat: Chat) => {
      utils.chats.get.invalidate({ id: chat.id });
      utils.chats.list.invalidate();
      setSelectedChatId(chat.id);
      setSelectedArtifact(null);
      setArtifactPanelOpen(false);
      setActiveTab("chat");
      refetch();
    },
    onError: (error) => {
      console.error("[Sidebar] Failed to create chat:", error);
    },
  });

  const deleteChat = trpc.chats.delete.useMutation({
    onSuccess: (_data, variables) => {
      refetch();
      refetchArchived();

      const undoItem: UndoItem = {
        action: "delete",
        chatId: variables.id,
        timeoutId: setTimeout(() => {
          removeUndoItem(undoItem);
        }, 10000),
      };

      setUndoStack((prev) => [...prev, undoItem]);

      // Show undo toast
      toast.success("Chat deleted", {
        action: {
          label: "Undo",
          onClick: () => restoreChatFromUndo(undoItem),
        },
      });
    },
  });

  const archiveChat = trpc.chats.archive.useMutation({
    onSuccess: (_data, variables) => {
      refetch();
      refetchArchived();
      if (selectedChatId === variables.id) {
        setSelectedChatId(null);
      }

      const undoItem: UndoItem = {
        action: "archive",
        chatId: variables.id,
        timeoutId: setTimeout(() => {
          removeUndoItem(undoItem);
        }, 10000),
      };

      setUndoStack((prev) => [...prev, undoItem]);

      // Show undo toast
      toast.success("Chat archived", {
        action: {
          label: "Undo",
          onClick: () => restoreChatFromUndo(undoItem),
        },
      });
    },
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "z" &&
        undoStack.length > 0
      ) {
        event.preventDefault();
        const lastItem = undoStack[undoStack.length - 1];
        if (!lastItem) return;

        restoreChatFromUndo(lastItem);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, restoreChatFromUndo]);

  const togglePin = trpc.chats.togglePin.useMutation({
    onSuccess: (data) => {
      refetch();
      toast.success(data.pinned ? "Chat pinned" : "Chat unpinned");
    },
  });

  const updateChat = trpc.chats.update.useMutation({
    onSuccess: () => {
      setEditingChatId(null);
      setEditingTitle("");
      refetch();
    },
  });

  const signOut = trpc.auth.signOut.useMutation({
    onSuccess: () => {
      window.desktopApi?.setSession(null);
      utils.auth.getSession.invalidate();
      utils.auth.getAccounts.invalidate();
    },
  });

  // Multi-account: switch to a different account
  const switchAccount = trpc.auth.switchAccount.useMutation({
    onSuccess: () => {
      // Invalidate ALL user-specific caches when switching accounts
      utils.auth.getSession.invalidate();
      utils.auth.getUser.invalidate();
      utils.auth.getAccounts.invalidate();
      utils.chats.list.invalidate();
      utils.chats.listArchived.invalidate();
      utils.artifacts.list.invalidate();
      utils.userFiles.list.invalidate();
      // Clear selected chat to avoid showing data from previous account
      setSelectedChatId(null);
      toast.success("Switched account");
    },
  });

  // Multi-account: add auth dialog control
  const setAuthDialogOpen = useSetAtom(authDialogOpenAtom);
  const setSettingsTab = useSetAtom(settingsActiveTabAtom);

  const handleNewChat = () => {
    setActiveTab("chat");
    createChat.mutate({ title: "New Chat" });
  };

  const handleChatSelect = (chatId: string) => {
    setSelectedChatId(chatId);
    setSelectedArtifact(null);
    setArtifactPanelOpen(false);
    setActiveTab("chat");
  };

  const handleDeleteChat = (chatId: string) => {
    deleteChat.mutate({ id: chatId });
    if (selectedChatId === chatId) {
      setSelectedChatId(null);
    }
  };

  const handleArchiveChat = (chatId: string) => {
    archiveChat.mutate({ id: chatId });
  };

  const handleRestoreChat = (chatId: string) => {
    restoreChat.mutate({ id: chatId });
  };

  const handleTogglePin = (chatId: string) => {
    togglePin.mutate({ id: chatId });
  };

  const handleStartRename = (chatId: string, currentTitle: string) => {
    setEditingChatId(chatId);
    setEditingTitle(currentTitle || "Untitled");
  };

  const handleSaveRename = (title: string) => {
    if (editingChatId && title.trim()) {
      updateChat.mutate({ id: editingChatId, title: title.trim() });
    } else {
      setEditingChatId(null);
      setEditingTitle("");
    }
  };

  const handleCancelRename = () => {
    setEditingChatId(null);
    setEditingTitle("");
  };

  const renderChatList = (chatList: Chat[], isArchived = false) => {
    if (chatList.length === 0) {
      return (
        <div className="text-xs text-muted-foreground text-center py-4 px-4">
          {isArchived ? "No archived chats" : "No conversations"}
        </div>
      );
    }

    return chatList.map((chat) => (
      <ChatItem
        key={chat.id}
        chat={chat}
        isSelected={selectedChatId === chat.id}
        isEditing={editingChatId === chat.id}
        editingTitle={editingTitle}
        onSelect={() => handleChatSelect(chat.id)}
        onStartRename={() => handleStartRename(chat.id, chat.title || "")}
        onSaveRename={handleSaveRename}
        onCancelRename={handleCancelRename}
        onSetEditingTitle={setEditingTitle}
        onArchive={() => handleArchiveChat(chat.id)}
        onDelete={() => handleDeleteChat(chat.id)}
        onTogglePin={() => handleTogglePin(chat.id)}
        onRestore={() => handleRestoreChat(chat.id)}
        isArchived={isArchived}
      />
    ));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className={cn(
          "px-4 h-9 flex items-center",
          isMacOS() ? "pl-20" : "",
          "drag-region",
        )}
      >
        <div className="flex w-full items-center justify-between">
          {showWindowsLogo ? (
            <div className="flex items-center gap-2 no-drag">
              <HamburgerMenu />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() =>
                      isAgentEnabled && setAgentPanelOpen(!agentPanelOpen)
                    }
                    disabled={!isAgentEnabled}
                    className={cn(
                      "flex items-center gap-2 transition-all duration-200 no-drag pointer-events-auto",
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
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl shrink-0 no-drag"
                  onClick={() => setActiveTab("gallery")}
                  aria-label="Open gallery"
                >
                  <IconPhoto size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="flex items-center gap-2 font-semibold"
              >
                Gallery
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl shrink-0 no-drag"
                  onClick={() => setCommandKOpen(true)}
                  aria-label="Search chats"
                >
                  <IconSearch size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="flex items-center gap-2 font-semibold"
              >
                Search chats
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  {isMacOS() ? "⌘" : "Ctrl"} K
                </kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-xl shrink-0 no-drag"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Collapse sidebar"
                >
                  <IconLayoutSidebarLeftCollapse size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="flex items-center gap-2 font-semibold"
              >
                Collapse Sidebar
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  {navigator.platform.toLowerCase().includes("mac")
                    ? "⌘"
                    : "Ctrl"}{" "}
                  \
                </kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Page Navigation */}
      <div className="px-2 pt-1 pb-2">
        <PageNav onNewChat={handleNewChat} />
      </div>

      <Separator className="my-1 opacity-40" />

      <div className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Threads
      </div>

      {/* Chat list with fade scroll effect */}
      <FadeScrollArea className="flex-1 pl-4 pr-2">
        <div className="pb-4 pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              {/* History Section (includes Pinned and Recent) */}
              <div className="mb-2">
                <SectionHeader
                  title="History"
                  count={filteredChats.length}
                  isOpen={showRecent}
                  onToggle={() => setShowRecent(!showRecent)}
                  icon={<IconPin size={12} />}
                />
                {showRecent && (
                  <div className="space-y-1">
                    {filteredChats.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-8 px-4">
                        <IconPin
                          size={32}
                          className="mx-auto mb-2 opacity-30"
                        />
                        <p>
                          No conversations yet
                        </p>
                      </div>
                    ) : (
                      renderChatList(filteredChats)
                    )}
                  </div>
                )}
              </div>

              {/* Archived Section */}
              {(archivedChats?.length ?? 0) > 0 && (
                <div className="mb-2 border-t border-border/50 pt-2 mt-4">
                  <SectionHeader
                    title="Archived"
                    count={filteredArchived.length}
                    isOpen={showArchived}
                    onToggle={() => setShowArchived(!showArchived)}
                    icon={<IconArchive size={12} />}
                  />
                  {showArchived && (
                    <div className="space-y-1">
                      {renderChatList(filteredArchived, true)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </FadeScrollArea>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border space-y-3">
        {/* AI Provider Status */}
        <button
          type="button"
          onClick={() => openSettingsPage()}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            "hover:bg-muted/30 text-left",
          )}
        >
          {provider === "chatgpt-plus" ? (
            <IconBrandOpenai size={18} className="shrink-0 text-emerald-600" />
          ) : provider === "openai" ? (
            <IconBrandOpenai size={18} className="shrink-0" />
          ) : provider === "zai" ? (
            <ZaiIcon className="shrink-0 text-amber-500" size={18} />
          ) : (
            // NOTE: gemini-advanced disabled
            <IconBrain size={18} className="shrink-0" />
          )}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <p className="font-medium truncate">
                {provider === "chatgpt-plus"
                  ? "ChatGPT Plus"
                  : provider === "openai"
                    ? "OpenAI"
                    : provider === "zai"
                      ? "Z.AI"
                      : // NOTE: gemini-advanced disabled
                        "Anthropic"}
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground leading-none">
              {isConnected ? "Connected" : "Not configured"}
            </p>
          </div>
          <span
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              isConnected ? "bg-green-500" : "bg-yellow-500",
            )}
          />
        </button>

        <div className="flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 w-full justify-start gap-2 px-2 hover:bg-muted/30 relative"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage
                    src={
                      user?.user_metadata?.avatar_url ||
                      user?.user_metadata?.picture
                    }
                  />
                  <AvatarFallback className="bg-primary/10">
                    {user?.email?.charAt(0).toUpperCase() || (
                      <IconUser size={14} />
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 text-left truncate text-xs font-medium">
                  {user?.email || "Not logged in"}
                </span>
                <IconDots size={14} className="opacity-40" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-64">
              {/* Account List Section */}
              {accounts.length > 0 && (
                <>
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <IconUsers size={12} />
                      Accounts
                    </span>
                    {hasMultipleAccounts && (
                      <span className="text-[9px] text-muted-foreground">
                        {accounts.length} connected
                      </span>
                    )}
                  </DropdownMenuLabel>
                  <div className="max-h-40 overflow-y-auto">
                    {accounts.map((account) => (
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
                            {account.avatarUrl ? (
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
                            {account.isLocal ? "Local Account" : account.email}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {account.isLocal ? "Offline mode" : account.provider || "Cloud"}
                          </p>
                        </div>
                        {account.isActive && (
                          <IconCheck size={14} className="text-green-500 shrink-0" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Add Account */}
              <DropdownMenuItem
                onClick={() => setAuthDialogOpen(true)}
                className="gap-2"
              >
                <IconPlus size={14} />
                Add Account
              </DropdownMenuItem>

              {/* Manage Accounts (only show if multiple) */}
              {hasMultipleAccounts && (
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsTab("account");
                    openSettingsPage();
                  }}
                  className="gap-2"
                >
                  <IconUsers size={14} />
                  Manage Accounts...
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              {/* Settings */}
              <DropdownMenuItem
                onClick={() => openSettingsPage()}
                className="justify-between"
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

              {/* Sign out current account */}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOut.mutate()}
              >
                <IconLogout size={14} className="mr-2" />
                {hasMultipleAccounts ? "Sign out current" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
