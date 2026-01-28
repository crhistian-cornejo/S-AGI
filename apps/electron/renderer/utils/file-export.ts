/**
 * File Export Utilities
 *
 * Funciones para exportar archivos con historial completo
 * NOTE: These functions work with pre-fetched data from React components
 */

import JSZip from "jszip";
import { exportToExcelBuffer } from "../features/univer/excel-exchange";
import { saveAs } from "file-saver";

// Helper to get file name from file data
function getFileName(file: any): string {
  return file.name || "untitled";
}

export interface ExportHistoryOptions {
  includeVersions?: boolean; // Incluir todas las versiones
  includeMetadata?: boolean; // Incluir metadatos JSON
  includeDiff?: boolean; // Incluir diffs entre versiones
  compressSnapshots?: boolean; // Comprimir snapshots grandes
}

// Types for file data
export interface FileData {
  id: string;
  name: string;
  type: string;
  description?: string;
  univer_data?: unknown;
  content?: string;
  version_count: number;
  total_edits: number;
  created_at: string;
  updated_at: string;
}

export interface VersionData {
  version_number: number;
  change_type: string;
  change_description?: string;
  univer_data?: unknown;
  content?: string;
  ai_model?: string;
  tool_name?: string;
  commit_id?: string;
  commit_message?: string;
  created_at: string;
}

/**
 * Exporta un archivo con su historial completo a un ZIP
 * Requires pre-fetched file and versions data
 */
export async function exportFileWithHistoryData(
  file: FileData,
  versions: VersionData[],
  fileName: string,
  options: ExportHistoryOptions = {},
): Promise<void> {
  const {
    includeVersions = true,
    includeMetadata = true,
    includeDiff = false,
    // compressSnapshots is handled by JSZip compression settings
  } = options;

  const zip = new JSZip();
  const safeFileName = fileName || getFileName(file);

  try {
    // 1. Exportar versión actual a Excel
    if (file.type === "excel" && file.univer_data) {
      const currentBuffer = await exportToExcelBuffer(file.univer_data as any);
      zip.file(`${safeFileName}.xlsx`, currentBuffer);
    } else if (file.type === "doc" && file.univer_data) {
      const docData = JSON.stringify(file.univer_data, null, 2);
      zip.file(`${safeFileName}.json`, docData);
    } else if (file.content) {
      zip.file(`${safeFileName}.md`, file.content);
    }

    // 2. Agregar metadatos del archivo
    if (includeMetadata) {
      const metadata = {
        file: {
          id: file.id,
          name: file.name,
          type: file.type,
          description: file.description,
          created_at: file.created_at,
          updated_at: file.updated_at,
          version_count: file.version_count,
          total_edits: file.total_edits,
        },
        exported_at: new Date().toISOString(),
        export_version: "1.0",
      };
      zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    }

    // 3. Agregar versiones si se solicita
    if (includeVersions && versions.length > 0) {
      const versionsDir = zip.folder("versions");
      if (!versionsDir) {
        throw new Error("Failed to create versions directory in ZIP");
      }

      for (const version of versions) {
        const versionFileName = `v${version.version_number}_${version.change_type}.json`;
        let versionData: string;

        if (version.univer_data) {
          versionData = JSON.stringify(version.univer_data, null, 2);
        } else if (version.content) {
          versionData = version.content;
        } else {
          versionData = "{}";
        }

        versionsDir.file(versionFileName, versionData);

        // Agregar metadatos de versión
        if (includeMetadata) {
          const versionMetadata = {
            version_number: version.version_number,
            change_type: version.change_type,
            change_description: version.change_description,
            created_at: version.created_at,
            ai_model: version.ai_model,
            tool_name: version.tool_name,
            commit_id: version.commit_id,
            commit_message: version.commit_message,
          };
          versionsDir.file(
            `v${version.version_number}_metadata.json`,
            JSON.stringify(versionMetadata, null, 2),
          );
        }
      }

      // 4. Agregar diffs si se solicita
      if (includeDiff && versions.length > 1) {
        const diffsDir = zip.folder("diffs");
        if (diffsDir) {
          for (let i = 0; i < versions.length - 1; i++) {
            const versionA = versions[i + 1];
            const versionB = versions[i];

            if (versionA.univer_data && versionB.univer_data) {
              const diffInfo = {
                from_version: versionA.version_number,
                to_version: versionB.version_number,
                from_date: versionA.created_at,
                to_date: versionB.created_at,
                change_type: versionB.change_type,
                change_description: versionB.change_description,
              };
              diffsDir.file(
                `v${versionA.version_number}_to_v${versionB.version_number}.json`,
                JSON.stringify(diffInfo, null, 2),
              );
            }
          }
        }
      }
    }

    // 5. Generar y descargar ZIP
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const zipFileName = `${safeFileName}_with_history_${new Date().toISOString().split("T")[0]}.zip`;
    saveAs(zipBlob, zipFileName);
  } catch (error) {
    console.error("[FileExport] Error exporting file with history:", error);
    throw error;
  }
}

