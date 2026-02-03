import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  IconX,
  IconFile,
  IconFileTypePdf,
  IconPhoto,
  IconFolder,
  IconFileSpreadsheet,
  IconFileText,
} from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AttachmentChipProps {
  id: string;
  filename: string;
  type: string;
  size?: number;
  preview?: string;
  summary?: string;
  onRemove: () => void;
  className?: string;
}

function getFileIcon(type: string, filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (type.startsWith("image/")) {
    return <IconPhoto size={16} className="text-blue-500" />;
  }
  if (type === "application/pdf" || ext === "pdf") {
    return <IconFileTypePdf size={16} className="text-red-500" />;
  }
  if (
    type.includes("spreadsheet") ||
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "csv"
  ) {
    return <IconFileSpreadsheet size={16} className="text-green-500" />;
  }
  if (type.includes("word") || ext === "docx" || ext === "doc") {
    return <IconFileText size={16} className="text-blue-600" />;
  }
  if (type === "folder") {
    return <IconFolder size={16} className="text-amber-500" />;
  }
  return <IconFile size={16} className="text-muted-foreground" />;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateFilename(name: string, maxLength = 20) {
  if (name.length <= maxLength) return name;
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  const nameWithoutExt = name.slice(0, name.length - ext.length);
  const truncatedName = nameWithoutExt.slice(0, maxLength - ext.length - 3);
  return `${truncatedName}...${ext}`;
}

export const AttachmentChip = memo(function AttachmentChip({
  id: _id,
  filename,
  type,
  size,
  preview,
  summary,
  onRemove,
  className,
}: AttachmentChipProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip open={isHovered && (!!preview || !!summary)}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "group relative inline-flex items-center gap-2 px-3 py-2 rounded-xl",
              "bg-muted/60 hover:bg-muted border border-border/50 hover:border-border",
              "transition-all duration-200 cursor-default",
              "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
              className
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* File Icon */}
            <span className="shrink-0">{getFileIcon(type, filename)}</span>

            {/* Filename */}
            <span className="text-sm font-medium text-foreground/90 max-w-[150px] truncate">
              {truncateFilename(filename)}
            </span>

            {/* Remove Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className={cn(
                "shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
                "text-muted-foreground/60 hover:text-foreground",
                "hover:bg-destructive/10 hover:text-destructive",
                "transition-all duration-150"
              )}
            >
              <IconX size={14} />
            </button>
          </div>
        </TooltipTrigger>

        {/* Hover Preview Card */}
        {(preview || summary) && (
          <TooltipContent
            side="top"
            align="start"
            className={cn(
              "w-[280px] p-0 rounded-xl overflow-hidden",
              "bg-popover/95 backdrop-blur-xl border-border/50",
              "shadow-2xl",
              "animate-in fade-in-0 zoom-in-95 duration-200"
            )}
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-muted/80 flex items-center justify-center">
                  {getFileIcon(type, filename)}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-sm text-foreground truncate">
                    {filename}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="uppercase">{filename.split(".").pop()}</span>
                    {size && (
                      <>
                        <span className="text-border">·</span>
                        <span>{formatFileSize(size)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              {summary && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-primary/80">
                    <svg
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-3 h-3"
                    >
                      <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9-3a1 1 0 11-2 0 1 1 0 012 0zM8 7a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 018 7z" />
                    </svg>
                    <span className="font-medium">Summary by AI</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                    {summary}
                  </p>
                </div>
              )}

              {/* Image Preview */}
              {preview && type.startsWith("image/") && (
                <div className="mt-3 rounded-lg overflow-hidden border border-border/30">
                  <img
                    src={preview}
                    alt={filename}
                    className="w-full h-32 object-cover"
                  />
                </div>
              )}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
});

export default AttachmentChip;
