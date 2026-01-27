/**
 * File Export Utilities
 *
 * Funciones para exportar archivos con historial completo
 */

import JSZip from "jszip";
import { exportToExcelBuffer } from "../features/univer/excel-exchange";
import { trpc } from "@/lib/trpc";
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

/**
 * Exporta un archivo con su historial completo a un ZIP
 */
export async function exportFileWithHistory(
  fileId: string,
  fileName: string,
  options: ExportHistoryOptions = {},
): Promise<void> {
  const {
    includeVersions = true,
    includeMetadata = true,
    includeDiff = false,
    compressSnapshots = false,
  } = options;

  const zip = new JSZip();

  try {
    // 1. Obtener archivo actual
    const file = await trpc.userFiles.get.query({ id: fileId });
    const safeFileName = fileName || getFileName(file);

    // 2. Exportar versión actual a Excel
    if (file.type === "excel" && file.univer_data) {
      const currentBuffer = await exportToExcelBuffer(file.univer_data as any);
      zip.file(`${safeFileName}.xlsx`, currentBuffer);
    } else if (file.type === "doc" && file.univer_data) {
      // Para docs, guardar como JSON (o convertir a DOCX si hay utilidad)
      const docData = JSON.stringify(file.univer_data, null, 2);
      zip.file(`${safeFileName}.json`, docData);
    } else if (file.content) {
      zip.file(`${safeFileName}.md`, file.content);
    }

    // 3. Agregar metadatos del archivo
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

    // 4. Agregar versiones si se solicita
    if (includeVersions) {
      const versions = await trpc.userFiles.listVersions.query({
        fileId,
        limit: 1000, // Obtener todas las versiones
      });

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

        // Comprimir si se solicita y el tamaño es grande
        if (compressSnapshots && versionData.length > 100000) {
          // Usar compresión (JSZip ya comprime automáticamente)
          versionsDir.file(versionFileName, versionData);
        } else {
          versionsDir.file(versionFileName, versionData);
        }

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

      // 5. Agregar diffs si se solicita
      if (includeDiff && versions.length > 1) {
        const diffsDir = zip.folder("diffs");
        if (diffsDir) {
          // Calcular diffs entre versiones consecutivas
          for (let i = 0; i < versions.length - 1; i++) {
            const versionA = versions[i + 1]; // Más antigua
            const versionB = versions[i]; // Más reciente

            if (versionA.univer_data && versionB.univer_data) {
              // El diff se calcula en el cliente usando univer-diff.ts
              // Aquí solo guardamos referencias
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

      // 6. Agregar historial de commits
      if (includeMetadata) {
        try {
          const commits = await trpc.userFiles.getCommits.query({
            fileId,
            limit: 1000,
          });

          if (commits.length > 0) {
            zip.file("commits.json", JSON.stringify(commits, null, 2));
          }
        } catch (err) {
          console.warn("[FileExport] Error fetching commits:", err);
          // No fallar si no hay commits
        }
      }
    }

    // 7. Generar y descargar ZIP
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
 * Exporta solo la versión actual (sin historial)
 */
export async function exportCurrentVersion(
  fileId: string,
  fileName: string,
): Promise<void> {
  const file = await trpc.userFiles.get.query({ id: fileId });

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
