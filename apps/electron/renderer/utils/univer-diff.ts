/**
 * Univer Diff Utilities
 *
 * Compara dos snapshots de Univer para encontrar diferencias
 * entre versiones de Excel/Docs
 */

export interface CellChange {
  row: number;
  col: number;
  sheetId: string;
  type: "added" | "modified" | "deleted";
  oldValue?: unknown;
  newValue?: unknown;
  oldFormula?: string;
  newFormula?: string;
  oldStyle?: unknown;
  newStyle?: unknown;
}

export interface SheetChange {
  sheetId: string;
  sheetName: string;
  type: "added" | "modified" | "deleted";
  cellChanges: CellChange[];
  addedRows?: number[];
  deletedRows?: number[];
  addedCols?: number[];
  deletedCols?: number[];
}

export interface WorkbookDiff {
  addedSheets: string[];
  deletedSheets: string[];
  modifiedSheets: SheetChange[];
  totalChanges: number;
}

/**
 * Compara dos snapshots de Univer workbook
 */
export function diffWorkbooks(
  oldSnapshot: any,
  newSnapshot: any,
): WorkbookDiff {
  if (!oldSnapshot || !newSnapshot) {
    return {
      addedSheets: [],
      deletedSheets: [],
      modifiedSheets: [],
      totalChanges: 0,
    };
  }

  const oldSheets = oldSnapshot.sheets || {};
  const newSheets = newSnapshot.sheets || {};
  const oldSheetOrder = oldSnapshot.sheetOrder || [];
  const newSheetOrder = newSnapshot.sheetOrder || [];

  const addedSheets: string[] = [];
  const deletedSheets: string[] = [];
  const modifiedSheets: SheetChange[] = [];

  // Encontrar hojas agregadas
  for (const sheetId of newSheetOrder) {
    if (!oldSheets[sheetId]) {
      addedSheets.push(sheetId);
    }
  }

  // Encontrar hojas eliminadas
  for (const sheetId of oldSheetOrder) {
    if (!newSheets[sheetId]) {
      deletedSheets.push(sheetId);
    }
  }

  // Comparar hojas modificadas
  for (const sheetId of newSheetOrder) {
    const oldSheet = oldSheets[sheetId];
    const newSheet = newSheets[sheetId];

    if (!oldSheet) continue; // Ya está en addedSheets
    if (!newSheet) continue; // Ya está en deletedSheets

    const sheetDiff = diffSheet(oldSheet, newSheet, sheetId);
    if (
      sheetDiff.cellChanges.length > 0 ||
      sheetDiff.addedRows?.length ||
      sheetDiff.deletedRows?.length ||
      sheetDiff.addedCols?.length ||
      sheetDiff.deletedCols?.length
    ) {
      modifiedSheets.push(sheetDiff);
    }
  }

  const totalChanges =
    addedSheets.length +
    deletedSheets.length +
    modifiedSheets.reduce((sum, sheet) => sum + sheet.cellChanges.length, 0);

  return {
    addedSheets,
    deletedSheets,
    modifiedSheets,
    totalChanges,
  };
}

/**
 * Compara dos hojas (sheets) de Univer
 */
function diffSheet(oldSheet: any, newSheet: any, sheetId: string): SheetChange {
  const cellChanges: CellChange[] = [];
  const oldCellData = oldSheet.cellData || {};
  const newCellData = newSheet.cellData || {};

  // Obtener todas las celdas únicas (de ambas versiones)
  const allRows = new Set<number>();

  // Agregar filas de ambas versiones
  Object.keys(oldCellData).forEach((row) => allRows.add(Number(row)));
  Object.keys(newCellData).forEach((row) => allRows.add(Number(row)));

  // Comparar celdas
  for (const rowStr of Array.from(allRows).map(String)) {
    const row = Number(rowStr);
    const oldRow = oldCellData[row] || {};
    const newRow = newCellData[row] || {};

    const allCols = new Set<number>();
    Object.keys(oldRow).forEach((col) => allCols.add(Number(col)));
    Object.keys(newRow).forEach((col) => allCols.add(Number(col)));

    for (const colStr of Array.from(allCols).map(String)) {
      const col = Number(colStr);
      const oldCell = oldRow[col];
      const newCell = newRow[col];

      const change = diffCell(oldCell, newCell, row, col, sheetId);
      if (change) {
        cellChanges.push(change);
      }
    }
  }

  // Detectar filas/columnas agregadas/eliminadas (simplificado)
  const oldRowCount = oldSheet.rowCount || 0;
  const newRowCount = newSheet.rowCount || 0;
  const oldColCount = oldSheet.columnCount || 0;
  const newColCount = newSheet.columnCount || 0;

  const addedRows: number[] = [];
  const deletedRows: number[] = [];
  const addedCols: number[] = [];
  const deletedCols: number[] = [];

  // Nota: Esto es una aproximación. Para detección precisa necesitaríamos
  // analizar qué celdas tienen datos vs. solo contar filas/columnas
  if (newRowCount > oldRowCount) {
    for (let i = oldRowCount; i < newRowCount; i++) {
      if (hasDataInRow(newCellData, i)) {
        addedRows.push(i);
      }
    }
  }

  if (newColCount > oldColCount) {
    for (let i = oldColCount; i < newColCount; i++) {
      if (hasDataInCol(newCellData, i)) {
        addedCols.push(i);
      }
    }
  }

  return {
    sheetId,
    sheetName: newSheet.name || sheetId,
    type: "modified",
    cellChanges,
    addedRows: addedRows.length > 0 ? addedRows : undefined,
    deletedRows: deletedRows.length > 0 ? deletedRows : undefined,
    addedCols: addedCols.length > 0 ? addedCols : undefined,
    deletedCols: deletedCols.length > 0 ? deletedCols : undefined,
  };
}

