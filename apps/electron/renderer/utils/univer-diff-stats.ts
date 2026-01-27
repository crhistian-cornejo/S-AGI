/**
 * Univer Diff Stats Utilities
 *
 * Calcula estadísticas compactas de cambios para mostrar en version cards
 */

import { diffWorkbooks, type WorkbookDiff } from "./univer-diff";

export interface DiffStats {
  cellsAdded: number;
  cellsModified: number;
  cellsDeleted: number;
  sheetsAdded: number;
  sheetsDeleted: number;
  sheetsModified: number;
  totalChanges: number;
  summary: string; // Compact summary like "12 celdas, 2 hojas"
}

/**
 * Calcula estadísticas compactas de diferencias entre dos snapshots
 */
export function calculateDiffStats(
  oldSnapshot: any,
  newSnapshot: any,
): DiffStats {
  if (!oldSnapshot || !newSnapshot) {
    return {
      cellsAdded: 0,
      cellsModified: 0,
      cellsDeleted: 0,
      sheetsAdded: 0,
      sheetsDeleted: 0,
      sheetsModified: 0,
      totalChanges: 0,
      summary: "Sin cambios",
    };
  }

  const diff = diffWorkbooks(oldSnapshot, newSnapshot);

  const cellsAdded =
    diff.modifiedSheets.reduce(
      (sum, sheet) =>
        sum + sheet.cellChanges.filter((c) => c.type === "added").length,
      0,
    ) +
    diff.addedSheets.length * 10; // Estimate for new sheets

  const cellsModified = diff.modifiedSheets.reduce(
    (sum, sheet) =>
      sum + sheet.cellChanges.filter((c) => c.type === "modified").length,
    0,
  );

  const cellsDeleted =
    diff.modifiedSheets.reduce(
      (sum, sheet) =>
        sum + sheet.cellChanges.filter((c) => c.type === "deleted").length,
      0,
    ) +
    diff.deletedSheets.length * 10; // Estimate for deleted sheets

  const totalChanges =
    cellsAdded +
    cellsModified +
    cellsDeleted +
    diff.addedSheets.length +
    diff.deletedSheets.length;

  // Generate compact summary
  const parts: string[] = [];
  if (cellsAdded > 0)
    parts.push(`${cellsAdded} agregada${cellsAdded !== 1 ? "s" : ""}`);
  if (cellsModified > 0)
    parts.push(`${cellsModified} modificada${cellsModified !== 1 ? "s" : ""}`);
  if (cellsDeleted > 0)
    parts.push(`${cellsDeleted} eliminada${cellsDeleted !== 1 ? "s" : ""}`);
  if (diff.addedSheets.length > 0)
    parts.push(
      `${diff.addedSheets.length} hoja${diff.addedSheets.length !== 1 ? "s" : ""} nueva${diff.addedSheets.length !== 1 ? "s" : ""}`,
    );
  if (diff.deletedSheets.length > 0)
    parts.push(
      `${diff.deletedSheets.length} hoja${diff.deletedSheets.length !== 1 ? "s" : ""} eliminada${diff.deletedSheets.length !== 1 ? "s" : ""}`,
    );

  const summary =
    parts.length > 0
      ? parts.slice(0, 3).join(", ") + (parts.length > 3 ? "..." : "")
      : "Sin cambios";

  return {
    cellsAdded,
    cellsModified,
    cellsDeleted,
    sheetsAdded: diff.addedSheets.length,
    sheetsDeleted: diff.deletedSheets.length,
    sheetsModified: diff.modifiedSheets.length,
    totalChanges,
    summary,
  };
}

/**
 * Compara dos snapshots para determinar si hay cambios reales
 */
export function hasRealChanges(oldSnapshot: any, newSnapshot: any): boolean {
  if (!oldSnapshot || !newSnapshot) return false;

  const stats = calculateDiffStats(oldSnapshot, newSnapshot);
  return stats.totalChanges > 0;
}
