import { describe, expect, test } from "bun:test";
import { shouldUseAISDK } from "../../apps/electron/main/lib/ai/streaming";

describe("AI SDK streaming flag", () => {
  test("shouldUseAISDK respects MAIN_VITE_AI_SDK_STREAMING", () => {
    expect(shouldUseAISDK({ MAIN_VITE_AI_SDK_STREAMING: "true" })).toBe(true);
    expect(shouldUseAISDK({ MAIN_VITE_AI_SDK_STREAMING: "1" })).toBe(true);
    expect(shouldUseAISDK({ MAIN_VITE_AI_SDK_STREAMING: "false" })).toBe(false);
  });
});
