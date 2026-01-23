import { memo, useState, useEffect } from 'react';
import { useRegistry } from '@embedpdf/core/react';
import { useLoaderCapability } from '@embedpdf/plugin-loader/react';
import type { PdfEngine } from '@embedpdf/models';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { IconLoader2, IconCheck, IconAlertCircle } from '@tabler/icons-react';

interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
}

interface PdfMetadataEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * PDF Metadata Editor Dialog
 * Uses native PDFium APIs to read and write PDF metadata
 */
export const PdfMetadataEditor = memo(function PdfMetadataEditor({
  open,
  onOpenChange,
}: PdfMetadataEditorProps) {
  const { registry, pluginsReady } = useRegistry();
  const { provides: loaderApi } = useLoaderCapability();

  const [metadata, setMetadata] = useState<PdfMetadata>({
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
    creationDate: '',
    modificationDate: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load metadata when dialog opens
  useEffect(() => {
    if (!open || !registry || !loaderApi || !pluginsReady) return;

    const loadMetadata = async () => {
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

        // Use the engine's getMetadata API
        const meta = await engine.getMetadata(doc).toPromise();

        setMetadata({
          title: meta.title || '',
          author: meta.author || '',
          subject: meta.subject || '',
          keywords: meta.keywords || '',
          creator: meta.creator || '',
          producer: meta.producer || '',
          creationDate: meta.creationDate ? (typeof meta.creationDate === 'string' ? meta.creationDate : meta.creationDate.toISOString()) : '',
          modificationDate: meta.modificationDate ? (typeof meta.modificationDate === 'string' ? meta.modificationDate : meta.modificationDate.toISOString()) : '',
        });

        console.log('[PDF Metadata] Loaded metadata successfully');
      } catch (err) {
        console.error('[PDF Metadata] Error loading metadata:', err);
        setError(err instanceof Error ? err.message : 'Failed to load metadata');
      } finally {
        setIsLoading(false);
      }
    };

    loadMetadata();
  }, [open, registry, loaderApi, pluginsReady]);

  const handleSave = async () => {
    if (!registry || !loaderApi) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const doc = loaderApi.getDocument();
      if (!doc) {
        throw new Error('No document loaded');
      }

      const engine = registry.getEngine() as PdfEngine;
      if (!engine) {
        throw new Error('PDFium engine not initialized. Please wait for the PDF to fully load.');
      }

      // Use the engine's setMetadata API
      await engine.setMetadata(doc, {
        title: metadata.title || undefined,
        author: metadata.author || undefined,
        subject: metadata.subject || undefined,
        keywords: metadata.keywords || undefined,
        creator: metadata.creator || undefined,
        producer: metadata.producer || undefined,
      }).toPromise();

      console.log('[PDF Metadata] Saved metadata successfully');
      setSuccess(true);

      // Close dialog after a short delay
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('[PDF Metadata] Error saving metadata:', err);
      setError(err instanceof Error ? err.message : 'Failed to save metadata');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof PdfMetadata, value: string) => {
    setMetadata((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>PDF Metadata Editor</DialogTitle>
          <DialogDescription>
            Edit document information and metadata properties
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={metadata.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Document title"
              />
            </div>

            {/* Author */}
            <div className="grid gap-2">
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                value={metadata.author}
                onChange={(e) => handleChange('author', e.target.value)}
                placeholder="Document author"
              />
            </div>

            {/* Subject */}
            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={metadata.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                placeholder="Document subject"
              />
            </div>

            {/* Keywords */}
            <div className="grid gap-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                value={metadata.keywords}
                onChange={(e) => handleChange('keywords', e.target.value)}
                placeholder="Comma-separated keywords"
              />
            </div>

            {/* Creator (read-only) */}
            <div className="grid gap-2">
              <Label htmlFor="creator">Creator</Label>
              <Input
                id="creator"
                value={metadata.creator}
                onChange={(e) => handleChange('creator', e.target.value)}
                placeholder="Creating application"
              />
            </div>

            {/* Producer (read-only) */}
            <div className="grid gap-2">
              <Label htmlFor="producer">Producer</Label>
              <Input
                id="producer"
                value={metadata.producer}
                onChange={(e) => handleChange('producer', e.target.value)}
                placeholder="PDF producer"
              />
            </div>

            {/* Creation Date (read-only) */}
            {metadata.creationDate && (
              <div className="grid gap-2">
                <Label>Creation Date</Label>
                <Input value={metadata.creationDate} disabled />
              </div>
            )}

            {/* Modification Date (read-only) */}
            {metadata.modificationDate && (
              <div className="grid gap-2">
                <Label>Modification Date</Label>
                <Input value={metadata.modificationDate} disabled />
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
                <span>Metadata saved successfully!</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
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
