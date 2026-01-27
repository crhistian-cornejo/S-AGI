import { memo, useCallback, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconChevronRight,
  IconChevronDown,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  pdfOutlineAtom,
  pdfUserBookmarksAtom,
  pdfBookmarkNavigationAtom,
  pdfSelectedTextAtom,
  pdfCurrentPageAtom,
  selectedPdfAtom,
  type PdfBookmark,
} from "@/lib/atoms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface PdfBookmarksPanelProps {
  className?: string;
}

/**
 * Panel showing PDF outline (native bookmarks) and user-created bookmarks
 */
export const PdfBookmarksPanel = memo(function PdfBookmarksPanel({
  className,
}: PdfBookmarksPanelProps) {
  const outline = useAtomValue(pdfOutlineAtom);
  const [userBookmarks, setUserBookmarks] = useAtom(pdfUserBookmarksAtom);
  const selectedText = useAtomValue(pdfSelectedTextAtom);
  const currentPage = useAtomValue(pdfCurrentPageAtom);
  const selectedPdf = useAtomValue(selectedPdfAtom);
  const setBookmarkNavigation = useSetAtom(pdfBookmarkNavigationAtom);

  const [outlineOpen, setOutlineOpen] = useState(true);
  const [userBookmarksOpen, setUserBookmarksOpen] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBookmarkTitle, setNewBookmarkTitle] = useState("");
  const [newBookmarkNotes, setNewBookmarkNotes] = useState("");

  // Server-side bookmark persistence is not available yet

  const handleNavigateToBookmark = useCallback(
    (bookmark: PdfBookmark) => {
      setBookmarkNavigation({
        bookmarkId: bookmark.id,
        pageIndex: bookmark.pageIndex,
        position: bookmark.position,
        highlightRect: bookmark.highlightRect,
      });
    },
    [setBookmarkNavigation],
  );

  const handleCreateBookmark = useCallback(async () => {
    if (!selectedPdf || !newBookmarkTitle.trim()) return;

    const newBookmark: PdfBookmark = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: newBookmarkTitle.trim(),
      pageIndex: currentPage - 1, // Convert to 0-based
      source: "user",
      createdAt: new Date().toISOString(),
      notes: newBookmarkNotes.trim() || undefined,
      highlightText: selectedText?.text,
      highlightRect: selectedText?.rect,
      color: "#FFEB3B", // Yellow by default
    };

    // Add to local state
    setUserBookmarks((prev) => [...prev, newBookmark]);

    // Persistence to Supabase can be added via tRPC when available

    // Reset form
    setNewBookmarkTitle("");
    setNewBookmarkNotes("");
    setCreateDialogOpen(false);
  }, [
    selectedPdf,
    newBookmarkTitle,
    newBookmarkNotes,
    currentPage,
    selectedText,
    setUserBookmarks,
  ]);

  const handleDeleteBookmark = useCallback(
    async (bookmark: PdfBookmark) => {
      if (bookmark.source !== "user") return;

      // Remove from local state
      setUserBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));

      // Persistence to Supabase can be added via tRPC when available
    },
    [selectedPdf, setUserBookmarks],
  );

  const openCreateDialog = useCallback(() => {
    // Pre-fill with selected text if available
    if (selectedText?.text) {
      setNewBookmarkTitle(
        selectedText.text.slice(0, 50) +
          (selectedText.text.length > 50 ? "..." : ""),
      );
    } else {
      setNewBookmarkTitle(`Page ${currentPage}`);
    }
    setCreateDialogOpen(true);
  }, [selectedText, currentPage]);

  return (
    <div className={cn("flex flex-col gap-2 p-2", className)}>
      {/* Header with add button */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Bookmarks
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={openCreateDialog}
            >
              <IconPlus size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {selectedText
              ? "Bookmark selection"
              : "Add bookmark at current page"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* PDF Outline (native bookmarks) */}
      {outline.length > 0 && (
        <Collapsible open={outlineOpen} onOpenChange={setOutlineOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 px-1 py-1 w-full hover:bg-muted/50 rounded text-xs font-medium">
            {outlineOpen ? (
              <IconChevronDown size={14} />
            ) : (
              <IconChevronRight size={14} />
            )}
            <IconBookmark size={14} className="text-blue-500" />
            <span>Document Outline</span>
            <span className="ml-auto text-muted-foreground">
              {outline.length}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pl-3 mt-1 space-y-0.5">
              {outline.map((bookmark) => (
                <BookmarkItem
                  key={bookmark.id}
                  bookmark={bookmark}
                  onNavigate={handleNavigateToBookmark}
                  depth={0}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* User Bookmarks */}
      <Collapsible open={userBookmarksOpen} onOpenChange={setUserBookmarksOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 px-1 py-1 w-full hover:bg-muted/50 rounded text-xs font-medium">
          {userBookmarksOpen ? (
            <IconChevronDown size={14} />
          ) : (
            <IconChevronRight size={14} />
          )}
          <IconBookmarkFilled size={14} className="text-yellow-500" />
          <span>My Bookmarks</span>
          <span className="ml-auto text-muted-foreground">
            {userBookmarks.length}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {userBookmarks.length > 0 ? (
            <div className="pl-3 mt-1 space-y-0.5">
              {userBookmarks.map((bookmark) => (
                <BookmarkItem
                  key={bookmark.id}
                  bookmark={bookmark}
                  onNavigate={handleNavigateToBookmark}
                  onDelete={handleDeleteBookmark}
                  depth={0}
                />
              ))}
            </div>
          ) : (
            <div className="pl-3 py-3 text-xs text-muted-foreground/70 text-center">
              No bookmarks yet.
              <br />
              Select text and click + to add.
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Create Bookmark Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Bookmark</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bookmark-title">Title</Label>
              <Input
                id="bookmark-title"
                value={newBookmarkTitle}
                onChange={(e) => setNewBookmarkTitle(e.target.value)}
                placeholder="Bookmark title..."
              />
            </div>
            {selectedText && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <span className="font-medium">Selected text:</span>
                <p className="mt-1 line-clamp-2">{selectedText.text}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="bookmark-notes">Notes (optional)</Label>
              <Textarea
                id="bookmark-notes"
                value={newBookmarkNotes}
                onChange={(e) => setNewBookmarkNotes(e.target.value)}
                placeholder="Add notes..."
                rows={2}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Page {currentPage}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBookmark}
              disabled={!newBookmarkTitle.trim()}
            >
              Create Bookmark
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

interface BookmarkItemProps {
  bookmark: PdfBookmark;
  onNavigate: (bookmark: PdfBookmark) => void;
  onDelete?: (bookmark: PdfBookmark) => void;
  depth: number;
}

const BookmarkItem = memo(function BookmarkItem({
  bookmark,
  onNavigate,
  onDelete,
  depth,
}: BookmarkItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = bookmark.children && bookmark.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm",
          "transition-colors",
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => onNavigate(bookmark)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-muted rounded"
          >
            {expanded ? (
              <IconChevronDown size={12} />
            ) : (
              <IconChevronRight size={12} />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-4" />}

        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            backgroundColor:
              bookmark.color ||
              (bookmark.source === "pdf" ? "#3B82F6" : "#FBBF24"),
          }}
        />

        <span className="truncate flex-1">{bookmark.title}</span>

        <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          p.{bookmark.pageIndex + 1}
        </span>

        {onDelete && bookmark.source === "user" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(bookmark);
            }}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive rounded transition-all duration-150"
          >
            <IconTrash size={12} />
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <div>
          {bookmark.children!.map((child) => (
            <BookmarkItem
              key={child.id}
              bookmark={child}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});
