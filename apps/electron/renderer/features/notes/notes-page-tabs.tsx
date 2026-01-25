/**
 * Notes Page Tabs - Notion-style tabs for open pages
 * Shows open pages as tabs in the titlebar
 */

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  selectedNotePageIdAtom,
  openNoteTabsAtom,
  notePagesCacheAtom,
  createNotePageActionAtom,
} from "@/lib/atoms";
import {
  getOpenTabs,
  removeOpenTab,
  updateTabPage,
} from "@/lib/notes-tabs";
import { getPageById } from "@/lib/notes-storage";
import { IconX, IconPlus } from "@tabler/icons-react";
import { renderPageIcon } from "@/lib/notes-icon-utils";
import { cn } from "@/lib/utils";
import { useCallback, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function NotesPageTabs() {
  const [selectedPageId, setSelectedPageId] = useAtom(selectedNotePageIdAtom);
  const [openTabs, setOpenTabs] = useAtom(openNoteTabsAtom);
  const pagesCache = useAtomValue(notePagesCacheAtom);
  const setNotePage = useSetAtom(notePagesCacheAtom);

  // Load tabs from storage and sync with cache
  useEffect(() => {
    const tabs = getOpenTabs();
    // Remove duplicates by pageId (keep the first occurrence)
    const uniqueTabs = tabs.filter((tab, index, self) => 
      index === self.findIndex((t) => t.pageId === tab.pageId)
    );
    
    // Update tabs with latest page data from cache
    const updatedTabs = uniqueTabs.map((tab) => {
      const cachedPage = pagesCache[tab.pageId];
      if (cachedPage) {
        // If cache has newer data, update the tab
        if (cachedPage.updatedAt > tab.page.updatedAt) {
          updateTabPage(cachedPage);
          return { ...tab, page: cachedPage };
        }
        return { ...tab, page: cachedPage };
      }
      // Try to load from storage
      const storedPage = getPageById(tab.pageId);
      if (storedPage) {
        return { ...tab, page: storedPage };
      }
      return tab;
    }).filter((tab) => tab.page !== undefined);
    
    // Save back to storage if duplicates were removed
    if (uniqueTabs.length !== tabs.length) {
      localStorage.setItem("notes-open-tabs", JSON.stringify(updatedTabs));
    }
    
    setOpenTabs(updatedTabs);
  }, [pagesCache, setOpenTabs]);

  // Don't auto-add tabs when page is selected - let sidebar handle tab creation logic
  // This allows sub-pages to navigate within the same tab using breadcrumbs

  const handleTabClick = useCallback(
    (pageId: string) => {
      setSelectedPageId(pageId);
      const page = pagesCache[pageId] || getPageById(pageId);
      if (page) {
        setNotePage((prev) => ({ ...prev, [pageId]: page }));
      }
    },
    [setSelectedPageId, pagesCache, setNotePage],
  );

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, pageId: string) => {
      e.stopPropagation();
      removeOpenTab(pageId);
      const tabs = getOpenTabs();
      setOpenTabs(tabs);
      
      // If closing the selected tab, switch to another tab or clear selection
      if (selectedPageId === pageId) {
        const remainingTabs = tabs.filter((t) => t.pageId !== pageId);
        if (remainingTabs.length > 0) {
          setSelectedPageId(remainingTabs[remainingTabs.length - 1].pageId);
        } else {
          setSelectedPageId(null);
        }
      }
    },
    [selectedPageId, setSelectedPageId, setOpenTabs],
  );

  const createPageAction = useAtomValue(createNotePageActionAtom);
  
  const handleNewPage = useCallback(() => {
    if (createPageAction) {
      createPageAction();
    }
  }, [createPageAction]);

  return (
    <div className="flex items-center gap-0.5 no-drag h-full">
      {openTabs.length > 0 && (
        <>
          {openTabs.map((tab) => {
            const isSelected = selectedPageId === tab.pageId;
            return (
              <div
                key={tab.pageId}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs transition-all duration-200 group relative",
                  "border-b-2 border-transparent",
                  isSelected
                    ? "bg-background text-foreground border-b-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleTabClick(tab.pageId)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                >
                  {renderPageIcon(tab.page.icon, 14, "shrink-0 opacity-60")}
                  <span className="max-w-[140px] truncate text-[12px] font-medium">
                    {tab.page.title || "Untitled"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(e, tab.pageId)}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent ml-1 shrink-0",
                    isSelected && "opacity-60"
                  )}
                  aria-label="Close tab"
                >
                  <IconX size={12} />
                </button>
              </div>
            );
          })}
        </>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleNewPage}
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200 ml-1",
              openTabs.length === 0 && "ml-0"
            )}
          >
            <IconPlus size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">New page</TooltipContent>
      </Tooltip>
    </div>
  );
}
