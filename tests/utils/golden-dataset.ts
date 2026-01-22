import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// ==================== Types ====================
export interface GoldenCase<TInput = any, TOutput = any> {
  id: string;
  description: string;
  input: TInput;
  expectedOutput: TOutput;
  metadata?: {
    author?: string;
    createdAt?: string;
    tags?: string[];
    skip?: boolean;
    skipReason?: string;
  };
}

export interface GoldenDataset<TInput = any, TOutput = any> {
  version: string;
  cases: GoldenCase<TInput, TOutput>[];
}

export interface DatasetValidation {
  valid: boolean;
  errors: string[];
}

// ==================== Constants ====================
const GOLDEN_DATASET_DIR = join(__dirname, "golden-datasets");

// ==================== Load Dataset ====================
/**
 * Reads a golden dataset from a JSON file.
 */
export function readGoldenDataset<TInput = any, TOutput = any>(
  caseId: string
): GoldenCase<TInput, TOutput> {
  const dataset = loadDataset<TInput, TOutput>();
  const goldenCase = dataset.cases.find((c) => c.id === caseId);

  if (!goldenCase) {
    throw new Error(`Golden case not found: ${caseId}`);
  }

  return goldenCase;
}

/**
 * Loads the entire golden dataset.
 */
export function loadDataset<TInput = any, TOutput = any>(): GoldenDataset<TInput, TOutput> {
  const filePath = join(GOLDEN_DATASET_DIR, "dataset.json");
  const content = readFileSync(filePath, "utf-8");
  const dataset = JSON.parse(content) as GoldenDataset<TInput, TOutput>;

  return dataset;
}

// ==================== Validate Dataset ====================
/**
 * Validates the golden dataset structure.
 */
export function validateGoldenDataset(): DatasetValidation {
  const errors: string[] = [];

  try {
    const dataset = loadDataset();

    // Check version
    if (!dataset.version) {
      errors.push("Missing dataset version");
    }

    // Check cases array
    if (!Array.isArray(dataset.cases)) {
      errors.push("Cases must be an array");
    } else {
      // Validate each case
      dataset.cases.forEach((goldenCase, index) => {
        const prefix = `Case ${index}`;

        if (!goldenCase.id) {
          errors.push(`${prefix}: Missing id`);
        }

        if (!goldenCase.description) {
          errors.push(`${prefix}: Missing description`);
        }

        if (goldenCase.input === undefined) {
          errors.push(`${prefix}: Missing input`);
        }

        if (goldenCase.expectedOutput === undefined) {
          errors.push(`${prefix}: Missing expectedOutput`);
        }

        // Check for duplicate IDs
        const duplicateCount = dataset.cases.filter((c) => c.id === goldenCase.id).length;
        if (duplicateCount > 1) {
          errors.push(`${prefix}: Duplicate id '${goldenCase.id}'`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to load dataset: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

// ==================== Get Dataset Stats ====================
export interface DatasetStats {
  totalCases: number;
  activeCases: number;
  skippedCases: number;
  tags: Record<string, number>;
}

/**
 * Gets statistics about the golden dataset.
 */
export function getDatasetStats(): DatasetStats {
  const dataset = loadDataset();

  const stats: DatasetStats = {
    totalCases: dataset.cases.length,
    activeCases: 0,
    skippedCases: 0,
    tags: {},
  };

  dataset.cases.forEach((goldenCase) => {
    if (goldenCase.metadata?.skip) {
      stats.skippedCases++;
    } else {
      stats.activeCases++;
    }

    // Count tags
    goldenCase.metadata?.tags?.forEach((tag) => {
      stats.tags[tag] = (stats.tags[tag] || 0) + 1;
    });
  });

  return stats;
}

// ==================== Save Golden Case ====================
/**
 * Saves a new golden case to the dataset.
 */
export function saveGoldenCase<TInput = any, TOutput = any>(
  goldenCase: GoldenCase<TInput, TOutput>
): void {
  const dataset = loadDataset();
  dataset.cases.push(goldenCase);

  const filePath = join(GOLDEN_DATASET_DIR, "dataset.json");
  const content = JSON.stringify(dataset, null, 2);
  // Note: In real implementation, you'd use writeFileSync here
  // writeFileSync(filePath, content, "utf-8");
}

// ==================== Filter Cases ====================
/**
 * Filters golden cases by tag.
 */
export function filterByTag<TInput = any, TOutput = any>(
  tag: string
): GoldenCase<TInput, TOutput>[] {
  const dataset = loadDataset();
  return dataset.cases.filter(
    (goldenCase) =>
      !goldenCase.metadata?.skip &&
      goldenCase.metadata?.tags?.includes(tag)
  );
}

/**
 * Gets all active (non-skipped) golden cases.
 */
export function getActiveCases<TInput = any, TOutput = any>(): GoldenCase<TInput, TOutput>[] {
  const dataset = loadDataset();
  return dataset.cases.filter((goldenCase) => !goldenCase.metadata?.skip);
}

/**
 * Gets all skipped golden cases.
 */
export function getSkippedCases<TInput = any, TOutput = any>(): GoldenCase<TInput, TOutput>[] {
  const dataset = loadDataset();
  return dataset.cases.filter((goldenCase) => goldenCase.metadata?.skip);
}

// ==================== Export ====================
export const goldenDatasetUtils = {
  read: readGoldenDataset,
  load: loadDataset,
  validate: validateGoldenDataset,
  getStats: getDatasetStats,
  save: saveGoldenCase,
  filterByTag,
  getActive: getActiveCases,
  getSkipped: getSkippedCases,
};
