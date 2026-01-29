/**
 * Excel Import/Export utilities using ExcelJS (100% free and open source)
 *
 * Re-export ExcelJS exchange functions for backward compatibility.
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

// Re-export from ExcelJS implementation
export {
  exportToExcelBuffer,
  exportToExcel,
  importFromExcel,
  type UniverWorkbookData,
} from "./exceljs-exchange";
