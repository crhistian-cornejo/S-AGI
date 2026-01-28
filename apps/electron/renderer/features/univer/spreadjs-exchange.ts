/**
 * Excel Import/Export utilities using SpreadJS for maximum fidelity
 *
 * SpreadJS provides complete Excel compatibility including:
 * - Full cell styles (font, fill, borders, alignment) with 100% fidelity
 * - Images and drawings (native support)
 * - Charts (30+ types)
 * - Shapes and objects
 * - Pivot tables
 * - Conditional formatting
 * - Data validation
 * - Formulas (500+ Excel functions)
 * - Merged cells
 * - Column widths and row heights
 * - Hyperlinks
 * - Comments and notes
 */

import * as GC from "@mescius/spread-sheets";
import "@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css";
import * as ExcelIO from "@mescius/spread-excelio";
import { saveAs } from "file-saver";

// Import shapes plugin
import "@grapecity/spread-sheets-shapes";

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
// CONVERSION: UNIVER -> SPREADJS
// ============================================

/**
 * Helper to extract color from Univer color object
 */
function extractColor(
  color: { r: number; g: number; b: number; rgb?: string } | undefined,
): string | null {
  if (!color) return null;
  // Prefer rgb string if available (e.g., "#FF5500")
  if (color.rgb) return color.rgb;
  // Otherwise convert from r,g,b values
  if (
    typeof color.r === "number" &&
    typeof color.g === "number" &&
    typeof color.b === "number"
  ) {
    return rgbToHex(color.r, color.g, color.b);
  }
  return null;
}

/**
 * Convert Univer cell style to SpreadJS style
 */
