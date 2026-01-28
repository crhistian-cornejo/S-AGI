/**
 * Version Preview Banner
 * Shows a banner when viewing a historical version (read-only mode)
 */
import * as React from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  versionPreviewDataAtom,
  versionPreviewLoadingAtom,
  versionHistoryPreviewVersionAtom,
} from "@/lib/atoms/user-files";
import { IconHistory, IconX, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VersionPreviewBannerProps {
  fileId: string | null;
  className?: string;
}

export function VersionPreviewBanner({ fileId, className }: VersionPreviewBannerProps) {
  const previewData = useAtomValue(versionPreviewDataAtom);
  const isLoading = useAtomValue(versionPreviewLoadingAtom);
  const setPreviewVersion = useSetAtom(versionHistoryPreviewVersionAtom);

  // Only show if we're previewing and the fileId matches
  const isActive = previewData && previewData.fileId === fileId;

  const handleClose = () => {
    setPreviewVersion(null);
  };

  // Show loading state
  if (isLoading && fileId) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 text-blue-600 dark:text-blue-400",
          className
        )}
      >
        <IconLoader2 size={16} className="animate-spin" />
        <span className="text-sm font-medium">Cargando versión...</span>
      </div>
    );
  }

  if (!isActive) {
    return null;
  }

  const getChangeTypeLabel = (changeType: string): string => {
    const labels: Record<string, string> = {
      created: "Creado",
      auto_save: "Auto-guardado",
      manual_save: "Guardado manual",
      ai_edit: "Editado por IA",
      ai_create: "Creado por IA",
      restore: "Restaurado",
      import: "Importado",
    };
    return labels[changeType] || changeType;
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20",
        className
      )}
    >
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <IconHistory size={16} />
        <span className="text-sm font-medium">
          Viendo versión {previewData.versionNumber}
        </span>
        <span className="text-xs text-amber-600/80 dark:text-amber-400/80">
          ({getChangeTypeLabel(previewData.changeType)})
        </span>
        {previewData.changeDescription && (
          <span className="text-xs text-amber-600/60 dark:text-amber-400/60 truncate max-w-[200px]">
            - {previewData.changeDescription}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-600/80 dark:text-amber-400/80 bg-amber-500/20 px-2 py-0.5 rounded">
          Solo lectura
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="h-6 px-2 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
        >
          <IconX size={14} className="mr-1" />
          Cerrar preview
        </Button>
      </div>
    </div>
  );
}
