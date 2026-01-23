import { memo, useState, useCallback } from 'react';
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
  IconFileTypePdf,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react';
import { cn, isElectron } from '@/lib/utils';

interface PdfFile {
  id: string;
  name: string;
  path?: string; // For local files
  arrayBuffer?: ArrayBuffer; // Loaded PDF data
}

interface PdfMergeToolProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * PDF Merge Tool Dialog
 * Uses native PDFium FPDF_ImportPages API to merge multiple PDFs
 */
export const PdfMergeTool = memo(function PdfMergeTool({
  open,
  onOpenChange,
}: PdfMergeToolProps) {
  const { registry, pluginsReady } = useRegistry();
  const { provides: loaderApi } = useLoaderCapability();

  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Add PDF files from file system
  const handleAddFiles = useCallback(async () => {
    if (!isElectron()) {
      setError('File selection only available in desktop app');
      return;
    }

    try {
      // Use Electron IPC to open file dialog
      // @ts-expect-error - Electron IPC API
      const result = await window.electron.openFileDialog({
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        properties: ['openFile', 'multiSelections'],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }

      // Load PDF files
      setIsLoading(true);
      const newFiles: PdfFile[] = [];

      for (const filePath of result.filePaths) {
        try {
          // @ts-expect-error - Electron IPC API
          const fileResult = await window.electron.readFile(filePath);
          if (!fileResult.success || !fileResult.data) {
            console.warn('Failed to read file:', filePath);
            continue;
          }

          // Convert base64 to ArrayBuffer
          const binaryString = window.atob(fileResult.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const fileName = filePath.split(/[/\\]/).pop() || 'Unknown.pdf';
          newFiles.push({
            id: `${Date.now()}-${Math.random()}`,
            name: fileName,
            path: filePath,
            arrayBuffer: bytes.buffer,
          });
        } catch (err) {
          console.error('Error loading file:', filePath, err);
        }
      }

      setPdfFiles((prev) => [...prev, ...newFiles]);
      setError(null);
    } catch (err) {
      console.error('Error adding files:', err);
      setError(err instanceof Error ? err.message : 'Failed to add files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Remove PDF file
  const handleRemoveFile = useCallback((id: string) => {
    setPdfFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Move file up in list
  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setPdfFiles((prev) => {
      const newFiles = [...prev];
      [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
      return newFiles;
    });
  }, []);

  // Move file down in list
  const handleMoveDown = useCallback((index: number) => {
    setPdfFiles((prev) => {
      if (index >= prev.length - 1) return prev;
      const newFiles = [...prev];
      [newFiles[index], newFiles[index + 1]] = [newFiles[index + 1], newFiles[index]];
      return newFiles;
    });
  }, []);

  // Merge PDFs using native PDFium API
  const handleMerge = async () => {
    if (!registry || !loaderApi || !pluginsReady) {
      setError('PDF engine not ready');
      return;
    }

    if (pdfFiles.length < 2) {
      setError('Please add at least 2 PDF files to merge');
      return;
    }

    setIsMerging(true);
    setError(null);

    try {
      const engine = registry.getEngine() as any;
      if (!engine || !engine.pdfium) {
        throw new Error('PDFium engine not available');
      }

      const pdfium = engine.pdfium;

      // Create a new destination document
      const destDoc = pdfium.FPDF_CreateNewDocument();
      if (!destDoc) {
        throw new Error('Failed to create new document');
      }

      // Import pages from each PDF
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        if (!file.arrayBuffer) continue;

        // Load source document
        const uint8Array = new Uint8Array(file.arrayBuffer);
        const dataPtr = pdfium.wasmExports.malloc(uint8Array.length);
        pdfium.HEAPU8.set(uint8Array, dataPtr);

        const srcDoc = pdfium.FPDF_LoadMemDocument(dataPtr, uint8Array.length, null);
        pdfium.wasmExports.free(dataPtr);

        if (!srcDoc) {
          console.warn('Failed to load source document:', file.name);
          continue;
        }

        // Get page count
        const pageCount = pdfium.FPDF_GetPageCount(srcDoc);

        // Import all pages (null = all pages)
        const success = pdfium.FPDF_ImportPages(
          destDoc,
          srcDoc,
          null, // Import all pages
          i === 0 ? 0 : -1, // Insert at end
        );

        // Close source document
        pdfium.FPDF_CloseDocument(srcDoc);

        if (!success) {
          console.warn('Failed to import pages from:', file.name);
        } else {
          console.log(`[PDF Merge] Imported ${pageCount} pages from ${file.name}`);
        }
      }

      // Save the merged document to ArrayBuffer
      // Use FPDF_SaveAsCopy to get the PDF data
      const saveResult = pdfium.FPDF_SaveAsCopy(destDoc);

      // Close destination document
      pdfium.FPDF_CloseDocument(destDoc);

      if (!saveResult || !saveResult.data) {
        throw new Error('Failed to save merged document');
      }

      // Download the merged PDF
      const blob = new Blob([saveResult.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'merged.pdf';
      a.click();
      URL.revokeObjectURL(url);

      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
        setPdfFiles([]);
      }, 2000);
    } catch (err) {
      console.error('[PDF Merge] Error merging PDFs:', err);
      setError(err instanceof Error ? err.message : 'Failed to merge PDFs');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>PDF Merge Tool</DialogTitle>
          <DialogDescription>
            Combine multiple PDF files into a single document
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4 overflow-y-auto max-h-[50vh]">
          {/* Add files button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddFiles}
            disabled={isLoading || !isElectron()}
            className="w-fit"
          >
            <IconPlus size={16} className="mr-2" />
            {isLoading ? 'Loading...' : 'Add PDF Files'}
          </Button>

          {!isElectron() && (
            <div className="text-sm text-muted-foreground">
              PDF merge is only available in the desktop app
            </div>
          )}

          {/* File list */}
          {pdfFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <IconFileTypePdf size={48} className="mb-3 opacity-50" />
              <p className="text-sm">No PDF files added</p>
              <p className="text-xs">Click "Add PDF Files" to start</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pdfFiles.map((file, index) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <IconFileTypePdf size={20} className="text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Position: {index + 1} of {pdfFiles.length}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                    >
                      <IconArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === pdfFiles.length - 1}
                    >
                      <IconArrowDown size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveFile(file.id)}
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
              <span>PDFs merged successfully! Download started.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMerging}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={pdfFiles.length < 2 || isMerging || isLoading}
          >
            {isMerging ? (
              <>
                <IconLoader2 size={16} className="mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              `Merge ${pdfFiles.length} PDFs`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
