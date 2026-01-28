/**
 * Excel Import/Export utilities using ExcelJS (100% free and open source)
 *
 * ExcelJS provides complete Excel compatibility including:
 * - Full cell styles (font, fill, borders, alignment) with 100% fidelity
 * - Images and drawings (PNG, JPEG, GIF)
 * - Charts (basic support)
 * - Conditional formatting
 * - Data validation
 * - Formulas (preserved as-is)
 * - Merged cells
 * - Column widths and row heights
 * - Hyperlinks
 * - Comments
 *
 * 100% FREE - MIT License
 */

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// ============================================
// UNIVER DATA TYPES
// ============================================

export interface UniverWorkbookData {
  id: string;
  name: string;
  sheetOrder: string[];
  sheets: Record<string, UniverSheetData>;
  styles?: Record<string, UniverCellStyle>;
  resources?: Array<{
    name: string;
    data: string;
  }>;
  [key: string]: unknown;
}

interface UniverSheetData {
  id: string;
  name: string;
  cellData: Record<string, Record<string, UniverCell>>;
  rowCount?: number;
  columnCount?: number;
  defaultColumnWidth?: number;
  defaultRowHeight?: number;
  columnData?: Record<string, { w: number }>;
  rowData?: Record<string, { h: number }>;
  tabColor?: string;
  mergeData?: Array<{
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  }>;
  [key: string]: unknown;
}

interface UniverCell {
  v: string | number | boolean;
  s?: string | UniverCellStyle;
  f?: string; // formula
  [key: string]: unknown;
}

interface UniverCellStyle {
  ff?: string; // font family
  fs?: number; // font size
  bl?: number; // bold (1 = bold)
  it?: number; // italic (1 = italic)
  ul?: { s: number } | number; // underline
  st?: { s: number } | number; // strikethrough
  cl?: { r: number; g: number; b: number; rgb?: string }; // color
  bg?: { r: number; g: number; b: number; rgb?: string }; // background color
  bd?: {
    t?: { s: number; cl: { r: number; g: number; b: number; rgb?: string } };
    b?: { s: number; cl: { r: number; g: number; b: number; rgb?: string } };
    l?: { s: number; cl: { r: number; g: number; b: number; rgb?: string } };
    r?: { s: number; cl: { r: number; g: number; b: number; rgb?: string } };
  }; // borders
  ht?: number; // horizontal alignment (1=left, 2=center, 3=right)
  vt?: number; // vertical alignment (1=top, 2=middle, 3=bottom)
  tb?: number; // text wrap (1=overflow, 2=wrap, 3=clip)
  tr?: number; // text rotation
  pd?: { t?: number; b?: number; l?: number; r?: number }; // padding
  n?: { pattern?: string }; // number format
  [key: string]: unknown;
}

// ============================================
// FONT DETECTION AND VALIDATION
// ============================================

/**
 * Extract all unique fonts used in Univer workbook data
 */
function extractFontsFromUniverData(
  univerData: UniverWorkbookData,
): Set<string> {
  const fonts = new Set<string>();

  if (!univerData.sheets) return fonts;

  for (const sheet of Object.values(univerData.sheets)) {
    if (sheet.cellData) {
      for (const row of Object.values(sheet.cellData)) {
        for (const cell of Object.values(row)) {
          if (cell.s) {
            const style =
              typeof cell.s === "string"
                ? univerData.styles?.[cell.s]
                : (cell.s as UniverCellStyle);
            if (style?.ff) {
              fonts.add(style.ff.trim());
            }
          }
        }
      }
    }
  }

  return fonts;
}

/**
 * Check if a font is available on the system
 */
