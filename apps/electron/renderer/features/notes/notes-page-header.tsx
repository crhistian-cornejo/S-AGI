/**
 * Notes Page Header - Notion-style page header with editable title
 * Displays page title, icon, breadcrumbs, and actions
 */

import { useState, useCallback, useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  selectedNotePageIdAtom,
  notePagesCacheAtom,
  notesPageUpdatedAtom,
  openNoteTabsAtom,
} from "@/lib/atoms";
import { getPageById, savePage, getAllPages, createPage } from "@/lib/notes-storage";
import { updateTabPage, getOpenTabs, replaceCurrentTab } from "@/lib/notes-tabs";
import { IconPencil, IconStar, IconStarFilled, IconShare, IconDots, IconPlus, IconPhoto, IconInfoCircle, IconX } from "@tabler/icons-react";
import { IconPicker } from "@/components/ui/icon-picker";
import { renderPageIcon } from "@/lib/notes-icon-utils";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotesPageHeaderProps {
  className?: string;
}

export function NotesPageHeader({ className }: NotesPageHeaderProps) {
  const [selectedPageId, setSelectedPageId] = useAtom(selectedNotePageIdAtom);
  const pagesCache = useAtomValue(notePagesCacheAtom);
  const setNotePage = useSetAtom(notePagesCacheAtom);
  const notifyPageUpdate = useSetAtom(notesPageUpdatedAtom);
  const setOpenTabs = useSetAtom(openNoteTabsAtom);
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");
  
  // Get current page
  const currentPage = selectedPageId
    ? pagesCache[selectedPageId] || getPageById(selectedPageId)
    : null;

  // Initialize editing title when starting to edit
  useEffect(() => {
    if (isEditingTitle && currentPage) {
      setEditingTitle(currentPage.title);
    }
  }, [isEditingTitle, currentPage]);

  // Get breadcrumbs (parent pages) - always show if there's a parent
  const breadcrumbs = useCallback(() => {
    if (!currentPage) return [];
    
    const allPages = getAllPages();
    const crumbs: Array<{ id: string; title: string; icon?: string }> = [];
    let parentId: string | null = currentPage.parentId;
    
    while (parentId !== null) {
      const parent = allPages.find((p) => p.id === parentId);
      if (parent) {
        crumbs.unshift({ id: parent.id, title: parent.title, icon: parent.icon });
        parentId = parent.parentId;
      } else {
        break;
      }
    }
    
    return crumbs;
  }, [currentPage]);

  const handleStartEditTitle = useCallback(() => {
    if (currentPage) {
      setIsEditingTitle(true);
      setEditingTitle(currentPage.title);
    }
  }, [currentPage]);

  const handleSaveTitle = useCallback(() => {
    if (currentPage && editingTitle.trim()) {
      const updatedPage = {
        ...currentPage,
        title: editingTitle.trim(),
        updatedAt: Date.now(),
      };
      savePage(updatedPage);
      // Update cache
      setNotePage((prev) => ({ ...prev, [currentPage.id]: updatedPage }));
      // Update tab
      updateTabPage(updatedPage);
      // Notify sidebar to refresh
      notifyPageUpdate(Date.now());
      setIsEditingTitle(false);
    }
  }, [currentPage, editingTitle, setNotePage, notifyPageUpdate]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingTitle(false);
    setEditingTitle("");
  }, []);

  const handleToggleFavorite = useCallback(() => {
    if (currentPage) {
      const updatedPage = {
        ...currentPage,
        pinned: !currentPage.pinned,
        updatedAt: Date.now(),
      };
      savePage(updatedPage);
      setNotePage((prev) => ({ ...prev, [currentPage.id]: updatedPage }));
      updateTabPage(updatedPage);
      // Notify sidebar to refresh
      notifyPageUpdate(Date.now());
    }
  }, [currentPage, setNotePage, notifyPageUpdate]);

  const handleBreadcrumbClick = useCallback((pageId: string) => {
    setSelectedPageId(pageId);
    const page = pagesCache[pageId] || getPageById(pageId);
    if (page) {
      setNotePage((prev) => ({ ...prev, [pageId]: page }));
      // Replace current tab instead of creating new one (breadcrumb navigation)
      replaceCurrentTab(pageId, page);
      const tabs = getOpenTabs();
      setOpenTabs(tabs);
    }
  }, [setSelectedPageId, pagesCache, setNotePage, setOpenTabs]);

  const handleCreateSubPage = useCallback(() => {
    if (currentPage) {
      const newSubPage = createPage("Untitled", currentPage.spaceId, currentPage.id);
      setSelectedPageId(newSubPage.id);
      setNotePage((prev) => ({ ...prev, [newSubPage.id]: newSubPage }));
      // Replace current tab with sub-page (navigate within same tab)
      replaceCurrentTab(newSubPage.id, newSubPage);
      const tabs = getOpenTabs();
      setOpenTabs(tabs);
      notifyPageUpdate(Date.now());
    }
  }, [currentPage, setSelectedPageId, setNotePage, setOpenTabs, notifyPageUpdate]);

  const handleAddCover = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && currentPage) {
        const reader = new FileReader();
        reader.onload = () => {
          const coverImage = reader.result as string;
          const updatedPage = {
            ...currentPage,
            coverImage,
            updatedAt: Date.now(),
          };
          savePage(updatedPage);
          setNotePage((prev) => ({ ...prev, [currentPage.id]: updatedPage }));
          updateTabPage(updatedPage);
          notifyPageUpdate(Date.now());
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }, [currentPage, setNotePage, notifyPageUpdate]);

  const handleRemoveCover = useCallback(() => {
    if (currentPage) {
      const updatedPage = {
        ...currentPage,
        coverImage: undefined,
        updatedAt: Date.now(),
      };
      savePage(updatedPage);
      setNotePage((prev) => ({ ...prev, [currentPage.id]: updatedPage }));
      updateTabPage(updatedPage);
      notifyPageUpdate(Date.now());
    }
  }, [currentPage, setNotePage, notifyPageUpdate]);

  const handleToggleDescription = useCallback(() => {
    if (currentPage) {
      const updatedPage = {
        ...currentPage,
        descriptionVisible: !currentPage.descriptionVisible,
        updatedAt: Date.now(),
      };
      savePage(updatedPage);
      setNotePage((prev) => ({ ...prev, [currentPage.id]: updatedPage }));
      updateTabPage(updatedPage);
      notifyPageUpdate(Date.now());
    }
  }, [currentPage, setNotePage, notifyPageUpdate]);

  if (!currentPage) {
    return null;
  }

  const crumbs = breadcrumbs();

  const isDescriptionVisible = currentPage.descriptionVisible !== false;

  return (
    <div className={cn("bg-background", className)}>
      {/* Cover Image - Always visible */}
      {currentPage.coverImage && (
        <div className="relative w-full h-48 overflow-hidden group">
          <img
            src={currentPage.coverImage}
            alt="Cover"
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={handleRemoveCover}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-background/80 hover:bg-background border border-border"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Description Section - Only visible if descriptionVisible !== false */}
      {isDescriptionVisible && (
        <>
          {/* Breadcrumbs */}
          {crumbs.length > 0 && (
            <div className="px-6 pt-3 pb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {crumbs.map((crumb, index) => (
                <span key={crumb.id} className="flex items-center gap-1.5">
                  {index > 0 && <span className="text-muted-foreground/50">/</span>}
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(crumb.id)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors hover:underline"
                  >
                    {crumb.icon && (
                      <span className="text-sm">{renderPageIcon(crumb.icon, 12, "")}</span>
                    )}
                    <span>{crumb.title}</span>
                  </button>
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground/50">/</span>
                <span className="flex items-center gap-1.5 text-foreground">
                  {currentPage.icon && (
                    <span className="text-sm">{renderPageIcon(currentPage.icon, 12, "")}</span>
                  )}
                  <span>{currentPage.title}</span>
                </span>
              </span>
            </div>
          )}

          {/* Page Header */}
          <div className={cn("px-6 py-3 flex items-center gap-3", !currentPage.coverImage && "border-b border-border/50")}>
            {/* Icon */}
            <IconPicker
          currentIcon={currentPage.icon}
          onSelect={(icon) => {
            const updatedPage = {
              ...currentPage,
              icon: icon || undefined,
              updatedAt: Date.now(),
            };
            savePage(updatedPage);
            setNotePage((prev) => ({ ...prev, [currentPage.id]: updatedPage }));
            updateTabPage(updatedPage);
            notifyPageUpdate(Date.now());
          }}
        >
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent transition-colors shrink-0"
          >
              {renderPageIcon(currentPage.icon, 20, "text-muted-foreground")}
            </button>
          </IconPicker>

          {/* Title */}
          <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <Input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveTitle();
                } else if (e.key === "Escape") {
                  handleCancelEdit();
                }
              }}
              className="text-xl font-semibold h-8 px-2 border-primary focus-visible:ring-1"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={handleStartEditTitle}
              className="text-xl font-semibold text-foreground hover:bg-accent/50 rounded px-2 py-1 -ml-2 transition-colors flex items-center gap-2 group"
            >
              <span>{currentPage.title || "Untitled"}</span>
              <IconPencil
                size={14}
                className="opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground"
              />
            </button>
          )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
          {/* Favorite */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleToggleFavorite}
              >
                {currentPage.pinned ? (
                  <IconStarFilled size={16} className="text-yellow-500" />
                ) : (
                  <IconStar size={16} className="text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {currentPage.pinned ? "Remove from favorites" : "Add to favorites"}
            </TooltipContent>
          </Tooltip>

          {/* Share */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <IconShare size={16} className="text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share</TooltipContent>
          </Tooltip>

          {/* Add sub-page */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCreateSubPage}
              >
                <IconPlus size={16} className="text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add sub-page</TooltipContent>
          </Tooltip>

          {/* More options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <IconDots size={16} className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCreateSubPage}>
                <IconPlus size={14} className="mr-2" />
                Add sub-page
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem>Move to</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
          </div>

          {/* Page Options Bar */}
          <div className="px-6 py-2 border-b border-border/50 flex items-center gap-2">
        {!currentPage.coverImage ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddCover}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <IconPhoto size={14} className="mr-1.5" />
            Add cover
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveCover}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <IconX size={14} className="mr-1.5" />
            Remove cover
          </Button>
        )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleDescription}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <IconInfoCircle size={14} className="mr-1.5" />
              {isDescriptionVisible ? "Hide description" : "Show description"}
            </Button>
          </div>
        </>
      )}

      {/* Show description button when hidden */}
      {!isDescriptionVisible && (
        <div className="px-6 py-2 border-b border-border/50 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleDescription}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <IconInfoCircle size={14} className="mr-1.5" />
            Show description
          </Button>
        </div>
      )}
    </div>
  );
}
