/**
 * Univer Docs core - dedicated instance for documents.
 *
 * With conditional rendering, each tab mount creates a fresh instance
 * and unmount disposes it completely. No need for complex document switching logic.
 */

import {
  Univer,
  LocaleType,
  LogLevel,
  merge,
  DocumentFlavor,
  ThemeService,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverDocsPlugin } from "@univerjs/docs";
import {
  createCustomTheme,
  createDarkTheme,
  isDarkModeActive,
  createThemeFromVSCodeColors,
  type VSCodeThemeColors,
} from "./univer-theme";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverUIPlugin } from "@univerjs/ui";

// Drawing plugins for image support
import { UniverDrawingPlugin } from "@univerjs/drawing";
import { UniverDrawingUIPlugin } from "@univerjs/drawing-ui";
import { UniverDocsDrawingPlugin } from "@univerjs/docs-drawing";
import { UniverDocsDrawingUIPlugin } from "@univerjs/docs-drawing-ui";

// Hyperlink plugins
import { UniverDocsHyperLinkUIPlugin } from "@univerjs/docs-hyper-link-ui";

// Import facade extensions
import "@univerjs/docs-ui/facade";

// Import styles (shared, but safe to import multiple times)
import "@univerjs/design/lib/index.css";
import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";
import "@univerjs/drawing-ui/lib/index.css";
import "@univerjs/docs-drawing-ui/lib/index.css";
import "@univerjs/docs-hyper-link-ui/lib/index.css";
// Custom theme overrides - must be imported AFTER Univer styles
import "./univer-theme-overrides.css";

// Import locales
import DesignEnUS from "@univerjs/design/locale/en-US";
import UIEnUS from "@univerjs/ui/locale/en-US";
import DocsUIEnUS from "@univerjs/docs-ui/locale/en-US";
import DocsDrawingUIEnUS from "@univerjs/docs-drawing-ui/locale/en-US";
import DocsHyperLinkUIEnUS from "@univerjs/docs-hyper-link-ui/locale/en-US";

export interface UniverDocsInstance {
  univer: Univer;
  api: FUniver;
  version: number;
}

let docsInstance: UniverDocsInstance | null = null;
let instanceVersion = 0;

/**
 * Initialize the Docs Univer instance
 */
