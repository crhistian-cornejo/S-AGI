import { z } from "zod";
import { nanoid } from "nanoid";

// ==================== Schema ====================
export const generateSpreadsheetToolSchema = z.object({
  title: z.string().min(1).max(200).describe("Title of the spreadsheet"),
  description: z.string().optional().describe("Description of the spreadsheet content"),
  sheets: z
    .array(
      z.object({
        name: z.string().min(1).max(50).describe("Name of the sheet"),
        data: z.array(z.array(z.any())).describe("2D array of cell data"),
      })
    )
    .min(1)
    .describe("Array of sheets with their data"),
});

export type GenerateSpreadsheetInput = z.infer<typeof generateSpreadsheetToolSchema>;

// ==================== Output Schema ====================
export const spreadsheetOutputSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("spreadsheet"),
  name: z.string(),
  content: z.object({
    sheets: z.array(
      z.object({
        name: z.string(),
        rows: z.number(),
        columns: z.number(),
        data: z.array(z.array(z.any())),
      })
    ),
  }),
  metadata: z.object({
    createdAt: z.string().datetime(),
    totalCells: z.number(),
  }),
});

export type SpreadsheetOutput = z.infer<typeof spreadsheetOutputSchema>;

// ==================== Function ====================
/**
 * Generates a spreadsheet artifact from the given input.
 * This is a pure function - no side effects, easy to test.
 *
 * @param input - Validated input for spreadsheet generation
 * @returns Spreadsheet output with metadata
 */
export async function generateSpreadsheet(
  input: GenerateSpreadsheetInput
): Promise<SpreadsheetOutput> {
  // Validate input
  const validated = generateSpreadsheetToolSchema.parse(input);

  // Calculate metadata
  const totalCells = validated.sheets.reduce((total, sheet) => {
    return total + sheet.data.length * (sheet.data[0]?.length || 0);
  }, 0);

  // Transform data to Univer-compatible format
  const sheets = validated.sheets.map((sheet) => ({
    name: sheet.name,
    rows: sheet.data.length,
    columns: sheet.data[0]?.length || 0,
    data: sheet.data,
  }));

  // Return output
  return {
    id: nanoid(),
    type: "spreadsheet",
    name: validated.title,
    content: {
      sheets,
    },
    metadata: {
      createdAt: new Date().toISOString(),
      totalCells,
    },
  };
}

// ==================== Utility Functions ====================
/**
 * Validates spreadsheet data structure.
 */
export function validateSheetData(data: any[][]): boolean {
  if (!Array.isArray(data) || data.length === 0) return false;

  const columnCount = data[0]?.length || 0;
  return data.every((row) => Array.isArray(row) && row.length === columnCount);
}

/**
 * Gets cell value at specified position.
 */
export function getCellValue(sheetData: any[][], row: number, col: number): any {
  return sheetData[row]?.[col] ?? "";
}

/**
 * Sets cell value at specified position (returns new array).
 */
export function setCellValue(sheetData: any[][], row: number, col: number, value: any): any[][] {
  const newData = sheetData.map((r) => [...r]);

  // Ensure row exists
  while (newData.length <= row) {
    newData.push([]);
  }

  // Ensure column exists in row
  while (newData[row].length <= col) {
    newData[row].push("");
  }

  newData[row][col] = value;
  return newData;
}

/**
 * Calculates a range of values (e.g., "A1:A10").
 */
export function calculateRange(
  sheetData: any[][],
  range: string
): { values: number[]; sum: number; average: number } | null {
  // Parse range (simplified - would need full implementation for Excel-style ranges)
  // For now, return null as placeholder
  return null;
}

// ==================== Examples ====================
export const exampleInputs = {
  simple: {
    title: "Monthly Budget",
    description: "Monthly expense tracking",
    sheets: [
      {
        name: "January",
        data: [
          ["Category", "Amount", "Status"],
          ["Rent", "$1500", "Paid"],
          ["Food", "$400", "Paid"],
          ["Utilities", "$200", "Pending"],
        ],
      },
    ],
  },

  multiSheet: {
    title: "Sales Report Q1",
    description: "Quarterly sales across multiple regions",
    sheets: [
      {
        name: "North",
        data: [
          ["Month", "Sales", "Target"],
          ["Jan", "$5000", "$4500"],
          ["Feb", "$5500", "$5000"],
          ["Mar", "$6000", "$5500"],
        ],
      },
      {
        name: "South",
        data: [
          ["Month", "Sales", "Target"],
          ["Jan", "$4000", "$4000"],
          ["Feb", "$4200", "$4200"],
          ["Mar", "$4800", "$4500"],
        ],
      },
    ],
  },
};