async function isFontAvailable(fontFamily: string): Promise<boolean> {
  const normalized = fontFamily.replace(/['"]/g, "").split(",")[0].trim();

  if (!normalized) return false;

  const commonSystemFonts = [
    "arial",
    "helvetica",
    "times new roman",
    "times",
    "courier new",
    "courier",
    "verdana",
    "georgia",
    "palatino",
    "garamond",
    "bookman",
    "comic sans ms",
    "trebuchet ms",
    "arial black",
    "impact",
    "tahoma",
    "lucida console",
    "lucida sans unicode",
    "ms sans serif",
    "ms serif",
    "calibri",
    "cambria",
    "candara",
    "consolas",
    "constantia",
    "corbel",
    "segoe ui",
  ];

  const normalizedLower = normalized.toLowerCase();
  if (
    commonSystemFonts.some(
      (font) =>
        normalizedLower === font ||
        normalizedLower.includes(font) ||
        font.includes(normalizedLower),
    )
  ) {
    return true;
  }

  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return false;

      context.font = "12px monospace";
      const baselineWidth = context.measureText("mmmmmmmmmmlli").width;

      context.font = `12px "${normalized}", monospace`;
      const testWidth = context.measureText("mmmmmmmmmmlli").width;

      return Math.abs(baselineWidth - testWidth) > 0.1;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Check which fonts from a set are not available
 */
async function findMissingFonts(fonts: Set<string>): Promise<string[]> {
  const missing: string[] = [];

  const checks = Array.from(fonts).map(async (font) => {
    const available = await isFontAvailable(font);
    if (!available) {
      missing.push(font);
    }
  });

  await Promise.all(checks);

  return missing.sort();
}

/**
 * Replace missing fonts with Arial in Univer workbook data
 */
function replaceMissingFonts(
  univerData: UniverWorkbookData,
  missingFonts: string[],
): void {
  if (missingFonts.length === 0 || !univerData.sheets) return;

  const missingSet = new Set(missingFonts.map((f) => f.toLowerCase()));

  for (const sheet of Object.values(univerData.sheets)) {
    if (sheet.cellData) {
      for (const row of Object.values(sheet.cellData)) {
        for (const cell of Object.values(row)) {
          if (cell.s) {
            const style =
              typeof cell.s === "string"
                ? univerData.styles?.[cell.s]
                : (cell.s as UniverCellStyle);

            if (style?.ff && missingSet.has(style.ff.toLowerCase())) {
              if (typeof cell.s === "string") {
                if (univerData.styles?.[cell.s]) {
                  univerData.styles[cell.s].ff = "Arial";
                }
              } else {
                (cell.s as UniverCellStyle).ff = "Arial";
              }
            }
          }
        }
      }
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Helper to extract color from Univer color object and convert to ExcelJS ARGB format
 */
function extractColorToARGB(
  color: { r: number; g: number; b: number; rgb?: string } | undefined,
): string | undefined {
  if (!color) return undefined;

  // If rgb string exists (e.g., "#FF5500"), convert to ARGB
  if (color.rgb) {
    const hex = color.rgb.replace("#", "");
    return "FF" + hex; // Add full opacity
  }

  // Convert from r,g,b values
  if (
    typeof color.r === "number" &&
    typeof color.g === "number" &&
    typeof color.b === "number"
  ) {
    return rgbToARGB(color.r, color.g, color.b);
  }

  return undefined;
}

function rgbToARGB(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return "FF" + toHex(r) + toHex(g) + toHex(b);
}

function argbToRgb(argb: string): { r: number; g: number; b: number } {
  // ARGB format: AARRGGBB (8 chars) or RRGGBB (6 chars)
  const hex = argb.length === 8 ? argb.substring(2) : argb;
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

function argbToHex(argb: string): string {
  const hex = argb.length === 8 ? argb.substring(2) : argb;
  return `#${hex.toLowerCase()}`;
}

function normalizeHexToARGB(hex: string): string | undefined {
  const cleaned = hex.trim().replace("#", "");
  if (cleaned.length === 6) {
    return `FF${cleaned.toUpperCase()}`;
  }
  if (cleaned.length === 8) {
    return cleaned.toUpperCase();
  }
  return undefined;
}

function getSheetTabARGB(tabColor: unknown): string | undefined {
  if (!tabColor) return undefined;
  if (typeof tabColor === "string") {
    return normalizeHexToARGB(tabColor);
  }
  if (
    typeof tabColor === "object" &&
    tabColor !== null &&
    "r" in tabColor &&
    "g" in tabColor &&
    "b" in tabColor
  ) {
    return extractColorToARGB(
      tabColor as { r: number; g: number; b: number; rgb?: string },
    );
  }
  return undefined;
}

const EMU_PER_PIXEL = 9525;

function toEmu(value: number | undefined): number | undefined {
  if (!value || Number.isNaN(value)) return undefined;
  return Math.round(value * EMU_PER_PIXEL);
}

function fromEmu(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return 0;
  return Math.round(value / EMU_PER_PIXEL);
}

function getSheetDrawings(
  drawingsData: unknown,
  sheetId: string,
): Record<string, Record<string, unknown>> {
  if (!drawingsData || typeof drawingsData !== "object") return {};

  const direct = (drawingsData as Record<string, unknown>)[sheetId];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, Record<string, unknown>>;
  }

  const drawings = (drawingsData as { drawings?: unknown }).drawings;
  if (drawings && typeof drawings === "object" && !Array.isArray(drawings)) {
    const fromDrawings = (drawings as Record<string, unknown>)[sheetId];
    if (
      fromDrawings &&
      typeof fromDrawings === "object" &&
      !Array.isArray(fromDrawings)
    ) {
      return fromDrawings as Record<string, Record<string, unknown>>;
    }
  }

  if (Array.isArray(drawingsData)) {
    const map: Record<string, Record<string, unknown>> = {};
    drawingsData.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const record = item as Record<string, unknown>;
      const subUnitId = record.subUnitId ?? record.sheetId;
      if (subUnitId !== sheetId) return;
      const drawingId = (record.drawingId as string) || `drawing_${index}`;
      map[drawingId] = record;
    });
    return map;
  }

  return {};
}

function extractImageSource(draw: Record<string, unknown>): string | undefined {
  const directSource = draw.source;
  if (typeof directSource === "string") return directSource;
  if (directSource && typeof directSource === "object") {
    const nested = directSource as Record<string, unknown>;
    if (typeof nested.source === "string") return nested.source;
    if (typeof nested.data === "string") return nested.data;
    if (typeof nested.dataUrl === "string") return nested.dataUrl;
  }
  if (typeof draw.src === "string") return draw.src;
  if (typeof draw.dataUrl === "string") return draw.dataUrl;
  return undefined;
}

function getNestedTabColor(univerSheet: Record<string, unknown>): unknown {
  const direct = univerSheet.tabColor ?? univerSheet.sheetTabColor;
  if (direct) return direct;
  const config = univerSheet.config;
  if (config && typeof config === "object") {
    const fromConfig = (config as Record<string, unknown>).tabColor;
    if (fromConfig) return fromConfig;
  }
  const sheetInfo = univerSheet.sheetInfo;
  if (sheetInfo && typeof sheetInfo === "object") {
    const fromInfo = (sheetInfo as Record<string, unknown>).tabColor;
    if (fromInfo) return fromInfo;
  }
  return undefined;
}

function getExtensionFromDataUrl(dataUrl: string): "png" | "jpeg" | "gif" {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,/i);
  const mime = match?.[1]?.toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpeg";
  if (mime === "image/gif") return "gif";
  return "png";
}

function getExtensionFromBase64(base64: string): "png" | "jpeg" | "gif" {
  const head = base64.slice(0, 16);
  if (head.startsWith("/9j/")) return "jpeg";
  if (head.startsWith("R0lGOD")) return "gif";
  return "png";
}

async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const mime = res.headers.get("content-type") || "image/png";
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
    return undefined;
  }
}

async function resolveImageDataUrl(
  source: string,
): Promise<string | undefined> {
  const trimmed = source.trim();
  if (!trimmed) return undefined;

  if (/^data:image\/[^;]+;base64,/i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed)) {
    return await fetchImageAsDataUrl(trimmed);
  }

  const extension = getExtensionFromBase64(trimmed);
  const mime =
    extension === "jpeg"
      ? "image/jpeg"
      : extension === "gif"
        ? "image/gif"
        : "image/png";
  return `data:${mime};base64,${trimmed}`;
}