/**
 * Compara dos celdas individuales
 */
function diffCell(
  oldCell: any,
  newCell: any,
  row: number,
  col: number,
  sheetId: string,
): CellChange | null {
  // Celda eliminada
  if (oldCell && !newCell) {
    return {
      row,
      col,
      sheetId,
      type: "deleted",
      oldValue: oldCell.v,
      oldFormula: oldCell.f,
      oldStyle: oldCell.s,
    };
  }

  // Celda agregada
  if (!oldCell && newCell) {
    return {
      row,
      col,
      sheetId,
      type: "added",
      newValue: newCell.v,
      newFormula: newCell.f,
      newStyle: newCell.s,
    };
  }

  // Celda modificada
  if (oldCell && newCell) {
    const valueChanged = !deepEqual(oldCell.v, newCell.v);
    const formulaChanged = oldCell.f !== newCell.f;
    const styleChanged = !deepEqual(oldCell.s, newCell.s);

    if (valueChanged || formulaChanged || styleChanged) {
      return {
        row,
        col,
        sheetId,
        type: "modified",
        oldValue: oldCell.v,
        newValue: newCell.v,
        oldFormula: oldCell.f,
        newFormula: newCell.f,
        oldStyle: oldCell.s,
        newStyle: newCell.s,
      };
    }
  }

  return null;
}

/**
 * Verifica si una fila tiene datos
 */
function hasDataInRow(
  cellData: Record<number, Record<number, any>>,
  row: number,
): boolean {
  const rowData = cellData[row];
  if (!rowData) return false;
  return Object.keys(rowData).length > 0;
}

/**
 * Verifica si una columna tiene datos
 */
function hasDataInCol(
  cellData: Record<number, Record<number, any>>,
  col: number,
): boolean {
  for (const rowData of Object.values(cellData)) {
    if (rowData[col]) return true;
  }
  return false;
}

/**
 * Comparación profunda de objetos
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }

    return true;
  }

  return false;
}

/**
 * Genera un resumen legible de los cambios
 */
export function generateChangeSummary(diff: WorkbookDiff): string {
  const parts: string[] = [];

  if (diff.addedSheets.length > 0) {
    parts.push(`${diff.addedSheets.length} hoja(s) agregada(s)`);
  }

  if (diff.deletedSheets.length > 0) {
    parts.push(`${diff.deletedSheets.length} hoja(s) eliminada(s)`);
  }

  if (diff.modifiedSheets.length > 0) {
    const totalCellChanges = diff.modifiedSheets.reduce(
      (sum, sheet) => sum + sheet.cellChanges.length,
      0,
    );
    if (totalCellChanges > 0) {
      parts.push(`${totalCellChanges} celda(s) modificada(s)`);
    }
  }

  if (parts.length === 0) {
    return "Sin cambios";
  }

  return parts.join(", ");
}

/**
 * Obtiene el rango de celdas afectadas por los cambios
 */
export function getAffectedRange(
  diff: WorkbookDiff,
  sheetId: string,
): {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
} | null {
  const sheet = diff.modifiedSheets.find((s) => s.sheetId === sheetId);
  if (!sheet || sheet.cellChanges.length === 0) {
    return null;
  }

  const rows = sheet.cellChanges.map((c) => c.row);
  const cols = sheet.cellChanges.map((c) => c.col);

  return {
    minRow: Math.min(...rows),
    maxRow: Math.max(...rows),
    minCol: Math.min(...cols),
    maxCol: Math.max(...cols),
  };
}
