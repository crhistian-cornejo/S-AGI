import { describe, expect, test } from "bun:test";
import { processChatMessage } from "../src/main/lib/chat/processor";
import { readGoldenDataset, validateGoldenDataset } from "./utils";

describe("Chat Generation - Golden Dataset", () => {
  beforeAll(() => {
    const validation = validateGoldenDataset();
    if (!validation.valid) {
      throw new Error(`Invalid dataset: ${validation.errors.join(", ")}`);
    }
  });

  test("generates spreadsheet from natural language", async () => {
    const goldenCase = await readGoldenDataset("spreadsheet-001");
    const result = await processChatMessage(goldenCase.input);

    expect(result.artifacts[0].type).toBe("spreadsheet");
    expect(result.artifacts[0].data).toEqual(goldenCase.expectedOutput);
  });

  test("generates chart from data", async () => {
    const goldenCase = await readGoldenDataset("chart-001");
    const result = await processChatMessage(goldenCase.input);

    expect(result.artifacts[0].type).toBe("chart");
    expect(result.artifacts[0].config).toMatchObject(goldenCase.expectedConfig);
  });
});