// ============================================
// CONVERSION: UNIVER -> EXCELJS
// ============================================

/**
 * Convert Univer workbook to ExcelJS workbook
 */
async function convertUniverToExcelJS(
  univerData: UniverWorkbookData,
): Promise<ExcelJS.Workbook> {
  console.log("[ExcelJSExchange] Converting Univer data:", {
    hasStyles: !!univerData.styles,
    stylesCount: univerData.styles ? Object.keys(univerData.styles).length : 0,
    resources: univerData.resources?.map((r) => r.name),
    sheetCount: univerData.sheetOrder?.length || 0,
  });

  // DEBUG: Log full structure to see what we're getting
  console.log("[ExcelJSExchange] Full univerData structure:", {
    keys: Object.keys(univerData),
    hasResources: !!univerData.resources,
    resourcesLength: univerData.resources?.length,
    resourcesDetail: univerData.resources?.map((r) => ({
      name: r.name,
      dataLength: r.data?.length,
    })),
  });

  // DEBUG: Log drawing resource data specifically
  const drawingRes = univerData.resources?.find(
    (r) => r.name === "SHEET_DRAWING_PLUGIN" || r.name?.includes("drawing"),
  );
  if (drawingRes) {
    console.log(
      "[ExcelJSExchange] Raw drawing resource data (first 500 chars):",
      drawingRes.data?.substring(0, 500),
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "S-AGI";
  workbook.created = new Date();

  const sheetOrder =
    univerData.sheetOrder || Object.keys(univerData.sheets || {});

  for (const sheetId of sheetOrder) {
    const univerSheet = univerData.sheets?.[sheetId];
    if (!univerSheet) continue;

    const sheetName = univerSheet.name || sheetId;
    const worksheet = workbook.addWorksheet(sheetName);

    const tabArgb = getSheetTabARGB(
      getNestedTabColor(univerSheet as unknown as Record<string, unknown>),
    );
    if (tabArgb) {
      worksheet.properties.tabColor = { argb: tabArgb };
    }

    // Set default column width and row height if specified
    if (univerSheet.defaultColumnWidth) {
      worksheet.properties.defaultColWidth =
        univerSheet.defaultColumnWidth / 7.5; // Convert pixels to Excel units
    }
    if (univerSheet.defaultRowHeight) {
      worksheet.properties.defaultRowHeight = univerSheet.defaultRowHeight;
    }

    // Convert cells
    if (univerSheet.cellData) {
      for (const [rowKey, row] of Object.entries(univerSheet.cellData)) {
        const rowNum = parseInt(rowKey, 10);
        if (isNaN(rowNum)) continue;

        for (const [colKey, cell] of Object.entries(row)) {
          const colNum = parseInt(colKey, 10);
          if (isNaN(colNum)) continue;

          // ExcelJS uses 1-based indexing, Univer uses 0-based
          const excelRow = rowNum + 1;
          const excelCol = colNum + 1;

          const excelCell = worksheet.getCell(excelRow, excelCol);

          // Set value or formula
          if (cell.f) {
            // Formula - ensure it starts with =
            const formula = cell.f.startsWith("=")
              ? cell.f.substring(1)
              : cell.f;
            excelCell.value = { formula };
          } else {
            excelCell.value = cell.v ?? "";
          }

          // Apply style
          const style =
            typeof cell.s === "string"
              ? univerData.styles?.[cell.s]
              : (cell.s as UniverCellStyle | undefined);

          if (style) {
            applyStyleToExcelCell(excelCell, style);
          }
        }
      }
    }

    // Set column widths
    if (univerSheet.columnData) {
      for (const [colKey, colData] of Object.entries(univerSheet.columnData)) {
        const colNum = parseInt(colKey, 10);
        if (!isNaN(colNum) && colData.w) {
          const excelCol = colNum + 1;
          const column = worksheet.getColumn(excelCol);
          column.width = colData.w / 7.5; // Convert pixels to Excel units
        }
      }
    }

    // Set row heights
    if (univerSheet.rowData) {
      for (const [rowKey, rowData] of Object.entries(univerSheet.rowData)) {
        const rowNum = parseInt(rowKey, 10);
        if (!isNaN(rowNum) && rowData.h) {
          const excelRow = rowNum + 1;
          const row = worksheet.getRow(excelRow);
          row.height = rowData.h;
        }
      }
    }

    // Merged cells
    if (univerSheet.mergeData) {
      for (const merge of univerSheet.mergeData) {
        // Convert to 1-based indexing
        const startRow = merge.startRow + 1;
        const startCol = merge.startColumn + 1;
        const endRow = merge.endRow + 1;
        const endCol = merge.endColumn + 1;

        worksheet.mergeCells(startRow, startCol, endRow, endCol);
      }
    }

    // Handle images/drawings from resources
    if (univerData.resources) {
      console.log(
        `[ExcelJSExchange] Checking for images in sheet ${sheetId}:`,
        {
          resourcesCount: univerData.resources.length,
          resourceNames: univerData.resources.map((r) => r.name),
        },
      );

      const drawingResource = univerData.resources.find(
        (r) => r.name === "SHEET_DRAWING_PLUGIN" || r.name?.includes("drawing"),
      );

      console.log(
        "[ExcelJSExchange] Drawing resource found:",
        !!drawingResource,
      );

      if (drawingResource?.data) {
        try {
          const drawingsData = JSON.parse(drawingResource.data);
          console.log("[ExcelJSExchange] Drawings data:", {
            sheets: Object.keys(drawingsData),
            hasCurrentSheet: !!drawingsData[sheetId],
            fullData: drawingsData, // Ver estructura completa
          });

          const sheetDrawings = getSheetDrawings(drawingsData, sheetId);

          if (sheetDrawings && typeof sheetDrawings === "object") {
            for (const [drawingId, drawing] of Object.entries(sheetDrawings)) {
              const draw = drawing as Record<string, unknown>;
              const source = extractImageSource(draw);
              const transform = draw.sheetTransform as
                | {
                    from?: {
                      column?: number;
                      row?: number;
                      columnOffset?: number;
                      rowOffset?: number;
                    };
                    to?: {
                      column?: number;
                      row?: number;
                      columnOffset?: number;
                      rowOffset?: number;
                    };
                  }
                | undefined;

              if (!source || !transform?.from) {
                continue;
              }

              try {
                const dataUrl = await resolveImageDataUrl(source);
                if (!dataUrl) continue;

                const extension = getExtensionFromDataUrl(dataUrl);

                // Add image to workbook
                const imageId = workbook.addImage({
                  base64: dataUrl,
                  extension,
                });

                // Convert Univer coordinates (0-based) to ExcelJS (0-based for anchors)
                const fromRow0 = transform.from.row ?? 0;
                const fromCol0 = transform.from.column ?? 0;
                const toRow0 = transform.to?.row ?? fromRow0 + 1;
                const toCol0 = transform.to?.column ?? fromCol0 + 1;

                const tl: any = { col: fromCol0, row: fromRow0 };
                const br: any = { col: toCol0, row: toRow0 };

                const fromColOff = toEmu(transform.from.columnOffset);
                const fromRowOff = toEmu(transform.from.rowOffset);
                const toColOff = toEmu(transform.to?.columnOffset);
                const toRowOff = toEmu(transform.to?.rowOffset);

                if (fromColOff || fromRowOff) {
                  tl.nativeCol = Math.floor(fromCol0);
                  tl.nativeRow = Math.floor(fromRow0);
                  tl.nativeColOff = fromColOff ?? 0;
                  tl.nativeRowOff = fromRowOff ?? 0;
                }
                if (toColOff || toRowOff) {
                  br.nativeCol = Math.floor(toCol0);
                  br.nativeRow = Math.floor(toRow0);
                  br.nativeColOff = toColOff ?? 0;
                  br.nativeRowOff = toRowOff ?? 0;
                }

                const anchorType = String(draw.anchorType ?? "0");
                const editAs =
                  anchorType === "1"
                    ? "twoCell"
                    : anchorType === "2"
                      ? "absolute"
                      : "oneCell";

                // Add image to worksheet
                worksheet.addImage(imageId, {
                  tl,
                  br,
                  editAs,
                });

                console.log(
                  `[ExcelJSExchange] Added image ${drawingId} at ${fromRow0},${fromCol0}`,
                );
              } catch (error) {
                console.warn(
                  `[ExcelJSExchange] Failed to add image ${drawingId}:`,
                  error,
                );
              }
            }
          }
        } catch (e) {
          console.warn("[ExcelJSExchange] Failed to parse drawings:", e);
        }
      }
    }
  }

  return workbook;
}

/**
 * Apply Univer style to ExcelJS cell
 */
function applyStyleToExcelCell(
  cell: ExcelJS.Cell,
  style: UniverCellStyle,
): void {
  // Font properties
  const font: Partial<ExcelJS.Font> = {};

  if (style.ff) {
    font.name = style.ff.split(",")[0].trim().replace(/['"]/g, "");
  }
  if (style.fs) {
    font.size = style.fs;
  }
  if (style.bl === 1) {
    font.bold = true;
  }
  if (style.it === 1) {
    font.italic = true;
  }
  if (typeof style.ul === "number" ? style.ul === 1 : !!style.ul?.s) {
    font.underline = true;
  }
  if (typeof style.st === "number" ? style.st === 1 : !!style.st?.s) {
    font.strike = true;
  }
  if (style.cl) {
    const argb = extractColorToARGB(style.cl);
    if (argb) {
      font.color = { argb };
    }
  }

  if (Object.keys(font).length > 0) {
    cell.font = font;
  }

  // Background color (fill)
  if (style.bg) {
    const argb = extractColorToARGB(style.bg);
    if (argb) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb },
      };
    }
  }

  // Alignment
  const alignment: Partial<ExcelJS.Alignment> = {};

  // Horizontal alignment: Univer uses 1=left, 2=center, 3=right
  const hAlignMap: Record<number, ExcelJS.Alignment["horizontal"]> = {
    1: "left",
    2: "center",
    3: "right",
  };
  if (style.ht !== undefined && hAlignMap[style.ht]) {
    alignment.horizontal = hAlignMap[style.ht];
  }

  // Vertical alignment: Univer uses 1=top, 2=middle, 3=bottom
  const vAlignMap: Record<number, ExcelJS.Alignment["vertical"]> = {
    1: "top",
    2: "middle",
    3: "bottom",
  };
  if (style.vt !== undefined && vAlignMap[style.vt]) {
    alignment.vertical = vAlignMap[style.vt];
  }

  // Text wrap: 2 = wrap in Univer
  if (style.tb === 2) {
    alignment.wrapText = true;
  }

  // Text rotation
  if (style.tr !== undefined) {
    alignment.textRotation = style.tr;
  }

  if (Object.keys(alignment).length > 0) {
    cell.alignment = alignment;
  }

  // Borders
  if (style.bd) {
    const borders: Partial<ExcelJS.Borders> = {};

    const borderStyleMap: Record<number, ExcelJS.BorderStyle> = {
      1: "thin",
      2: "hair",
      3: "dotted",
      4: "dashed",
      5: "dashDot",
      6: "dashDotDot",
      7: "double",
      8: "medium",
      9: "mediumDashed",
      10: "mediumDashDot",
      11: "mediumDashDotDot",
      12: "slantDashDot",
      13: "thick",
    };

    if (style.bd.t?.cl) {
      const argb = extractColorToARGB(style.bd.t.cl);
      const borderStyle = borderStyleMap[style.bd.t.s] || "thin";
      borders.top = { style: borderStyle, color: argb ? { argb } : undefined };
    }
    if (style.bd.b?.cl) {
      const argb = extractColorToARGB(style.bd.b.cl);
      const borderStyle = borderStyleMap[style.bd.b.s] || "thin";
      borders.bottom = {
        style: borderStyle,
        color: argb ? { argb } : undefined,
      };
    }
    if (style.bd.l?.cl) {
      const argb = extractColorToARGB(style.bd.l.cl);
      const borderStyle = borderStyleMap[style.bd.l.s] || "thin";
      borders.left = { style: borderStyle, color: argb ? { argb } : undefined };
    }
    if (style.bd.r?.cl) {
      const argb = extractColorToARGB(style.bd.r.cl);
      const borderStyle = borderStyleMap[style.bd.r.s] || "thin";
      borders.right = {
        style: borderStyle,
        color: argb ? { argb } : undefined,
      };
    }

    if (Object.keys(borders).length > 0) {
      cell.border = borders;
    }
  }

  // Number format
  if (style.n?.pattern) {
    cell.numFmt = style.n.pattern;
  }
}

// ============================================
// CONVERSION: EXCELJS -> UNIVER
// ============================================

/**
 * Convert ExcelJS workbook to Univer workbook
 */
function convertExcelJSToUniver(
  workbook: ExcelJS.Workbook,
  fileName: string,
): UniverWorkbookData {
  const univerData: UniverWorkbookData = {
    id: `workbook-${Date.now()}`,
    name: fileName.replace(/\.xlsx?$/i, ""),
    sheetOrder: [],
    sheets: {},
    styles: {},
  };

  let styleIndex = 0;
  const styleMap = new Map<string, string>();

  workbook.eachSheet((worksheet) => {
    const sheetIndex = workbook.worksheets.indexOf(worksheet);
    const sheetId = `sheet_${sheetIndex - 1}`;
    const sheetName = worksheet.name;

    univerData.sheetOrder.push(sheetId);

    const sheetData: UniverSheetData = {
      id: sheetId,
      name: sheetName,
      cellData: {},
      columnData: {},
      rowData: {},
    };

    const sheetTabArgb = worksheet.properties?.tabColor?.argb;
    if (sheetTabArgb) {
      sheetData.tabColor = argbToHex(sheetTabArgb);
    }

    // Track max row and column
    let maxRow = 0;
    let maxCol = 0;

    // Convert cells
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        // ExcelJS uses 1-based, Univer uses 0-based
        const univerRow = rowNumber - 1;
        const univerCol = colNumber - 1;

        maxRow = Math.max(maxRow, univerRow);
        maxCol = Math.max(maxCol, univerCol);

        const rowKey = String(univerRow);
        const colKey = String(univerCol);

        if (!sheetData.cellData[rowKey]) {
          sheetData.cellData[rowKey] = {};
        }

        const univerCell: UniverCell = {
          v: "",
        };

        // Get value
        if (cell.type === ExcelJS.ValueType.Formula) {
          const formulaValue = cell.value as ExcelJS.CellFormulaValue;
          univerCell.f = formulaValue.formula;
          const result = formulaValue.result;
          univerCell.v =
            typeof result === "string" ||
            typeof result === "number" ||
            typeof result === "boolean"
              ? result
              : String(result ?? "");
        } else {
          const cellValue = cell.value;
          univerCell.v =
            typeof cellValue === "string" ||
            typeof cellValue === "number" ||
            typeof cellValue === "boolean"
              ? cellValue
              : String(cellValue ?? "");
        }

        // Convert style
        if (cell.style) {
          const univerStyle = convertExcelJSStyleToUniver(cell.style);
          const styleKey = JSON.stringify(univerStyle);

          if (!styleMap.has(styleKey)) {
            const styleId = `style_${styleIndex++}`;
            styleMap.set(styleKey, styleId);
            univerData.styles![styleId] = univerStyle;
          }

          univerCell.s = styleMap.get(styleKey)!;
        }

        sheetData.cellData[rowKey][colKey] = univerCell;
      });

      // Row height
      if (row.height && row.height !== worksheet.properties.defaultRowHeight) {
        const univerRow = rowNumber - 1;
        sheetData.rowData![String(univerRow)] = { h: row.height };
      }
    });

    sheetData.rowCount = maxRow + 1;
    sheetData.columnCount = maxCol + 1;

    // Column widths
    worksheet.columns.forEach((column, colIndex) => {
      if (
        column.width &&
        column.width !== worksheet.properties.defaultColWidth
      ) {
        const univerCol = colIndex;
        sheetData.columnData![String(univerCol)] = { w: column.width * 7.5 }; // Convert Excel units to pixels
      }
    });

    // Merged cells
    const merges = Object.keys((worksheet as any)._merges || {});
    if (merges.length > 0) {
      sheetData.mergeData = [];
      merges.forEach((mergeRef) => {
        const merge = worksheet.getCell(mergeRef).master;
        if (merge) {
          // Parse merge range (e.g., "A1:B2")
          const range = mergeRef.split(":");
          if (range.length === 2) {
            const startCell = worksheet.getCell(range[0]);
            const endCell = worksheet.getCell(range[1]);

            const startRow =
              typeof startCell.row === "number" ? startCell.row : 1;
            const endRow = typeof endCell.row === "number" ? endCell.row : 1;
            const startCol =
              typeof startCell.col === "number" ? startCell.col : 1;
            const endCol = typeof endCell.col === "number" ? endCell.col : 1;

            sheetData.mergeData!.push({
              startRow: startRow - 1,
              endRow: endRow - 1,
              startColumn: startCol - 1,
              endColumn: endCol - 1,
            });
          }
        }
      });
    }

    // Handle images
    const images = (worksheet as any).getImages?.() || [];
    if (images.length > 0) {
      if (!univerData.resources) {
        univerData.resources = [];
      }

      const drawings: Record<string, Record<string, unknown>> = {};
      drawings[sheetId] = {};

      images.forEach((image: any, index: number) => {
        const drawingId = `drawing_${index}`;
        const imageModel = workbook.getImage(image.imageId);

        if (imageModel && imageModel.buffer) {
          // Convert buffer to base64
          const base64 = Buffer.from(imageModel.buffer).toString("base64");
          const extension: string = imageModel.extension || "png";
          const mimeType =
            extension === "jpeg" || extension === "jpg"
              ? "image/jpeg"
              : `image/${extension}`;
          const dataUrl = `data:${mimeType};base64,${base64}`;

          // Get image position
          const range = image.range || {};
          const tl = range.tl || { col: 0, row: 0 };
          const br = range.br || { col: tl.col + 1, row: tl.row + 1 };
          const editAs: string = range.editAs || "oneCell";
          const anchorType =
            editAs === "twoCell" ? "1" : editAs === "absolute" ? "2" : "0";

          drawings[sheetId][drawingId] = {
            drawingId,
            drawingType: 1,
            source: dataUrl,
            anchorType,
            sheetTransform: {
              from: {
                column: tl.col,
                row: tl.row,
                columnOffset: fromEmu(tl.nativeColOff),
                rowOffset: fromEmu(tl.nativeRowOff),
              },
              to: {
                column: br.col,
                row: br.row,
                columnOffset: fromEmu(br.nativeColOff),
                rowOffset: fromEmu(br.nativeRowOff),
              },
            },
          };
        }
      });

      if (Object.keys(drawings[sheetId]).length > 0) {
        const drawingResource = univerData.resources.find(
          (r) => r.name === "SHEET_DRAWING_PLUGIN",
        );

        if (drawingResource) {
          const existingDrawings = JSON.parse(drawingResource.data || "{}");
          Object.assign(existingDrawings, drawings);
          drawingResource.data = JSON.stringify(existingDrawings);
        } else {
          univerData.resources.push({
            name: "SHEET_DRAWING_PLUGIN",
            data: JSON.stringify(drawings),
          });
        }
      }
    }

    univerData.sheets[sheetId] = sheetData;
  });

  return univerData;
}