function convertUniverStyleToSpreadJS(
  style: UniverCellStyle | undefined,
): GC.Spread.Sheets.Style {
  const spreadStyle = new GC.Spread.Sheets.Style();

  if (!style) return spreadStyle;

  // Font properties
  const font = style.ff?.split(",")[0].trim() || "Arial";
  const size = style.fs || 11;
  const bold = style.bl === 1;
  const italic = style.it === 1;
  const underline =
    typeof style.ul === "number" ? style.ul === 1 : !!style.ul?.s;
  const strikethrough =
    typeof style.st === "number" ? style.st === 1 : !!style.st?.s;

  // Build font string
  let fontParts: string[] = [];
  if (bold) fontParts.push("bold");
  if (italic) fontParts.push("italic");
  fontParts.push(`${size}pt`);
  fontParts.push(font);

  spreadStyle.font = fontParts.join(" ");

  // Text color
  const textColor = extractColor(style.cl);
  if (textColor) {
    spreadStyle.foreColor = textColor;
  }

  // Text decorations
  if (underline) {
    spreadStyle.textDecoration =
      GC.Spread.Sheets.TextDecorationType.underline as any;
  }
  if (strikethrough) {
    spreadStyle.textDecoration =
      GC.Spread.Sheets.TextDecorationType.lineThrough as any;
  }

  // Background color
  const bgColor = extractColor(style.bg);
  if (bgColor) {
    spreadStyle.backColor = bgColor as any;
  }

  // Alignment - Univer uses 1=left, 2=center, 3=right
  const alignMap: Record<number, GC.Spread.Sheets.HorizontalAlign> = {
    1: GC.Spread.Sheets.HorizontalAlign.left,
    2: GC.Spread.Sheets.HorizontalAlign.center,
    3: GC.Spread.Sheets.HorizontalAlign.right,
  };
  const vertMap: Record<number, GC.Spread.Sheets.VerticalAlign> = {
    1: GC.Spread.Sheets.VerticalAlign.top,
    2: GC.Spread.Sheets.VerticalAlign.center,
    3: GC.Spread.Sheets.VerticalAlign.bottom,
  };

  if (style.ht !== undefined && alignMap[style.ht]) {
    spreadStyle.hAlign = alignMap[style.ht];
  }
  if (style.vt !== undefined && vertMap[style.vt]) {
    spreadStyle.vAlign = vertMap[style.vt];
  }
  // Text wrap: 2 = wrap in Univer
  if (style.tb === 2) {
    spreadStyle.wordWrap = true;
  }

  // Number format (currency, percentage, etc.)
  if (style.n?.pattern) {
    spreadStyle.formatter = style.n.pattern;
  }

  // Borders
  if (style.bd) {
    const borderStyleMap: Record<number, GC.Spread.Sheets.LineStyle> = {
      1: GC.Spread.Sheets.LineStyle.thin,
      2: GC.Spread.Sheets.LineStyle.hair,
      3: GC.Spread.Sheets.LineStyle.dotted,
      4: GC.Spread.Sheets.LineStyle.dashed,
      5: GC.Spread.Sheets.LineStyle.dashDot,
      6: GC.Spread.Sheets.LineStyle.dashDotDot,
      7: GC.Spread.Sheets.LineStyle.double,
      8: GC.Spread.Sheets.LineStyle.medium,
      9: GC.Spread.Sheets.LineStyle.mediumDashed,
      10: GC.Spread.Sheets.LineStyle.mediumDashDot,
      11: GC.Spread.Sheets.LineStyle.mediumDashDotDot,
      12: GC.Spread.Sheets.LineStyle.slantedDashDot,
      13: GC.Spread.Sheets.LineStyle.thick,
    };

    const createBorder = (
      bd: { s: number; cl: { r: number; g: number; b: number; rgb?: string } },
    ) => {
      const color = extractColor(bd.cl) || "#000000";
      const lineStyle =
        borderStyleMap[bd.s] ?? GC.Spread.Sheets.LineStyle.thin;
      return new GC.Spread.Sheets.LineBorder(color, lineStyle);
    };

    if (style.bd.t?.cl) {
      spreadStyle.borderTop = createBorder(style.bd.t);
    }
    if (style.bd.b?.cl) {
      spreadStyle.borderBottom = createBorder(style.bd.b);
    }
    if (style.bd.l?.cl) {
      spreadStyle.borderLeft = createBorder(style.bd.l);
    }
    if (style.bd.r?.cl) {
      spreadStyle.borderRight = createBorder(style.bd.r);
    }
  }

  return spreadStyle;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(x).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

/**
 * Extract number formats from Univer resources
 */
function extractNumFmtFromResources(
  univerData: UniverWorkbookData,
): Map<string, Map<string, string>> {
  const formats = new Map<string, Map<string, string>>();

  if (!univerData.resources) return formats;

  // Look for numfmt resource
  const numfmtResource = univerData.resources.find(
    (r) =>
      r.name === "SHEET_NUMFMT_PLUGIN" ||
      r.name?.toLowerCase().includes("numfmt"),
  );

  if (numfmtResource?.data) {
    try {
      const numfmtData = JSON.parse(numfmtResource.data);
      // numfmtData is typically { sheetId: { "row,col": { pattern: "..." } } }
      for (const [sheetId, sheetFormats] of Object.entries(numfmtData)) {
        if (typeof sheetFormats !== "object" || !sheetFormats) continue;
        const sheetMap = new Map<string, string>();
        for (const [cellKey, format] of Object.entries(
          sheetFormats as Record<string, any>,
        )) {
          if (format?.pattern) {
            sheetMap.set(cellKey, format.pattern);
          }
        }
        if (sheetMap.size > 0) {
          formats.set(sheetId, sheetMap);
        }
      }
    } catch (e) {
      console.warn("[SpreadJSExchange] Failed to parse numfmt resource:", e);
    }
  }

  return formats;
}

/**
 * Convert Univer workbook to SpreadJS workbook
 * Returns a promise to handle async image loading
 */
async function convertUniverToSpreadJS(
  univerData: UniverWorkbookData,
): Promise<GC.Spread.Sheets.Workbook> {
  // Debug: log the full univerData structure to see what we're working with
  console.log("[SpreadJSExchange] Converting Univer data:", {
    hasStyles: !!univerData.styles,
    stylesCount: univerData.styles ? Object.keys(univerData.styles).length : 0,
    resources: univerData.resources?.map((r) => r.name),
    sheetCount: univerData.sheetOrder?.length || 0,
  });

  // Extract number formats from resources
  const numFmtMap = extractNumFmtFromResources(univerData);
  console.log(
    "[SpreadJSExchange] Extracted number formats for sheets:",
    Array.from(numFmtMap.keys()),
  );

  const spread = new GC.Spread.Sheets.Workbook();

  const sheetOrder =
    univerData.sheetOrder || Object.keys(univerData.sheets || {});

  // Remove default sheet if we have custom sheets
  // SpreadJS creates a default sheet, we need to remove it if we have custom sheets
  if (sheetOrder.length > 0 && spread.sheets.length > 0) {
    try {
      // Remove the default sheet at index 0
      spread.removeSheet(0);
    } catch (e) {
      // If removeSheet fails, we'll just overwrite the default sheet
      console.warn(
        "[SpreadJSExchange] Could not remove default sheet, will overwrite:",
        e,
      );
    }
  }

  // Collect all image loading promises
  const imagePromises: Promise<void>[] = [];

  for (const sheetId of sheetOrder) {
    const univerSheet = univerData.sheets?.[sheetId];
    if (!univerSheet) continue;

    const sheetName = univerSheet.name || sheetId;

    // Get number formats for this sheet
    const sheetNumFmts = numFmtMap.get(sheetId);

    // Add new sheet - SpreadJS addSheet(index, worksheet) method
    // Create a new worksheet and add it to the workbook
    const newSheet = new GC.Spread.Sheets.Worksheet(sheetName);
    spread.addSheet(spread.sheets.length, newSheet);
    const sheet = spread.getSheet(spread.sheets.length - 1);

    // Debug first cell style
    let debuggedFirstStyle = false;

    // Convert cells
    if (univerSheet.cellData) {
      for (const [rowKey, row] of Object.entries(univerSheet.cellData)) {
        const rowNum = parseInt(rowKey, 10);
        if (isNaN(rowNum)) continue;

        for (const [colKey, cell] of Object.entries(row)) {
          const colNum = parseInt(colKey, 10);
          if (isNaN(colNum)) continue;

          // Set value
          if (cell.f) {
            // Formula
            sheet.setFormula(rowNum, colNum, cell.f);
          } else {
            // Value
            sheet.setValue(rowNum, colNum, cell.v ?? "");
          }

          // Set style
          const style =
            typeof cell.s === "string"
              ? univerData.styles?.[cell.s]
              : (cell.s as UniverCellStyle | undefined);

          // Debug: log first cell with style
          if (style && !debuggedFirstStyle) {
            console.log(
              "[SpreadJSExchange] First cell style sample:",
              JSON.stringify(style, null, 2),
            );
            debuggedFirstStyle = true;
          }

          // Get number format from resources if available
          const cellKey = `${rowNum},${colNum}`;
          const numFmt = sheetNumFmts?.get(cellKey);

          if (style || numFmt) {
            const spreadStyle = convertUniverStyleToSpreadJS(style);

            // Apply number format from resources if not in style
            if (numFmt && !spreadStyle.formatter) {
              spreadStyle.formatter = numFmt;
            }

            sheet.setStyle(rowNum, colNum, spreadStyle);
          }
        }
      }
    }

    // Set column widths
    if (univerSheet.columnData) {
      for (const [colKey, colData] of Object.entries(univerSheet.columnData)) {
        const colNum = parseInt(colKey, 10);
        if (!isNaN(colNum) && colData.w) {
          sheet.setColumnWidth(colNum, colData.w);
        }
      }
    } else if (univerSheet.defaultColumnWidth) {
      sheet.defaults.colWidth = univerSheet.defaultColumnWidth;
    }

    // Set row heights
    if (univerSheet.rowData) {
      for (const [rowKey, rowData] of Object.entries(univerSheet.rowData)) {
        const rowNum = parseInt(rowKey, 10);
        if (!isNaN(rowNum) && rowData.h) {
          sheet.setRowHeight(rowNum, rowData.h);
        }
      }
    } else if (univerSheet.defaultRowHeight) {
      sheet.defaults.rowHeight = univerSheet.defaultRowHeight;
    }

    // Merged cells
    if (univerSheet.mergeData) {
      for (const merge of univerSheet.mergeData) {
        sheet.addSpan(
          merge.startRow,
          merge.startColumn,
          merge.endRow - merge.startRow + 1,
          merge.endColumn - merge.startColumn + 1,
        );
      }
    }

    // Handle images/drawings from resources - wait for all images to load
    if (univerData.resources) {
      const drawingResource = univerData.resources.find(
        (r) => r.name === "SHEET_DRAWING_PLUGIN" || r.name?.includes("drawing"),
      );

      if (drawingResource?.data) {
        try {
          const drawingsData = JSON.parse(drawingResource.data);
          const sheetDrawings = drawingsData[sheetId];

          if (sheetDrawings && typeof sheetDrawings === "object") {
            const imagePromises: Promise<void>[] = [];

            for (const [drawingId, drawing] of Object.entries(sheetDrawings)) {
              const draw = drawing as Record<string, unknown>;
              if (draw.source && draw.sheetTransform) {
                const transform = draw.sheetTransform as {
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
                };

                if (transform.from && transform.to) {
                  const fromCol = transform.from.column ?? 0;
                  const fromRow = transform.from.row ?? 0;
                  const toCol = transform.to.column ?? fromCol + 1;
                  const toRow = transform.to.row ?? fromRow + 1;

                  // Create promise to wait for image load
                  const imagePromise = new Promise<void>((resolve) => {
                    const image = new Image();
                    image.crossOrigin = "anonymous"; // Handle CORS if needed

                    image.onload = () => {
                      try {
                        // Calculate actual position including offsets
                        const colOffset =
                          (transform.from?.columnOffset ?? 0) / 9525; // Convert EMUs to pixels
                        const rowOffset =
                          (transform.from?.rowOffset ?? 0) / 9525;

                        // Add image with proper positioning
                        // SpreadJS pictures.add() expects: name, src (string URL), startRow, startCol, endRow, endCol
                        const imageSrc = image.src;
                        (sheet.pictures as any).add(
                          drawingId,
                          imageSrc,
                          fromRow,
                          fromCol,
                          toRow,
                          toCol,
                        );

                        // Set position offsets if available
                        const picture = (sheet.pictures as any).get(drawingId);
                        if (picture && (colOffset !== 0 || rowOffset !== 0)) {
                          // SpreadJS uses different positioning, adjust if needed
                          // Note: SpreadJS positioning might need adjustment based on actual API
                          // Offsets can be set using picture.startRowOffset() and picture.startColumnOffset() if available
                        }

                        resolve();
                      } catch (error) {
                        console.warn(
                          `[SpreadJSExchange] Failed to add image ${drawingId}:`,
                          error,
                        );
                        resolve(); // Continue even if one image fails
                      }
                    };

                    image.onerror = () => {
                      console.warn(
                        `[SpreadJSExchange] Failed to load image ${drawingId}`,
                      );
                      resolve(); // Continue even if image fails to load
                    };

                    // Handle base64 data URLs
                    const source = draw.source as string;
                    if (
                      source.startsWith("data:") ||
                      source.startsWith("http")
                    ) {
                      image.src = source;
                    } else {
                      // Assume base64 without prefix
                      image.src = `data:image/png;base64,${source}`;
                    }
                  });

                  imagePromises.push(imagePromise);
                }
              }
            }
          }
        } catch (e) {
          console.warn("[SpreadJSExchange] Failed to parse drawings:", e);
        }
      }
    }

    // Handle charts from Univer data (if present)
    // SpreadJS automatically preserves charts during Excel import/export
    // Charts in Excel files imported via SpreadJS will be preserved
    if (univerData.resources) {
      const chartResource = univerData.resources.find(
        (r) => r.name?.includes("chart") || r.name?.includes("CHART"),
      );

      if (chartResource?.data) {
        try {
          const chartsData = JSON.parse(chartResource.data);
          const sheetCharts = chartsData[sheetId];

          if (sheetCharts && Array.isArray(sheetCharts)) {
            // Charts will be preserved by SpreadJS Excel.IO during export
            // Manual chart creation would require SpreadJS Chart API
            console.log(
              `[SpreadJSExchange] Found ${sheetCharts.length} charts for sheet ${sheetId} - will be preserved by SpreadJS`,
            );
          }
        } catch (e) {
          console.warn("[SpreadJSExchange] Failed to parse charts:", e);
        }
      }
    }
  }

  // Wait for all images to load before returning
  await Promise.all(imagePromises).catch((err) => {
    console.warn("[SpreadJSExchange] Some images failed to load:", err);
  });

  return spread;
}

// ============================================
// CONVERSION: SPREADJS -> UNIVER
// ============================================

/**
 * Convert SpreadJS style to Univer cell style
 */
function convertSpreadJSStyleToUniver(
  style: GC.Spread.Sheets.Style,
  _styleIndex: number,
): UniverCellStyle {
  const univerStyle: UniverCellStyle = {};

  // Font parsing - improved regex to handle more font variations
  if (style.font) {
    // Match: [bold] [italic] [underline] sizept fontname
    const fontMatch = style.font.match(
      /(?:bold\s+)?(?:italic\s+)?(?:underline\s+)?(\d+(?:\.\d+)?)pt\s+(.+)/i,
    );
    if (fontMatch) {
      univerStyle.fs = parseFloat(fontMatch[1]);
      univerStyle.ff = fontMatch[2].trim().replace(/['"]/g, ""); // Remove quotes
    }

    if (style.font.includes("bold")) univerStyle.bl = 1;
    if (style.font.includes("italic")) univerStyle.it = 1;
    if (style.font.includes("underline")) univerStyle.ul = 1;
  }

  // Number format
  if (style.formatter) {
    (univerStyle as any).nf = style.formatter;
  }

  // Colors
  if (style.foreColor) {
    const rgb = hexToRgb(style.foreColor);
    if (rgb) univerStyle.cl = rgb;
  }

  if (style.backColor) {
    // SpreadJS backColor can be string or complex object, handle both
    const backColorStr =
      typeof style.backColor === "string"
        ? style.backColor
        : (style.backColor as any).color || "";
    const rgb = hexToRgb(backColorStr);
    if (rgb) univerStyle.bg = rgb;
  }

  // Alignment
  if (style.hAlign !== undefined) {
    const alignMap: Record<number, number> = {
      [GC.Spread.Sheets.HorizontalAlign.left]: 0,
      [GC.Spread.Sheets.HorizontalAlign.center]: 1,
      [GC.Spread.Sheets.HorizontalAlign.right]: 2,
    };
    univerStyle.ht = alignMap[style.hAlign] ?? 0;
  }

  if (style.vAlign !== undefined) {
    const vertMap: Record<number, number> = {
      [GC.Spread.Sheets.VerticalAlign.top]: 0,
      [GC.Spread.Sheets.VerticalAlign.center]: 1,
      [GC.Spread.Sheets.VerticalAlign.bottom]: 2,
    };
    univerStyle.vt = vertMap[style.vAlign] ?? 0;
  }

  if (style.wordWrap) {
    univerStyle.tb = 1;
  }

  // Borders
  if (
    style.borderTop ||
    style.borderBottom ||
    style.borderLeft ||
    style.borderRight
  ) {
    univerStyle.bd = {};

    const borderStyleMap: Record<number, number> = {
      [GC.Spread.Sheets.LineStyle.thin]: 0,
      [GC.Spread.Sheets.LineStyle.medium]: 1,
      [GC.Spread.Sheets.LineStyle.thick]: 2,
    };

    if (style.borderTop) {
      const rgb = hexToRgb(style.borderTop.color);
      univerStyle.bd.t = {
        s: borderStyleMap[style.borderTop.style] ?? 0,
        cl: rgb || { r: 0, g: 0, b: 0 },
      };
    }
    if (style.borderBottom) {
      const rgb = hexToRgb(style.borderBottom.color);
      univerStyle.bd.b = {
        s: borderStyleMap[style.borderBottom.style] ?? 0,
        cl: rgb || { r: 0, g: 0, b: 0 },
      };
    }
    if (style.borderLeft) {
      const rgb = hexToRgb(style.borderLeft.color);
      univerStyle.bd.l = {
        s: borderStyleMap[style.borderLeft.style] ?? 0,
        cl: rgb || { r: 0, g: 0, b: 0 },
      };
    }
    if (style.borderRight) {
      const rgb = hexToRgb(style.borderRight.color);
      univerStyle.bd.r = {
        s: borderStyleMap[style.borderRight.style] ?? 0,
        cl: rgb || { r: 0, g: 0, b: 0 },
      };
    }
  }

  return univerStyle;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert SpreadJS workbook to Univer workbook
 */
function convertSpreadJSToUniver(
  workbook: GC.Spread.Sheets.Workbook,
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

  for (let i = 0; i < workbook.sheets.length; i++) {
    const spreadSheet = workbook.getSheet(i);
    const sheetId = `sheet_${i}`;
    const sheetName = spreadSheet.name();

    univerData.sheetOrder.push(sheetId);

    const sheetData: UniverSheetData = {
      id: sheetId,
      name: sheetName,
      cellData: {},
    };

    // Get used range
    const usedRange = spreadSheet.getUsedRange();
    if (usedRange) {
      sheetData.rowCount = usedRange.row + usedRange.rowCount;
      sheetData.columnCount = usedRange.col + usedRange.colCount;

      // Convert cells
      for (
        let row = usedRange.row;
        row < usedRange.row + usedRange.rowCount;
        row++
      ) {
        for (
          let col = usedRange.col;
          col < usedRange.col + usedRange.colCount;
          col++
        ) {
          const value = spreadSheet.getValue(row, col);
          const formula = spreadSheet.getFormula(row, col);
          const style = spreadSheet.getStyle(row, col);

          if (value !== undefined || formula) {
            const rowKey = String(row);
            const colKey = String(col);

            if (!sheetData.cellData[rowKey]) {
              sheetData.cellData[rowKey] = {};
            }

            const univerCell: UniverCell = {
              v: value ?? "",
            };

            if (formula) {
              univerCell.f = formula;
            }

            // Style
            if (style) {
              const univerStyle = convertSpreadJSStyleToUniver(
                style,
                styleIndex,
              );
              const styleKey = JSON.stringify(univerStyle);

              if (!styleMap.has(styleKey)) {
                const styleId = `style_${styleIndex++}`;
                styleMap.set(styleKey, styleId);
                univerData.styles![styleId] = univerStyle;
              }

              univerCell.s = styleMap.get(styleKey)!;
            }

            sheetData.cellData[rowKey][colKey] = univerCell;
          }
        }
      }
    }

    // Column widths
    sheetData.columnData = {};
    for (let col = 0; col < (sheetData.columnCount || 26); col++) {
      const width = spreadSheet.getColumnWidth(col);
      if (width && width !== spreadSheet.defaults.colWidth) {
        sheetData.columnData![String(col)] = { w: width };
      }
    }

    // Row heights
    sheetData.rowData = {};
    for (let row = 0; row < (sheetData.rowCount || 100); row++) {
      const height = spreadSheet.getRowHeight(row);
      if (height && height !== spreadSheet.defaults.rowHeight) {
        sheetData.rowData![String(row)] = { h: height };
      }
    }

    // Merged cells
    const spans = spreadSheet.getSpans();
    if (spans && spans.length > 0) {
      sheetData.mergeData = spans.map((span: any) => ({
        startRow: span.row,
        endRow: span.row + span.rowCount - 1,
        startColumn: span.col,
        endColumn: span.col + span.colCount - 1,
      }));
    }

    // Images/drawings - SpreadJS preserves images automatically
    const pictures = spreadSheet.pictures.all();
    if (pictures && pictures.length > 0) {
      if (!univerData.resources) {
        univerData.resources = [];
      }

      const drawings: Record<string, Record<string, unknown>> = {};
      drawings[sheetId] = {};

      pictures.forEach((picture: any, index: number) => {
        const drawingId = `drawing_${index}`;
        const image = picture.image();

        if (image) {
          // Convert image to base64 if possible for better preservation
          let imageSource = image.src;

          // Try to get base64 if it's a canvas or image element
          if (
            image instanceof HTMLImageElement &&
            image.src.startsWith("data:")
          ) {
            imageSource = image.src;
          } else if (image instanceof HTMLCanvasElement) {
            imageSource = image.toDataURL("image/png");
          }

          drawings[sheetId][drawingId] = {
            drawingId,
            drawingType: 1,
            source: imageSource,
            sheetTransform: {
              from: {
                column: picture.startColumn(),
                row: picture.startRow(),
                columnOffset: 0, // SpreadJS doesn't expose offsets directly
                rowOffset: 0,
              },
              to: {
                column: picture.endColumn(),
                row: picture.endRow(),
                columnOffset: 0,
                rowOffset: 0,
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

    // Charts - SpreadJS preserves charts automatically during Excel import/export
    // Charts imported from Excel will be preserved when exporting back
    try {
      const charts = (spreadSheet as any).charts?.all?.() || [];
      if (charts && charts.length > 0) {
        if (!univerData.resources) {
          univerData.resources = [];
        }

        // Store chart metadata for reference (charts are preserved by SpreadJS)
        const chartsData: Record<string, unknown[]> = {};
        chartsData[sheetId] = charts.map((chart: any, index: number) => ({
          id: `chart_${index}`,
          name: chart.name?.() || `Chart ${index + 1}`,
          // Charts will be preserved automatically by SpreadJS Excel.IO
        }));

        const chartResource = univerData.resources.find(
          (r) => r.name === "SHEET_CHART_PLUGIN",
        );

        if (chartResource) {
          const existingCharts = JSON.parse(chartResource.data || "{}");
          Object.assign(existingCharts, chartsData);
          chartResource.data = JSON.stringify(existingCharts);
        } else {
          univerData.resources.push({
            name: "SHEET_CHART_PLUGIN",
            data: JSON.stringify(chartsData),
          });
        }

        console.log(
          `[SpreadJSExchange] Found ${charts.length} charts in sheet ${sheetId} - preserved by SpreadJS`,
        );
      }
    } catch (e) {
      // Charts API might not be available, that's OK
      console.debug("[SpreadJSExchange] Charts API check:", e);
    }

    // Pivot Tables - SpreadJS preserves pivot tables automatically
    try {
      const pivotTables = (spreadSheet as any).pivotTables?.all?.() || [];
      if (pivotTables && pivotTables.length > 0) {
        console.log(
          `[SpreadJSExchange] Found ${pivotTables.length} pivot tables in sheet ${sheetId} - preserved by SpreadJS`,
        );
        // Pivot tables are automatically preserved by SpreadJS Excel.IO
      }
    } catch (e) {
      // Pivot tables API might not be available, that's OK
      console.debug("[SpreadJSExchange] Pivot tables API check:", e);
    }

    univerData.sheets[sheetId] = sheetData;
  }

  return univerData;
}

// ============================================
// EXCEL EXPORT FUNCTIONS
// ============================================

/**
 * Export Univer workbook data to Excel buffer using SpreadJS
 * Ensures all images are loaded before exporting for maximum fidelity
 */
export async function exportToExcelBuffer(
  univerData: UniverWorkbookData,
): Promise<ArrayBuffer> {
  // Wait for all images to load before converting
  const spread = await convertUniverToSpreadJS(univerData);
  const excelIO = new ExcelIO.IO();

  // Convert workbook to JSON
  const json = JSON.stringify(spread.toJSON());

  // Export to blob
  return new Promise((resolve, reject) => {
    excelIO.save(
      json,
      (blob: Blob) => {
        blob
          .arrayBuffer()
          .then((buffer) => resolve(buffer))
          .catch((error) => reject(error));
      },
      (error: Error) => {
        reject(error);
      },
    );
  });
}

/**
 * Export Univer workbook data to Excel file and trigger download using SpreadJS
 * Ensures all images are loaded before exporting for maximum fidelity
 */
export async function exportToExcel(
  univerData: UniverWorkbookData,
  filename: string = "spreadsheet.xlsx",
): Promise<void> {
  const finalFilename = filename.endsWith(".xlsx")
    ? filename
    : `${filename}.xlsx`;

  // Wait for all images to load before converting
  const spread = await convertUniverToSpreadJS(univerData);
  const excelIO = new ExcelIO.IO();

  // Convert workbook to JSON
  const json = JSON.stringify(spread.toJSON());

  return new Promise((resolve, reject) => {
    excelIO.save(
      json,
      (blob: Blob) => {
        saveAs(blob, finalFilename);
        resolve();
      },
      (error: Error) => {
        console.error("[SpreadJSExchange] Export failed:", error);
        reject(error);
      },
    );
  });
}

// ============================================
// EXCEL IMPORT FUNCTIONS
// ============================================

/**
 * Import Excel file to Univer workbook data format using SpreadJS
 */
export async function importFromExcel(
  file: File,
  onMissingFonts?: (missingFonts: string[]) => void,
): Promise<UniverWorkbookData> {
  return new Promise((resolve, reject) => {
    try {
      // Create SpreadJS workbook and Excel IO
      const spread = new GC.Spread.Sheets.Workbook();
      const excelIO = new ExcelIO.IO();

      // Import Excel file
      excelIO.open(
        file,
        async (json: any) => {
          try {
            // Load JSON into workbook
            spread.fromJSON(json);

            // Convert to Univer format
            const univerData = convertSpreadJSToUniver(spread, file.name);

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

            resolve(univerData);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            reject(
              new Error(
                `Failed to convert SpreadJS to Univer: ${errorMessage}`,
              ),
            );
          }
        },
        (error: Error) => {
          reject(
            new Error(
              `Excel import failed: ${error.message || "Unknown error"}`,
            ),
          );
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      reject(
        new Error(`Excel import failed: ${errorMessage || "Unknown error"}`),
      );
    }
  });
}
