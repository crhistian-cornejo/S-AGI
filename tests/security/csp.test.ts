import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

const CSP_FILES = [
  "apps/electron/main/index.ts",
  "apps/electron/renderer/index.html",
  "apps/electron/renderer/quick-prompt.html",
  "apps/electron/renderer/tray-popover.html",
];

describe("CSP configuration", () => {
  test("allows unsafe-eval only where WebAssembly is needed", () => {
    // Files that need unsafe-eval for WebAssembly (PDFium)
    const filesWithUnsafeEval = [
      "apps/electron/main/index.ts",
      "apps/electron/renderer/index.html",
    ];

    // Files that should NOT have unsafe-eval
    const filesWithoutUnsafeEval = [
      "apps/electron/renderer/quick-prompt.html",
      "apps/electron/renderer/tray-popover.html",
    ];

    for (const relativePath of filesWithUnsafeEval) {
      const filePath = resolve(ROOT, relativePath);
      const contents = readFileSync(filePath, "utf8");
      expect(contents).toContain("unsafe-eval");
    }

    for (const relativePath of filesWithoutUnsafeEval) {
      const filePath = resolve(ROOT, relativePath);
      const contents = readFileSync(filePath, "utf8");
      expect(contents).not.toContain("unsafe-eval");
    }
  });
});
