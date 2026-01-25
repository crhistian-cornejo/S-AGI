import { describe, expect, test } from "bun:test";
import { createStore } from "jotai/vanilla";
import {
  currentModelAtom,
  selectedModelAtom,
} from "../../apps/electron/renderer/lib/atoms";
import { DEFAULT_MODELS } from "../../packages/core/src/types/ai";

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
};

describe("currentModelAtom", () => {
  test("resolves current model definition without throwing", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
    });

    const store = createStore();
    store.set(selectedModelAtom, DEFAULT_MODELS.openai);

    const model = store.get(currentModelAtom);
    expect(model?.id).toBe(DEFAULT_MODELS.openai);
  });
});
