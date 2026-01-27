/**
 * Univer Highlight Utilities
 *
 * Funciones para resaltar cambios visualmente en Univer
 */

import { getSheetsInstance } from "../features/univer/univer-sheets-core";
import type { WorkbookDiff, CellChange } from "./univer-diff";

export interface HighlightOptions {
  addedColor?: string; // Color para celdas agregadas (default: verde claro)
  modifiedColor?: string; // Color para celdas modificadas (default: amarillo)
  deletedColor?: string; // Color para celdas eliminadas (default: rojo claro)
  fadeAfter?: number; // Milisegundos antes de desvanecer (default: 5000)
}

const DEFAULT_OPTIONS: Required<HighlightOptions> = {
  addedColor: "#90EE90", // Light green
  modifiedColor: "#FFE4B5", // Light yellow
  deletedColor: "#FFB6C1", // Light pink
  fadeAfter: 5000,
};

/**
 * Aplica highlight visual a los cambios en Univer
 */
export function highlightChanges(
  diff: WorkbookDiff,
  options: HighlightOptions = {},
): () => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const instance = getSheetsInstance();

  if (!instance) {
    console.warn("[UniverHighlight] No Univer instance available");
    return () => {};
  }

  const workbook = instance.api.getActiveWorkbook();
  if (!workbook) {
    console.warn("[UniverHighlight] No active workbook");
    return () => {};
  }

  const cleanupFunctions: Array<() => void> = [];

  // Procesar cada hoja modificada
  for (const sheetChange of diff.modifiedSheets) {
    const sheet = workbook.getSheetBySheetId(sheetChange.sheetId);
    if (!sheet) continue;

    // Agrupar cambios por tipo
    const changesByType = {
      added: sheetChange.cellChanges.filter((c) => c.type === "added"),
      modified: sheetChange.cellChanges.filter((c) => c.type === "modified"),
      deleted: sheetChange.cellChanges.filter((c) => c.type === "deleted"),
    };

    // Aplicar highlights
    for (const change of changesByType.added) {
      const cleanup = highlightCell(
        sheet,
        change.row,
        change.col,
        opts.addedColor,
      );
      if (cleanup) cleanupFunctions.push(cleanup);
    }

    for (const change of changesByType.modified) {
      const cleanup = highlightCell(
        sheet,
        change.row,
        change.col,
        opts.modifiedColor,
      );
      if (cleanup) cleanupFunctions.push(cleanup);
    }

    for (const change of changesByType.deleted) {
      const cleanup = highlightCell(
        sheet,
        change.row,
        change.col,
        opts.deletedColor,
      );
      if (cleanup) cleanupFunctions.push(cleanup);
    }
  }

  // Auto-fade después del tiempo especificado
  if (opts.fadeAfter > 0) {
    const fadeTimeout = setTimeout(() => {
      cleanupFunctions.forEach((fn) => fn());
    }, opts.fadeAfter);

    cleanupFunctions.push(() => clearTimeout(fadeTimeout));
  }

  // Retornar función de cleanup
  return () => {
    cleanupFunctions.forEach((fn) => fn());
  };
}

/**
 * Resalta una celda específica
 */
function highlightCell(
  sheet: any,
  row: number,
  col: number,
  color: string,
): (() => void) | null {
  try {
    const range = sheet.getRange(row, col, 1, 1);
    if (!range) return null;

    // Obtener estilo actual
    const currentStyle = range.getStyle?.() || {};
    const originalBg = currentStyle.bg || currentStyle.backgroundColor;

    // Aplicar nuevo color de fondo
    const newStyle = {
      ...currentStyle,
      bg: { rgb: color },
      backgroundColor: color,
    };

    if (range.setStyle) {
      range.setStyle(newStyle);
    } else if (range.setBackgroundColor) {
      range.setBackgroundColor(color);
    } else {
      // Fallback: modificar directamente el cellData
      const cellData = sheet.getCellData?.(row, col);
      if (cellData) {
        if (!cellData.s) cellData.s = {};
        cellData.s.bg = { rgb: color };
      }
    }

    // Retornar función para restaurar estilo original
    return () => {
      try {
        if (originalBg) {
          if (range.setStyle) {
            range.setStyle({ ...currentStyle, bg: originalBg });
          } else if (range.setBackgroundColor) {
            range.setBackgroundColor(originalBg);
          } else {
            const cellData = sheet.getCellData?.(row, col);
            if (cellData?.s) {
              cellData.s.bg = originalBg;
            }
          }
        } else {
          // Si no había color original, remover el estilo
          if (range.setStyle) {
            const restored = { ...currentStyle };
            delete restored.bg;
            delete restored.backgroundColor;
            range.setStyle(restored);
          } else {
            const cellData = sheet.getCellData?.(row, col);
            if (cellData?.s) {
              delete cellData.s.bg;
            }
          }
        }
      } catch (err) {
        console.warn("[UniverHighlight] Error restoring cell style:", err);
      }
    };
  } catch (err) {
    console.warn("[UniverHighlight] Error highlighting cell:", err);
    return null;
  }
}

/**
 * Limpia todos los highlights activos
 */
export function clearHighlights(cleanupFunctions: Array<() => void>): void {
  cleanupFunctions.forEach((fn) => fn());
}

/**
 * Resalta un rango de celdas
 */
export function highlightRange(
  sheet: any,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  color: string,
): (() => void) | null {
  try {
    const range = sheet.getRange(
      startRow,
      startCol,
      endRow - startRow + 1,
      endCol - startCol + 1,
    );
    if (!range) return null;

    const currentStyle = range.getStyle?.() || {};
    const originalBg = currentStyle.bg || currentStyle.backgroundColor;

    const newStyle = {
      ...currentStyle,
      bg: { rgb: color },
      backgroundColor: color,
    };

    if (range.setStyle) {
      range.setStyle(newStyle);
    } else if (range.setBackgroundColor) {
      range.setBackgroundColor(color);
    }

    return () => {
      try {
        if (originalBg) {
          if (range.setStyle) {
            range.setStyle({ ...currentStyle, bg: originalBg });
          } else if (range.setBackgroundColor) {
            range.setBackgroundColor(originalBg);
          }
        } else {
          const restored = { ...currentStyle };
          delete restored.bg;
          delete restored.backgroundColor;
          if (range.setStyle) {
            range.setStyle(restored);
          }
        }
      } catch (err) {
        console.warn("[UniverHighlight] Error restoring range style:", err);
      }
    };
  } catch (err) {
    console.warn("[UniverHighlight] Error highlighting range:", err);
    return null;
  }
}
