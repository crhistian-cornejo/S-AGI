import { useState, useCallback, useRef } from "react";
import { useSetAtom } from "jotai";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconUpload,
  IconCloud,
  IconDeviceFloppy,
  IconFile,
  IconX,
  IconLoader2,
  IconCheck,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  addLocalPdfAtom,
  selectedPdfAtom,
  setLocalPdfBlobAtom,
  type PdfSource,
} from "@/lib/atoms/pdf";
import { trpc } from "@/lib/trpc";

interface KnowledgeDropZoneProps {
  onUploadComplete?: () => void;
}

/**
 * Convert a File to base64 data
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data:xxx;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64 || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function KnowledgeDropZone({
  onUploadComplete,
}: KnowledgeDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<"local" | "cloud" | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Atoms for PDF state management
  const addLocalPdf = useSetAtom(addLocalPdfAtom);
  const setSelectedPdf = useSetAtom(selectedPdfAtom);
  const setLocalPdfBlob = useSetAtom(setLocalPdfBlobAtom);

  // tRPC hooks for cloud upload
  const { data: apiKeyData } = trpc.settings.getOpenAIKey.useQuery();
  const apiKey = apiKeyData?.key || null;

  // For cloud upload, we need a knowledge base chat ID
  // We'll create a special "knowledge-base" chat for this purpose
  const KNOWLEDGE_BASE_CHAT_ID = "00000000-0000-0000-0000-000000000001"; // Special UUID for knowledge base

  const uploadMutation = trpc.files.uploadForChat.useMutation({
    onSuccess: () => {
      toast.success("File uploaded to cloud knowledge base");
      setIsUploading(false);
      setShowDialog(false);
      setSelectedFile(null);
      setUploadType(null);
      onUploadComplete?.();
    },
    onError: (error) => {
      console.error("Upload error:", error);
      toast.error(`Failed to upload: ${error.message}`);
      setIsUploading(false);
    },
  });

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setShowDialog(true);
    }
  }, []);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        setSelectedFile(files[0]);
        setShowDialog(true);
      }
    },
    [],
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !uploadType) return;

    setIsUploading(true);

    try {
      if (uploadType === "cloud") {
        // Cloud upload - use OpenAI vector store (same as chat uploads)
        if (!apiKey) {
          toast.error(
            "OpenAI API key not configured. Please add your API key in Settings.",
          );
          setIsUploading(false);
          return;
        }

        // Convert file to base64
        const base64Data = await fileToBase64(selectedFile);

        // Upload to knowledge base using the same infrastructure as chat files
        await uploadMutation.mutateAsync({
          chatId: KNOWLEDGE_BASE_CHAT_ID,
          fileName: selectedFile.name,
          fileBase64: base64Data,
          apiKey,
        });

        // Success handled by mutation callbacks
      } else {
        // Local upload - just use it as a chat_file type with blob URL
        // This way it works the same as cloud files but stored locally

        // Check if it's a PDF file
        if (selectedFile.type !== "application/pdf" && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
          toast.error("Only PDF files can be added to local knowledge");
          setIsUploading(false);
          return;
        }

        // Create blob URL for immediate display (same as cloud files)
        const blob = new Blob([selectedFile], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);

        // Create PdfSource as a "chat_file" type (not "local") so it uses the URL directly
        const pdfSource: PdfSource = {
          type: "chat_file", // Use chat_file type to avoid IPC loading
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: selectedFile.name,
          url: blobUrl, // Direct blob URL
          chatId: "local-knowledge", // Mark as local knowledge
          metadata: {
            fileSize: selectedFile.size,
            createdAt: new Date().toISOString(),
          },
        };

        // Add to local PDFs list
        addLocalPdf(pdfSource);

        // Set as selected PDF to display it immediately
        setSelectedPdf(pdfSource);

        toast.success(`Added "${selectedFile.name}" to local knowledge`);
        setIsUploading(false);
        setShowDialog(false);
        setSelectedFile(null);
        setUploadType(null);
        onUploadComplete?.();
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to add file to knowledge",
      );
      setIsUploading(false);
    }
  }, [selectedFile, uploadType, apiKey, uploadMutation, addLocalPdf, setSelectedPdf, setLocalPdfBlob, onUploadComplete]);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    setSelectedFile(null);
    setUploadType(null);
    setIsUploading(false);
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <>
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleFileSelect}
        className={cn(
          "relative mb-2 p-3 rounded-md border-2 border-dashed transition-all cursor-pointer",
          "hover:bg-accent/30 hover:border-primary/40",
          isDragging
            ? "bg-primary/10 border-primary scale-[1.02]"
            : "bg-accent/10 border-border/40",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInputChange}
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.html,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.cs,.go,.rb,.php,.sh,.tex,.pptx"
        />

        <div className="flex items-center gap-2 text-center justify-center">
          <IconUpload
            size={16}
            className={cn(
              "transition-all shrink-0",
              isDragging
                ? "text-primary animate-bounce"
                : "text-muted-foreground",
            )}
          />
          <div className="text-left">
            <p className="text-xs font-medium text-foreground">
              {isDragging ? "Drop here" : "Upload Document"}
            </p>
            <p className="text-[10px] text-muted-foreground">Local or Cloud</p>
          </div>
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[450px] bg-white dark:bg-zinc-950">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Choose where to store this document
            </DialogDescription>
          </DialogHeader>

          {selectedFile && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 w-full overflow-hidden">
              <IconFile size={32} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleCancel}
                disabled={isUploading}
              >
                <IconX size={14} />
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-4">
            {/* Local Option */}
            <button
              type="button"
              onClick={() => setUploadType("local")}
              disabled={isUploading}
              className={cn(
                "flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all",
                "hover:bg-accent/50 hover:border-primary/40",
                uploadType === "local"
                  ? "bg-primary/10 border-primary ring-2 ring-primary/20 dark:bg-primary/20"
                  : "bg-card border-border hover:bg-accent/50",
                isUploading && "opacity-50 cursor-not-allowed",
              )}
            >
              <IconDeviceFloppy
                size={32}
                className={
                  uploadType === "local"
                    ? "text-primary"
                    : "text-muted-foreground"
                }
              />
              <div className="text-center">
                <p className="text-sm font-medium">Local Only</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Store locally for this device
                </p>
              </div>
            </button>

            {/* Cloud Option */}
            <button
              type="button"
              onClick={() => setUploadType("cloud")}
              disabled={isUploading}
              className={cn(
                "flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all",
                "hover:bg-accent/50 hover:border-primary/40",
                uploadType === "cloud"
                  ? "bg-primary/10 border-primary ring-2 ring-primary/20 dark:bg-primary/20"
                  : "bg-card border-border hover:bg-accent/50",
                isUploading && "opacity-50 cursor-not-allowed",
              )}
            >
              <IconCloud
                size={32}
                className={
                  uploadType === "cloud"
                    ? "text-primary"
                    : "text-muted-foreground"
                }
              />
              <div className="text-center">
                <p className="text-sm font-medium">Cloud RAG</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Parse & index in Supabase
                </p>
              </div>
            </button>
          </div>

          {uploadType === "cloud" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <IconCheck size={16} className="text-blue-500 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-600 dark:text-blue-400">
                <p className="font-medium">RAG-enabled knowledge</p>
                <p className="mt-1 text-blue-600/80 dark:text-blue-400/80">
                  File will be processed, chunked, and indexed for semantic
                  search across all your chats
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadType || isUploading}
            >
              {isUploading ? (
                <>
                  <IconLoader2 size={16} className="mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <IconUpload size={16} className="mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
