/**
 * PDF Form Filling Service
 *
 * High-level API for working with PDF forms using LibPDF.
 * Provides form field manipulation, filling, and flattening.
 */

import {
  loadPdf,
  getFormFields,
  fillFormFields,
  flattenForm,
} from "./pdf-service";
import log from "electron-log";

export interface FormField {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "button" | "signature";
  value: string | boolean | string[] | null;
  options?: string[]; // For dropdown/radio fields
  required?: boolean;
  readonly?: boolean;
}

export interface FormFillResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  error?: string;
  filledFields: string[];
  skippedFields: string[];
}

/**
 * Get all form fields from a PDF
 */
export async function getFields(pdfBytes: Uint8Array): Promise<FormField[]> {
  try {
    const rawFields = await getFormFields(pdfBytes);

    return rawFields.map((field) => ({
      name: field.name,
      type: mapFieldType(field.type),
      value: field.value,
    }));
  } catch (error) {
    log.error("[FormFiller] Failed to get form fields:", error);
    throw error;
  }
}

/**
 * Map LibPDF field type to our simplified type
 */
function mapFieldType(
  type: string
): "text" | "checkbox" | "radio" | "dropdown" | "button" | "signature" {
  switch (type.toLowerCase()) {
    case "pdftextfield":
    case "textfield":
      return "text";
    case "pdfcheckbox":
    case "checkbox":
      return "checkbox";
    case "pdfradiogroup":
    case "radiogroup":
      return "radio";
    case "pdfdropdown":
    case "dropdown":
    case "combobox":
      return "dropdown";
    case "pdfbutton":
    case "button":
      return "button";
    case "pdfsignature":
    case "signature":
      return "signature";
    default:
      return "text";
  }
}

/**
 * Fill form fields with provided values
 */
export async function fill(
  pdfBytes: Uint8Array,
  values: Record<string, string | boolean>
): Promise<FormFillResult> {
  try {
    const fields = await getFields(pdfBytes);
    const fieldNames = new Set(fields.map((f) => f.name));

    const filledFields: string[] = [];
    const skippedFields: string[] = [];

    // Check which fields exist
    for (const [name, _value] of Object.entries(values)) {
      if (fieldNames.has(name)) {
        filledFields.push(name);
      } else {
        skippedFields.push(name);
        log.warn(`[FormFiller] Field not found in PDF: ${name}`);
      }
    }

    // Filter values to only include existing fields
    const validValues: Record<string, string | boolean> = {};
    for (const name of filledFields) {
      validValues[name] = values[name];
    }

    const resultPdf = await fillFormFields(pdfBytes, validValues);

    return {
      success: true,
      pdfBytes: resultPdf,
      filledFields,
      skippedFields,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    log.error("[FormFiller] Failed to fill form:", error);
    return {
      success: false,
      error: errorMsg,
      filledFields: [],
      skippedFields: Object.keys(values),
    };
  }
}

/**
 * Flatten form fields (convert to static content)
 * This makes the form non-editable but preserves visual appearance
 */
export async function flatten(pdfBytes: Uint8Array): Promise<Uint8Array> {
  try {
    return await flattenForm(pdfBytes);
  } catch (error) {
    log.error("[FormFiller] Failed to flatten form:", error);
    throw error;
  }
}

/**
 * Fill form and flatten in one operation
 */
export async function fillAndFlatten(
  pdfBytes: Uint8Array,
  values: Record<string, string | boolean>
): Promise<FormFillResult> {
  const fillResult = await fill(pdfBytes, values);

  if (!fillResult.success || !fillResult.pdfBytes) {
    return fillResult;
  }

  try {
    const flattenedPdf = await flatten(fillResult.pdfBytes);
    return {
      ...fillResult,
      pdfBytes: flattenedPdf,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    log.error("[FormFiller] Failed to flatten after fill:", error);
    return {
      ...fillResult,
      error: `Filled but failed to flatten: ${errorMsg}`,
    };
  }
}

/**
 * Check if a PDF has fillable form fields
 */
export async function hasFormFields(pdfBytes: Uint8Array): Promise<boolean> {
  try {
    const fields = await getFormFields(pdfBytes);
    return fields.length > 0;
  } catch {
    return false;
  }
}
