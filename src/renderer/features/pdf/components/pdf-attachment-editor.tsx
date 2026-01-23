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
import {
  IconLoader2,
  IconCheck,
  IconAlertCircle,
  IconPlus,
  IconTrash,
  IconPaperclip,
  IconDownload,
} from '@tabler/icons-react';
import { cn, isElectron } from '@/lib/utils';

interface PdfAttachment {
  /** Attachment handle from PDFium */
  handle: number;
  /** Attachment index */
  index: number;
  /** Display name */
  name: string;
  /** File size in bytes */
  size?: number;
  /** MIME type */
  mimeType?: string;
}

interface PdfAttachmentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * PDF Attachment Editor Dialog
 * Uses native PDFium APIs to read, add, and delete PDF attachments
 */
export const PdfAttachmentEditor = memo(function PdfAttachmentEditor({
  open,
  onOpenChange,
}: PdfAttachmentEditorProps) {
  const { registry, pluginsReady } = useRegistry();
  const { provides: loaderApi } = useLoaderCapability();

  const [attachments, setAttachments] = useState<PdfAttachment[]>([]);
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

        const engine = registry.getEngine() as any;
        if (!engine || !engine.pdfium) {
          throw new Error('PDFium engine not available');
        }

        const pdfium = engine.pdfium;

        // Get attachment count
        const count = pdfium.FPDFDoc_GetAttachmentCount(doc.handle);
        console.log('[PDF Attachments] Found', count, 'attachments');

        const loadedAttachments: PdfAttachment[] = [];

        for (let i = 0; i < count; i++) {
          try {
            const attachmentHandle = pdfium.FPDFDoc_GetAttachment(doc.handle, i);
            if (!attachmentHandle) continue;

            // Get attachment name
            const nameLength = pdfium.FPDFAttachment_GetName(
              attachmentHandle,
              null,
              0,
            );
            let name = `Attachment ${i + 1}`;

            if (nameLength > 0) {
              const nameBuffer = pdfium.wasmExports.malloc(nameLength * 2);
              pdfium.FPDFAttachment_GetName(
                attachmentHandle,
                nameBuffer,
                nameLength,
              );
              name = pdfium.UTF16ToString(nameBuffer);
              pdfium.wasmExports.free(nameBuffer);
            }

            // Get file size (if available)
            let size: number | undefined;
            const hasSize = pdfium.FPDFAttachment_HasKey(attachmentHandle, 'Size');
            if (hasSize) {
              // Try to get size from params
              const sizeLength = pdfium.FPDFAttachment_GetStringValue(
                attachmentHandle,
                'Size',
                null,
                0,
              );
              if (sizeLength > 0) {
                const sizeBuffer = pdfium.wasmExports.malloc(sizeLength * 2);
                pdfium.FPDFAttachment_GetStringValue(
                  attachmentHandle,
                  'Size',
                  sizeBuffer,
                  sizeLength,
                );
                const sizeStr = pdfium.UTF16ToString(sizeBuffer);
                pdfium.wasmExports.free(sizeBuffer);
                size = parseInt(sizeStr, 10);
              }
            }

            loadedAttachments.push({
              handle: attachmentHandle,
              index: i,
              name,
              size,
            });
          } catch (err) {
            console.warn('Failed to read attachment', i, err);
          }
        }

        setAttachments(loadedAttachments);
        console.log('[PDF Attachments] Loaded attachments:', loadedAttachments);
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
    async (index: number) => {
      if (!registry || !loaderApi) return;

      setIsProcessing(true);
      setError(null);

      try {
        const doc = loaderApi.getDocument();
        if (!doc) throw new Error('No document loaded');

        const engine = registry.getEngine() as any;
        const pdfium = engine.pdfium;

        // Delete attachment using native API
        const success = pdfium.FPDFDoc_DeleteAttachment(doc.handle, index);
        if (!success) {
          throw new Error('Failed to delete attachment');
        }

        // Remove from state
        setAttachments((prev) => prev.filter((_, i) => i !== index));
        console.log('[PDF Attachments] Deleted attachment at index:', index);
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
    async (attachment: PdfAttachment) => {
      if (!registry || !loaderApi) return;

      setIsProcessing(true);
      setError(null);

      try {
        const doc = loaderApi.getDocument();
        if (!doc) throw new Error('No document loaded');

        const engine = registry.getEngine() as any;
        const pdfium = engine.pdfium;

        // Get file size first
        const size = pdfium.FPDFAttachment_GetFile(
          attachment.handle,
          null,
          0,
          null,
        );
        if (size <= 0) {
          throw new Error('Attachment has no data');
        }

        // Allocate buffer and read file data
        const buffer = pdfium.wasmExports.malloc(size);
        const lengthPtr = pdfium.wasmExports.malloc(4);
        pdfium.HEAPU32[lengthPtr >> 2] = size;

        const success = pdfium.FPDFAttachment_GetFile(
          attachment.handle,
          buffer,
          size,
          lengthPtr,
        );

        const actualSize = pdfium.HEAPU32[lengthPtr >> 2];
        pdfium.wasmExports.free(lengthPtr);

        if (!success || actualSize === 0) {
          pdfium.wasmExports.free(buffer);
          throw new Error('Failed to read attachment data');
        }

        // Create blob and download
        const data = new Uint8Array(pdfium.HEAPU8.buffer, buffer, actualSize);
        const blob = new Blob([data], { type: 'application/octet-stream' });
        pdfium.wasmExports.free(buffer);

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

  // Add attachment from file system
  const handleAddAttachment = useCallback(async () => {
    if (!isElectron()) {
      setError('Adding attachments only available in desktop app');
      return;
    }

    if (!registry || !loaderApi) return;

    try {
      // @ts-expect-error - Electron IPC API
      const result = await window.electron.openFileDialog({
        properties: ['openFile'],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }

      const filePath = result.filePaths[0];
      const fileName = filePath.split(/[/\\]/).pop() || 'attachment';

      setIsProcessing(true);
      setError(null);

      // Read file data
      // @ts-expect-error - Electron IPC API
      const fileResult = await window.electron.readFile(filePath);
      if (!fileResult.success || !fileResult.data) {
        throw new Error('Failed to read file');
      }

      // Convert base64 to Uint8Array
      const binaryString = window.atob(fileResult.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const doc = loaderApi.getDocument();
      if (!doc) throw new Error('No document loaded');

      const engine = registry.getEngine() as any;
      const pdfium = engine.pdfium;

      // Create attachment name as UTF-16 buffer
      const nameBuffer = pdfium.stringToUTF16(fileName);

      // Add attachment
      const attachmentHandle = pdfium.FPDFDoc_AddAttachment(
        doc.handle,
        nameBuffer,
      );

      if (!attachmentHandle) {
        throw new Error('Failed to create attachment');
      }

      // Set file data
      const dataPtr = pdfium.wasmExports.malloc(bytes.length);
      pdfium.HEAPU8.set(bytes, dataPtr);

      const success = pdfium.FPDFAttachment_SetFile(
        attachmentHandle,
        doc.handle,
        dataPtr,
        bytes.length,
      );

      pdfium.wasmExports.free(dataPtr);

      if (!success) {
        throw new Error('Failed to set attachment data');
      }

      // Reload attachments
      const count = pdfium.FPDFDoc_GetAttachmentCount(doc.handle);
      const newAttachments: PdfAttachment[] = [];

      for (let i = 0; i < count; i++) {
        const handle = pdfium.FPDFDoc_GetAttachment(doc.handle, i);
        if (!handle) continue;

        const nameLength = pdfium.FPDFAttachment_GetName(handle, null, 0);
        let name = `Attachment ${i + 1}`;

        if (nameLength > 0) {
          const nb = pdfium.wasmExports.malloc(nameLength * 2);
          pdfium.FPDFAttachment_GetName(handle, nb, nameLength);
          name = pdfium.UTF16ToString(nb);
          pdfium.wasmExports.free(nb);
        }

        newAttachments.push({ handle, index: i, name });
      }

      setAttachments(newAttachments);
      console.log('[PDF Attachments] Added attachment:', fileName);
    } catch (err) {
      console.error('[PDF Attachments] Error adding attachment:', err);
      setError(err instanceof Error ? err.message : 'Failed to add attachment');
    } finally {
      setIsProcessing(false);
    }
  }, [registry, loaderApi]);

  // Save changes
  const handleSave = async () => {
    setSuccess(true);
    setTimeout(() => {
      onOpenChange(false);
      setSuccess(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>PDF Attachment Editor</DialogTitle>
          <DialogDescription>
            Manage embedded files and attachments in the PDF
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
              disabled={isProcessing || !isElectron()}
              className="w-fit"
            >
              <IconPlus size={16} className="mr-2" />
              Add Attachment
            </Button>

            {!isElectron() && (
              <div className="text-sm text-muted-foreground">
                Adding attachments is only available in the desktop app
              </div>
            )}

            {/* Attachments list */}
            {attachments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <IconPaperclip size={48} className="mb-3 opacity-50" />
                <p className="text-sm">No attachments found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.index}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <IconPaperclip size={20} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {attachment.name}
                      </div>
                      {attachment.size && (
                        <div className="text-xs text-muted-foreground">
                          {(attachment.size / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDownload(attachment)}
                        disabled={isProcessing}
                      >
                        <IconDownload size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(attachment.index)}
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
                <span>Attachments saved successfully!</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || isProcessing}>
            {isProcessing ? (
              <>
                <IconLoader2 size={16} className="mr-2 animate-spin" />
                Processing...
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
