/**
 * Notes Sidebar - Notion-like sidebar for managing notes, pages, and spaces
 *
 * Features:
 * - Hierarchical page structure (pages can have sub-pages)
 * - Spaces (collections of pages)
 * - Favorites section
 * - Search functionality
 * - Create/delete/rename pages and spaces
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
  IconPlus,
  IconSearch,
  IconPin,
  IconPinFilled,
  IconTrash,
  IconPencil,
  IconDots,
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconFolderPlus,
  IconHome,
  IconLayoutSidebarLeftCollapse,
  IconFileTypePdf,
} from "@tabler/icons-react";
import {
  selectedNotePageIdAtom,
  notesSidebarOpenAtom,
  notePagesCacheAtom,
  openNoteTabsAtom,
  notesSelectedModelIdAtom,
  notesEditorRefAtom,
  notesIsExportingPdfAtom,
  currentProviderAtom,
  createNotePageActionAtom,
  notesPageUpdatedAtom,
} from "@/lib/atoms";
import {
  getAllPages,
  getAllSpaces,
  getFavoritesPages,
  createPage,
  createSpace,
  deletePage,
  deleteSpace,
  savePage,
  type NotePage,
  type NoteSpace,
} from "@/lib/notes-storage";
import {
  addOpenTab,
  getOpenTabs,
  updateTabPage,
  replaceCurrentTab,
} from "@/lib/notes-tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, isMac } from "@/lib/utils";
import { toast } from "sonner";
import { ModelIcon } from "@/components/icons/model-icons";
import type { AIProvider } from "@s-agi/core/types/ai";
import { IconPicker } from "@/components/ui/icon-picker";
import { renderPageIcon } from "@/lib/notes-icon-utils";
import { Logo } from "@/components/ui/logo";

// ============================================================================
// FadeScrollArea - Reuse from chat sidebar
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

    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll]);

  return (
    <div className={cn("relative flex-1 overflow-hidden w-full", className)}>
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none transition-opacity duration-200",
          "bg-gradient-to-b from-sidebar to-transparent",
          canScrollUp ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent w-full"
      >
        {children}
      </div>
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

// ============================================================================
// PageItem - Individual page item with context menu
// ============================================================================
interface PageItemProps {
  page: NotePage;
  isSelected: boolean;
  isEditing: boolean;
  editingTitle: string;
  level: number; // Indentation level for nested pages
  onSelect: () => void;
  onStartRename: () => void;
  onSaveRename: (title: string) => void;
  onCancelRename: () => void;
  onSetEditingTitle: (title: string) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onChangeIcon?: (icon: string) => void;
  onCreateSubPage?: () => void;
  hasChildren: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

function PageItem({
  page,
  isSelected,
  isEditing,
  editingTitle,
  level,
  onSelect,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onSetEditingTitle,
  onDelete,
  onTogglePin,
  onChangeIcon,
  onCreateSubPage,
  hasChildren,
  isExpanded = false,
  onToggleExpand,
}: PageItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-all duration-200 cursor-pointer select-none w-full text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary",
        isSelected
          ? "bg-accent/80 text-accent-foreground"
          : "text-foreground/70 hover:bg-accent/50 hover:text-foreground",
      )}
      style={{ paddingLeft: `${8 + level * 16}px` }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Expand/collapse button for pages with children */}
      {hasChildren && onToggleExpand && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="shrink-0 w-4 h-4 flex items-center justify-center hover:bg-accent rounded cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleExpand();
            }
          }}
        >
          {isExpanded ? (
            <IconChevronDown size={12} />
          ) : (
            <IconChevronRight size={12} />
          )}
        </div>
      )}
      {!hasChildren && <div className="w-4" />}

      {/* Icon */}
      {onChangeIcon ? (
        <IconPicker currentIcon={page.icon} onSelect={onChangeIcon}>
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            className={cn(
              "shrink-0 flex items-center justify-center w-5 h-5 rounded hover:bg-accent transition-colors cursor-pointer",
              isSelected ? "text-primary" : "text-muted-foreground/60",
            )}
            role="button"
            tabIndex={0}
          >
            {renderPageIcon(page.icon, 14, "")}
          </div>
        </IconPicker>
      ) : (
        <div className="shrink-0">
          {renderPageIcon(
            page.icon,
            14,
            cn(
              "shrink-0 transition-colors",
              isSelected ? "text-primary" : "text-muted-foreground/60",
            ),
          )}
        </div>
      )}

      {/* Title or input */}
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editingTitle}
          onChange={(e) => onSetEditingTitle(e.target.value)}
          onBlur={() => onSaveRename(editingTitle)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSaveRename(editingTitle);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelRename();
            }
          }}
          className="h-6 text-sm flex-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate text-sm">{page.title}</span>
      )}

      {/* Actions */}
      <div
        className={cn(
          "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          isSelected && "opacity-100",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              className="p-1 hover:bg-accent rounded transition-colors cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onTogglePin();
                }
              }}
            >
              {page.pinned ? (
                <IconPinFilled size={12} className="text-primary" />
              ) : (
                <IconPin size={12} className="text-muted-foreground" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            {page.pinned ? "Unpin" : "Pin"}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className="p-1 hover:bg-accent rounded transition-colors cursor-pointer"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <IconDots size={12} className="text-muted-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {onCreateSubPage && (
              <>
                <DropdownMenuItem onClick={onCreateSubPage}>
                  <IconPlus size={14} className="mr-2" />
                  Add sub-page
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {onChangeIcon && (
              <>
                <DropdownMenuItem asChild>
                  <IconPicker currentIcon={page.icon} onSelect={onChangeIcon}>
                    <div className="flex items-center w-full cursor-pointer">
                      <IconPencil size={14} className="mr-2" />
                      Change icon
                    </div>
                  </IconPicker>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={onStartRename}>
              <IconPencil size={14} className="mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
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
// SpaceSection - Section for a space with its pages
// ============================================================================
interface SpaceSectionProps {
  space: NoteSpace;
  pages: NotePage[];
  selectedPageId: string | null;
  expandedSpaces: Set<string>;
  expandedPages: Set<string>;
  editingPageId: string | null;
  editingTitle: string;
  onToggleSpace: () => void;
  onSelectPage: (pageId: string) => void;
  onStartRenamePage: (pageId: string) => void;
  onSaveRenamePage: (pageId: string, title: string) => void;
  onCancelRenamePage: () => void;
  onSetEditingTitle: (title: string) => void;
  onDeletePage: (pageId: string) => void;
  onTogglePinPage: (pageId: string) => void;
  onChangeIconPage: (pageId: string, icon: string) => void;
  onTogglePageExpand: (pageId: string) => void;
  onCreatePage: (spaceId: string, parentId?: string) => void;
  onCreateSubPage: (parentId: string) => void;
  onDeleteSpace: (spaceId: string) => void;
}

function SpaceSection({
  space,
  pages,
  selectedPageId,
  expandedSpaces,
  expandedPages,
  editingPageId,
  editingTitle,
  onToggleSpace,
  onSelectPage,
  onStartRenamePage,
  onSaveRenamePage,
  onCancelRenamePage,
  onSetEditingTitle,
  onTogglePinPage,
  onChangeIconPage,
  onDeletePage,
  onTogglePageExpand,
  onCreatePage,
  onCreateSubPage,
  onDeleteSpace,
}: SpaceSectionProps) {
  const isExpanded = expandedSpaces.has(space.id);
  const rootPages = pages.filter((p) => !p.parentId);

  const renderPageTree = (page: NotePage, level: number = 0) => {
    const children = pages.filter((p) => p.parentId === page.id);
    const isExpanded = expandedPages.has(page.id);
    const hasChildren = children.length > 0;

    return (
      <div key={page.id}>
        <PageItem
          page={page}
          isSelected={selectedPageId === page.id}
          isEditing={editingPageId === page.id}
          editingTitle={editingTitle}
          level={level}
          onSelect={() => onSelectPage(page.id)}
          onStartRename={() => onStartRenamePage(page.id)}
          onSaveRename={(title) => onSaveRenamePage(page.id, title)}
          onCancelRename={onCancelRenamePage}
          onSetEditingTitle={onSetEditingTitle}
          onDelete={() => onDeletePage(page.id)}
          onTogglePin={() => onTogglePinPage(page.id)}
          onChangeIcon={(icon) => onChangeIconPage(page.id, icon)}
          onCreateSubPage={() => onCreateSubPage(page.id)}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggleExpand={() => onTogglePageExpand(page.id)}
        />
        {isExpanded && hasChildren && (
          <div>{children.map((child) => renderPageTree(child, level + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-2 py-1.5 group mb-1">
        <button
          type="button"
          onClick={onToggleSpace}
          className="shrink-0 w-4 h-4 flex items-center justify-center hover:bg-accent rounded transition-colors"
        >
          {isExpanded ? (
            <IconChevronDown size={12} className="text-muted-foreground" />
          ) : (
            <IconChevronRight size={12} className="text-muted-foreground" />
          )}
        </button>
        {space.icon ? (
          <span className="text-base shrink-0">{space.icon}</span>
        ) : (
          <IconFolder size={14} className="text-muted-foreground/60 shrink-0" />
        )}
        <span className="flex-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {space.name}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity duration-150"
            >
              <IconDots size={12} className="text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onCreatePage(space.id)}>
              <IconPlus size={14} className="mr-2" />
              New Page
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteSpace(space.id)}
              className="text-destructive focus:text-destructive"
            >
              <IconTrash size={14} className="mr-2" />
              Delete Space
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isExpanded && (
        <div className="ml-2 space-y-0.5">
          {rootPages.map((page) => renderPageTree(page, 0))}
          {rootPages.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground/60 italic">
              No pages yet
            </div>
          )}
          {/* Add content button (Notion-style) */}
          <button
            type="button"
            onClick={() => onCreatePage(space.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors mt-1"
          >
            <IconPlus size={12} />
            <span>Add content</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main NotesSidebar Component
// ============================================================================
export function NotesSidebar() {
  const [selectedPageId, setSelectedPageId] = useAtom(selectedNotePageIdAtom);
  const [sidebarOpen, setSidebarOpen] = useAtom(notesSidebarOpenAtom);
  const setOpenTabs = useSetAtom(openNoteTabsAtom);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const setNotePage = useSetAtom(notePagesCacheAtom);

  // Notes editor controls (same as titlebar)
  const [selectedModelId, setSelectedModelId] = useAtom(
    notesSelectedModelIdAtom,
  );
  const editorRef = useAtomValue(notesEditorRefAtom);
  const [isExportingPdf] = useAtom(notesIsExportingPdfAtom);
  const provider = useAtomValue(currentProviderAtom);

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

  // Get provider icon for sidebar (icon-only display)
  const providerForIcon: AIProvider = provider === "zai" ? "zai" : "openai";

  const handleExportPdf = useCallback(async () => {
    if (editorRef?.exportPdf) {
      await editorRef.exportPdf();
    }
  }, [editorRef]);

  // Load data
  const [pages, setPages] = useState<NotePage[]>([]);
  const [spaces, setSpaces] = useState<NoteSpace[]>([]);
  const [favorites, setFavorites] = useState<NotePage[]>([]);

  const refreshData = useCallback(() => {
    const allPages = getAllPages();
    const allSpaces = getAllSpaces();
    const favs = getFavoritesPages();

    setPages(allPages);
    setSpaces(allSpaces);
    setFavorites(favs);
  }, []);

  // Listen for page updates from header or other components
  const pageUpdated = useAtomValue(notesPageUpdatedAtom);
  const notifyPageUpdate = useSetAtom(notesPageUpdatedAtom);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Separate effect to refresh when page is updated externally
  useEffect(() => {
    if (pageUpdated > 0) {
      refreshData();
    }
  }, [pageUpdated, refreshData]);

  // Filter pages by search
  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return pages;
    const query = searchQuery.toLowerCase();
    return pages.filter(
      (p) => p.title.toLowerCase().includes(query) && !p.archived,
    );
  }, [pages, searchQuery]);

  const handleSelectPage = useCallback(
    (pageId: string) => {
      setSelectedPageId(pageId);
      const page = pages.find((p) => p.id === pageId);
      if (page) {
        // Load page into cache
        setNotePage((prev) => ({ ...prev, [pageId]: page }));

        const existingTabs = getOpenTabs();
        const isAlreadyOpen = existingTabs.some((t) => t.pageId === pageId);
        const isRootPage = !page.parentId;

        if (isAlreadyOpen) {
          // Page is already open in a tab, just update it
          updateTabPage(page);
          const tabs = getOpenTabs();
          setOpenTabs(tabs);
        } else if (isRootPage) {
          // Root page: create new tab
          addOpenTab(page);
          const tabs = getOpenTabs();
          setOpenTabs(tabs);
        } else {
          // Sub-page: replace current active tab (navigate within same tab)
          // Find the currently active tab (last one or selected one)
          if (existingTabs.length > 0) {
            replaceCurrentTab(pageId, page);
            const tabs = getOpenTabs();
            setOpenTabs(tabs);
          } else {
            // No tabs open, create first tab
            addOpenTab(page);
            const tabs = getOpenTabs();
            setOpenTabs(tabs);
          }
        }
      }
    },
    [pages, setSelectedPageId, setNotePage, setOpenTabs],
  );

  const setCreatePageAction = useSetAtom(createNotePageActionAtom);

  const handleCreatePage = useCallback(
    (spaceId: string | null = null, parentId: string | null = null) => {
      const newPage = createPage("Untitled", spaceId, parentId);
      setSelectedPageId(newPage.id);
      // Load page into cache
      setNotePage((prev) => ({ ...prev, [newPage.id]: newPage }));
      // Add to open tabs
      addOpenTab(newPage);
      const tabs = getOpenTabs();
      setOpenTabs(tabs);
      refreshData();
      // Start editing title immediately in sidebar
      setEditingPageId(newPage.id);
      setEditingTitle("Untitled");
      // Also notify external components
      notifyPageUpdate(Date.now());
    },
    [
      setSelectedPageId,
      setNotePage,
      setOpenTabs,
      refreshData,
      notifyPageUpdate,
    ],
  );

  const handleCreateSubPage = useCallback(
    (parentId: string) => {
      const parentPage = pages.find((p) => p.id === parentId);
      if (parentPage) {
        const newSubPage = createPage("Untitled", parentPage.spaceId, parentId);
        setSelectedPageId(newSubPage.id);
        setNotePage((prev) => ({ ...prev, [newSubPage.id]: newSubPage }));
        // Replace current tab with sub-page (navigate within same tab)
        replaceCurrentTab(newSubPage.id, newSubPage);
        const tabs = getOpenTabs();
        setOpenTabs(tabs);
        refreshData();
        // Start editing title immediately
        setEditingPageId(newSubPage.id);
        setEditingTitle("Untitled");
        // Expand parent page to show new sub-page
        setExpandedPages((prev) => new Set([...prev, parentId]));
        notifyPageUpdate(Date.now());
      }
    },
    [
      pages,
      setSelectedPageId,
      setNotePage,
      setOpenTabs,
      refreshData,
      notifyPageUpdate,
    ],
  );

  // Expose create page function to tabs
  useEffect(() => {
    setCreatePageAction(() => handleCreatePage);
    return () => setCreatePageAction(null);
  }, [handleCreatePage, setCreatePageAction]);

  const handleDeletePage = useCallback(
    (pageId: string) => {
      deletePage(pageId);
      if (selectedPageId === pageId) {
        setSelectedPageId(null);
      }
      refreshData();
      toast.success("Page deleted");
    },
    [selectedPageId, setSelectedPageId, refreshData],
  );

  const handleTogglePin = useCallback(
    (pageId: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (page) {
        page.pinned = !page.pinned;
        page.updatedAt = Date.now();
        savePage(page);
        refreshData();
      }
    },
    [pages, refreshData],
  );

  const handleStartRename = useCallback(
    (pageId: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (page) {
        setEditingPageId(pageId);
        setEditingTitle(page.title);
      }
    },
    [pages],
  );

  const handleSaveRename = useCallback(
    (pageId: string, title: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (page && title.trim()) {
        page.title = title.trim();
        page.updatedAt = Date.now();
        savePage(page);
        // Update cache
        setNotePage((prev) => ({ ...prev, [pageId]: page }));
        // Update tab
        updateTabPage(page);
        const tabs = getOpenTabs();
        setOpenTabs(tabs);
        refreshData();
      }
      setEditingPageId(null);
      setEditingTitle("");
    },
    [pages, refreshData, setNotePage, setOpenTabs],
  );

  const handleChangeIcon = useCallback(
    (pageId: string, icon: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (page) {
        page.icon = icon || undefined;
        page.updatedAt = Date.now();
        savePage(page);
        // Update cache
        setNotePage((prev) => ({ ...prev, [pageId]: page }));
        // Update tab
        updateTabPage(page);
        const tabs = getOpenTabs();
        setOpenTabs(tabs);
        refreshData();
        notifyPageUpdate(Date.now());
      }
    },
    [pages, refreshData, setNotePage, setOpenTabs, notifyPageUpdate],
  );

  const handleCancelRename = useCallback(() => {
    setEditingPageId(null);
    setEditingTitle("");
  }, []);

  const handleCreateSpace = useCallback(() => {
    const newSpace = createSpace("New Space");
    setExpandedSpaces((prev) => new Set([...prev, newSpace.id]));
    refreshData();
    toast.success("Space created");
  }, [refreshData]);

  const handleDeleteSpace = useCallback(
    (spaceId: string) => {
      deleteSpace(spaceId);
      setExpandedSpaces((prev) => {
        const next = new Set(prev);
        next.delete(spaceId);
        return next;
      });
      refreshData();
      toast.success("Space deleted");
    },
    [refreshData],
  );

  const handleToggleSpace = useCallback((spaceId: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  }, []);

  const handleTogglePageExpand = useCallback((pageId: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  const isMacOS = isMac();

  return (
    <div
      className={cn(
        "h-full border-r border-border bg-sidebar flex flex-col shrink-0 transition-all duration-300",
        sidebarOpen ? "w-72" : "w-0 border-r-0 overflow-hidden",
      )}
    >
      {sidebarOpen && (
        <>
          {/* Sidebar Header with Logo, Toggle and Controls */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            {/* App Logo - shown when expanded */}
            {!isMacOS && (
              <div className="flex items-center gap-2">
                <Logo size={24} />
                <span className="text-sm font-semibold text-foreground">
                  S-AGI
                </span>
              </div>
            )}
            <div className="flex-1" />

            {/* Model selector and PDF export - only when sidebar is expanded */}
            {currentModel && (
              <>
                {/* Model selector - icon only */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
                            "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <ModelIcon
                            provider={providerForIcon}
                            size={16}
                            className={
                              providerForIcon === "zai" ? "text-amber-500" : ""
                            }
                          />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
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
                                provider={model.provider || providerForIcon}
                                size={14}
                                className={cn(
                                  "shrink-0",
                                  model.provider === "zai"
                                    ? "text-amber-500"
                                    : "",
                                )}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium">
                                  {model.name}
                                </span>
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
                  <TooltipContent side="right">
                    <p>{currentModel?.name || "AI Model"}</p>
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
                  <TooltipContent side="right">
                    <p>Export to PDF</p>
                  </TooltipContent>
                </Tooltip>

                <div className="w-px h-4 bg-border" />
              </>
            )}

            {/* Sidebar toggle button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 hover:bg-accent rounded transition-colors"
                >
                  <IconLayoutSidebarLeftCollapse
                    size={16}
                    className="text-muted-foreground"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse sidebar</TooltipContent>
            </Tooltip>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-border/50">
            <div className="relative">
              <IconSearch
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm bg-background/50 border-border/50"
              />
            </div>
          </div>

          {/* Quick Navigation (Notion-style) */}
          <div className="px-2 py-1.5 border-b border-border/50">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors"
            >
              <IconHome size={16} className="text-muted-foreground" />
              <span>Home</span>
            </button>
          </div>

          {/* Content */}
          <FadeScrollArea>
            <div className="px-2 py-2 space-y-0.5">
              {/* Favorites */}
              {favorites.length > 0 && (
                <div className="mb-3">
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Favorites
                  </div>
                  <div className="space-y-0.5">
                    {favorites.map((page) => (
                      <PageItem
                        key={page.id}
                        page={page}
                        isSelected={selectedPageId === page.id}
                        isEditing={editingPageId === page.id}
                        editingTitle={editingTitle}
                        level={0}
                        onSelect={() => handleSelectPage(page.id)}
                        onStartRename={() => handleStartRename(page.id)}
                        onSaveRename={(title) =>
                          handleSaveRename(page.id, title)
                        }
                        onCancelRename={handleCancelRename}
                        onSetEditingTitle={setEditingTitle}
                        onDelete={() => handleDeletePage(page.id)}
                        onTogglePin={() => handleTogglePin(page.id)}
                        onChangeIcon={(icon) => handleChangeIcon(page.id, icon)}
                        hasChildren={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Private (root level pages) */}
              {!searchQuery && (
                <div className="mb-3">
                  <div className="flex items-center justify-between px-2 py-1.5 group">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Private
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity duration-150"
                        >
                          <IconPlus
                            size={12}
                            className="text-muted-foreground"
                          />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => handleCreatePage()}>
                          <IconFileText size={14} className="mr-2" />
                          New Page
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCreateSpace}>
                          <IconFolderPlus size={14} className="mr-2" />
                          New Space
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-0.5">
                    {pages
                      .filter((p) => !p.spaceId && !p.parentId && !p.archived)
                      .map((page) => {
                        const children = pages.filter(
                          (p) => p.parentId === page.id,
                        );
                        const isExpanded = expandedPages.has(page.id);
                        return (
                          <div key={page.id}>
                            <PageItem
                              page={page}
                              isSelected={selectedPageId === page.id}
                              isEditing={editingPageId === page.id}
                              editingTitle={editingTitle}
                              level={0}
                              onSelect={() => handleSelectPage(page.id)}
                              onStartRename={() => handleStartRename(page.id)}
                              onSaveRename={(title) =>
                                handleSaveRename(page.id, title)
                              }
                              onCancelRename={handleCancelRename}
                              onSetEditingTitle={setEditingTitle}
                              onDelete={() => handleDeletePage(page.id)}
                              onTogglePin={() => handleTogglePin(page.id)}
                              onChangeIcon={(icon) =>
                                handleChangeIcon(page.id, icon)
                              }
                              onCreateSubPage={() =>
                                handleCreateSubPage(page.id)
                              }
                              hasChildren={children.length > 0}
                              isExpanded={isExpanded}
                              onToggleExpand={() =>
                                handleTogglePageExpand(page.id)
                              }
                            />
                            {isExpanded && children.length > 0 && (
                              <div className="ml-4">
                                {children.map((child) => {
                                  const grandChildren = pages.filter(
                                    (p) => p.parentId === child.id,
                                  );
                                  return (
                                    <PageItem
                                      key={child.id}
                                      page={child}
                                      isSelected={selectedPageId === child.id}
                                      isEditing={editingPageId === child.id}
                                      editingTitle={editingTitle}
                                      level={1}
                                      onSelect={() =>
                                        handleSelectPage(child.id)
                                      }
                                      onStartRename={() =>
                                        handleStartRename(child.id)
                                      }
                                      onSaveRename={(title) =>
                                        handleSaveRename(child.id, title)
                                      }
                                      onCancelRename={handleCancelRename}
                                      onSetEditingTitle={setEditingTitle}
                                      onDelete={() =>
                                        handleDeletePage(child.id)
                                      }
                                      onTogglePin={() =>
                                        handleTogglePin(child.id)
                                      }
                                      onChangeIcon={(icon) =>
                                        handleChangeIcon(child.id, icon)
                                      }
                                      onCreateSubPage={() =>
                                        handleCreateSubPage(child.id)
                                      }
                                      hasChildren={grandChildren.length > 0}
                                      isExpanded={expandedPages.has(child.id)}
                                      onToggleExpand={() =>
                                        handleTogglePageExpand(child.id)
                                      }
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Team Spaces (Notion-style) */}
              {!searchQuery &&
                spaces
                  .filter((s) => !s.archived)
                  .map((space) => {
                    const spacePages = pages.filter(
                      (p) => p.spaceId === space.id && !p.archived,
                    );
                    return (
                      <div key={space.id} className="mb-3">
                        <SpaceSection
                          space={space}
                          pages={spacePages}
                          selectedPageId={selectedPageId}
                          expandedSpaces={expandedSpaces}
                          expandedPages={expandedPages}
                          editingPageId={editingPageId}
                          editingTitle={editingTitle}
                          onToggleSpace={() => handleToggleSpace(space.id)}
                          onSelectPage={handleSelectPage}
                          onStartRenamePage={handleStartRename}
                          onSaveRenamePage={handleSaveRename}
                          onCancelRenamePage={handleCancelRename}
                          onSetEditingTitle={setEditingTitle}
                          onDeletePage={handleDeletePage}
                          onTogglePinPage={handleTogglePin}
                          onChangeIconPage={handleChangeIcon}
                          onTogglePageExpand={handleTogglePageExpand}
                          onCreatePage={(spaceId, parentId) =>
                            handleCreatePage(spaceId, parentId)
                          }
                          onCreateSubPage={handleCreateSubPage}
                          onDeleteSpace={handleDeleteSpace}
                        />
                      </div>
                    );
                  })}

              {/* Search Results */}
              {searchQuery && filteredPages.length > 0 && (
                <div className="space-y-0.5">
                  {filteredPages.map((page) => (
                    <PageItem
                      key={page.id}
                      page={page}
                      isSelected={selectedPageId === page.id}
                      isEditing={editingPageId === page.id}
                      editingTitle={editingTitle}
                      level={0}
                      onSelect={() => handleSelectPage(page.id)}
                      onStartRename={() => handleStartRename(page.id)}
                      onSaveRename={(title) => handleSaveRename(page.id, title)}
                      onCancelRename={handleCancelRename}
                      onSetEditingTitle={setEditingTitle}
                      onDelete={() => handleDeletePage(page.id)}
                      onTogglePin={() => handleTogglePin(page.id)}
                      onChangeIcon={(icon) => handleChangeIcon(page.id, icon)}
                      hasChildren={false}
                    />
                  ))}
                </div>
              )}

              {searchQuery && filteredPages.length === 0 && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No pages found
                </div>
              )}
            </div>
          </FadeScrollArea>

          {/* Help/Support (Bottom) - Notion-style */}
          <div className="mt-auto border-t border-border/50 px-2 py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-center p-2 rounded-md hover:bg-accent/50 transition-colors"
                >
                  <IconDots size={16} className="text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Help & Support</TooltipContent>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}
