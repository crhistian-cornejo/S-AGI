import { describe, expect, test } from "bun:test";
import { sanitizeOpenAiResponseId } from "../../packages/core/src/types/ai";

describe("sanitizeOpenAiResponseId", () => {
  test("returns resp_ ids and strips invalid values", () => {
    expect(sanitizeOpenAiResponseId(undefined)).toBeUndefined();
    expect(
      sanitizeOpenAiResponseId("df5f1c27-4de9-44c7-b5d3-8cd84ae5de0d"),
    ).toBeUndefined();
    expect(sanitizeOpenAiResponseId("resp_123")).toBe("resp_123");
  });
});