export async function initDocsUniver(
  container: HTMLElement,
): Promise<UniverDocsInstance> {
  // Increment version - any pending dispose with old version will be cancelled
  instanceVersion++;
  const currentVersion = instanceVersion;

  // Dispose any existing instance synchronously
  if (docsInstance) {
    console.log(
      "[UniverDocs] Disposing existing instance before creating new one",
    );
    try {
      docsInstance.univer.dispose();
    } catch (e) {
      console.warn("[UniverDocs] Error disposing old instance:", e);
    }
    docsInstance = null;
  }

  // Clear container content
  container.innerHTML = "";

  console.log(
    "[UniverDocs] Creating new instance (version:",
    currentVersion,
    ")",
  );

  // Deep merge locales
  const mergedLocale = merge(
    {},
    DesignEnUS,
    UIEnUS,
    DocsUIEnUS,
    DocsDrawingUIEnUS,
    DocsHyperLinkUIEnUS,
  );

  // Create theme based on current CSS variables and dark mode
  const isDark = isDarkModeActive();
  const customTheme = isDark ? createDarkTheme() : createCustomTheme();

  const univer = new Univer({
    theme: customTheme,
    darkMode: isDark,
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergedLocale,
    },
    logLevel: LogLevel.WARN,
  });

  // Suppress non-critical DI warnings during plugin initialization
  // These warnings occur when Univer plugins register identifiers multiple times (harmless)
  const originalConsoleWarn = console.warn;
  const suppressDIWarnings = () => {
    console.warn = (...args: any[]) => {
      const message = args[0]?.toString() || "";
      // Suppress "Identifier X already exists. Returning the cached identifier decorator."
      if (
        message.includes("already exists") &&
        message.includes("Returning the cached identifier decorator")
      ) {
        // Silently ignore - these are harmless DI identifier cache warnings
        return;
      }
      originalConsoleWarn.apply(console, args);
    };
  };

  const restoreConsoleWarn = () => {
    console.warn = originalConsoleWarn;
  };

  // Suppress warnings during plugin registration
  suppressDIWarnings();

  // Register plugins in order - Critical for dependency injection
  // 1. Docs plugin (Must be first for correct initialization)
  univer.registerPlugin(UniverDocsPlugin);

  // 2. Render engine
  univer.registerPlugin(UniverRenderEnginePlugin);

  // 3. UI plugin with container (must be before Docs UI)
  univer.registerPlugin(UniverUIPlugin, {
    container,
  });

  // 4. Docs UI plugin
  univer.registerPlugin(UniverDocsUIPlugin, {
    layout: {
      docContainerConfig: {
        innerLeft: true,
      },
    },
  });

  // 5. Formula Engine (needed for some document features)
  univer.registerPlugin(UniverFormulaEnginePlugin);

  // Drawing plugins for image support
  univer.registerPlugin(UniverDrawingPlugin);
  univer.registerPlugin(UniverDrawingUIPlugin);
  univer.registerPlugin(UniverDocsDrawingPlugin);
  univer.registerPlugin(UniverDocsDrawingUIPlugin);

  // Hyperlink plugins
  univer.registerPlugin(UniverDocsHyperLinkUIPlugin);

  // Create API after all plugins are registered
  // The API creation will trigger plugin initialization
  let api: FUniver;
  try {
    api = FUniver.newAPI(univer);
  } catch (error) {
    console.error("[UniverDocs] Failed to create API:", error);
    // Try to dispose and rethrow
    try {
      univer.dispose();
    } catch (disposeError) {
      console.warn(
        "[UniverDocs] Error disposing after API creation failure:",
        disposeError,
      );
    }
    throw error;
  }

  // Dark mode is already set via darkMode option in constructor
  // But we also toggle via API for UI components
  if (isDark) {
    try {
      (api as any).toggleDarkMode(true);
    } catch (e) {
      // Ignore - API may not support this method
    }
  }

  // Restore console.warn after initialization
  restoreConsoleWarn();

  docsInstance = { univer, api, version: currentVersion };
  console.log(
    "[UniverDocs] Instance created successfully (version:",
    currentVersion,
    ")",
  );

  return docsInstance;
}

/**
 * Dispose the Docs instance.
 * Pass a version to only dispose if it matches (for deferred cleanup).
 */
export function disposeDocsUniver(version?: number): void {
  // If version provided, only dispose if it matches current instance
  if (version !== undefined && docsInstance?.version !== version) {
    console.log(
      "[UniverDocs] Skipping dispose - version mismatch (requested:",
      version,
      ", current:",
      docsInstance?.version,
      ")",
    );
    return;
  }

  if (docsInstance) {
    console.log(
      "[UniverDocs] Disposing instance (version:",
      docsInstance.version,
      ")",
    );
    try {
      docsInstance.univer.dispose();
    } catch (e) {
      console.warn("[UniverDocs] Error during dispose:", e);
    }
    docsInstance = null;
  }
}

/**
 * Get the current instance version (for deferred cleanup)
 */
export function getDocsInstanceVersion(): number {
  return docsInstance?.version ?? -1;
}

/**
 * Create a new document with optional data
 */
