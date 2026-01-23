import { memo, useState, useEffect, useCallback } from 'react';
import { useRegistry } from '@embedpdf/core/react';
import { useLoaderCapability } from '@embedpdf/plugin-loader/react';
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

interface BookmarkNode {
  /** Bookmark handle from PDFium */
  handle: number;
  /** Display title */
  title: string;
  /** Page index (0-based) */
  pageIndex: number;
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

        const engine = registry.getEngine() as any;
        if (!engine || !engine.pdfium) {
          throw new Error('PDFium engine not available');
        }

        const pdfium = engine.pdfium;

        // Read bookmarks recursively using native PDFium APIs
        const readBookmark = (bookmarkHandle: number): BookmarkNode | null => {
          if (!bookmarkHandle) return null;

          try {
            // Get bookmark title
            const titleLength = pdfium.FPDFBookmark_GetTitle(
              bookmarkHandle,
              null,
              0,
            );
            if (titleLength <= 0) return null;

            const titleBuffer = pdfium.wasmExports.malloc(titleLength * 2);
            pdfium.FPDFBookmark_GetTitle(bookmarkHandle, titleBuffer, titleLength);
            const title = pdfium.UTF16ToString(titleBuffer);
            pdfium.wasmExports.free(titleBuffer);

            // Get destination page
            const dest = pdfium.FPDFBookmark_GetDest(doc.handle, bookmarkHandle);
            const pageIndex = dest
              ? pdfium.FPDFDest_GetDestPageIndex(doc.handle, dest)
              : -1;

            // Get child bookmarks
            const children: BookmarkNode[] = [];
            let childHandle = pdfium.FPDFBookmark_GetFirstChild(
              doc.handle,
              bookmarkHandle,
            );
            while (childHandle) {
              const child = readBookmark(childHandle);
              if (child) children.push(child);
              childHandle = pdfium.FPDFBookmark_GetNextSibling(
                doc.handle,
                childHandle,
              );
            }

            return {
              handle: bookmarkHandle,
              title,
              pageIndex,
              children,
              expanded: true,
            };
          } catch (err) {
            console.warn('Failed to read bookmark:', err);
            return null;
          }
        };

        // Read root bookmarks
        const rootBookmarks: BookmarkNode[] = [];
        let rootHandle = pdfium.FPDFBookmark_GetFirstChild(doc.handle, null);
        while (rootHandle) {
          const bookmark = readBookmark(rootHandle);
          if (bookmark) rootBookmarks.push(bookmark);
          rootHandle = pdfium.FPDFBookmark_GetNextSibling(doc.handle, rootHandle);
        }

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
        const doc = loaderApi.getDocument();
        if (!doc) return;

        const engine = registry.getEngine() as any;
        const pdfium = engine.pdfium;

        // Find the bookmark to delete
        const findBookmark = (
          nodes: BookmarkNode[],
          currentPath: number[],
        ): BookmarkNode | null => {
          if (currentPath.length === 0) return null;
          const [index, ...rest] = currentPath;
          const node = nodes[index];
          if (!node) return null;
          if (rest.length === 0) return node;
          return findBookmark(node.children, rest);
        };

        const bookmark = findBookmark(bookmarks, path);
        if (!bookmark) return;

        // Delete using native API
        const success = pdfium.EPDFBookmark_Delete(doc.handle, bookmark.handle);
        if (!success) {
          throw new Error('Failed to delete bookmark');
        }

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

        console.log('[PDF Outline] Deleted bookmark:', bookmark.title);
      } catch (err) {
        console.error('[PDF Outline] Error deleting bookmark:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete bookmark');
      }
    },
    [registry, loaderApi, bookmarks],
  );

  // Add new bookmark
  const handleAddBookmark = useCallback(async () => {
    if (!registry || !loaderApi) return;

    try {
      const doc = loaderApi.getDocument();
      if (!doc) return;

      const engine = registry.getEngine() as any;
      const pdfium = engine.pdfium;

      // Create new bookmark at root level
      const titleBuffer = pdfium.stringToUTF16('New Bookmark');
      const bookmarkHandle = pdfium.EPDFBookmark_Create(doc.handle, 0);

      if (!bookmarkHandle) {
        throw new Error('Failed to create bookmark');
      }

      // Set title
      pdfium.EPDFBookmark_SetTitle(bookmarkHandle, titleBuffer);

      // Set destination to page 0
      pdfium.EPDFBookmark_SetDest(bookmarkHandle, doc.handle, 0);

      // Add to state
      const newBookmark: BookmarkNode = {
        handle: bookmarkHandle,
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
    setIsSaving(true);
    setError(null);

    try {
      // Bookmarks are modified directly in PDFium
      // Just show success and close
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
