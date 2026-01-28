/**
 * Univer Diff Utilities
 *
 * Compara dos snapshots de Univer para encontrar diferencias
 * entre versiones de Excel/Docs
 */

/**
 * Tipos de cambios detectados en una celda
 */
export interface ChangeFlags {
  valueChanged: boolean;
  formulaChanged: boolean;
  styleChanged: boolean;
}

/**
 * Propiedades de estilo de celda (Univer format)
 */
export interface CellStyle {
  bg?: { rgb?: string }; // Background color
  cl?: { rgb?: string }; // Text color
  bl?: number; // Bold (1 = bold)
  it?: number; // Italic (1 = italic)
  ul?: { s?: number }; // Underline
  st?: { s?: number }; // Strikethrough
  fs?: number; // Font size
  ff?: string; // Font family
  ht?: number; // Horizontal alignment (0=left, 1=center, 2=right)
  vt?: number; // Vertical alignment (0=top, 1=middle, 2=bottom)
  tb?: number; // Text wrap (1=wrap, 2=overflow, 3=clip)
  tr?: { a?: number }; // Text rotation
  pd?: { t?: number; r?: number; b?: number; l?: number }; // Padding
  bd?: Record<string, any>; // Borders
}

/**
 * Cambios específicos de estilo detectados
 */
export interface StyleChanges {
  background?: { old?: string; new?: string };
  textColor?: { old?: string; new?: string };
  bold?: { old: boolean; new: boolean };
  italic?: { old: boolean; new: boolean };
  underline?: { old: boolean; new: boolean };
  strikethrough?: { old: boolean; new: boolean };
  fontSize?: { old?: number; new?: number };
  fontFamily?: { old?: string; new?: string };
  horizontalAlign?: { old?: string; new?: string };
  verticalAlign?: { old?: string; new?: string };
  textWrap?: { old?: string; new?: string };
  borders?: { changed: boolean };
}

export interface CellChange {
  row: number;
  col: number;
  sheetId: string;
  type: "added" | "modified" | "deleted";
  oldValue?: unknown;
  newValue?: unknown;
  oldFormula?: string;
  newFormula?: string;
  oldStyle?: CellStyle;
  newStyle?: CellStyle;
  // Detailed change info
  changeFlags: ChangeFlags;
  styleChanges?: StyleChanges;
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
  for (const row of Object.keys(oldCellData)) {
    allRows.add(Number(row));
  }
  for (const row of Object.keys(newCellData)) {
    allRows.add(Number(row));
  }

