import { memo, useState, useEffect, useCallback } from 'react';
import { useRegistry } from '@embedpdf/core/react';
import { useLoaderCapability } from '@embedpdf/plugin-loader/react';
import type { PdfEngine, PdfAttachmentObject } from '@embedpdf/models';
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
  IconDownload,
  IconFile,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface PdfAttachmentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * PDF Attachment Editor Dialog
 * Uses PdfEngine APIs to manage PDF attachments
 */
export const PdfAttachmentEditor = memo(function PdfAttachmentEditor({
  open,
  onOpenChange,
}: PdfAttachmentEditorProps) {
  const { registry, pluginsReady } = useRegistry();
  const { provides: loaderApi } = useLoaderCapability();

  const [attachments, setAttachments] = useState<PdfAttachmentObject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load attachments when dialog opens
  useEffect(() => {
    if (!open || !registry || !loaderApi || !pluginsReady) return;

    const loadAttachments = async () => {
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

        // Use the engine's getAttachments API
        const attachmentsList = await engine.getAttachments(doc).toPromise();

        setAttachments(attachmentsList);
        console.log('[PDF Attachments] Loaded attachments:', attachmentsList);
      } catch (err) {
        console.error('[PDF Attachments] Error loading attachments:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load attachments',
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadAttachments();
  }, [open, registry, loaderApi, pluginsReady]);

  // Delete attachment
  const handleDelete = useCallback(
    async (attachment: PdfAttachmentObject) => {
      if (!registry || !loaderApi) return;

      setIsProcessing(true);
      setError(null);

      try {
        const doc = loaderApi.getDocument();
        if (!doc) throw new Error('No document loaded');

        const engine = registry.getEngine() as PdfEngine;
        if (!engine) throw new Error('PDF engine not available');

        // Use the engine's removeAttachment API
        await engine.removeAttachment(doc, attachment).toPromise();

        // Remove from state
        setAttachments((prev) => prev.filter((a) => a.index !== attachment.index));
        console.log('[PDF Attachments] Deleted attachment:', attachment.name);
      } catch (err) {
        console.error('[PDF Attachments] Error deleting attachment:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to delete attachment',
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [registry, loaderApi],
  );

  // Download attachment
  const handleDownload = useCallback(
    async (attachment: PdfAttachmentObject) => {
      if (!registry || !loaderApi) return;

      setIsProcessing(true);
      setError(null);

      try {
        const doc = loaderApi.getDocument();
        if (!doc) throw new Error('No document loaded');

        const engine = registry.getEngine() as PdfEngine;
        if (!engine) throw new Error('PDF engine not available');

        // Use the engine's readAttachmentContent API
        const arrayBuffer = await engine.readAttachmentContent(doc, attachment).toPromise();

        // Create blob and download
        const blob = new Blob([arrayBuffer], { type: attachment.mimeType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.name || 'attachment';
        a.click();
        URL.revokeObjectURL(url);

        console.log('[PDF Attachments] Downloaded attachment:', attachment.name);
      } catch (err) {
        console.error('[PDF Attachments] Error downloading attachment:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to download attachment',
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [registry, loaderApi],
  );

  // Add attachment from file upload (browser)
  const handleAddAttachment = useCallback(async () => {
    if (!registry || !loaderApi) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';

    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      setError(null);

      try {
        const doc = loaderApi.getDocument();
        if (!doc) throw new Error('No document loaded');

        const engine = registry.getEngine() as PdfEngine;
        if (!engine) throw new Error('PDF engine not available');

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // Use the engine's addAttachment API
        await engine.addAttachment(doc, {
          name: file.name,
          description: `Attached on ${new Date().toLocaleDateString()}`,
          mimeType: file.type || 'application/octet-stream',
          data: arrayBuffer,
        }).toPromise();

        // Reload attachments
        const attachmentsList = await engine.getAttachments(doc).toPromise();
        setAttachments(attachmentsList);

        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
        console.log('[PDF Attachments] Added attachment:', file.name);
      } catch (err) {
        console.error('[PDF Attachments] Error adding attachment:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to add attachment',
        );
      } finally {
        setIsProcessing(false);
      }
    };

    input.click();
  }, [registry, loaderApi]);

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>PDF Attachments</DialogTitle>
          <DialogDescription>
            Manage embedded files within this PDF document
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4 overflow-y-auto max-h-[50vh]">
            {/* Add attachment button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddAttachment}
              disabled={isProcessing}
              className="w-fit"
            >
              <IconPlus size={16} className="mr-2" />
              Add Attachment
            </Button>

            {/* Attachments list */}
            {attachments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <IconFile size={48} className="mb-2 opacity-50" />
                <p className="text-sm">No attachments found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.index}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <IconFile size={24} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{attachment.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.size)} • {attachment.mimeType || 'Unknown type'}
                      </div>
                      {attachment.description && (
                        <div className="text-xs text-muted-foreground truncate mt-1">
                          {attachment.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDownload(attachment)}
                        disabled={isProcessing}
                      >
                        <IconDownload size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(attachment)}
                        disabled={isProcessing}
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                <span>Attachment added successfully!</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
