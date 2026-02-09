import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODELS,
  DEFAULT_TOOL_APPROVAL_CONFIG,
  getModelById,
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

  // Dynamic Ollama model resolution
  test("resolveModelForProvider creates dynamic Ollama model", () => {
    const model = resolveModelForProvider("ollama", "ollama:llama3.1");
    expect(model.id).toBe("ollama:llama3.1");
    expect(model.provider).toBe("ollama");
    expect(model.name).toBe("llama3.1");
    expect(model.modelIdForApi).toBe("llama3.1");
    expect(model.includedInSubscription).toBe(true);
  });

  test("resolveModelForProvider handles ollama with no modelId", () => {
    const model = resolveModelForProvider("ollama");
    expect(model.provider).toBe("ollama");
    expect(model.name).toBe("Ollama");
    expect(model.id).toBe("");
  });

  test("getModelById returns dynamic Ollama model definition", () => {
    const model = getModelById("ollama:my-custom-model");
    expect(model).toBeDefined();
    expect(model!.id).toBe("ollama:my-custom-model");
    expect(model!.provider).toBe("ollama");
    expect(model!.name).toBe("my-custom-model");
    expect(model!.modelIdForApi).toBe("my-custom-model");
  });

  test("resolveModelIdForApi strips ollama: prefix for dynamic models", () => {
    expect(resolveModelIdForApi("ollama:phi3")).toBe("phi3");
    expect(resolveModelIdForApi("ollama:deepseek-r1:7b")).toBe("deepseek-r1:7b");
  });
});
