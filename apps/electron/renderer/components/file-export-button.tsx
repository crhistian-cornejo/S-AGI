/**
 * File Export Button Component
 *
 * Botón para exportar archivo con o sin historial
 * Incluye opciones para compartir y abrir en Google Sheets
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  IconDownload,
  IconFileZip,
  IconFileSpreadsheet,
  IconBrandGoogle,
  IconMail,
  IconCopy,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  exportFileWithHistory,
  exportCurrentVersion,
  openInGoogleSheets,
  shareViaEmail,
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
  const utils = trpc.useUtils();

  // Fetch file name if not provided
  const { data: file } = trpc.userFiles.get.useQuery(
    { id: fileId },
    { enabled: !providedFileName },
  );

  const fileName = providedFileName || file?.name || "archivo";

  const handleExportCurrent = async () => {
    try {
      setIsExporting(true);
      await exportCurrentVersion(fileId, fileName, utils);
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
      await exportFileWithHistory(
        fileId,
        fileName,
        {
          includeVersions: true,
          includeMetadata: true,
          includeDiff: true,
          compressSnapshots: true,
        },
        utils,
      );
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
      await exportFileWithHistory(
        fileId,
        fileName,
        {
          includeVersions: true,
          includeMetadata: true,
          includeDiff: false,
          compressSnapshots: true,
        },
        utils,
      );
      toast.success("Archivo exportado con historial (sin diffs)");
    } catch (error) {
      console.error("[FileExportButton] Export error:", error);
      toast.error("Error al exportar");
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenInGoogleSheets = async () => {
    try {
      setIsExporting(true);
      await openInGoogleSheets(fileId, fileName, utils);
      toast.success(
        "Archivo descargado. Importa el archivo en Google Sheets.",
        { duration: 5000 },
      );
    } catch (error) {
      console.error("[FileExportButton] Google Sheets error:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al abrir en Google Sheets",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareViaEmail = async () => {
    try {
      setIsExporting(true);
      await shareViaEmail(fileId, fileName, utils);
      toast.success("Archivo descargado. Adjúntalo al email.");
    } catch (error) {
      console.error("[FileExportButton] Email share error:", error);
      toast.error("Error al compartir por email");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyFileName = () => {
    navigator.clipboard.writeText(`${fileName}.xlsx`);
    toast.success("Nombre de archivo copiado");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={isExporting}>
          <IconDownload size={16} className="mr-2" />
          {isExporting ? "Exportando..." : "Exportar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Descargar
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={handleExportCurrent}>
          <IconFileSpreadsheet size={16} className="mr-2" />
          Versión actual (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportWithHistory}>
          <IconFileZip size={16} className="mr-2" />
          Con historial completo (ZIP)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportWithHistoryNoDiff}>
          <IconFileZip size={16} className="mr-2" />
          Con historial (sin diffs)
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Compartir
        </DropdownMenuLabel>

        {fileType === "excel" && (
          <DropdownMenuItem onClick={handleOpenInGoogleSheets}>
            <IconBrandGoogle size={16} className="mr-2" />
            Abrir en Google Sheets
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleShareViaEmail}>
          <IconMail size={16} className="mr-2" />
          Enviar por email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyFileName}>
          <IconCopy size={16} className="mr-2" />
          Copiar nombre de archivo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