  // Comparar celdas
  for (const rowStr of Array.from(allRows).map(String)) {
    const row = Number(rowStr);
    const oldRow = oldCellData[row] || {};
    const newRow = newCellData[row] || {};

    const allCols = new Set<number>();
    for (const col of Object.keys(oldRow)) {
      allCols.add(Number(col));
    }
    for (const col of Object.keys(newRow)) {
      allCols.add(Number(col));
    }

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
 * Compara estilos y genera cambios detallados
 */
function computeStyleChanges(
  oldStyle: CellStyle | undefined,
  newStyle: CellStyle | undefined,
): StyleChanges | undefined {
  if (!oldStyle && !newStyle) return undefined;

  const changes: StyleChanges = {};
  let hasChanges = false;

  // Background color
  const oldBg = oldStyle?.bg?.rgb;
  const newBg = newStyle?.bg?.rgb;
  if (oldBg !== newBg) {
    changes.background = { old: oldBg, new: newBg };
    hasChanges = true;
  }

  // Text color
  const oldCl = oldStyle?.cl?.rgb;
  const newCl = newStyle?.cl?.rgb;
  if (oldCl !== newCl) {
    changes.textColor = { old: oldCl, new: newCl };
    hasChanges = true;
  }

  // Bold
  const oldBold = oldStyle?.bl === 1;
  const newBold = newStyle?.bl === 1;
  if (oldBold !== newBold) {
    changes.bold = { old: oldBold, new: newBold };
    hasChanges = true;
  }

  // Italic
  const oldItalic = oldStyle?.it === 1;
  const newItalic = newStyle?.it === 1;
  if (oldItalic !== newItalic) {
    changes.italic = { old: oldItalic, new: newItalic };
    hasChanges = true;
  }

  // Underline
  const oldUl = (oldStyle?.ul?.s ?? 0) > 0;
  const newUl = (newStyle?.ul?.s ?? 0) > 0;
  if (oldUl !== newUl) {
    changes.underline = { old: oldUl, new: newUl };
    hasChanges = true;
  }

  // Strikethrough
  const oldSt = (oldStyle?.st?.s ?? 0) > 0;
  const newSt = (newStyle?.st?.s ?? 0) > 0;
  if (oldSt !== newSt) {
    changes.strikethrough = { old: oldSt, new: newSt };
    hasChanges = true;
  }

  // Font size
  if (oldStyle?.fs !== newStyle?.fs) {
    changes.fontSize = { old: oldStyle?.fs, new: newStyle?.fs };
    hasChanges = true;
  }

  // Font family
  if (oldStyle?.ff !== newStyle?.ff) {
    changes.fontFamily = { old: oldStyle?.ff, new: newStyle?.ff };
    hasChanges = true;
  }

  // Horizontal alignment
  const alignMap: Record<number, string> = {
    0: "izquierda",
    1: "centro",
    2: "derecha",
    3: "justificado",
  };
  if (oldStyle?.ht !== newStyle?.ht) {
    changes.horizontalAlign = {
      old: oldStyle?.ht !== undefined ? alignMap[oldStyle.ht] || `${oldStyle.ht}` : undefined,
      new: newStyle?.ht !== undefined ? alignMap[newStyle.ht] || `${newStyle.ht}` : undefined,
    };
    hasChanges = true;
  }

  // Vertical alignment
  const vAlignMap: Record<number, string> = {
    0: "arriba",
    1: "centro",
    2: "abajo",
  };
  if (oldStyle?.vt !== newStyle?.vt) {
    changes.verticalAlign = {
      old: oldStyle?.vt !== undefined ? vAlignMap[oldStyle.vt] || `${oldStyle.vt}` : undefined,
      new: newStyle?.vt !== undefined ? vAlignMap[newStyle.vt] || `${newStyle.vt}` : undefined,
    };
    hasChanges = true;
  }

  // Text wrap
  const wrapMap: Record<number, string> = {
    1: "ajustar",
    2: "desborde",
    3: "recortar",
  };
  if (oldStyle?.tb !== newStyle?.tb) {
    changes.textWrap = {
      old: oldStyle?.tb !== undefined ? wrapMap[oldStyle.tb] || `${oldStyle.tb}` : undefined,
      new: newStyle?.tb !== undefined ? wrapMap[newStyle.tb] || `${newStyle.tb}` : undefined,
    };
    hasChanges = true;
  }

  // Borders (simplified - just detect if changed)
  if (!deepEqual(oldStyle?.bd, newStyle?.bd)) {
    changes.borders = { changed: true };
    hasChanges = true;
  }

  return hasChanges ? changes : undefined;
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
    const styleChanges = computeStyleChanges(oldCell.s, undefined);
    return {
      row,
      col,
      sheetId,
      type: "deleted",
      oldValue: oldCell.v,
      oldFormula: oldCell.f,
      oldStyle: oldCell.s,
      changeFlags: {
        valueChanged: oldCell.v !== undefined,
        formulaChanged: oldCell.f !== undefined,
        styleChanged: styleChanges !== undefined,
      },
      styleChanges,
    };
  }

  // Celda agregada
  if (!oldCell && newCell) {
    const styleChanges = computeStyleChanges(undefined, newCell.s);
    return {
      row,
      col,
      sheetId,
      type: "added",
      newValue: newCell.v,
      newFormula: newCell.f,
      newStyle: newCell.s,
      changeFlags: {
        valueChanged: newCell.v !== undefined,
        formulaChanged: newCell.f !== undefined,
        styleChanged: styleChanges !== undefined,
      },
      styleChanges,
    };
  }

  // Celda modificada
  if (oldCell && newCell) {
    const valueChanged = !deepEqual(oldCell.v, newCell.v);
    const formulaChanged = oldCell.f !== newCell.f;
    const styleChanged = !deepEqual(oldCell.s, newCell.s);

    if (valueChanged || formulaChanged || styleChanged) {
      const styleChanges = styleChanged
        ? computeStyleChanges(oldCell.s, newCell.s)
        : undefined;

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
        changeFlags: {
          valueChanged,
          formulaChanged,
          styleChanged,
        },
        styleChanges,
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
