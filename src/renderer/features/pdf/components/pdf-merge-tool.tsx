import { memo, useState, useCallback } from 'react';
import { useRegistry } from '@embedpdf/core/react';
import type { PdfEngine, PdfFile } from '@embedpdf/models';
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
  IconFileTypePdf,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react';
import { cn, isElectron } from '@/lib/utils';

interface PdfMergeFile {
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
 * Uses PdfEngine merge API to combine multiple PDFs
 */
export const PdfMergeTool = memo(function PdfMergeTool({
  open,
  onOpenChange,
}: PdfMergeToolProps) {
  const { registry, pluginsReady } = useRegistry();

  const [pdfFiles, setPdfFiles] = useState<PdfMergeFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Add PDF files from file system (browser file picker)
  const handleAddFiles = useCallback(async () => {
    try {
      // Create file input for browser
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf';
      input.multiple = true;

      input.onchange = async (e) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;
        if (!files || files.length === 0) return;

        setIsLoading(true);
        const newFiles: PdfMergeFile[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          try {
            const arrayBuffer = await file.arrayBuffer();
            newFiles.push({
              id: `${Date.now()}-${Math.random()}`,
              name: file.name,
              arrayBuffer,
            });
          } catch (err) {
            console.error('Error loading file:', file.name, err);
          }
        }

        setPdfFiles((prev) => [...prev, ...newFiles]);
        setError(null);
        setIsLoading(false);
      };

      input.click();
    } catch (err) {
      console.error('Error adding files:', err);
      setError(err instanceof Error ? err.message : 'Failed to add files');
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

  // Merge PDFs using PdfEngine merge API
  const handleMerge = async () => {
    if (!registry || !pluginsReady) {
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
      const engine = registry.getEngine() as PdfEngine;
      if (!engine) {
        throw new Error('PDF engine not available');
      }

      // Convert PdfMergeFile to PdfFile format
      const filesToMerge: PdfFile[] = pdfFiles
        .filter((f) => f.arrayBuffer)
        .map((f) => ({
          id: f.id,
          name: f.name,
          content: f.arrayBuffer!,
        }));

      if (filesToMerge.length < 2) {
        throw new Error('Not enough valid PDF files to merge');
      }

      // Use the engine's merge API
      console.log('[PDF Merge] Merging', filesToMerge.length, 'PDFs...');
      const mergedFile = await engine.merge(filesToMerge).toPromise();

      // Download the merged PDF using browser API
      const blob = new Blob([mergedFile.content], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = mergedFile.name || 'merged.pdf';
      a.click();
      URL.revokeObjectURL(url);

      console.log('[PDF Merge] Successfully merged PDFs');
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
            disabled={isLoading}
            className="w-fit"
          >
            <IconPlus size={16} className="mr-2" />
            {isLoading ? 'Loading...' : 'Add PDF Files'}
          </Button>

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
