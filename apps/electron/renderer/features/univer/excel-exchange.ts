/**
 * Excel Import/Export utilities using SpreadJS for maximum fidelity
 *
 * Re-export SpreadJS exchange functions for backward compatibility.
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

// Re-export from SpreadJS implementation
export {
  exportToExcelBuffer,
  exportToExcel,
  importFromExcel,
  type UniverWorkbookData,
} from "./spreadjs-exchange";
