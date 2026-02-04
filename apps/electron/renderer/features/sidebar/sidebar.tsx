import type { ReactNode } from "react";
import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
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
  IconGripVertical,
  IconLayoutSidebarLeftCollapse,
  IconFolder,
  IconFolderPlus,
} from "@tabler/icons-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
        className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent w-full pr-1"
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
  project_id?: string | null;
  sort_order?: number;
  isLocal?: boolean;
  meta?: {
    spreadsheets: number;
    documents: number;
    hasCode: boolean;
    hasImages: boolean;
    messageCount: number;
  };
}

interface Project {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  is_collapsed: boolean;
  sort_order: number;
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
  projects?: Project[];
  onMoveToProject?: (projectId: string | null) => void;
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
  projects,
  onMoveToProject,
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
          "group relative flex flex-col gap-1 pr-2 pl-2 py-2 rounded-lg text-xs transition-colors w-full text-left",
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
        "group relative flex items-center pr-2 pl-2 py-2 rounded-lg transition-all duration-150 cursor-pointer select-none w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary",
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
        <p className="truncate font-medium text-[14px] leading-tight">
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
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onStartRename}>
                <IconPencil size={14} className="mr-2" />
                Rename
              </DropdownMenuItem>
              {!isArchived && projects && onMoveToProject && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <IconFolder size={14} className="mr-2" />
                    Move to Project
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <DropdownMenuItem
                      onClick={() => onMoveToProject(null)}
                      className={!chat.project_id ? "bg-muted/50" : ""}
                    >
                      <IconArchiveOff size={14} className="mr-2" />
                      No Project
                    </DropdownMenuItem>
                    {projects.length > 0 && <DropdownMenuSeparator />}
                    {projects.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => onMoveToProject(project.id)}
                        className={chat.project_id === project.id ? "bg-muted/50" : ""}
                      >
                        <span className="mr-2">{project.icon}</span>
                        <span className="truncate">{project.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
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
// Collapsible container with smooth height animation
// ============================================================================
interface CollapsibleSectionProps {
  isOpen: boolean;
  className?: string;
  children: ReactNode;
}

function CollapsibleSection({
  isOpen,
  className,
  children,
}: CollapsibleSectionProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState("0px");

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateHeight = () => {
      setMaxHeight(isOpen ? `${el.scrollHeight}px` : "0px");
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  return (
    <div
      className={cn(
        "overflow-hidden will-change-[max-height,opacity] transition-[max-height,opacity] duration-200 ease-out",
        isOpen ? "opacity-100" : "opacity-0",
        className
      )}
      style={{ maxHeight }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

// ============================================================================
// Project Folder - Collapsible folder containing chats
// ============================================================================
interface ProjectFolderProps {
  project: Project;
  chats: Chat[];
  allProjects: Project[];
  selectedChatId: string | null;
  editingChatId: string | null;
  editingTitle: string;
  onToggleCollapse: () => void;
  onSelectChat: (chatId: string) => void;
  onStartRename: (chatId: string, title: string) => void;
  onSaveRename: (title: string) => void;
  onCancelRename: () => void;
  onSetEditingTitle: (title: string) => void;
  onArchiveChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onTogglePin: (chatId: string) => void;
  onMoveChat: (chatId: string, projectId: string | null) => void;
  onCreateChat: () => void;
  onRenameProject: () => void;
  onDeleteProject: () => void;
}

function ProjectFolder({
  project,
  chats,
  allProjects,
  selectedChatId,
  editingChatId,
  editingTitle,
  onToggleCollapse,
  onSelectChat,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onSetEditingTitle,
  onArchiveChat,
  onDeleteChat,
  onTogglePin,
  onMoveChat,
  onCreateChat,
  onRenameProject,
  onDeleteProject,
}: ProjectFolderProps) {
  const [showAllChats, setShowAllChats] = useState(false);
  const MAX_VISIBLE_CHATS = 10;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `project-${project.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const visibleChats = showAllChats ? chats : chats.slice(0, MAX_VISIBLE_CHATS);
  const hasMoreChats = chats.length > MAX_VISIBLE_CHATS;
  const hiddenCount = chats.length - MAX_VISIBLE_CHATS;

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* Project header */}
      <div className="flex items-center group/project">
        {/* Drag handle for project */}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover/project:opacity-100 cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-opacity"
        >
          <IconGripVertical size={10} />
        </div>
        <button
          type="button"
          className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/30"
          onClick={onToggleCollapse}
          aria-expanded={!project.is_collapsed}
        >
          {project.is_collapsed ? (
            <IconChevronRight size={12} />
          ) : (
            <IconChevronDown size={12} />
          )}
          <span className="text-sm shrink-0">{project.icon}</span>
          <span className="truncate flex-1 min-w-0 text-left text-[13px]">{project.name}</span>
          <span className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
            {chats.length}
          </span>
        </button>
        {/* Project actions */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="opacity-0 group-hover/project:opacity-100 p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 rounded-md transition-all"
              onClick={(e) => {
                e.stopPropagation();
                onCreateChat();
              }}
            >
              <IconPlus size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">New thread</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="opacity-0 group-hover/project:opacity-100 p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 rounded-md transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              <IconDots size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onCreateChat}>
              <IconPlus size={14} className="mr-2" />
              New Thread
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRenameProject}>
              <IconPencil size={14} className="mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDeleteProject}>
              <IconTrash size={14} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Chats inside the project */}
      <CollapsibleSection isOpen={!project.is_collapsed} className="pl-3">
        <div className="relative ml-2 border-l border-border/60 pl-3 space-y-0.5 py-1">
          {visibleChats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isSelected={selectedChatId === chat.id}
              isEditing={editingChatId === chat.id}
              editingTitle={editingTitle}
              onSelect={() => onSelectChat(chat.id)}
              onStartRename={() => onStartRename(chat.id, chat.title || "")}
              onSaveRename={onSaveRename}
              onCancelRename={onCancelRename}
              onSetEditingTitle={onSetEditingTitle}
              onArchive={() => onArchiveChat(chat.id)}
              onDelete={() => onDeleteChat(chat.id)}
              onTogglePin={() => onTogglePin(chat.id)}
              projects={allProjects}
              onMoveToProject={(projectId) => onMoveChat(chat.id, projectId)}
            />
          ))}
          {hasMoreChats && !showAllChats && (
            <button
              type="button"
              className="w-full text-[11px] text-muted-foreground hover:text-foreground py-1.5 px-2 hover:bg-muted/30 rounded-md transition-colors text-left"
              onClick={() => setShowAllChats(true)}
            >
              Show {hiddenCount} more...
            </button>
          )}
          {showAllChats && hasMoreChats && (
            <button
              type="button"
              className="w-full text-[11px] text-muted-foreground hover:text-foreground py-1.5 px-2 hover:bg-muted/30 rounded-md transition-colors text-left"
              onClick={() => setShowAllChats(false)}
            >
              Show less
            </button>
          )}
          {chats.length === 0 && (
            <div className="text-[11px] text-muted-foreground/50 py-2 px-2 italic">
              No threads yet
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ============================================================================
// Main Sidebar Component
// ============================================================================
export function Sidebar() {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);
  const provider = useAtomValue(currentProviderAtom);
  const openSettingsPage = useOpenSettingsPage();
  const setSidebarOpen = useSetAtom(sidebarOpenAtom);
  const [agentPanelOpen, setAgentPanelOpen] = useAtom(agentPanelOpenAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const setSelectedArtifact = useSetAtom(selectedArtifactAtom);
  const setArtifactPanelOpen = useSetAtom(artifactPanelOpenAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setCommandKOpen = useSetAtom(commandKOpenAtom);
  const isAgentEnabled =
    activeTab === "excel" || activeTab === "doc" || activeTab === "pdf";
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);

  // Pending project for new chat creation
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  // Fetch projects
  const { data: projects, refetch: refetchProjects } =
    trpc.projects.list.useQuery(undefined, {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 30,
    });

  // Project mutations
  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      refetchProjects();
      setIsCreatingProject(false);
      setNewProjectName("");
      toast.success("Project created");
    },
    onError: (error) => {
      toast.error(`Failed to create project: ${error.message}`);
    },
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      refetchProjects();
      refetch();
      toast.success("Project deleted");
    },
  });

  const toggleProjectCollapse = trpc.projects.toggleCollapse.useMutation({
    onSuccess: () => {
      refetchProjects();
    },
  });

  const moveChat = trpc.projects.moveChat.useMutation({
    onSuccess: () => {
      refetch();
      refetchProjects();
    },
  });

  const reorderProjects = trpc.projects.reorder.useMutation({
    onSuccess: () => {
      refetchProjects();
    },
  });

  // Sort chats: pinned first, then by sort_order, then by updated_at
  const sortedChats = useMemo(() => {
    return [...(chats || [])].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // Sort by sort_order if both have same project
      if (a.project_id === b.project_id) {
        const sortDiff = (a.sort_order || 0) - (b.sort_order || 0);
        if (sortDiff !== 0) return sortDiff;
      }
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });
  }, [chats]);

  // Group chats by project
  const chatsByProject = useMemo(() => {
    const grouped: Record<string, Chat[]> = { unassigned: [] };
    for (const project of projects || []) {
      grouped[project.id] = [];
    }
    for (const chat of sortedChats) {
      if (chat.project_id && grouped[chat.project_id]) {
        grouped[chat.project_id].push(chat);
      } else {
        grouped.unassigned.push(chat);
      }
    }
    return grouped;
  }, [sortedChats, projects]);

  // DnD handlers for project reordering
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Only handle project reordering
    if (activeIdStr.startsWith("project-") && overIdStr.startsWith("project-")) {
      const projectIds = (projects || []).map((p) => p.id);
      const activeIndex = projectIds.indexOf(activeIdStr.replace("project-", ""));
      const overIndex = projectIds.indexOf(overIdStr.replace("project-", ""));

      if (activeIndex !== -1 && overIndex !== -1) {
        // Reorder the array
        const newOrder = [...projectIds];
        const [removed] = newOrder.splice(activeIndex, 1);
        newOrder.splice(overIndex, 0, removed);
        reorderProjects.mutate({ projectIds: newOrder });
      }
    }
  };

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
      toast.success("Chat restored");
    },
  });

  const restoreDeletedChat = trpc.chats.restoreDeleted.useMutation({
    onSuccess: () => {
      refetch();
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
      // If there's a pending project, move the chat to it
      if (pendingProjectId) {
        moveChat.mutate({ chatId: chat.id, projectId: pendingProjectId });
        setPendingProjectId(null);
      }
    },
    onError: (error) => {
      console.error("[Sidebar] Failed to create chat:", error);
      setPendingProjectId(null);
    },
  });

  const deleteChat = trpc.chats.delete.useMutation({
    onSuccess: (_data, variables) => {
      refetch();

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
      utils.gallery.list.invalidate();
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

  return (
    <div className="flex flex-col h-full">
      {/* Header - Native titlebar area */}
      <div
        className={cn(
          "px-2 h-9 flex items-center shrink-0",
          "drag-region",
          // macOS: leave space for traffic lights (80px padding)
          isMacOS() ? "pl-20" : "",
        )}
      >
        <div className="flex w-full items-center justify-between">
          {/* Left side: Windows has Hamburger + Logo, macOS has spacer */}
          {isWindows() ? (
            <div className="flex items-center gap-1.5 no-drag shrink-0">
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
                      "flex items-center gap-1.5 transition-all duration-200 no-drag pointer-events-auto",
                      isAgentEnabled &&
                        "hover:opacity-80 active:scale-95 cursor-pointer",
                      !isAgentEnabled && "cursor-default",
                      isAgentEnabled && agentPanelOpen && "text-primary",
                    )}
                  >
                    <Logo size={18} />
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

          {/* Action buttons - always on the right */}
          <div className="flex items-center gap-0.5 no-drag">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md shrink-0 no-drag"
                  onClick={() => setActiveTab("gallery")}
                  aria-label="Open gallery"
                >
                  <IconPhoto size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Gallery
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md shrink-0 no-drag"
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
                  className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md shrink-0 no-drag"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Collapse sidebar"
                >
                  <IconLayoutSidebarLeftCollapse size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Collapse
                <kbd className="ml-2 pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
                  {isMacOS() ? "⌘" : "Ctrl"}\
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

      {/* Threads header with actions */}
      <div className="px-3 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Threads
        </span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 rounded-md transition-colors"
                onClick={() => {
                  setIsCreatingProject(true);
                  setTimeout(() => newProjectInputRef.current?.focus(), 50);
                }}
              >
                <IconFolderPlus size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New Project</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Chat list with fade scroll effect */}
      <FadeScrollArea className="flex-1 pl-2 pr-2">
        <div className="pb-4 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {/* New project input */}
              {isCreatingProject && (
                <div className="mb-2 px-2">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 rounded-md">
                    <IconFolder size={14} className="text-muted-foreground shrink-0" />
                    <input
                      ref={newProjectInputRef}
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newProjectName.trim()) {
                          createProject.mutate({ name: newProjectName.trim() });
                        } else if (e.key === "Escape") {
                          setIsCreatingProject(false);
                          setNewProjectName("");
                        }
                      }}
                      onBlur={() => {
                        if (newProjectName.trim()) {
                          createProject.mutate({ name: newProjectName.trim() });
                        } else {
                          setIsCreatingProject(false);
                        }
                      }}
                      placeholder="Project name..."
                      className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
              )}

              {/* Projects */}
              <SortableContext
                items={(projects || []).map((p) => `project-${p.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {(projects || []).map((project) => (
                  <ProjectFolder
                    key={project.id}
                    project={project}
                    chats={chatsByProject[project.id] || []}
                    allProjects={projects || []}
                    selectedChatId={selectedChatId}
                    editingChatId={editingChatId}
                    editingTitle={editingTitle}
                    onToggleCollapse={() => toggleProjectCollapse.mutate({ id: project.id })}
                    onSelectChat={handleChatSelect}
                    onStartRename={handleStartRename}
                    onSaveRename={handleSaveRename}
                    onCancelRename={handleCancelRename}
                    onSetEditingTitle={setEditingTitle}
                    onArchiveChat={handleArchiveChat}
                    onDeleteChat={handleDeleteChat}
                    onTogglePin={handleTogglePin}
                    onMoveChat={(chatId, projectId) => moveChat.mutate({ chatId, projectId })}
                    onCreateChat={() => {
                      setPendingProjectId(project.id);
                      createChat.mutate({ title: "New Chat" });
                    }}
                    onRenameProject={() => {
                      toast.info("Rename project coming soon");
                    }}
                    onDeleteProject={() => deleteProject.mutate({ id: project.id })}
                  />
                ))}
              </SortableContext>

              {/* Unassigned chats - displayed directly without wrapper */}
              {chatsByProject.unassigned?.map((chat) => (
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
                  projects={projects || []}
                  onMoveToProject={(projectId) => moveChat.mutate({ chatId: chat.id, projectId })}
                />
              ))}

              {/* Drag overlay for projects */}
              <DragOverlay>
                {activeId && activeId.startsWith("project-") ? (() => {
                  const projectId = activeId.replace("project-", "");
                  const project = projects?.find((p) => p.id === projectId);
                  return project ? (
                    <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border border-border/50 px-3 py-2 text-sm flex items-center gap-2">
                      <span>{project.icon}</span>
                      <span className="font-medium">{project.name}</span>
                    </div>
                  ) : null;
                })() : null}
              </DragOverlay>
            </DndContext>
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
                {(() => {
                  const activeAccount = accounts.find(a => a.isActive);
                  const avatarUrl = activeAccount?.avatarUrl || '';
                  const isEmoji = avatarUrl.startsWith('emoji://');
                  const emoji = isEmoji ? decodeURIComponent(avatarUrl.split('://')[1]?.split('?')[0] || '👤') : null;
                  const bgColor = isEmoji ? decodeURIComponent(avatarUrl.split('bg=')[1] || '#6366f1') : null;

                  return (
                    <Avatar className="h-6 w-6">
                      {isEmoji ? (
                        <AvatarFallback
                          className="text-sm"
                          style={{ backgroundColor: bgColor || undefined }}
                        >
                          {emoji}
                        </AvatarFallback>
                      ) : avatarUrl && !activeAccount?.isLocal ? (
                        <AvatarImage src={avatarUrl} />
                      ) : null}
                      <AvatarFallback className="bg-primary/10">
                        {activeAccount?.isLocal ? (
                          <IconDeviceDesktop size={14} />
                        ) : (
                          (activeAccount?.email || user?.email)?.charAt(0).toUpperCase() || (
                            <IconUser size={14} />
                          )
                        )}
                      </AvatarFallback>
                    </Avatar>
                  );
                })()}
                <span className="flex-1 text-left truncate text-xs font-medium">
                  {(() => {
                    const activeAccount = accounts.find(a => a.isActive);
                    if (activeAccount?.isLocal) {
                      return activeAccount.displayName || "Cuenta Local";
                    }
                    return activeAccount?.email || user?.email || "Not logged in";
                  })()}
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
                      const isEmoji = account.avatarUrl?.startsWith('emoji://');
                      const emoji = isEmoji ? decodeURIComponent(account.avatarUrl!.split('://')[1]?.split('?')[0] || '👤') : null;
                      const bgColor = isEmoji ? decodeURIComponent(account.avatarUrl!.split('bg=')[1] || '#6366f1') : null;

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
                              ) : account.avatarUrl && !account.isLocal ? (
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
                              {account.isLocal ? (account.displayName || "Cuenta Local") : account.email}
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

              {/* Add Account */}
              <DropdownMenuItem
                onClick={() => setAuthDialogOpen(true)}
                className="gap-2"
              >
                <IconPlus size={14} />
                Agregar cuenta
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
                  Administrar cuentas...
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
                  Configuración
                </span>
                <kbd className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                  {isMacOS() ? "⌘," : "Ctrl+,"}
                </kbd>
              </DropdownMenuItem>

              {/* Sign out current account */}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOut.mutate()}
              >
                <IconLogout size={14} className="mr-2" />
                {hasMultipleAccounts ? "Cerrar sesión actual" : "Cerrar sesión"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
