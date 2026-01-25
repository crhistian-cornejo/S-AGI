import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODELS,
  DEFAULT_TOOL_APPROVAL_CONFIG,
  getToolsRequiringApproval,
  resolveModelForProvider,
  resolveModelIdForApi,
} from "../../packages/core/src/types/ai";

describe("AI manifest helpers", () => {
  test("resolveModelForProvider uses matching model", () => {
    const model = resolveModelForProvider("openai", "gpt-5");
    expect(model.id).toBe("gpt-5");
    expect(model.provider).toBe("openai");
  });

  test("resolveModelForProvider falls back to provider default", () => {
    const model = resolveModelForProvider("openai", "GLM-4.7");
    expect(model.id).toBe(DEFAULT_MODELS.openai);
    expect(model.provider).toBe("openai");
  });

  test("resolveModelIdForApi maps modelIdForApi when present", () => {
    expect(resolveModelIdForApi("gpt-5.2-openai")).toBe("gpt-5.2");
    expect(resolveModelIdForApi("gpt-5")).toBe("gpt-5");
  });

  test("getToolsRequiringApproval returns non-auto tools", () => {
    const tools = getToolsRequiringApproval(DEFAULT_TOOL_APPROVAL_CONFIG);
    expect(tools.has("confirm_action")).toBe(true);
    expect(tools.has("delete_row")).toBe(true);
    expect(tools.has("delete_column")).toBe(true);
    expect(tools.has("clear_range")).toBe(true);
  });
});