export function createDocument(api: FUniver, data?: any, id?: string): any {
  const docId = data?.id || id || `doc-${Date.now()}`;
  const extendedApi = api as any;

  console.log("[UniverDocs] createDocument:", {
    hasData: !!data,
    dataId: data?.id,
    docId,
    bodyLength: data?.body?.dataStream?.length,
  });

  let doc: any;

  if (data) {
    console.log("[UniverDocs] Creating doc with provided data");
    // Ensure the doc is created with Traditional document flavor for page borders
    // Generate unique IDs for headers and footers if not present
    const defaultHeaderId =
      data.documentStyle?.defaultHeaderId || `header-${docId}`;
    const defaultFooterId =
      data.documentStyle?.defaultFooterId || `footer-${docId}`;

    const docData = {
      ...data,
      // Ensure headers exist
      headers: data.headers || {
        [defaultHeaderId]: {
          body: {
            dataStream: "\r\n",
            textRuns: [],
            paragraphs: [{ startIndex: 0 }],
          },
        },
      },
      // Ensure footers exist
      footers: data.footers || {
        [defaultFooterId]: {
          body: {
            dataStream: "\r\n",
            textRuns: [],
            paragraphs: [{ startIndex: 0 }],
          },
        },
      },
      documentStyle: {
        ...(data.documentStyle || {}),
        documentFlavor: DocumentFlavor.TRADITIONAL,
        pageSize: data.documentStyle?.pageSize || {
          width: 595,
          height: 842,
        },
        marginTop: data.documentStyle?.marginTop ?? 72,
        marginBottom: data.documentStyle?.marginBottom ?? 72,
        marginLeft: data.documentStyle?.marginLeft ?? 72,
        marginRight: data.documentStyle?.marginRight ?? 72,
        marginHeader: data.documentStyle?.marginHeader ?? 30,
        marginFooter: data.documentStyle?.marginFooter ?? 30,
        defaultHeaderId,
        defaultFooterId,
        renderConfig: {
          ...(data.documentStyle?.renderConfig || {}),
          vertexAngle: 0,
          centerAngle: 0,
        },
      },
    };
    doc = extendedApi.createUniverDoc(docData);
  } else {
    console.log("[UniverDocs] Creating empty doc");
    // Generate unique IDs for headers and footers
    const defaultHeaderId = `header-${docId}`;
    const defaultFooterId = `footer-${docId}`;

    doc = extendedApi.createUniverDoc({
      id: docId,
      title: "Untitled Document",
      body: {
        dataStream: "\r\n",
        textRuns: [],
        paragraphs: [
          {
            startIndex: 0,
            paragraphStyle: {},
          },
        ],
        sectionBreaks: [
          {
            startIndex: 1,
          },
        ],
      },
      // Define headers structure
      headers: {
        [defaultHeaderId]: {
          body: {
            dataStream: "\r\n",
            textRuns: [],
            paragraphs: [{ startIndex: 0 }],
          },
        },
      },
      // Define footers structure
      footers: {
        [defaultFooterId]: {
          body: {
            dataStream: "\r\n",
            textRuns: [],
            paragraphs: [{ startIndex: 0 }],
          },
        },
      },
      documentStyle: {
        pageSize: {
          width: 595, // A4 width in points (210mm)
          height: 842, // A4 height in points (297mm)
        },
        documentFlavor: DocumentFlavor.TRADITIONAL,
        marginTop: 72, // ~1 inch (25.4mm)
        marginBottom: 72,
        marginLeft: 72,
        marginRight: 72,
        marginHeader: 30, // Header margin from top
        marginFooter: 30, // Footer margin from bottom
        defaultHeaderId, // Link to header
        defaultFooterId, // Link to footer
        renderConfig: {
          vertexAngle: 0,
          centerAngle: 0,
        },
      },
    });
  }

  console.log(
    "[UniverDocs] Document created with ID:",
    doc?.getId?.() || docId,
  );

  return doc;
}

/**
 * Get the current instance if exists
 */
export function getDocsInstance(): UniverDocsInstance | null {
  return docsInstance;
}

/**
 * Update theme for the Docs instance with full VSCode theme colors
 */
export function setDocsTheme(
  isDark: boolean,
  themeColors?: VSCodeThemeColors | null,
): void {
  if (docsInstance) {
    try {
      // Create theme from VSCode colors if available, otherwise use defaults
      const nextTheme = themeColors
        ? createThemeFromVSCodeColors(themeColors, isDark)
        : isDark
          ? createDarkTheme()
          : createCustomTheme();

      const themeService = docsInstance.univer
        .__getInjector()
        .get(ThemeService);
      themeService.setTheme(nextTheme);
      themeService.setDarkMode(isDark);
      (docsInstance.api as any).toggleDarkMode(isDark);

      console.log("[UniverDocs] Theme updated:", {
        isDark,
        hasVSCodeColors: !!themeColors,
        primary: nextTheme.primary?.[500],
        background: nextTheme.white,
        foreground: nextTheme.black,
      });
    } catch (e) {
      console.warn("[UniverDocs] Failed to update theme:", e);
    }
  }
}