/**
 * Convert ExcelJS style to Univer cell style
 */
function convertExcelJSStyleToUniver(
  style: Partial<ExcelJS.Style>,
): UniverCellStyle {
  const univerStyle: UniverCellStyle = {};

  // Font
  if (style.font) {
    if (style.font.name) {
      univerStyle.ff = style.font.name;
    }
    if (style.font.size) {
      univerStyle.fs = style.font.size;
    }
    if (style.font.bold) {
      univerStyle.bl = 1;
    }
    if (style.font.italic) {
      univerStyle.it = 1;
    }
    if (style.font.underline) {
      univerStyle.ul = 1;
    }
    if (style.font.strike) {
      univerStyle.st = 1;
    }
    if (
      style.font.color &&
      typeof style.font.color === "object" &&
      "argb" in style.font.color &&
      style.font.color.argb
    ) {
      const rgb = argbToRgb(style.font.color.argb);
      univerStyle.cl = rgb;
    }
  }

  // Fill (background color)
  if (style.fill && style.fill.type === "pattern") {
    const patternFill = style.fill as ExcelJS.FillPattern;
    if (
      patternFill.fgColor &&
      typeof patternFill.fgColor === "object" &&
      "argb" in patternFill.fgColor &&
      patternFill.fgColor.argb
    ) {
      const rgb = argbToRgb(patternFill.fgColor.argb);
      univerStyle.bg = rgb;
    }
  }

  // Alignment
  if (style.alignment) {
    // Horizontal
    const hAlignMap: Record<string, number> = {
      left: 1,
      center: 2,
      right: 3,
    };
    if (style.alignment.horizontal && style.alignment.horizontal in hAlignMap) {
      univerStyle.ht = hAlignMap[style.alignment.horizontal];
    }

    // Vertical
    const vAlignMap: Record<string, number> = {
      top: 1,
      middle: 2,
      bottom: 3,
    };
    if (style.alignment.vertical && style.alignment.vertical in vAlignMap) {
      univerStyle.vt = vAlignMap[style.alignment.vertical];
    }

    // Text wrap
    if (style.alignment.wrapText) {
      univerStyle.tb = 2;
    }

    // Text rotation
    if (
      style.alignment.textRotation !== undefined &&
      typeof style.alignment.textRotation === "number"
    ) {
      univerStyle.tr = style.alignment.textRotation;
    }
  }

  // Borders
  if (style.border) {
    univerStyle.bd = {};

    const borderStyleMap: Record<string, number> = {
      thin: 1,
      hair: 2,
      dotted: 3,
      dashed: 4,
      dashDot: 5,
      dashDotDot: 6,
      double: 7,
      medium: 8,
      mediumDashed: 9,
      mediumDashDot: 10,
      mediumDashDotDot: 11,
      slantDashDot: 12,
      thick: 13,
    };

    if (style.border.top && style.border.top.style) {
      const borderStyle = borderStyleMap[style.border.top.style] || 1;
      const color =
        style.border.top.color &&
        typeof style.border.top.color === "object" &&
        "argb" in style.border.top.color &&
        style.border.top.color.argb
          ? argbToRgb(style.border.top.color.argb)
          : { r: 0, g: 0, b: 0 };
      univerStyle.bd.t = { s: borderStyle, cl: color };
    }
    if (style.border.bottom && style.border.bottom.style) {
      const borderStyle = borderStyleMap[style.border.bottom.style] || 1;
      const color =
        style.border.bottom.color &&
        typeof style.border.bottom.color === "object" &&
        "argb" in style.border.bottom.color &&
        style.border.bottom.color.argb
          ? argbToRgb(style.border.bottom.color.argb)
          : { r: 0, g: 0, b: 0 };
      univerStyle.bd.b = { s: borderStyle, cl: color };
    }
    if (style.border.left && style.border.left.style) {
      const borderStyle = borderStyleMap[style.border.left.style] || 1;
      const color =
        style.border.left.color &&
        typeof style.border.left.color === "object" &&
        "argb" in style.border.left.color &&
        style.border.left.color.argb
          ? argbToRgb(style.border.left.color.argb)
          : { r: 0, g: 0, b: 0 };
      univerStyle.bd.l = { s: borderStyle, cl: color };
    }
    if (style.border.right && style.border.right.style) {
      const borderStyle = borderStyleMap[style.border.right.style] || 1;
      const color =
        style.border.right.color &&
        typeof style.border.right.color === "object" &&
        "argb" in style.border.right.color &&
        style.border.right.color.argb
          ? argbToRgb(style.border.right.color.argb)
          : { r: 0, g: 0, b: 0 };
      univerStyle.bd.r = { s: borderStyle, cl: color };
    }
  }

  // Number format
  if (style.numFmt) {
    univerStyle.n = { pattern: style.numFmt };
  }

  return univerStyle;
}

