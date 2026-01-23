import { memo, useState, useEffect, useCallback } from 'react';
import { useRegistry } from '@embedpdf/core/react';
import { useLoaderCapability } from '@embedpdf/plugin-loader/react';
import type { PdfEngine, PdfBookmarkObject } from '@embedpdf/models';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  IconLoader2,
  IconCheck,
  IconAlertCircle,
  IconPlus,
  IconTrash,
  IconChevronRight,
  IconChevronDown,
  IconGripVertical,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface BookmarkNode extends PdfBookmarkObject {
  /** Child bookmarks */
  children: BookmarkNode[];
  /** Whether expanded in UI */
  expanded?: boolean;
}

interface PdfOutlineEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * PDF Outline/Bookmark Editor Dialog
 * Uses native PDFium APIs to read and write PDF bookmarks
 */
export const PdfOutlineEditor = memo(function PdfOutlineEditor({
  open,
  onOpenChange,
}: PdfOutlineEditorProps) {
  const { registry, pluginsReady } = useRegistry();
  const { provides: loaderApi } = useLoaderCapability();

  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load bookmarks when dialog opens
  useEffect(() => {
    if (!open || !registry || !loaderApi || !pluginsReady) return;

    const loadBookmarks = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const doc = loaderApi.getDocument();
        if (!doc) {
          throw new Error('No document loaded');
        }

        const engine = registry.getEngine() as PdfEngine;
        if (!engine) {
          throw new Error('PDF engine not available');
        }

        // Use the engine's getBookmarks API
        const bookmarksData = await engine.getBookmarks(doc).toPromise();

        // Convert PdfBookmarkObject to BookmarkNode with expanded state
        const convertToNode = (bookmark: PdfBookmarkObject): BookmarkNode => ({
          ...bookmark,
          children: bookmark.children?.map(convertToNode) || [],
          expanded: true,
        });

        const rootBookmarks = bookmarksData.bookmarks.map(convertToNode);

        setBookmarks(rootBookmarks);
        console.log('[PDF Outline] Loaded bookmarks:', rootBookmarks);
      } catch (err) {
        console.error('[PDF Outline] Error loading bookmarks:', err);
        setError(err instanceof Error ? err.message : 'Failed to load bookmarks');
      } finally {
        setIsLoading(false);
      }
    };

    loadBookmarks();
  }, [open, registry, loaderApi, pluginsReady]);

  // Toggle bookmark expanded state
  const toggleExpanded = useCallback((path: number[]) => {
    setBookmarks((prev) => {
      const updateNode = (
        nodes: BookmarkNode[],
        currentPath: number[],
      ): BookmarkNode[] => {
        if (currentPath.length === 0) return nodes;
        const [index, ...rest] = currentPath;
        return nodes.map((node, i) => {
          if (i === index) {
            if (rest.length === 0) {
              return { ...node, expanded: !node.expanded };
            } else {
              return {
                ...node,
                children: updateNode(node.children, rest),
              };
            }
          }
          return node;
        });
      };
      return updateNode(prev, path);
    });
  }, []);

  // Delete bookmark
  const handleDelete = useCallback(
    async (path: number[]) => {
      if (!registry || !loaderApi) return;

      try {
        // Remove from state
        setBookmarks((prev) => {
          const removeNode = (
            nodes: BookmarkNode[],
            currentPath: number[],
          ): BookmarkNode[] => {
            if (currentPath.length === 0) return nodes;
            const [index, ...rest] = currentPath;
            if (rest.length === 0) {
              return nodes.filter((_, i) => i !== index);
            }
            return nodes.map((node, i) => {
              if (i === index) {
                return {
                  ...node,
                  children: removeNode(node.children, rest),
                };
              }
              return node;
            });
          };
          return removeNode(prev, path);
        });

        console.log('[PDF Outline] Deleted bookmark at path:', path);
      } catch (err) {
        console.error('[PDF Outline] Error deleting bookmark:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete bookmark');
      }
    },
    [registry, loaderApi],
  );

  // Add new bookmark
  const handleAddBookmark = useCallback(async () => {
    if (!registry || !loaderApi) return;

    try {
      // Add to state - will be saved when user clicks Save
      const newBookmark: BookmarkNode = {
        title: 'New Bookmark',
        pageIndex: 0,
        children: [],
        expanded: true,
      };

      setBookmarks((prev) => [...prev, newBookmark]);
      console.log('[PDF Outline] Created new bookmark');
    } catch (err) {
      console.error('[PDF Outline] Error creating bookmark:', err);
      setError(err instanceof Error ? err.message : 'Failed to create bookmark');
    }
  }, [registry, loaderApi]);

  // Save changes
  const handleSave = async () => {
    if (!registry || !loaderApi) return;

    setIsSaving(true);
    setError(null);

    try {
      const doc = loaderApi.getDocument();
      if (!doc) {
        throw new Error('No document loaded');
      }

      const engine = registry.getEngine() as PdfEngine;
      if (!engine) {
        throw new Error('PDF engine not available');
      }

      // Convert BookmarkNode back to PdfBookmarkObject (remove UI state)
      const convertToBookmark = (node: BookmarkNode): PdfBookmarkObject => ({
        title: node.title,
        pageIndex: node.pageIndex,
        children: node.children?.map(convertToBookmark),
      });

      const bookmarksToSave = bookmarks.map(convertToBookmark);

      // Use the engine's setBookmarks API
      await engine.setBookmarks(doc, bookmarksToSave).toPromise();

      console.log('[PDF Outline] Saved bookmarks successfully');
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('[PDF Outline] Error saving:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>PDF Outline Editor</DialogTitle>
          <DialogDescription>
            Edit document bookmarks and navigation structure
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4 overflow-y-auto max-h-[50vh]">
            {/* Add bookmark button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddBookmark}
              className="w-fit"
            >
              <IconPlus size={16} className="mr-2" />
              Add Bookmark
            </Button>

            {/* Bookmark tree */}
            {bookmarks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm">No bookmarks found</p>
              </div>
            ) : (
              <BookmarkTree
                bookmarks={bookmarks}
                onToggle={toggleExpanded}
                onDelete={handleDelete}
              />
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <IconAlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Success message */}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
                <IconCheck size={16} />
                <span>Bookmarks saved successfully!</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? (
              <>
                <IconLoader2 size={16} className="mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

/**
 * Recursive bookmark tree component
 */
interface BookmarkTreeProps {
  bookmarks: BookmarkNode[];
  path?: number[];
  onToggle: (path: number[]) => void;
  onDelete: (path: number[]) => void;
}

const BookmarkTree = memo(function BookmarkTree({
  bookmarks,
  path = [],
  onToggle,
  onDelete,
}: BookmarkTreeProps) {
  return (
    <div className="space-y-1">
      {bookmarks.map((bookmark, index) => {
        const currentPath = [...path, index];
        const hasChildren = bookmark.children.length > 0;
        const isExpanded = bookmark.expanded ?? true;

        return (
          <div key={index}>
            <div
              className={cn(
                'group flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors',
                path.length > 0 && 'ml-6',
              )}
            >
              {/* Expand/collapse button */}
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle(currentPath)}
                  className="shrink-0 w-4 h-4 flex items-center justify-center hover:bg-accent rounded"
                >
                  {isExpanded ? (
                    <IconChevronDown size={14} />
                  ) : (
                    <IconChevronRight size={14} />
                  )}
                </button>
              ) : (
                <div className="w-4 h-4" />
              )}

              {/* Bookmark info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{bookmark.title}</div>
                <div className="text-xs text-muted-foreground">
                  Page {bookmark.pageIndex + 1}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => onDelete(currentPath)}
                >
                  <IconTrash size={14} />
                </Button>
              </div>
            </div>

            {/* Child bookmarks */}
            {hasChildren && isExpanded && (
              <BookmarkTree
                bookmarks={bookmark.children}
                path={currentPath}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
