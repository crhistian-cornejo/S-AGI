/**
 * File Export Button Component
 *
 * Botón para exportar archivo con o sin historial
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  IconDownload,
  IconFileZip,
  IconFileSpreadsheet,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  exportFileWithHistory,
  exportCurrentVersion,
} from "@/utils/file-export";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface FileExportButtonProps {
  fileId: string;
  fileName?: string; // Optional, will fetch from file if not provided
  fileType: "excel" | "doc" | "note";
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function FileExportButton({
  fileId,
  fileName: providedFileName,
  fileType,
  variant = "outline",
  size = "default",
}: FileExportButtonProps) {
  const [isExporting, setIsExporting] = React.useState(false);

  // Fetch file name if not provided
  const { data: file } = trpc.userFiles.get.useQuery(
    { id: fileId },
    { enabled: !providedFileName },
  );

  const fileName = providedFileName || file?.name || "archivo";

  const handleExportCurrent = async () => {
    try {
      setIsExporting(true);
      await exportCurrentVersion(fileId, fileName);
      toast.success("Archivo exportado");
    } catch (error) {
      console.error("[FileExportButton] Export error:", error);
      toast.error(
        "Error al exportar archivo: " +
          (error instanceof Error ? error.message : "Error desconocido"),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportWithHistory = async () => {
    try {
      setIsExporting(true);
      await exportFileWithHistory(fileId, fileName, {
        includeVersions: true,
        includeMetadata: true,
        includeDiff: true,
        compressSnapshots: true,
      });
      toast.success("Archivo exportado con historial completo");
    } catch (error) {
      console.error("[FileExportButton] Export with history error:", error);
      toast.error(
        "Error al exportar con historial: " +
          (error instanceof Error ? error.message : "Error desconocido"),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportWithHistoryNoDiff = async () => {
    try {
      setIsExporting(true);
      await exportFileWithHistory(fileId, fileName, {
        includeVersions: true,
        includeMetadata: true,
        includeDiff: false,
        compressSnapshots: true,
      });
      toast.success("Archivo exportado con historial (sin diffs)");
    } catch (error) {
      console.error("[FileExportButton] Export error:", error);
      toast.error("Error al exportar");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={isExporting}>
          <IconDownload size={16} className="mr-2" />
          {isExporting ? "Exportando..." : "Exportar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportCurrent}>
          <IconFileSpreadsheet size={16} className="mr-2" />
          Versión actual (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleExportWithHistory}>
          <IconFileZip size={16} className="mr-2" />
          Con historial completo (ZIP)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportWithHistoryNoDiff}>
          <IconFileZip size={16} className="mr-2" />
          Con historial (sin diffs)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