// ============================================
// EXCEL EXPORT FUNCTIONS
// ============================================

/**
 * Export Univer workbook data to Excel buffer using ExcelJS
 */
export async function exportToExcelBuffer(
  univerData: UniverWorkbookData,
): Promise<ArrayBuffer> {
  const workbook = await convertUniverToExcelJS(univerData);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Export Univer workbook data to Excel file and trigger download using ExcelJS
 */
export async function exportToExcel(
  univerData: UniverWorkbookData,
  filename: string = "spreadsheet.xlsx",
): Promise<void> {
  const finalFilename = filename.endsWith(".xlsx")
    ? filename
    : `${filename}.xlsx`;

  const buffer = await exportToExcelBuffer(univerData);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  saveAs(blob, finalFilename);
  console.log(`[ExcelJSExchange] Exported to ${finalFilename}`);
}

// ============================================
// EXCEL IMPORT FUNCTIONS
// ============================================

/**
 * Import Excel file to Univer workbook data format using ExcelJS
 */
export async function importFromExcel(
  file: File,
  onMissingFonts?: (missingFonts: string[]) => void,
): Promise<UniverWorkbookData> {
  try {
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);

    const univerData = convertExcelJSToUniver(workbook, file.name);

    // Ensure required fields
    if (!univerData.id) {
      univerData.id = `workbook-${Date.now()}`;
    }
    if (!univerData.name) {
      univerData.name = file.name.replace(/\.xlsx?$/i, "");
    }
    if (!univerData.sheetOrder && univerData.sheets) {
      univerData.sheetOrder = Object.keys(univerData.sheets);
    }

    // Check for missing fonts
    const fonts = extractFontsFromUniverData(univerData);
    if (fonts.size > 0) {
      const missingFonts = await findMissingFonts(fonts);
      if (missingFonts.length > 0) {
        replaceMissingFonts(univerData, missingFonts);
        if (onMissingFonts) {
          onMissingFonts(missingFonts);
        }
      }
    }

    console.log("[ExcelJSExchange] Import successful:", {
      sheets: univerData.sheetOrder.length,
      styles: Object.keys(univerData.styles || {}).length,
    });

    return univerData;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Excel import failed: ${errorMessage}`);
  }
}