/**
 * Exporta solo la versión actual de un archivo
 */
export async function exportCurrentVersionData(
  file: FileData,
  fileName: string,
): Promise<void> {
  if (file.type === "excel" && file.univer_data) {
    const buffer = await exportToExcelBuffer(file.univer_data as any);
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `${fileName}.xlsx`);
  } else if (file.content) {
    const blob = new Blob([file.content], { type: "text/markdown" });
    saveAs(blob, `${fileName}.md`);
  }
}

/**
 * Abre archivo en Google Sheets
 * Descarga el archivo y abre Google Sheets para importar
 */
export async function openInGoogleSheetsData(
  file: FileData,
  fileName: string,
): Promise<void> {
  if (file.type !== "excel") {
    throw new Error("Solo archivos Excel se pueden abrir en Google Sheets");
  }

  if (!file.univer_data) {
    throw new Error("El archivo no tiene datos para exportar");
  }

  // Exportar a Excel primero
  const buffer = await exportToExcelBuffer(file.univer_data as any);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // Descargar el archivo
  saveAs(blob, `${fileName}.xlsx`);

  // Abrir Google Sheets en nueva pestaña
  window.open(
    "https://docs.google.com/spreadsheets/create",
    "_blank",
    "noopener,noreferrer",
  );
}

/**
 * Compartir archivo via email
 * Descarga el archivo y abre el cliente de email
 */
export async function shareViaEmailData(
  file: FileData,
  fileName: string,
): Promise<void> {
  // Construir el cuerpo del email
  const subject = encodeURIComponent(`Archivo compartido: ${fileName}`);
  const body = encodeURIComponent(
    `Te comparto el archivo "${fileName}".\n\n` +
      `Por favor, encuentra el archivo adjunto o descárgalo desde la ubicación compartida.\n\n` +
      `Tipo: ${file.type === "excel" ? "Hoja de cálculo Excel" : file.type === "doc" ? "Documento" : "Nota"}\n` +
      `Última actualización: ${new Date(file.updated_at).toLocaleString("es-ES")}\n` +
      `Versiones: ${file.version_count}\n\n` +
      `---\n` +
      `Enviado desde S-AGI`,
  );

  // Descargar el archivo para que el usuario pueda adjuntarlo
  await exportCurrentVersionData(file, fileName);

  // Abrir cliente de email
  window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
}

// ====================================================================
// LEGACY WRAPPERS - These fetch data using the tRPC utils from caller
// ====================================================================

import { trpc } from "@/lib/trpc";

/**
 * Legacy wrapper that fetches file data before exporting
 * Must be called from within a React component that has trpc context
 */
export async function exportFileWithHistory(
  fileId: string,
  fileName: string,
  options: ExportHistoryOptions = {},
  utils?: ReturnType<typeof trpc.useUtils>,
): Promise<void> {
  if (!utils) {
    throw new Error("utils parameter is required for exportFileWithHistory");
  }

  const file = await utils.userFiles.get.fetch({ id: fileId });
  const versions = await utils.userFiles.listVersions.fetch({
    fileId,
    limit: 1000,
  });

  return exportFileWithHistoryData(file, versions, fileName, options);
}

export async function exportCurrentVersion(
  fileId: string,
  fileName: string,
  utils?: ReturnType<typeof trpc.useUtils>,
): Promise<void> {
  if (!utils) {
    throw new Error("utils parameter is required for exportCurrentVersion");
  }

  const file = await utils.userFiles.get.fetch({ id: fileId });
  return exportCurrentVersionData(file, fileName);
}

export async function openInGoogleSheets(
  fileId: string,
  fileName: string,
  utils?: ReturnType<typeof trpc.useUtils>,
): Promise<void> {
  if (!utils) {
    throw new Error("utils parameter is required for openInGoogleSheets");
  }

  const file = await utils.userFiles.get.fetch({ id: fileId });
  return openInGoogleSheetsData(file, fileName);
}

export async function shareViaEmail(
  fileId: string,
  fileName: string,
  utils?: ReturnType<typeof trpc.useUtils>,
): Promise<void> {
  if (!utils) {
    throw new Error("utils parameter is required for shareViaEmail");
  }

  const file = await utils.userFiles.get.fetch({ id: fileId });
  return shareViaEmailData(file, fileName);
}
